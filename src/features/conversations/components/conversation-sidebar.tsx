"use client";

import { toast } from "sonner";
import { useRef, useState } from "react";
import {
  CopyIcon,
  HistoryIcon,
  PaperclipIcon,
  PlusIcon,
  XIcon,
  FileTextIcon,
  FileSpreadsheetIcon,
  FileIcon,
  ImageIcon,
} from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  useConversation,
  useConversations,
  useCreateConversation,
  useMessages,
} from "../hooks/use-conversations";

import { Id } from "../../../../convex/_generated/dataModel";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { PastConversationsDialog } from "./past-conversations-dialog";

interface ConversationSidebarProps {
  projectId: Id<"projects">;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

const THINKING_START_MARKER = "<!--NEXUS_AI_THINKING_START-->";
const THINKING_END_MARKER = "<!--NEXUS_AI_THINKING_END-->";

const splitThinkingFromContent = (content: string) => {
  const startIndex = content.indexOf(THINKING_START_MARKER);
  const endIndex = content.indexOf(THINKING_END_MARKER);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return { thinking: null, response: content };
  }

  const thinking = content
    .slice(startIndex + THINKING_START_MARKER.length, endIndex)
    .trim();
  const response = `${content.slice(0, startIndex)}${content.slice(endIndex + THINKING_END_MARKER.length)}`.trim();

  return {
    thinking: thinking || null,
    response,
  };
};

const getFileIcon = (filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"].includes(ext)) {
    return <ImageIcon className="size-3.5 text-emerald-400" />;
  }
  if (["xlsx", "xls", "csv"].includes(ext)) {
    return <FileSpreadsheetIcon className="size-3.5 text-green-400" />;
  }
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) {
    return <FileTextIcon className="size-3.5 text-blue-400" />;
  }
  return <FileIcon className="size-3.5 text-muted-foreground" />;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ConversationSidebar = ({
  projectId,
}: ConversationSidebarProps) => {
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [strictSourceMode, setStrictSourceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [
    selectedConversationId,
    setSelectedConversationId,
  ] = useState<Id<"conversations"> | null>(null);
  const [
    pastConversationsOpen,
    setPastConversationsOpen
  ] = useState(false);

  const createConversation = useCreateConversation();
  const conversations = useConversations(projectId);

  const activeConversationId =
    selectedConversationId ?? conversations?.[0]?._id ?? null;

  const activeConversation = useConversation(activeConversationId);
  const conversationMessages = useMessages(activeConversationId);

  // Check if any message is currently processing
  const isProcessing = conversationMessages?.some(
    (msg) => msg.status === "processing"
  );

  const handleCancel = async () => {
    try {
      const response = await fetch("/api/messages/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!response.ok) throw new Error("Cancel failed");
    } catch {
      toast.error("Unable to cancel request");
    }
  };

  const handleCreateConversation = async () => {
    try {
      const newConversationId = await createConversation({
        projectId,
        title: DEFAULT_CONVERSATION_TITLE,
      });
      setSelectedConversationId(newConversationId);
      return newConversationId;
    } catch {
      toast.error("Unable to create new conversation");
      return null;
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate files
    const totalFiles = attachedFiles.length + files.length;
    if (totalFiles > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast.error(`File "${oversizedFiles[0].name}" exceeds 10MB limit`);
      return;
    }

    setAttachedFiles(prev => [...prev, ...files]);

    // Reset the input so the same file can be re-selected
    e.target.value = "";
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    // If processing and no new message, this is just a stop function
    if (isProcessing && !message.text) {
      await handleCancel()
      setInput("");
      return;
    }

    let conversationId = activeConversationId;

    if (!conversationId) {
      conversationId = await handleCreateConversation();
      if (!conversationId) {
        return;
      }
    }

    // Trigger Inngest function via API
    try {
      if (attachedFiles.length > 0) {
        // Send as FormData with files
        const formData = new FormData();
        formData.append("conversationId", conversationId);
        formData.append("message", message.text);
        formData.append("strictSource", String(strictSourceMode));
        for (const file of attachedFiles) {
          formData.append("files", file);
        }

        const response = await fetch("/api/messages", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Upload failed");
        }
      } else {
        // Send as JSON (original behavior)
        const response = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            message: message.text,
            strictSource: strictSourceMode,
          }),
        });

        if (!response.ok) {
          throw new Error("Message failed to send");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message failed to send");
    }

    setInput("");
    setAttachedFiles([]);
  }

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
        accept=".txt,.csv,.json,.md,.xml,.html,.js,.ts,.jsx,.tsx,.css,.py,.pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp,.svg,.yaml,.yml,.toml,.sql,.log"
      />
      <PastConversationsDialog
        projectId={projectId}
        open={pastConversationsOpen}
        onOpenChange={setPastConversationsOpen}
        onSelect={setSelectedConversationId}
      />
      <div data-tour="tour-chat-sidebar" className="flex flex-col h-full bg-sidebar">
        <div className="h-8.75 flex items-center justify-between border-b">
          <div className="text-sm truncate pl-3">
            {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
          </div>
          <div className="flex items-center px-1 gap-1">
            <Button
              size="icon-xs"
              variant="highlight"
              onClick={() => setPastConversationsOpen(true)}
            >
              <HistoryIcon className="size-3.5" />
            </Button>
            <Button
              size="icon-xs"
              variant="highlight"
              onClick={handleCreateConversation}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
        </div>
        <Conversation className="flex-1">
          <ConversationContent>
            {conversationMessages?.map((message, messageIndex) => (
              (() => {
                const parsedContent =
                  message.role === "assistant"
                    ? splitThinkingFromContent(message.content)
                    : { thinking: null, response: message.content };

                return (
                  <Message
                    key={message._id}
                    from={message.role}
                  >
                    <MessageContent>
                      {message.status === "processing" ? (
                        <Reasoning isStreaming defaultOpen>
                          <ReasoningTrigger />
                          <ReasoningContent>
                            Running tools and preparing a response.
                          </ReasoningContent>
                        </Reasoning>
                      ) : message.status === "cancelled" ? (
                        <span className="text-muted-foreground italic">
                          Request cancelled
                        </span>
                      ) : (
                        <>
                          {message.role === "assistant" && parsedContent.thinking && (
                            <Reasoning defaultOpen={false}>
                              <ReasoningTrigger />
                              <ReasoningContent>{parsedContent.thinking}</ReasoningContent>
                            </Reasoning>
                          )}
                          <MessageResponse>{parsedContent.response}</MessageResponse>
                        </>
                      )}
                    </MessageContent>
                    {message.role === "assistant" &&
                      message.status === "completed" &&
                      messageIndex === (conversationMessages?.length ?? 0) - 1 && (
                        <MessageActions>
                          <MessageAction
                            onClick={() => {
                              navigator.clipboard.writeText(message.content)
                            }}
                            label="Copy"
                          >
                            <CopyIcon className="size-3" />
                          </MessageAction>
                        </MessageActions>
                      )
                    }
                  </Message>
                );
              })()
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <div className="p-3" data-tour="tour-prompt-input">
          {/* Attached files display */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="group flex items-center gap-1.5 rounded-md border border-border/60 bg-accent/30 px-2 py-1 text-xs transition-colors hover:bg-accent/50"
                >
                  {getFileIcon(file.name)}
                  <span className="max-w-30 truncate text-foreground">
                    {file.name}
                  </span>
                  <span className="text-muted-foreground">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    className="ml-0.5 rounded-sm p-0.5 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 hover:text-destructive cursor-pointer"
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mb-2 flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
            <div className="min-w-0">
              <Label
                htmlFor="strict-source-mode"
                className="text-xs font-medium text-foreground"
              >
                Use uploaded files only
              </Label>
              <p className="text-[11px] text-muted-foreground">
                AI will answer only from your attachments.
              </p>
            </div>
            <Switch
              id="strict-source-mode"
              checked={strictSourceMode}
              onCheckedChange={setStrictSourceMode}
              disabled={isProcessing}
            />
          </div>

          <PromptInput
            onSubmit={handleSubmit}
            className="mt-2"
          >
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Ask Nexus AI anything..."
                onChange={(e) => setInput(e.target.value)}
                value={input}
                disabled={isProcessing}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={handleFileSelect}
                  disabled={isProcessing}
                  className="rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Attach files (PDF, Excel, images, docs, code...)"
                >
                  <PaperclipIcon className="size-4" />
                </Button>
              </PromptInputTools>
              <PromptInputSubmit
                disabled={isProcessing ? false : !input && attachedFiles.length === 0}
                status={isProcessing ? "streaming" : undefined}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </>
  );
};

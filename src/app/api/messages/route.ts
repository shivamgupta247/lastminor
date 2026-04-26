import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";
import { extractFileText, formatAttachmentsForAI } from "@/lib/extract-file-text";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

const STRICT_SOURCE_INSTRUCTION = `
--- STRICT SOURCE MODE ---
Use ONLY facts that appear in the uploaded file context.
Do not use outside knowledge, assumptions, or prior context that is not present in those files.
If required information is missing, explicitly say it is not available in the uploaded files.
For quiz requests, generate questions strictly from uploaded content only.
`;

const parseBooleanLike = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }

  return false;
};

const requestSchema = z.object({
  conversationId: z.string(),
  message: z.string(),
  strictSource: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal key not configured" },
      { status: 500 }
    );
  }

  let conversationId: string;
  let message: string;
  let uploadedFiles: File[] = [];
  let strictSource = false;

  // Determine content type and parse accordingly
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    // Handle FormData (with potential file attachments)
    const formData = await request.formData();
    conversationId = formData.get("conversationId") as string;
    message = formData.get("message") as string;
    strictSource = parseBooleanLike(formData.get("strictSource"));

    // Collect uploaded files
    const fileEntries = formData.getAll("files");
    for (const entry of fileEntries) {
      if (entry instanceof File && entry.size > 0) {
        if (entry.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: `File "${entry.name}" exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
            { status: 400 }
          );
        }
        uploadedFiles.push(entry);
      }
    }

    if (uploadedFiles.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} files allowed` },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!conversationId || !message) {
      return NextResponse.json(
        { error: "conversationId and message are required" },
        { status: 400 }
      );
    }
  } else {
    // Handle JSON (original behavior, backward compatible)
    const body = await request.json();
    const parsed = requestSchema.parse(body);
    conversationId = parsed.conversationId;
    message = parsed.message;
    strictSource = parsed.strictSource;
  }

  if (strictSource && uploadedFiles.length === 0) {
    return NextResponse.json(
      { error: "Strict source mode requires at least one uploaded file" },
      { status: 400 }
    );
  }

  // Extract text from uploaded files and append to message
  let augmentedMessage = message;

  if (uploadedFiles.length > 0) {
    const attachments: { filename: string; text: string }[] = [];

    for (const file of uploadedFiles) {
      try {
        const extracted = await extractFileText(file);
        attachments.push({ filename: file.name, text: extracted.text });
      } catch (error) {
        console.warn(`Failed to extract text from ${file.name}:`, error);
        attachments.push({
          filename: file.name,
          text: `[Failed to extract content from ${file.name}]`,
        });
      }
    }
    const attachmentContext = formatAttachmentsForAI(attachments);
    augmentedMessage = strictSource
      ? `${STRICT_SOURCE_INSTRUCTION}\n\nUser request:\n${message}${attachmentContext}`
      : message + attachmentContext;
  }

  // Call convex mutation, query
  const conversation = await convex.query(api.system.getConversationById, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const projectId = conversation.projectId;

  // Find all processing messages in this project
  const processingMessages = await convex.query(
    api.system.getProcessingMessages,
    {
      internalKey,
      projectId,
    }
  );

  if (processingMessages.length > 0) {
    // Cancel all processing messages
    await Promise.all(
      processingMessages.map(async (msg) => {
        await inngest.send({
          name: "message/cancel",
          data: {
            messageId: msg._id,
          },
        });

        await convex.mutation(api.system.updateMessageStatus, {
          internalKey,
          messageId: msg._id,
          status: "cancelled",
        });
      })
    );
  }

  // Create user message (store original message for display, but send augmented to AI)
  await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
    projectId,
    role: "user",
    content: uploadedFiles.length > 0
      ? `${message}\n\n📎 ${uploadedFiles.length} file(s) attached: ${uploadedFiles.map(f => f.name).join(", ")}${strictSource ? "\n🔒 Source mode: uploaded files only" : ""}`
      : message,
  });

  // Create assistant message placeholder with processing status
  const assistantMessageId = await convex.mutation(
    api.system.createMessage,
    {
      internalKey,
      conversationId: conversationId as Id<"conversations">,
      projectId,
      role: "assistant",
      content: "",
      status: "processing",
    }
  );

  // Trigger Inngest to process the message (with augmented content including file context)
  const event = await inngest.send({
    name: "message/sent",
    data: {
      messageId: assistantMessageId,
      conversationId,
      projectId,
      message: augmentedMessage,
    },
  });

  return NextResponse.json({
    success: true,
    eventId: event.ids[0],
    messageId: assistantMessageId,
  });
};

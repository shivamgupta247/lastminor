import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";

import { DEFAULT_CONVERSATION_TITLE } from "@/features/conversations/constants";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";

const requestSchema = z.object({
  prompt: z.string().min(1),
});

// Stop-words to filter out when generating a project name from the prompt
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "must",
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "it",
  "they", "them", "its", "his", "her", "this", "that", "these", "those",
  "and", "or", "but", "if", "so", "for", "of", "to", "in", "on", "at",
  "by", "with", "from", "as", "into", "about", "like", "just", "very",
  "make", "create", "build", "generate", "write", "add", "please",
  "want", "using", "use", "help", "something", "thing", "stuff",
]);

/**
 * Derive a short, kebab-case project name from the user's prompt.
 * Falls back to a random name if the prompt doesn't yield enough keywords.
 */
function deriveProjectName(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")   // strip non-alphanumeric
    .split(/\s+/)                     // split on whitespace
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  // Pick up to 3 meaningful keywords
  const keywords = words.slice(0, 3);

  if (keywords.length >= 1) {
    return keywords.join("-");
  }

  // Fallback: random name
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals, colors],
    separator: "-",
    length: 3,
  });
}

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

  const body = await request.json();
  const { prompt } = requestSchema.parse(body);

  // Derive a meaningful project name from the prompt
  const projectName = deriveProjectName(prompt);

  // Create project and conversation together
  const { projectId, conversationId } = await convex.mutation(
    api.system.createProjectWithConversation,
    {
      internalKey,
      projectName,
      conversationTitle: DEFAULT_CONVERSATION_TITLE,
      ownerId: userId,
    },
  );

  // Create user message
  await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId,
    projectId,
    role: "user",
    content: prompt,
  });

  // Create assistant message placeholder with processing status
  const assistantMessageId = await convex.mutation(
    api.system.createMessage,
    {
      internalKey,
      conversationId,
      projectId,
      role: "assistant",
      content: "",
      status: "processing",
    },
  );

  // Trigger Inngest to process the message
  await inngest.send({
    name: "message/sent",
    data: {
      messageId: assistantMessageId,
      conversationId,
      projectId,
      message: prompt,
    },
  });

  return NextResponse.json({ projectId });
};

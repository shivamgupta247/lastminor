import { z } from "zod";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";

import { firecrawl } from "@/lib/firecrawl";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const hasStatusCode = (error: unknown, statusCode: number) => {
  return getErrorMessage(error).includes(`status code: ${statusCode}`);
};

const isRateLimitError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();

  return (
    hasStatusCode(error, 429) ||
    message.includes("resource_exhausted") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("rate-limiting")
  );
};



const quickEditSchema = z.object({
  editedCode: z
    .string()
    .describe(
      "The edited version of the selected code based on the instruction"
    ),
});

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

const QUICK_EDIT_PROMPT = `You are a code editing assistant. Edit the selected code based on the user's instruction.

<context>
<selected_code>
{selectedCode}
</selected_code>
<full_code_context>
{fullCode}
</full_code_context>
</context>

{documentation}

<instruction>
{instruction}
</instruction>

<instructions>
Return ONLY the edited version of the selected code.
Maintain the same indentation level as the original.
Do not include any explanations or comments unless requested.
If the instruction is unclear or cannot be applied, return the original code unchanged.
</instructions>`;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const { selectedCode, fullCode, instruction } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 400 }
      );
    }

    if (!selectedCode) {
      return NextResponse.json(
        { error: "Selected code is required" },
        { status: 400 }
      );
    }

    if (!instruction) {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 }
      );
    }

    const urls: string[] = instruction.match(URL_REGEX) || [];
    let documentationContext = "";

    if (urls.length > 0) {
      const scrapedResults = await Promise.all(
        urls.map(async (url) => {
          try {
            const result = firecrawl
              ? await firecrawl.scrape(url, {
                formats: ["markdown"],
              })
              : { markdown: null };

            if (result.markdown) {
              return `<doc url="${url}">\n${result.markdown}\n</doc>`;
            }

            return null;
          } catch {
            return null;
          }
        })
      );

      const validResults = scrapedResults.filter(Boolean);

      if (validResults.length > 0) {
        documentationContext = `<documentation>\n${validResults.join("\n\n")}\n</documentation>`;
      }
    }

    const prompt = QUICK_EDIT_PROMPT
      .replace("{selectedCode}", selectedCode)
      .replace("{fullCode}", fullCode || "")
      .replace("{instruction}", instruction)
      .replace("{documentation}", documentationContext);

    const modelCandidates: Array<{
      provider: "openrouter" | "gemini" | "groq";
      model: Parameters<typeof generateText>[0]["model"];
    }> = [];

    if (process.env.OPENROUTER_API_KEY) {
      modelCandidates.push({
        provider: "openrouter",
        model: createOpenAI({
          apiKey: process.env.OPENROUTER_API_KEY,
          baseURL: "https://openrouter.ai/api/v1",
        })("google/gemini-2.0-flash-001"),
      });
    }

    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      modelCandidates.push({
        provider: "gemini",
        model: createGoogleGenerativeAI({
          apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        })("gemini-2.0-flash"),
      });
    }

    if (process.env.GROQ_API_KEY) {
      modelCandidates.push({
        provider: "groq",
        model: createOpenAI({
          apiKey: process.env.GROQ_API_KEY,
          baseURL: "https://api.groq.com/openai/v1",
        })("llama-3.1-8b-instant"),
      });
    }

    if (modelCandidates.length === 0) {
      return NextResponse.json(
        { error: "No AI provider configured" },
        { status: 500 },
      );
    }

    let lastError: unknown;

    for (const candidate of modelCandidates) {
      try {
        const { output } = await generateText({
          model: candidate.model,
          output: Output.object({ schema: quickEditSchema }),
          prompt,
        });

        return NextResponse.json({ editedCode: output.editedCode });
      } catch (error) {
        lastError = error;
        const hasFallback = modelCandidates.at(-1)?.provider !== candidate.provider;

        if (hasFallback) {
          console.warn(
            `Quick edit provider ${candidate.provider} failed, falling back to next provider`,
            error,
          );
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  } catch (error) {
    console.error("Edit error:", error);

    if (isRateLimitError(error)) {
      return NextResponse.json(
        { error: "AI provider is rate-limiting requests. Please retry shortly." },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: "Failed to generate edit" },
      { status: 500 }
    );
  }
};

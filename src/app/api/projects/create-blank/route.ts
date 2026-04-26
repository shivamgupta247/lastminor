import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { DEFAULT_CONVERSATION_TITLE } from "@/features/conversations/constants";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";

const requestSchema = z.object({
  projectName: z.string().min(1).max(100),
});

// Boilerplate HTML/CSS/JS templates
const getBoilerplateHtml = (name: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    <h1>${name}</h1>
    <p>Start building your project here.</p>
  </div>
  <script type="module" src="/script.js"></script>
</body>
</html>`;

const BOILERPLATE_CSS = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f0f0f;
  color: #fff;
}

.container {
  text-align: center;
  padding: 2rem;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

p {
  color: #888;
  font-size: 1.1rem;
}`;

const BOILERPLATE_JS = `// Your JavaScript code here
document.addEventListener('DOMContentLoaded', () => {
  console.log('Project ready!');
});`;

const getBoilerplatePackageJson = (name: string) => JSON.stringify({
  name: name.toLowerCase().replace(/\s+/g, "-"),
  private: true,
  version: "0.0.0",
  type: "module",
  scripts: {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  devDependencies: {
    "vite": "^5.0.0"
  }
}, null, 2);

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
  const { projectName } = requestSchema.parse(body);

  // Create project with a conversation (no AI message)
  const { projectId } = await convex.mutation(
    api.system.createProjectWithConversation,
    {
      internalKey,
      projectName: projectName.trim(),
      conversationTitle: DEFAULT_CONVERSATION_TITLE,
      ownerId: userId,
    },
  );

  // Create boilerplate files directly
  const trimmed = projectName.trim();
  await convex.mutation(api.system.createFiles, {
    internalKey,
    projectId,
    files: [
      { name: "index.html", content: getBoilerplateHtml(trimmed) },
      { name: "style.css", content: BOILERPLATE_CSS },
      { name: "script.js", content: BOILERPLATE_JS },
      { name: "package.json", content: getBoilerplatePackageJson(trimmed) },
    ],
  });

  return NextResponse.json({ projectId });
}

/**
 * Server-side utility to extract text content from uploaded files.
 * Supports: .txt, .csv, .json, .md, .xml, .html, .xlsx, .xls, .pdf, .docx
 * Images are returned with a descriptive placeholder.
 */

import * as XLSX from "xlsx";

const TEXT_EXTENSIONS = new Set([
  ".txt", ".csv", ".json", ".md", ".xml", ".html", ".htm",
  ".js", ".ts", ".jsx", ".tsx", ".css", ".scss", ".less",
  ".py", ".rb", ".java", ".c", ".cpp", ".h", ".go", ".rs",
  ".yaml", ".yml", ".toml", ".ini", ".env", ".sql", ".sh",
  ".bat", ".ps1", ".log", ".svg",
]);

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico", ".svg",
]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "";
  return filename.slice(dot).toLowerCase();
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid bundling issues
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extractTextFromExcel(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    sheets.push(`=== Sheet: ${sheetName} ===\n${csv}`);
  }

  return sheets.join("\n\n");
}

export async function extractFileText(
  file: File
): Promise<{ text: string; type: "text" | "image" | "binary" }> {
  const ext = getExtension(file.name);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Plain text files — read as UTF-8
  if (TEXT_EXTENSIONS.has(ext)) {
    return { text: buffer.toString("utf-8"), type: "text" };
  }

  // Excel files
  if (ext === ".xlsx" || ext === ".xls") {
    const text = extractTextFromExcel(buffer);
    return { text, type: "text" };
  }

  // PDF files
  if (ext === ".pdf") {
    const text = await extractTextFromPDF(buffer);
    return { text, type: "text" };
  }

  // Word documents
  if (ext === ".docx") {
    const text = await extractTextFromDocx(buffer);
    return { text, type: "text" };
  }

  // Images — provide filename note (vision support is limited in current pipeline)
  if (IMAGE_EXTENSIONS.has(ext)) {
    return {
      text: `[Image file attached: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`,
      type: "image",
    };
  }

  // Unknown file type — try to read as text
  try {
    const text = buffer.toString("utf-8");
    // Check if it looks like valid text (no excessive null bytes)
    const nullCount = text.split("\0").length - 1;
    if (nullCount < text.length * 0.1) {
      return { text, type: "text" };
    }
  } catch {
    // Not readable as text
  }

  return {
    text: `[Binary file attached: ${file.name} (${(file.size / 1024).toFixed(1)} KB) — content could not be extracted]`,
    type: "binary",
  };
}

/**
 * Format extracted file content for inclusion in AI message context.
 */
export function formatAttachmentsForAI(
  attachments: { filename: string; text: string }[]
): string {
  if (attachments.length === 0) return "";

  const sections = attachments.map(
    (att) =>
      `\n\n📎 **Attached File: ${att.filename}**\n\`\`\`\n${att.text}\n\`\`\``
  );

  return `\n\n--- Uploaded File Context ---${sections.join("")}`;
}

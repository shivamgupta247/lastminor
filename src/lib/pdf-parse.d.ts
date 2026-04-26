declare module "pdf-parse" {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
    text: string;
  }

  function pdfParse(
    dataBuffer: Buffer | ArrayBuffer,
    options?: Record<string, unknown>
  ): Promise<PDFData>;

  export default pdfParse;
}

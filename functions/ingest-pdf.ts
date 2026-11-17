import pdfParse from "npm:pdf-parse@1.1.1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { createClient } from "npm:@insforge/sdk";

const corsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": ["https://asistente-documental-guayas.pages.dev", "http://localhost:5174"].includes(req.headers.get("Origin") ?? "") ? req.headers.get("Origin")! : "https://asistente-documental-guayas.pages.dev",
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8",
});

function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req ?? new Request("https://localhost")) });
}

async function invokeIngestWithRetry(client: ReturnType<typeof createClient>, body: { text: string; source: string }) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await client.functions.invoke("ingest", { body });
      if (!result.error) return result;
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
  }
  throw lastError instanceof Error ? lastError : new Error("Ingestion failed after retries");
}

async function ocrPdfPart(bytes: Uint8Array, fileName: string): Promise<string> {
  const form = new FormData();
  form.append("file", new File([bytes], fileName, { type: "application/pdf" }), fileName);
  form.append("apikey", Deno.env.get("OCR_SPACE_API_KEY") || "helloworld");
  form.append("language", "spa");
  form.append("filetype", "PDF");
  form.append("isOverlayRequired", "false");
  // Engine 1 is slower but works reliably with scanned PDFs in the free tier.
  form.append("OCREngine", "1");
  const response = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: form });
  const result = await response.json();
  // OCR.space can return useful pages together with a warning (for example,
  // the free tier's three-page limit). Keep the extracted pages instead of
  // discarding the whole document.
  if (!response.ok || (result?.IsErroredOnProcessing && !result?.ParsedResults?.length)) {
    const message = Array.isArray(result?.ErrorMessage)
      ? result.ErrorMessage.join(" ")
      : String(result?.ErrorMessage || result?.error || "OCR no pudo procesar el PDF");
    throw new Error(message);
  }
  return (result?.ParsedResults ?? [])
    .map((page: { ParsedText?: string }) => page.ParsedText || "")
    .join("\n\n")
    .replace(/\u0000/g, " ")
    .trim();
}

async function extractWithFreeOcr(bytes: Uint8Array, fileName: string): Promise<string> {
  // OCR.space's free tier accepts up to three PDF pages per request. Splitting
  // in the cloud lets larger scanned PDFs be indexed page group by page group.
  const pdf = await PDFDocument.load(bytes);
  const parts: Array<{ start: number; bytes: Uint8Array }> = [];
  // Smaller parts keep every OCR request comfortably below the edge
  // function's request window, even for slow scanned pages.
  for (let start = 0; start < pdf.getPageCount(); start += 2) {
    const part = await PDFDocument.create();
    const pages = await part.copyPages(pdf, Array.from({ length: Math.min(3, pdf.getPageCount() - start) }, (_, index) => start + index));
    pages.forEach((page) => part.addPage(page));
    parts.push({ start, bytes: await part.save() });
  }
  const textParts: string[] = [];
  // Six small OCR requests are faster and more reliable than fewer large
  // requests, while staying within the free service's practical limits.
  for (let batchStart = 0; batchStart < parts.length; batchStart += 6) {
    const batch = parts.slice(batchStart, batchStart + 6);
    const results = await Promise.all(batch.map(({ start, bytes: partBytes }) =>
      ocrPdfPart(partBytes, `${fileName}.part-${start + 1}.pdf`)
    ));
    textParts.push(...results.filter(Boolean));
  }
  return textParts.join("\n\n").trim();
}

function splitText(text: string, maxWords = 8_000, overlapWords = 120): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const batches: string[] = [];
  for (let start = 0; start < words.length; start += maxWords - overlapWords) {
    batches.push(words.slice(start, start + maxWords).join(" "));
    if (start + maxWords >= words.length) break;
  }
  return batches;
}

export default async function ingestPdf(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse({ error: "Authentication required" }, 401);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  if (!baseUrl) return jsonResponse({ error: "INSFORGE_BASE_URL is not configured" }, 503);
  const client = createClient({ baseUrl, accessToken: token });
  const { data: authData, error: authError } = await client.auth.getCurrentUser();
  if (authError || !authData?.user?.id) return jsonResponse({ error: "Authentication required" }, 401);
  const { data: adminRecord, error: adminError } = await client.database
    .from("app_admins")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .limit(1);
  if (adminError) return jsonResponse({ error: "Could not verify administrator access" }, 500);
  if (!adminRecord?.length) return jsonResponse({ error: "Administrator access required" }, 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ error: "Request must be multipart/form-data with a PDF field" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonResponse({ error: "PDF file is required in the 'file' field" }, 400);
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return jsonResponse({ error: "The uploaded file must be a PDF" }, 415);
  }
  if (file.size === 0) return jsonResponse({ error: "The PDF is empty" }, 400);
  if (file.size > 25 * 1024 * 1024) return jsonResponse({ error: "PDF exceeds the 25 MB limit" }, 413);

  try {
    const pdfBytes = new Uint8Array(await file.arrayBuffer());
    let parsed: { text?: string; numpages?: number } = {};
    try {
      parsed = await pdfParse(pdfBytes);
    } catch {
      // Algunos escaneos tienen una estructura que pdf-parse no reconoce;
      // OCR.space todavía puede extraer su contenido visual.
    }
    let text = typeof parsed.text === "string" ? parsed.text.replace(/\u0000/g, " ").trim() : "";
    let extractionMethod = "text";
    if (!text) {
      text = await extractWithFreeOcr(pdfBytes, file.name);
      extractionMethod = "ocr.space-free";
    }
    if (!text) return jsonResponse({ error: "El PDF no contiene texto legible, ni siquiera mediante OCR" }, 422);

    const batches = splitText(text);
    const source = file.name.slice(0, 500);
    const results: Array<{ documentId: string; chunksInserted: number }> = [];
    for (let start = 0; start < batches.length; start += 2) {
      const pair = await Promise.all(batches.slice(start, start + 2).map(async (batch) => {
        const { data, error } = await invokeIngestWithRetry(client, { text: batch, source });
        if (error) throw error;
        return data as { documentId: string; chunksInserted: number };
      }));
      results.push(...pair);
    }

    return jsonResponse({
      source,
      pages: Number(parsed.numpages) || null,
      textCharacters: text.length,
      batchesIngested: results.length,
      chunksInserted: results.reduce((sum, result) => sum + result.chunksInserted, 0),
      documentIds: results.map((result) => result.documentId),
      embeddingModel: "@cf/baai/bge-m3",
      extractionMethod,
    }, 201);
  } catch (error) {
    console.error("PDF ingestion failed:", error);
    const detail = error instanceof Error ? error.message : "Unexpected server error";
    console.error("PDF ingestion detail:", detail);
    return jsonResponse({ error: "PDF ingestion failed" }, 502);
  }
}

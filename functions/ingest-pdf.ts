import pdfParse from "npm:pdf-parse@1.1.1";
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
    const parsed = await pdfParse(new Uint8Array(await file.arrayBuffer()));
    const text = typeof parsed.text === "string" ? parsed.text.replace(/\u0000/g, " ").trim() : "";
    if (!text) return jsonResponse({ error: "No selectable text was found in the PDF" }, 422);

    const batches = splitText(text);
    const source = file.name.slice(0, 500);
    const results: Array<{ documentId: string; chunksInserted: number }> = [];
    for (let start = 0; start < batches.length; start += 2) {
      const pair = await Promise.all(batches.slice(start, start + 2).map(async (batch) => {
        const { data, error } = await client.functions.invoke("ingest", {
          body: { text: batch, source },
        });
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
    }, 201);
  } catch (error) {
    console.error("PDF ingestion failed:", error);
    const detail = error instanceof Error ? error.message : "Unexpected server error";
    console.error("PDF ingestion detail:", detail);
    return jsonResponse({ error: "PDF ingestion failed" }, 502);
  }
}

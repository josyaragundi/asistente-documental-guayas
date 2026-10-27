import { createClient } from "npm:@insforge/sdk";

const corsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": ["https://asistente-documental-guayas.pages.dev", "http://localhost:5174"].includes(req.headers.get("Origin") ?? "") ? req.headers.get("Origin")! : "https://asistente-documental-guayas.pages.dev",
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8",
});
const embeddingModel = "@cf/baai/bge-m3";

function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req ?? new Request("https://localhost")) });
}

function chunkText(text: string, chunkWords = 380, overlapWords = 50): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += chunkWords - overlapWords) {
    chunks.push(words.slice(start, start + chunkWords).join(" "));
    if (start + chunkWords >= words.length) break;
  }
  return chunks;
}

export default async function ingest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse({ error: "Authentication required" }, 401);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const aiUrl = Deno.env.get("RAG_AI_URL");
  const aiToken = Deno.env.get("RAG_AI_TOKEN");
  if (!baseUrl) return jsonResponse({ error: "INSFORGE_BASE_URL is not configured" }, 503);
  if (!aiUrl || !aiToken) return jsonResponse({ error: "Remote inference is not configured" }, 503);

  const client = createClient({ baseUrl, accessToken: token });
  const { data: authData, error: authError } = await client.auth.getCurrentUser();
  const userId = authData?.user?.id;
  if (authError || !userId) return jsonResponse({ error: "Authentication required" }, 401);

  const { data: adminRecord, error: adminError } = await client.database
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .limit(1);
  if (adminError) return jsonResponse({ error: "Could not verify administrator access" }, 500);
  if (!adminRecord?.length) return jsonResponse({ error: "Administrator access required" }, 403);

  let body: { text?: unknown; source?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400);
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const source = typeof body.source === "string" ? body.source.trim() : "";
  if (!text) return jsonResponse({ error: "text is required" }, 400);
  if (text.length > 80_000) return jsonResponse({ error: "text exceeds the 80,000 character limit" }, 413);
  if (!source || source.length > 500) return jsonResponse({ error: "source is required and must be at most 500 characters" }, 400);

  const chunks = chunkText(text);
  if (chunks.length === 0) return jsonResponse({ error: "No text chunks were produced" }, 400);
  try {
    const embeddings: number[][] = [];
    for (let start = 0; start < chunks.length; start += 64) {
      const response = await fetch(aiUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${aiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ task: "embed", input: chunks.slice(start, start + 64) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? `Remote embedding failed (${response.status})`);
      if (!Array.isArray(result.embeddings) || result.embeddings.some((vector: unknown) => !Array.isArray(vector) || vector.length !== 1024)) {
        throw new Error("Embedding response did not contain 1024-dimensional vectors");
      }
      embeddings.push(...result.embeddings);
    }

    const documentId = crypto.randomUUID();
    const rows = chunks.map((content, index) => ({
      owner_id: userId,
      document_id: documentId,
      content,
      source,
      chunk_index: index,
      embedding_model: embeddingModel,
      embedding: embeddings[index],
    }));
    const { data, error } = await client.database
      .from("documents")
      .insert(rows)
      .select("id, source, chunk_index");
    if (error) throw error;

    return jsonResponse({
      documentId,
      source,
      chunksInserted: data?.length ?? rows.length,
      embeddingModel,
    }, 201);
  } catch (error) {
    console.error("RAG ingest failed:", error);
    const detail = error instanceof Error ? error.message : "Unexpected server error";
    console.error("RAG ingest detail:", detail);
    return jsonResponse({ error: "Ingestion failed" }, 502);
  }
}

import { createClient } from "npm:@insforge/sdk";

const corsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": ["https://asistente-documental-guayas.pages.dev", "http://localhost:5174"].includes(req.headers.get("Origin") ?? "") ? req.headers.get("Origin")! : "https://asistente-documental-guayas.pages.dev",
  "Vary": "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Content-Type": "application/json; charset=utf-8",
});
const json = (body: unknown, status = 200, req?: Request) => new Response(JSON.stringify(body), { status, headers: corsHeaders(req ?? new Request("https://localhost")) });

export default async function ingestPdf(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Authentication required" }, 401, req);
  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const aiUrl = Deno.env.get("RAG_AI_URL");
  const aiToken = Deno.env.get("RAG_AI_TOKEN");
  if (!baseUrl || !aiUrl || !aiToken) return json({ error: "Ingestion is not configured" }, 503, req);
  const client = createClient({ baseUrl, accessToken: token });
  const { data: auth } = await client.auth.getCurrentUser();
  const userId = auth?.user?.id;
  if (!userId) return json({ error: "Authentication required" }, 401, req);
  const { data: admin } = await client.database.from("app_admins").select("user_id").eq("user_id", userId).limit(1);
  if (!admin?.length) return json({ error: "Administrator access required" }, 403, req);
  let body: { document_id?: unknown; source?: unknown; text?: unknown; page_start?: unknown; page_end?: unknown; chunk_index_offset?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON" }, 400, req); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const documentId = typeof body.document_id === "string" ? body.document_id : crypto.randomUUID();
  const pageStart = Number.isInteger(body.page_start) ? Number(body.page_start) : null;
  const pageEnd = Number.isInteger(body.page_end) ? Number(body.page_end) : pageStart;
  const offset = Number.isInteger(body.chunk_index_offset) ? Number(body.chunk_index_offset) : 0;
  if (!text || !source || text.length > 80_000) return json({ error: "source and text are required (text max 80,000 chars)" }, 400, req);
  const { data: existingRows, error: existingError } = await client.database
    .from("documents")
    .select("id")
    .eq("document_id", documentId)
    .eq("source", source)
    .eq("page_start", pageStart)
    .eq("page_end", pageEnd)
    .limit(1);
  if (existingError) return json({ error: existingError.message }, 502, req);
  if (existingRows?.length) return json({ documentId, source, chunksInserted: 0, alreadyIndexed: true, pageStart, pageEnd, embeddingModel: "@cf/baai/bge-m3" }, 200, req);
  const words = text.split(/\s+/u).filter(Boolean);
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += 490) { chunks.push(words.slice(start, start + 560).join(" ")); if (start + 560 >= words.length) break; }
  try {
    const embeddings: number[][] = [];
    for (let start = 0; start < chunks.length; start += 5) {
      const batch = chunks.slice(start, start + 5);
      let batchEmbeddings: number[][] | null = null;
      let lastEmbeddingError = "Embedding failed";
      for (let attempt = 0; attempt < 3 && !batchEmbeddings; attempt += 1) {
        try {
          const response = await fetch(aiUrl, { method: "POST", headers: { Authorization: `Bearer ${aiToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ task: "embed", input: batch, model: "@cf/baai/bge-m3" }) });
          const result = await response.json();
          if (!response.ok || !Array.isArray(result.embeddings) || result.embeddings.length !== batch.length) throw new Error(result?.error || `Embedding failed (${response.status})`);
          batchEmbeddings = result.embeddings;
        } catch (error) {
          lastEmbeddingError = error instanceof Error ? error.message : "Embedding failed";
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        }
      }
      if (!batchEmbeddings) {
        // Algunos lotes fallan en el proveedor por carga/transitorio. Reintenta
        // cada fragmento individual para no perder toda la página.
        batchEmbeddings = [];
        for (const chunk of batch) {
          let single: number[] | null = null;
          for (let attempt = 0; attempt < 3 && !single; attempt += 1) {
            try {
              const response = await fetch(aiUrl, { method: "POST", headers: { Authorization: `Bearer ${aiToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ task: "embed", input: [chunk], model: "@cf/baai/bge-m3" }) });
              const result = await response.json();
              if (!response.ok || !Array.isArray(result.embeddings?.[0])) throw new Error(result?.error || `Embedding failed (${response.status})`);
              single = result.embeddings[0];
            } catch (error) {
              lastEmbeddingError = error instanceof Error ? error.message : lastEmbeddingError;
              if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
            }
          }
          if (!single) throw new Error(lastEmbeddingError);
          batchEmbeddings.push(single);
        }
      }
      embeddings.push(...batchEmbeddings);
    }
    // Cada página puede producir más de un chunk. Usar solo el índice de
    // página provocaba colisiones en la siguiente página (por ejemplo, la
    // página 49 podía crear los índices 48 y 49, y la 50 intentaba reutilizar
    // el 49). Reservamos un rango amplio por página para mantener la clave
    // única de cada documento durante reintentos y cargas largas.
    const pageChunkBase = pageStart !== null ? pageStart * 1000 : offset * 1000;
    const rows = chunks.map((content, index) => ({ owner_id: userId, document_id: documentId, content, source, chunk_index: pageChunkBase + index, embedding_model: "@cf/baai/bge-m3", embedding: embeddings[index], page_start: pageStart, page_end: pageEnd }));
    const { data, error } = await client.database.from("documents").insert(rows).select("id");
    if (error) throw error;
    return json({ documentId, source, chunksInserted: data?.length ?? rows.length, pageStart, pageEnd, embeddingModel: "@cf/baai/bge-m3" }, 201, req);
  } catch (error) { console.error("RAG ingest failed", error); return json({ error: error instanceof Error ? error.message : "Ingestion failed" }, 502, req); }
}

import { createClient } from "npm:@insforge/sdk";

const cors = (req: Request) => ({ "Access-Control-Allow-Origin": ["https://asistente-documental-guayas.pages.dev", "http://localhost:5174"].includes(req.headers.get("Origin") ?? "") ? req.headers.get("Origin")! : "https://asistente-documental-guayas.pages.dev", "Vary": "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Content-Type": "application/json; charset=utf-8" });
const response = (body: unknown, status = 200, req?: Request) => new Response(JSON.stringify(body), { status, headers: cors(req ?? new Request("https://localhost")) });

export default async function ocrPage(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  if (req.method !== "POST" || !token || !baseUrl) return response({ error: "Authentication and POST are required" }, 401, req);
  const client = createClient({ baseUrl, accessToken: token });
  const { data: auth } = await client.auth.getCurrentUser();
  if (!auth?.user?.id) return response({ error: "Authentication required" }, 401, req);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 1_000_000) return response({ error: "page.jpg must be a JPEG smaller than 1 MB" }, 413, req);
  const upstream = new FormData();
  upstream.append("file", file, file.name || "page.jpg");
  upstream.append("apikey", Deno.env.get("OCR_SPACE_API_KEY") || "helloworld");
  upstream.append("language", "auto");
  upstream.append("OCREngine", "2");
  upstream.append("isOverlayRequired", "false");
  upstream.append("isCreateSearchablePdf", "false");
  const resultResponse = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: upstream });
  const result = await resultResponse.json();
  if (!resultResponse.ok || result?.IsErroredOnProcessing) return response({ error: "OCR failed" }, 502, req);
  const text = (result?.ParsedResults ?? []).map((item: { ParsedText?: string }) => item.ParsedText || "").join("\n").replace(/\u0000/g, " ").trim();
  return response({ text }, 200, req);
}

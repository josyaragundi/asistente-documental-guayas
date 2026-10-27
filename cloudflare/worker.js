const EMBED = "@cf/baai/bge-m3";
const CHAT = "@cf/meta/llama-3.1-8b-instruct-fp8";
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8" },
});

export default { async fetch(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.AI_SERVICE_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.AI_SERVICE_TOKEN}`) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  try {
    if (body.task === "embed") {
      const input = Array.isArray(body.input) ? body.input : [body.input];
      if (!input.length || input.length > 64 || input.some((v) => typeof v !== "string" || !v.trim())) return json({ error: "input must contain 1–64 non-empty strings" }, 400);
      const embeddings = (await env.AI.run(EMBED, { text: input }))?.data;
      if (!Array.isArray(embeddings) || embeddings.length !== input.length || embeddings.some((v) => !Array.isArray(v) || v.length !== 1024)) return json({ error: "Invalid embedding shape" }, 502);
      return json({ model: EMBED, embeddings });
    }
    if (body.task === "chat") {
      if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: "messages must be a non-empty array" }, 400);
      const result = await env.AI.run(CHAT, { messages: body.messages, max_tokens: 1200, temperature: 0 });
      if (typeof result?.response !== "string" || !result.response.trim()) return json({ error: "Empty model response" }, 502);
      return json({ model: CHAT, answer: result.response.trim() });
    }
    return json({ error: "task must be embed or chat" }, 400);
  } catch (error) {
    console.error("Workers AI request failed", error);
    return json({ error: "Remote inference failed" }, 502);
  }
} };

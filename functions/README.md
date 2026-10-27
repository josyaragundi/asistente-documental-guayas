# InsForge RAG functions

Both functions require a signed-in InsForge user. They use that user's access
token for database access, so document rows stay isolated by the table's RLS
policies.

## Routes

- `POST https://<project>.insforge.app/functions/ingest` with `{ "text": "...", "source": "..." }`
- `POST https://<project>.insforge.app/functions/ingest-pdf` with multipart field `file=<PDF>`
- `POST https://<project>.insforge.app/functions/ask` with `{ "question": "..." }`

Pass `Authorization: Bearer <user-access-token>` and `Content-Type: application/json`.
The ask response contains `answer`, source labels with similarity scores, the
retrieved chunk count, and the chat model. Ingestion returns the document ID,
source, chunk count, and embedding model.

Example requests using the deployed function host:

```bash
export INSFORGE_ACCESS_TOKEN="<signed-in-user-access-token>"
export RAG_FUNCTIONS_URL="https://79jaf63m.function2.insforge.app"

curl -X POST "$RAG_FUNCTIONS_URL/ingest" \
  -H "Authorization: Bearer $INSFORGE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"demo/manglares.txt","text":"Los manglares crecen en estuarios. Sus raíces retienen sedimentos y reducen la erosión costera."}'

curl -X POST "$RAG_FUNCTIONS_URL/ask" \
  -H "Authorization: Bearer $INSFORGE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Qué hacen las raíces de los manglares?"}'
```

## Cloud inference

Inference runs in a Cloudflare Worker at
`https://chat-rag-ai.delgadoronald9.workers.dev`; no local model or GPU is used.
The Worker uses `@cf/baai/bge-m3` for multilingual 1,024-dimensional vectors and
`@cf/meta/llama-3.1-8b-instruct-fp8` for answers. Its service token is stored as
a Worker secret and as the InsForge secret `RAG_AI_TOKEN`; neither is exposed to
the browser.

The InsForge edge-function runtime needs these server-side secrets:

- `INSFORGE_BASE_URL`
- `RAG_AI_URL`
- `RAG_AI_TOKEN`

The `documents.embedding` column and `match_documents` RPC use `vector(1024)` to
match BGE-M3. Workers AI includes 10,000 Neurons per day on the Free plan; calls
fail after that allowance is exhausted, without requiring an upgrade.

## Local end-to-end check

Set `INSFORGE_ACCESS_TOKEN` to a signed-in user's access token and run:

```powershell
./examples/test-rag.ps1
```

The script ingests the three-paragraph sample, asks one question answered by the
sample, then asks an unrelated question and expects the exact abstention
sentence.

PDF text extraction, embeddings, vector storage, retrieval, and answer
generation all run in cloud services. Upload the PDF directly to the cloud
function; the client only transfers the file bytes:

```powershell
$env:INSFORGE_ACCESS_TOKEN = "<signed-in-user-access-token>"
curl.exe -X POST "https://79jaf63m.function2.insforge.app/ingest-pdf" `
  -H "Authorization: Bearer $env:INSFORGE_ACCESS_TOKEN" `
  -F "file=@D:\chatbotsri\data\raw_pdf\Constitucion_Republica_Ecuador_30052024.pdf"
```

The PDF function extracts text in the InsForge cloud and sends bounded,
overlapping text batches to `ingest`. Then call `ask` with a question about
Article 424 and another unrelated question to check retrieval and abstention.

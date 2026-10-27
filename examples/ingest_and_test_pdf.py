"""Ingest a PDF through the deployed RAG endpoint, then run two grounding checks."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

FUNCTIONS_URL = os.environ.get(
    "RAG_FUNCTIONS_URL", "https://79jaf63m.function2.insforge.app"
).rstrip("/")
ACCESS_TOKEN = os.environ.get("INSFORGE_ACCESS_TOKEN")
NO_INFORMATION = "no tengo esa información en mis documentos"


def post(path: str, payload: dict) -> dict:
    if not ACCESS_TOKEN:
        raise RuntimeError("Set INSFORGE_ACCESS_TOKEN to a signed-in user's access token.")
    request = Request(
        f"{FUNCTIONS_URL}/{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {ACCESS_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{path} returned HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Could not reach {path}: {error.reason}") from error


def post_pdf(pdf_path: Path) -> dict:
    if not ACCESS_TOKEN:
        raise RuntimeError("Set INSFORGE_ACCESS_TOKEN to a signed-in user's access token.")
    boundary = "----RAGUploadBoundary7MA4YWxkTrZu0gW"
    file_bytes = pdf_path.read_bytes()
    body = b"\r\n".join([
        f"--{boundary}".encode(),
        f'Content-Disposition: form-data; name="file"; filename="{pdf_path.name}"'.encode(),
        b"Content-Type: application/pdf",
        b"",
        file_bytes,
        f"--{boundary}--".encode(),
        b"",
    ])
    request = Request(
        f"{FUNCTIONS_URL}/ingest-pdf",
        data=body,
        headers={
            "Authorization": f"Bearer {ACCESS_TOKEN}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=900) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ingest-pdf returned HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Could not upload the PDF: {error.reason}") from error


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python examples/ingest_and_test_pdf.py <path-to-pdf>", file=sys.stderr)
        return 2

    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    if not pdf_path.is_file():
        raise FileNotFoundError(pdf_path)

    print(f"Subiendo {pdf_path.name}; extracción y vectorización ocurren en la nube…")
    ingestion = post_pdf(pdf_path)

    known = post(
        "ask",
        {"question": "Según el artículo 424, ¿qué lugar ocupa la Constitución en el ordenamiento jurídico?"},
    )
    unknown = post(
        "ask",
        {"question": "¿Cuál fue el marcador de la final de la Copa Mundial de la FIFA de 2022?"},
    )

    known_ok = "norma suprema" in known.get("answer", "").casefold()
    unknown_ok = unknown.get("answer", "").strip().casefold() == NO_INFORMATION.casefold()
    print(json.dumps({
        "ingestion": ingestion,
        "knownQuestion": known,
        "knownQuestionPassed": known_ok,
        "outOfContextQuestion": unknown,
        "outOfContextQuestionPassed": unknown_ok,
    }, ensure_ascii=False, indent=2))
    return 0 if known_ok and unknown_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

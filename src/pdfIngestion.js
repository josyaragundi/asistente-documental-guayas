import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

function nativeText(items) {
  return items.map((item) => item?.str || "").join(" ").replace(/\s+/g, " ").trim();
}

async function pageToJpeg(page) {
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  await page.render({ canvasContext: context, viewport }).promise;
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo crear la imagen OCR")), "image/jpeg", 0.75));
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

export async function extractPdfPages(file, { onProgress, onOcrPage, onPageText }) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];
  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      let text = nativeText((await page.getTextContent()).items);
      let method = "text";
      if (text.length < 30) {
        const image = await pageToJpeg(page);
        text = await onOcrPage(image, pageNum);
        method = "ocr.space-page";
      }
      page.cleanup();
      if (text.trim()) pages.push({ pageStart: pageNum, pageEnd: pageNum, text: text.trim(), method });
      onPageText?.({ pageNum, pages: pdf.numPages, text, method });
      onProgress?.(pageNum, pdf.numPages);
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}

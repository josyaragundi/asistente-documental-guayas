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
  try {
    await page.render({ canvasContext: context, viewport }).promise;
    return await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo crear la imagen OCR")), "image/jpeg", 0.75));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function extractPdfPages(file, { onProgress, onOcrPage, onPageText }) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages = [];
  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      // Publica el avance antes de procesar la página y cede un frame al
      // navegador para que la UI pinte 1/33, 2/33, etc. en tiempo real.
      await onProgress?.(pageNum, pdf.numPages);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const page = await pdf.getPage(pageNum);
      try {
        let text = nativeText((await page.getTextContent()).items);
        let method = "text";
        if (text.length < 30) {
          const image = await pageToJpeg(page);
          text = await onOcrPage(image, pageNum);
          method = "ocr.space-page";
        }
        if (text.trim()) pages.push({ pageStart: pageNum, pageEnd: pageNum, text: text.trim(), method });
        onPageText?.({ pageNum, pages: pdf.numPages, text, method });
      } finally {
        if (typeof page.cleanup === "function") page.cleanup();
      }
    }
  } finally {
    if (typeof pdf.cleanup === "function") await pdf.cleanup();
    else if (typeof loadingTask.destroy === "function") await loadingTask.destroy();
  }
  return pages;
}

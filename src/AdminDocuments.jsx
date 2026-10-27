import { useRef } from "react";
import { MenuIcon } from "./icons.jsx";

export default function AdminDocuments({ documents, uploading, deletingDocument, onUploadPdf, onDeleteDocument, onBack }) {
  const inputRef = useRef(null);
  return (
    <main className="main admin-page">
      <header className="topbar">
        <button className="icon-btn" type="button" onClick={onBack} aria-label="Volver al chat"><MenuIcon /></button>
        <span className="topbar-title">Administrar documentos</span>
      </header>
      <section className="admin-content">
        <div className="admin-intro">
          <h1>Archivos del asistente</h1>
          <p>Sube documentos PDF para incorporarlos a la base de conocimiento o elimina los que ya no deban utilizarse.</p>
          <input ref={inputRef} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUploadPdf(file); }} />
          <button className="upload-primary" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Procesando documento…" : "Subir documento PDF"}
          </button>
        </div>
        <div className="admin-documents-card">
          <div className="admin-card-heading"><strong>Documentos cargados</strong><span>{documents.length} {documents.length === 1 ? "archivo" : "archivos"}</span></div>
          {documents.length === 0 ? <p className="documents-empty">Todavía no has cargado documentos.</p> : <div className="admin-document-list">
            {documents.map((document) => <div className="admin-document-row" key={document.source}>
              <div><strong>{document.source}</strong><small>{document.chunks} fragmentos indexados</small></div>
              <button className="delete-document" type="button" disabled={deletingDocument === document.source} onClick={() => onDeleteDocument(document.source)}>{deletingDocument === document.source ? "Eliminando…" : "Eliminar"}</button>
            </div>)}
          </div>}
        </div>
      </section>
    </main>
  );
}

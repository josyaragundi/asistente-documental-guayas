import { useRef } from "react";
import { MenuIcon } from "./icons.jsx";

export default function AdminDocuments({ documents, uploading, uploadProgress, notice, error, deletingDocument, onUploadPdf, onDeleteDocument, onBack }) {
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
          <input ref={inputRef} hidden multiple type="file" accept="application/pdf,.pdf" onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) onUploadPdf(files); }} />
          <button className="upload-primary" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Procesando documentos…" : "Subir documentos PDF"}
          </button>
          {uploading && uploadProgress.total > 0 && (
            <div className="upload-progress" role="status" aria-live="polite">
              <div className="upload-progress-heading">
                <span>Procesando {uploadProgress.current} de {uploadProgress.total}</span>
                <strong>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</strong>
              </div>
              <div className="upload-progress-track"><div className="upload-progress-bar" style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }} /></div>
              <small>{uploadProgress.fileName}</small>
            </div>
          )}
          {notice && <p className="admin-status" role="status">{notice}</p>}
          {error && <p className="admin-status error" role="alert">{error}</p>}
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

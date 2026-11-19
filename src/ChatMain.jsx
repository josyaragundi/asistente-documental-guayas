import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MenuIcon, PlusIcon, SendIcon } from "./icons.jsx";

function renderAssistantText(text) {
  const lines = String(text || "").split("\n");
  const blocks = [];
  let table = [];
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
    const header = rows[0];
    const body = rows.filter((row, index) => index > 1 && row.some(Boolean));
    blocks.push(
      <div className="answer-table-wrap" key={`table-${blocks.length}`}>
        <table className="answer-table"><thead><tr>{header.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead>
          <tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>,
    );
    table = [];
  };
  for (const line of lines) {
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      table.push(line.trim());
    } else {
      flushTable();
      if (line.trim()) blocks.push(<p key={`line-${blocks.length}`}>{line}</p>);
    }
  }
  flushTable();
  return blocks;
}

export default function ChatMain({
  chat,
  prompt,
  notice,
  error,
  loading,
  sendingMessage,
  onPromptChange,
  onSubmit,
  onUploadPdf,
  documents,
  documentsOpen,
  onToggleDocuments,
  onDeleteDocument,
  deletingDocument,
  uploading,
  isAdmin,
  user,
  hasOlderMessages,
  loadingOlderMessages,
  loadingActiveMessages,
  onLoadOlderMessages,
  onOpenSidebar,
}) {
  const displayName = user?.profile?.name || user?.name || user?.email?.split("@")[0] || "";
  const initial = displayName.trim().charAt(0).toLocaleUpperCase("es") || "?";
  const threadRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const previousChatIdRef = useRef(null);
  const previousMessageCountRef = useRef(0);
  const pendingPrependHeightRef = useRef(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const messages = chat?.messages ?? [];
  const latestMessage = messages[messages.length - 1];

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;

    if (previousChatIdRef.current !== chat?.id) {
      thread.scrollTop = thread.scrollHeight;
      previousChatIdRef.current = chat?.id ?? null;
      previousMessageCountRef.current = messages.length;
      pendingPrependHeightRef.current = null;
      stickToBottomRef.current = true;
      setShowJumpToLatest(false);
      return;
    }

    const previousHeight = pendingPrependHeightRef.current;
    if (previousHeight !== null && messages.length > previousMessageCountRef.current) {
      thread.scrollTop += thread.scrollHeight - previousHeight;
      pendingPrependHeightRef.current = null;
    } else if (stickToBottomRef.current) {
      thread.scrollTop = thread.scrollHeight;
    } else {
      setShowJumpToLatest(true);
    }
    previousMessageCountRef.current = messages.length;
  }, [chat?.id, messages.length, latestMessage?.id, latestMessage?.text]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [prompt]);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  }

  function submitMessage() {
    if (sendingMessage) return;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    const thread = threadRef.current;
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    onSubmit();
  }

  function handleThreadScroll() {
    const thread = threadRef.current;
    if (!thread) return;
    const distanceToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    const atBottom = distanceToBottom < 100;
    stickToBottomRef.current = atBottom;
    setShowJumpToLatest(!atBottom && messages.length > 0);
  }

  async function loadOlderMessages() {
    const thread = threadRef.current;
    if (!thread || !onLoadOlderMessages || loadingOlderMessages) return;
    pendingPrependHeightRef.current = thread.scrollHeight;
    const loaded = await onLoadOlderMessages();
    if (!loaded) pendingPrependHeightRef.current = null;
  }

  function jumpToLatest() {
    const thread = threadRef.current;
    if (!thread) return;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }

  async function copyMessage(message) {
    await navigator.clipboard?.writeText(message.text);
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  }

  function startVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return setVoiceError("Tu navegador no admite dictado por voz.");
    setVoiceError("");
    const recognition = new Recognition();
    recognition.lang = "es-EC";
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setVoiceError("No se pudo usar el micrófono. Revisa el permiso del navegador."); };
    recognition.onresult = (event) => onPromptChange(`${prompt} ${event.results[0][0].transcript}`.trim());
    try { recognition.start(); } catch { setListening(false); setVoiceError("El dictado no está disponible en este navegador. Prueba Chrome o Edge."); }
  }


  return (
    <main className="main">
      <header className="topbar">
        <button
          className="icon-btn open-sidebar"
          type="button"
          aria-label="Mostrar u ocultar panel lateral"
          onClick={onOpenSidebar}
        >
          <MenuIcon />
        </button>
        <span className="topbar-title">Asistente documental</span>
        <span className="topbar-spacer" aria-hidden="true" />
      </header>

      {isAdmin && documentsOpen && (
        <aside className="documents-panel" aria-label="Documentos cargados">
          <div className="documents-heading">
            <div><strong>Documentos cargados</strong><small>Solo visibles para administradores</small></div>
            <button type="button" className="panel-close" onClick={onToggleDocuments} aria-label="Cerrar">×</button>
          </div>
          {documents.length === 0 ? <p className="documents-empty">Todavía no hay documentos cargados.</p> : (
            <div className="documents-list">
              {documents.map((document) => (
                <div className="document-row" key={document.source}>
                  <div className="document-info"><strong title={document.source}>{document.source}</strong><small>{document.chunks} fragmentos</small></div>
                  <button type="button" className="delete-document" onClick={() => onDeleteDocument(document.source)} disabled={deletingDocument === document.source}>
                    {deletingDocument === document.source ? "…" : "Eliminar"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}

      <section className="thread" ref={threadRef} onScroll={handleThreadScroll}>
        {hasOlderMessages && (
          <div className="older-messages">
            <button type="button" onClick={loadOlderMessages} disabled={loadingOlderMessages}>
              {loadingOlderMessages ? "Cargando mensajes…" : "Cargar mensajes anteriores"}
            </button>
          </div>
        )}
        {loadingActiveMessages ? <div className="chat-loading" aria-label="Cargando chat" /> : messages.length === 0 ? (
          <div className="empty">
            <div className="welcome-copy">
              <span>Hola, {displayName}</span>
              <small>¿Qué te gustaría consultar hoy?</small>
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <article className={`message ${message.role}`} key={message.id ?? `${message.role}-${index}`}>
              {message.role === "assistant" ? <span className="avatar bot">✦</span> : <span className="avatar user-avatar">{initial}</span>}
              <div className="message-body"><div className="bubble">{message.role === "assistant" ? renderAssistantText(message.text) : message.text}</div>{message.role === "assistant" && <button className="message-action" type="button" onClick={() => copyMessage(message)}>{copiedId === message.id ? "Copiado" : "Copiar"}</button>}</div>
            </article>
          ))
        )}
        {error && <p className="chat-status error" role="alert">{error}</p>}
        {sendingMessage && <p className="chat-status" role="status" aria-live="polite">Consultando los planes de trabajo…</p>}
        {notice && <p className="chat-status" role="status">{notice}</p>}
      </section>

      <footer className="composer-wrap">
        {showJumpToLatest && (
          <button className="jump-to-latest" type="button" onClick={jumpToLatest}>
            ↓ Ir al último mensaje
          </button>
        )}
        <form
          className="composer"
          aria-busy={sendingMessage}
          onSubmit={(event) => {
            event.preventDefault();
            submitMessage();
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              if (files.length) onUploadPdf(files);
            }}
          />
          {isAdmin && <button
            className="icon-btn attach"
            type="button"
            aria-label={uploading ? "Subiendo PDF" : "Subir PDF"}
            title={uploading ? "Subiendo PDF…" : "Subir PDF"}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <PlusIcon />
          </button>}
          <textarea
            ref={textareaRef}
            rows="1"
            placeholder="Pregunta lo que quieras"
            autoComplete="off"
            value={prompt}
            disabled={sendingMessage}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className={`voice-btn${listening ? " listening" : ""}`} type="button" title="Dictar pregunta" onClick={startVoice} aria-label="Dictar pregunta" disabled={sendingMessage}>{listening ? "●" : "🎙"}</button>
          <button
            className="send"
            type="submit"
            aria-label="Enviar"
            disabled={sendingMessage || prompt.trim() === ""}
          >
            <SendIcon />
          </button>
        </form>
        {voiceError && <p className="voice-error">{voiceError}</p>}
        <p className="disclaimer">
          Las respuestas se basan en tus documentos y muestran sus fuentes.
        </p>
      </footer>
    </main>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MenuIcon, PlusIcon, SendIcon } from "./icons.jsx";

export default function ChatMain({
  chat,
  prompt,
  notice,
  error,
  loading,
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
  onLoadOlderMessages,
  onOpenSidebar,
  onEditMessage,
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
  const [editingId, setEditingId] = useState("");
  const [editingText, setEditingText] = useState("");
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

  function beginEdit(message) { setEditingId(message.id); setEditingText(message.text); }

  return (
    <main className="main">
      <header className="topbar">
        <button
          className="icon-btn open-sidebar"
          type="button"
          aria-label="Abrir menú"
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
        {messages.length === 0 ? (
          <div className="empty">
            <div className="welcome-copy">
              <span>Hola, {displayName}</span>
              <small>¿Qué te gustaría consultar hoy?</small>
            </div>
            {loading && <small>Cargando conversaciones…</small>}
          </div>
        ) : (
          messages.map((message, index) => (
            <article className={`message ${message.role}`} key={message.id ?? `${message.role}-${index}`}>
              {message.role === "assistant" ? (
                <span className="avatar bot">{initial}</span>
              ) : null}
              <div className="message-body">{editingId === message.id ? <div className="inline-editor"><textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} autoFocus /><div><button type="button" onClick={() => { onEditMessage({ ...message, text: editingText }); setEditingId(""); }}>Guardar</button><button type="button" onClick={() => setEditingId("")}>Cancelar</button></div></div> : <div className="bubble">{message.text}</div>}{message.role === "assistant" ? <button className="message-action" type="button" onClick={() => copyMessage(message)}>{copiedId === message.id ? "Copiado" : "Copiar"}</button> : <button className="message-action" type="button" onClick={() => beginEdit(message)}>Editar</button>}</div>
            </article>
          ))
        )}
        {error && <p className="chat-status error" role="alert">{error}</p>}
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
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUploadPdf(file);
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
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className={`voice-btn${listening ? " listening" : ""}`} type="button" title="Dictar pregunta" onClick={startVoice} aria-label="Dictar pregunta">{listening ? "●" : "🎙"}</button>
          <button
            className="send"
            type="submit"
            aria-label="Enviar"
            disabled={prompt.trim() === ""}
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

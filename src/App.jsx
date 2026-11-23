import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthScreen from "./AuthScreen.jsx";
import ChatMain from "./ChatMain.jsx";
import AdminDocuments from "./AdminDocuments.jsx";
import { insforge } from "./insforge.js";
import Sidebar from "./Sidebar.jsx";
import { extractPdfPages } from "./pdfIngestion.js";

const MESSAGE_PAGE_SIZE = 50;

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(() => localStorage.getItem("chat-active-id") || null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: "" });
  const [isAdmin, setIsAdmin] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState("");
  const [view, setView] = useState(() => localStorage.getItem("chat-view") || "chat");
  const [theme, setTheme] = useState("light");
  const [themeLoadedFor, setThemeLoadedFor] = useState(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    if (!insforge || !user?.id) {
      setTheme("light");
      setThemeLoadedFor(null);
      return () => { mounted = false; };
    }
    async function loadUserTheme() {
      const { data, error } = await insforge.database
        .from("user_preferences")
        .select("theme")
        .eq("user_id", user.id)
        .limit(1);
      if (!mounted) return;
      if (!error) setTheme(data?.[0]?.theme === "dark" ? "dark" : "light");
      setThemeLoadedFor(user.id);
    }
    loadUserTheme();
    return () => { mounted = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!insforge || !user?.id || themeLoadedFor !== user.id) return;
    let cancelled = false;
    async function saveUserTheme() {
      const existing = await insforge.database
        .from("user_preferences")
        .select("user_id")
        .eq("user_id", user.id)
        .limit(1);
      if (cancelled || existing.error) return;
      const result = existing.data?.length
        ? await insforge.database.from("user_preferences").update({ theme, updated_at: new Date().toISOString() }).eq("user_id", user.id)
        : await insforge.database.from("user_preferences").insert([{ user_id: user.id, theme }]);
      if (result.error && !cancelled) setError(`No se pudo guardar el tema: ${result.error.message}`);
    }
    saveUserTheme();
    return () => { cancelled = true; };
  }, [theme, themeLoadedFor, user?.id]);
  useEffect(() => { localStorage.setItem("chat-view", view); }, [view]);
  useEffect(() => {
    if (activeId) localStorage.setItem("chat-active-id", activeId);
    else localStorage.removeItem("chat-active-id");
  }, [activeId]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [loadingActiveMessages, setLoadingActiveMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const sendingRef = useRef(false);
  const requestSequenceRef = useRef(0);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeId) ?? null,
    [chats, activeId]
  );

  useEffect(() => {
    let mounted = true;
    async function restoreSession() {
      if (!insforge) {
        setAuthLoading(false);
        return;
      }
      try {
        const { data, error: authError } = await insforge.auth.getCurrentUser();
        if (authError) throw authError;
        if (mounted) setUser(data?.user ?? null);
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }
    restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  const loadChats = useCallback(async () => {
    if (!insforge || !user) return;
    setLoadingChats(true);
    setError("");
    try {
      const { data, error: queryError } = await insforge.database
        .from("conversations")
        .select("id, title, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (queryError) throw queryError;
      const conversations = data ?? [];
      setChats(conversations.map((chat) => ({ ...chat, messages: [] })));
      setActiveId((current) =>
        conversations.some((chat) => chat.id === current)
          ? current
          : null
      );
    } catch (queryError) {
      setError(`No se pudieron cargar las conversaciones: ${queryError.message}`);
    } finally {
      setLoadingChats(false);
    }
  }, [user]);

  const loadDocuments = useCallback(async () => {
    if (!insforge || !user || !isAdmin) return;
    const rows = [];
    let offset = 0;
    let queryError = null;
    do {
      const result = await insforge.database
        .from("documents")
        .select("source, created_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + 999);
      if (result.error) { queryError = result.error; break; }
      rows.push(...(result.data ?? []));
      offset += 1000;
      if ((result.data ?? []).length < 1000) break;
    } while (true);
    if (!queryError) {
      const grouped = new Map();
      for (const row of rows) {
        const current = grouped.get(row.source) ?? { source: row.source, chunks: 0, created_at: row.created_at };
        current.chunks += 1;
        grouped.set(row.source, current);
      }
      setDocuments([...grouped.values()]);
    }
  }, [user, isAdmin]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  useEffect(() => {
    let mounted = true;
    async function checkAdmin() {
      setIsAdmin(false);
      if (!insforge || !user) return;
      const { data, error: queryError } = await insforge.database
        .from("app_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .limit(1);
      if (mounted) setIsAdmin(!queryError && Boolean(data?.length));
    }
    checkAdmin();
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    if (user) loadChats();
    else {
      setChats([]);
      setActiveId(null);
    }
  }, [user, loadChats]);

  useEffect(() => {
    let mounted = true;
    async function loadMessages() {
      if (!insforge || !activeId) { setLoadingActiveMessages(false); return; }
      setLoadingActiveMessages(true);
      setHasOlderMessages(false);
      const { data, error: queryError } = await insforge.database
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      if (!mounted) return;
      if (queryError) {
        setError(`No se pudieron cargar los mensajes: ${queryError.message}`);
        setLoadingActiveMessages(false);
        return;
      }
      const recentMessages = data ?? [];
      setHasOlderMessages(recentMessages.length === MESSAGE_PAGE_SIZE);
      setChats((current) =>
        current.map((chat) =>
          chat.id === activeId
            ? {
                ...chat,
                messages: [...recentMessages].reverse().map((message) => ({
                  id: message.id,
                  role: message.role,
                  text: message.content,
                  created_at: message.created_at,
                })),
              }
            : chat
        )
      );
      setLoadingActiveMessages(false);
    }
    loadMessages();
    return () => {
      mounted = false;
    };
  }, [activeId]);

  async function loadOlderMessages() {
    if (!insforge || !activeChat || !hasOlderMessages || loadingOlderMessages) return 0;
    const oldestMessage = activeChat.messages[0];
    if (!oldestMessage?.created_at) return 0;
    setLoadingOlderMessages(true);
    setError("");
    try {
      const { data, error: queryError } = await insforge.database
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", activeChat.id)
        .lt("created_at", oldestMessage.created_at)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      if (queryError) throw queryError;
      const olderMessages = data ?? [];
      setChats((current) => current.map((chat) =>
        chat.id === activeChat.id
          ? {
              ...chat,
              messages: [
                ...[...olderMessages].reverse().map((message) => ({
                  id: message.id,
                  role: message.role,
                  text: message.content,
                  created_at: message.created_at,
                })),
                ...chat.messages,
              ],
            }
          : chat
      ));
      setHasOlderMessages(olderMessages.length === MESSAGE_PAGE_SIZE);
      return olderMessages.length;
    } catch (queryError) {
      setError(`No se pudieron cargar mensajes anteriores: ${queryError.message}`);
      return 0;
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  function createChat() {
    requestSequenceRef.current += 1;
    sendingRef.current = false;
    setSendingMessage(false);
    setActiveId(null);
    setHasOlderMessages(false);
    setPrompt("");
    setNotice("");
    setError("");
    setSidebarOpen(false);
  }

  function selectChat(id) {
    requestSequenceRef.current += 1;
    sendingRef.current = false;
    setSendingMessage(false);
    setActiveId(id);
    setPrompt("");
    setNotice("");
    setError("");
    setSidebarOpen(false);
  }



  async function sendMessage() {
    const text = prompt.trim();
    if (sendingRef.current || !text || !insforge || !user) return;
    sendingRef.current = true;
    const requestId = ++requestSequenceRef.current;
    setSendingMessage(true);
    setError("");
    setNotice("");
    try {
      let conversation = activeChat;
      if (!conversation) {
        const { data, error: insertError } = await insforge.database
          .from("conversations")
          .insert([{ title: text.slice(0, 48) }])
          .select("id, title, created_at, updated_at")
          .single();
        if (insertError) throw insertError;
        conversation = { ...data, messages: [] };
        setChats((current) => [conversation, ...current]);
      }

      const { data, error: insertError } = await insforge.database
        .from("messages")
        .insert([{ conversation_id: conversation.id, role: "user", content: text }])
        .select("id, role, content, created_at")
        .single();
      if (insertError) throw insertError;

      setChats((current) =>
        current.map((chat) =>
          chat.id === conversation.id
            ? {
                ...chat,
                messages: [...chat.messages, {
                  id: data.id,
                  role: data.role,
                  text: data.content,
                  created_at: data.created_at,
                }],
              }
            : chat
        )
      );
      setActiveId(conversation.id);
      setPrompt("");

      const { error: touchError } = await insforge.database
        .from("conversations")
        .update({ title: conversation.title })
        .eq("id", conversation.id);
      if (touchError) throw touchError;

      const { data: ragResult, error: ragError } = await insforge.functions.invoke("ask", {
        body: { question: text, clientRequestId: requestId },
      });
      if (ragError) throw ragError;
      if (requestId !== requestSequenceRef.current) return;

      const citations = (ragResult?.sources ?? [])
        .map((item) => {
          const pages = item.pages ? ` — página${String(item.pages).includes("-") ? "s" : ""} ${item.pages}` : "";
          const sourceLabel = item.candidate || String(item.source || "").replace(/\.pdf$/i, "").replaceAll("__", " — ").replaceAll("_", " ");
          return item.score == null ? `- ${sourceLabel}${pages}` : `- ${sourceLabel}${pages} (${item.score})`;
        })
        .join("\n");
      const assistantText = citations
        ? `${ragResult.answer}\n\nFuentes:\n${citations}`
        : ragResult?.answer || "no tengo esa información en mis documentos";
      const { data: assistantMessage, error: assistantError } = await insforge.database
        .from("messages")
        .insert([{
          conversation_id: conversation.id,
          role: "assistant",
          content: assistantText,
        }])
        .select("id, role, content, created_at")
        .single();
      if (assistantError) throw assistantError;

      setChats((current) =>
        current.map((chat) =>
          chat.id === conversation.id
            ? {
                ...chat,
                updated_at: new Date().toISOString(),
                messages: [...chat.messages, {
                  id: assistantMessage.id,
                  role: assistantMessage.role,
                  text: assistantMessage.content,
                  created_at: assistantMessage.created_at,
                }],
              }
            : chat
        )
      );
      setNotice("");
      setChats((current) => [...current].sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ));
    } catch (sendError) {
      if (requestId === requestSequenceRef.current) {
        const errorDetail = sendError?.message
          || sendError?.detail
          || sendError?.error
          || sendError?.data?.detail
          || sendError?.data?.error
          || (typeof sendError === "string" ? sendError : "Error desconocido al consultar el asistente");
        setError(`El mensaje quedó guardado, pero no se pudo generar la respuesta: ${errorDetail}`);
      }
    } finally {
      if (requestId === requestSequenceRef.current) {
        sendingRef.current = false;
        setSendingMessage(false);
      }
    }
  }

  async function uploadPdf(files) {
    if (!insforge || !user || uploading) return;
    const selectedFiles = Array.isArray(files) ? files : [files];
    setUploading(true);
    setUploadProgress({ current: 0, total: selectedFiles.length, fileName: "" });
    setError("");
    const completed = [];
    const failed = [];
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      setUploadProgress({ current: index + 1, total: selectedFiles.length, fileName: file.name });
      setNotice(`Procesando documento ${index + 1} de ${selectedFiles.length}: ${file.name}…`);
      try {
        const documentId = crypto.randomUUID();
        let chunks = 0;
        const pages = await extractPdfPages(file, {
          onProgress: (pageNum, total) => setNotice(`Procesando ${file.name}: página ${pageNum} de ${total}…`),
          onOcrPage: async (image, pageNum) => {
            const ocrForm = new FormData();
            ocrForm.append("file", image, `${file.name}-page-${pageNum}.jpg`);
            const { data, error } = await insforge.functions.invoke("ocr-page", { body: ocrForm });
            if (error) throw error;
            return data?.text || "";
          },
        });
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
          const page = pages[pageIndex];
          let lastError;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const { data, error } = await insforge.functions.invoke("ingest-pdf", { body: {
              document_id: documentId, source: file.name, text: page.text,
              page_start: page.pageStart, page_end: page.pageEnd, chunk_index_offset: pageIndex,
            } });
            if (!error) {
              chunks += Number(data?.chunksInserted) || 0;
              lastError = null;
              break;
            }
            lastError = error;
            if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
          }
          if (lastError) throw lastError;
        }
        completed.push(`${file.name} (${chunks} fragmentos)`);
      } catch (uploadError) {
        // Edge functions can finish OCR/embedding after the SDK's 30-second
        // request window closes. Confirm the durable database result before
        // showing a failure, so users do not retry and create duplicates.
        let recovered = false;
        for (let attempt = 0; attempt < 12 && !recovered; attempt += 1) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 5000));
          const { data: indexedRows } = await insforge.database
            .from("documents")
            .select("page_start")
            .eq("document_id", documentId)
            .eq("source", file.name)
            .limit(10000);
          const indexedPages = new Set((indexedRows ?? []).map((row) => Number(row.page_start)).filter(Number.isInteger));
          const allPagesIndexed = pages.length > 0 && pages.every((page) => indexedPages.has(page.pageStart));
          if (allPagesIndexed) {
            completed.push(`${file.name} (procesado en segundo plano)`);
            recovered = true;
          }
        }
        if (!recovered) failed.push(`${file.name}: ${uploadError.message || "No se pudo confirmar el procesamiento"}`);
      }
    }
    await loadDocuments();
    setUploadProgress({ current: selectedFiles.length, total: selectedFiles.length, fileName: "Completado" });
    setUploading(false);
    if (failed.length) {
      setError(`No se pudieron procesar ${failed.length} archivo(s): ${failed.join("; ")}`);
    }
    setNotice(`${completed.length} de ${selectedFiles.length} documento(s) procesado(s).${completed.length ? ` ${completed.join(", ")}.` : ""}`);
  }

  async function deleteDocument(source) {
    if (!insforge || !source || deletingDocument) return;
    if (!window.confirm(`¿Eliminar "${source}" y todos sus fragmentos?`)) return;
    setDeletingDocument(source);
    setError("");
    const { error: deleteError } = await insforge.database.from("documents").delete().eq("source", source);
    if (deleteError) setError(`No se pudo eliminar el documento: ${deleteError.message}`);
    else setNotice(`Documento eliminado: ${source}`);
    await loadDocuments();
    setDeletingDocument("");
  }

  async function signOut() {
    if (insforge) await insforge.auth.signOut();
    setUser(null);
    setPrompt("");
  }

  if (authLoading) {
    return <main className="auth-screen" aria-busy="true" />;
  }
  if (!user) return <AuthScreen onAuthenticated={setUser} />;

  return (
    <div className={`app${sidebarHidden ? " sidebar-hidden" : ""}`}>
      <Sidebar
        chats={chats}
        activeId={activeId}
        open={sidebarOpen}
        user={user}
        isAdmin={isAdmin}
        onNewChat={() => { setView("chat"); createChat(); }}
        onSelectChat={(id) => { setView("chat"); selectChat(id); }}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "light" ? "dark" : "light")}
        onClose={() => setSidebarOpen(false)}
        onSignOut={signOut}
        onOpenDocuments={() => { setView("documents"); loadDocuments(); }}
      />
      <div
        className={`overlay${sidebarOpen ? " show" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      {view === "documents" ? <AdminDocuments
        documents={documents}
        uploading={uploading}
        uploadProgress={uploadProgress}
        notice={notice}
        error={error}
        deletingDocument={deletingDocument}
        onUploadPdf={uploadPdf}
        onDeleteDocument={deleteDocument}
        onBack={() => setView("chat")}
      /> : <ChatMain
        chat={activeChat}
        prompt={prompt}
        notice={notice}
        error={error}
        loading={loadingChats}
        sendingMessage={sendingMessage}
        uploading={uploading}
        isAdmin={isAdmin}
        user={user}
        hasOlderMessages={hasOlderMessages}
        loadingOlderMessages={loadingOlderMessages}
        loadingActiveMessages={loadingActiveMessages}
        onLoadOlderMessages={loadOlderMessages}
        onPromptChange={setPrompt}
        onSubmit={sendMessage}
        onUploadPdf={uploadPdf}
        documents={documents}
        documentsOpen={documentsOpen}
        onToggleDocuments={() => setView("documents")}
        onDeleteDocument={deleteDocument}
        deletingDocument={deletingDocument}
        // The hamburger opens the panel immediately. Hiding the sidebar is a
        // separate desktop action; toggling both states here could leave the
        // panel marked open while CSS still kept it display:none.
        onOpenSidebar={() => { setSidebarHidden(false); setSidebarOpen(true); }}
      />}
    </div>
  );
}

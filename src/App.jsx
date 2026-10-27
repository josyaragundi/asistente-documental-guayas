import { useCallback, useEffect, useMemo, useState } from "react";
import AuthScreen from "./AuthScreen.jsx";
import ChatMain from "./ChatMain.jsx";
import AdminDocuments from "./AdminDocuments.jsx";
import { insforge } from "./insforge.js";
import Sidebar from "./Sidebar.jsx";

const MESSAGE_PAGE_SIZE = 50;

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState("");
  const [view, setView] = useState("chat");
  const [theme, setTheme] = useState(() => localStorage.getItem("chat-theme") || "light");
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("chat-theme", theme); }, [theme]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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
    const { data, error: queryError } = await insforge.database
      .from("documents")
      .select("source, created_at")
      .order("created_at", { ascending: false });
    if (!queryError) {
      const grouped = new Map();
      for (const row of data ?? []) {
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
      if (!insforge || !activeId) return;
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
    setActiveId(null);
    setHasOlderMessages(false);
    setPrompt("");
    setNotice("");
    setError("");
    setSidebarOpen(false);
  }

  function selectChat(id) {
    setActiveId(id);
    setPrompt("");
    setNotice("");
    setError("");
    setSidebarOpen(false);
  }

  async function renameChat(chat, nextTitle) {
    const title = nextTitle?.trim();
    if (!title || title === chat.title) return;
    const { error: updateError } = await insforge.database.from("conversations").update({ title }).eq("id", chat.id);
    if (updateError) return setError(`No se pudo renombrar el chat: ${updateError.message}`);
    setChats((current) => current.map((item) => item.id === chat.id ? { ...item, title } : item));
  }

  async function editMessage(message) {
    const text = message.text?.trim();
    if (!text || text === message.text || !activeChat) return;
    const { error: updateError } = await insforge.database.from("messages").update({ content: text }).eq("id", message.id);
    if (updateError) return setError(`No se pudo editar la pregunta: ${updateError.message}`);
    const { error: deleteError } = await insforge.database.from("messages").delete().eq("conversation_id", activeChat.id).gt("created_at", message.created_at);
    if (deleteError) return setError(`La pregunta se actualizó, pero no se pudo reiniciar la respuesta: ${deleteError.message}`);
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: chat.messages.filter((item) => item.id === message.id).map((item) => ({ ...item, text })) } : chat));
    setError("");
    setNotice("Buscando una nueva respuesta…");
    try {
      const { data: ragResult, error: ragError } = await insforge.functions.invoke("ask", { body: { question: text } });
      if (ragError) throw ragError;
      const citations = (ragResult?.sources ?? []).map((item) => item.score == null ? `- ${item.source}` : `- ${item.source} (${item.score})`).join("\n");
      const assistantText = citations ? `${ragResult.answer}\n\nFuentes:\n${citations}` : ragResult?.answer || "no tengo esa información en mis documentos";
      const { data: assistantMessage, error: assistantError } = await insforge.database.from("messages").insert([{ conversation_id: activeChat.id, role: "assistant", content: assistantText }]).select("id, role, content, created_at").single();
      if (assistantError) throw assistantError;
      setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: [...chat.messages, { id: assistantMessage.id, role: assistantMessage.role, text: assistantMessage.content, created_at: assistantMessage.created_at }] } : chat));
      setNotice("");
    } catch (askError) {
      setNotice("");
      setError(`No se pudo generar la nueva respuesta: ${askError.message}`);
    }
  }

  async function sendMessage() {
    const text = prompt.trim();
    if (!text || !insforge || !user) return;
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
        body: { question: text },
      });
      if (ragError) throw ragError;

      const citations = (ragResult?.sources ?? [])
        .map((item) => item.score == null ? `- ${item.source}` : `- ${item.source} (${item.score})`)
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
      setError(`El mensaje quedó guardado, pero no se pudo generar la respuesta: ${sendError.message}`);
    }
  }

  async function uploadPdf(file) {
    if (!insforge || !user || uploading) return;
    setUploading(true);
    setError("");
    setNotice(`Subiendo y procesando ${file.name} en la nube…`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data, error: uploadError } = await insforge.functions.invoke("ingest-pdf", {
        body: formData,
      });
      if (uploadError) throw uploadError;
      setNotice(
        `${data.source}: PDF procesado (${data.pages ?? "?"} páginas, ${data.chunksInserted} fragmentos). Ya puedes hacer preguntas.`
      );
      await loadDocuments();
    } catch (uploadError) {
      setError(`No se pudo procesar el PDF: ${uploadError.message}`);
      setNotice("");
    } finally {
      setUploading(false);
    }
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
        onRenameChat={renameChat}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "light" ? "dark" : "light")}
        onClose={() => setSidebarOpen(false)}
        onSignOut={signOut}
        onOpenDocuments={() => setView("documents")}
      />
      <div
        className={`overlay${sidebarOpen ? " show" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      {view === "documents" ? <AdminDocuments
        documents={documents}
        uploading={uploading}
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
        uploading={uploading}
        isAdmin={isAdmin}
        user={user}
        hasOlderMessages={hasOlderMessages}
        loadingOlderMessages={loadingOlderMessages}
        onLoadOlderMessages={loadOlderMessages}
        onPromptChange={setPrompt}
        onSubmit={sendMessage}
        onUploadPdf={uploadPdf}
        documents={documents}
        documentsOpen={documentsOpen}
        onToggleDocuments={() => setView("documents")}
        onDeleteDocument={deleteDocument}
        deletingDocument={deletingDocument}
        onOpenSidebar={() => { setSidebarHidden((hidden) => !hidden); setSidebarOpen((open) => !open); }}
        onEditMessage={editMessage}
      />}
    </div>
  );
}

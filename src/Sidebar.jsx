import { useState } from "react";
import { MenuIcon, PlusIcon } from "./icons.jsx";

export default function Sidebar({
  chats,
  activeId,
  open,
  user,
  isAdmin,
  onNewChat,
  onSelectChat,
  onClose,
  onSignOut,
  onOpenDocuments,
  onRenameChat,
  theme,
  onToggleTheme,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState("");
  const [renamingTitle, setRenamingTitle] = useState("");
  const displayName = user?.profile?.name || user?.name || user?.email?.split("@")[0] || "Cuenta";
  const initial = displayName.trim().charAt(0).toLocaleUpperCase("es") || "?";
  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div className="sidebar-top">
        <button className="new-chat" type="button" onClick={onNewChat}>
          <PlusIcon />
          Nuevo chat
        </button>
        <button
          className="icon-btn sidebar-close"
          type="button"
          aria-label="Cerrar menú"
          onClick={onClose}
        >
          <MenuIcon />
        </button>
      </div>

      <nav className="chat-list" aria-label="Chats recientes">
        <p className="section-label">Recientes</p>
        <input className="chat-search" placeholder="Buscar chats" value={search} onChange={(event) => setSearch(event.target.value)} />
        {chats.length === 0 && <p className="empty-history">Tus chats aparecerán aquí.</p>}
        {chats.filter((chat) => chat.title.toLowerCase().includes(search.toLowerCase())).map((chat) => (
          <button
            key={chat.id}
            className={`chat-item${chat.id === activeId ? " active" : ""}`}
            type="button"
            onClick={() => onSelectChat(chat.id)}
            onDoubleClick={() => { setRenamingId(chat.id); setRenamingTitle(chat.title); }}
          >
            {renamingId === chat.id ? <input className="chat-rename-input" autoFocus value={renamingTitle} onChange={(event) => setRenamingTitle(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter") { onRenameChat(chat, renamingTitle); setRenamingId(""); } if (event.key === "Escape") setRenamingId(""); }} onBlur={() => { onRenameChat(chat, renamingTitle); setRenamingId(""); }} /> : <span>{chat.title}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button className={`profile${profileOpen ? " active" : ""}`} type="button" onClick={() => setProfileOpen((open) => !open)} title="Abrir perfil">
          <span className="avatar">{initial}</span>
          <span className="profile-meta">
            <strong>{user?.profile?.name || user?.email || "Cuenta"}</strong>
            <small>{isAdmin ? "Administradora" : "Cuenta"}</small>
          </span>
        </button>
        {profileOpen && <div className="profile-menu">
          {isAdmin && <button type="button" onClick={() => { setProfileOpen(false); onOpenDocuments(); }}>Administrar documentos</button>}
          <button type="button" onClick={onToggleTheme}>{theme === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}</button>
          <button type="button" onClick={onSignOut}>Cerrar sesión</button>
        </div>}
      </div>
    </aside>
  );
}

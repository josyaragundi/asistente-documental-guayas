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
}) {
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
        {chats.length === 0 && <p className="empty-history">Tus chats aparecerán aquí.</p>}
        {chats.map((chat) => (
          <button
            key={chat.id}
            className={`chat-item${chat.id === activeId ? " active" : ""}`}
            type="button"
            onClick={() => onSelectChat(chat.id)}
          >
            <span>{chat.title}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button className="profile" type="button" onClick={onSignOut} title="Cerrar sesión">
          <span className="avatar">{initial}</span>
          <span className="profile-meta">
            <strong>{user?.profile?.name || user?.email || "Cuenta"}</strong>
            <small>{isAdmin ? "Administradora · Cerrar sesión" : "Cerrar sesión"}</small>
          </span>
        </button>
      </div>
    </aside>
  );
}

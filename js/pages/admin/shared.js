import { escapeHtml, icon } from "../../ui.js";

export const ADMIN_TABS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "structure", label: "Structure", icon: "folder-tree" },
  { id: "documents", label: "Documents", icon: "file-text" },
  { id: "contributors", label: "Contributors", icon: "users" },
  { id: "ads", label: "Ads", icon: "megaphone" },
  { id: "users", label: "Users", icon: "user-check" },
];

export function adminTabsHTML(active) {
  return `<nav class="admin-tabs no-scrollbar" aria-label="Admin sections">
    ${ADMIN_TABS.map((tab) => `<a class="admin-tab ${tab.id === active ? "is-active" : ""}" href="#/admin/${tab.id}" ${tab.id === active ? 'aria-current="page"' : ""}>
      ${icon(tab.icon)}<span>${escapeHtml(tab.label)}</span>
    </a>`).join("")}
  </nav>`;
}

export function adminHeaderHTML({ title = "", subtitle = "", actions = "", eyebrow = "Admin console" }) {
  return `<header class="admin-header">
    <div>
      <p class="admin-header__eyebrow">${icon("shield", "icon--xs")} ${escapeHtml(eyebrow)}</p>
      <h1 class="admin-header__title">${title}</h1>
      ${subtitle ? `<p class="admin-header__subtitle">${escapeHtml(subtitle)}</p>` : ""}
    </div>
    ${actions ? `<div class="admin-header__actions">${actions}</div>` : ""}
  </header>`;
}

export function adminEmptyHTML({ iconName = "database", title = "Nothing here yet", text = "", actions = "" }) {
  return `<div class="admin-empty">
    <div class="admin-empty__icon">${icon(iconName)}</div>
    <p class="admin-empty__title">${escapeHtml(title)}</p>
    <p class="admin-empty__text">${escapeHtml(text)}</p>
    ${actions}
  </div>`;
}

export function adminPageOpen(active) {
  return `<div class="page admin-page"><div class="admin-shell">${adminTabsHTML(active)}`;
}

export function adminPageClose() {
  return `</div></div>`;
}

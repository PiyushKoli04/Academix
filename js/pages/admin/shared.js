import { escapeAttr, escapeHtml, icon, safeColor } from "../../ui.js";

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

export function subjectContextMeta(subject, years = [], branches = []) {
  if (!subject) return "";
  const year = years.find((item) => item.id === subject.yearId);
  const branchNames = (subject.branchIds || [])
    .map((id) => branches.find((b) => b.id === id))
    .filter(Boolean)
    .map((b) => b.shortName || b.name);
  return [
    subject.code || "",
    year?.name || "",
    subject.semester ? `Sem ${subject.semester}` : "",
    branchNames.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function subjectSearchText(subject, years = [], branches = []) {
  const year = years.find((item) => item.id === subject.yearId);
  const branchTokens = (subject.branchIds || [])
    .map((id) => branches.find((b) => b.id === id))
    .filter(Boolean)
    .flatMap((b) => [b.shortName || "", b.name || ""]);
  return [
    subject.name || "",
    subject.code || "",
    year?.name || "",
    subject.semester ? `sem ${subject.semester} semester ${subject.semester}` : "",
    ...branchTokens,
  ]
    .join(" ")
    .toLowerCase();
}

export function subjectPickerHTML({
  subjects = [],
  years = [],
  branches = [],
  value = "",
  name = "subjectId",
  id = "",
  dataAttr = "",
  disabled = false,
  allowAll = false,
  allLabel = "All subjects",
  placeholder = "Choose a subject…",
  mode = "sheet",
} = {}) {
  const selected = value && value !== "all" ? subjects.find((s) => s.id === value) : null;
  const triggerTitle = selected
    ? selected.name || "Untitled subject"
    : allowAll
      ? allLabel
      : placeholder;
  const triggerMeta = selected
    ? subjectContextMeta(selected, years, branches)
    : allowAll
      ? `${subjects.length} subjects in library`
      : "Search by name, code, year, or branch";

  return `<div class="subject-picker ${mode === "toolbar" ? "subject-picker--toolbar" : ""}" data-subject-picker ${allowAll ? 'data-allow-all="true"' : ""} ${disabled ? 'data-disabled="true"' : ""}>
    <input type="hidden" ${name ? `name="${escapeAttr(name)}"` : ""} ${id ? `id="${escapeAttr(id)}"` : ""} ${dataAttr ? dataAttr : ""} value="${escapeAttr(value)}" data-subject-picker-input />
    <button class="subject-picker__trigger" type="button" data-picker-trigger aria-expanded="false" ${disabled ? "disabled" : ""}>
      <span class="subject-picker__trigger-dot" style="background:${selected ? safeColor(selected.color) : "var(--line-strong)"}"></span>
      <span class="subject-picker__trigger-copy">
        <span class="subject-picker__trigger-title" data-picker-title>${escapeHtml(triggerTitle)}</span>
        <span class="subject-picker__trigger-meta" data-picker-meta>${escapeHtml(triggerMeta)}</span>
      </span>
      <span class="subject-picker__trigger-chevron">${icon("chevron-down", "icon--xs")}</span>
    </button>
    <div class="subject-picker__panel" data-picker-panel hidden>
      <div class="subject-picker__controls">
        <div class="subject-picker__search-wrap">
          ${icon("search", "icon--xs")}
          <input class="input subject-picker__search" type="search" placeholder="Search name, code, branch, or sem…" autocomplete="off" data-picker-search />
          <button class="subject-picker__clear" type="button" data-picker-clear aria-label="Clear search" hidden>${icon("x", "icon--xs")}</button>
        </div>
        ${(years.length || branches.length) ? `<div class="subject-picker__filters">
          ${years.length ? `<select class="select subject-picker__filter-select" data-picker-year aria-label="Filter subjects by year">
            <option value="all">All years</option>
            ${years.map((y) => `<option value="${escapeAttr(y.id)}">${escapeHtml(y.name)}</option>`).join("")}
          </select>` : ""}
          ${branches.length ? `<select class="select subject-picker__filter-select" data-picker-branch aria-label="Filter subjects by branch">
            <option value="all">All branches</option>
            ${branches.map((b) => `<option value="${escapeAttr(b.id)}">${escapeHtml(b.shortName || b.name)}</option>`).join("")}
          </select>` : ""}
          <span class="subject-picker__count" data-picker-count>${subjects.length}</span>
        </div>` : ""}
      </div>
      <div class="subject-picker__list" role="listbox" data-picker-list></div>
    </div>
  </div>`;
}

let pickerOutsideListenerBound = false;

function closeOpenSubjectPickers(except = null) {
  document.querySelectorAll("[data-subject-picker].is-open").forEach((picker) => {
    if (picker === except) return;
    const panel = picker.querySelector("[data-picker-panel]");
    const trigger = picker.querySelector("[data-picker-trigger]");
    if (panel) panel.hidden = true;
    picker.classList.remove("is-open");
    trigger?.setAttribute("aria-expanded", "false");
  });
}

export function bindSubjectPickers(root, { subjects = [], years = [], branches = [], onChange = null } = {}) {
  if (!root) return;
  const sortedSubjects = [...subjects].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const pickers = [...root.querySelectorAll("[data-subject-picker]")];

  if (!pickerOutsideListenerBound) {
    pickerOutsideListenerBound = true;
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-subject-picker]")) {
        closeOpenSubjectPickers();
      }
    });
  }

  pickers.forEach((picker) => {
    const input = picker.querySelector("[data-subject-picker-input]");
    const trigger = picker.querySelector("[data-picker-trigger]");
    const panel = picker.querySelector("[data-picker-panel]");
    const searchInput = picker.querySelector("[data-picker-search]");
    const clearBtn = picker.querySelector("[data-picker-clear]");
    const yearSelect = picker.querySelector("[data-picker-year]");
    const branchSelect = picker.querySelector("[data-picker-branch]");
    const list = picker.querySelector("[data-picker-list]");
    const countEl = picker.querySelector("[data-picker-count]");
    const titleEl = picker.querySelector("[data-picker-title]");
    const metaEl = picker.querySelector("[data-picker-meta]");
    const dotEl = picker.querySelector(".subject-picker__trigger-dot");
    const allowAll = picker.dataset.allowAll === "true";

    if (!input || !trigger || !panel || !list) return;

    const renderOptions = () => {
      const needle = String(searchInput?.value || "").trim().toLowerCase();
      const yearId = yearSelect?.value || "all";
      const branchId = branchSelect?.value || "all";
      if (clearBtn) clearBtn.hidden = !needle;

      const filtered = sortedSubjects.filter((sub) => {
        if (yearId !== "all" && sub.yearId !== yearId) return false;
        if (branchId !== "all" && !(sub.branchIds || []).includes(branchId)) return false;
        if (!needle) return true;
        return subjectSearchText(sub, years, branches).includes(needle);
      });

      if (countEl) {
        countEl.textContent = filtered.length === sortedSubjects.length
          ? `${sortedSubjects.length}`
          : `${filtered.length} of ${sortedSubjects.length}`;
      }

      const currentVal = input.value;
      const allRow = allowAll && !needle && yearId === "all" && branchId === "all"
        ? `<button class="subject-picker__option ${currentVal === "all" ? "is-selected" : ""}" type="button" role="option" aria-selected="${currentVal === "all"}" data-picker-option="all">
            <span class="subject-picker__opt-dot" style="background:var(--line-strong)"></span>
            <span class="subject-picker__opt-copy">
              <span class="subject-picker__opt-name">All subjects</span>
              <span class="subject-picker__opt-meta">Show documents from every subject</span>
            </span>
            ${currentVal === "all" ? `<span class="subject-picker__opt-check">${icon("check", "icon--xs")}</span>` : ""}
          </button>`
        : "";

      if (!filtered.length && !allRow) {
        list.innerHTML = `<div class="subject-picker__empty">No subjects match these filters. Try clearing year, branch, or search.</div>`;
        return;
      }

      list.innerHTML = allRow + filtered.map((sub) => {
        const selected = sub.id === currentVal;
        const meta = subjectContextMeta(sub, years, branches);
        return `<button class="subject-picker__option ${selected ? "is-selected" : ""}" type="button" role="option" aria-selected="${selected}" data-picker-option="${escapeAttr(sub.id)}">
          <span class="subject-picker__opt-dot" style="background:${safeColor(sub.color)}"></span>
          <span class="subject-picker__opt-copy">
            <span class="subject-picker__opt-name">${escapeHtml(sub.name || "Untitled subject")}</span>
            <span class="subject-picker__opt-meta">${escapeHtml(meta || "No semester info")}</span>
          </span>
          ${selected ? `<span class="subject-picker__opt-check">${icon("check", "icon--xs")}</span>` : ""}
        </button>`;
      }).join("");
    };

    const selectValue = (nextId) => {
      const sub = nextId && nextId !== "all" ? sortedSubjects.find((s) => s.id === nextId) : null;
      input.value = nextId;
      if (titleEl) {
        titleEl.textContent = sub ? (sub.name || "Untitled subject") : "All subjects";
      }
      if (metaEl) {
        metaEl.textContent = sub
          ? subjectContextMeta(sub, years, branches)
          : `${sortedSubjects.length} subjects in library`;
      }
      if (dotEl) {
        dotEl.style.background = sub ? safeColor(sub.color) : "var(--line-strong)";
      }
      closeOpenSubjectPickers();
      input.dispatchEvent(new Event("change", { bubbles: true }));
      onChange?.(nextId, sub || null);
    };

    const open = () => {
      if (picker.dataset.disabled === "true") return;
      const isCurrentlyOpen = !panel.hidden;
      closeOpenSubjectPickers();
      if (isCurrentlyOpen) return;
      renderOptions();
      panel.hidden = false;
      picker.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      window.setTimeout(() => {
        searchInput?.focus();
        const activeOpt = list.querySelector(".subject-picker__option.is-selected");
        activeOpt?.scrollIntoView({ block: "nearest" });
      }, 20);
    };

    trigger.addEventListener("click", open);
    searchInput?.addEventListener("input", renderOptions);
    clearBtn?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      renderOptions();
      searchInput?.focus();
    });
    yearSelect?.addEventListener("change", renderOptions);
    branchSelect?.addEventListener("change", renderOptions);

    list.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-picker-option]");
      if (btn) selectValue(btn.dataset.pickerOption);
    });

    picker.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) {
        event.stopPropagation();
        closeOpenSubjectPickers();
        trigger.focus();
      }
    });
  });
}

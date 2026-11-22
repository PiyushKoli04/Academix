import {
  fetchBookmarkCatalog,
  fetchSubjectsByIds,
  toggleBookmark,
} from "../db.js";
import { state } from "../state.js";
import {
  DOC_TYPE_META,
  emptyStateHTML,
  escapeHtml,
  icon,
  safeColor,
  setPageMeta,
  toast,
} from "../ui.js";

function subjectBookmarkHTML(subject) {
  return `<div class="bookmark-card" data-bookmark-row="subject:${escapeHtml(subject.id)}">
    <a class="bookmark-card__icon" href="#/subject/${escapeHtml(subject.id)}" style="background:${safeColor(subject.color)}">${icon(subject.icon || "book-open")}</a>
    <a class="bookmark-card__copy" href="#/subject/${escapeHtml(subject.id)}">
      <span class="bookmark-card__eyebrow">Subject · ${escapeHtml(subject.code || "Notes")}</span>
      <span class="bookmark-card__title">${escapeHtml(subject.name || "Untitled subject")}</span>
      <span class="bookmark-card__meta">Sem ${escapeHtml(subject.semester || "—")} · ${(subject.modules || []).length} modules</span>
    </a>
    <span class="bookmark-card__actions">
      <button class="bookmark-card__remove" type="button" data-remove-bookmark="subject:${escapeHtml(subject.id)}" data-bookmark-kind="subject" aria-label="Remove ${escapeHtml(subject.name || "subject")} from bookmarks">${icon("trash")}</button>
    </span>
  </div>`;
}

function documentBookmarkHTML(document, subject) {
  const meta = DOC_TYPE_META[document.type] || DOC_TYPE_META.other;
  return `<div class="bookmark-card" data-bookmark-row="doc:${escapeHtml(document.id)}">
    <a class="bookmark-card__icon" href="#/viewer/${escapeHtml(document.id)}">${icon(meta.icon)}</a>
    <a class="bookmark-card__copy" href="#/viewer/${escapeHtml(document.id)}">
      <span class="bookmark-card__eyebrow">${escapeHtml(meta.short)} · ${escapeHtml(subject?.code || "Document")}</span>
      <span class="bookmark-card__title">${escapeHtml(document.title || "Untitled document")}</span>
      <span class="bookmark-card__meta">${escapeHtml(subject?.name || "Subject")}${document.sizeLabel ? ` · ${escapeHtml(document.sizeLabel)}` : ""}${Number(document.pages) > 0 ? ` · ${document.pages} pages` : ""}</span>
    </a>
    <span class="bookmark-card__actions">
      <button class="bookmark-card__remove" type="button" data-remove-bookmark="doc:${escapeHtml(document.id)}" data-bookmark-kind="document" aria-label="Remove ${escapeHtml(document.title || "document")} from bookmarks">${icon("trash")}</button>
    </span>
  </div>`;
}

export async function renderBookmarks(root, context = {}) {
  const profile = state.profile || {};
  const bookmarks = Array.isArray(profile.bookmarks) ? profile.bookmarks : [];
  setPageMeta("Bookmarks", "Your saved subjects and documents on Academix.");

  let subjects = [];
  let documents = [];
  try {
    const catalog = await fetchBookmarkCatalog(bookmarks);
    subjects = catalog.subjects;
    documents = catalog.documents;
  } catch (error) {
    root.innerHTML = `<div class="page page--compact">${emptyStateHTML({
      icon: "alert-circle",
      title: "Bookmarks didn’t load",
      text: error?.message || "Check your connection and try again.",
      actions: `<a class="btn btn--primary btn--sm" href="#/bookmarks">Retry</a>`,
    })}</div>`;
    return () => {};
  }
  if (!location.hash.startsWith("#/bookmarks")) return () => {};

  const documentSubjectIds = [...new Set(documents.map((document) => document.subjectId).filter(Boolean))];
  let documentSubjects = [];
  try {
    documentSubjects = await fetchSubjectsByIds(documentSubjectIds);
  } catch {
    documentSubjects = [];
  }
  if (!location.hash.startsWith("#/bookmarks")) return () => {};
  const subjectMap = new Map(documentSubjects.map((subject) => [subject.id, subject]));

  const queryTab = context.query?.get?.("tab");
  let activeTab = queryTab === "documents" || queryTab === "docs"
    ? "documents"
    : queryTab === "subjects"
      ? "subjects"
      : subjects.length || !documents.length
        ? "subjects"
        : "documents";
  let disposed = false;
  const subjectItems = [...subjects];
  const documentItems = [...documents];

  const updateProfileBookmarks = (key, add) => {
    if (!state.profile) return;
    const current = Array.isArray(state.profile.bookmarks) ? [...state.profile.bookmarks] : [];
    state.profile.bookmarks = add
      ? [...new Set([...current, key])]
      : current.filter((item) => item !== key);
  };

  const emptyForTab = () => {
    if (activeTab === "subjects") {
      return emptyStateHTML({
        small: true,
        icon: "bookmark",
        title: "No saved subjects yet",
        text: "Open a subject and tap the bookmark button to keep it here.",
        actions: `<a class="btn btn--primary btn--sm" href="#/library">Browse subjects</a>`,
      });
    }
    return emptyStateHTML({
      small: true,
      icon: "file-text",
      title: "No saved documents yet",
      text: "While reading a PDF, tap the bookmark icon to save it for later.",
      actions: `<a class="btn btn--primary btn--sm" href="#/library">Browse notes</a>`,
    });
  };

  const renderList = () => {
    const list = root.querySelector("#bookmarks-list");
    const count = root.querySelector("#bookmarks-count");
    if (!list) return;
    const total = subjectItems.length + documentItems.length;
    if (count) count.textContent = `${total} saved ${total === 1 ? "item" : "items"}`;
    root.querySelectorAll("[data-bookmarks-tab]").forEach((button) => {
      const selected = button.dataset.bookmarksTab === activeTab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      const tabCount = button.querySelector(".bookmarks-tab__count");
      if (tabCount) tabCount.textContent = String(button.dataset.bookmarksTab === "subjects" ? subjectItems.length : documentItems.length);
    });
    if (!total) {
      list.innerHTML = emptyStateHTML({
        icon: "bookmark",
        title: "Nothing saved yet",
        text: "Bookmark a subject or a PDF while you study and it will be waiting here.",
        actions: `<a class="btn btn--primary" href="#/library">Find your notes</a>`,
      });
      return;
    }
    if (activeTab === "subjects") {
      list.innerHTML = subjectItems.length
        ? `<div class="bookmark-list">${subjectItems.map(subjectBookmarkHTML).join("")}</div>`
        : emptyForTab();
    } else {
      list.innerHTML = documentItems.length
        ? `<div class="bookmark-list">${documentItems.map((document) => documentBookmarkHTML(document, subjectMap.get(document.subjectId))).join("")}</div>`
        : emptyForTab();
    }
    bindRemoveButtons();
  };

  const bindRemoveButtons = () => {
    root.querySelectorAll("[data-remove-bookmark]").forEach((button) => {
      button.addEventListener("click", async () => {
        const key = button.dataset.removeBookmark;
        const kind = button.dataset.bookmarkKind;
        if (!key || button.disabled) return;
        button.disabled = true;
        const collection = kind === "subject" ? subjectItems : documentItems;
        const id = key.startsWith("subject:") ? key.slice(8) : key.slice(4);
        const index = collection.findIndex((item) => item.id === id);
        const removed = index >= 0 ? collection[index] : null;
        try {
          const nowSaved = await toggleBookmark(state.profile.uid, key);
          if (nowSaved) throw new Error("This bookmark could not be removed.");
          updateProfileBookmarks(key, false);
          if (index >= 0) collection.splice(index, 1);
          renderList();
          if (removed) {
            toast(kind === "subject" ? "Subject removed from bookmarks." : "Document removed from bookmarks.", {
              type: "success",
              actionLabel: "Undo",
              duration: 6500,
              onAction: async () => {
                try {
                  await toggleBookmark(state.profile.uid, key);
                  updateProfileBookmarks(key, true);
                  if (!collection.some((item) => item.id === id)) collection.splice(Math.min(index, collection.length), 0, removed);
                  if (!disposed && root.querySelector("#bookmarks-list")) renderList();
                  toast("Bookmark restored.", { type: "success" });
                } catch (error) {
                  toast(error?.message || "Bookmark could not be restored.", { type: "error" });
                }
              },
            });
          }
        } catch (error) {
          button.disabled = false;
          toast(error?.message || "Bookmark could not be removed.", { type: "error" });
        }
      });
    });
  };

  root.innerHTML = `<div class="page page--compact bookmarks-page">
    <header class="bookmarks-heading">
      <p class="home-heading__accent"><span class="dot"></span>Pick up where you left off</p>
      <h1 class="bookmarks-heading__line"><span class="light">Saved for</span><span class="strong">later.</span></h1>
    </header>

    <div class="bookmarks-toolbar">
      <span class="bookmarks-count" id="bookmarks-count"></span>
      <a class="link-btn" href="#/library">Browse library ${icon("arrow-right", "icon--sm")}</a>
    </div>

    <div class="bookmarks-tabs" role="tablist" aria-label="Bookmark type">
      <button class="bookmarks-tab ${activeTab === "subjects" ? "is-active" : ""}" type="button" role="tab" aria-selected="${activeTab === "subjects"}" data-bookmarks-tab="subjects">
        ${icon("book-open", "icon--sm")} Subjects <span class="bookmarks-tab__count">${subjectItems.length}</span>
      </button>
      <button class="bookmarks-tab ${activeTab === "documents" ? "is-active" : ""}" type="button" role="tab" aria-selected="${activeTab === "documents"}" data-bookmarks-tab="documents">
        ${icon("file-text", "icon--sm")} Documents <span class="bookmarks-tab__count">${documentItems.length}</span>
      </button>
    </div>

    <div id="bookmarks-list"></div>
    <p class="bookmark-hint">${icon("shield-check")} Saved items are private to your account.</p>
  </div>`;

  root.querySelectorAll("[data-bookmarks-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.bookmarksTab;
      try {
        history.replaceState(null, "", `#/bookmarks?tab=${activeTab}`);
      } catch {
        // The tab still works if history state is unavailable.
      }
      renderList();
    });
  });

  renderList();
  return () => {
    disposed = true;
  };
}

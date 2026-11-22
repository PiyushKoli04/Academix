import {
  adsForPlacement,
  fetchActiveAds,
  fetchDocument,
  fetchSubject,
  recordRecentlyViewed,
  toggleBookmark,
} from "../db.js";
import { getPreviewUrl, isValidDriveId } from "../drive.js";
import { setLastView, state } from "../state.js";
import {
  adStripHTML,
  escapeHtml,
  icon,
  setPageMeta,
  toast,
  typeChipHTML,
} from "../ui.js";

function backTarget(subjectId) {
  return subjectId ? `#/subject/${escapeHtml(subjectId)}` : "#/library";
}

export async function renderViewer(root, context) {
  const docId = context.docId || "";
  const fileDoc = await fetchDocument(docId);
  if (!fileDoc) {
    document.body.dataset.page = "viewer";
    root.innerHTML = `<main class="viewer-page"><div class="viewer-error">
      <div class="viewer-error__card">
        <div class="viewer-error__icon">${icon("file-warning")}</div>
        <h1 class="viewer-error__title">Document not found</h1>
        <p class="viewer-error__text">This document may have been removed or the link is incomplete.</p>
        <div class="viewer-error__actions">
          <a class="btn btn--lime btn--block" href="#/library">Back to library</a>
        </div>
      </div>
    </div></main>`;
    return () => {};
  }

  const subject = fileDoc.subjectId ? await fetchSubject(fileDoc.subjectId).catch(() => null) : null;
  const ads = state.settings?.adsEnabled ? await fetchActiveAds().catch(() => []) : [];
  if (!location.hash.startsWith(`#/viewer/${docId}`)) return () => {};

  const previewUrl = getPreviewUrl(fileDoc.driveFileId);
  if (!previewUrl || !isValidDriveId(fileDoc.driveFileId)) {
    root.innerHTML = `<main class="viewer-page"><div class="viewer-error">
      <div class="viewer-error__card">
        <div class="viewer-error__icon">${icon("alert-triangle")}</div>
        <h1 class="viewer-error__title">Preview unavailable</h1>
        <p class="viewer-error__text">This document’s Google Drive file ID is invalid. Ask your administrator to re-add the document.</p>
        <div class="viewer-error__actions">
          <a class="btn btn--lime btn--block" href="${backTarget(fileDoc.subjectId)}">Go back</a>
        </div>
      </div>
    </div></main>`;
    return () => {};
  }

  setPageMeta(fileDoc.title || "View notes", fileDoc.description || "Read notes in Academix's view-only reader.");
  const subjectName = subject?.name || "Subject";
  const bookmarks = Array.isArray(state.profile?.bookmarks) ? state.profile.bookmarks : [];
  let saved = bookmarks.includes(`doc:${fileDoc.id}`);
  const viewerAd = adsForPlacement(ads, "viewer_bottom")[0] || null;
  const reportEmail = String(state.settings?.contactEmail || "").trim();
  const reportSubject = encodeURIComponent(`Academix document report: ${fileDoc.title || "Untitled"}`);
  const reportBody = encodeURIComponent(`Document: ${fileDoc.title || "Untitled"}\nSubject: ${subjectName}\nDocument ID: ${fileDoc.id}\n\nWhat went wrong?\n`);

  root.innerHTML = `<main class="viewer-page page--viewer">
    <header class="viewer-topbar">
      <a class="viewer-topbar__back" href="${backTarget(fileDoc.subjectId)}" aria-label="Back">${icon("arrow-left")}</a>
      <div class="viewer-topbar__copy">
        <div class="viewer-topbar__eyebrow">
          <span>${escapeHtml(subject?.code || subjectName)}</span>
          <span class="viewer-topbar__view-only">${icon("shield-check")} View only</span>
        </div>
        <h1 class="viewer-topbar__title">${escapeHtml(fileDoc.title || "Untitled document")}</h1>
      </div>
      <div class="viewer-topbar__actions">
        <button class="viewer-icon-btn ${saved ? "is-saved" : ""}" type="button" id="viewer-bookmark" aria-label="${saved ? "Remove bookmark" : "Bookmark this document"}" aria-pressed="${saved}">${icon("bookmark")}</button>
      </div>
    </header>

    <div class="viewer-stage" id="viewer-stage">
      <div class="viewer-frame-wrap" id="viewer-frame-wrap">
        <iframe class="viewer-frame" id="viewer-frame" src="${escapeHtml(previewUrl)}" title="${escapeHtml(fileDoc.title || "PDF preview")}" loading="eager" referrerpolicy="no-referrer" allow="autoplay"></iframe>
        <div class="viewer-popout-shield" aria-hidden="true"></div>
      </div>
      <div class="viewer-loading" id="viewer-loading" role="status">
        <span class="viewer-loading__spinner" aria-hidden="true"></span>
        <span class="viewer-loading__label">Opening your notes…</span>
      </div>
      <div class="viewer-error" id="viewer-error" hidden>
        <div class="viewer-error__card">
          <div class="viewer-error__icon">${icon("alert-triangle")}</div>
          <h2 class="viewer-error__title">This PDF didn’t open</h2>
          <p class="viewer-error__text">Check your connection and try again. If it still won’t load, report it so your admin can fix the file.</p>
          <div class="viewer-error__actions">
            <button class="btn btn--lime btn--block" type="button" id="viewer-retry">${icon("refresh")} Try again</button>
            <a class="btn btn--block viewer-back-btn" href="${backTarget(fileDoc.subjectId)}">Back to subject</a>
            <button class="viewer-report-link" type="button" id="viewer-report">Report a problem</button>
          </div>
        </div>
      </div>
    </div>

    <footer class="viewer-footer">
      ${viewerAd ? adStripHTML(viewerAd) : `<div class="viewer-footer__note">${icon("shield-check")} <span>${typeChipHTML(fileDoc.type)} ${escapeHtml(fileDoc.title || "")} · View only, no downloads.</span></div>`}
    </footer>
  </main>`;

  const iframe = root.querySelector("#viewer-frame");
  const loading = root.querySelector("#viewer-loading");
  const errorPanel = root.querySelector("#viewer-error");
  const bookmarkButton = root.querySelector("#viewer-bookmark");
  let loadTimer = null;
  let disposed = false;

  const hideLoading = () => {
    window.clearTimeout(loadTimer);
    loading?.classList.add("is-hidden");
  };

  const showError = () => {
    if (disposed) return;
    window.clearTimeout(loadTimer);
    loading?.classList.add("is-hidden");
    if (errorPanel) errorPanel.hidden = false;
  };

  const beginLoad = () => {
    if (disposed || !iframe) return;
    if (errorPanel) errorPanel.hidden = true;
    loading?.classList.remove("is-hidden");
    iframe.src = previewUrl;
    window.clearTimeout(loadTimer);
    loadTimer = window.setTimeout(showError, 18000);
  };

  iframe?.addEventListener("load", hideLoading);
  beginLoad();

  root.querySelector("#viewer-retry")?.addEventListener("click", beginLoad);
  root.querySelector("#viewer-report")?.addEventListener("click", () => {
    if (!reportEmail) {
      toast("Reporting is not set up yet. Ask your admin for help.", { type: "info" });
      return;
    }
    window.location.href = `mailto:${reportEmail}?subject=${reportSubject}&body=${reportBody}`;
  });

  bookmarkButton?.addEventListener("click", async () => {
    bookmarkButton.disabled = true;
    try {
      const result = await toggleBookmark(state.profile.uid, `doc:${fileDoc.id}`);
      saved = result;
      const current = Array.isArray(state.profile.bookmarks) ? [...state.profile.bookmarks] : [];
      state.profile.bookmarks = result
        ? [...new Set([...current, `doc:${fileDoc.id}`])]
        : current.filter((key) => key !== `doc:${fileDoc.id}`);
      bookmarkButton.classList.toggle("is-saved", saved);
      bookmarkButton.setAttribute("aria-pressed", String(saved));
      bookmarkButton.setAttribute("aria-label", saved ? "Remove bookmark" : "Bookmark this document");
      toast(saved ? "Document saved to bookmarks." : "Document removed from bookmarks.", { type: "success" });
    } catch (error) {
      toast(error?.message || "Bookmark could not be updated.", { type: "error" });
    } finally {
      bookmarkButton.disabled = false;
    }
  });

  const preventContextMenu = (event) => event.preventDefault();
  const preventShortcut = (event) => {
    const key = String(event.key || "").toLowerCase();
    if ((event.ctrlKey || event.metaKey) && ["p", "s"].includes(key)) {
      event.preventDefault();
      toast("Printing and saving are disabled in the viewer.", { type: "info" });
    }
  };
  const hideBeforePrint = () => {
    if (iframe) iframe.style.visibility = "hidden";
  };
  const restoreAfterPrint = () => {
    if (iframe) iframe.style.visibility = "";
  };

  root.addEventListener("contextmenu", preventContextMenu);
  document.addEventListener("keydown", preventShortcut);
  window.addEventListener("beforeprint", hideBeforePrint);
  window.addEventListener("afterprint", restoreAfterPrint);

  const viewedAt = new Date();
  setLastView({
    subjectId: fileDoc.subjectId || "",
    subjectName,
    docId: fileDoc.id,
    title: fileDoc.title || "Untitled document",
    type: fileDoc.type || "other",
    viewedAt: viewedAt.toISOString(),
  });
  const localEntry = {
    subjectId: fileDoc.subjectId || "",
    docId: fileDoc.id,
    title: fileDoc.title || "Untitled document",
    type: fileDoc.type || "other",
    viewedAt,
  };
  if (state.profile) {
    const current = Array.isArray(state.profile.recentlyViewed) ? state.profile.recentlyViewed : [];
    state.profile.recentlyViewed = [localEntry, ...current.filter((entry) => !(entry.subjectId === localEntry.subjectId && entry.docId === localEntry.docId))].slice(0, 12);
  }
  recordRecentlyViewed(state.profile.uid, localEntry).catch(() => {});

  return () => {
    disposed = true;
    window.clearTimeout(loadTimer);
    root.removeEventListener("contextmenu", preventContextMenu);
    document.removeEventListener("keydown", preventShortcut);
    window.removeEventListener("beforeprint", hideBeforePrint);
    window.removeEventListener("afterprint", restoreAfterPrint);
    if (iframe) iframe.src = "about:blank";
  };
}

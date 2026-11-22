import {
  adsForPlacement,
  fetchActiveAds,
  fetchActivityForSubject,
  fetchDocumentsForSubject,
  fetchSubject,
  recordSubjectView,
  setCompletedModules,
  toggleBookmark,
} from "../db.js";
import { state } from "../state.js";
import {
  DOC_TYPE_META,
  adCardHTML,
  avatarHTML,
  copyText,
  emptyStateHTML,
  escapeHtml,
  formatDate,
  icon,
  relativeTime,
  safeColor,
  safeHttpUrl,
  setPageMeta,
  toast,
  typeChipHTML,
} from "../ui.js";

function mainDocMeta(document) {
  if (!document) return "";
  const bits = ["PDF"];
  if (Number(document.pages) > 0) bits.push(`${document.pages} pages`);
  if (document.sizeLabel) bits.push(document.sizeLabel);
  if (document.updatedAt || document.createdAt) bits.push(`Updated ${relativeTime(document.updatedAt || document.createdAt)}`);
  return bits.join(" · ");
}

function helpingRowHTML(document) {
  const meta = DOC_TYPE_META[document.type] || DOC_TYPE_META.other;
  const details = [
    Number(document.pages) > 0 ? `${document.pages} pages` : "",
    document.sizeLabel || "",
    document.updatedAt || document.createdAt ? relativeTime(document.updatedAt || document.createdAt) : "",
  ].filter(Boolean).join(" · ");
  return `<a class="helping-row" href="#/viewer/${escapeHtml(document.id)}" data-doc-type="${escapeHtml(document.type || "other")}">
    <span class="helping-row__icon helping-row__icon--${escapeHtml(document.type || "other")}">${icon(meta.icon)}</span>
    <span class="helping-row__copy">
      <span class="helping-row__title">${escapeHtml(document.title || meta.label)}</span>
      <span class="helping-row__meta">${typeChipHTML(document.type)}<span class="text-hint" style="font-size:9px">${escapeHtml(details || "Ready to view")}</span></span>
    </span>
    <span class="helping-row__view">View</span>
  </a>`;
}

function activityItemHTML(activity) {
  const iconName = activity.type === "document_deleted"
    ? "trash"
    : activity.type === "document_updated"
      ? "edit"
      : "file-plus";
  return `<div class="activity-feed__item">
    <span class="activity-feed__dot">${icon(iconName, "icon--xs")}</span>
    <div class="activity-feed__copy">
      <p class="activity-feed__text">${escapeHtml(activity.message || "Subject activity")}</p>
      <p class="activity-feed__time">${escapeHtml(relativeTime(activity.createdAt))}</p>
    </div>
  </div>`;
}

export async function renderSubject(root, context) {
  const subjectId = context.subjectId || "";
  if (!subjectId) {
    root.innerHTML = `<div class="page page--compact">${emptyStateHTML({
      icon: "book-open",
      title: "Subject not found",
      text: "That link doesn’t point to a subject anymore.",
      actions: `<a class="btn btn--primary btn--sm" href="#/library">Back to library</a>`,
    })}</div>`;
    return () => {};
  }

  const subject = await fetchSubject(subjectId);
  if (!subject) {
    root.innerHTML = `<div class="page page--compact">${emptyStateHTML({
      icon: "book-open",
      title: "Subject not found",
      text: "This subject may have been removed by an administrator.",
      actions: `<a class="btn btn--primary btn--sm" href="#/library">Back to library</a>`,
    })}</div>`;
    return () => {};
  }

  const [documents, activity, ads] = await Promise.all([
    fetchDocumentsForSubject(subjectId),
    fetchActivityForSubject(subjectId).catch(() => []),
    state.settings?.adsEnabled ? fetchActiveAds().catch(() => []) : Promise.resolve([]),
  ]);
  if (!location.hash.startsWith(`#/subject/${subjectId}`)) return () => {};

  setPageMeta(subject.name || "Subject", subject.description || `View ${subject.name || "subject"} notes on Academix.`);

  const year = state.years.find((item) => item.id === subject.yearId);
  const branches = state.branches.filter((branch) => (subject.branchIds || []).includes(branch.id));
  const modules = Array.isArray(subject.modules) ? subject.modules : [];
  const mainDocument = documents.find((document) => document.isMain) || documents.find((document) => document.type === "main") || null;
  const helpingDocuments = documents.filter((document) => document.id !== mainDocument?.id);
  const bookmarks = Array.isArray(state.profile?.bookmarks) ? state.profile.bookmarks : [];
  let saved = bookmarks.includes(`subject:${subject.id}`);
  const completed = Array.isArray(state.profile?.completedModules?.[subject.id])
    ? state.profile.completedModules[subject.id].filter((index) => Number.isInteger(Number(index)))
    : [];
  const completedSet = new Set(completed.map(Number));
  const subjectContributors = state.contributors.filter((person) => {
    return documents.some((document) => document.contributorId && document.contributorId === person.id);
  });
  const contributors = (subjectContributors.length ? subjectContributors : state.contributors).slice(0, 3);
  const adsForSubject = adsForPlacement(ads, "subject_footer");
  const typesPresent = [...new Set(helpingDocuments.map((document) => document.type || "other"))];
  const mainMeta = mainDocMeta(mainDocument);

  root.innerHTML = `<div class="page subject-page">
    <div class="detail-shell">
      <div class="detail-topbar">
        <a class="icon-btn" href="#/library" aria-label="Back to library">${icon("arrow-left")}</a>
        <p class="detail-topbar__title">Subject</p>
        <button class="icon-btn ${saved ? "icon-btn--lime" : ""}" type="button" id="subject-bookmark" aria-label="${saved ? "Remove bookmark" : "Bookmark this subject"}" aria-pressed="${saved}">${icon("bookmark")}</button>
      </div>

      <div class="detail-grid">
        <div class="detail-main">
          <header class="subject-detail-head">
            <span class="subject-detail-head__icon" style="--subject-color:${safeColor(subject.color)}">${icon(subject.icon || "book-open")}</span>
            <div class="subject-detail-head__copy">
              <div class="subject-detail-head__eyebrow">
                <span class="subject-detail-head__code">${escapeHtml(subject.code || "SUBJECT")}<button type="button" data-copy-code aria-label="Copy subject code">${icon("copy", "icon--xs")}</button></span>
                <span class="dot" style="background:${safeColor(subject.color)}"></span>
                <span class="text-hint" style="font-size:9.5px">${escapeHtml(year?.name || "Year")} · Sem ${escapeHtml(subject.semester || "")}</span>
              </div>
              <h1 class="subject-detail-head__title">${escapeHtml(subject.name || "Untitled subject")}</h1>
              ${subject.description ? `<p class="subject-detail-head__desc">${escapeHtml(subject.description)}</p>` : ""}
            </div>
          </header>

          <div class="subject-branch-chips">
            ${branches.map((branch) => `<span class="chip chip--muted">${escapeHtml(branch.shortName || branch.name)}</span>`).join("")}
            <span class="chip chip--muted">${modules.length} modules</span>
            <span class="chip chip--muted">${documents.length} documents</span>
          </div>

          <div class="open-notes-wrap">
            ${mainDocument ? `<a class="open-notes-btn" href="#/viewer/${escapeHtml(mainDocument.id)}">
              <span class="open-notes-btn__left">
                <span class="open-notes-btn__icon">${icon("book-open")}</span>
                <span>
                  <span class="open-notes-btn__label">Open main notes</span>
                  <span class="open-notes-btn__sub">${escapeHtml(mainMeta || "Main PDF")}</span>
                </span>
              </span>
              <span class="open-notes-btn__arrow">${icon("arrow-right")}</span>
            </a>` : `<button class="open-notes-btn" type="button" disabled>
              <span class="open-notes-btn__left">
                <span class="open-notes-btn__icon">${icon("file-warning")}</span>
                <span>
                  <span class="open-notes-btn__label">Main notes coming soon</span>
                  <span class="open-notes-btn__sub">Your admin is still adding the main PDF for this subject.</span>
                </span>
              </span>
              <span class="open-notes-btn__arrow">${icon("clock")}</span>
            </button>`}
          </div>

          <section class="subject-section">
            <div class="detail-section-title">
              <h2>Helping documents</h2>
              <span class="detail-section-title__meta">${helpingDocuments.length} ${helpingDocuments.length === 1 ? "resource" : "resources"}</span>
            </div>
            ${helpingDocuments.length ? `
              <div class="chip-row no-scrollbar" id="doc-type-filters" role="group" aria-label="Filter document types">
                <button class="chip chip--interactive is-active" type="button" data-doc-filter="all">All</button>
                ${typesPresent.map((type) => `<button class="chip chip--interactive" type="button" data-doc-filter="${escapeHtml(type)}">${escapeHtml(DOC_TYPE_META[type]?.short || "Other")}</button>`).join("")}
              </div>
              <div class="helping-card" id="helping-list">${helpingDocuments.map(helpingRowHTML).join("")}</div>
            ` : `<div class="no-main-doc">${icon("info")} No PYQs or supporting documents have been added for this subject yet.</div>`}
          </section>

          <section class="subject-section">
            <div class="detail-section-title">
              <h2>Module tracker</h2>
              <span class="detail-section-title__meta" id="module-progress-label">${completedSet.size}/${modules.length} done</span>
            </div>
            ${modules.length ? `<div class="module-progress"><span id="module-progress-bar" style="width:${modules.length ? Math.round((completedSet.size / modules.length) * 100) : 0}%"></span></div>
            <div class="module-list" id="module-list">
              ${modules.map((module, index) => `<label class="module-row">
                <input type="checkbox" data-module-index="${index}" ${completedSet.has(index) ? "checked" : ""} />
                <span class="module-row__check">${icon("check")}</span>
                <span class="module-row__copy">
                  <span class="module-row__title">${escapeHtml(module.name || `Module ${index + 1}`)}</span>
                  <span class="module-row__meta">Module ${index + 1}</span>
                </span>
              </label>`).join("")}
            </div>` : `<div class="no-main-doc">${icon("list-tree")} The module list for this subject hasn’t been added yet.</div>`}
          </section>

          ${adsForSubject.length ? `<div class="subject-ad">${adCardHTML(adsForSubject[0], "wide")}</div>` : ""}
        </div>

        <aside class="detail-aside">
          <section class="doc-details-panel">
            <div class="doc-details-panel__head">
              <h2>Subject details</h2>
              <span class="type-chip type-chip--main">${escapeHtml(subject.code || "Subject")}</span>
            </div>
            <div class="inner-card kv-list">
              <div class="kv-row"><span class="kv-row__label">Year</span><span class="kv-row__value">${escapeHtml(year?.name || "—")}</span></div>
              <div class="kv-row"><span class="kv-row__label">Semester</span><span class="kv-row__value">Sem ${escapeHtml(subject.semester || "—")}</span></div>
              <div class="kv-row"><span class="kv-row__label">Branches</span><span class="kv-row__value">${escapeHtml(branches.map((branch) => branch.shortName || branch.name).join(", ") || "All")}</span></div>
              <div class="kv-row"><span class="kv-row__label">Modules</span><span class="kv-row__value">${modules.length}</span></div>
              <div class="kv-row"><span class="kv-row__label">Documents</span><span class="kv-row__value">${documents.length}</span></div>
              <div class="kv-row"><span class="kv-row__label">Last updated</span><span class="kv-row__value">${escapeHtml(formatDate(subject.updatedAt || subject.createdAt))}</span></div>
            </div>
          </section>

          <section class="contributor-card">
            <div class="contributor-card__head">
              <h2 class="contributor-card__title">Notes from</h2>
              <a class="link-btn" href="#/about">All credits ${icon("arrow-right", "icon--sm")}</a>
            </div>
            ${contributors.length ? `<div class="aside-contributors">
              ${contributors.map((person) => {
                const link = safeHttpUrl(person.link);
                return `<div class="contributor-row">
                  ${avatarHTML(person, { size: "sm" })}
                  <div class="contributor-row__copy">
                    <p class="contributor-row__name">${escapeHtml(person.name || "Contributor")}</p>
                    <p class="contributor-row__role">${escapeHtml(person.role || "Notes contributor")}</p>
                  </div>
                  ${link ? `<a class="contributor-tile__link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(person.name || "contributor")} profile">${icon("arrow-up-right", "icon--sm")}</a>` : ""}
                </div>`;
              }).join("")}
            </div>` : `<p class="text-secondary" style="font-size:10.5px">Contributor credits will appear here.</p>`}
          </section>

          <section class="contributor-card">
            <div class="contributor-card__head">
              <h2 class="contributor-card__title">Recent updates</h2>
              <span class="detail-section-title__meta">${activity.length}</span>
            </div>
            ${activity.length ? `<div class="activity-feed">${activity.slice(0, 5).map(activityItemHTML).join("")}</div>` : `<p class="text-secondary" style="font-size:10.5px">No recent activity for this subject.</p>`}
          </section>

          <div class="subject-view-note">${icon("shield-check")} <span>View only. Downloads are disabled to respect contributor work.</span></div>
        </aside>
      </div>
    </div>
  </div>`;

  recordSubjectView(subject.id);

  root.querySelector("[data-copy-code]")?.addEventListener("click", () => {
    copyText(subject.code || "", "Subject code copied.");
  });

  const bookmarkButton = root.querySelector("#subject-bookmark");
  bookmarkButton?.addEventListener("click", async () => {
    const next = !saved;
    bookmarkButton.disabled = true;
    try {
      const result = await toggleBookmark(state.profile.uid, `subject:${subject.id}`);
      saved = result;
      const current = Array.isArray(state.profile.bookmarks) ? [...state.profile.bookmarks] : [];
      state.profile.bookmarks = result
        ? [...new Set([...current, `subject:${subject.id}`])]
        : current.filter((key) => key !== `subject:${subject.id}`);
      bookmarkButton.classList.toggle("icon-btn--lime", saved);
      bookmarkButton.setAttribute("aria-pressed", String(saved));
      bookmarkButton.setAttribute("aria-label", saved ? "Remove bookmark" : "Bookmark this subject");
      toast(saved ? "Subject saved to bookmarks." : "Subject removed from bookmarks.", { type: "success" });
    } catch (error) {
      toast(error?.message || "Bookmark could not be updated.", { type: "error" });
    } finally {
      bookmarkButton.disabled = false;
      if (saved !== next) {
        bookmarkButton.classList.toggle("icon-btn--lime", saved);
      }
    }
  });

  const filterRow = root.querySelector("#doc-type-filters");
  const helpingList = root.querySelector("#helping-list");
  filterRow?.querySelectorAll("[data-doc-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      filterRow.querySelectorAll("[data-doc-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
      const type = button.dataset.docFilter;
      helpingList?.querySelectorAll("[data-doc-type]").forEach((row) => {
        row.hidden = type !== "all" && row.dataset.docType !== type;
      });
    });
  });

  const moduleList = root.querySelector("#module-list");
  const progressLabel = root.querySelector("#module-progress-label");
  const progressBar = root.querySelector("#module-progress-bar");
  let saveQueue = Promise.resolve();

  const updateModuleProgress = () => {
    if (!moduleList) return;
    const values = [...moduleList.querySelectorAll("input:checked")].map((input) => Number(input.dataset.moduleIndex));
    if (progressLabel) progressLabel.textContent = `${values.length}/${modules.length} done`;
    if (progressBar) progressBar.style.width = `${modules.length ? Math.round((values.length / modules.length) * 100) : 0}%`;
    if (state.profile) {
      state.profile.completedModules = { ...(state.profile.completedModules || {}), [subject.id]: values };
    }
    saveQueue = saveQueue
      .catch(() => {})
      .then(() => setCompletedModules(state.profile.uid, subject.id, values))
      .catch((error) => {
        toast(error?.message || "Module progress couldn’t be saved.", { type: "error" });
      });
  };

  moduleList?.querySelectorAll("input[data-module-index]").forEach((input) => {
    input.addEventListener("change", updateModuleProgress);
  });

  return () => {};
}

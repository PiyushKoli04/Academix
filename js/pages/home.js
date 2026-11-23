import {
  adsForPlacement,
  fetchActiveAds,
  fetchDocumentsForSubjects,
  fetchSubjectsFor,
  searchCatalog,
} from "../db.js";
import { getEffectiveSelection, state } from "../state.js";
import {
  DOC_TYPE_META,
  adCardHTML,
  avatarHTML,
  debounce,
  emptyStateHTML,
  escapeHtml,
  formatNumber,
  icon,
  relativeTime,
  safeColor,
  setPageMeta,
  typeChipHTML,
} from "../ui.js";

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function subjectCardHTML(subject, docCount) {
  return `<a class="subject-card" href="#/subject/${escapeHtml(subject.id)}" style="--subject-color:${safeColor(subject.color)}">
    <span class="subject-card__top">
      <span class="subject-card__tag"><span class="dot" style="background:${safeColor(subject.color)}"></span>${escapeHtml(subject.code || "Subject")}</span>
      <span class="subject-card__code">Sem ${escapeHtml(subject.semester || "")}</span>
    </span>
    <span class="subject-card__icon" style="background:${safeColor(subject.color)}">${icon(subject.icon || "book-open")}</span>
    <span class="subject-card__title">${escapeHtml(subject.name || "Untitled subject")}</span>
    <span class="subject-card__meta">${(subject.modules || []).length} modules${subject.description ? ` · ${escapeHtml(subject.description)}` : ""}</span>
    <span class="subject-card__bottom">
      <span class="subject-card__docs">${docCount} ${docCount === 1 ? "document" : "documents"}</span>
      <span class="subject-card__open">${icon("arrow-right")}</span>
    </span>
  </a>`;
}

function recentItemHTML(entry) {
  const hasDoc = Boolean(entry.docId);
  const href = hasDoc ? `#/viewer/${escapeHtml(entry.docId)}` : `#/subject/${escapeHtml(entry.subjectId)}`;
  const typeMeta = DOC_TYPE_META[entry.type] || DOC_TYPE_META.other;
  return `<a class="recent-item" href="${href}">
    <span class="recent-item__icon recent-item__icon--lime">${icon(hasDoc ? "file-text" : "book-open")}</span>
    <span class="recent-item__copy">
      <span class="recent-item__title">${escapeHtml(entry.title || "Study notes")}</span>
      <span class="recent-item__meta">${hasDoc ? escapeHtml(typeMeta.short) : "Subject"}${entry.subjectName ? ` · ${escapeHtml(entry.subjectName)}` : ""}</span>
    </span>
    <span class="recent-item__time">${escapeHtml(relativeTime(entry.viewedAt))}</span>
  </a>`;
}

export async function renderHome(root) {
  const selection = getEffectiveSelection();
  const year = state.years.find((item) => item.id === selection.yearId);
  const yearName = year?.name || "Your year";
  const profile = state.profile || {};
  const firstName = String(profile.name || "Student").trim().split(/\s+/)[0];
  const bookmarks = Array.isArray(profile.bookmarks) ? profile.bookmarks : [];
  const recents = Array.isArray(profile.recentlyViewed) ? profile.recentlyViewed : [];
  const lastView = state.lastView;
  const continueEntry = lastView?.docId ? lastView : recents.find((entry) => entry?.docId) || lastView || null;

  setPageMeta("Home", "Your semester notes, sorted by year, semester, and branch.");

  const [allSubjects, ads] = await Promise.all([
    fetchSubjectsFor(selection.yearId, selection.semester),
    state.settings?.adsEnabled ? fetchActiveAds().catch(() => []) : Promise.resolve([]),
  ]);
  const subjects = selection.branchId && selection.branchId !== "all"
    ? allSubjects.filter((subject) => (subject.branchIds || []).includes(selection.branchId))
    : allSubjects;
  const documents = await fetchDocumentsForSubjects(subjects.map((subject) => subject.id));
  const docsBySubject = new Map();
  documents.forEach((document) => {
    const list = docsBySubject.get(document.subjectId) || [];
    list.push(document);
    docsBySubject.set(document.subjectId, list);
  });

  const completedModules = profile.completedModules && typeof profile.completedModules === "object" ? profile.completedModules : {};
  let moduleTotal = 0;
  let moduleDone = 0;
  subjects.forEach((subject) => {
    const total = Array.isArray(subject.modules) ? subject.modules.length : 0;
    moduleTotal += total;
    const done = Array.isArray(completedModules[subject.id]) ? completedModules[subject.id].filter((index) => index < total).length : 0;
    moduleDone += done;
  });
  const progress = moduleTotal ? Math.round((moduleDone / moduleTotal) * 100) : 0;
  const circumference = 301.6;
  const homeAds = adsForPlacement(ads, "home_banner");
  const listAds = adsForPlacement(ads, "between_lists");
  const announcement = String(state.settings?.announcement || "").trim();

  root.innerHTML = `<div class="page home-page">
    <div class="greeting home-greeting">
      <div class="greeting__identity">
        <a class="greeting__avatar" href="#/profile" aria-label="Open your profile">${avatarHTML(profile, { size: "lg" })}</a>
        <div class="greeting__copy">
          <p class="greeting__hello">${escapeHtml(greetingForHour(new Date().getHours()))}</p>
          <p class="greeting__name">${escapeHtml(firstName)}</p>
          <p class="greeting__meta">${icon("calendar", "icon--xs")} ${escapeHtml(yearName)} · Sem ${escapeHtml(selection.semester)}</p>
        </div>
      </div>
      <div class="greeting__actions">
        <a class="icon-btn" href="#/bookmarks" aria-label="Open bookmarks">${icon("bookmark")}</a>
      </div>
    </div>

    <header class="home-heading">
      <p class="home-heading__accent"><span class="dot"></span>Your semester, sorted.</p>
      <h1 class="home-heading__line"><span class="light">Everything you</span><span class="strong">need to ace.</span></h1>
    </header>

    <form class="home-search" role="search" id="home-search" autocomplete="off">
      <div class="search-shell">
        <span class="search-shell__icon">${icon("search")}</span>
        <input class="search-shell__input" id="home-search-input" type="search" placeholder="Search subjects, modules, documents…" aria-label="Search your notes" enterkeyhint="search" />
        <button class="search-shell__clear" type="button" id="home-search-clear" aria-label="Clear search" hidden>${icon("x", "icon--sm")}</button>
      </div>
      <div class="search-results" id="home-search-results" hidden></div>
    </form>

    <div class="home-grid">
      <div class="home-grid__main">
        ${continueEntry ? `<a class="continue-card" href="${continueEntry.docId ? `#/viewer/${escapeHtml(continueEntry.docId)}` : `#/subject/${escapeHtml(continueEntry.subjectId || "")}`}">
          <span class="continue-card__icon">${icon("play")}</span>
          <span class="continue-card__copy">
            <span class="continue-card__label">Continue reading</span>
            <span class="continue-card__title">${escapeHtml(continueEntry.title || "Pick up where you left off")}</span>
            <span class="continue-card__meta">${escapeHtml(continueEntry.type ? (DOC_TYPE_META[continueEntry.type]?.short || "Document") : "Subject notes")}</span>
          </span>
          <span class="continue-card__arrow">${icon("arrow-right")}</span>
        </a>` : ""}

        <section class="hero-card" aria-label="Your semester progress">
          <div class="hero-card__top">
            <div>
              <p class="hero-card__eyebrow"><span class="dot"></span>${escapeHtml(yearName)} · Semester ${escapeHtml(selection.semester)}</p>
              <h2 class="hero-card__title"><span class="fw-light">You’re</span> <strong>${progress}% through</strong><br />your module list.</h2>
            </div>
            <span class="hero-card__pill">${icon("layers", "icon--xs")} ${moduleDone}/${moduleTotal || 0} modules</span>
          </div>
          <div class="hero-card__body">
            <div class="progress-ring" style="--ring-progress:${progress / 100};--ring-circumference:${circumference}">
              <svg viewBox="0 0 112 112" aria-hidden="true">
                <circle class="progress-ring__track" cx="56" cy="56" r="48"></circle>
                <circle class="progress-ring__value" cx="56" cy="56" r="48"></circle>
              </svg>
              <div class="progress-ring__center">
                <span class="progress-ring__value-text">${progress}<small>%</small></span>
                <span class="progress-ring__label">Module progress</span>
              </div>
            </div>
            <div class="hero-stats">
              <div class="hero-stat">
                <span class="hero-stat__icon">${icon("book-open")}</span>
                <span class="hero-stat__copy"><span class="hero-stat__label">Subjects</span><span class="hero-stat__value">${formatNumber(subjects.length)}</span></span>
              </div>
              <div class="hero-stat">
                <span class="hero-stat__icon">${icon("file-text")}</span>
                <span class="hero-stat__copy"><span class="hero-stat__label">Documents</span><span class="hero-stat__value">${formatNumber(documents.length)}</span></span>
              </div>
              <div class="hero-stat">
                <span class="hero-stat__icon">${icon("bookmark")}</span>
                <span class="hero-stat__copy"><span class="hero-stat__label">Bookmarks</span><span class="hero-stat__value">${formatNumber(bookmarks.length)}</span></span>
              </div>
            </div>
          </div>
          <div class="hero-card__foot">
            <span>Keep your streak going. <strong>One module at a time.</strong></span>
            <a class="link-btn" href="#/library" style="color:var(--lime)">Library ${icon("arrow-right", "icon--sm")}</a>
          </div>
        </section>

        ${homeAds.length ? `<div class="ad-banner-stack">${homeAds.slice(0, 2).map((ad) => adCardHTML(ad, "wide")).join("")}</div>` : ""}

        <section class="section">
          <div class="section__head">
            <div>
              <h2 class="section__title">Jump back in</h2>
              <p class="section__subtitle">Your current semester at a glance.</p>
            </div>
            <a class="section__link" href="#/library">See all ${icon("chevron-right", "icon--sm")}</a>
          </div>
          ${subjects.length ? `<div class="subject-scroller no-scrollbar">
            ${subjects.map((subject) => subjectCardHTML(subject, (docsBySubject.get(subject.id) || []).length)).join("")}
          </div>` : emptyStateHTML({
            small: true,
            icon: "book-open",
            title: "No subjects yet",
            text: state.profile?.role === "admin" ? "Add subjects from the admin structure page to fill this semester." : "Your admin is still adding subjects for this semester. Check back soon.",
            actions: state.profile?.role === "admin" ? `<a class="btn btn--primary btn--sm" href="#/admin/structure">Add subjects</a>` : `<a class="btn btn--white btn--sm" href="#/library">Open library</a>`,
          })}
        </section>

        ${listAds.length ? `<div class="ad-banner-stack">${listAds.slice(0, 1).map((ad) => adCardHTML(ad, "wide")).join("")}</div>` : ""}

        <section class="recent-panel">
          <div class="recent-panel__head">
            <h2 class="recent-panel__title">Recently viewed</h2>
            <a class="link-btn" href="#/library">Browse notes ${icon("arrow-right", "icon--sm")}</a>
          </div>
          ${recents.length ? `<div class="recent-list">${recents.slice(0, 5).map(recentItemHTML).join("")}</div>` : `<div class="empty-mini">
            <span class="empty-mini__icon">${icon("history")}</span>
            <p class="empty-mini__title">Nothing opened yet</p>
            <p class="empty-mini__text">Documents you view will show up here for a quick return.</p>
          </div>`}
        </section>
      </div>

      <aside class="home-grid__aside">
        ${announcement ? `<div class="announcement-card">
          <span class="announcement-card__icon">${icon("megaphone")}</span>
          <div>
            <p class="announcement-card__label">From your admin</p>
            <p class="announcement-card__text">${escapeHtml(announcement)}</p>
          </div>
        </div>` : ""}

        <section class="home-side-card">
          <h2 class="home-side-card__title">Find your notes faster</h2>
          <p class="home-side-card__text">Pick your year, semester, and branch once. Academix remembers it for next time.</p>
          <div class="home-side-card__row">
            <a class="btn btn--primary btn--sm" href="#/library">${icon("library")} Open library</a>
          </div>
        </section>

        ${adsForPlacement(ads, "subject_footer").length ? adCardHTML(adsForPlacement(ads, "subject_footer")[0], "card") : ""}

        <section class="home-side-card">
          <div class="recent-panel__head">
            <h2 class="home-side-card__title">Made with notes from</h2>
            <a class="link-btn" href="#/about">Credits ${icon("arrow-right", "icon--sm")}</a>
          </div>
          ${state.contributors.length ? `<div class="aside-contributors">
            ${state.contributors.slice(0, 3).map((person) => `<div class="contributor-row">
              ${avatarHTML(person, { size: "sm" })}
              <div class="contributor-row__copy">
                <p class="contributor-row__name">${escapeHtml(person.name || "Contributor")}</p>
                <p class="contributor-row__role">${escapeHtml(person.role || "Notes contributor")}</p>
              </div>
            </div>`).join("")}
          </div>` : `<p class="home-side-card__text">Contributor credits will appear here once they’re added.</p>`}
        </section>

        <section class="home-side-card study-note-card">
          <span class="study-note-card__icon">${icon("sparkles")}</span>
          <h2 class="home-side-card__title">A small study nudge</h2>
          <p class="home-side-card__text">Skim the module list before you start reading. Knowing the shape of a unit makes the details stick faster.</p>
        </section>
      </aside>
    </div>
  </div>`;

  return bindSearch(root);
}

function bindSearch(root) {
  const form = root.querySelector("#home-search");
  const input = root.querySelector("#home-search-input");
  const clear = root.querySelector("#home-search-clear");
  const results = root.querySelector("#home-search-results");
  if (!form || !input || !results) return () => {};
  let requestId = 0;

  const hideResults = () => {
    results.hidden = true;
    results.innerHTML = "";
    clear.hidden = true;
  };

  const renderResults = async () => {
    const text = input.value.trim();
    clear.hidden = !text;
    if (text.length < 2) {
      hideResults();
      return;
    }
    const currentRequest = ++requestId;
    results.hidden = false;
    results.innerHTML = `<div class="search-result"><span class="search-result__icon">${icon("search")}</span><span class="search-result__copy"><span class="search-result__title">Searching all notes…</span></span></div>`;
    try {
      const found = await searchCatalog(text);
      if (currentRequest !== requestId) return;
      const subjectItems = found.subjects.slice(0, 6).map((subject) => `<a class="search-result" href="#/subject/${escapeHtml(subject.id)}">
        <span class="search-result__icon" style="background:${safeColor(subject.color)}">${icon(subject.icon || "book-open")}</span>
        <span class="search-result__copy"><span class="search-result__title">${escapeHtml(subject.name)}</span><span class="search-result__meta">${escapeHtml(subject.code || "")} · Sem ${escapeHtml(subject.semester || "")}</span></span>
        <span class="search-result__arrow">${icon("chevron-right", "icon--sm")}</span>
      </a>`);
      const documentItems = found.documents.slice(0, 10).map((document) => {
        const typeMeta = DOC_TYPE_META[document.type] || DOC_TYPE_META.other;
        const metaParts = [];
        if (document.subjectCode || document.subjectName) metaParts.push(document.subjectCode || document.subjectName);
        if (document.subjectSemester) metaParts.push(`Sem ${document.subjectSemester}`);
        metaParts.push(typeMeta.label);
        return `<a class="search-result" href="#/viewer/${escapeHtml(document.id)}">
          <span class="search-result__icon">${icon(typeMeta.icon || "file-text")}</span>
          <span class="search-result__copy">
            <span class="search-result__title">${escapeHtml(document.title)}</span>
            <span class="search-result__meta">${escapeHtml(metaParts.join(" · "))}${document.description ? ` · ${escapeHtml(document.description)}` : ""}</span>
          </span>
          <span class="search-result__arrow">${icon("chevron-right", "icon--sm")}</span>
        </a>`;
      });
      if (!subjectItems.length && !documentItems.length) {
        results.innerHTML = `<div class="empty-mini">
          <span class="empty-mini__icon">${icon("search")}</span>
          <p class="empty-mini__title">No matches for “${escapeHtml(text)}”</p>
          <p class="empty-mini__text">Try another subject name, code, or document title.</p>
        </div>`;
        return;
      }
      results.innerHTML = `
        ${subjectItems.length ? `<div class="search-results__group"><p class="search-results__label">Subjects</p>${subjectItems.join("")}</div>` : ""}
        ${documentItems.length ? `<div class="search-results__group"><p class="search-results__label">Documents</p>${documentItems.join("")}</div>` : ""}
      `;
    } catch (error) {
      if (currentRequest !== requestId) return;
      results.innerHTML = `<div class="empty-mini">
        <span class="empty-mini__icon">${icon("alert-circle")}</span>
        <p class="empty-mini__title">Search is unavailable</p>
        <p class="empty-mini__text">${escapeHtml(error?.message || "Check your connection and try again.")}</p>
      </div>`;
    }
  };

  const doClear = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    input.value = "";
    hideResults();
    input.focus();
  };

  const debouncedSearch = debounce(renderResults, 260);
  input.addEventListener("input", debouncedSearch);
  input.addEventListener("search", () => {
    if (!input.value.trim()) hideResults();
    else renderResults();
  });
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2 && results.innerHTML) results.hidden = false;
  });
  clear.addEventListener("pointerdown", doClear);
  clear.addEventListener("click", doClear);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    renderResults();
  });
  const onDocumentClick = (event) => {
    if (!form.contains(event.target)) hideResults();
  };
  document.addEventListener("click", onDocumentClick);
  return () => {
    requestId += 1;
    document.removeEventListener("click", onDocumentClick);
  };
}

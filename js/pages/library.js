import {
  adsForPlacement,
  fetchActiveAds,
  fetchDocumentsForSubjects,
  fetchSubjectsFor,
} from "../db.js";
import {
  getEffectiveSelection,
  setSelection,
  state,
  yearLabel,
} from "../state.js";
import {
  adCardHTML,
  debounce,
  emptyStateHTML,
  escapeHtml,
  icon,
  safeColor,
  setPageMeta,
} from "../ui.js";

function subjectRowHTML(subject, documents = []) {
  const modules = Array.isArray(subject.modules) ? subject.modules.length : 0;
  const mainDocument = documents.find((document) => document.isMain);
  return `<a class="subject-row" href="#/subject/${escapeHtml(subject.id)}">
    <span class="subject-row__time" style="background:${safeColor(subject.color)}">
      ${icon(subject.icon || "book-open", "icon--sm")}
      <span>${modules ? `${modules} mod${modules === 1 ? "" : "s"}` : "No mods"}</span>
    </span>
    <span class="subject-row__copy">
      <span class="subject-row__eyebrow">${escapeHtml(subject.code || "SUBJECT")}<span class="dot" style="background:${safeColor(subject.color)}"></span>Sem ${escapeHtml(subject.semester || "")}</span>
      <span class="subject-row__title">${escapeHtml(subject.name || "Untitled subject")}</span>
      <span class="subject-row__desc">${escapeHtml(subject.description || "Open for the main notes, PYQs, and module list.")}</span>
      <span class="subject-row__meta">
        ${mainDocument ? `<span class="status-chip status-chip--new">Main notes ready</span>` : `<span class="status-chip status-chip--draft">Main notes pending</span>`}
        <span class="text-hint" style="font-size:9px">${documents.length} ${documents.length === 1 ? "document" : "documents"}</span>
      </span>
    </span>
    <span class="subject-row__right">
      <span class="subject-row__arrow">${icon("arrow-right")}</span>
    </span>
  </a>`;
}

export async function renderLibrary(root, context = {}) {
  const selection = getEffectiveSelection();
  let year = state.years.find((item) => item.id === selection.yearId);
  if (!year && state.years.length) {
    year = state.years[0];
    setSelection({ yearId: year.id, semester: year.semesters?.[0] || 1 });
  }
  const semesters = Array.isArray(year?.semesters) && year.semesters.length
    ? [...year.semesters].sort((a, b) => a - b)
    : [];
  if (!semesters.includes(Number(selection.semester)) && semesters.length) {
    setSelection({ semester: semesters[0] });
  }
  const current = getEffectiveSelection();
  const branchExists = state.branches.some((branch) => branch.id === current.branchId);
  const branchId = current.branchId === "all" || branchExists ? current.branchId : "all";
  const activeBranch = state.branches.find((branch) => branch.id === branchId);
  const activeYear = state.years.find((item) => item.id === current.yearId);

  setPageMeta(
    "Engineering Notes Library — Browse Semester-Wise Study Material & PYQs",
    "Browse unit-wise engineering notes, previous year question papers (PYQs), formula sheets, and study materials sorted by academic year, semester, and branch across all engineering streams."
  );

  if (!state.years.length) {
    root.innerHTML = `<div class="page page--compact">
      ${emptyStateHTML({
        icon: "library",
        title: "Your library needs a structure",
        text: state.profile?.role === "admin"
          ? "Add years and branches first, then create subjects for each semester."
          : "No years have been added yet. Check back once your admin finishes setting up the library.",
        actions: state.profile?.role === "admin" ? `<a class="btn btn--primary" href="#/admin/structure">Set up structure</a>` : "",
      })}
    </div>`;
    return () => {};
  }

  const [allSubjects, ads] = await Promise.all([
    fetchSubjectsFor(current.yearId, current.semester),
    state.settings?.adsEnabled ? fetchActiveAds().catch(() => []) : Promise.resolve([]),
  ]);
  if (!location.hash.startsWith("#/library")) return () => {};
  let documents = [];
  try {
    documents = await fetchDocumentsForSubjects(allSubjects.map((subject) => subject.id));
  } catch {
    documents = [];
  }
  const docsBySubject = new Map();
  documents.forEach((document) => {
    const list = docsBySubject.get(document.subjectId) || [];
    list.push(document);
    docsBySubject.set(document.subjectId, list);
  });

  const branchFiltered = branchId === "all"
    ? allSubjects
    : allSubjects.filter((subject) => (subject.branchIds || []).includes(branchId));
  const listAds = adsForPlacement(ads, "between_lists");

  const renderRows = (query = "") => {
    const normalized = query.trim().toLowerCase();
    const visible = normalized
      ? branchFiltered.filter((subject) => [
        subject.name,
        subject.code,
        subject.description,
        ...(subject.modules || []).map((module) => module.name),
      ].join(" ").toLowerCase().includes(normalized))
      : branchFiltered;
    const count = root.querySelector("#library-count");
    const list = root.querySelector("#library-subject-list");
    if (count) count.textContent = `${visible.length} ${visible.length === 1 ? "subject" : "subjects"}`;
    if (!list) return;
    if (!visible.length) {
      list.innerHTML = emptyStateHTML({
        small: true,
        icon: normalized ? "search" : "book-open",
        title: normalized ? "No matching subjects" : "Nothing in this branch yet",
        text: normalized
          ? "Try a shorter search or a subject code."
          : branchId !== "all"
            ? "Try another branch, or switch to All branches to see everything."
            : "Subjects for this semester haven’t been added yet.",
        actions: normalized
          ? `<button class="btn btn--white btn--sm" type="button" data-clear-library-search>Clear search</button>`
          : branchId !== "all"
            ? `<button class="btn btn--white btn--sm" type="button" data-all-branches>Show all branches</button>`
            : state.profile?.role === "admin"
              ? `<a class="btn btn--primary btn--sm" href="#/admin/structure">Add a subject</a>`
              : "",
      });
      list.querySelector("[data-clear-library-search]")?.addEventListener("click", () => {
        const input = root.querySelector("#library-search");
        if (input) {
          input.value = "";
          input.focus();
        }
        renderRows();
      });
      list.querySelector("[data-all-branches]")?.addEventListener("click", () => {
        setSelection({ branchId: "all" });
        renderLibrary(root, context);
      });
      return;
    }
    list.innerHTML = visible.map((subject) => subjectRowHTML(subject, docsBySubject.get(subject.id) || [])).join("");
  };

  root.innerHTML = `<div class="page library-page">
    <div class="page-topbar library-topbar">
      <div>
        <p class="selector-label">Study library</p>
        <p class="page-topbar__title" style="margin-top:3px">${escapeHtml(yearLabel(activeYear))} · Sem ${escapeHtml(current.semester)}${activeBranch ? ` · ${escapeHtml(activeBranch.shortName || activeBranch.name)}` : ""}</p>
      </div>
      <a class="icon-btn" href="#/bookmarks" aria-label="Open bookmarks">${icon("bookmark")}</a>
    </div>

    <header class="library-heading">
      <h1 class="library-heading__line"><span class="light">Your whole</span><span class="strong">syllabus.</span></h1>
    </header>

    <div class="library-selectors">
      <div class="selector-block">
        <div class="selector-block__head">
          <span class="selector-label">Year</span>
          <span class="selector-block__hint">Pick your academic year</span>
        </div>
        <div class="year-pills no-scrollbar" role="group" aria-label="Select year">
          ${state.years.map((item) => `<button class="year-pill ${item.id === current.yearId ? "is-active" : ""}" type="button" data-library-year="${escapeHtml(item.id)}" aria-pressed="${item.id === current.yearId}">
            <span class="year-pill__num">${escapeHtml(yearLabel(item).replace(/\s*Year$/i, ""))}</span>
            <span class="year-pill__label">Year</span>
          </button>`).join("")}
        </div>
      </div>

      <div class="selector-block">
        <div class="selector-block__head">
          <span class="selector-label">Semester</span>
          <span class="selector-block__hint">${semesters.length} available</span>
        </div>
        <div class="semester-pills" role="group" aria-label="Select semester">
          ${semesters.map((semester) => `<button class="semester-pill ${Number(current.semester) === semester ? "is-active" : ""}" type="button" data-library-semester="${semester}" aria-pressed="${Number(current.semester) === semester}">Sem ${semester}</button>`).join("")}
        </div>
      </div>

      <div class="selector-block">
        <div class="selector-block__head">
          <span class="selector-label">Branch</span>
          <span class="selector-block__hint">Notes adapt to your branch</span>
        </div>
        <div class="branch-pills no-scrollbar" role="group" aria-label="Select branch">
          <button class="branch-pill ${branchId === "all" ? "is-active" : ""}" type="button" data-library-branch="all" aria-pressed="${branchId === "all"}">All branches</button>
          ${state.branches.map((branch) => `<button class="branch-pill ${branch.id === branchId ? "is-active" : ""}" type="button" data-library-branch="${escapeHtml(branch.id)}" aria-pressed="${branch.id === branchId}">${escapeHtml(branch.shortName || branch.name)}</button>`).join("")}
        </div>
      </div>
    </div>

    <form class="library-search" id="library-search-form" role="search" autocomplete="off">
      <div class="search-shell">
        <span class="search-shell__icon">${icon("search")}</span>
        <input class="search-shell__input" id="library-search" type="search" placeholder="Filter this semester’s subjects…" aria-label="Filter subjects" />
        <button class="search-shell__clear" type="button" id="library-search-clear" aria-label="Clear search" hidden>${icon("x", "icon--sm")}</button>
      </div>
    </form>

    <div class="library-list-head">
      <h2 class="library-list-head__title">Subjects</h2>
      <span class="library-list-head__meta" id="library-count"></span>
    </div>

    <div class="subject-list" id="library-subject-list"></div>
    ${listAds.length ? `<div class="library-ad">${adCardHTML(listAds[0], "wide")}</div>` : ""}
    <p class="library-note">${icon("shield-check")} View-only access. Notes are for personal study.</p>
  </div>`;

  root.querySelectorAll("[data-library-year]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextYear = state.years.find((item) => item.id === button.dataset.libraryYear);
      setSelection({ yearId: button.dataset.libraryYear, semester: nextYear?.semesters?.[0] || 1 });
      renderLibrary(root, context);
    });
  });
  root.querySelectorAll("[data-library-semester]").forEach((button) => {
    button.addEventListener("click", () => {
      setSelection({ semester: Number(button.dataset.librarySemester) });
      renderLibrary(root, context);
    });
  });
  root.querySelectorAll("[data-library-branch]").forEach((button) => {
    button.addEventListener("click", () => {
      setSelection({ branchId: button.dataset.libraryBranch });
      renderLibrary(root, context);
    });
  });

  const search = root.querySelector("#library-search");
  const searchClear = root.querySelector("#library-search-clear");
  const searchForm = root.querySelector("#library-search-form");
  if (search && searchClear) {
    const runSearch = debounce(() => renderRows(search.value), 140);
    search.addEventListener("input", () => {
      searchClear.hidden = !search.value;
      runSearch();
    });
    searchClear.addEventListener("click", () => {
      search.value = "";
      searchClear.hidden = true;
      renderRows();
      search.focus();
    });
    searchForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      renderRows(search.value);
    });
  }

  renderRows();
  return () => {};
}

import {
  deleteBranchCascade,
  deleteSubjectCascade,
  deleteYearCascade,
  fetchAllSubjects,
  fetchBranches,
  fetchDocumentsForSubject,
  fetchYears,
  saveBranch,
  saveSubject,
  saveYear,
} from "../../db.js";
import {
  SUBJECT_COLORS,
  confirmDialog,
  escapeAttr,
  escapeHtml,
  icon,
  openSheet,
  setButtonLoading,
  toast,
} from "../../ui.js";
import { adminEmptyHTML, adminHeaderHTML, adminPageClose, adminPageOpen } from "./shared.js";

export async function renderStructure(main, context) {
  let years = [];
  let branches = [];
  let subjects = [];
  const openYears = new Set();
  const openSems = new Set();
  const openBranches = new Set();
  let initialized = false;

  async function reload() {
    [years, branches, subjects] = await Promise.all([fetchYears(), fetchBranches(), fetchAllSubjects()]);
    context.state.years = years;
    context.state.branches = branches;
    if (!initialized && years.length) {
      initialized = true;
      const firstYear = years[0];
      openYears.add(firstYear.id);
      const firstSem = sortedSemesters(firstYear)[0];
      if (firstSem) openSems.add(semKey(firstYear.id, firstSem));
    }
    if (main.isConnected) render();
  }

  function render() {
    const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
    const subjectCount = subjects.length;

    main.innerHTML = `${adminPageOpen("structure")}
      ${adminHeaderHTML({
        title: '<span class="fw-light">Shape the</span> <strong>catalog.</strong>',
        subtitle: "Years, semesters, branches, subjects, and module lists. Everything students browse starts here.",
        actions: `<button class="btn btn--white btn--sm" type="button" data-add-branch>${icon("plus")} Branch</button><button class="btn btn--primary btn--sm" type="button" data-add-year>${icon("plus")} Year</button>`,
      })}

      <section class="admin-card admin-section-spacer">
        <div class="admin-card__head">
          <div><h2 class="admin-card__title">Branches</h2><p class="admin-card__sub">${branches.length} branch${branches.length === 1 ? "" : "es"} · shared across every year</p></div>
          <button class="admin-card__action" type="button" data-add-branch>${icon("plus", "icon--xs")} Add branch</button>
        </div>
        ${branches.length ? `<div class="branch-admin-grid">
          ${branches.map((branch) => `<div class="branch-admin-chip" style="--branch-color:${escapeAttr(branch.color || "#C9DB74")}">
            <span class="branch-admin-chip__dot"></span>
            <span class="branch-admin-chip__copy">
              <span class="branch-admin-chip__name">${escapeHtml(branch.name)}</span>
              <span class="branch-admin-chip__meta">${escapeHtml(branch.shortName || "No short name")}</span>
            </span>
            <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-edit-branch="${escapeAttr(branch.id)}" aria-label="Edit ${escapeAttr(branch.name)}">${icon("edit")}</button>
            <button class="icon-btn icon-btn--sm icon-btn--ghost icon-btn--danger" type="button" data-delete-branch="${escapeAttr(branch.id)}" aria-label="Delete ${escapeAttr(branch.name)}">${icon("trash")}</button>
          </div>`).join("")}
        </div>` : `<p class="admin-search-empty">No branches yet. Add one before creating subjects.</p>`}
      </section>

      <div class="admin-toolbar admin-section-spacer">
        <span class="status-chip">${subjectCount} subject${subjectCount === 1 ? "" : "s"}</span>
        <span class="status-chip">${years.length} year${years.length === 1 ? "" : "s"}</span>
        <span class="admin-card__sub" style="margin-left:auto">Tap a year, semester, or branch to expand it.</span>
      </div>

      ${years.length ? `<div class="structure-shell">
        ${years.map((year) => {
          const semesters = sortedSemesters(year);
          const yearSubjects = subjects.filter((subject) => subject.yearId === year.id);
          const isOpen = openYears.has(year.id);
          return `<article class="structure-year ${isOpen ? "is-open" : ""}">
            <div class="structure-year__head">
              <button class="structure-year__toggle" type="button" data-toggle-year="${escapeAttr(year.id)}" aria-expanded="${isOpen}" aria-label="${isOpen ? "Collapse" : "Expand"} ${escapeAttr(year.name)}">${icon("chevron-right")}</button>
              <div class="structure-year__copy">
                <p class="structure-year__title">${escapeHtml(year.name)}</p>
                <p class="structure-year__meta">${yearSubjects.length} subject${yearSubjects.length === 1 ? "" : "s"} · ${semesters.length} semester${semesters.length === 1 ? "" : "s"}</p>
              </div>
              <div class="structure-year__actions">
                <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-add-subject data-year-id="${escapeAttr(year.id)}" data-semester="${semesters[0] || 1}" aria-label="Add subject to ${escapeAttr(year.name)}">${icon("plus")}</button>
                <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-edit-year="${escapeAttr(year.id)}" aria-label="Edit ${escapeAttr(year.name)}">${icon("edit")}</button>
                <button class="icon-btn icon-btn--sm icon-btn--ghost icon-btn--danger" type="button" data-delete-year="${escapeAttr(year.id)}" aria-label="Delete ${escapeAttr(year.name)}">${icon("trash")}</button>
              </div>
            </div>
            ${isOpen ? `<div class="structure-body">
              ${semesters.map((semester) => {
                const semSubjects = yearSubjects.filter((subject) => Number(subject.semester) === semester);
                const key = semKey(year.id, semester);
                const semOpen = openSems.has(key);
                const grouped = branches
                  .map((branch) => ({ branch, items: semSubjects.filter((subject) => (subject.branchIds || []).includes(branch.id)) }))
                  .filter((group) => group.items.length);
                const knownIds = new Set(branches.map((branch) => branch.id));
                const orphans = semSubjects.filter((subject) => !(subject.branchIds || []).some((id) => knownIds.has(id)));
                return `<section class="structure-sem ${semOpen ? "is-open" : ""}">
                  <div class="structure-sem__head">
                    <button class="structure-sem__toggle" type="button" data-toggle-sem="${escapeAttr(key)}" aria-expanded="${semOpen}" aria-label="${semOpen ? "Collapse" : "Expand"} semester ${semester}">${icon("chevron-right")}</button>
                    <span class="structure-sem__title">Semester ${semester}</span>
                    <span class="structure-sem__meta">${semSubjects.length} subject${semSubjects.length === 1 ? "" : "s"}</span>
                    <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-add-subject data-year-id="${escapeAttr(year.id)}" data-semester="${semester}" aria-label="Add subject to semester ${semester}">${icon("plus")}</button>
                  </div>
                  ${semOpen ? `<div class="structure-sem__body">
                    ${grouped.map(({ branch, items }) => {
                      const bKey = branchKey(year.id, semester, branch.id);
                      const branchOpen = openBranches.has(bKey);
                      return `<div class="structure-branch ${branchOpen ? "is-open" : ""}" style="--branch-color:${escapeAttr(branch.color || "#C9DB74")}">
                        <div class="structure-branch__head">
                          <button class="structure-branch__toggle" type="button" data-toggle-branch="${escapeAttr(bKey)}" aria-expanded="${branchOpen}">
                            <span class="structure-branch__dot"></span>
                            <span class="structure-branch__name">${escapeHtml(branch.name)}</span>
                            <span class="structure-branch__count">${items.length}</span>
                            <span class="structure-branch__chevron">${icon("chevron-down", "icon--xs")}</span>
                          </button>
                          <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-add-subject data-year-id="${escapeAttr(year.id)}" data-semester="${semester}" data-branch-id="${escapeAttr(branch.id)}" aria-label="Add subject to ${escapeAttr(branch.name)}">${icon("plus")}</button>
                        </div>
                        ${branchOpen ? `<div class="structure-branch__body">
                          ${items.map((subject) => subjectRowHTML(subject, branchMap)).join("")}
                          <button class="structure-add" type="button" data-add-subject data-year-id="${escapeAttr(year.id)}" data-semester="${semester}" data-branch-id="${escapeAttr(branch.id)}">${icon("plus", "icon--xs")} Add subject</button>
                        </div>` : ""}
                      </div>`;
                    }).join("")}
                    ${orphans.length ? `<div class="structure-branch is-open" style="--branch-color:#C9A227">
                      <div class="structure-branch__head">
                        <span class="structure-branch__toggle"><span class="structure-branch__dot"></span><span class="structure-branch__name">Unassigned branch</span><span class="structure-branch__count">${orphans.length}</span></span>
                      </div>
                      <div class="structure-branch__body">${orphans.map((subject) => subjectRowHTML(subject, branchMap)).join("")}</div>
                    </div>` : ""}
                    ${!grouped.length && !orphans.length ? `<p class="structure-subject-empty">No subjects in this semester yet.</p>` : ""}
                    <button class="structure-add" type="button" data-add-subject data-year-id="${escapeAttr(year.id)}" data-semester="${semester}">${icon("plus", "icon--xs")} Add subject to semester ${semester}</button>
                  </div>` : ""}
                </section>`;
              }).join("")}
            </div>` : ""}
          </article>`;
        }).join("")}
      </div>` : adminEmptyHTML({
        iconName: "folder-tree",
        title: "Build your first year",
        text: "Start with a year, then add semesters, branches, and subjects. Students will browse this exact structure.",
        actions: `<button class="btn btn--primary btn--sm" type="button" data-add-year>${icon("plus")} Add year</button>`,
      })}
    ${adminPageClose()}`;

    bindEvents();
  }

  function bindEvents() {
    main.querySelectorAll("[data-toggle-year]").forEach((button) => {
      button.addEventListener("click", () => toggle(openYears, button.dataset.toggleYear));
    });
    main.querySelectorAll("[data-toggle-sem]").forEach((button) => {
      button.addEventListener("click", () => toggle(openSems, button.dataset.toggleSem));
    });
    main.querySelectorAll("[data-toggle-branch]").forEach((button) => {
      button.addEventListener("click", () => toggle(openBranches, button.dataset.toggleBranch));
    });
    main.querySelectorAll("[data-add-year]").forEach((button) => {
      button.addEventListener("click", () => openYearSheet(null));
    });
    main.querySelectorAll("[data-add-branch]").forEach((button) => {
      button.addEventListener("click", () => openBranchSheet(null));
    });
    main.querySelectorAll("[data-add-subject]").forEach((button) => {
      button.addEventListener("click", () => openSubjectSheet(null, {
        yearId: button.dataset.yearId || years[0]?.id || "",
        semester: Number(button.dataset.semester || sortedSemesters(years[0])[0] || 1),
        branchId: button.dataset.branchId || "",
      }));
    });
    main.querySelectorAll("[data-edit-year]").forEach((button) => {
      button.addEventListener("click", () => openYearSheet(years.find((year) => year.id === button.dataset.editYear)));
    });
    main.querySelectorAll("[data-edit-branch]").forEach((button) => {
      button.addEventListener("click", () => openBranchSheet(branches.find((branch) => branch.id === button.dataset.editBranch)));
    });
    main.querySelectorAll("[data-edit-subject]").forEach((button) => {
      button.addEventListener("click", () => openSubjectSheet(subjects.find((subject) => subject.id === button.dataset.editSubject)));
    });
    main.querySelectorAll("[data-delete-year]").forEach((button) => {
      button.addEventListener("click", () => removeYear(button.dataset.deleteYear, button));
    });
    main.querySelectorAll("[data-delete-branch]").forEach((button) => {
      button.addEventListener("click", () => removeBranch(button.dataset.deleteBranch, button));
    });
    main.querySelectorAll("[data-delete-subject]").forEach((button) => {
      button.addEventListener("click", () => removeSubject(button.dataset.deleteSubject, button));
    });
  }

  function toggle(set, key) {
    if (!key) return;
    if (set.has(key)) set.delete(key);
    else set.add(key);
    render();
  }

  async function removeYear(yearId, button) {
    const year = years.find((item) => item.id === yearId);
    if (!year) return;
    const count = subjects.filter((subject) => subject.yearId === yearId).length;
    const confirmed = await confirmDialog({
      title: `Delete ${year.name}?`,
      message: `This deletes ${count} subject${count === 1 ? "" : "s"}, their document records, and activity. Google Drive PDFs are not deleted by this action.`,
      confirmText: "Delete year",
      danger: true,
    });
    if (!confirmed) return;
    setButtonLoading(button, true);
    try {
      await deleteYearCascade(yearId);
      openYears.delete(yearId);
      toast("Year deleted.", { type: "success" });
      await reload();
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || "The year could not be deleted.", { type: "error" });
    }
  }

  async function removeBranch(branchId, button) {
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) return;
    const count = subjects.filter((subject) => (subject.branchIds || []).includes(branchId)).length;
    const confirmed = await confirmDialog({
      title: `Delete ${branch.name}?`,
      message: `${count} subject${count === 1 ? "" : "s"} use this branch. Subjects that belong only to it are deleted with their document records; shared subjects keep their other branches. Google Drive PDFs are not deleted by this action.`,
      confirmText: "Delete branch",
      danger: true,
    });
    if (!confirmed) return;
    setButtonLoading(button, true);
    try {
      await deleteBranchCascade(branchId);
      toast("Branch deleted.", { type: "success" });
      await reload();
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || "The branch could not be deleted.", { type: "error" });
    }
  }

  async function removeSubject(subjectId, button) {
    const subject = subjects.find((item) => item.id === subjectId);
    if (!subject) return;
    let documentCount = 0;
    try {
      documentCount = (await fetchDocumentsForSubject(subjectId)).length;
    } catch {
      documentCount = 0;
    }
    const confirmed = await confirmDialog({
      title: `Delete ${subject.name}?`,
      message: `${documentCount ? `${documentCount} document record${documentCount === 1 ? "" : "s"}, ` : ""}module lists, and activity for this subject will be removed. Google Drive PDFs are not deleted by this action.`,
      confirmText: "Delete subject",
      danger: true,
    });
    if (!confirmed) return;
    setButtonLoading(button, true);
    try {
      await deleteSubjectCascade(subjectId);
      toast("Subject deleted.", { type: "success" });
      await reload();
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || "The subject could not be deleted.", { type: "error" });
    }
  }

  function openYearSheet(year) {
    const isEdit = Boolean(year?.id);
    let selectedSemesters = new Set(sortedSemesters(year || { semesters: [1, 2] }));
    openSheet({
      title: isEdit ? "Edit year" : "Add year",
      subtitle: "Semesters are the columns students see in the library.",
      content: `<form class="admin-editor" data-year-form>
        <div class="admin-editor__section">
          <div class="field-row">
            <label class="field">
              <span class="field__label">Year name</span>
              <input class="input" name="name" value="${escapeAttr(year?.name || "")}" maxlength="80" required placeholder="e.g. First Year" />
            </label>
            <label class="field">
              <span class="field__label">Order</span>
              <input class="input" name="order" type="number" step="1" value="${escapeAttr(year?.order ?? years.length)}" />
            </label>
          </div>
          <div class="field">
            <span class="field__label">Semesters</span>
            <div class="chip-select" data-semester-chips>
              ${Array.from({ length: 8 }, (_, index) => index + 1).map((semester) => `<button class="chip-select__item ${selectedSemesters.has(semester) ? "is-selected" : ""}" type="button" data-semester-value="${semester}">Sem ${semester}</button>`).join("")}
            </div>
            <span class="field__hint">Pick every semester that belongs to this year.</span>
          </div>
        </div>
      </form>`,
      footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit" form="year-form" data-save-year>${isEdit ? "Save year" : "Add year"}</button>`,
      onMount(sheet, close) {
        const form = sheet.querySelector("[data-year-form]");
        form.id = "year-form";
        const saveButton = sheet.querySelector("[data-save-year]");
        sheet.querySelector("[data-cancel]")?.addEventListener("click", () => close());
        sheet.querySelectorAll("[data-semester-value]").forEach((button) => {
          button.addEventListener("click", () => {
            const value = Number(button.dataset.semesterValue);
            if (selectedSemesters.has(value)) selectedSemesters.delete(value);
            else selectedSemesters.add(value);
            button.classList.toggle("is-selected", selectedSemesters.has(value));
          });
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          if (!selectedSemesters.size) {
            toast("Choose at least one semester.", { type: "error" });
            return;
          }
          setButtonLoading(saveButton, true, "Saving");
          try {
            await saveYear(year?.id || null, {
              name: String(data.get("name") || ""),
              order: Number(data.get("order") || 0),
              semesters: [...selectedSemesters],
            });
            close();
            toast(isEdit ? "Year updated." : "Year added.", { type: "success" });
            await reload();
          } catch (error) {
            setButtonLoading(saveButton, false);
            toast(error?.message || "The year could not be saved.", { type: "error" });
          }
        });
      },
    });
  }

  function openBranchSheet(branch) {
    const isEdit = Boolean(branch?.id);
    let selectedColor = branch?.color || SUBJECT_COLORS[0];
    openSheet({
      title: isEdit ? "Edit branch" : "Add branch",
      subtitle: "Branches group subjects inside every semester.",
      content: `<form class="admin-editor" data-branch-form>
        <div class="admin-editor__section">
          <div class="field-row">
            <label class="field">
              <span class="field__label">Branch name</span>
              <input class="input" name="name" value="${escapeAttr(branch?.name || "")}" maxlength="80" required placeholder="e.g. Computer Science" />
            </label>
            <label class="field">
              <span class="field__label">Short name</span>
              <input class="input" name="shortName" value="${escapeAttr(branch?.shortName || "")}" maxlength="20" placeholder="e.g. CSE" />
            </label>
          </div>
          <div class="field-row">
            <label class="field">
              <span class="field__label">Order</span>
              <input class="input" name="order" type="number" step="1" value="${escapeAttr(branch?.order ?? branches.length)}" />
            </label>
            <div class="field">
              <span class="field__label">Color</span>
              <div class="color-swatches" data-color-swatches>
                ${SUBJECT_COLORS.map((color) => `<button class="color-swatch ${color === selectedColor ? "is-selected" : ""}" type="button" data-color-value="${escapeAttr(color)}" style="--swatch:${escapeAttr(color)}" aria-label="Use ${escapeAttr(color)}"></button>`).join("")}
              </div>
            </div>
          </div>
        </div>
      </form>`,
      footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit" form="branch-form" data-save-branch>${isEdit ? "Save branch" : "Add branch"}</button>`,
      onMount(sheet, close) {
        const form = sheet.querySelector("[data-branch-form]");
        form.id = "branch-form";
        const saveButton = sheet.querySelector("[data-save-branch]");
        sheet.querySelector("[data-cancel]")?.addEventListener("click", () => close());
        sheet.querySelectorAll("[data-color-value]").forEach((button) => {
          button.addEventListener("click", () => {
            selectedColor = button.dataset.colorValue;
            sheet.querySelectorAll("[data-color-value]").forEach((item) => item.classList.toggle("is-selected", item === button));
          });
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          const name = String(data.get("name") || "").trim();
          if (!name) {
            toast("Branch name is required.", { type: "error" });
            return;
          }
          setButtonLoading(saveButton, true, "Saving");
          try {
            await saveBranch(branch?.id || null, {
              name,
              shortName: String(data.get("shortName") || ""),
              order: Number(data.get("order") || 0),
              color: selectedColor,
              icon: branch?.icon || "graduation-cap",
            });
            close();
            toast(isEdit ? "Branch updated." : "Branch added.", { type: "success" });
            await reload();
          } catch (error) {
            setButtonLoading(saveButton, false);
            toast(error?.message || "The branch could not be saved.", { type: "error" });
          }
        });
      },
    });
  }

  function openSubjectSheet(subject, defaults = {}) {
    const isEdit = Boolean(subject?.id);
    const selectedBranches = new Set(subject?.branchIds || (defaults.branchId ? [defaults.branchId] : []));
    let selectedColor = subject?.color || SUBJECT_COLORS[0];
    const initialYearId = subject?.yearId || defaults.yearId || years[0]?.id || "";
    const initialSemester = Number(subject?.semester || defaults.semester || 1);

    openSheet({
      title: isEdit ? "Edit subject" : "Add subject",
      subtitle: "Modules become the checklist students track inside the subject.",
      size: "wide",
      content: `<form class="admin-editor" data-subject-form>
        <div class="admin-editor__section">
          <div class="field-row">
            <label class="field">
              <span class="field__label">Subject name</span>
              <input class="input" name="name" value="${escapeAttr(subject?.name || "")}" maxlength="160" required placeholder="e.g. Data Structures" />
            </label>
            <label class="field">
              <span class="field__label">Code</span>
              <input class="input" name="code" value="${escapeAttr(subject?.code || "")}" maxlength="30" required placeholder="e.g. CS201" />
            </label>
          </div>
          <div class="field-row">
            <label class="field">
              <span class="field__label">Year</span>
              <select class="select" name="yearId" data-subject-year>
                ${years.map((year) => `<option value="${escapeAttr(year.id)}" ${year.id === initialYearId ? "selected" : ""}>${escapeHtml(year.name)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Semester</span>
              <select class="select" name="semester" data-subject-semester></select>
            </label>
          </div>
          <div class="field">
            <span class="field__label">Branches</span>
            <div class="chip-select" data-branch-chips>
              ${branches.map((branch) => `<button class="chip-select__item ${selectedBranches.has(branch.id) ? "is-selected" : ""}" type="button" data-branch-value="${escapeAttr(branch.id)}">${escapeHtml(branch.shortName || branch.name)}</button>`).join("")}
            </div>
          </div>
          <label class="field">
            <span class="field__label">Description</span>
            <textarea class="textarea" name="description" rows="3" maxlength="600" placeholder="A short description students see on the subject page.">${escapeHtml(subject?.description || "")}</textarea>
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field__label">Order</span>
              <input class="input" name="order" type="number" step="1" value="${escapeAttr(subject?.order ?? 0)}" />
            </label>
            <div class="field">
              <span class="field__label">Color</span>
              <div class="color-swatches" data-color-swatches>
                ${SUBJECT_COLORS.map((color) => `<button class="color-swatch ${color === selectedColor ? "is-selected" : ""}" type="button" data-color-value="${escapeAttr(color)}" style="--swatch:${escapeAttr(color)}" aria-label="Use ${escapeAttr(color)}"></button>`).join("")}
              </div>
            </div>
          </div>
          <label class="field">
            <span class="field__label">Modules</span>
            <textarea class="textarea" name="modules" rows="7" placeholder="One module per line&#10;Module 1: Introduction&#10;Module 2: Arrays">${escapeHtml((subject?.modules || []).map((module) => module.name).join("\n"))}</textarea>
            <span class="field__hint">One module per line. Students check these off as they study.</span>
          </label>
        </div>
      </form>`,
      footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit" form="subject-form" data-save-subject>${isEdit ? "Save subject" : "Add subject"}</button>`,
      onMount(sheet, close) {
        const form = sheet.querySelector("[data-subject-form]");
        form.id = "subject-form";
        const saveButton = sheet.querySelector("[data-save-subject]");
        const yearSelect = sheet.querySelector("[data-subject-year]");
        const semesterSelect = sheet.querySelector("[data-subject-semester]");
        const syncSemesters = (preferred) => {
          const year = years.find((item) => item.id === yearSelect.value);
          const semesters = sortedSemesters(year);
          semesterSelect.innerHTML = semesters.map((semester) => `<option value="${semester}" ${Number(preferred) === semester ? "selected" : ""}>Semester ${semester}</option>`).join("");
          if (!semesters.includes(Number(semesterSelect.value))) semesterSelect.value = String(semesters[0] || 1);
        };
        syncSemesters(initialSemester);
        yearSelect.addEventListener("change", () => syncSemesters(null));
        sheet.querySelector("[data-cancel]")?.addEventListener("click", () => close());
        sheet.querySelectorAll("[data-branch-value]").forEach((button) => {
          button.addEventListener("click", () => {
            const value = button.dataset.branchValue;
            if (selectedBranches.has(value)) selectedBranches.delete(value);
            else selectedBranches.add(value);
            button.classList.toggle("is-selected", selectedBranches.has(value));
          });
        });
        sheet.querySelectorAll("[data-color-value]").forEach((button) => {
          button.addEventListener("click", () => {
            selectedColor = button.dataset.colorValue;
            sheet.querySelectorAll("[data-color-value]").forEach((item) => item.classList.toggle("is-selected", item === button));
          });
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          const name = String(data.get("name") || "").trim();
          const code = String(data.get("code") || "").trim();
          if (!name || !code) {
            toast("Subject name and code are required.", { type: "error" });
            return;
          }
          if (!selectedBranches.size) {
            toast("Choose at least one branch.", { type: "error" });
            return;
          }
          setButtonLoading(saveButton, true, "Saving");
          try {
            await saveSubject(subject?.id || null, {
              name,
              code,
              yearId: yearSelect.value,
              semester: Number(semesterSelect.value || 1),
              branchIds: [...selectedBranches],
              description: String(data.get("description") || ""),
              color: selectedColor,
              icon: subject?.icon || "book-open",
              order: Number(data.get("order") || 0),
              modules: String(data.get("modules") || "")
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            });
            close();
            toast(isEdit ? "Subject updated." : "Subject added.", { type: "success" });
            await reload();
          } catch (error) {
            setButtonLoading(saveButton, false);
            toast(error?.message || "The subject could not be saved.", { type: "error" });
          }
        });
      },
    });
  }

  await reload();
}

function subjectRowHTML(subject, branchMap) {
  const branches = (subject.branchIds || []).map((id) => branchMap.get(id)).filter(Boolean);
  const moduleCount = (subject.modules || []).length;
  return `<div class="structure-subject">
    <span class="structure-subject__icon">${icon(subject.icon || "book-open")}</span>
    <div class="structure-subject__copy">
      <p class="structure-subject__title">${escapeHtml(subject.name)}</p>
      <p class="structure-subject__meta">${escapeHtml(subject.code || "No code")} · ${moduleCount} module${moduleCount === 1 ? "" : "s"}${branches.length > 1 ? ` · ${branches.map((branch) => branch.shortName || branch.name).join(", ")}` : ""}</p>
    </div>
    <div class="structure-subject__actions">
      <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-edit-subject="${escapeAttr(subject.id)}" aria-label="Edit ${escapeAttr(subject.name)}">${icon("edit")}</button>
      <button class="icon-btn icon-btn--sm icon-btn--ghost icon-btn--danger" type="button" data-delete-subject="${escapeAttr(subject.id)}" aria-label="Delete ${escapeAttr(subject.name)}">${icon("trash")}</button>
    </div>
  </div>`;
}

function sortedSemesters(year) {
  const values = Array.isArray(year?.semesters) && year.semesters.length ? year.semesters : [1];
  return [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
}

function semKey(yearId, semester) {
  return `${yearId}:${semester}`;
}

function branchKey(yearId, semester, branchId) {
  return `${yearId}:${semester}:${branchId}`;
}

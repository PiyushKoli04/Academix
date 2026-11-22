import {
  deleteDocument,
  fetchAllDocuments,
  fetchAllSubjects,
  saveDocument,
} from "../../db.js";
import { checkDriveLinkAccessible, extractDriveId, isValidDriveId } from "../../drive.js";
import {
  connectDrive,
  deleteDriveFile,
  formatBytes,
  getCachedDriveAccount,
  getDriveSetupStatus,
  getDriveUploadMaxMB,
  isDriveUploadConfigured,
  setUploaderAccount,
  switchDriveAccount,
  uploadPdf,
  validatePdfFile,
} from "../../services/driveUpload.js";
import {
  DOC_TYPES,
  DOC_TYPE_META,
  confirmDialog,
  escapeAttr,
  escapeHtml,
  icon,
  openSheet,
  relativeTime,
  setButtonLoading,
  toast,
  typeChipHTML,
} from "../../ui.js";
import { adminEmptyHTML, adminHeaderHTML, adminPageClose, adminPageOpen } from "./shared.js";

export async function renderDocuments(main, context) {
  let subjects = [];
  let documents = [];
  let driveStatus = { configured: false, connected: false, account: null, maxMB: 100 };
  let search = "";
  let subjectFilter = "all";
  let typeFilter = "all";

  async function refreshDriveStatus() {
    driveStatus = await getDriveSetupStatus();
    if (!driveStatus.account) driveStatus.account = getCachedDriveAccount();
  }

  async function loadData() {
    [subjects, documents] = await Promise.all([
      fetchAllSubjects(),
      fetchAllDocuments(500),
    ]);
    await refreshDriveStatus();
  }

  function subjectMap() {
    return new Map(subjects.map((subject) => [subject.id, subject]));
  }

  function filteredDocuments() {
    const needle = search.trim().toLowerCase();
    const map = subjectMap();
    return documents.filter((document) => {
      if (subjectFilter !== "all" && document.subjectId !== subjectFilter) return false;
      if (typeFilter !== "all" && document.type !== typeFilter) return false;
      if (!needle) return true;
      const subject = map.get(document.subjectId);
      const haystack = [
        document.title,
        document.description,
        ...(document.tags || []),
        document.uploadedBy,
        subject?.name,
        subject?.code,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }

  function renderPage() {
    const filtered = filteredDocuments();
    const settings = context.state.settings || {};
    const uploaderEmail = settings.driveUploaderEmail || "";
    const account = driveStatus.account || getCachedDriveAccount();
    const configured = driveStatus.configured;
    const uploadEnabled = configured;
    const subjectOptions = [...subjects].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    main.innerHTML = `${adminPageOpen("documents")}
      ${adminHeaderHTML({
        title: '<span class="fw-light">Publish the</span> <strong>PDFs.</strong>',
        subtitle: "Uploads go straight to the shared Google Drive folder. Students can view every file without downloading it.",
        actions: `<button class="btn btn--white btn--sm" type="button" data-paste-link>${icon("link")} Paste link</button><button class="btn btn--primary btn--sm" type="button" data-upload-pdf ${uploadEnabled ? "" : "disabled"}>${icon("upload")} Upload PDF</button>`,
      })}

      <section class="admin-card drive-uploader-card">
        <div class="admin-card__head">
          <div>
            <h2 class="admin-card__title">Drive uploader</h2>
            <p class="admin-card__sub">Only the designated Google account can publish files. Tokens stay in this browser session.</p>
          </div>
          <span class="drive-state ${configured ? "is-ok" : "is-error"}">${icon(configured ? "check-circle" : "alert-circle", "icon--xs")} ${configured ? "Drive API configured" : "Not configured"}</span>
        </div>
        ${configured ? `<div class="drive-uploader-grid">
          <div class="drive-uploader-status">
            <p class="drive-uploader-status__label">${account ? "Connected account" : "Connection"}</p>
            <p class="drive-uploader-status__value">${escapeHtml(account?.emailAddress || "Not connected in this session")}</p>
            <p class="drive-uploader-status__meta">${uploaderEmail ? `Designated uploader: ${escapeHtml(uploaderEmail)}` : "No designated uploader saved. Any Google account with Drive access can upload."} · ${getDriveUploadMaxMB()} MB limit</p>
            <div class="drive-uploader-actions">
              <button class="btn btn--primary btn--sm" type="button" data-connect-drive>${icon("refresh-cw")} ${account ? "Reconnect Drive" : "Connect Drive"}</button>
              <button class="btn btn--white btn--sm" type="button" data-switch-drive>${icon("users")} Switch account</button>
            </div>
          </div>
          <div class="drive-uploader-email">
            <label class="field">
              <span class="field__label">Designated uploader email</span>
              <input class="input" type="email" value="${escapeAttr(uploaderEmail)}" placeholder="notes@college.edu" data-uploader-email />
              <span class="field__hint">Uploads are verified against this address when set.</span>
            </label>
            <button class="btn btn--white btn--sm" type="button" data-save-uploader>Save uploader</button>
          </div>
        </div>` : `<div class="drive-check is-error">${icon("alert-circle")} Add a Google OAuth client ID to <code>firebase.config.js</code> to enable direct uploads. The paste-link fallback still works.</div>`}
      </section>

      <div class="admin-toolbar">
        <label class="admin-toolbar__search">
          ${icon("search")}
          <input class="input" type="search" value="${escapeAttr(search)}" placeholder="Search title, subject, tag, uploader" data-doc-search autocomplete="off" />
        </label>
        <select class="select" data-doc-subject-filter aria-label="Filter by subject">
          <option value="all">All subjects</option>
          ${subjectOptions.map((subject) => `<option value="${escapeAttr(subject.id)}" ${subjectFilter === subject.id ? "selected" : ""}>${escapeHtml(subject.name)} (${escapeHtml(subject.code || "—")})</option>`).join("")}
        </select>
        <select class="select" data-doc-type-filter aria-label="Filter by type">
          <option value="all">All types</option>
          ${DOC_TYPES.map((type) => `<option value="${escapeAttr(type.value)}" ${typeFilter === type.value ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}
        </select>
        <span class="status-chip" data-doc-count>${filtered.length} of ${documents.length}</span>
      </div>

      <div class="doc-admin-list" data-doc-list></div>
    ${adminPageClose()}`;

    renderList();
    bindPageEvents();
  }

  function renderList() {
    const list = main.querySelector("[data-doc-list]");
    const count = main.querySelector("[data-doc-count]");
    if (!list) return;
    const filtered = filteredDocuments();
    if (count) count.textContent = `${filtered.length} of ${documents.length}`;
    if (!filtered.length) {
      list.innerHTML = adminEmptyHTML({
        iconName: documents.length ? "search" : "file-text",
        title: documents.length ? "No matching documents" : "No documents yet",
        text: documents.length ? "Try a different search or filter." : "Upload a PDF or paste a Drive link to publish the first document.",
        actions: documents.length ? "" : `<button class="btn btn--primary btn--sm" type="button" data-upload-pdf>${icon("upload")} Upload PDF</button>`,
      });
      bindListActions();
      return;
    }
    list.innerHTML = filtered.map((document) => docRowHTML(document, subjectMap())).join("");
    bindListActions();
  }

  function bindPageEvents() {
    main.querySelector("[data-doc-search]")?.addEventListener("input", (event) => {
      search = event.currentTarget.value;
      renderList();
    });
    main.querySelector("[data-doc-subject-filter]")?.addEventListener("change", (event) => {
      subjectFilter = event.currentTarget.value;
      renderList();
    });
    main.querySelector("[data-doc-type-filter]")?.addEventListener("change", (event) => {
      typeFilter = event.currentTarget.value;
      renderList();
    });
    main.querySelectorAll("[data-upload-pdf]").forEach((button) => {
      button.addEventListener("click", () => openUploadSheet());
    });
    main.querySelectorAll("[data-paste-link]").forEach((button) => {
      button.addEventListener("click", () => openLinkSheet());
    });
    main.querySelector("[data-connect-drive]")?.addEventListener("click", () => handleDriveConnect(false));
    main.querySelector("[data-switch-drive]")?.addEventListener("click", () => handleDriveConnect(true));
    main.querySelector("[data-save-uploader]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const input = main.querySelector("[data-uploader-email]");
      const email = String(input?.value || "").trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast("Enter a valid uploader email address.", { type: "error" });
        return;
      }
      setButtonLoading(button, true, "Saving");
      try {
        await setUploaderAccount(email);
        context.state.settings = { ...(context.state.settings || {}), driveUploaderEmail: email };
        toast("Designated uploader saved.", { type: "success" });
        renderPage();
      } catch (error) {
        setButtonLoading(button, false);
        toast(error?.message || "The uploader email could not be saved.", { type: "error" });
      }
    });
  }

  function bindListActions() {
    const list = main.querySelector("[data-doc-list]");
    if (!list) return;
    list.querySelectorAll("[data-edit-doc]").forEach((button) => {
      button.addEventListener("click", () => {
        const document = documents.find((item) => item.id === button.dataset.editDoc);
        if (document) openEditSheet(document);
      });
    });
    list.querySelectorAll("[data-delete-doc]").forEach((button) => {
      button.addEventListener("click", () => {
        const document = documents.find((item) => item.id === button.dataset.deleteDoc);
        if (document) removeDocument(document, button);
      });
    });
    list.querySelectorAll("[data-upload-pdf]").forEach((button) => {
      button.addEventListener("click", () => openUploadSheet());
    });
  }

  async function handleDriveConnect(force) {
    const button = main.querySelector(force ? "[data-switch-drive]" : "[data-connect-drive]");
    setButtonLoading(button, true, force ? "Switching" : "Connecting");
    try {
      const expected = String(context.state.settings?.driveUploaderEmail || "").toLowerCase();
      const account = force
        ? await switchDriveAccount()
        : await connectDrive({ interactive: true, verifyUploader: Boolean(expected) });
      await refreshDriveStatus();
      if (force && expected && String(account.emailAddress || "").toLowerCase() !== expected) {
        toast(`Switched to ${account.emailAddress}. This is not the designated uploader.`, { type: "info", duration: 6000 });
      } else {
        toast(`Drive connected as ${account.emailAddress}.`, { type: "success" });
      }
      renderPage();
    } catch (error) {
      if (button) setButtonLoading(button, false);
      toast(error?.message || "Google Drive could not be connected.", { type: "error", duration: 7000 });
    }
  }

  async function removeDocument(document, button) {
    const confirmed = await confirmDialog({
      title: "Delete this document?",
      message: `“${document.title || "This PDF"}” will be removed from Academix. Academix will also try to delete the Google Drive file.`,
      confirmText: "Delete document",
      danger: true,
    });
    if (!confirmed) return;
    setButtonLoading(button, true);
    let driveDeleted = false;
    try {
      if (document.driveFileId) {
        try {
          if (!getCachedDriveAccount()) {
            await connectDrive({ interactive: true, verifyUploader: false });
          }
          await deleteDriveFile(document.driveFileId);
          driveDeleted = true;
        } catch (driveError) {
          const proceed = await confirmDialog({
            title: "Drive file not deleted",
            message: `The Google Drive file could not be deleted (${driveError?.message || "permission or connection issue"}). Remove the Academix record anyway? The Drive file will remain in Google Drive.`,
            confirmText: "Remove record anyway",
            danger: true,
          });
          if (!proceed) {
            setButtonLoading(button, false);
            return;
          }
        }
      }
      await deleteDocument(document, context.state.profile?.uid || "");
      toast(driveDeleted ? "Document and Drive file deleted." : "Document removed from Academix.", { type: "success" });
      await loadData();
      renderPage();
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || "The document could not be deleted.", { type: "error" });
    }
  }

  function openUploadSheet(replaceDoc = null) {
    const isReplace = Boolean(replaceDoc?.id);
    const configured = isDriveUploadConfigured();
    let files = [];
    let queue = [];
    let uploading = false;
    let controller = null;
    let nextId = 1;
    const defaultSubject = replaceDoc?.subjectId || subjects[0]?.id || "";
    const defaultType = replaceDoc?.type || "main";

    const driveCheckHTML = configured ? "" : `<div class="drive-check is-error">${icon("alert-circle")} Direct upload is not configured. Add your Google OAuth client ID in <code>firebase.config.js</code>, or use the paste-link fallback.</div>`;
    const uploadMetaSingleHTML = isReplace ? "" : `<div class="field-row upload-meta-single">
            <label class="field">
              <span class="field__label">Title <span class="field__hint-inline">(single file)</span></span>
              <input class="input" data-upload-title placeholder="Defaults to the subject and type" maxlength="180" />
            </label>
            <label class="field">
              <span class="field__label">Pages <span class="field__hint-inline">(optional)</span></span>
              <input class="input" data-upload-pages type="number" min="0" step="1" placeholder="e.g. 42" />
            </label>
          </div>`;
    const descriptionHTML = isReplace ? "" : `<label class="field">
            <span class="field__label">Description <span class="field__hint-inline">(single file)</span></span>
            <textarea class="textarea" data-upload-description rows="2" maxlength="600" placeholder="What is inside this document?"></textarea>
          </label>`;
    const checkboxHTML = isReplace ? "" : `<label class="checkbox-row">
            <input type="checkbox" data-upload-is-new checked />
            <span>Mark as new for students</span>
          </label>`;

    const sheetHandle = openSheet({
      title: isReplace ? "Replace PDF" : "Upload PDF",
      subtitle: isReplace
        ? "The new file replaces the old Drive file after the record is updated."
        : "PDFs are uploaded to Google Drive and published view-only.",
      size: "wide",
      closeOnBackdrop: false,
      content: `<div class="admin-editor upload-editor" data-upload-editor>
        ${driveCheckHTML}
        <div class="admin-editor__section">
          <div class="field-row">
            <label class="field">
              <span class="field__label">Subject</span>
              <select class="select" data-upload-subject ${isReplace ? "disabled" : ""}>
                ${[...subjects].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))).map((subject) => `<option value="${escapeAttr(subject.id)}" ${subject.id === defaultSubject ? "selected" : ""}>${escapeHtml(subject.name)} (${escapeHtml(subject.code || "—")})</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Document type</span>
              <select class="select" data-upload-type ${isReplace ? "disabled" : ""}>
                ${DOC_TYPES.map((type) => `<option value="${escapeAttr(type.value)}" ${type.value === defaultType ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="upload-zone" data-drop-zone>
            <input type="file" accept="application/pdf,.pdf" ${isReplace ? "" : "multiple"} data-file-input hidden />
            <span class="upload-zone__icon">${icon("upload")}</span>
            <span class="upload-zone__title">${isReplace ? "Choose the replacement PDF" : "Drop PDFs here or tap to browse"}</span>
            <span class="upload-zone__text">${isReplace ? "One PDF, up to" : "Select one or several PDFs, up to"} ${getDriveUploadMaxMB()} MB each</span>
          </div>
          <div class="upload-queue" data-upload-queue></div>
          ${uploadMetaSingleHTML}
          ${descriptionHTML}
          <div class="field-row">
            <label class="field">
              <span class="field__label">Tags <span class="field__hint-inline">(comma separated)</span></span>
              <input class="input" data-upload-tags placeholder="unit 1, important, 2025" maxlength="400" />
            </label>
            <label class="field">
              <span class="field__label">Contributor</span>
              <select class="select" data-upload-contributor>
                <option value="">No contributor</option>
                ${context.state.contributors.map((contributor) => `<option value="${escapeAttr(contributor.id)}">${escapeHtml(contributor.name)}</option>`).join("")}
              </select>
            </label>
          </div>
          ${checkboxHTML}
          <div class="upload-status" data-upload-status aria-live="polite"></div>
        </div>
      </div>`,
      footer: `<button class="btn btn--white" type="button" data-cancel>${isReplace ? "Cancel" : "Close"}</button><button class="btn btn--primary" type="button" data-start-upload ${configured ? "" : "disabled"}>${isReplace ? "Replace PDF" : "Upload"}</button>`,
      onMount(sheet, close) {
        const editor = sheet.querySelector("[data-upload-editor]");
        const queueElement = sheet.querySelector("[data-upload-queue]");
        const statusElement = sheet.querySelector("[data-upload-status]");
        const startButton = sheet.querySelector("[data-start-upload]");
        const cancelButton = sheet.querySelector("[data-cancel]");
        const dropZone = sheet.querySelector("[data-drop-zone]");
        const fileInput = sheet.querySelector("[data-file-input]");

        const renderQueue = () => {
          if (!queueElement) return;
          if (!queue.length) {
            queueElement.innerHTML = "";
            return;
          }
          queueElement.innerHTML = queue.map((entry) => `<div class="upload-queue__row" data-queue-row="${entry.id}">
            <span class="upload-queue__icon">${icon("file-text")}</span>
            <span class="upload-queue__copy">
              <span class="upload-queue__name">${escapeHtml(entry.file.name)}</span>
              <span class="upload-queue__meta">${formatBytes(entry.file.size)} <span data-queue-status>${statusLabel(entry)}</span></span>
              <span class="upload-queue__bar"><span class="upload-queue__fill" data-queue-bar style="width:${entry.progress}%"></span></span>
              ${entry.error ? `<span class="upload-queue__error">${escapeHtml(entry.error)}</span>` : ""}
            </span>
          </div>`).join("");
        };

        const updateQueueRow = (entry) => {
          const row = queueElement?.querySelector(`[data-queue-row="${entry.id}"]`);
          if (!row) return;
          row.classList.toggle("is-done", entry.status === "done");
          row.classList.toggle("is-error", entry.status === "error");
          const status = row.querySelector("[data-queue-status]");
          if (status) status.textContent = statusLabel(entry);
          const bar = row.querySelector("[data-queue-bar]");
          if (bar) bar.style.width = `${entry.progress}%`;
          if (entry.error) {
            let error = row.querySelector(".upload-queue__error");
            if (!error) {
              error = document.createElement("span");
              error.className = "upload-queue__error";
              row.querySelector(".upload-queue__copy")?.append(error);
            }
            error.textContent = entry.error;
          }
        };

        const setFiles = (fileList) => {
          const selected = [...(fileList || [])];
          if (isReplace) files = selected.slice(0, 1);
          else files = selected;
          queue = files.map((file) => ({
            id: nextId++,
            file,
            status: "queued",
            progress: 0,
            error: "",
          }));
          const titleInput = sheet.querySelector("[data-upload-title]");
          const pagesInput = sheet.querySelector("[data-upload-pages]");
          const descriptionInput = sheet.querySelector("[data-upload-description]");
          const single = queue.length === 1;
          [titleInput, pagesInput, descriptionInput].forEach((input) => {
            if (!input) return;
            input.disabled = !single;
          });
          if (single && titleInput && !titleInput.value) {
            const subject = subjects.find((item) => item.id === (replaceDoc?.subjectId || sheet.querySelector("[data-upload-subject]")?.value));
            const type = sheet.querySelector("[data-upload-type]")?.value || "main";
            titleInput.value = subject ? `${subject.name} — ${DOC_TYPE_META[type]?.short || "Document"}` : "";
          }
          renderQueue();
          if (statusElement) statusElement.textContent = "";
          if (startButton) {
            startButton.disabled = !configured || !queue.length;
            startButton.textContent = isReplace ? "Replace PDF" : queue.length > 1 ? `Upload ${queue.length} PDFs` : "Upload";
          }
        };

        const pickFiles = () => fileInput?.click();
        dropZone?.addEventListener("click", pickFiles);
        dropZone?.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            pickFiles();
          }
        });
        dropZone?.setAttribute("tabindex", "0");
        dropZone?.setAttribute("role", "button");
        fileInput?.addEventListener("change", () => setFiles(fileInput.files));
        ["dragenter", "dragover"].forEach((name) => dropZone?.addEventListener(name, (event) => {
          event.preventDefault();
          dropZone.classList.add("is-dragging");
        }));
        ["dragleave", "drop"].forEach((name) => dropZone?.addEventListener(name, (event) => {
          event.preventDefault();
          dropZone.classList.remove("is-dragging");
        }));
        dropZone?.addEventListener("drop", (event) => {
          if (event.dataTransfer?.files?.length) setFiles(event.dataTransfer.files);
        });

        cancelButton?.addEventListener("click", () => close());
        startButton?.addEventListener("click", async () => {
          if (uploading) return;
          if (!queue.length) {
            toast("Choose at least one PDF.", { type: "error" });
            return;
          }
          const subjectId = isReplace ? replaceDoc.subjectId : sheet.querySelector("[data-upload-subject]")?.value;
          const subject = subjects.find((item) => item.id === subjectId);
          if (!subject) {
            toast("Choose a subject for the upload.", { type: "error" });
            return;
          }
          for (const entry of queue) {
            if (entry.status === "done") continue;
            const validationError = validatePdfFile(entry.file);
            if (validationError) {
              entry.status = "error";
              entry.error = validationError;
              updateQueueRow(entry);
              toast(validationError, { type: "error" });
              return;
            }
          }
          const type = isReplace ? replaceDoc.type : sheet.querySelector("[data-upload-type]")?.value || "other";
          const single = queue.length === 1;
          const titleInput = sheet.querySelector("[data-upload-title]");
          const pagesInput = sheet.querySelector("[data-upload-pages]");
          const descriptionInput = sheet.querySelector("[data-upload-description]");
          const tags = String(sheet.querySelector("[data-upload-tags]")?.value || "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
          const contributorId = String(sheet.querySelector("[data-upload-contributor]")?.value || "");
          const isNew = isReplace ? Boolean(replaceDoc.isNew) : Boolean(sheet.querySelector("[data-upload-is-new]")?.checked);
          const year = context.state.years.find((item) => item.id === subject.yearId);
          const branch = context.state.branches.find((item) => (subject.branchIds || [])[0] === item.id);
          const folderSegments = [
            year?.name || "Year",
            `Sem ${subject.semester || 1}`,
            branch?.shortName || branch?.name || "General",
          ];
          const expectedUploaderEmail = context.state.settings?.driveUploaderEmail || "";

          uploading = true;
          controller = new AbortController();
          startButton.disabled = true;
          cancelButton.textContent = "Cancel upload";
          if (statusElement) statusElement.textContent = "Connecting to Google Drive…";
          try {
            await connectDrive({ interactive: true, verifyUploader: Boolean(expectedUploaderEmail) });
          } catch (error) {
            uploading = false;
            startButton.disabled = false;
            startButton.textContent = isReplace ? "Replace PDF" : queue.length > 1 ? `Upload ${queue.length} PDFs` : "Upload";
            cancelButton.textContent = isReplace ? "Cancel" : "Close";
            if (statusElement) statusElement.textContent = "";
            toast(error?.message || "Google Drive could not be connected.", { type: "error", duration: 7000 });
            return;
          }

          const failures = [];
          for (const entry of queue) {
            if (entry.status === "done") continue;
            if (controller.signal.aborted) break;
            entry.status = "uploading";
            entry.progress = 0;
            entry.error = "";
            updateQueueRow(entry);
            if (statusElement) statusElement.textContent = `Uploading ${entry.file.name}…`;
            try {
              const uploaded = await uploadPdf({
                file: entry.file,
                subject,
                type,
                folderSegments,
                expectedUploaderEmail,
                signal: controller.signal,
                onProgress: ({ percent }) => {
                  entry.progress = percent;
                  updateQueueRow(entry);
                },
              });
              const title = isReplace
                ? replaceDoc.title
                : single
                  ? String(titleInput?.value || "").trim() || `${subject.name} — ${DOC_TYPE_META[type]?.short || "Document"}`
                  : entry.file.name.replace(/\.pdf$/i, "");
              const metadata = {
                subjectId: subject.id,
                title,
                description: isReplace ? replaceDoc.description || "" : single ? String(descriptionInput?.value || "") : "",
                type,
                driveFileId: uploaded.id,
                pages: isReplace ? replaceDoc.pages || 0 : single ? Number(pagesInput?.value || 0) : 0,
                sizeLabel: uploaded.sizeLabel,
                tags: isReplace ? replaceDoc.tags || [] : tags,
                contributorId: isReplace ? replaceDoc.contributorId || "" : contributorId,
                isNew,
                mimeType: uploaded.mimeType,
                uploadedBy: uploaded.uploadedBy,
              };
              try {
                await saveDocument(isReplace ? replaceDoc.id : null, metadata, context.state.profile?.uid || "");
              } catch (saveError) {
                try {
                  await deleteDriveFile(uploaded.id);
                } catch {
                  // The uploaded file is orphaned if cleanup fails, but the record is not saved.
                }
                throw saveError;
              }
              if (isReplace && replaceDoc.driveFileId && replaceDoc.driveFileId !== uploaded.id) {
                try {
                  await deleteDriveFile(replaceDoc.driveFileId);
                } catch (cleanupError) {
                  console.warn("Old Drive file could not be deleted after replacement.", cleanupError);
                }
              }
              entry.status = "done";
              entry.progress = 100;
              updateQueueRow(entry);
            } catch (error) {
              if (error?.name === "UploadCancelledError" || controller.signal.aborted) {
                entry.status = "queued";
                entry.progress = 0;
                updateQueueRow(entry);
                break;
              }
              entry.status = "error";
              entry.error = error?.message || "Upload failed.";
              updateQueueRow(entry);
              failures.push(entry);
            }
          }

          uploading = false;
          controller = null;
          const failed = queue.filter((entry) => entry.status !== "done").length;
          if (!failed) {
            close();
            toast(isReplace ? "PDF replaced." : queue.length > 1 ? `${queue.length} PDFs uploaded.` : "PDF uploaded.", { type: "success" });
            await loadData();
            renderPage();
            return;
          }
          startButton.disabled = false;
          startButton.textContent = `Retry ${failed} failed`;
          cancelButton.textContent = isReplace ? "Cancel" : "Close";
          if (statusElement) {
            statusElement.textContent = failures.length
              ? `${failures.length} file${failures.length === 1 ? "" : "s"} failed. Fix the issue and retry, or cancel.`
              : "Upload stopped.";
          }
          if (failures.length) toast(failures[0].error, { type: "error", duration: 7000 });
          await loadData();
          if (main.isConnected) renderPage();
        });

        if (statusElement) statusElement.textContent = "";
        setFiles([]);
      },
      onClose() {
        controller?.abort();
        controller = null;
      },
    });
    return sheetHandle;
  }

  function openLinkSheet() {
    const defaultSubject = subjects[0]?.id || "";
    openSheet({
      title: "Paste a Drive link",
      subtitle: "Fallback for files already uploaded to Google Drive. Link sharing must be “Anyone with the link”.",
      size: "wide",
      content: `<form class="admin-editor" data-link-form>
        <div class="admin-editor__section">
          <div class="field-row">
            <label class="field">
              <span class="field__label">Subject</span>
              <select class="select" name="subjectId" required>
                ${[...subjects].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))).map((subject) => `<option value="${escapeAttr(subject.id)}" ${subject.id === defaultSubject ? "selected" : ""}>${escapeHtml(subject.name)} (${escapeHtml(subject.code || "—")})</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Document type</span>
              <select class="select" name="type">
                ${DOC_TYPES.map((type) => `<option value="${escapeAttr(type.value)}" ${type.value === "main" ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="field">
            <span class="field__label">Google Drive link or file ID</span>
            <input class="input" name="driveLink" required placeholder="https://drive.google.com/file/d/…/view" />
          </label>
          <div class="drive-check" data-link-check>${icon("info")} Academix stores only the file ID. Students see a view-only preview.</div>
          <button class="btn btn--white btn--sm" type="button" data-check-link>${icon("search")} Check link access</button>
          <label class="field">
            <span class="field__label">Title</span>
            <input class="input" name="title" maxlength="180" placeholder="e.g. Data Structures — Main Notes" />
          </label>
          <label class="field">
            <span class="field__label">Description</span>
            <textarea class="textarea" name="description" rows="2" maxlength="600" placeholder="Optional context for students."></textarea>
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field__label">Pages</span>
              <input class="input" name="pages" type="number" min="0" step="1" placeholder="Optional" />
            </label>
            <label class="field">
              <span class="field__label">Tags</span>
              <input class="input" name="tags" placeholder="unit 1, important" maxlength="400" />
            </label>
          </div>
          <label class="field">
            <span class="field__label">Contributor</span>
            <select class="select" name="contributorId">
              <option value="">No contributor</option>
              ${context.state.contributors.map((contributor) => `<option value="${escapeAttr(contributor.id)}">${escapeHtml(contributor.name)}</option>`).join("")}
            </select>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="isNew" checked />
            <span>Mark as new for students</span>
          </label>
        </div>
      </form>`,
      footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit" form="link-form" data-save-link>Add document</button>`,
      onMount(sheet, close) {
        const form = sheet.querySelector("[data-link-form]");
        form.id = "link-form";
        const saveButton = sheet.querySelector("[data-save-link]");
        const linkInput = form.querySelector("[name=driveLink]");
        const check = sheet.querySelector("[data-link-check]");
        sheet.querySelector("[data-cancel]")?.addEventListener("click", () => close());
        sheet.querySelector("[data-check-link]")?.addEventListener("click", async (event) => {
          const button = event.currentTarget;
          const fileId = extractDriveId(linkInput.value);
          if (!fileId) {
            check.className = "drive-check is-error";
            check.innerHTML = `${icon("alert-circle")} That does not look like a valid Drive file link.`;
            return;
          }
          setButtonLoading(button, true, "Checking");
          const result = await checkDriveLinkAccessible(fileId);
          setButtonLoading(button, false);
          check.className = `drive-check ${result.status === "ok" ? "is-ok" : result.status === "warning" ? "is-warning" : "is-error"}`;
          check.innerHTML = `${icon(result.status === "ok" ? "check-circle" : "alert-circle")} ${escapeHtml(result.message)}`;
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          const fileId = extractDriveId(String(data.get("driveLink") || ""));
          if (!isValidDriveId(fileId)) {
            toast("Enter a valid Google Drive file link or file ID.", { type: "error" });
            return;
          }
          setButtonLoading(saveButton, true, "Adding");
          try {
            await saveDocument(null, {
              subjectId: String(data.get("subjectId") || ""),
              title: String(data.get("title") || ""),
              description: String(data.get("description") || ""),
              type: String(data.get("type") || "other"),
              driveFileId: fileId,
              pages: Number(data.get("pages") || 0),
              sizeLabel: "",
              tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
              contributorId: String(data.get("contributorId") || ""),
              isNew: data.get("isNew") === "on",
              mimeType: "application/pdf",
              uploadedBy: "Pasted Drive link",
            }, context.state.profile?.uid || "");
            close();
            toast("Document added from Drive link.", { type: "success" });
            await loadData();
            renderPage();
          } catch (error) {
            setButtonLoading(saveButton, false);
            toast(error?.message || "The Drive link could not be added.", { type: "error" });
          }
        });
      },
    });
  }

  function openEditSheet(document) {
    const subject = subjectMap().get(document.subjectId);
    openSheet({
      title: "Edit document",
      subtitle: "Metadata changes appear immediately. The Drive file itself is unchanged.",
      size: "wide",
      content: `<form class="admin-editor" data-edit-doc-form>
        <div class="admin-editor__section">
          <div class="field-row">
            <label class="field">
              <span class="field__label">Subject</span>
              <select class="select" name="subjectId" required>
                ${[...subjects].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))).map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === document.subjectId ? "selected" : ""}>${escapeHtml(item.name)} (${escapeHtml(item.code || "—")})</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Document type</span>
              <select class="select" name="type">
                ${DOC_TYPES.map((type) => `<option value="${escapeAttr(type.value)}" ${type.value === document.type ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="field">
            <span class="field__label">Title</span>
            <input class="input" name="title" value="${escapeAttr(document.title || "")}" maxlength="180" required />
          </label>
          <label class="field">
            <span class="field__label">Description</span>
            <textarea class="textarea" name="description" rows="3" maxlength="600">${escapeHtml(document.description || "")}</textarea>
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field__label">Pages</span>
              <input class="input" name="pages" type="number" min="0" step="1" value="${escapeAttr(document.pages || 0)}" />
            </label>
            <label class="field">
              <span class="field__label">Tags</span>
              <input class="input" name="tags" value="${escapeAttr((document.tags || []).join(", "))}" maxlength="400" />
            </label>
          </div>
          <label class="field">
            <span class="field__label">Contributor</span>
            <select class="select" name="contributorId">
              <option value="">No contributor</option>
              ${context.state.contributors.map((contributor) => `<option value="${escapeAttr(contributor.id)}" ${contributor.id === document.contributorId ? "selected" : ""}>${escapeHtml(contributor.name)}</option>`).join("")}
            </select>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="isNew" ${document.isNew ? "checked" : ""} />
            <span>Mark as new for students</span>
          </label>
          <div class="doc-edit-drive">
            <div>
              <p class="admin-card__title">Google Drive file</p>
              <p class="admin-card__sub">${escapeHtml(subject?.name || "Subject")} · view-only preview · ID stored securely</p>
            </div>
            <div class="editor-head-actions">
              <a class="btn btn--white btn--sm" href="#/viewer/${encodeURIComponent(document.id)}">${icon("eye")} Open</a>
              <button class="btn btn--white btn--sm" type="button" data-replace-pdf>${icon("upload")} Replace PDF</button>
            </div>
          </div>
        </div>
      </form>`,
      footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit" form="edit-doc-form" data-save-doc>Save changes</button>`,
      onMount(sheet, close) {
        const form = sheet.querySelector("[data-edit-doc-form]");
        form.id = "edit-doc-form";
        const saveButton = sheet.querySelector("[data-save-doc]");
        sheet.querySelector("[data-cancel]")?.addEventListener("click", () => close());
        sheet.querySelector("[data-replace-pdf]")?.addEventListener("click", () => {
          close();
          openUploadSheet(document);
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          setButtonLoading(saveButton, true, "Saving");
          try {
            await saveDocument(document.id, {
              subjectId: String(data.get("subjectId") || ""),
              title: String(data.get("title") || ""),
              description: String(data.get("description") || ""),
              type: String(data.get("type") || "other"),
              driveFileId: document.driveFileId,
              pages: Number(data.get("pages") || 0),
              sizeLabel: document.sizeLabel || "",
              tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
              contributorId: String(data.get("contributorId") || ""),
              isNew: data.get("isNew") === "on",
              mimeType: document.mimeType || "application/pdf",
              uploadedBy: document.uploadedBy || "",
            }, context.state.profile?.uid || "");
            close();
            toast("Document updated.", { type: "success" });
            await loadData();
            renderPage();
          } catch (error) {
            setButtonLoading(saveButton, false);
            toast(error?.message || "The document could not be saved.", { type: "error" });
          }
        });
      },
    });
  }

  function docRowHTML(document, map) {
    const subject = map.get(document.subjectId);
    const meta = DOC_TYPE_META[document.type] || DOC_TYPE_META.other;
    return `<article class="doc-admin-row">
      <span class="doc-admin-row__icon">${icon(meta.icon)}</span>
      <div class="doc-admin-row__copy">
        <p class="doc-admin-row__title">${escapeHtml(document.title || "Untitled document")} ${document.isMain ? '<span class="role-badge role-badge--admin">Main</span>' : ""}${document.isNew ? '<span class="role-badge">New</span>' : ""}</p>
        <div class="doc-admin-row__meta">
          ${typeChipHTML(document.type, { main: document.isMain })}
          <span>${escapeHtml(subject?.name || "Unknown subject")}</span>
          ${subject?.code ? `<span>${escapeHtml(subject.code)}</span>` : ""}
          ${document.sizeLabel ? `<span>${escapeHtml(document.sizeLabel)}</span>` : ""}
          ${document.pages ? `<span>${Number(document.pages)} pages</span>` : ""}
        </div>
        <div class="doc-admin-row__meta">
          <span>${escapeHtml(document.uploadedBy || "Uploaded in Academix")}</span>
          <span>·</span>
          <span>${relativeTime(document.updatedAt || document.createdAt)}</span>
        </div>
      </div>
      <div class="doc-admin-row__actions">
        <a class="icon-btn icon-btn--sm icon-btn--ghost" href="#/viewer/${encodeURIComponent(document.id)}" aria-label="Open ${escapeAttr(document.title || "document")}">${icon("eye")}</a>
        <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-edit-doc="${escapeAttr(document.id)}" aria-label="Edit ${escapeAttr(document.title || "document")}">${icon("edit")}</button>
        <button class="icon-btn icon-btn--sm icon-btn--ghost icon-btn--danger" type="button" data-delete-doc="${escapeAttr(document.id)}" aria-label="Delete ${escapeAttr(document.title || "document")}">${icon("trash")}</button>
      </div>
    </article>`;
  }

  await loadData();
  if (!location.hash.startsWith("#/admin/documents")) return;
  renderPage();
}

function statusLabel(entry) {
  if (entry.status === "uploading") return `Uploading ${entry.progress}%`;
  if (entry.status === "done") return "Uploaded";
  if (entry.status === "error") return "Failed";
  return "Ready";
}

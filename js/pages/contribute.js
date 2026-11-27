import { updateOwnProfile } from "../auth.js";
import {
  deleteContribution,
  fetchAllSubjects,
  fetchBranches,
  fetchMyContributions,
  fetchYears,
  submitContribution,
} from "../db.js";
import { checkDriveLinkAccessible, extractDriveId, isValidDriveId } from "../drive.js";
import {
  connectDrive,
  formatBytes,
  getCachedDriveAccount,
  getDriveUploadMaxMB,
  isDriveUploadConfigured,
  switchDriveAccount,
  uploadPdf,
  validatePdfFile,
} from "../services/driveUpload.js";
import { state } from "../state.js";
import {
  DOC_TYPES,
  DOC_TYPE_META,
  confirmDialog,
  emptyStateHTML,
  escapeAttr,
  escapeHtml,
  icon,
  openSheet,
  relativeTime,
  setButtonLoading,
  setPageMeta,
  toast,
  typeChipHTML,
} from "../ui.js";
import {
  bindSubjectPickers,
  contributionStatusMeta,
  drivePreviewFrameHTML,
  subjectContextMeta,
  subjectPickerHTML,
} from "./admin/shared.js";

function renderStatPill(count, label, tone = "") {
  return `<div class="contrib-stat ${tone ? `contrib-stat--${tone}` : ""}">
    <span class="contrib-stat__value">${count}</span>
    <span class="contrib-stat__label">${escapeHtml(label)}</span>
  </div>`;
}

export async function renderContribute(root, context) {
  const profile = state.profile || {};
  const uid = profile.uid || state.user?.uid || "";

  setPageMeta("Contribute Notes", "Upload PDF study material via your Google Drive to share with students after admin approval.");

  if (!state.years?.length || !state.branches?.length) {
    const [yearsData, branchesData] = await Promise.all([
      fetchYears().catch(() => []),
      fetchBranches().catch(() => []),
    ]);
    if (yearsData.length) state.years = yearsData;
    if (branchesData.length) state.branches = branchesData;
  }

  let subjects = [];
  let myContributions = [];
  let loadError = "";

  const [subjectsResult, contribsResult] = await Promise.allSettled([
    fetchAllSubjects(),
    fetchMyContributions(uid),
  ]);
  if (!location.hash.startsWith("#/contribute")) return () => {};

  if (subjectsResult.status === "fulfilled") subjects = subjectsResult.value;
  else loadError = subjectsResult.reason?.message || "Subjects could not be loaded.";

  if (contribsResult.status === "fulfilled") myContributions = contribsResult.value;
  else if (!loadError && contribsResult.reason?.code === "permission-denied") {
    loadError = "Firestore rules for contributions are not deployed yet. Ask your administrator to deploy updated Firestore rules.";
  }

  const years = state.years || [];
  const branches = state.branches || [];
  const subjectMap = new Map(subjects.map((item) => [item.id, item]));
  const configured = isDriveUploadConfigured();
  const maxMB = getDriveUploadMaxMB();

  let statusFilter = "all";
  let sourceMode = configured ? "upload" : "link";
  let editingItem = null;
  let selectedFile = null;
  let driveUploading = false;
  let uploadAbortController = null;
  let uploadProgress = 0;

  const render = () => {
    const pendingCount = myContributions.filter((item) => item.status === "pending").length;
    const approvedCount = myContributions.filter((item) => item.status === "approved").length;
    const rejectedCount = myContributions.filter((item) => item.status === "rejected").length;
    const driveAccount = getCachedDriveAccount();
    const defaultContributorName = editingItem?.contributorName || profile.contributorName || profile.name || "";
    const defaultContributorLink = editingItem?.contributorLink || profile.contributorLink || "";
    const defaultSubjectId = editingItem?.subjectId || "";
    const defaultType = editingItem?.type || "main";
    const defaultTitle = editingItem?.title || "";
    const defaultPages = editingItem?.pages || "";
    const defaultTags = Array.isArray(editingItem?.tags) ? editingItem.tags.join(", ") : "";
    const defaultDesc = editingItem?.description || "";
    const defaultDriveLink = editingItem?.driveFileId
      ? `https://drive.google.com/file/d/${editingItem.driveFileId}/view`
      : "";

    const filteredItems = myContributions.filter((item) => (
      statusFilter === "all" ? true : item.status === statusFilter
    ));

    root.innerHTML = `<div class="page contrib-page">
      <div class="contrib-shell">
        <div class="detail-topbar">
          <a class="icon-btn" href="#/profile" aria-label="Back to profile">${icon("arrow-left")}</a>
          <p class="detail-topbar__title">Contribute notes</p>
          <span class="status-chip status-chip--info">Reviewed by admin</span>
        </div>

        <header class="contrib-hero">
          <div class="contrib-hero__copy">
            <span class="about-hero__eyebrow">${icon("upload-cloud", "icon--xs")} Community Library</span>
            <h1 class="contrib-hero__title"><span class="fw-light">Share your notes,</span> <strong>get credited.</strong></h1>
            <p class="contrib-hero__text">Upload a PDF from your Google Drive or paste a public Drive PDF link. After an admin checks and approves it, it goes live in the library and adds your name to the Contributors list as <strong>Contributor</strong>.</p>
          </div>
          <div class="contrib-stats">
            ${renderStatPill(pendingCount, "Pending")}
            ${renderStatPill(approvedCount, "Approved", "success")}
            ${renderStatPill(rejectedCount, "Rejected", rejectedCount ? "danger" : "")}
          </div>
        </header>

        ${loadError ? `<div class="notice notice--warning" style="margin-bottom:16px">${escapeHtml(loadError)}</div>` : ""}

        ${rejectedCount && !editingItem ? `<div class="contrib-reject-banner">
          <div>
            <strong>${rejectedCount} ${rejectedCount === 1 ? "submission was" : "submissions were"} returned for changes</strong>
            <p>Check the admin feedback below to edit and resubmit, or upload an updated PDF.</p>
          </div>
          <button class="btn btn--white btn--sm" type="button" data-jump-rejected>View rejected</button>
        </div>` : ""}

        <div class="contrib-grid">
          <section class="contrib-card">
            <div class="contrib-card__head">
              <div>
                <h2 class="contrib-card__title">${editingItem ? "Edit & resubmit notes" : "Submit new notes"}</h2>
                <p class="contrib-card__sub">${editingItem
                  ? "Update details or replace the PDF below, then send it back for admin review."
                  : "PDFs stay in your own Google Drive, view-only with downloads disabled."}</p>
              </div>
              ${editingItem ? `<button class="btn btn--white btn--sm" type="button" data-cancel-edit>${icon("x", "icon--xs")} Cancel edit</button>` : ""}
            </div>

            ${editingItem?.status === "rejected" && editingItem?.rejectionReason ? `<div class="contrib-feedback contrib-feedback--form">
              <strong>${icon("alert-circle", "icon--xs")} Admin feedback</strong>
              <p>${escapeHtml(editingItem.rejectionReason)}</p>
            </div>` : ""}

            <form class="admin-editor" id="contrib-form" data-contrib-form novalidate>
              <div class="admin-editor__section">
                <div class="field-row">
                  <label class="field">
                    <span class="field__label">Your contributor name</span>
                    <input class="input" name="contributorName" value="${escapeAttr(defaultContributorName)}" maxlength="100" required placeholder="e.g. Ananya Rao" data-contrib-name />
                    <span class="field__hint">Saved to your profile &amp; shown in the Contributors list as <strong>Contributor</strong>.</span>
                  </label>
                  <label class="field">
                    <span class="field__label">Profile link <small>(optional)</small></span>
                    <input class="input" name="contributorLink" type="url" value="${escapeAttr(defaultContributorLink)}" maxlength="2048" placeholder="https://linkedin.com/in/…" />
                  </label>
                </div>

                <div class="field">
                  <span class="field__label">Subject</span>
                  ${subjectPickerHTML({
                    subjects,
                    years,
                    branches,
                    value: defaultSubjectId,
                    name: "subjectId",
                    dataAttr: "data-contrib-subject",
                    placeholder: "Search & select a subject…",
                  })}
                </div>

                <div class="field-row">
                  <label class="field">
                    <span class="field__label">Document type</span>
                    <select class="select" name="type" data-contrib-type>
                      ${DOC_TYPES.map((type) => `<option value="${escapeAttr(type.value)}" ${type.value === defaultType ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}
                    </select>
                  </label>
                  <label class="field">
                    <span class="field__label">Pages <small>(optional)</small></span>
                    <input class="input" name="pages" type="number" min="0" step="1" value="${escapeAttr(defaultPages)}" placeholder="42" />
                  </label>
                </div>

                <label class="field">
                  <span class="field__label">Document title</span>
                  <input class="input" name="title" data-contrib-title value="${escapeAttr(defaultTitle)}" maxlength="180" required placeholder="e.g. Data Structures — Complete Unit 1–5 Notes" />
                </label>

                <div class="contrib-source">
                  <div class="contrib-source__tabs" role="tablist" aria-label="PDF source method">
                    ${configured ? `<button class="chip chip--interactive ${sourceMode === "upload" ? "is-active" : ""}" type="button" data-source-mode="upload">${icon("upload-cloud", "icon--xs")} Upload PDF via your Drive</button>` : ""}
                    <button class="chip chip--interactive ${sourceMode === "link" ? "is-active" : ""}" type="button" data-source-mode="link">${icon("link", "icon--xs")} Paste Drive PDF link</button>
                  </div>

                  ${sourceMode === "upload" && configured ? `<div class="contrib-drive-box">
                    <div class="contrib-drive-bar">
                      <div>
                        <p class="contrib-drive-bar__label">Your Google Drive</p>
                        <p class="contrib-drive-bar__value" data-contrib-drive-email>${escapeHtml(driveAccount?.emailAddress || "Connect when you submit, or connect now")}</p>
                      </div>
                      <div class="contrib-drive-bar__actions">
                        <button class="btn btn--white btn--xs" type="button" data-contrib-connect-drive>
                          ${icon(driveAccount ? "refresh-cw" : "link", "icon--xs")} ${driveAccount ? "Switch account" : "Connect Drive"}
                        </button>
                      </div>
                    </div>

                    ${editingItem?.driveFileId && !selectedFile ? `<div class="notice" style="margin-bottom:10px">
                      Existing Drive PDF is still attached. Drop a new PDF below only if you want to replace it.
                    </div>` : ""}

                    <div class="upload-zone" data-contrib-dropzone tabindex="0" role="button">
                      <span class="upload-zone__icon">${icon("upload")}</span>
                      <span class="upload-zone__title">${selectedFile ? escapeHtml(selectedFile.name) : "Drop your PDF here or tap to browse"}</span>
                      <span class="upload-zone__text">${selectedFile
                        ? `${formatBytes(selectedFile.size)} · Ready to upload to “Academix Contributions” in your Drive`
                        : `PDF only, up to ${maxMB} MB · Saved view-only in your Google Drive`}</span>
                      <input type="file" accept="application/pdf,.pdf" hidden data-contrib-file-input />
                    </div>

                    <div class="upload-queue" data-contrib-upload-progress></div>
                  </div>` : `<div class="contrib-link-box">
                    <label class="field">
                      <span class="field__label">Google Drive PDF link or File ID</span>
                      <div class="field-inline">
                        <input class="input" name="driveLink" data-contrib-link-input value="${escapeAttr(defaultDriveLink)}" placeholder="https://drive.google.com/file/d/…/view" />
                        <button class="btn btn--white btn--sm" type="button" data-contrib-check-link>Check link</button>
                      </div>
                      <span class="field__hint">Set sharing on Google Drive to <strong>Anyone with the link → Viewer</strong>.</span>
                    </label>
                    <div class="drive-check" data-contrib-link-check></div>
                  </div>`}
                </div>

                <label class="field">
                  <span class="field__label">Description <small>(optional)</small></span>
                  <textarea class="textarea" name="description" rows="2" maxlength="600" placeholder="What units, syllabus, or topics does this PDF cover?">${escapeHtml(defaultDesc)}</textarea>
                </label>

                <label class="field">
                  <span class="field__label">Tags <small>(optional, comma separated)</small></span>
                  <input class="input" name="tags" value="${escapeAttr(defaultTags)}" placeholder="unit-1, handwritten, exam-prep" />
                </label>

                <div class="notice">
                  Submissions are checked by an admin before publishing. If rejected, the submission and admin feedback return right here so you can fix and resubmit.
                </div>

                <div class="contrib-form__actions">
                  ${editingItem ? `<button class="btn btn--white" type="button" data-cancel-edit>Cancel</button>` : ""}
                  <button class="btn btn--primary" type="submit" data-contrib-submit ${!subjects.length ? "disabled" : ""}>
                    ${icon("send", "icon--xs")} ${editingItem ? "Resubmit for review" : sourceMode === "upload" ? "Upload & submit for review" : "Submit for review"}
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section class="contrib-card">
            <div class="contrib-card__head">
              <div>
                <h2 class="contrib-card__title">Your contributions</h2>
                <p class="contrib-card__sub">Track pending reviews, open approved library links, or fix rejected submissions.</p>
              </div>
            </div>

            <div class="chip-row no-scrollbar contrib-filter-tabs" role="tablist" aria-label="Filter your submissions">
              <button class="chip chip--interactive ${statusFilter === "all" ? "is-active" : ""}" type="button" data-contrib-filter="all">All (${myContributions.length})</button>
              <button class="chip chip--interactive ${statusFilter === "pending" ? "is-active" : ""}" type="button" data-contrib-filter="pending">Pending (${pendingCount})</button>
              <button class="chip chip--interactive ${statusFilter === "approved" ? "is-active" : ""}" type="button" data-contrib-filter="approved">Approved (${approvedCount})</button>
              <button class="chip chip--interactive ${statusFilter === "rejected" ? "is-active" : ""}" type="button" data-contrib-filter="rejected">Rejected (${rejectedCount})</button>
            </div>

            ${filteredItems.length ? `<div class="contrib-list">
              ${filteredItems.map((item) => contributionCardHTML(item, subjectMap, years, branches)).join("")}
            </div>` : emptyStateHTML({
              small: true,
              icon: statusFilter === "rejected" ? "check-circle" : "upload-cloud",
              title: myContributions.length ? `No ${statusFilter} submissions` : "No contributions yet",
              text: myContributions.length
                ? "Switch filter tabs above to view your other submissions."
                : "Your uploaded and linked PDFs will show up here with live admin approval status.",
            })}
          </section>
        </div>
      </div>
    </div>`;

    bindEvents();
  };

  const bindEvents = () => {
    const form = root.querySelector("[data-contrib-form]");
    const subjectInput = root.querySelector("[data-contrib-subject]");
    const typeSelect = root.querySelector("[data-contrib-type]");
    const titleInput = root.querySelector("[data-contrib-title]");
    const submitBtn = root.querySelector("[data-contrib-submit]");
    const dropzone = root.querySelector("[data-contrib-dropzone]");
    const fileInput = root.querySelector("[data-contrib-file-input]");
    const progressEl = root.querySelector("[data-contrib-upload-progress]");
    const driveEmailEl = root.querySelector("[data-contrib-drive-email]");
    const linkInput = root.querySelector("[data-contrib-link-input]");
    const linkCheck = root.querySelector("[data-contrib-link-check]");

    if (editingItem && titleInput) {
      titleInput.dataset.manual = "true";
    }

    const syncSuggestedTitle = (subjectId) => {
      if (!titleInput || (titleInput.value.trim() && titleInput.dataset.manual === "true")) return;
      const subject = subjectMap.get(subjectId);
      const type = typeSelect?.value || "main";
      if (subject) {
        titleInput.value = `${subject.name} — ${DOC_TYPE_META[type]?.short || "Document"}`;
        delete titleInput.dataset.manual;
      }
    };

    titleInput?.addEventListener("input", () => {
      if (titleInput.value.trim()) titleInput.dataset.manual = "true";
      else delete titleInput.dataset.manual;
    });

    typeSelect?.addEventListener("change", () => {
      syncSuggestedTitle(subjectInput?.value || "");
    });

    bindSubjectPickers(root, {
      subjects,
      years,
      branches,
      onChange: (nextSubjectId) => syncSuggestedTitle(nextSubjectId),
    });

    root.querySelectorAll("[data-source-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (driveUploading) return;
        sourceMode = btn.dataset.sourceMode;
        render();
      });
    });

    root.querySelectorAll("[data-cancel-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingItem = null;
        selectedFile = null;
        sourceMode = configured ? "upload" : "link";
        render();
      });
    });

    root.querySelector("[data-jump-rejected]")?.addEventListener("click", () => {
      statusFilter = "rejected";
      render();
      root.querySelector(".contrib-filter-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    root.querySelector("[data-contrib-connect-drive]")?.addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      const hadAccount = Boolean(getCachedDriveAccount());
      setButtonLoading(btn, true, hadAccount ? "Switching" : "Connecting");
      try {
        const account = hadAccount
          ? await switchDriveAccount()
          : await connectDrive({ interactive: true, verifyUploader: false });
        if (driveEmailEl && account?.emailAddress) {
          driveEmailEl.textContent = account.emailAddress;
        }
        toast(`Google Drive connected as ${account?.emailAddress || "your account"}.`, { type: "success" });
        btn.innerHTML = `${icon("refresh-cw", "icon--xs")} Switch account`;
      } catch (error) {
        toast(error?.message || "Could not connect Google Drive. You can also use “Paste Drive PDF link”.", { type: "error", duration: 7000 });
      } finally {
        setButtonLoading(btn, false);
      }
    });

    const handlePickedFile = (fileList) => {
      const file = fileList?.[0] || null;
      if (!file) return;
      const err = validatePdfFile(file);
      if (err) {
        toast(err, { type: "error" });
        return;
      }
      selectedFile = file;
      const titleEl = dropzone?.querySelector(".upload-zone__title");
      const textEl = dropzone?.querySelector(".upload-zone__text");
      if (titleEl) titleEl.textContent = file.name;
      if (textEl) textEl.textContent = `${formatBytes(file.size)} · Ready to upload to “Academix Contributions” in your Drive`;
      if (titleInput && !titleInput.value.trim()) {
        const subject = subjectMap.get(subjectInput?.value || "");
        if (subject) syncSuggestedTitle(subject.id);
        else {
          titleInput.value = file.name.replace(/\.pdf$/i, "");
        }
      }
    };

    dropzone?.addEventListener("click", () => fileInput?.click());
    dropzone?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput?.click();
      }
    });
    fileInput?.addEventListener("change", () => handlePickedFile(fileInput.files));
    ["dragenter", "dragover"].forEach((name) => dropzone?.addEventListener(name, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach((name) => dropzone?.addEventListener(name, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragging");
    }));
    dropzone?.addEventListener("drop", (event) => {
      if (event.dataTransfer?.files?.length) handlePickedFile(event.dataTransfer.files);
    });

    root.querySelector("[data-contrib-check-link]")?.addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      const fileId = extractDriveId(linkInput?.value || "");
      if (!fileId) {
        if (linkCheck) {
          linkCheck.className = "drive-check is-error";
          linkCheck.innerHTML = `${icon("alert-circle")} Enter a valid Google Drive file link or ID.`;
        }
        return;
      }
      setButtonLoading(btn, true, "Checking");
      const result = await checkDriveLinkAccessible(fileId);
      setButtonLoading(btn, false);
      if (linkCheck) {
        linkCheck.className = `drive-check ${result.status === "ok" ? "is-ok" : result.status === "warning" ? "is-warning" : "is-error"}`;
        linkCheck.innerHTML = `${icon(result.status === "ok" ? "check-circle" : "alert-circle")} ${escapeHtml(result.message)}`;
      }
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (driveUploading) return;
      const data = new FormData(form);
      const contributorName = String(data.get("contributorName") || "").trim();
      const contributorLink = String(data.get("contributorLink") || "").trim();
      const subjectId = String(data.get("subjectId") || "").trim();
      const subject = subjectMap.get(subjectId);
      const type = String(data.get("type") || "other");
      const title = String(data.get("title") || "").trim();
      const description = String(data.get("description") || "").trim();
      const pages = Number(data.get("pages") || 0);
      const tags = String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean);

      if (contributorName.length < 2) {
        toast("Enter your contributor name (at least 2 characters).", { type: "error" });
        return;
      }
      if (!subject) {
        toast("Select the subject these notes belong to.", { type: "error" });
        return;
      }
      if (title.length < 3) {
        toast("Enter a clear title for this document.", { type: "error" });
        return;
      }

      let driveFileId = "";
      let sizeLabel = editingItem?.sizeLabel || "";
      let uploadedBy = editingItem?.uploadedBy || profile.email || "";
      let driveSource = sourceMode === "upload" ? "upload" : "link";

      if (sourceMode === "upload" && configured) {
        if (!selectedFile && editingItem?.driveFileId && isValidDriveId(editingItem.driveFileId)) {
          driveFileId = editingItem.driveFileId;
          driveSource = editingItem.driveSource || "upload";
        } else {
          if (!selectedFile) {
            toast("Drop or choose a PDF file to upload, or switch to “Paste Drive PDF link”.", { type: "error" });
            return;
          }
          const fileErr = validatePdfFile(selectedFile);
          if (fileErr) {
            toast(fileErr, { type: "error" });
            return;
          }
          driveUploading = true;
          uploadAbortController = new AbortController();
          setButtonLoading(submitBtn, true, "Uploading PDF…");
          const renderUploadRow = (statusText, pct, isError = false, isDone = false) => {
            if (!progressEl) return;
            progressEl.innerHTML = `<div class="upload-queue__row ${isDone ? "is-done" : ""} ${isError ? "is-error" : ""}">
              <span class="upload-queue__icon">${icon("file-text")}</span>
              <span class="upload-queue__copy">
                <span class="upload-queue__name">${escapeHtml(selectedFile.name)}</span>
                <span class="upload-queue__meta">${formatBytes(selectedFile.size)} <span>${escapeHtml(statusText)}</span></span>
                <span class="upload-queue__bar"><span class="upload-queue__fill" style="width:${pct}%"></span></span>
              </span>
            </div>`;
          };

          try {
            renderUploadRow("Connecting Google Drive…", 0);
            await connectDrive({ interactive: true, verifyUploader: false });
            const year = years.find((item) => item.id === subject.yearId);
            const branch = branches.find((item) => (subject.branchIds || [])[0] === item.id);
            const folderSegments = [
              year?.name || "Year",
              `Sem ${subject.semester || 1}`,
              branch?.shortName || branch?.name || "General",
            ];
            renderUploadRow("Uploading… 0%", 0);
            const uploaded = await uploadPdf({
              file: selectedFile,
              subject,
              type,
              folderSegments,
              expectedUploaderEmail: "",
              cacheFoldersInSettings: false,
              rootFolderName: "Academix Contributions",
              signal: uploadAbortController.signal,
              onProgress: ({ percent }) => {
                uploadProgress = percent;
                renderUploadRow(`Uploading… ${uploadProgress}%`, uploadProgress);
              },
            });
            driveFileId = uploaded.id;
            sizeLabel = uploaded.sizeLabel || "";
            uploadedBy = uploaded.uploadedBy || uploadedBy;
            renderUploadRow("Uploaded to your Drive", 100, false, true);
          } catch (error) {
            driveUploading = false;
            uploadAbortController = null;
            setButtonLoading(submitBtn, false);
            renderUploadRow(error?.message || "Upload failed.", 0, true, false);
            toast(error?.message || "Could not upload to Google Drive. Try “Paste Drive PDF link” instead.", { type: "error", duration: 7000 });
            return;
          }
          driveUploading = false;
          uploadAbortController = null;
        }
      } else {
        const rawLink = String(data.get("driveLink") || "");
        const extracted = extractDriveId(rawLink);
        if (!isValidDriveId(extracted)) {
          toast("Enter a valid Google Drive file link or file ID.", { type: "error" });
          return;
        }
        driveFileId = extracted;
        driveSource = "link";
      }

      setButtonLoading(submitBtn, true, editingItem ? "Resubmitting…" : "Submitting…");
      try {
        await updateOwnProfile(uid, { contributorName, contributorLink }).catch(() => {});
        state.profile = { ...state.profile, contributorName, contributorLink };
        await submitContribution(editingItem?.id || null, {
          subjectId: subject.id,
          title,
          description,
          type,
          driveFileId,
          driveSource,
          pages,
          sizeLabel,
          tags,
          contributorName,
          contributorLink,
          uploadedBy,
        }, { uid, email: profile.email || state.user?.email || "", photoURL: profile.photoURL || "" });

        toast(
          editingItem
            ? "Resubmitted for admin review."
            : "Submitted! An admin will review and publish your notes soon.",
          { type: "success", duration: 5000 },
        );
        editingItem = null;
        selectedFile = null;
        myContributions = await fetchMyContributions(uid);
        render();
      } catch (error) {
        setButtonLoading(submitBtn, false);
        toast(error?.message || "Your submission could not be saved.", { type: "error" });
      }
    });

    root.querySelectorAll("[data-contrib-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        statusFilter = btn.dataset.contribFilter || "all";
        render();
      });
    });

    root.querySelectorAll("[data-preview-contrib]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = myContributions.find((entry) => entry.id === btn.dataset.previewContrib);
        if (!item) return;
        const subject = subjectMap.get(item.subjectId);
        openSheet({
          title: item.title || "Contribution preview",
          subtitle: `${subject?.name || "Subject"} · Contributor: ${item.contributorName || "Contributor"}`,
          size: "wide",
          content: `${item.status === "rejected" && item.rejectionReason ? `<div class="contrib-feedback" style="margin-bottom:12px"><strong>${icon("alert-circle", "icon--xs")} Admin feedback</strong><p>${escapeHtml(item.rejectionReason)}</p></div>` : ""}
            ${drivePreviewFrameHTML(item.driveFileId, item.title || "PDF preview", item.id)}`,
          footer: `<button class="btn btn--white" type="button" data-close-preview>Close</button>`,
          onMount(sheet, close) {
            sheet.querySelector("[data-close-preview]")?.addEventListener("click", () => close());
          },
        });
      });
    });

    root.querySelectorAll("[data-edit-contrib]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = myContributions.find((entry) => entry.id === btn.dataset.editContrib);
        if (!item) return;
        editingItem = item;
        selectedFile = null;
        sourceMode = item.driveSource === "upload" && configured ? "upload" : "link";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    root.querySelectorAll("[data-delete-contrib]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const item = myContributions.find((entry) => entry.id === btn.dataset.deleteContrib);
        if (!item) return;
        const confirmed = await confirmDialog({
          title: "Remove submission?",
          message: `“${item.title || "This submission"}” will be removed from Academix review. Your Drive file itself stays safe in your Google Drive.`,
          confirmText: "Remove",
          danger: true,
        });
        if (!confirmed) return;
        setButtonLoading(btn, true);
        try {
          await deleteContribution(item.id);
          if (editingItem?.id === item.id) editingItem = null;
          myContributions = myContributions.filter((entry) => entry.id !== item.id);
          toast("Submission removed.", { type: "success" });
          render();
        } catch (error) {
          setButtonLoading(btn, false);
          toast(error?.message || "Could not remove submission.", { type: "error" });
        }
      });
    });
  };

  render();

  return () => {
    uploadAbortController?.abort();
  };
}

function contributionCardHTML(item, subjectMap, years, branches) {
  const subject = subjectMap.get(item.subjectId);
  const status = contributionStatusMeta(item.status);
  const subjectMeta = subject ? subjectContextMeta(subject, years, branches) : "";
  const isApproved = item.status === "approved";
  const isRejected = item.status === "rejected";

  return `<article class="contrib-item contrib-item--${escapeAttr(item.status || "pending")}">
    <div class="contrib-item__top">
      <div class="contrib-item__badges">
        <span class="status-chip ${status.chipClass}">${escapeHtml(status.label)}</span>
        ${typeChipHTML(item.type)}
      </div>
      <span class="contrib-item__time">${escapeHtml(relativeTime(item.updatedAt || item.createdAt))}</span>
    </div>

    <h3 class="contrib-item__title">${escapeHtml(item.title || "Untitled notes")}</h3>
    <p class="contrib-item__meta">
      <strong>${escapeHtml(subject?.name || "Unknown subject")}</strong>${subjectMeta ? ` · ${escapeHtml(subjectMeta)}` : ""}
    </p>
    <p class="contrib-item__meta">
      Credited as <strong>${escapeHtml(item.contributorName || "Contributor")}</strong> (Contributor)
      ${item.sizeLabel ? ` · ${escapeHtml(item.sizeLabel)}` : ""}
      ${Number(item.pages) > 0 ? ` · ${Number(item.pages)} pages` : ""}
    </p>

    ${isRejected ? `<div class="contrib-feedback">
      <strong>${icon("alert-circle", "icon--xs")} Returned by admin</strong>
      <p>${escapeHtml(item.rejectionReason || "Please review the details or PDF quality and resubmit.")}</p>
    </div>` : ""}

    <div class="contrib-item__actions">
      <button class="btn btn--white btn--xs" type="button" data-preview-contrib="${escapeAttr(item.id)}">${icon("eye", "icon--xs")} Preview PDF</button>
      ${isApproved && item.approvedDocId ? `<a class="btn btn--primary btn--xs" href="#/viewer/${escapeAttr(item.approvedDocId)}">${icon("book-open", "icon--xs")} Open in library</a>` : ""}
      ${isApproved && item.subjectId ? `<a class="btn btn--white btn--xs" href="#/subject/${escapeAttr(item.subjectId)}">${icon("arrow-right", "icon--xs")} View subject</a>` : ""}
      ${!isApproved ? `<button class="btn btn--white btn--xs" type="button" data-edit-contrib="${escapeAttr(item.id)}">${icon("edit", "icon--xs")} ${isRejected ? "Edit & resubmit" : "Edit"}</button>` : ""}
      ${!isApproved ? `<button class="btn btn--white btn--xs contrib-btn-danger" type="button" data-delete-contrib="${escapeAttr(item.id)}">${icon("trash", "icon--xs")} Remove</button>` : ""}
    </div>
  </article>`;
}


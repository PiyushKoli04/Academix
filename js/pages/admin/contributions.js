import {
  approveContribution,
  deleteContribution,
  fetchAllContributions,
  fetchAllSubjects,
  fetchBranches,
  fetchContributors,
  fetchYears,
  rejectContribution,
} from "../../db.js";
import { checkDriveLinkAccessible } from "../../drive.js";
import {
  DOC_TYPES,
  avatarHTML,
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
import {
  adminEmptyHTML,
  adminHeaderHTML,
  adminPageClose,
  adminPageOpen,
  bindSubjectPickers,
  contributionStatusMeta,
  drivePreviewFrameHTML,
  subjectContextMeta,
  subjectPickerHTML,
} from "./shared.js";

const REJECT_PRESETS = [
  "Drive link is private — set sharing to Anyone with the link (Viewer) and resubmit.",
  "Scan or PDF text is blurry/unreadable. Please upload a clearer PDF.",
  "Wrong subject or document type selected. Please update and resubmit.",
  "Duplicate — complete notes for this subject are already published in the library.",
  "Incomplete or missing chapters/pages.",
];

export async function renderContributions(main, context) {
  let contributions = [];
  let subjects = [];

  if (!context.state.years?.length || !context.state.branches?.length) {
    const [yearsData, branchesData] = await Promise.all([
      fetchYears().catch(() => []),
      fetchBranches().catch(() => []),
    ]);
    if (yearsData.length) context.state.years = yearsData;
    if (branchesData.length) context.state.branches = branchesData;
  }

  try {
    [contributions, subjects] = await Promise.all([
      fetchAllContributions(),
      fetchAllSubjects(),
    ]);
  } catch (error) {
    if (!location.hash.startsWith("#/admin/contributions")) return;
    main.innerHTML = `${adminPageOpen("contributions")}
      ${adminHeaderHTML({
        title: '<span class="fw-light">Contributed</span> <strong>notes review.</strong>',
        subtitle: "View student-uploaded PDFs, approve them into the library, or return them with feedback.",
      })}
      ${adminEmptyHTML({
        iconName: "alert-triangle",
        title: "Contributions couldn’t be loaded",
        text: error?.code === "permission-denied"
          ? "Deploy the updated Firestore security rules so admins can read the contributions collection."
          : error?.message || "A database error interrupted loading submissions.",
      })}
    ${adminPageClose()}`;
    return;
  }

  if (!location.hash.startsWith("#/admin/contributions")) return;

  const years = context.state.years || [];
  const branches = context.state.branches || [];
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  let statusFilter = "pending";
  let searchQuery = "";

  const refreshAndRender = async () => {
    contributions = await fetchAllContributions();
    if (!location.hash.startsWith("#/admin/contributions")) return;
    renderView();
  };

  const renderView = () => {
    const pendingCount = contributions.filter((c) => c.status === "pending").length;
    const approvedCount = contributions.filter((c) => c.status === "approved").length;
    const rejectedCount = contributions.filter((c) => c.status === "rejected").length;

    const needle = searchQuery.trim().toLowerCase();
    const visible = contributions.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!needle) return true;
      const subject = subjectMap.get(item.subjectId);
      return [
        item.title,
        item.contributorName,
        item.userEmail,
        item.description,
        subject?.name,
        subject?.code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    main.innerHTML = `${adminPageOpen("contributions")}
      ${adminHeaderHTML({
        title: '<span class="fw-light">Contributed</span> <strong>notes review.</strong>',
        subtitle: "Preview PDFs submitted by students via Google Drive. Approving publishes to the library and credits the user as a Contributor; rejecting sends it back to them.",
        actions: `<a class="btn btn--white btn--sm" href="#/admin/contributors">${icon("users")} Contributors list</a>`,
      })}

      <div class="admin-toolbar">
        <div class="chip-row no-scrollbar" role="tablist" aria-label="Filter submissions by status">
          <button class="chip chip--interactive ${statusFilter === "pending" ? "is-active" : ""}" type="button" data-review-status="pending">Pending (${pendingCount})</button>
          <button class="chip chip--interactive ${statusFilter === "approved" ? "is-active" : ""}" type="button" data-review-status="approved">Approved (${approvedCount})</button>
          <button class="chip chip--interactive ${statusFilter === "rejected" ? "is-active" : ""}" type="button" data-review-status="rejected">Rejected (${rejectedCount})</button>
          <button class="chip chip--interactive ${statusFilter === "all" ? "is-active" : ""}" type="button" data-review-status="all">All (${contributions.length})</button>
        </div>
        <label class="admin-toolbar__search">
          ${icon("search")}
          <input class="input" type="search" placeholder="Search title, contributor, email, or subject…" value="${escapeAttr(searchQuery)}" data-review-search autocomplete="off" />
        </label>
      </div>

      ${visible.length ? `<div class="review-list">
        ${visible.map((item) => reviewRowHTML(item, subjectMap, years, branches)).join("")}
      </div>` : adminEmptyHTML({
        iconName: statusFilter === "pending" ? "check-circle" : "inbox",
        title: statusFilter === "pending" ? "No pending contributions" : "No matching submissions",
        text: statusFilter === "pending"
          ? "Every submitted note has been reviewed. Check Approved or Rejected tabs to view history."
          : "Try clearing the search query or switching status tabs.",
        actions: statusFilter === "pending" && contributions.length
          ? `<button class="btn btn--white btn--sm" type="button" data-review-show-all>View all (${contributions.length})</button>`
          : "",
      })}
    ${adminPageClose()}`;

    bindViewEvents();
  };

  const handleApprove = async (item, edits = {}, button = null) => {
    const actorUid = context.state.profile?.uid || "";
    if (button) setButtonLoading(button, true, "Approving");
    try {
      await approveContribution(item, edits, actorUid);
      context.state.contributors = await fetchContributors().catch(() => context.state.contributors);
      toast(`Approved “${edits.title || item.title}” and added ${edits.contributorName || item.contributorName} as Contributor.`, {
        type: "success",
        duration: 5000,
      });
      await refreshAndRender();
      return true;
    } catch (error) {
      if (button) setButtonLoading(button, false);
      toast(error?.message || "The contribution could not be approved.", { type: "error" });
      return false;
    }
  };

  const openRejectSheet = (item, onRejected = null) => {
    openSheet({
      title: "Reject contribution",
      subtitle: `Return “${item.title || "Untitled"}” to ${item.contributorName || "the user"} with helpful feedback.`,
      content: `<form class="admin-editor" data-reject-form>
        <div class="admin-editor__section">
          <p class="field__label">Quick feedback presets</p>
          <div class="review-presets">
            ${REJECT_PRESETS.map((preset) => `<button class="chip chip--interactive review-preset-btn" type="button" data-reject-preset="${escapeAttr(preset)}">${escapeHtml(preset)}</button>`).join("")}
          </div>
          <label class="field">
            <span class="field__label">Reason shown to contributor</span>
            <textarea class="textarea" name="reason" rows="3" maxlength="600" required placeholder="Explain what needs fixing so the contributor can edit and resubmit…" data-reject-reason></textarea>
          </label>
        </div>
      </form>`,
      footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit" form="reject-form" data-confirm-reject style="background:var(--red);border-color:var(--red);color:#fff">Reject &amp; return to user</button>`,
      onMount(sheet, close) {
        const form = sheet.querySelector("[data-reject-form]");
        form.id = "reject-form";
        const textarea = sheet.querySelector("[data-reject-reason]");
        const confirmBtn = sheet.querySelector("[data-confirm-reject]");
        sheet.querySelector("[data-cancel]")?.addEventListener("click", () => close());
        sheet.querySelectorAll("[data-reject-preset]").forEach((btn) => {
          btn.addEventListener("click", () => {
            if (textarea) {
              textarea.value = btn.dataset.rejectPreset || "";
              textarea.focus();
            }
          });
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const reason = String(textarea?.value || "").trim();
          if (!reason) {
            toast("Enter a short reason so the contributor knows what to fix.", { type: "error" });
            return;
          }
          setButtonLoading(confirmBtn, true, "Rejecting");
          try {
            await rejectContribution(item.id, reason, context.state.profile?.uid || "");
            close();
            toast("Submission rejected and returned to the contributor.", { type: "info" });
            onRejected?.();
            await refreshAndRender();
          } catch (error) {
            setButtonLoading(confirmBtn, false);
            toast(error?.message || "Could not reject contribution.", { type: "error" });
          }
        });
      },
    });
  };

  const openReviewSheet = (item) => {
    const canModerate = item.status !== "approved";
    openSheet({
      title: item.title || "Review contribution",
      subtitle: `Submitted by ${item.contributorName || "Contributor"}${item.userEmail ? ` (${item.userEmail})` : ""} · ${relativeTime(item.updatedAt || item.createdAt)}`,
      size: "wide",
      content: `<div class="review-modal">
        ${drivePreviewFrameHTML(item.driveFileId, item.title || "Contribution preview", item.id)}

        <div class="review-modal__check-row">
          <button class="btn btn--white btn--xs" type="button" data-review-check-drive>${icon("check-circle", "icon--xs")} Verify public Drive access</button>
          <span class="review-modal__drive-result" data-review-drive-result></span>
        </div>

        <form class="admin-editor" data-review-edit-form>
          <div class="admin-editor__section">
            <div class="field">
              <span class="field__label">Subject</span>
              ${subjectPickerHTML({
                subjects,
                years,
                branches,
                value: item.subjectId,
                name: "subjectId",
                disabled: !canModerate,
              })}
            </div>
            <div class="field-row">
              <label class="field">
                <span class="field__label">Document type</span>
                <select class="select" name="type" ${!canModerate ? "disabled" : ""}>
                  ${DOC_TYPES.map((type) => `<option value="${escapeAttr(type.value)}" ${type.value === item.type ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <span class="field__label">Pages</span>
                <input class="input" name="pages" type="number" min="0" value="${escapeAttr(item.pages || 0)}" ${!canModerate ? "disabled" : ""} />
              </label>
            </div>
            <div class="field-row">
              <label class="field">
                <span class="field__label">Document title</span>
                <input class="input" name="title" value="${escapeAttr(item.title || "")}" maxlength="180" ${!canModerate ? "disabled" : ""} />
              </label>
              <label class="field">
                <span class="field__label">Contributor credit name</span>
                <input class="input" name="contributorName" value="${escapeAttr(item.contributorName || "")}" maxlength="100" ${!canModerate ? "disabled" : ""} />
              </label>
            </div>
            <label class="field">
              <span class="field__label">Description</span>
              <textarea class="textarea" name="description" rows="2" maxlength="600" ${!canModerate ? "disabled" : ""}>${escapeHtml(item.description || "")}</textarea>
            </label>
          </div>
        </form>
      </div>`,
      footer: canModerate
        ? `<button class="btn btn--white" type="button" data-close-review>Close</button>
           <button class="btn btn--white" type="button" data-modal-reject style="color:var(--red)">${icon("x-circle", "icon--xs")} Reject</button>
           <button class="btn btn--primary" type="button" data-modal-approve>${icon("check-circle", "icon--xs")} Approve &amp; publish</button>`
        : `<button class="btn btn--white" type="button" data-close-review>Close</button>
           ${item.approvedDocId ? `<a class="btn btn--primary" href="#/viewer/${escapeAttr(item.approvedDocId)}">${icon("book-open", "icon--xs")} Open live PDF</a>` : ""}`,
      onMount(sheet, close) {
        bindSubjectPickers(sheet, { subjects, years, branches });
        sheet.querySelector("[data-close-review]")?.addEventListener("click", () => close());

        sheet.querySelector("[data-review-check-drive]")?.addEventListener("click", async (event) => {
          const btn = event.currentTarget;
          const resultEl = sheet.querySelector("[data-review-drive-result]");
          setButtonLoading(btn, true, "Checking");
          const check = await checkDriveLinkAccessible(item.driveFileId);
          setButtonLoading(btn, false);
          if (resultEl) {
            resultEl.textContent = check.message;
            resultEl.className = `review-modal__drive-result is-${check.status}`;
          }
        });

        sheet.querySelector("[data-modal-reject]")?.addEventListener("click", () => {
          close();
          openRejectSheet(item);
        });

        sheet.querySelector("[data-modal-approve]")?.addEventListener("click", async (event) => {
          const btn = event.currentTarget;
          const form = sheet.querySelector("[data-review-edit-form]");
          const data = form ? new FormData(form) : new FormData();
          const edits = {
            subjectId: String(data.get("subjectId") || item.subjectId || "").trim(),
            type: String(data.get("type") || item.type || "other"),
            pages: Number(data.get("pages") || item.pages || 0),
            title: String(data.get("title") || item.title || "").trim(),
            contributorName: String(data.get("contributorName") || item.contributorName || "").trim(),
            description: String(data.get("description") || item.description || "").trim(),
          };
          const ok = await handleApprove(item, edits, btn);
          if (ok) close();
        });
      },
    });
  };

  const bindViewEvents = () => {
    main.querySelectorAll("[data-review-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        statusFilter = btn.dataset.reviewStatus || "pending";
        renderView();
      });
    });

    main.querySelector("[data-review-show-all]")?.addEventListener("click", () => {
      statusFilter = "all";
      renderView();
    });

    const searchInput = main.querySelector("[data-review-search]");
    searchInput?.addEventListener("input", () => {
      searchQuery = searchInput.value;
      renderView();
      const refreshedInput = main.querySelector("[data-review-search]");
      if (refreshedInput) {
        refreshedInput.focus();
        refreshedInput.setSelectionRange(searchQuery.length, searchQuery.length);
      }
    });

    main.querySelectorAll("[data-view-contrib]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = contributions.find((c) => c.id === btn.dataset.viewContrib);
        if (item) openReviewSheet(item);
      });
    });

    main.querySelectorAll("[data-approve-contrib]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const item = contributions.find((c) => c.id === btn.dataset.approveContrib);
        if (!item) return;
        const confirmed = await confirmDialog({
          title: "Approve & publish to library?",
          message: `“${item.title}” will appear in the library and ${item.contributorName || "this user"} will be added to Contributors as Contributor.`,
          confirmText: "Approve & publish",
        });
        if (!confirmed) return;
        await handleApprove(item, {}, btn);
      });
    });

    main.querySelectorAll("[data-reject-contrib]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = contributions.find((c) => c.id === btn.dataset.rejectContrib);
        if (item) openRejectSheet(item);
      });
    });

    main.querySelectorAll("[data-remove-contrib]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const item = contributions.find((c) => c.id === btn.dataset.removeContrib);
        if (!item) return;
        const confirmed = await confirmDialog({
          title: "Delete submission record?",
          message: `Remove “${item.title}” from the review queue log?`,
          confirmText: "Delete record",
          danger: true,
        });
        if (!confirmed) return;
        setButtonLoading(btn, true);
        try {
          await deleteContribution(item.id);
          toast("Submission record deleted.", { type: "success" });
          await refreshAndRender();
        } catch (error) {
          setButtonLoading(btn, false);
          toast(error?.message || "Could not delete record.", { type: "error" });
        }
      });
    });
  };

  renderView();
}

function reviewRowHTML(item, subjectMap, years, branches) {
  const subject = subjectMap.get(item.subjectId);
  const status = contributionStatusMeta(item.status);
  const subjectMeta = subject ? subjectContextMeta(subject, years, branches) : "";
  const isPending = item.status === "pending";
  const isApproved = item.status === "approved";

  return `<article class="review-card review-card--${escapeAttr(item.status || "pending")}">
    <div class="review-card__top">
      <div class="review-card__badges">
        <span class="status-chip ${status.chipClass}">${escapeHtml(status.short)}</span>
        ${typeChipHTML(item.type)}
        <span class="role-badge">${item.driveSource === "upload" ? "Uploaded via Drive" : "Drive link"}</span>
      </div>
      <span class="review-card__time">${escapeHtml(relativeTime(item.updatedAt || item.createdAt))}</span>
    </div>

    <div class="review-card__body">
      <div class="review-card__main">
        <h2 class="review-card__title">${escapeHtml(item.title || "Untitled submission")}</h2>
        <p class="review-card__meta">
          <strong>${escapeHtml(subject?.name || "Unknown subject")}</strong>${subjectMeta ? ` · ${escapeHtml(subjectMeta)}` : ""}
        </p>
        ${item.description ? `<p class="review-card__desc">${escapeHtml(item.description)}</p>` : ""}
        <div class="review-card__contributor">
          ${avatarHTML({ name: item.contributorName, photoURL: item.photoURL }, { size: "sm" })}
          <div class="review-card__contributor-copy">
            <span><strong>${escapeHtml(item.contributorName || "Contributor")}</strong> <span class="role-badge">Contributor</span></span>
            <span class="review-card__submeta">${escapeHtml(item.userEmail || "")}${item.sizeLabel ? ` · ${escapeHtml(item.sizeLabel)}` : ""}${Number(item.pages) > 0 ? ` · ${Number(item.pages)} pages` : ""}</span>
          </div>
        </div>
        ${item.status === "rejected" && item.rejectionReason ? `<div class="contrib-feedback">
          <strong>Rejection reason</strong>
          <p>${escapeHtml(item.rejectionReason)}</p>
        </div>` : ""}
      </div>

      <div class="review-card__actions">
        <button class="btn ${isPending ? "btn--primary" : "btn--white"} btn--sm" type="button" data-view-contrib="${escapeAttr(item.id)}">${icon("eye", "icon--xs")} ${isPending ? "View PDF & review" : "View PDF"}</button>
        ${isPending ? `<button class="btn btn--white btn--sm" type="button" data-approve-contrib="${escapeAttr(item.id)}">${icon("check-circle", "icon--xs")} Approve</button>` : ""}
        ${isPending ? `<button class="btn btn--white btn--sm contrib-btn-danger" type="button" data-reject-contrib="${escapeAttr(item.id)}">${icon("x-circle", "icon--xs")} Reject</button>` : ""}
        ${isApproved && item.approvedDocId ? `<a class="btn btn--white btn--sm" href="#/viewer/${escapeAttr(item.approvedDocId)}">${icon("book-open", "icon--xs")} Open live</a>` : ""}
        ${!isPending ? `<button class="icon-btn icon-btn--sm icon-btn--ghost icon-btn--danger" type="button" data-remove-contrib="${escapeAttr(item.id)}" aria-label="Delete submission record">${icon("trash")}</button>` : ""}
      </div>
    </div>
  </article>`;
}


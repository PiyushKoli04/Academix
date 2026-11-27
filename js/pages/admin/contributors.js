import { deleteContributor, fetchContributors, saveContributor } from "../../db.js";
import {
  avatarHTML,
  confirmDialog,
  escapeAttr,
  escapeHtml,
  icon,
  openSheet,
  setButtonLoading,
  toast,
} from "../../ui.js";
import { adminEmptyHTML, adminHeaderHTML, adminPageClose, adminPageOpen } from "./shared.js";

export async function renderContributors(main, context) {
  const contributors = await fetchContributors();
  if (!location.hash.startsWith("#/admin/contributors")) return;
  context.state.contributors = contributors;

  main.innerHTML = `${adminPageOpen("contributors")}
    ${adminHeaderHTML({
      title: '<span class="fw-light">The people behind</span> <strong>the notes.</strong>',
      subtitle: "Credit the students and faculty who share their material. Contributors appear on subject pages and the About screen.",
      actions: `<button class="btn btn--primary btn--sm" type="button" data-add-contributor>${icon("plus")} Add contributor</button>`,
    })}
    ${contributors.length ? `<div class="admin-list-grid">
      ${contributors.map((contributor) => `<article class="admin-person-card">
        ${avatarHTML(contributor, { size: "md" })}
        <div class="admin-person-card__copy">
          <p class="admin-person-card__name">${escapeHtml(contributor.name || "Contributor")}${contributor.uid ? ' <span class="role-badge">Member</span>' : ""}</p>
          <p class="admin-person-card__meta">${escapeHtml(contributor.role || "Contributor")} · ${Number(contributor.uploadsCount) || 0} uploads</p>
          ${contributor.link ? `<p class="admin-person-card__meta">${escapeHtml(contributor.link)}</p>` : ""}
        </div>
        <div class="admin-person-card__actions">
          <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-edit-contributor="${escapeAttr(contributor.id)}" aria-label="Edit ${escapeAttr(contributor.name || "contributor")}">${icon("edit")}</button>
          <button class="icon-btn icon-btn--sm icon-btn--ghost icon-btn--danger" type="button" data-delete-contributor="${escapeAttr(contributor.id)}" aria-label="Delete ${escapeAttr(contributor.name || "contributor")}">${icon("trash")}</button>
        </div>
      </article>`).join("")}
    </div>` : adminEmptyHTML({
      iconName: "users",
      title: "No contributors yet",
      text: "Add the people who share notes so their work gets credited.",
      actions: `<button class="btn btn--primary btn--sm" type="button" data-add-contributor>${icon("plus")} Add contributor</button>`,
    })}
  ${adminPageClose()}`;

  main.querySelectorAll("[data-add-contributor]").forEach((button) => {
    button.addEventListener("click", () => openContributorSheet(main, context, null));
  });
  main.querySelectorAll("[data-edit-contributor]").forEach((button) => {
    button.addEventListener("click", () => {
      const contributor = contributors.find((item) => item.id === button.dataset.editContributor);
      if (contributor) openContributorSheet(main, context, contributor);
    });
  });
  main.querySelectorAll("[data-delete-contributor]").forEach((button) => {
    button.addEventListener("click", async () => {
      const contributor = contributors.find((item) => item.id === button.dataset.deleteContributor);
      if (!contributor) return;
      const confirmed = await confirmDialog({
        title: "Delete contributor?",
        message: `${contributor.name || "This contributor"} will be removed from the credits. Existing documents and subjects will not be deleted.`,
        confirmText: "Delete contributor",
        danger: true,
      });
      if (!confirmed) return;
      setButtonLoading(button, true);
      try {
        await deleteContributor(contributor.id);
        context.state.contributors = contributors.filter((item) => item.id !== contributor.id);
        toast("Contributor removed.", { type: "success" });
        await renderContributors(main, context);
      } catch (error) {
        setButtonLoading(button, false);
        toast(error?.message || "The contributor could not be deleted.", { type: "error" });
      }
    });
  });
}

function openContributorSheet(main, context, contributor) {
  const isEdit = Boolean(contributor?.id);
  openSheet({
    title: isEdit ? "Edit contributor" : "Add contributor",
    subtitle: "A short credit that appears with the notes they shared.",
    size: "wide",
    content: `<form class="admin-editor" data-contributor-form>
      <div class="admin-editor__section">
        <div class="field-row">
          <label class="field">
            <span class="field__label">Name</span>
            <input class="input" name="name" value="${escapeAttr(contributor?.name || "")}" maxlength="100" required placeholder="e.g. Ananya Rao" />
          </label>
          <label class="field">
            <span class="field__label">Role</span>
            <input class="input" name="role" value="${escapeAttr(contributor?.role || "")}" maxlength="80" placeholder="e.g. CSE, 2026" />
          </label>
        </div>
        <label class="field">
          <span class="field__label">Photo URL</span>
          <input class="input" name="photoURL" type="url" value="${escapeAttr(contributor?.photoURL || "")}" maxlength="2048" placeholder="https://…" />
          <span class="field__hint">Optional. Use a public https image URL.</span>
        </label>
        <label class="field">
          <span class="field__label">Profile link</span>
          <input class="input" name="link" type="url" value="${escapeAttr(contributor?.link || "")}" maxlength="2048" placeholder="https://linkedin.com/in/…" />
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field__label">Uploads count</span>
            <input class="input" name="uploadsCount" type="number" min="0" step="1" value="${escapeAttr(contributor?.uploadsCount || 0)}" />
          </label>
          <label class="field">
            <span class="field__label">Order</span>
            <input class="input" name="order" type="number" step="1" value="${escapeAttr(contributor?.order ?? 0)}" />
          </label>
        </div>
      </div>
    </form>`,
    footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit" form="contributor-form" data-save-contributor>${isEdit ? "Save changes" : "Add contributor"}</button>`,
    onMount(sheet, close) {
      const form = sheet.querySelector("[data-contributor-form]");
      form.id = "contributor-form";
      const saveButton = sheet.querySelector("[data-save-contributor]");
      sheet.querySelector("[data-cancel]")?.addEventListener("click", () => close());
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const name = String(data.get("name") || "").trim();
        if (!name) {
          toast("Contributor name is required.", { type: "error" });
          return;
        }
        setButtonLoading(saveButton, true, "Saving");
        try {
          await saveContributor(contributor?.id || null, {
            name,
            role: String(data.get("role") || ""),
            photoURL: String(data.get("photoURL") || ""),
            link: String(data.get("link") || ""),
            uploadsCount: Number(data.get("uploadsCount") || 0),
            order: Number(data.get("order") || 0),
          });
          close();
          toast(isEdit ? "Contributor updated." : "Contributor added.", { type: "success" });
          await renderContributors(main, context);
        } catch (error) {
          setButtonLoading(saveButton, false);
          toast(error?.message || "The contributor could not be saved.", { type: "error" });
        }
      });
    },
  });
}

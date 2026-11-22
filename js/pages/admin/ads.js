import { deleteAd, fetchAllAds, saveAd, setAdActive } from "../../db.js";
import {
  AD_PLACEMENTS,
  confirmDialog,
  escapeAttr,
  escapeHtml,
  formatNumber,
  icon,
  isHttpUrl,
  openSheet,
  safeImageUrl,
  setButtonLoading,
  toDate,
  toast,
} from "../../ui.js";
import { adminEmptyHTML, adminHeaderHTML, adminPageClose, adminPageOpen } from "./shared.js";

const PLACEMENT_LABELS = Object.fromEntries(AD_PLACEMENTS.map((placement) => [placement.value, placement.label]));

export async function renderAds(main, context) {
  const ads = await fetchAllAds();
  if (!location.hash.startsWith("#/admin/ads")) return;

  const activeCount = ads.filter((ad) => ad.active).length;

  main.innerHTML = `${adminPageOpen("ads")}
    ${adminHeaderHTML({
      title: '<span class="fw-light">Sponsors,</span> <strong>not clutter.</strong>',
      subtitle: "Create small, dismissible placements. The master switch on the dashboard hides every ad instantly.",
      actions: `<button class="btn btn--primary btn--sm" type="button" data-add-ad>${icon("plus")} New ad</button>`,
    })}
    <div class="admin-toolbar">
      <span class="status-chip status-chip--success">${icon("eye", "icon--xs")} ${activeCount} active</span>
      <span class="status-chip">${ads.length} total</span>
      <span class="admin-card__sub" style="margin-left:auto">Images are optional and shown at a small size.</span>
    </div>
    ${ads.length ? `<div class="admin-list-grid">
      ${ads.map((ad) => adCardHTML(ad)).join("")}
    </div>` : adminEmptyHTML({
      iconName: "megaphone",
      title: "No ads yet",
      text: "Add a sponsor card or keep the library ad-free. You can turn every ad off at any time.",
      actions: `<button class="btn btn--primary btn--sm" type="button" data-add-ad>${icon("plus")} Create the first ad</button>`,
    })}
  ${adminPageClose()}`;

  main.querySelectorAll("[data-add-ad]").forEach((button) => {
    button.addEventListener("click", () => openAdSheet(main, context, null));
  });
  main.querySelectorAll("[data-edit-ad]").forEach((button) => {
    button.addEventListener("click", () => {
      const ad = ads.find((item) => item.id === button.dataset.editAd);
      if (ad) openAdSheet(main, context, ad);
    });
  });
  main.querySelectorAll("[data-toggle-ad]").forEach((input) => {
    input.addEventListener("change", async () => {
      const ad = ads.find((item) => item.id === input.dataset.toggleAd);
      if (!ad) return;
      input.disabled = true;
      try {
        await setAdActive(ad.id, input.checked);
        toast(input.checked ? "Ad is now live." : "Ad paused.", { type: "success" });
        await renderAds(main, context);
      } catch (error) {
        input.checked = !input.checked;
        input.disabled = false;
        toast(error?.message || "The ad status could not be updated.", { type: "error" });
      }
    });
  });
  main.querySelectorAll("[data-delete-ad]").forEach((button) => {
    button.addEventListener("click", async () => {
      const ad = ads.find((item) => item.id === button.dataset.deleteAd);
      if (!ad) return;
      const confirmed = await confirmDialog({
        title: "Delete ad?",
        message: `“${ad.title || "This ad"}” and its impression history will be permanently removed.`,
        confirmText: "Delete ad",
        danger: true,
      });
      if (!confirmed) return;
      setButtonLoading(button, true);
      try {
        await deleteAd(ad.id);
        toast("Ad deleted.", { type: "success" });
        await renderAds(main, context);
      } catch (error) {
        setButtonLoading(button, false);
        toast(error?.message || "The ad could not be deleted.", { type: "error" });
      }
    });
  });
}

function adCardHTML(ad) {
  const image = safeImageUrl(ad.imageURL || "");
  const placement = PLACEMENT_LABELS[ad.placement] || "Home banner";
  const impressions = Number(ad.impressions) || 0;
  const clicks = Number(ad.clicks) || 0;
  const ctr = impressions ? `${((clicks / impressions) * 100).toFixed(1)}% CTR` : "No data yet";
  const dateRange = [formatDateInput(ad.startDate), formatDateInput(ad.endDate)].filter(Boolean).join(" – ");
  return `<article class="ad-admin-card">
    <div class="ad-admin-card__top">
      <div class="ad-admin-card__thumb">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy" />` : `<span class="ad-admin-card__thumb-fallback">${icon("megaphone")}</span>`}</div>
      <div class="ad-admin-card__copy">
        <p class="ad-admin-card__title">${escapeHtml(ad.title || "Untitled ad")}</p>
        <p class="ad-admin-card__meta">${escapeHtml(placement)}${dateRange ? ` · ${escapeHtml(dateRange)}` : ""}</p>
        <div class="ad-admin-card__metrics">
          <span>${icon("eye", "icon--xs")} ${formatNumber(impressions)}</span>
          <span>${icon("cursor-click", "icon--xs")} ${formatNumber(clicks)}</span>
          <span>${escapeHtml(ctr)}</span>
        </div>
      </div>
    </div>
    <div class="ad-admin-card__bottom">
      <label class="switch switch--sm">
        <input type="checkbox" data-toggle-ad="${escapeAttr(ad.id)}" ${ad.active ? "checked" : ""} />
        <span class="switch__track"></span>
        <span class="switch__label">${ad.active ? "Live" : "Paused"}</span>
      </label>
      <div class="ad-admin-card__actions">
        <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-edit-ad="${escapeAttr(ad.id)}" aria-label="Edit ad">${icon("edit")}</button>
        <button class="icon-btn icon-btn--sm icon-btn--ghost icon-btn--danger" type="button" data-delete-ad="${escapeAttr(ad.id)}" aria-label="Delete ad">${icon("trash")}</button>
      </div>
    </div>
  </article>`;
}

function openAdSheet(main, context, ad) {
  const isEdit = Boolean(ad?.id);
  const startDate = formatDateInput(ad?.startDate);
  const endDate = formatDateInput(ad?.endDate);
  openSheet({
    title: isEdit ? "Edit ad" : "New ad",
    subtitle: "Keep it relevant, short, and easy to dismiss.",
    size: "wide",
    content: `<form class="admin-editor" data-ad-form>
      <div class="admin-editor__section">
        <label class="field">
          <span class="field__label">Title</span>
          <input class="input" name="title" value="${escapeAttr(ad?.title || "")}" maxlength="140" required placeholder="e.g. Academix study sprint" />
        </label>
        <label class="field">
          <span class="field__label">Description</span>
          <textarea class="textarea" name="description" rows="3" maxlength="500" placeholder="One short line about the offer.">${escapeHtml(ad?.description || "")}</textarea>
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field__label">Target URL</span>
            <input class="input" name="targetURL" type="url" value="${escapeAttr(ad?.targetURL || "")}" maxlength="2048" required placeholder="https://…" />
          </label>
          <label class="field">
            <span class="field__label">Button text</span>
            <input class="input" name="ctaText" value="${escapeAttr(ad?.ctaText || "Learn more")}" maxlength="40" />
          </label>
        </div>
        <label class="field">
          <span class="field__label">Image URL</span>
          <input class="input" name="imageURL" type="url" value="${escapeAttr(ad?.imageURL || "")}" maxlength="2048" placeholder="https://… (optional)" />
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field__label">Placement</span>
            <select class="select" name="placement">
              ${AD_PLACEMENTS.map((placement) => `<option value="${escapeAttr(placement.value)}" ${(ad?.placement || "home_banner") === placement.value ? "selected" : ""}>${escapeHtml(placement.label)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span class="field__label">Status</span>
            <span class="switch" style="min-height:46px">
              <input type="checkbox" name="active" ${ad?.active ? "checked" : ""} />
              <span class="switch__track"></span>
              <span class="switch__label">Live</span>
            </span>
          </label>
        </div>
        <div class="field-row">
          <label class="field">
            <span class="field__label">Start date</span>
            <input class="input" name="startDate" type="date" value="${escapeAttr(startDate)}" />
          </label>
          <label class="field">
            <span class="field__label">End date</span>
            <input class="input" name="endDate" type="date" value="${escapeAttr(endDate)}" />
          </label>
        </div>
        <div class="drive-check">${icon("info")} Ads are hidden entirely when the master switch is off. Students can dismiss any ad.</div>
      </div>
    </form>`,
    footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit" form="ad-form" data-save-ad>${isEdit ? "Save changes" : "Create ad"}</button>`,
    onMount(sheet, close) {
      const form = sheet.querySelector("[data-ad-form]");
      form.id = "ad-form";
      const saveButton = sheet.querySelector("[data-save-ad]");
      sheet.querySelector("[data-cancel]")?.addEventListener("click", () => close());
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const title = String(data.get("title") || "").trim();
        const targetURL = String(data.get("targetURL") || "").trim();
        const imageURL = String(data.get("imageURL") || "").trim();
        if (!title) {
          toast("Ad title is required.", { type: "error" });
          return;
        }
        if (!isHttpUrl(targetURL)) {
          toast("Add a valid http(s) target URL.", { type: "error" });
          return;
        }
        if (imageURL && !isHttpUrl(imageURL)) {
          toast("The image URL must start with http:// or https://.", { type: "error" });
          return;
        }
        setButtonLoading(saveButton, true, "Saving");
        try {
          await saveAd(ad?.id || null, {
            title,
            description: String(data.get("description") || ""),
            imageURL,
            ctaText: String(data.get("ctaText") || ""),
            targetURL,
            placement: String(data.get("placement") || "home_banner"),
            active: data.get("active") === "on",
            startDate: String(data.get("startDate") || ""),
            endDate: String(data.get("endDate") || ""),
          });
          close();
          toast(isEdit ? "Ad updated." : "Ad created.", { type: "success" });
          await renderAds(main, context);
        } catch (error) {
          setButtonLoading(saveButton, false);
          toast(error?.message || "The ad could not be saved.", { type: "error" });
        }
      });
    },
  });
}

function formatDateInput(value) {
  const date = toDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

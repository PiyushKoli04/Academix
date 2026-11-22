import {
  fetchBranches,
  fetchContributors,
  fetchDashboardData,
  fetchSettings,
  fetchSubjectsByIds,
  fetchYears,
  saveSettings,
} from "../../db.js";
import { escapeAttr, escapeHtml, formatNumber, icon, openSheet, relativeTime, setButtonLoading, toast } from "../../ui.js";
import { adminHeaderHTML, adminPageClose, adminPageOpen } from "./shared.js";

export async function renderDashboard(main, context) {
  // Render the shell immediately so tabs and header are visible and interactive
  const settings = context.state.settings || {};
  const adsEnabled = Boolean(settings.adsEnabled);

  main.innerHTML = `${adminPageOpen("dashboard")}
    ${adminHeaderHTML({
      title: '<span class="fw-light">Good to see you,</span> <strong>admin.</strong>',
      subtitle: "Keep the library tidy, publish fresh notes, and watch what students open most.",
      actions: `<a class="btn btn--white btn--sm" href="#/home">${icon("external-link")} View site</a><button class="btn btn--primary btn--sm" type="button" data-edit-settings>${icon("settings")} Edit settings</button>`,
    })}

    <section class="admin-stats" aria-label="Library totals">
      <article class="stat-card stat-card--dark">
        <div class="stat-card__top"><span class="stat-card__icon">${icon("users")}</span><span class="stat-card__trend">Students</span></div>
        <p class="stat-card__value" data-stat="users">—</p>
        <p class="stat-card__label">Registered accounts</p>
      </article>
      <article class="stat-card">
        <div class="stat-card__top"><span class="stat-card__icon">${icon("book-open")}</span><span class="stat-card__trend">Catalog</span></div>
        <p class="stat-card__value" data-stat="subjects">—</p>
        <p class="stat-card__label">Subjects published</p>
      </article>
      <article class="stat-card stat-card--lime">
        <div class="stat-card__top"><span class="stat-card__icon">${icon("file-text")}</span><span class="stat-card__trend">Files</span></div>
        <p class="stat-card__value" data-stat="documents">—</p>
        <p class="stat-card__label">PDF documents</p>
      </article>
      <article class="stat-card">
        <div class="stat-card__top"><span class="stat-card__icon">${icon("heart")}</span><span class="stat-card__trend">People</span></div>
        <p class="stat-card__value" data-stat="contributors">—</p>
        <p class="stat-card__label">Contributors credited</p>
      </article>
    </section>

    <div class="admin-grid admin-grid--wide-main">
      <div class="admin-col admin-col--main">
        <section class="admin-card">
          <div class="admin-card__head">
            <div><h2 class="admin-card__title">Quick actions</h2><p class="admin-card__sub">Everything you need to keep Academix current.</p></div>
          </div>
          <div class="admin-quick-grid">
            <a class="admin-quick" href="#/admin/structure">
              <span class="admin-quick__icon">${icon("folder-tree")}</span>
              <span class="admin-quick__label">Edit structure</span>
            </a>
            <a class="admin-quick" href="#/admin/documents">
              <span class="admin-quick__icon">${icon("upload")}</span>
              <span class="admin-quick__label">Upload notes</span>
            </a>
            <a class="admin-quick" href="#/admin/contributors">
              <span class="admin-quick__icon">${icon("users")}</span>
              <span class="admin-quick__label">Contributors</span>
            </a>
            <a class="admin-quick" href="#/admin/ads">
              <span class="admin-quick__icon">${icon("megaphone")}</span>
              <span class="admin-quick__label">Manage ads</span>
            </a>
          </div>
        </section>

        <section class="admin-card" data-top-subjects-card>
          <div class="admin-card__head">
            <div><h2 class="admin-card__title">Most viewed subjects</h2><p class="admin-card__sub">What students open most often.</p></div>
            <a class="admin-card__action" href="#/library">Library ${icon("arrow-right", "icon--xs")}</a>
          </div>
          <p class="admin-search-empty">Loading…</p>
        </section>

        <section class="admin-card" data-recent-docs-card>
          <div class="admin-card__head">
            <div><h2 class="admin-card__title">Recently uploaded</h2><p class="admin-card__sub">The newest PDFs in the library.</p></div>
            <a class="admin-card__action" href="#/admin/documents">All documents ${icon("arrow-right", "icon--xs")}</a>
          </div>
          <p class="admin-search-empty">Loading…</p>
        </section>
      </div>

      <div class="admin-col admin-col--side">
        <section class="admin-master-card">
          <div class="admin-master-card__top">
            <div>
              <h2 class="admin-master-card__title">Advertisements</h2>
              <p class="admin-master-card__text">Master switch for every ad placement. Turn off to remove all ads from student pages instantly.</p>
            </div>
            <label class="switch">
              <input type="checkbox" data-ads-toggle ${adsEnabled ? "checked" : ""} />
              <span class="switch__track"></span>
            </label>
          </div>
          <span class="admin-master-card__status">${icon(adsEnabled ? "eye" : "eye-off", "icon--xs")} ${adsEnabled ? "Ads are visible" : "Ads are hidden"}</span>
        </section>

        <section class="admin-card">
          <div class="admin-card__head">
            <div><h2 class="admin-card__title">Site settings</h2><p class="admin-card__sub">Shared across student pages.</p></div>
            <button class="admin-card__action" type="button" data-edit-settings>Edit ${icon("arrow-right", "icon--xs")}</button>
          </div>
          <div class="admin-top-list">
            <div class="admin-top-row admin-top-row--setting">
              <span class="admin-top-row__title">Contact email</span>
              <span class="admin-top-row__meta">${escapeHtml(settings.contactEmail || "Not set")}</span>
            </div>
            <div class="admin-top-row admin-top-row--setting">
              <span class="admin-top-row__title">Announcement</span>
              <span class="admin-top-row__meta">${escapeHtml(settings.announcement || "No announcement")}</span>
            </div>
            <div class="admin-top-row admin-top-row--setting">
              <span class="admin-top-row__title">Version</span>
              <span class="admin-top-row__meta">Academix ${escapeHtml(settings.version || "1.0.0")}</span>
            </div>
          </div>
        </section>

        <section class="admin-card" data-seed-card style="display:none">
          <div class="admin-card__head">
            <div><h2 class="admin-card__title">Start with demo content</h2><p class="admin-card__sub">Add sample years, branches, subjects, and contributors you can edit or delete.</p></div>
          </div>
          <button class="btn btn--primary btn--block btn--sm" type="button" data-seed-demo>${icon("sparkles")} Load demo content</button>
        </section>
      </div>
    </div>
  ${adminPageClose()}`;

  // Wire up event listeners immediately (these don't depend on dashboard data)
  main.querySelector("[data-ads-toggle]")?.addEventListener("change", async (event) => {
    const checkbox = event.currentTarget;
    const next = checkbox.checked;
    checkbox.disabled = true;
    try {
      await saveSettings({ adsEnabled: next });
      context.state.settings = { ...(context.state.settings || {}), adsEnabled: next };
      toast(next ? "Ads are now visible." : "All ads are now hidden.", { type: "success" });
      if (next) document.documentElement.dataset.ads = "on";
      else delete document.documentElement.dataset.ads;
      const status = main.querySelector(".admin-master-card__status");
      if (status) status.innerHTML = `${icon(next ? "eye" : "eye-off", "icon--xs")} ${next ? "Ads are visible" : "Ads are hidden"}`;
    } catch (error) {
      checkbox.checked = !next;
      toast(error?.message || "The ad setting could not be saved.", { type: "error" });
    } finally {
      checkbox.disabled = false;
    }
  });

  main.querySelectorAll("[data-edit-settings]").forEach((button) => {
    button.addEventListener("click", () => openSettingsSheet(context, main));
  });

  main.querySelector("[data-seed-demo]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setButtonLoading(button, true, "Adding demo content");
    try {
      const { seedDemoData } = await import("../../seed.js");
      await seedDemoData();
      const [years, branches, contributors, freshSettings] = await Promise.all([
        fetchYears(),
        fetchBranches(),
        fetchContributors(),
        fetchSettings(),
      ]);
      context.state.years = years;
      context.state.branches = branches;
      context.state.contributors = contributors;
      context.state.settings = freshSettings;
      toast("Demo content is ready. Edit it from Structure and Documents.", { type: "success" });
      await renderDashboard(main, context);
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || "Demo content could not be added.", { type: "error" });
    }
  });

  // Load dashboard data in the background — UI stays interactive while this resolves
  try {
    const dashboard = await fetchDashboardData();

    // Check we're still on the admin page before updating DOM
    if (!location.hash.startsWith("#/admin/dashboard") && !location.hash.match(/^#\/admin\/?$/)) return;

    const subjectMap = new Map((dashboard.topSubjects || []).map((subject) => [subject.id, subject]));
    const recentDocs = dashboard.recentDocuments || [];
    const missingIds = [...new Set(recentDocs.map((document) => document.subjectId).filter((id) => id && !subjectMap.has(id)))];
    if (missingIds.length) {
      const extra = await fetchSubjectsByIds(missingIds).catch(() => []);
      extra.forEach((subject) => subjectMap.set(subject.id, subject));
    }

    // Update stat cards
    const statUsers = main.querySelector('[data-stat="users"]');
    const statSubjects = main.querySelector('[data-stat="subjects"]');
    const statDocuments = main.querySelector('[data-stat="documents"]');
    const statContributors = main.querySelector('[data-stat="contributors"]');
    if (statUsers) statUsers.textContent = formatNumber(dashboard.totalUsers);
    if (statSubjects) statSubjects.textContent = formatNumber(dashboard.totalSubjects);
    if (statDocuments) statDocuments.textContent = formatNumber(dashboard.totalDocuments);
    if (statContributors) statContributors.textContent = formatNumber(dashboard.totalContributors);

    // Update top subjects card
    const topCard = main.querySelector("[data-top-subjects-card]");
    if (topCard) {
      const body = topCard.querySelector(".admin-search-empty");
      if (body) {
        if (dashboard.topSubjects?.length) {
          const list = document.createElement("div");
          list.className = "admin-top-list";
          list.innerHTML = dashboard.topSubjects.map((subject, index) => `<a class="admin-top-row" href="#/subject/${encodeURIComponent(subject.id)}">
              <span class="admin-top-row__rank">${index + 1}</span>
              <span class="admin-top-row__copy">
                <span class="admin-top-row__title">${escapeHtml(subject.name)}</span>
                <span class="admin-top-row__meta">${escapeHtml(subject.code || "Subject")} · ${formatNumber(subject.viewCount)} views</span>
              </span>
              ${icon("chevron-right", "icon--sm")}
            </a>`).join("");
          body.replaceWith(list);
        } else {
          body.textContent = "No view data yet. Publish a few subjects to get started.";
        }
      }
    }

    // Update recent docs card
    const recentCard = main.querySelector("[data-recent-docs-card]");
    if (recentCard) {
      const body = recentCard.querySelector(".admin-search-empty");
      if (body) {
        if (recentDocs.length) {
          const list = document.createElement("div");
          list.className = "admin-top-list";
          list.innerHTML = recentDocs.map((document) => {
            const subject = subjectMap.get(document.subjectId);
            return `<a class="admin-top-row" href="#/viewer/${encodeURIComponent(document.id)}">
                <span class="admin-top-row__rank">${icon("file-text", "icon--xs")}</span>
                <span class="admin-top-row__copy">
                  <span class="admin-top-row__title">${escapeHtml(document.title || "Untitled document")}</span>
                  <span class="admin-top-row__meta">${escapeHtml(subject?.name || "Subject")} · ${relativeTime(document.createdAt)}</span>
                </span>
                ${icon("chevron-right", "icon--sm")}
              </a>`;
          }).join("");
          body.replaceWith(list);
        } else {
          body.textContent = "No documents yet. Upload the first PDF from the Documents tab.";
        }
      }
    }

    // Show seed card if catalog is empty
    const hasCatalog = (dashboard.totalSubjects || 0) > 0;
    if (!hasCatalog) {
      const seedCard = main.querySelector("[data-seed-card]");
      if (seedCard) seedCard.style.display = "";
    }
  } catch (error) {
    console.warn("Dashboard data could not be loaded.", error);
    // Stats stay as "—" and lists show a friendly message — the page remains usable
    const topBody = main.querySelector("[data-top-subjects-card] .admin-search-empty");
    if (topBody) topBody.textContent = "Could not load data. Check your connection or Firestore indexes.";
    const recentBody = main.querySelector("[data-recent-docs-card] .admin-search-empty");
    if (recentBody) recentBody.textContent = "Could not load data. Check your connection or Firestore indexes.";
  }
}

function openSettingsSheet(context, main) {
  const settings = context.state.settings || {};
  const sheet = openSheet({
    title: "Site settings",
    subtitle: "These values appear on student pages and in the About section.",
    size: "wide",
    content: `<form class="admin-editor" data-settings-form>
      <div class="admin-editor__section">
        <label class="field">
          <span class="field__label">App name</span>
          <input class="input" name="appName" value="${escapeAttr(settings.appName || "Academix")}" maxlength="80" />
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field__label">Contact email</span>
            <input class="input" name="contactEmail" type="email" value="${escapeAttr(settings.contactEmail || "")}" placeholder="notes@college.edu" maxlength="200" />
          </label>
          <label class="field">
            <span class="field__label">Version</span>
            <input class="input" name="version" value="${escapeAttr(settings.version || "1.0.0")}" maxlength="30" />
          </label>
        </div>
        <label class="field">
          <span class="field__label">Announcement</span>
          <textarea class="textarea" name="announcement" rows="3" maxlength="1000" placeholder="A short note shown on student pages.">${escapeHtml(settings.announcement || "")}</textarea>
        </label>
        <label class="field">
          <span class="field__label">About text</span>
          <textarea class="textarea" name="aboutText" rows="6" maxlength="5000" placeholder="Tell students what Academix is and how it works.">${escapeHtml(settings.aboutText || "")}</textarea>
        </label>
      </div>
    </form>`,
    footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit" form="settings-form" data-save-settings>Save settings</button>`,
    onMount(sheetElement, close) {
      const form = sheetElement.querySelector("[data-settings-form]");
      form.id = "settings-form";
      const saveButton = sheetElement.querySelector("[data-save-settings]");
      sheetElement.querySelector("[data-cancel]")?.addEventListener("click", () => close());
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        setButtonLoading(saveButton, true, "Saving");
        try {
          const patch = {
            appName: String(data.get("appName") || ""),
            contactEmail: String(data.get("contactEmail") || ""),
            version: String(data.get("version") || ""),
            announcement: String(data.get("announcement") || ""),
            aboutText: String(data.get("aboutText") || ""),
          };
          await saveSettings(patch);
          context.state.settings = { ...(context.state.settings || {}), ...patch };
          close();
          toast("Site settings saved.", { type: "success" });
          await renderDashboard(main, context);
        } catch (error) {
          setButtonLoading(saveButton, false);
          toast(error?.message || "Settings could not be saved.", { type: "error" });
        }
      });
    },
  });
  return sheet;
}

import {
  isEmailPasswordUser,
  isGoogleUser,
  openSecuritySheet,
  signOutUser,
  updateOwnProfile,
} from "../auth.js";
import { openLegalSheet } from "../legal.js";
import {
  branchName,
  getEffectiveSelection,
  isAdmin,
  setSelection,
  state,
  yearLabel,
} from "../state.js";
import {
  avatarHTML,
  confirmDialog,
  escapeAttr,
  escapeHtml,
  formatDate,
  icon,
  isHttpUrl,
  openSheet,
  setButtonLoading,
  setPageMeta,
  toast,
} from "../ui.js";

function syncSidebarProfile(profile) {
  const mini = document.querySelector(".sidebar__mini-profile");
  if (!mini) return;
  const name = mini.querySelector(".sidebar__mini-name");
  if (name) name.textContent = profile.name || "Student";
  const avatar = mini.querySelector(".avatar");
  if (avatar) avatar.outerHTML = avatarHTML(profile, { size: "sm" });
}

function openEditProfile(root, context) {
  const profile = state.profile || {};
  const sheet = openSheet({
    title: "Edit profile",
    subtitle: "Keep your name and photo up to date.",
    content: `<form class="sheet-form" id="profile-edit-form" novalidate>
      <div class="profile-photo-preview" id="profile-photo-preview">
        ${avatarHTML(profile, { size: "lg" })}
        <div>
          <p class="field__label" style="padding:0">Profile photo</p>
          <p class="field__hint" style="padding:0;margin-top:2px">Paste a public image URL, or leave it blank.</p>
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="profile-name">Display name</label>
        <input class="input" id="profile-name" name="name" type="text" maxlength="100" autocomplete="name" value="${escapeAttr(profile.name || "")}" required />
      </div>
      <div class="field">
        <label class="field__label" for="profile-photo">Photo URL <small>Optional</small></label>
        <input class="input" id="profile-photo" name="photoURL" type="url" inputmode="url" placeholder="https://…" value="${escapeAttr(profile.photoURL || "")}" />
        <p class="field__hint">Square images look best. Leave blank to use your initials.</p>
      </div>
      <p class="field__error" id="profile-edit-error" hidden></p>
    </form>`,
    footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit" form="profile-edit-form" data-save-profile>Save changes</button>`,
    onMount(element, close) {
      const form = element.querySelector("#profile-edit-form");
      const nameInput = element.querySelector("#profile-name");
      const photoInput = element.querySelector("#profile-photo");
      const error = element.querySelector("#profile-edit-error");
      const saveButton = element.querySelector("[data-save-profile]");
      element.querySelector("[data-cancel]")?.addEventListener("click", () => close());
      photoInput?.addEventListener("input", () => {
        const preview = element.querySelector("#profile-photo-preview .avatar");
        if (!preview) return;
        const next = avatarHTML({ name: nameInput.value || profile.name, photoURL: photoInput.value }, { size: "lg" });
        preview.outerHTML = next;
      });
      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        const photoURL = photoInput.value.trim();
        if (name.length < 2) {
          error.textContent = "Enter your display name.";
          error.hidden = false;
          nameInput.focus();
          return;
        }
        if (photoURL && !isHttpUrl(photoURL)) {
          error.textContent = "Photo URL must start with http:// or https://.";
          error.hidden = false;
          photoInput.focus();
          return;
        }
        error.hidden = true;
        setButtonLoading(saveButton, true, "Saving profile");
        try {
          await updateOwnProfile(state.profile.uid, { name, photoURL });
          state.profile = { ...state.profile, name, photoURL };
          syncSidebarProfile(state.profile);
          close();
          toast("Profile updated.", { type: "success" });
          renderProfile(root, context);
        } catch (caught) {
          setButtonLoading(saveButton, false);
          error.textContent = caught?.message || "Your profile could not be saved.";
          error.hidden = false;
        }
      });
    },
  });
  return sheet;
}

function openSetupSheet(root, context) {
  const profile = state.profile || {};
  const selection = getEffectiveSelection();
  let yearId = profile.yearId || selection.yearId || state.years[0]?.id || "";
  let branchId = profile.branchId || (selection.branchId === "all" ? state.branches[0]?.id : selection.branchId) || "";
  const sheet = openSheet({
    title: "Study setup",
    subtitle: "Choose the year and branch you want Academix to open by default.",
    content: `<div class="sheet-form">
      <div class="field">
        <label class="field__label" for="setup-year">Year</label>
        <select class="select" id="setup-year">
          ${state.years.map((year) => `<option value="${escapeAttr(year.id)}" ${year.id === yearId ? "selected" : ""}>${escapeHtml(year.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="setup-branch">Branch</label>
        <select class="select" id="setup-branch">
          ${state.branches.map((branch) => `<option value="${escapeAttr(branch.id)}" ${branch.id === branchId ? "selected" : ""}>${escapeHtml(branch.name)}</option>`).join("")}
        </select>
      </div>
      <p class="field__hint">You can still switch year, semester, and branch inside the library anytime.</p>
    </div>`,
    footer: `<button class="btn btn--white" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="button" data-save-setup>Save setup</button>`,
    onMount(element, close) {
      const yearSelect = element.querySelector("#setup-year");
      const branchSelect = element.querySelector("#setup-branch");
      const saveButton = element.querySelector("[data-save-setup]");
      element.querySelector("[data-cancel]")?.addEventListener("click", () => close());
      yearSelect?.addEventListener("change", () => {
        yearId = yearSelect.value;
      });
      branchSelect?.addEventListener("change", () => {
        branchId = branchSelect.value;
      });
      saveButton?.addEventListener("click", async () => {
        if (!yearId || !branchId) return;
        setButtonLoading(saveButton, true, "Saving setup");
        try {
          await updateOwnProfile(state.profile.uid, { yearId, branchId });
          const year = state.years.find((item) => item.id === yearId);
          const semester = Array.isArray(year?.semesters) && year.semesters.length ? Math.min(...year.semesters) : 1;
          state.profile = { ...state.profile, yearId, branchId };
          setSelection({ yearId, branchId, semester });
          close();
          toast("Study setup updated.", { type: "success" });
          renderProfile(root, context);
        } catch (error) {
          setButtonLoading(saveButton, false);
          toast(error?.message || "Your setup could not be saved.", { type: "error" });
        }
      });
    },
  });
  return sheet;
}

export function renderProfile(root, context = {}) {
  const profile = state.profile || {};
  const selection = getEffectiveSelection();
  const bookmarks = Array.isArray(profile.bookmarks) ? profile.bookmarks : [];
  const recents = Array.isArray(profile.recentlyViewed) ? profile.recentlyViewed : [];
  const completedModules = profile.completedModules && typeof profile.completedModules === "object" ? profile.completedModules : {};
  const completedCount = Object.values(completedModules).reduce((total, values) => total + (Array.isArray(values) ? values.length : 0), 0);
  const admin = isAdmin();
  const version = state.settings?.version || "1.0.0";
  const hasPassword = isEmailPasswordUser(state.user);
  const hasGoogle = isGoogleUser(state.user);

  setPageMeta("Profile", "Manage your Academix profile, study setup, and app preferences.");

  root.innerHTML = `<div class="page profile-page">
    <div class="profile-shell">
      <header class="profile-hero">
        <div class="profile-hero__top">
          <div class="profile-hero__identity">
            <div class="profile-hero__avatar">
              ${avatarHTML(profile, { size: "xl" })}
              <button class="profile-hero__edit-avatar" type="button" id="edit-avatar" aria-label="Edit profile photo">${icon("camera")}</button>
            </div>
            <div class="profile-hero__info">
              <h1 class="profile-hero__name">${escapeHtml(profile.name || "Student")}</h1>
              <p class="profile-hero__email" title="${escapeAttr(profile.email || "")}">${escapeHtml(profile.email || "")}</p>
            </div>
          </div>
          <button class="profile-hero__edit-btn" type="button" id="edit-profile-top" aria-label="Edit profile">${icon("edit")}</button>
        </div>
        <div class="profile-hero__chips">
          <span class="profile-hero__chip">${icon("graduation-cap")} ${escapeHtml(yearLabel(state.years.find((year) => year.id === profile.yearId)))}</span>
          <span class="profile-hero__chip">${icon("layers")} ${escapeHtml(branchName(profile.branchId || selection.branchId))}</span>
          <span class="profile-hero__chip">${icon(admin ? "shield" : "user-check")} ${admin ? "Administrator" : "Student"}</span>
        </div>
        <div class="profile-hero__stats">
          <div class="profile-stat"><p class="profile-stat__value">${bookmarks.length}</p><p class="profile-stat__label">Bookmarks</p></div>
          <div class="profile-stat"><p class="profile-stat__value">${recents.length}</p><p class="profile-stat__label">Recently viewed</p></div>
          <div class="profile-stat"><p class="profile-stat__value">${completedCount}</p><p class="profile-stat__label">Modules done</p></div>
        </div>
      </header>

      <div class="profile-grid">
        ${hasGoogle && !hasPassword ? `
        <div class="profile-security-banner">
          <div class="profile-security-banner__icon">${icon("shield")}</div>
          <div class="profile-security-banner__copy">
            <strong>Set a password for email login</strong>
            <p>You’re signed in via Google. Add a password so you can also log in using your email address anytime.</p>
          </div>
          <button class="btn btn--white btn--sm" type="button" id="profile-banner-set-pwd">Set password</button>
        </div>` : ""}

        <section class="profile-section">
          <h2 class="profile-section__title">Study setup</h2>
          <div class="profile-menu">
            <button class="profile-menu__item" type="button" id="profile-edit">
              <span class="profile-menu__icon">${icon("user")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label">Edit profile</span>
                <span class="profile-menu__value">${escapeHtml(profile.name || "Name and photo")}</span>
              </div>
              <span class="profile-menu__chevron">${icon("chevron-right")}</span>
            </button>
            <button class="profile-menu__item" type="button" id="profile-setup">
              <span class="profile-menu__icon">${icon("graduation-cap")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label">Year and branch</span>
                <span class="profile-menu__value">${escapeHtml(yearLabel(state.years.find((year) => year.id === profile.yearId)))} · ${escapeHtml(branchName(profile.branchId || selection.branchId))}</span>
              </div>
              <span class="profile-menu__chevron">${icon("chevron-right")}</span>
            </button>
            <a class="profile-menu__item" href="#/bookmarks">
              <span class="profile-menu__icon">${icon("bookmark")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label">Your bookmarks</span>
                <span class="profile-menu__value">${bookmarks.length} saved ${bookmarks.length === 1 ? "item" : "items"}</span>
              </div>
              <span class="profile-menu__chevron">${icon("chevron-right")}</span>
            </a>
          </div>
        </section>

        <section class="profile-section">
          <h2 class="profile-section__title">App</h2>
          <div class="profile-menu">
            <a class="profile-menu__item" href="#/about">
              <span class="profile-menu__icon">${icon("info")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label">About Academix</span>
                <span class="profile-menu__value">Credits, policies, and contact</span>
              </div>
              <span class="profile-menu__chevron">${icon("chevron-right")}</span>
            </a>
            <button class="profile-menu__item" type="button" id="profile-terms">
              <span class="profile-menu__icon">${icon("shield-check")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label">Terms & Conditions</span>
                <span class="profile-menu__value">${profile.termsAccepted ? "Accepted · Personal study license" : "Review & accept rules"}</span>
              </div>
              <span class="profile-menu__chevron">${icon("chevron-right")}</span>
            </button>
            <button class="profile-menu__item" type="button" id="profile-privacy">
              <span class="profile-menu__icon">${icon("lock")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label">Privacy Policy</span>
                <span class="profile-menu__value">How your data is protected</span>
              </div>
              <span class="profile-menu__chevron">${icon("chevron-right")}</span>
            </button>
            ${admin ? `<a class="profile-menu__item" href="#/admin">
              <span class="profile-menu__icon">${icon("shield")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label">Admin dashboard</span>
                <span class="profile-menu__value">Manage structure, documents, and users</span>
              </div>
              <span class="profile-menu__chevron">${icon("chevron-right")}</span>
            </a>` : ""}
          </div>
        </section>

        <section class="profile-section">
          <h2 class="profile-section__title">Security</h2>
          <div class="profile-menu">
            <button class="profile-menu__item" type="button" id="profile-security">
              <span class="profile-menu__icon">${icon("shield-check")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label">Security</span>
                <span class="profile-menu__value">${hasPassword ? "Password set · Tap to update" : "Set password for email login"}</span>
              </div>
              <span class="profile-menu__chevron">${icon("chevron-right")}</span>
            </button>
          </div>
        </section>

        <section class="profile-section">
          <h2 class="profile-section__title">Account</h2>
          <div class="profile-menu">
            <div class="profile-menu__item">
              <span class="profile-menu__icon">${icon("mail")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label">Email</span>
                <span class="profile-menu__value">${escapeHtml(profile.email || "—")}</span>
              </div>
            </div>
            <div class="profile-menu__item">
              <span class="profile-menu__icon">${icon("calendar")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label">Member since</span>
                <span class="profile-menu__value">${escapeHtml(formatDate(profile.createdAt))}</span>
              </div>
            </div>
            <button class="profile-menu__item" type="button" id="profile-signout">
              <span class="profile-menu__icon" style="color:var(--red);background:var(--red-soft)">${icon("log-out")}</span>
              <div class="profile-menu__copy">
                <span class="profile-menu__label" style="color:var(--red)">Sign out</span>
                <span class="profile-menu__value">Use a different account</span>
              </div>
              <span class="profile-menu__chevron">${icon("chevron-right")}</span>
            </button>
          </div>
        </section>

        <section class="profile-section profile-section--note">
          <span class="profile-section__note-icon">${icon("shield-check")}</span>
          <div>
            <h2 class="profile-section__title">View-only library</h2>
            <p class="about-disclaimer">Academix is built for personal study. Downloads, printing, and file sharing are intentionally disabled to respect the people who shared their notes.</p>
          </div>
        </section>
      </div>
      <p class="profile-version">Academix v${escapeHtml(version)} · Made for students</p>
    </div>
  </div>`;

  const openEditor = () => openEditProfile(root, context);
  const handleSecurity = () => {
    openSecuritySheet(state.user || { email: profile.email }, {
      onDone: () => renderProfile(root, context),
    });
  };
  root.querySelector("#profile-security")?.addEventListener("click", handleSecurity);
  root.querySelector("#profile-banner-set-pwd")?.addEventListener("click", handleSecurity);
  root.querySelector("#profile-edit")?.addEventListener("click", openEditor);
  root.querySelector("#edit-profile-top")?.addEventListener("click", openEditor);
  root.querySelector("#edit-avatar")?.addEventListener("click", openEditor);
  root.querySelector("#profile-setup")?.addEventListener("click", () => openSetupSheet(root, context));
  root.querySelector("#profile-terms")?.addEventListener("click", () => openLegalSheet("terms"));
  root.querySelector("#profile-privacy")?.addEventListener("click", () => openLegalSheet("privacy"));

  root.querySelector("#profile-signout")?.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "Sign out of Academix?",
      message: "Your bookmarks and progress stay safely attached to your account.",
      confirmText: "Sign out",
      danger: true,
    });
    if (confirmed) await signOutUser();
  });

  return () => {};
}

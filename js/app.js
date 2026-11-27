import { isFirebaseConfigured } from "./firebase.js";
import {
  checkAuthActionUrl,
  ensureUserDocument,
  getRedirectError,
  maybePromptGooglePassword,
  needsEmailVerification,
  observeAuth,
  renderAuthScreen,
  renderVerificationScreen,
  signOutUser,
  updateOwnProfile,
} from "./auth.js";
import {
  fetchBranches,
  fetchContributors,
  fetchSettings,
  fetchYears,
  recordAdClick,
  recordAdImpression,
  subscribeSettings,
} from "./db.js";
import { avatarHTML, closeAllOverlays, escapeAttr, escapeHtml, icon, openSheet, setButtonLoading, skeletonPageHTML, toast } from "./ui.js";
import { openLegalSheet, renderPrivacy, renderTerms } from "./legal.js";
import {
  clearUserState,
  dismissInstallPrompt,
  ensureValidSelection,
  initTheme,
  isAdmin,
  isInstallDismissed,
  setSelection,
  state,
} from "./state.js";
import { renderHome } from "./pages/home.js";
import { renderLibrary } from "./pages/library.js";
import { renderSubject } from "./pages/subject.js";
import { renderViewer } from "./pages/viewer.js";
import { renderBookmarks } from "./pages/bookmarks.js";
import { renderContribute } from "./pages/contribute.js";
import { renderProfile } from "./pages/profile.js";
import { renderAbout } from "./pages/about.js";
import { renderDashboard } from "./pages/admin/dashboard.js";
import { renderStructure } from "./pages/admin/structure.js";
import { renderDocuments } from "./pages/admin/documents.js";
import { renderContributions } from "./pages/admin/contributions.js";
import { renderContributors } from "./pages/admin/contributors.js";
import { renderAds } from "./pages/admin/ads.js";
import { renderUsers } from "./pages/admin/users.js";

const root = document.getElementById("app");
const authSequence = { value: 0 };
const routeState = { sequence: 0, cleanup: null };
const REDIRECT_STORAGE_KEY = "academix_redirect_target";
let settingsUnsubscribe = null;
let onboardingShown = false;
let pendingAuthMessage = "";

function isDeepLinkHash(hash) {
  return Boolean(hash && hash.startsWith("#/") && !["#/", "#/home", "#/login", "#/auth"].includes(hash));
}

function captureRedirectTarget() {
  if (isDeepLinkHash(location.hash)) {
    try {
      sessionStorage.setItem(REDIRECT_STORAGE_KEY, location.hash);
    } catch { }
  }
}

captureRedirectTarget();
initTheme();
setupGlobalListeners();
registerServiceWorker();

if (!isFirebaseConfigured) {
  renderSetupScreen();
} else {
  bootstrap();
}

async function bootstrap() {
  captureRedirectTarget();
  pendingAuthMessage = await getRedirectError();
  checkAuthActionUrl();
  observeAuth((user) => {
    handleAuthState(user).catch((error) => {
      console.error(error);
      renderFatalError(error);
    });
  });
}

async function handleAuthState(user) {
  const sequence = ++authSequence.value;
  routeState.sequence += 1;
  routeState.cleanup?.();
  routeState.cleanup = null;
  settingsUnsubscribe?.();
  settingsUnsubscribe = null;
  closeAllOverlays();

  if (!user) {
    captureRedirectTarget();
    clearUserState();
    state.authResolved = true;
    onboardingShown = false;
    renderAuthScreen(root);
    document.body.dataset.page = "auth";
    if (pendingAuthMessage) {
      toast(pendingAuthMessage, { type: "error" });
      pendingAuthMessage = "";
    }
    return;
  }

  state.user = user;
  if (needsEmailVerification(user)) {
    state.profile = null;
    state.authResolved = true;
    renderVerificationScreen(root, user, {
      onVerified: () => handleAuthState(user),
      onSignedOut: () => { },
    });
    return;
  }

  try {
    const profile = await ensureUserDocument(user);
    if (sequence !== authSequence.value) return;
    if (!profile) throw new Error("Your Academix profile could not be loaded.");
    if (!profile.uid) profile.uid = user.uid;
    if (profile.blocked) {
      renderAccountUnavailable("This account has been blocked by an administrator.");
      return;
    }
    state.profile = profile;
    state.authResolved = true;

    const results = await Promise.allSettled([
      fetchBranches(),
      fetchContributors(),
      fetchSettings(),
      fetchYears(),
    ]);
    if (sequence !== authSequence.value) return;

    const [branchesResult, contributorsResult, settingsResult, yearsResult] = results;
    state.branches = branchesResult.status === "fulfilled" ? branchesResult.value : [];
    state.contributors = contributorsResult.status === "fulfilled" ? contributorsResult.value : [];
    state.settings = settingsResult.status === "fulfilled" ? settingsResult.value : { adsEnabled: false, version: "1.0.0" };
    state.years = yearsResult.status === "fulfilled" ? yearsResult.value : [];

    if (branchesResult.status === "rejected" || yearsResult.status === "rejected") {
      throw branchesResult.status === "rejected" ? branchesResult.reason : yearsResult.reason;
    }

    ensureValidSelection();
    settingsUnsubscribe = subscribeSettings((settings) => {
      const previous = state.settings;
      state.settings = settings;
      if (previous?.adsEnabled && !settings.adsEnabled) removeAllAds();
      if (settings.adsEnabled) document.documentElement.dataset.ads = "on";
      else delete document.documentElement.dataset.ads;
    }, (error) => {
      console.warn("Settings listener stopped.", error);
    });

    if (pendingAuthMessage) {
      toast(pendingAuthMessage, { type: "error" });
      pendingAuthMessage = "";
    }

    let redirectTarget = "";
    try {
      redirectTarget = sessionStorage.getItem(REDIRECT_STORAGE_KEY) || "";
      if (redirectTarget) sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
    } catch { }

    if (isDeepLinkHash(redirectTarget) && !isDeepLinkHash(location.hash)) {
      history.replaceState(null, "", redirectTarget);
    } else if (!location.hash || ["#/", "#/login", "#/auth"].includes(location.hash)) {
      history.replaceState(null, "", "#/home");
    }
    await renderRoute();
    maybeShowOnboarding();
    maybeShowInstallPrompt();
    maybePromptGooglePassword(user);
  } catch (error) {
    if (sequence !== authSequence.value) return;
    console.error(error);
    if (error?.code === "permission-denied") {
      renderAccountUnavailable("Your account is not available right now. It may be blocked, or Firestore rules may not be deployed.");
    } else {
      renderFatalError(error);
    }
  }
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/home";
  const [pathPart, queryPart = ""] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  return {
    path: `/${segments.join("/")}`,
    segments,
    query: new URLSearchParams(queryPart),
  };
}

function pageForRoute(path) {
  if (path.startsWith("/admin")) {
    const sub = path.split("/")[2] || "dashboard";
    return {
      dashboard: renderDashboard,
      structure: renderStructure,
      documents: renderDocuments,
      contributions: renderContributions,
      contributors: renderContributors,
      ads: renderAds,
      users: renderUsers,
    }[sub] || null;
  }
  if (path === "/home" || path === "/") return renderHome;
  if (path === "/library") return renderLibrary;
  if (path === "/bookmarks") return renderBookmarks;
  if (path === "/profile") return renderProfile;
  if (path === "/contribute") return renderContribute;
  if (path === "/about") return renderAbout;
  if (path === "/terms") return renderTerms;
  if (path === "/privacy") return renderPrivacy;
  return null;
}

function activeNavFor(route) {
  if (route.path.startsWith("/admin")) return "admin";
  if (route.path === "/home" || route.path === "/") return "home";
  if (route.path === "/library" || route.path.startsWith("/subject") || route.path.startsWith("/viewer")) return "library";
  if (route.path === "/bookmarks") return "bookmarks";
  if (route.path === "/profile" || route.path === "/about" || route.path === "/contribute") return "profile";
  return "";
}

async function renderRoute() {
  if (!state.user || !state.profile) return;
  const sequence = ++routeState.sequence;
  routeState.cleanup?.();
  routeState.cleanup = null;
  closeAllOverlays();

  let route = parseRoute();
  if (route.path === "/" || route.path === "/login") {
    history.replaceState(null, "", "#/home");
    route = parseRoute();
  }

  if (route.path.startsWith("/admin") && !isAdmin()) {
    toast("Admin access is required for that page.", { type: "error" });
    history.replaceState(null, "", "#/home");
    route = parseRoute();
  }

  if (route.segments[0] === "viewer") {
    const docId = route.segments[1] || "";
    document.body.dataset.page = "viewer";
    root.innerHTML = "";
    try {
      const cleanup = await renderViewer(root, {
        ...route,
        docId,
        state,
        onAdSlot: (target) => trackAdImpressions(target),
      });
      if (sequence === routeState.sequence) {
        routeState.cleanup = combineCleanup(cleanup, trackAdImpressions(root));
        syncOfflineBanner();
      }
    } catch (error) {
      console.error(error);
      if (sequence === routeState.sequence) {
        root.innerHTML = `<div class="page-container">${renderPageError(error, route.path)}</div>`;
        root.querySelector("[data-retry-route]")?.addEventListener("click", () => renderRoute());
      }
    }
    return;
  }

  if (route.segments[0] === "subject") {
    document.body.dataset.page = "subject";
  } else if (route.path.startsWith("/admin")) {
    document.body.dataset.page = "admin";
  } else {
    document.body.dataset.page = "app";
  }

  renderShell(activeNavFor(route));
  const main = root.querySelector("#main-content");
  if (!main) return;
  window.scrollTo({ top: 0, behavior: "auto" });
  main.innerHTML = `<div class="page">${skeletonPageHTML(route.path.startsWith("/admin") ? "admin" : route.segments[0] === "subject" ? "subject" : route.path === "/library" ? "library" : "home")}</div>`;

  const page = pageForRoute(route.path);
  try {
    if (route.segments[0] === "subject") {
      const subjectId = route.segments[1] || "";
      const cleanup = await renderSubject(main, { ...route, subjectId, state });
      if (sequence === routeState.sequence) {
        routeState.cleanup = combineCleanup(cleanup, trackAdImpressions(main));
        syncOfflineBanner();
      }
      return;
    }

    if (!page) {
      renderNotFound(main);
      syncOfflineBanner();
      return;
    }

    const cleanup = await page(main, { ...route, state });
    if (sequence !== routeState.sequence) return;
    routeState.cleanup = combineCleanup(cleanup, trackAdImpressions(main));
    syncOfflineBanner();
  } catch (error) {
    console.error(error);
    if (sequence !== routeState.sequence) return;
    main.innerHTML = `<div class="page">${renderPageError(error, route.path)}</div>`;
    main.querySelector("[data-retry-route]")?.addEventListener("click", () => renderRoute());
    syncOfflineBanner();
  }
}

function combineCleanup(...cleanups) {
  return () => {
    cleanups.forEach((cleanup) => {
      if (typeof cleanup === "function") cleanup();
    });
  };
}

function navItemHTML(item, active, mobile = false) {
  const isActive = active === item.id;
  const className = mobile ? "nav-item" : "sidebar__link";
  return `<a class="${className} ${isActive ? "is-active" : ""}" href="#/${item.id === "home" ? "home" : item.id}" ${isActive ? 'aria-current="page"' : ""} title="${escapeAttr(item.label)}" aria-label="${escapeAttr(item.label)}">
    <span class="${mobile ? "nav-item__icon" : "sidebar__link-icon"}">${icon(item.icon)}</span>
    <span class="${mobile ? "nav-item__label" : "sidebar__link-label"}">${escapeHtml(item.label)}</span>
  </a>`;
}

function renderShell(active) {
  const profile = state.profile || {};
  const admin = isAdmin();
  const existingShell = root.querySelector(".app-shell");
  const existingAdmin = Boolean(root.querySelector('.sidebar__link[href="#/admin"]'));

  if (existingShell && existingAdmin === admin) {
    root.querySelectorAll(".sidebar__link, .nav-item").forEach((link) => {
      const href = link.getAttribute("href") || "";
      const id = href.replace(/^#\//, "");
      const isActive = id === active;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const mini = root.querySelector(".sidebar__mini-profile");
    if (mini) {
      const name = mini.querySelector(".sidebar__mini-name");
      if (name) name.textContent = profile.name || "Student";
      const role = mini.querySelector(".sidebar__mini-role");
      if (role) role.textContent = admin ? "Administrator" : "Student";
      const avatar = mini.querySelector(".avatar");
      if (avatar) avatar.outerHTML = avatarHTML(profile, { size: "sm" });
    }
    return;
  }

  const navItems = [
    { id: "home", label: "Home", icon: "home" },
    { id: "library", label: "Library", icon: "library" },
    { id: "bookmarks", label: "Bookmarks", icon: "bookmark" },
    { id: "profile", label: "Profile", icon: "user" },
    ...(admin ? [{ id: "admin", label: "Admin", icon: "shield" }] : []),
  ];

  root.innerHTML = `
    <div class="app-shell">
      <div class="app-bg" aria-hidden="true"></div>
      <aside class="sidebar" aria-label="Primary navigation">
        <a class="sidebar__brand" href="#/home" aria-label="Academix home">
          <span class="brand-mark brand-mark--lime brand-mark--sm" aria-hidden="true">
            <img src="./icons/icon-192.png" alt="Academix" width="38" height="38" />
          </span>
          <span>
            <span class="sidebar__wordmark">Academix</span>
            <span class="sidebar__tagline">Your notes. One place.</span>
          </span>
        </a>
        <nav class="sidebar__nav">
          <span class="sidebar__label">Study</span>
          ${navItems.filter((item) => item.id !== "admin").map((item) => navItemHTML(item, active)).join("")}
          ${admin ? `<span class="sidebar__label">Manage</span>${navItemHTML(navItems.find((item) => item.id === "admin"), active)}` : ""}
        </nav>
        <div class="sidebar__footer">
          <a class="sidebar__mini-profile" href="#/profile">
            ${avatarHTML(profile, { size: "sm" })}
            <span class="sidebar__mini-copy">
              <span class="sidebar__mini-name">${escapeHtml(profile.name || "Student")}</span>
              <span class="sidebar__mini-role">${admin ? "Administrator" : "Student"}</span>
            </span>
            ${icon("chevron-right", "icon--sm")}
          </a>
        </div>
      </aside>
      <div class="app-main">
        <main id="main-content" class="page-container"></main>
      </div>
      <nav class="bottom-nav" aria-label="Primary navigation">
        ${navItems.map((item) => navItemHTML(item, active, true)).join("")}
      </nav>
    </div>
  `;
}

function renderSetupScreen() {
  document.body.dataset.page = "auth";
  root.innerHTML = `
    <main class="setup-screen">
      <section class="setup-card">
        <span class="brand-mark brand-mark--lime" aria-hidden="true">
          <img src="./icons/icon-192.png" alt="Academix" width="52" height="52" />
        </span>
        <h1><span class="fw-light">One quick</span> <strong>setup.</strong></h1>
        <p>Academix is ready, but it needs your Firebase project details before students can sign in. Open <strong>firebase.config.js</strong> and paste the web app config from the Firebase console.</p>
        <div class="setup-steps">
          <div class="setup-step"><span class="setup-step__n">1</span><span>Create a Firebase project and enable Google and Email/Password authentication.</span></div>
          <div class="setup-step"><span class="setup-step__n">2</span><span>Create a Firestore database and deploy the included rules and indexes.</span></div>
          <div class="setup-step"><span class="setup-step__n">3</span><span>Paste the config values and reload. README.md walks through every step.</span></div>
        </div>
        <pre class="setup-code">export const firebaseConfig = {
  apiKey: "…",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  appId: "…"
};</pre>
      </section>
    </main>
  `;
}

function renderAccountUnavailable(message) {
  state.blocked = true;
  document.body.dataset.page = "auth";
  root.innerHTML = `
    <main class="blocked-screen">
      <section class="blocked-card">
        <div class="blocked-card__icon">${icon("shield")}</div>
        <h1>Account unavailable</h1>
        <p>${escapeHtml(message)} If you think this is a mistake, contact your Academix administrator.</p>
        <div class="blocked-card__actions">
          <button class="btn btn--primary" type="button" id="blocked-signout">Sign out</button>
          <a class="btn btn--white" href="mailto:${escapeHtml(state.settings?.contactEmail || "")}">Contact administrator</a>
        </div>
      </section>
    </main>
  `;
  root.querySelector("#blocked-signout")?.addEventListener("click", () => signOutUser());
}

function renderFatalError(error) {
  document.body.dataset.page = "auth";
  root.innerHTML = `
    <main class="verify-screen">
      <section class="verify-card">
        <div class="verify-card__icon" style="background:var(--red-soft);color:var(--red)">${icon("alert-circle")}</div>
        <h1 class="verify-card__title"><span class="fw-light">Couldn’t</span> <strong>load Academix.</strong></h1>
        <p class="verify-card__text">${escapeHtml(error?.message || "Something went wrong while loading your library.")}</p>
        <div class="verify-card__actions">
          <button class="btn btn--primary btn--block" type="button" id="fatal-retry">Try again</button>
          <button class="btn btn--white btn--block" type="button" id="fatal-signout">Sign out</button>
        </div>
      </section>
    </main>
  `;
  root.querySelector("#fatal-retry")?.addEventListener("click", () => window.location.reload());
  root.querySelector("#fatal-signout")?.addEventListener("click", () => signOutUser());
}

function renderPageError(error, path) {
  const permission = error?.code === "permission-denied";
  return `<div class="page--compact">
    <div class="error-state">
      <div class="error-state__icon">${icon(permission ? "shield" : "alert-circle")}</div>
      <h1 class="error-state__title">${permission ? "Access denied" : "This page didn’t load"}</h1>
      <p class="error-state__text">${escapeHtml(permission ? "You don’t have permission to view this content." : error?.message || "A network or data problem interrupted the page.")}</p>
      <div class="error-state__actions">
        <button class="btn btn--primary btn--sm" type="button" data-retry-route>Retry</button>
        <a class="btn btn--white btn--sm" href="#/home">Go home</a>
      </div>
    </div>
  </div>`;
}

function renderNotFound(main) {
  main.innerHTML = `<div class="page page--compact">
    <div class="error-state">
      <div class="error-state__icon">${icon("search")}</div>
      <h1 class="error-state__title">Page not found</h1>
      <p class="error-state__text">That link doesn’t lead anywhere in Academix. Head back to your notes.</p>
      <div class="error-state__actions"><a class="btn btn--primary btn--sm" href="#/home">Go home</a></div>
    </div>
  </div>`;
}

function maybeShowOnboarding() {
  const profile = state.profile;
  if (!profile || onboardingShown) return;

  const uid = profile.uid || state.user?.uid;
  let termsAccepted = Boolean(profile.termsAccepted);
  if (!termsAccepted && uid) {
    try {
      if (localStorage.getItem(`academix_terms_${uid}`) === "true") termsAccepted = true;
    } catch { }
  }

  if (profile.branchId && profile.yearId && termsAccepted) return;
  if (!state.years.length || !state.branches.length) return;
  if (location.hash.startsWith("#/viewer/")) return;

  onboardingShown = true;
  const firstYear = state.years.find((year) => year.id === (profile.yearId || state.selection.yearId)) || state.years[0];
  let selectedYear = profile.yearId || firstYear?.id || "";
  let selectedBranch = profile.branchId || state.branches.find((branch) => branch.id === (profile.branchId || state.selection.branchId))?.id || "";
  let acceptedTerms = termsAccepted;

  const sheet = openSheet({
    title: "Make Academix yours",
    subtitle: "Confirm your study setup and accept the terms to get started.",
    closeOnBackdrop: false,
    content: `<div class="onboarding-intro">
        <h3 class="onboarding-intro__title"><span class="fw-light">Welcome to</span> <strong>Academix.</strong></h3>
        <p class="onboarding-intro__text">Choose your current year and branch. You can change this anytime in Profile.</p>
      </div>
      <div class="onboarding-section">
        <span class="filter-group__label">Your year</span>
        <div class="onboarding-options">
          ${state.years.map((year) => `<button class="onboarding-option ${year.id === selectedYear ? "is-selected" : ""}" type="button" data-onboard-year="${escapeHtml(year.id)}">
            <span class="onboarding-option__name">${escapeHtml(year.name)}</span>
            <span class="onboarding-option__meta">${Array.isArray(year.semesters) ? `${year.semesters.length} semesters` : "Year"}</span>
          </button>`).join("")}
        </div>
      </div>
      <div class="onboarding-section">
        <span class="filter-group__label">Your branch</span>
        <div class="onboarding-branch-grid">
          ${state.branches.map((branch) => `<button class="onboarding-option ${branch.id === selectedBranch ? "is-selected" : ""}" type="button" data-onboard-branch="${escapeHtml(branch.id)}">
            <span class="onboarding-option__name">${escapeHtml(branch.shortName || branch.name)}</span>
            <span class="onboarding-option__meta">${escapeHtml(branch.name)}</span>
          </button>`).join("")}
        </div>
      </div>
      <div class="onboarding-legal">
        <label class="checkbox" for="onboard-terms-agree">
          <input type="checkbox" id="onboard-terms-agree" data-onboard-terms ${acceptedTerms ? "checked" : ""} />
          <span>I have read and agree to the <button type="button" class="btn-link" data-open-terms>Terms & Conditions</button> and <button type="button" class="btn-link" data-open-privacy>Privacy Policy</button>.</span>
        </label>
      </div>`,
    footer: `<button class="btn btn--primary" type="button" data-onboard-save ${!selectedYear || !selectedBranch || !acceptedTerms ? "disabled" : ""}>Start studying</button>`,
    onMount(sheetElement, close) {
      const saveButton = sheetElement.querySelector("[data-onboard-save]");
      const termsCheckbox = sheetElement.querySelector("[data-onboard-terms]");
      const sync = () => {
        acceptedTerms = Boolean(termsCheckbox?.checked);
        if (saveButton) saveButton.disabled = !selectedYear || !selectedBranch || !acceptedTerms;
      };
      termsCheckbox?.addEventListener("change", sync);

      sheetElement.querySelectorAll("[data-open-terms]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          openLegalSheet("terms");
        });
      });
      sheetElement.querySelectorAll("[data-open-privacy]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          openLegalSheet("privacy");
        });
      });

      sheetElement.querySelectorAll("[data-onboard-year]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedYear = button.dataset.onboardYear;
          sheetElement.querySelectorAll("[data-onboard-year]").forEach((item) => item.classList.toggle("is-selected", item === button));
          sync();
        });
      });
      sheetElement.querySelectorAll("[data-onboard-branch]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedBranch = button.dataset.onboardBranch;
          sheetElement.querySelectorAll("[data-onboard-branch]").forEach((item) => item.classList.toggle("is-selected", item === button));
          sync();
        });
      });
      saveButton?.addEventListener("click", async () => {
        if (!selectedYear || !selectedBranch || (termsCheckbox && !termsCheckbox.checked)) return;
        setButtonLoading(saveButton, true, "Saving your setup");
        try {
          const uid = state.profile?.uid || state.user?.uid;
          const now = new Date().toISOString();
          try {
            if (uid) localStorage.setItem(`academix_terms_${uid}`, "true");
          } catch { }
          await updateOwnProfile(uid, {
            yearId: selectedYear,
            branchId: selectedBranch,
            termsAccepted: true,
            termsAcceptedAt: now,
          });
          const year = state.years.find((item) => item.id === selectedYear);
          const semester = Array.isArray(year?.semesters) && year.semesters.length ? Math.min(...year.semesters) : 1;
          setSelection({ yearId: selectedYear, semester, branchId: selectedBranch });
          state.profile = {
            ...state.profile,
            uid: uid || state.profile?.uid,
            yearId: selectedYear,
            branchId: selectedBranch,
            termsAccepted: true,
            termsAcceptedAt: now,
          };
          onboardingShown = true;
          close();
          toast("Your study setup is ready. Welcome to Academix!", { type: "success" });
          renderRoute();
        } catch (error) {
          setButtonLoading(saveButton, false);
          toast(error?.message || "Your preferences could not be saved.", { type: "error" });
        }
      });
    },
  });
  return sheet;
}

function maybeShowInstallPrompt() {
  if (!state.deferredInstallPrompt || state.installPromptShown || isInstallDismissed()) return;
  state.installPromptShown = true;
  window.setTimeout(() => {
    toast("Keep Academix one tap away. Install it on your home screen.", {
      type: "info",
      actionLabel: "Install",
      duration: 8000,
      onAction: promptInstall,
    });
  }, 1600);
}

async function promptInstall() {
  if (state.deferredInstallPrompt) {
    state.deferredInstallPrompt.prompt();
    const choice = await state.deferredInstallPrompt.userChoice.catch(() => ({ outcome: "dismissed" }));
    state.deferredInstallPrompt = null;
    if (choice.outcome === "accepted") {
      toast("Academix is being installed.", { type: "success" });
    } else {
      dismissInstallPrompt();
    }
    return;
  }
  toast("Use your browser menu and choose “Add to Home Screen”.", { type: "info", duration: 5000 });
}

function setupGlobalListeners() {
  // Safety: if #app ever gets stuck with inert=true (e.g. from a race
  // between sheet close timeouts and navigation), clear it on any
  // pointer-down so the sidebar is never permanently dead.
  window.addEventListener("pointerdown", () => {
    const app = document.getElementById("app");
    const overlayRoot = document.getElementById("overlay-root");
    // If nothing is in overlay-root, there's no open sheet/dialog,
    // so #app should not be inert.
    if (app && app.inert && (!overlayRoot || !overlayRoot.children.length)) {
      app.inert = false;
      document.body.classList.remove("no-scroll");
    }
  }, true);

  window.addEventListener("hashchange", () => {
    if (state.user && state.profile) renderRoute();
    else captureRedirectTarget();
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='#/']");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (!href.startsWith("#/")) return;

    closeAllOverlays();
    if (location.hash === href) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    maybeShowInstallPrompt();
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    toast("Academix was added to your home screen.", { type: "success" });
  });

  window.addEventListener("profile-updated", () => {
    if (location.hash === "#/profile") renderRoute();
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href="#/home"], a[href="#/"]');
    if (link && (location.hash === "#/home" || location.hash === "#/" || !location.hash)) {
      const homeInput = document.getElementById("home-search-input");
      const homeResults = document.getElementById("home-search-results");
      const homeClear = document.getElementById("home-search-clear");
      if (homeInput && (homeInput.value || (homeResults && !homeResults.hidden))) {
        homeInput.value = "";
        if (homeResults) {
          homeResults.hidden = true;
          homeResults.innerHTML = "";
        }
        if (homeClear) homeClear.hidden = true;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  window.addEventListener("online", () => {
    syncOfflineBanner();
    toast("You’re back online. Academix is syncing.", { type: "success" });
  });

  window.addEventListener("offline", () => {
    syncOfflineBanner();
    toast("You’re offline. Cached notes remain available.", { type: "info" });
  });

  document.addEventListener("load", (event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.matches("[data-avatar-img]")) {
      const fallback = image.previousElementSibling;
      if (fallback && fallback.classList.contains("avatar__fallback")) {
        fallback.style.opacity = "0";
      }
    }
  }, true);

  document.addEventListener("error", (event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.matches("[data-avatar-img]")) {
      image.classList.add("is-broken");
      image.style.display = "none";
      const fallback = image.previousElementSibling;
      if (fallback && fallback.classList.contains("avatar__fallback")) {
        fallback.style.opacity = "1";
      }
    }
  }, true);

  document.addEventListener("click", (event) => {
    const dismiss = event.target.closest("[data-ad-dismiss]");
    if (dismiss) {
      event.preventDefault();
      dismiss.closest(".ad-slot")?.remove();
      return;
    }
    const adLink = event.target.closest("[data-ad-click]");
    if (adLink) {
      const adId = adLink.dataset.adClick;
      if (adId) recordAdClick(adId);
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!navigator.onLine) return;
    if (event.reason?.code === "permission-denied") return;
    console.warn("Unhandled application promise", event.reason);
  });
}

function syncOfflineBanner() {
  const main = document.getElementById("main-content");
  if (!main) return;
  const existing = document.getElementById("offline-banner");
  if (navigator.onLine) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const banner = document.createElement("div");
  banner.id = "offline-banner";
  banner.className = "offline-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = `${icon("wifi-off")}<span>You’re offline. Showing what’s available on this device.</span>`;
  main.prepend(banner);
}

function removeAllAds() {
  document.querySelectorAll(".js-ad-slot, .ad-slot").forEach((slot) => slot.remove());
}

function trackAdImpressions(target) {
  if (!target) return () => { };
  const slots = [...target.querySelectorAll(".js-ad-slot[data-ad-id]")];
  if (!slots.length) return () => { };
  const seen = new Set();
  const track = (slot) => {
    const adId = slot.dataset.adId;
    if (!adId || seen.has(adId)) return;
    seen.add(adId);
    const key = `Academix:ad-impression:${adId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Session storage may be disabled; still count once per rendered slot.
    }
    recordAdImpression(adId);
  };

  if (!("IntersectionObserver" in window)) {
    slots.forEach(track);
    return () => { };
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        track(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.45 });
  slots.forEach((slot) => observer.observe(slot));
  return () => observer.disconnect();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed.", error);
    });
  });
}

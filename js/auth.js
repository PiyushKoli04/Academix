import { auth } from "./firebase.js";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase.js";
import { escapeAttr, escapeHtml, friendlyAuthError, openSheet, setButtonLoading, toast } from "./ui.js";
import { clearUserState, state } from "./state.js";
import { openLegalSheet } from "./legal.js";
import { isNativeApp, nativeGoogleIdToken } from "./native.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9l3.3-2.5Z"/><path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2a10 10 0 0 0-8.9 5.5l3.3 2.6A5.9 5.9 0 0 1 12 6.1Z"/></svg>`;

function userRef(uid) {
  const targetUid = uid || auth.currentUser?.uid || state.profile?.uid;
  if (!targetUid) throw new Error("User identifier is required.");
  return doc(db, "users", targetUid);
}

function isEmailPasswordUser(user) {
  return Boolean(user?.providerData?.some((provider) => provider.providerId === "password"));
}

export function needsEmailVerification(user) {
  return Boolean(user && isEmailPasswordUser(user) && !user.emailVerified);
}

export async function getRedirectError() {
  try {
    await getRedirectResult(auth);
    return "";
  } catch (error) {
    return friendlyAuthError(error);
  }
}

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function ensureUserDocument(user) {
  if (!user) return null;
  const ref = userRef(user.uid);
  let snapshot;
  try {
    snapshot = await getDoc(ref);
  } catch (error) {
    if (error?.code === "permission-denied") throw error;
    throw error;
  }

  if (!snapshot.exists()) {
    const payload = {
      name: user.displayName || user.email?.split("@")[0] || "Student",
      email: user.email || "",
      photoURL: user.photoURL || "",
      role: "user",
      blocked: false,
      branchId: "",
      yearId: "",
      bookmarks: [],
      recentlyViewed: [],
      completedModules: {},
      termsAccepted: Boolean(user?.termsAccepted),
      termsAcceptedAt: user?.termsAccepted ? new Date().toISOString() : null,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    };
    try {
      await setDoc(ref, payload);
      return { uid: user.uid, ...payload, createdAt: new Date(), lastLogin: new Date() };
    } catch (error) {
      if (error?.code === "already-exists") {
        const retry = await getDoc(ref);
        return retry.exists() ? { uid: user.uid, ...retry.data() } : null;
      }
      throw error;
    }
  }

  const profile = { uid: user.uid, ...snapshot.data() };
  updateDoc(ref, { lastLogin: serverTimestamp() }).catch(() => {
    // Non-critical presence update; do not block app entry.
  });
  return profile;
}

export async function refreshCurrentUser() {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export async function signOutUser() {
  clearUserState();
  await signOut(auth);
}

export async function updateOwnProfile(uid, patch) {
  const targetUid = uid || auth.currentUser?.uid || state.profile?.uid;
  if (!targetUid) throw new Error("No user ID available for profile update.");
  const allowed = {};
  if (typeof patch.name === "string") allowed.name = patch.name.trim().slice(0, 100);
  if (typeof patch.photoURL === "string") allowed.photoURL = patch.photoURL.trim().slice(0, 2048);
  if (typeof patch.branchId === "string") allowed.branchId = patch.branchId.slice(0, 100);
  if (typeof patch.yearId === "string") allowed.yearId = patch.yearId.slice(0, 100);
  if (typeof patch.termsAccepted === "boolean") allowed.termsAccepted = patch.termsAccepted;
  if (typeof patch.termsAcceptedAt === "string") allowed.termsAcceptedAt = patch.termsAcceptedAt;
  if (!Object.keys(allowed).length) return;
  await updateDoc(userRef(targetUid), allowed);
  if (auth.currentUser && allowed.name) {
    updateProfile(auth.currentUser, { displayName: allowed.name }).catch(() => { });
  }
}

async function handleGoogleSignIn() {
  if (isNativeApp()) {
    // Android app: use the Google accounts already on the phone.
    const idToken = await nativeGoogleIdToken();
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    return;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}

function showAuthError(message) {
  const target = document.getElementById("auth-error");
  if (!target) {
    toast(message, { type: "error" });
    return;
  }
  target.textContent = message;
  target.hidden = false;
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function clearAuthError() {
  const target = document.getElementById("auth-error");
  if (target) {
    target.hidden = true;
    target.textContent = "";
  }
}

function setFieldError(id, message) {
  const field = document.querySelector(`[data-auth-field="${id}"]`);
  const error = field?.querySelector(".auth-field__error");
  if (!field || !error) return;
  field.classList.toggle("has-error", Boolean(message));
  error.textContent = message || "";
  error.hidden = !message;
}

function validateEmail(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
}

function openForgotPassword(prefill = "") {
  openSheet({
    title: "Reset your password",
    subtitle: "We’ll email you a secure link to choose a new password.",
    size: "auto",
    content: `<form class="sheet-form" id="reset-form" novalidate>
      <div class="field">
        <label class="field__label" for="reset-email">College email</label>
        <input class="input" id="reset-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@college.edu" value="${escapeAttr(prefill)}" required />
        <p class="field__error" hidden></p>
      </div>
      <div class="notice">${escapeHtml("If an account exists for this email, a reset link will arrive shortly. Check your spam folder too.")}</div>
      <button class="btn btn--primary btn--block" type="submit">Send reset link</button>
    </form>`,
    onMount(sheet) {
      const form = sheet.querySelector("#reset-form");
      const emailInput = form.querySelector("#reset-email");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = emailInput.value.trim();
        const error = form.querySelector(".field__error");
        if (!validateEmail(email)) {
          error.textContent = "Enter a valid email address.";
          error.hidden = false;
          emailInput.focus();
          return;
        }
        error.hidden = true;
        const button = form.querySelector('button[type="submit"]');
        setButtonLoading(button, true, "Sending reset link");
        try {
          await sendPasswordResetEmail(auth, email);
          toast("Password reset email sent. Check your inbox.", { type: "success" });
          sheet.querySelector("[data-sheet-close]")?.click();
        } catch (errorCaught) {
          const message = errorCaught?.code === "auth/user-not-found"
            ? "If an account exists for this email, a reset link will arrive shortly."
            : friendlyAuthError(errorCaught);
          if (errorCaught?.code === "auth/user-not-found") {
            toast(message, { type: "info" });
            sheet.querySelector("[data-sheet-close]")?.click();
          } else {
            error.textContent = message;
            error.hidden = false;
            setButtonLoading(button, false);
          }
        }
      });
    },
  });
}

export function renderAuthScreen(root) {
  const markup = `
    <main class="auth-screen">
      <div class="auth-shell">
        <section class="auth-intro" aria-labelledby="auth-heading">
          <div class="auth-brand">
            <span class="brand-mark brand-mark--lime brand-mark--sm" aria-hidden="true">
              <img src="./icons/icon-192.png" alt="Academix" width="38" height="38" />
            </span>
            <div>
              <p class="auth-brand__wordmark">Academix</p>
              <p class="auth-brand__tag">View-only notes library</p>
            </div>
          </div>
          <h1 class="auth-heading" id="auth-heading">
            <span class="light">Your Notes.</span>
            <span class="strong">One Place.</span>
          </h1>
          <p class="auth-sub">All your semester subjects, one clean main PDF, and the helping docs you actually need — sorted by year, semester, and branch.</p>
          <div class="auth-feature-row">
            <span class="auth-feature">${iconSafe("book-open")} Module-wise notes</span>
            <span class="auth-feature">${iconSafe("bookmark")} Save for later</span>
            <span class="auth-feature">${iconSafe("shield-check")} View-only access</span>
          </div>
          <div class="auth-preview" aria-hidden="true">
            <div class="auth-preview__card">
              <span class="auth-preview__dot">${iconSafe("book-open")}</span>
              <div style="flex:1"><div class="auth-preview__line" style="width:72%"></div><div class="auth-preview__line"></div></div>
            </div>
            <div class="auth-preview__card">
              <span class="auth-preview__dot" style="background:var(--surface-tint)">${iconSafe("graduation-cap")}</span>
              <div style="flex:1"><div class="auth-preview__line" style="width:84%"></div><div class="auth-preview__line"></div></div>
            </div>
          </div>
        </section>

        <section class="auth-card" aria-label="Sign in to Academix">
          <div class="auth-card__top">
            <div>
              <h2 class="auth-card__title" id="auth-card-title"><span class="fw-regular">Welcome</span> <strong>back.</strong></h2>
              <p class="auth-card__subtitle" id="auth-card-subtitle">Sign in to open your semester notes.</p>
            </div>
            <span class="auth-card__badge">${iconSafe("sparkles")}</span>
          </div>

          <div class="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected="true" class="is-active" data-auth-mode="login">Log in</button>
            <button type="button" role="tab" aria-selected="false" data-auth-mode="signup">Sign up</button>
          </div>

          <div style="height:16px"></div>
          <button class="google-btn" type="button" id="google-auth">
            ${GOOGLE_ICON}
            <span>Continue with Google</span>
          </button>

          <div class="auth-divider">OR CONTINUE WITH EMAIL</div>
          <p class="auth-error" id="auth-error" role="alert" hidden></p>
          <form class="auth-form" id="auth-form" novalidate>
            <div class="auth-field" data-auth-field="name" hidden>
              <label class="auth-field__label" for="auth-name">Full name</label>
              <div class="auth-field__wrap">
                ${iconSafe("user")}
                <input class="auth-input" id="auth-name" name="name" type="text" autocomplete="name" placeholder="Your name" maxlength="100" />
              </div>
              <p class="auth-field__error" hidden></p>
            </div>
            <div class="auth-field" data-auth-field="email">
              <label class="auth-field__label" for="auth-email">Email address</label>
              <div class="auth-field__wrap">
                ${iconSafe("mail")}
                <input class="auth-input" id="auth-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@college.edu" required />
              </div>
              <p class="auth-field__error" hidden></p>
            </div>
            <div class="auth-field" data-auth-field="password">
              <label class="auth-field__label" for="auth-password">Password</label>
              <div class="auth-field__wrap">
                ${iconSafe("lock")}
                <input class="auth-input" id="auth-password" name="password" type="password" autocomplete="current-password" placeholder="At least 6 characters" minlength="6" required />
                <button class="auth-field__action" type="button" id="toggle-password" aria-label="Show password">${iconSafe("eye")}</button>
              </div>
              <p class="auth-field__error" hidden></p>
            </div>
            <div class="auth-meta-row">
              <button class="auth-link" type="button" id="forgot-password">Forgot password?</button>
            </div>
            <div class="auth-terms" data-auth-signup-terms hidden>
              <label class="checkbox" for="auth-terms-agree">
                <input type="checkbox" id="auth-terms-agree" name="terms" />
                <span>I agree to the <button type="button" class="btn-link" data-open-terms>Terms & Conditions</button> and <button type="button" class="btn-link" data-open-privacy>Privacy Policy</button>.</span>
              </label>
            </div>
            <button class="auth-submit" type="submit" id="auth-submit">
              <span>Log in</span>
              ${iconSafe("arrow-right")}
            </button>
          </form>
          <p class="auth-toggle" id="auth-toggle-copy">New to Academix? <button type="button" data-switch-auth="signup">Create an account</button></p>
          <p class="auth-legal">By continuing you agree that notes are for personal study use only. Academix is a view-only library. Review our <button type="button" class="btn-link" data-open-terms>Terms</button> & <button type="button" class="btn-link" data-open-privacy>Privacy</button>.</p>
        </section>
      </div>
    </main>
  `;

  root.innerHTML = markup;
  document.body.dataset.page = "auth";

  let mode = "login";
  const form = root.querySelector("#auth-form");
  const nameField = root.querySelector('[data-auth-field="name"]');
  const emailField = root.querySelector('[data-auth-field="email"]');
  const passwordField = root.querySelector('[data-auth-field="password"]');
  const termsWrap = root.querySelector("[data-auth-signup-terms]");
  const termsCheckbox = root.querySelector("#auth-terms-agree");
  const emailInput = root.querySelector("#auth-email");
  const passwordInput = root.querySelector("#auth-password");
  const nameInput = root.querySelector("#auth-name");
  const submit = root.querySelector("#auth-submit");
  const title = root.querySelector("#auth-card-title");
  const subtitle = root.querySelector("#auth-card-subtitle");
  const toggleCopy = root.querySelector("#auth-toggle-copy");

  const setMode = (nextMode) => {
    mode = nextMode;
    const signup = mode === "signup";
    root.querySelectorAll("[data-auth-mode]").forEach((button) => {
      const active = button.dataset.authMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    nameField.hidden = !signup;
    if (termsWrap) termsWrap.hidden = !signup;
    emailInput.autocomplete = signup ? "email" : "username";
    passwordInput.autocomplete = signup ? "new-password" : "current-password";
    title.innerHTML = signup
      ? '<span class="fw-regular">Start your</span> <strong>library.</strong>'
      : '<span class="fw-regular">Welcome</span> <strong>back.</strong>';
    subtitle.textContent = signup
      ? "Create an account to start collecting notes."
      : "Sign in to open your semester notes.";
    submit.querySelector("span").textContent = signup ? "Create account" : "Log in";
    toggleCopy.innerHTML = signup
      ? 'Already have an account? <button type="button" data-switch-auth="login">Log in</button>'
      : 'New to Academix? <button type="button" data-switch-auth="signup">Create an account</button>';
    root.querySelectorAll("[data-switch-auth]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.switchAuth));
    });
    clearAuthError();
    [emailField, passwordField, nameField].forEach((field) => {
      field.classList.remove("has-error");
      const error = field.querySelector(".auth-field__error");
      if (error) {
        error.textContent = "";
        error.hidden = true;
      }
    });
  };

  root.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.authMode));
  });
  root.querySelectorAll("[data-switch-auth]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.switchAuth));
  });

  root.querySelectorAll("[data-open-terms]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openLegalSheet("terms");
    });
  });
  root.querySelectorAll("[data-open-privacy]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openLegalSheet("privacy");
    });
  });

  root.querySelector("#toggle-password")?.addEventListener("click", (event) => {
    const showing = passwordInput.type === "text";
    passwordInput.type = showing ? "password" : "text";
    event.currentTarget.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    event.currentTarget.innerHTML = iconSafe(showing ? "eye" : "eye-off");
  });

  root.querySelector("#forgot-password")?.addEventListener("click", () => {
    openForgotPassword(emailInput.value.trim());
  });

  root.querySelector("#google-auth")?.addEventListener("click", async (event) => {
    clearAuthError();
    const button = event.currentTarget;
    setButtonLoading(button, true, "Opening Google sign-in");
    try {
      await handleGoogleSignIn();
    } catch (error) {
      setButtonLoading(button, false);
      showAuthError(friendlyAuthError(error));
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAuthError();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput.value.trim();
    let valid = true;

    if (mode === "signup" && name.length < 2) {
      setFieldError("name", "Enter your full name.");
      valid = false;
    } else {
      setFieldError("name", "");
    }

    if (!validateEmail(email)) {
      setFieldError("email", "Enter a valid email address.");
      valid = false;
    } else {
      setFieldError("email", "");
    }

    if (password.length < 6) {
      setFieldError("password", "Use at least 6 characters.");
      valid = false;
    } else {
      setFieldError("password", "");
    }

    if (mode === "signup" && !termsCheckbox?.checked) {
      showAuthError("Please agree to the Terms & Conditions and Privacy Policy to continue.");
      valid = false;
    }

    if (!valid) return;

    setButtonLoading(submit, true, mode === "signup" ? "Creating your account" : "Signing you in");
    try {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: name }).catch(() => { });
        await ensureUserDocument({ ...credential.user, displayName: name, termsAccepted: true });
        await sendEmailVerification(credential.user).catch(() => {
          toast("Account created. We couldn’t send the verification email yet.", { type: "info" });
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      setButtonLoading(submit, false);
      showAuthError(friendlyAuthError(error));
    }
  });
}

export function renderVerificationScreen(root, user, options = {}) {
  const email = user?.email || "";
  root.innerHTML = `
    <main class="verify-screen">
      <section class="verify-card" aria-labelledby="verify-title">
        <div class="verify-card__icon">${iconSafe("mail")}</div>
        <h1 class="verify-card__title" id="verify-title"><span class="fw-regular">Check your</span> <strong>inbox.</strong></h1>
        <p class="verify-card__text">We sent a verification link to <span class="verify-card__email">${escapeHtml(email)}</span>. Open it, then come back here to continue.</p>
        <div class="verify-card__actions">
          <button class="btn btn--primary btn--block" type="button" id="verify-refresh">I’ve verified my email</button>
          <button class="btn btn--white btn--block" type="button" id="verify-resend">Resend verification email</button>
          <button class="link-btn" type="button" id="verify-logout" style="justify-content:center;padding:9px">Use a different account</button>
        </div>
      </section>
    </main>
  `;
  document.body.dataset.page = "auth";
  const refreshButton = root.querySelector("#verify-refresh");
  const resendButton = root.querySelector("#verify-resend");
  const logoutButton = root.querySelector("#verify-logout");

  refreshButton?.addEventListener("click", async () => {
    setButtonLoading(refreshButton, true, "Checking verification");
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified) {
        toast("Email verified. Welcome to Academix.", { type: "success" });
        options.onVerified?.();
      } else {
        toast("Not verified yet. Open the link in your inbox first.", { type: "info" });
        setButtonLoading(refreshButton, false);
      }
    } catch (error) {
      toast(friendlyAuthError(error), { type: "error" });
      setButtonLoading(refreshButton, false);
    }
  });

  resendButton?.addEventListener("click", async () => {
    setButtonLoading(resendButton, true, "Sending email");
    try {
      await sendEmailVerification(user);
      toast("Verification email sent. Check your inbox.", { type: "success" });
    } catch (error) {
      toast(friendlyAuthError(error), { type: "error" });
    } finally {
      setButtonLoading(resendButton, false);
    }
  });

  logoutButton?.addEventListener("click", async () => {
    await signOutUser();
    options.onSignedOut?.();
  });
}

function iconSafe(name) {
  const icons = {
    "book-open": '<path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H9a3 3 0 0 1 3 3v16a3 3 0 0 0-3-3H4.5A2.5 2.5 0 0 1 2 15.5Z"/><path d="M22 4.5A2.5 2.5 0 0 0 19.5 2H15a3 3 0 0 0-3 3v16a3 3 0 0 1 3-3h4.5a2.5 2.5 0 0 0 2.5-2.5Z"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/>',
    "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/>',
    "graduation-cap": '<path d="M21.4 10.9 12 6 2.6 10.9a1 1 0 0 0 0 1.8L12 18l9.4-5.3a1 1 0 0 0 0-1.8Z"/><path d="M6 12.5V17c0 1 2.7 3 6 3s6-2 6-3v-4.5"/><path d="M22 10v6"/>',
    sparkles: '<path d="m12 3-1.4 4.1L7 9l3.6 1.9L12 15l1.4-4.1L17 9l-3.6-1.9Z"/><path d="M5 14l-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8Z"/><path d="M19 3l-.5 1.5L17 5l1.5.5L19 7l.5-1.5L21 5l-1.5-.5Z"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-8.8 5.7a2 2 0 0 1-2.4 0L2 7"/>',
    lock: '<rect x="3" y="10" width="18" height="11" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    "eye-off": '<path d="m3 3 18 18"/><path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6"/><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-3.2 4.2"/><path d="M6.6 6.6C3.5 8.7 2 12 2 12s3.5 8 10 8a10.8 10.8 0 0 0 4.4-.9"/>',
    "arrow-right": '<path d="m9 18 6-6-6-6"/>',
  };
  const markup = icons[name] || icons["book-open"];
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${markup}</svg>`;
}

export { handleGoogleSignIn };

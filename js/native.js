// Bridge to the Academix Android app (WebView). In a normal browser nothing
// here is active and isNativeApp() is false.
//
// Google blocks sign-in inside embedded WebViews, so the app opens
// /app-login.html in the phone's real browser. That page signs in with Google
// and sends the result back to the app (academix://auth?...). The app then
// calls window.__academixBrowserAuth(payload) here.
const listeners = new Set();
let queued = window.__academixPendingAuth || null;

window.__academixBrowserAuth = (payload) => {
  if (!listeners.size) {
    queued = payload;
    return;
  }
  listeners.forEach((fn) => fn(payload));
};

export function isNativeApp() {
  try {
    return typeof window.AcademixNative !== "undefined" && window.AcademixNative.isNative() === true;
  } catch {
    return false;
  }
}

/** Listen for results coming back from the browser sign-in page. */
export function onBrowserAuth(fn) {
  listeners.add(fn);
  if (queued) {
    const payload = queued;
    window.setTimeout(() => {
      if (queued === payload) queued = null;
    }, 3000);
    window.setTimeout(() => fn(payload), 0);
  }
  return () => listeners.delete(fn);
}

/** mode: "login" (Firebase sign-in) or "drive" (Drive upload permission). */
export function openBrowserLogin(mode) {
  window.AcademixNative.openBrowserLogin(mode);
}

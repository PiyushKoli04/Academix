// Bridge to the Academix Android app (WebView). In a normal browser every
// function here is inert and isNativeApp() is false.
const pending = new Map();
let seq = 0;

window.__academixNativeResult = (id, value, error) => {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  window.clearTimeout(entry.timer);
  if (error) entry.reject(new Error(error));
  else entry.resolve(value);
};

export function isNativeApp() {
  try {
    return typeof window.AcademixNative !== "undefined" && window.AcademixNative.isNative() === true;
  } catch {
    return false;
  }
}

function call(method) {
  return new Promise((resolve, reject) => {
    const id = `n${++seq}_${Date.now()}`;
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error("The Google request timed out. Please try again."));
    }, 120_000);
    pending.set(id, { resolve, reject, timer });
    try {
      window.AcademixNative[method](id);
    } catch (error) {
      pending.delete(id);
      window.clearTimeout(timer);
      reject(error);
    }
  });
}

/** Google ID token from the phone's own accounts (for Firebase sign-in). */
export const nativeGoogleIdToken = () => call("requestGoogleIdToken");

/** Google Drive (drive.file) access token from the phone's own accounts. */
export const nativeDriveToken = () => call("requestDriveToken");

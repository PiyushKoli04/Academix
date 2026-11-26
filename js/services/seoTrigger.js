/**
 * Academix SEO Trigger Service
 *
 * Notifies CI/CD pipelines to rebuild static SEO pages when administrators
 * modify catalog content (subjects, modules, documents).
 *
 * Security:
 *   - NEVER reads or writes GitHub tokens in Firestore `settings/app` (since student
 *     accounts can read `settings/app`).
 *   - Supports an admin-verified webhook endpoint (`settings.seoWebhookUrl`) that
 *     authenticates the caller's Firebase ID token server-side before triggering CI,
 *     or a browser-local GitHub PAT stored only on the administrator's device.
 */

import { auth } from "../firebase.js";
import { fetchSettings } from "../db.js";

const DEFAULT_REPO = "PiyushKoli04/Academix";
const LOCAL_PAT_KEY = "academix:admin:gh-pat";
let dispatchDebounceTimer = null;

export function getLocalAdminGhToken() {
  try {
    return localStorage.getItem(LOCAL_PAT_KEY) || "";
  } catch {
    return "";
  }
}

export function setLocalAdminGhToken(token) {
  try {
    const clean = String(token || "").trim();
    if (clean) localStorage.setItem(LOCAL_PAT_KEY, clean);
    else localStorage.removeItem(LOCAL_PAT_KEY);
  } catch {
    // Ignore storage unavailability
  }
}

export async function dispatchSeoRebuildNow(action = "manual_sync", detail = {}) {
  try {
    const settings = await fetchSettings().catch(() => ({}));
    const webhookUrl = String(settings?.seoWebhookUrl || "").trim();

    if (webhookUrl && /^https:\/\//i.test(webhookUrl)) {
      const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : "";
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          action,
          timestamp: new Date().toISOString(),
          ...detail,
        }),
      });
      if (response.ok) return { triggered: true, mode: "webhook" };
      return { triggered: false, mode: "webhook", status: response.status };
    }

    const localToken = getLocalAdminGhToken();
    const repo = String(settings?.githubRepo || DEFAULT_REPO).trim();
    if (!localToken) {
      return { triggered: false, reason: "no_trigger_configured" };
    }

    const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${localToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "seo-update",
        client_payload: {
          action,
          timestamp: new Date().toISOString(),
          ...detail,
        },
      }),
    });

    if (response.ok || response.status === 204) {
      return { triggered: true, mode: "github_dispatch" };
    }
    return { triggered: false, mode: "github_dispatch", status: response.status };
  } catch (err) {
    return { triggered: false, error: err.message };
  }
}

export function triggerSeoBuild(action = "content_updated", detail = {}) {
  if (dispatchDebounceTimer) clearTimeout(dispatchDebounceTimer);
  dispatchDebounceTimer = setTimeout(() => {
    dispatchSeoRebuildNow(action, detail).catch(() => {});
  }, 3000);
}

/**
 * Academix SEO Trigger Service
 *
 * Dispatches automated repository events to GitHub Actions when administrators
 * publish, modify, or delete academic content (subjects, modules, documents).
 */

import { fetchSettings } from "../db.js";

const DEFAULT_REPO = "piyushkoli04/academix";
let dispatchDebounceTimer = null;

/**
 * Triggers an automated SEO rebuild via GitHub Actions repository_dispatch.
 * Debounces calls within 15 seconds to prevent rapid multiple triggers.
 *
 * @param {string} action - e.g., 'subject_saved', 'document_deleted'
 * @param {object} detail - contextual payload
 */
export async function triggerSeoBuild(action = "content_updated", detail = {}) {
  if (dispatchDebounceTimer) {
    clearTimeout(dispatchDebounceTimer);
  }

  dispatchDebounceTimer = setTimeout(async () => {
    try {
      const settings = await fetchSettings().catch(() => ({}));
      const token = settings?.githubDispatchToken || "";
      const repo = settings?.githubRepo || DEFAULT_REPO;

      if (!token) {
        // Without a configured token, rely on the daily automated cron backup
        // or manual workflow_dispatch from the GitHub repository.
        console.info(`[SEO] Content change detected (${action}). Daily cron will synchronize sitemap.`);
        return { triggered: false, reason: "No GitHub token configured in settings" };
      }

      const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
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
        console.log(`[SEO] Automated rebuild dispatched for ${action}`);
        return { triggered: true };
      } else {
        console.warn(`[SEO] GitHub dispatch failed with status: ${response.status}`);
        return { triggered: false, status: response.status };
      }
    } catch (err) {
      console.warn("[SEO] Rebuild trigger error:", err.message);
      return { triggered: false, error: err.message };
    }
  }, 3000);
}


import { appConfig } from "../../firebase.config.js";
import { fetchSettings, saveSettings } from "../db.js";
import { isNativeApp, onBrowserAuth, openBrowserLogin } from "../native.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const GIS_SRC = "https://accounts.google.com/gsi/client";

const TYPE_LABELS = {
  main: "Main Notes",
  pyq: "PYQ",
  formula: "Formula Sheet",
  syllabus: "Syllabus",
  lab: "Lab Manual",
  assignment: "Assignment",
  other: "Document",
};

let tokenClient = null;
let accessToken = "";
let tokenExpiresAt = 0;
let tokenRequest = null;
let cachedAccount = null;
let gisPromise = null;

export class DriveApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "DriveApiError";
    this.status = options.status || 0;
    this.reason = options.reason || "";
    this.code = options.code || "drive/error";
  }
}

export class DriveAuthError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "DriveAuthError";
    this.code = options.code || "drive/auth-required";
  }
}

export class UploaderMismatchError extends Error {
  constructor(currentEmail, expectedEmail) {
    super("This Google account is not the designated Drive uploader.");
    this.name = "UploaderMismatchError";
    this.code = "drive/uploader-mismatch";
    this.currentEmail = currentEmail;
    this.expectedEmail = expectedEmail;
  }
}

export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled.");
    this.name = "UploadCancelledError";
    this.code = "drive/cancelled";
  }
}

function config() {
  return appConfig.driveUpload || {};
}

export function isDriveUploadConfigured() {
  const clientId = String(config().clientId || "");
  return Boolean(clientId && !/PASTE_|YOUR_/i.test(clientId));
}

export function getDriveUploadMaxBytes() {
  const configured = Number(config().maxSizeMB);
  const mb = Number.isFinite(configured) && configured > 0 ? configured : 100;
  return Math.round(mb * 1024 * 1024);
}

export function getDriveUploadMaxMB() {
  return Math.round(getDriveUploadMaxBytes() / (1024 * 1024));
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function validatePdfFile(file, maxBytes = getDriveUploadMaxBytes()) {
  if (!file) return "Choose a PDF file first.";
  const name = String(file.name || "").toLowerCase();
  const mime = String(file.type || "").toLowerCase();
  if (!name.endsWith(".pdf")) return "Only PDF files are supported.";
  if (mime && mime !== "application/pdf") return "That file does not appear to be a PDF.";
  if (!file.size) return "That PDF is empty.";
  if (file.size > maxBytes) {
    return `This PDF is ${formatBytes(file.size)}. The upload limit is ${formatBytes(maxBytes)}.`;
  }
  return "";
}

export function safeDriveFileName(subjectCode, type) {
  const code = String(subjectCode || "Notes").replace(/[\\/:*?"<>|]+/g, "-").trim() || "Notes";
  const typeLabel = TYPE_LABELS[type] || "Document";
  return `${code} - ${typeLabel}.pdf`;
}

function sanitizeFolderName(name) {
  return String(name || "Untitled").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 100) || "Untitled";
}

function escapeQueryValue(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const script = existing || document.createElement("script");
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (error) {
        gisPromise = null;
        reject(error);
      } else if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        gisPromise = null;
        reject(new DriveAuthError("Google sign-in could not be loaded. Refresh the page and try again."));
      }
    };
    const timeout = window.setTimeout(() => finish(new DriveAuthError("Google sign-in took too long to load. Check your connection and retry.")), 12_000);
    script.addEventListener("load", () => finish(), { once: true });
    script.addEventListener("error", () => finish(new DriveAuthError("Google sign-in could not be loaded. Check your connection.")), { once: true });
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });
  return gisPromise;
}

if (isNativeApp()) {
  onBrowserAuth((payload) => {
    if (!payload || payload.mode !== "drive") return;
    if (payload.error || !payload.driveToken) {
      window.dispatchEvent(new CustomEvent("academix-native-drive", { detail: { error: payload.error || "Google did not return a Drive token." } }));
      return;
    }
    accessToken = payload.driveToken;
    tokenExpiresAt = Date.now() + (Number(payload.expiresIn) || 3300) * 1000;
    window.dispatchEvent(new CustomEvent("academix-native-drive", { detail: { token: payload.driveToken } }));
  });
}

function tokenIsFresh() {
  return Boolean(accessToken && Date.now() < tokenExpiresAt - TOKEN_EXPIRY_SKEW_MS);
}

function requestNewToken({ interactive = false, forceAccount = false } = {}) {
  if (!isDriveUploadConfigured()) {
    return Promise.reject(new DriveAuthError("Drive upload is not configured. Add a Google OAuth client ID to firebase.config.js."));
  }
  if (tokenIsFresh()) return Promise.resolve(accessToken);
  if (tokenRequest) return tokenRequest;

  if (isNativeApp()) {
    // Android app: the browser page gets the Drive token and sends it back.
    tokenRequest = new Promise((resolve, reject) => {
      const finish = (event) => {
        window.clearTimeout(timer);
        window.removeEventListener("academix-native-drive", finish);
        tokenRequest = null;
        if (event.detail?.error) {
          reject(new DriveAuthError(event.detail.error, { code: "native-drive" }));
        } else {
          resolve(event.detail.token);
        }
      };
      const timer = window.setTimeout(() => {
        window.removeEventListener("academix-native-drive", finish);
        tokenRequest = null;
        reject(new DriveAuthError("Google Drive access was not completed. Please try again.", { code: "native-drive" }));
      }, 5 * 60 * 1000);
      window.addEventListener("academix-native-drive", finish);
      try {
        openBrowserLogin("drive");
      } catch (error) {
        finish({ detail: { error: "Could not open the browser for Google Drive." } });
      }
    });
    return tokenRequest;
  }

  tokenRequest = loadGis()
    .then(() => new Promise((resolve, reject) => {
      const clientId = config().clientId;
      const loginHint = normalizeEmail(cachedAccount?.emailAddress || "");
      try {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          callback: (response) => {
            tokenRequest = null;
            if (response?.error) {
              reject(new DriveAuthError(mapTokenError(response.error), { code: response.error }));
              return;
            }
            if (!response?.access_token) {
              reject(new DriveAuthError("Google did not return a Drive token. Try again."));
              return;
            }
            accessToken = response.access_token;
            tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
            resolve(accessToken);
          },
          error_callback: (error) => {
            tokenRequest = null;
            reject(new DriveAuthError(mapTokenError(error?.type || error?.message), { code: error?.type || "popup" }));
          },
        });
        const options = {};
        if (forceAccount) options.prompt = "select_account";
        else if (!interactive) options.prompt = "";
        if (loginHint) options.login_hint = loginHint;
        tokenClient.requestAccessToken(options);
      } catch (error) {
        tokenRequest = null;
        reject(error instanceof DriveAuthError ? error : new DriveAuthError(mapTokenError(error?.message || error?.type), { code: "token-init" }));
      }
    }))
    .catch((error) => {
      tokenRequest = null;
      throw error;
    });

  return tokenRequest;
}

function mapTokenError(raw) {
  const value = String(raw || "").toLowerCase();
  if (value.includes("popup") || value.includes("failed_to_open") || value.includes("blocked")) {
    return "Your browser blocked the Google Drive window. Allow pop-ups for Academix and try again.";
  }
  if (value.includes("access_denied") || value.includes("consent")) {
    return "Drive access was not granted. Uploads need permission to manage files created by Academix.";
  }
  if (value.includes("interaction_required") || value.includes("login_required")) {
    return "Your Drive session needs attention. Click “Reconnect Drive” and approve access again.";
  }
  return "Google Drive access could not be completed. Please try again.";
}

async function ensureSilentToken() {
  if (tokenIsFresh()) return accessToken;
  try {
    return await requestNewToken({ interactive: false });
  } catch {
    throw new DriveAuthError("Your Google Drive session expired. Click “Reconnect Drive” and try again.", {
      code: "drive/session-expired",
    });
  }
}

export async function connectDrive({ interactive = true, forceAccount = false, verifyUploader = false } = {}) {
  if (!isDriveUploadConfigured()) {
    throw new DriveAuthError("Drive upload is not configured yet. Add your Google OAuth client ID first.");
  }
  if (forceAccount) {
    accessToken = "";
    tokenExpiresAt = 0;
    cachedAccount = null;
  }
  await requestNewToken({ interactive, forceAccount });
  const account = await getDriveAccount({ interactive });
  if (verifyUploader) {
    const settings = await fetchSettings();
    const expected = normalizeEmail(settings.driveUploaderEmail);
    if (expected && normalizeEmail(account.emailAddress) !== expected) {
      throw new UploaderMismatchError(account.emailAddress, settings.driveUploaderEmail);
    }
  }
  return account;
}

export function disconnectDrive() {
  accessToken = "";
  tokenExpiresAt = 0;
  tokenRequest = null;
  cachedAccount = null;
}

export async function switchDriveAccount() {
  if (accessToken) {
    try {
      window.google?.accounts?.oauth2?.revoke?.(accessToken, () => {});
    } catch {
      // Revoking is best-effort; clearing local token still forces a new consent flow.
    }
  }
  disconnectDrive();
  return connectDrive({ interactive: true, forceAccount: true });
}

export function getCachedDriveAccount() {
  return cachedAccount;
}

export async function getDriveAccount({ interactive = false } = {}) {
  await requestNewToken({ interactive });
  const data = await driveRequest("about?fields=user(emailAddress,displayName,permissionId)", {
    method: "GET",
  });
  const user = data?.user || {};
  cachedAccount = {
    emailAddress: user.emailAddress || "",
    displayName: user.displayName || user.emailAddress || "Google Drive",
    permissionId: user.permissionId || "",
  };
  return cachedAccount;
}

function parseDriveError(status, payload, fallback) {
  const reason = payload?.error?.errors?.[0]?.reason || payload?.error?.status || "";
  let message = payload?.error?.message || fallback || "Google Drive request failed.";
  if (status === 401) {
    message = "Your Google Drive session expired. Reconnect and try again.";
  } else if (status === 403) {
    if (reason === "storageQuotaExceeded") message = "Google Drive storage is full for this uploader account. Free up space or choose another designated uploader.";
    else if (reason === "userRateLimitExceeded" || reason === "rateLimitExceeded") message = "Google Drive is receiving too many requests. Wait a moment and retry.";
    else if (reason === "insufficientFilePermissions") message = "The uploader account no longer has permission to manage this Drive file or folder.";
    else message = "Google Drive denied this action. Check Drive API access, quota, and folder ownership.";
  } else if (status === 404) {
    message = "The Drive folder or file could not be found. Academix will try to recreate folders on the next attempt.";
  } else if (status === 429) {
    message = "Too many Drive requests. Wait a moment and retry.";
  } else if (status === 507) {
    message = "The uploader’s Google Drive storage is full.";
  }
  return new DriveApiError(message, { status, reason, code: reason || `drive/http-${status}` });
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function driveRequest(path, options = {}, retried = false) {
  const token = await ensureSilentToken();
  const url = path.startsWith("http") ? path : `${DRIVE_API}/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json; charset=UTF-8" } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 && !retried) {
    accessToken = "";
    tokenExpiresAt = 0;
    try {
      await requestNewToken({ interactive: false });
      return driveRequest(path, options, true);
    } catch {
      throw new DriveAuthError("Your Google Drive session expired. Reconnect and try again.", {
        code: "drive/session-expired",
      });
    }
  }

  const payload = await parseResponse(response);
  if (!response.ok) throw parseDriveError(response.status, payload);
  return payload;
}

async function isFolderValid(folderId) {
  if (!folderId) return false;
  try {
    const data = await driveRequest(
      `files/${encodeURIComponent(folderId)}?fields=id,trashed,mimeType`,
      { method: "GET" }
    );
    return Boolean(data?.id && !data.trashed && data.mimeType === FOLDER_MIME);
  } catch (error) {
    if (error?.status === 404 || error?.status === 403) return false;
    throw error;
  }
}

async function findFolder(name, parentId) {
  const q = [
    `name = '${escapeQueryValue(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
    `'${escapeQueryValue(parentId)}' in parents`,
  ].join(" and ");
  const params = new URLSearchParams({
    q,
    fields: "files(id,name)",
    pageSize: "20",
    spaces: "drive",
  });
  const data = await driveRequest(`files?${params.toString()}`, { method: "GET" });
  return data?.files?.[0]?.id || "";
}

async function createFolder(name, parentId) {
  const cleanName = sanitizeFolderName(name);
  const metadata = {
    name: cleanName,
    mimeType: FOLDER_MIME,
  };
  if (parentId) metadata.parents = [parentId];
  const data = await driveRequest("files?fields=id,name", {
    method: "POST",
    body: JSON.stringify(metadata),
  });
  if (!data?.id) throw new DriveApiError("Drive did not return a folder ID.");
  return data.id;
}

const LOCAL_CONTRIB_FOLDERS_PREFIX = "academix_contrib_drive_folders:";

function readLocalFolderCache(ownerEmail) {
  if (!ownerEmail) return {};
  try {
    const raw = localStorage.getItem(`${LOCAL_CONTRIB_FOLDERS_PREFIX}${ownerEmail}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalFolderCache(ownerEmail, folders) {
  if (!ownerEmail) return;
  try {
    localStorage.setItem(`${LOCAL_CONTRIB_FOLDERS_PREFIX}${ownerEmail}`, JSON.stringify(folders));
  } catch {
    // Ignore storage quota or private browsing errors.
  }
}

async function persistFolderCache(folders, { cacheFoldersInSettings = true, ownerEmail = "" } = {}) {
  if (!cacheFoldersInSettings) {
    writeLocalFolderCache(ownerEmail, folders);
    return;
  }
  try {
    await saveSettings({ driveFolders: folders, replaceDriveFolders: true });
  } catch (error) {
    console.warn("Drive folder cache could not be saved.", error);
  }
}

async function ensureFolderPath(segments = [], options = {}) {
  const ownerEmail = normalizeEmail(options.uploaderEmail || cachedAccount?.emailAddress || "");
  const cacheFoldersInSettings = options.cacheFoldersInSettings !== false;
  const rootFolderName = sanitizeFolderName(options.rootFolderName || "College Notes");

  let folders = {};
  if (!options.force) {
    if (cacheFoldersInSettings) {
      const settings = options.settings || await fetchSettings();
      const cachedOwner = normalizeEmail(settings.driveFolders?._owner || "");
      const ownerChanged = Boolean(ownerEmail && cachedOwner && ownerEmail !== cachedOwner);
      folders = ownerChanged
        ? (ownerEmail ? { _owner: ownerEmail } : {})
        : { ...(settings.driveFolders || {}), ...(ownerEmail ? { _owner: ownerEmail } : {}) };
    } else {
      folders = { ...readLocalFolderCache(ownerEmail), ...(ownerEmail ? { _owner: ownerEmail } : {}) };
    }
  } else if (ownerEmail) {
    folders = { _owner: ownerEmail };
  }

  try {
    let rootId = folders.root || "";
    if (rootId && !(await isFolderValid(rootId))) {
      rootId = "";
    }
    if (!rootId) {
      rootId = await findFolder(rootFolderName, "root");
      if (!rootId) rootId = await createFolder(rootFolderName, "root");
      folders.root = rootId;
    }

    let parentId = rootId;
    let folderPath = "";
    for (const rawSegment of segments) {
      const segment = sanitizeFolderName(rawSegment);
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      let folderId = folders[folderPath] || "";
      if (folderId && !(await isFolderValid(folderId))) {
        folderId = "";
      }
      if (!folderId) {
        folderId = await findFolder(segment, parentId);
        if (!folderId) folderId = await createFolder(segment, parentId);
        folders[folderPath] = folderId;
      }
      parentId = folderId;
    }

    await persistFolderCache(folders, { cacheFoldersInSettings, ownerEmail });
    return { folderId: parentId, folders };
  } catch (error) {
    if (!options.force && error instanceof DriveApiError && (error.status === 404 || error.status === 403)) {
      return ensureFolderPath(segments, { ...options, force: true });
    }
    throw error;
  }
}

function buildUploadMetadata({ file, folderId, subject, type, uploaderEmail }) {
  return {
    name: safeDriveFileName(subject?.code || subject?.name, type),
    mimeType: "application/pdf",
    parents: [folderId],
    appProperties: {
      AcademixSubjectId: subject?.id || "",
      AcademixDocType: type || "other",
      AcademixUploadedBy: uploaderEmail || "",
    },
  };
}

async function initiateResumableSession({ file, folderId, subject, type, uploaderEmail }) {
  const token = await ensureSilentToken();
  const params = new URLSearchParams({
    uploadType: "resumable",
    fields: "id,name,size,mimeType",
    supportsAllDrives: "false",
  });
  const response = await fetch(`${DRIVE_UPLOAD_API}/files?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/pdf",
      "X-Upload-Content-Length": String(file.size),
    },
    body: JSON.stringify(buildUploadMetadata({ file, folderId, subject, type, uploaderEmail })),
  });
  if (response.status === 401) {
    accessToken = "";
    tokenExpiresAt = 0;
    try {
      await requestNewToken({ interactive: false });
      return initiateResumableSession({ file, folderId, subject, type, uploaderEmail });
    } catch {
      throw new DriveAuthError("Your Google Drive session expired. Reconnect and retry the upload.", {
        code: "drive/session-expired",
      });
    }
  }
  const payload = await parseResponse(response);
  if (!response.ok) throw parseDriveError(response.status, payload);
  const sessionUrl = response.headers.get("Location") || response.headers.get("location");
  if (!sessionUrl) throw new DriveApiError("Drive did not provide a resumable upload session.");
  return sessionUrl;
}

function putChunk({ sessionUrl, file, offset, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }
    const xhr = new XMLHttpRequest();
    const total = file.size;
    let finished = false;

    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      xhr.abort();
      reject(new UploadCancelledError());
    };

    signal?.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", sessionUrl, true);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    if (offset > 0 || total > 0) {
      xhr.setRequestHeader("Content-Range", `bytes ${offset}-${total - 1}/${total}`);
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const loaded = offset + event.loaded;
      onProgress?.({
        loaded,
        total,
        percent: Math.min(100, Math.round((loaded / total) * 100)),
      });
    };
    xhr.onload = () => {
      if (finished) return;
      finished = true;
      cleanup();
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText || "{}"));
        } catch {
          reject(new DriveApiError("Drive completed the upload but returned an unreadable response."));
        }
        return;
      }
      if (xhr.status === 308) {
        const range = xhr.getResponseHeader("Range") || "";
        const match = range.match(/bytes=0-(\d+)/i);
        const received = match ? Number(match[1]) + 1 : offset;
        resolve({ incomplete: true, offset: received });
        return;
      }
      let payload = null;
      try {
        payload = JSON.parse(xhr.responseText || "{}");
      } catch {
        payload = null;
      }
      reject(parseDriveError(xhr.status, payload, "The PDF upload failed."));
    };
    xhr.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new DriveApiError("The network connection was interrupted during upload.", { code: "drive/network" }));
    };
    xhr.onabort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new UploadCancelledError());
    };
    xhr.ontimeout = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new DriveApiError("The upload timed out. Retry to resume from the last saved position.", { code: "drive/timeout" }));
    };

    const body = file.slice(offset);
    xhr.send(body);
  });
}

async function queryUploadOffset(sessionUrl, total) {
  const response = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Length": "0",
      "Content-Range": `bytes */${total}`,
    },
  });
  if (response.status === 308) {
    const range = response.headers.get("Range") || "";
    const match = range.match(/bytes=0-(\d+)/i);
    return { incomplete: true, offset: match ? Number(match[1]) + 1 : 0 };
  }
  if (response.status === 200 || response.status === 201) {
    const payload = await parseResponse(response);
    return { incomplete: false, data: payload };
  }
  if (response.status === 404 || response.status === 410) {
    return { expired: true };
  }
  const payload = await parseResponse(response);
  throw parseDriveError(response.status, payload, "Could not check the upload status.");
}

async function uploadWithResume({ sessionUrl, file, onProgress, signal }) {
  let offset = 0;
  let retries = 0;
  onProgress?.({ loaded: 0, total: file.size, percent: 0 });
  while (offset < file.size) {
    try {
      const result = await putChunk({ sessionUrl, file, offset, onProgress, signal });
      if (!result.incomplete) return result;
      offset = Math.max(offset, result.offset || 0);
      if (offset >= file.size) {
        const check = await queryUploadOffset(sessionUrl, file.size);
        if (check.incomplete) throw new DriveApiError("Drive did not finalize the PDF upload.");
        return check.data;
      }
    } catch (error) {
      if (error instanceof UploadCancelledError) throw error;
      if (signal?.aborted) throw new UploadCancelledError();
      if (error?.code === "drive/network" || error?.code === "drive/timeout") {
        retries += 1;
        if (retries > 2) {
          throw new DriveApiError("Upload was interrupted repeatedly. Your progress is saved for a short time; retry to resume.", {
            code: "drive/network",
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 900 * retries));
        try {
          const status = await queryUploadOffset(sessionUrl, file.size);
          if (status.expired) {
            throw new DriveApiError("The upload session expired. Retry the upload.", { code: "drive/session-expired" });
          }
          if (!status.incomplete) return status.data;
          offset = status.offset || offset;
          continue;
        } catch (statusError) {
          if (statusError instanceof DriveApiError && statusError.code === "drive/network") {
            throw statusError;
          }
          throw statusError;
        }
      }
      throw error;
    }
  }
  return null;
}

async function setPublicReadable(fileId) {
  await driveRequest(`files/${encodeURIComponent(fileId)}/permissions?fields=id&sendNotificationEmail=false`, {
    method: "POST",
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
}

async function disableDownloadPrintCopy(fileId) {
  await driveRequest(`files/${encodeURIComponent(fileId)}?fields=id`, {
    method: "PATCH",
    body: JSON.stringify({ copyRequiresWriterPermission: true }),
  });
}

async function deleteFileQuietly(fileId) {
  if (!fileId) return;
  try {
    await driveRequest(`files/${encodeURIComponent(fileId)}?fields=id`, { method: "DELETE" });
  } catch {
    // Best-effort cleanup of an upload that failed post-processing.
  }
}

export async function uploadPdf({
  file,
  subject,
  type = "other",
  folderSegments = [],
  expectedUploaderEmail = "",
  cacheFoldersInSettings = true,
  rootFolderName = "College Notes",
  onProgress,
  signal,
  settings = null,
}) {
  const validationError = validatePdfFile(file);
  if (validationError) throw new DriveApiError(validationError, { code: "drive/invalid-file" });
  if (!subject?.id) throw new DriveApiError("Choose a subject before uploading.", { code: "drive/missing-subject" });

  await ensureSilentToken();
  const account = await getDriveAccount({ interactive: false });
  const expected = normalizeEmail(expectedUploaderEmail);
  if (expected && normalizeEmail(account.emailAddress) !== expected) {
    throw new UploaderMismatchError(account.emailAddress, expectedUploaderEmail);
  }

  let folderInfo;
  let finalData;
  const runUpload = async (forceFolders = false) => {
    folderInfo = await ensureFolderPath(folderSegments, {
      settings: forceFolders ? undefined : (settings || undefined),
      uploaderEmail: account.emailAddress,
      cacheFoldersInSettings,
      rootFolderName,
      force: forceFolders,
    });
    const sessionUrl = await initiateResumableSession({
      file,
      folderId: folderInfo.folderId,
      subject,
      type,
      uploaderEmail: account.emailAddress,
    });
    return uploadWithResume({ sessionUrl, file, onProgress, signal });
  };

  try {
    finalData = await runUpload(false);
  } catch (error) {
    if (error instanceof DriveApiError && (error.status === 404 || error.status === 403)) {
      finalData = await runUpload(true);
    } else {
      throw error;
    }
  }

  if (!finalData?.id) throw new DriveApiError("Drive finished the upload without returning a file ID.");

  try {
    await setPublicReadable(finalData.id);
    await disableDownloadPrintCopy(finalData.id);
  } catch (error) {
    await deleteFileQuietly(finalData.id);
    throw error;
  }

  return {
    id: finalData.id,
    name: finalData.name || safeDriveFileName(subject.code, type),
    size: Number(finalData.size || file.size),
    sizeLabel: formatBytes(Number(finalData.size || file.size)),
    mimeType: finalData.mimeType || "application/pdf",
    uploadedBy: account.emailAddress,
    folderId: folderInfo.folderId,
  };
}

export async function deleteDriveFile(fileId) {
  if (!fileId) return;
  await ensureSilentToken();
  try {
    await driveRequest(`files/${encodeURIComponent(fileId)}?fields=id`, { method: "DELETE" });
  } catch (error) {
    if (error?.status === 404) return;
    throw error;
  }
}

export async function setUploaderAccount(email) {
  await saveSettings({ driveUploaderEmail: normalizeEmail(email) });
}

export async function getDriveSetupStatus() {
  return {
    configured: isDriveUploadConfigured(),
    connected: tokenIsFresh(),
    account: cachedAccount,
    maxMB: getDriveUploadMaxMB(),
    scope: DRIVE_SCOPE,
  };
}

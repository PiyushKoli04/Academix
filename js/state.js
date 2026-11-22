const KEYS = {
  selection: "academix:selection",
  lastView: "academix:last-view",
  installDismissed: "academix:install-dismissed",
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing or when the quota is full.
  }
}

function readString(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeString(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-critical preference persistence.
  }
}

export const state = {
  user: null,
  profile: null,
  settings: null,
  years: [],
  branches: [],
  contributors: [],
  selection: readJSON(KEYS.selection, {}),
  lastView: readJSON(KEYS.lastView, null),
  deferredInstallPrompt: null,
  installPromptShown: false,
  authResolved: false,
  blocked: false,
  navigationToken: 0,
};

export function applyTheme() {
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "light";
  return "light";
}

export function initTheme() {
  return applyTheme();
}

export function getTheme() {
  return "light";
}

export function setSelection(patch) {
  state.selection = { ...state.selection, ...patch };
  writeJSON(KEYS.selection, state.selection);
  return state.selection;
}

export function defaultSelection(profile = state.profile) {
  const fallbackYear = state.years[0];
  const yearId = profile?.yearId || fallbackYear?.id || "";
  const year = state.years.find((item) => item.id === yearId) || fallbackYear;
  const semesters = Array.isArray(year?.semesters) && year.semesters.length
    ? [...year.semesters].sort((a, b) => a - b)
    : [1];
  const branchId = profile?.branchId || "all";
  return { yearId: year?.id || "", semester: semesters[0], branchId };
}

export function getEffectiveSelection(profile = state.profile) {
  const base = defaultSelection(profile);
  const yearId = state.selection.yearId || base.yearId;
  const year = state.years.find((item) => item.id === yearId) || state.years[0];
  const allowedSemesters = Array.isArray(year?.semesters) ? year.semesters : [];
  const requestedSemester = Number(state.selection.semester || base.semester);
  const semester = allowedSemesters.includes(requestedSemester)
    ? requestedSemester
    : allowedSemesters[0] || base.semester;
  const branchId = state.selection.branchId || base.branchId;
  return { yearId: year?.id || base.yearId, semester, branchId };
}

export function ensureValidSelection() {
  const selection = getEffectiveSelection();
  state.selection = { ...state.selection, ...selection };
  writeJSON(KEYS.selection, state.selection);
  return selection;
}

export function setLastView(view) {
  state.lastView = view;
  writeJSON(KEYS.lastView, view);
}

export function clearLastView() {
  state.lastView = null;
  try {
    localStorage.removeItem(KEYS.lastView);
  } catch {
    // Ignore storage failures.
  }
}

export function clearUserState() {
  state.user = null;
  state.profile = null;
  state.blocked = false;
}

export function isInstallDismissed() {
  return readString(KEYS.installDismissed, "") === "1";
}

export function dismissInstallPrompt() {
  writeString(KEYS.installDismissed, "1");
}

export function yearName(year) {
  return year?.name || "Year";
}

export function branchName(branchId) {
  if (!branchId || branchId === "all") return "All branches";
  const branch = state.branches.find((item) => item.id === branchId);
  return branch?.name || "Branch";
}

export function yearLabel(year) {
  if (!year) return "Year";
  const match = String(year.name || "").match(/^(\w+)\s+Year$/i);
  return match ? `${match[1]} Year` : year.name || "Year";
}

export function semesterLabel(semester) {
  return `Sem ${semester}`;
}

export function selectionLabel(selection = getEffectiveSelection()) {
  return `${yearLabel(state.years.find((item) => item.id === selection.yearId))} · Sem ${selection.semester}`;
}

export function isAdmin(profile = state.profile) {
  return profile?.role === "admin";
}

export function currentSelectionKey() {
  const selection = getEffectiveSelection();
  return `${selection.yearId}|${selection.semester}|${selection.branchId}`;
}
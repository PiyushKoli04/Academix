const ICONS = {
  home: '<path d="m3 10.8 9-7.3 9 7.3V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22v-9h6v9"/>',
  library: '<path d="M16 6h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2"/><path d="M8 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M4 4v18"/><path d="M18 8v14"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  "folder-tree": '<path d="M13 4h3a2 2 0 0 1 2 2v2"/><path d="M2 6h6a2 2 0 0 1 2 2v2"/><path d="M8 12h6a2 2 0 0 1 2 2v4"/><rect x="2" y="14" width="6" height="6" rx="1.5"/><rect x="13" y="2" width="6" height="6" rx="1.5"/><rect x="13" y="18" width="6" height="4" rx="1.5"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sliders: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  bell: '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>',
  "arrow-left": '<path d="m15 18-6-6 6-6"/>',
  "arrow-right": '<path d="m9 18 6-6-6-6"/>',
  "arrow-up": '<path d="m18 15-6-6-6 6"/>',
  "arrow-down": '<path d="m6 9 6 6 6-6"/>',
  "arrow-up-right": '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-up": '<path d="m18 15-6-6-6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  "check-circle": '<path d="M21.8 10A10 10 0 1 1 17 3.3"/><path d="m9 11 3 3L22 4"/>',
  "check-check": '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  "book-open": '<path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H9a3 3 0 0 1 3 3v16a3 3 0 0 0-3-3H4.5A2.5 2.5 0 0 1 2 15.5Z"/><path d="M22 4.5A2.5 2.5 0 0 0 19.5 2H15a3 3 0 0 0-3 3v16a3 3 0 0 1 3-3h4.5a2.5 2.5 0 0 0 2.5-2.5Z"/>',
  "graduation-cap": '<path d="M21.4 10.9 12 6 2.6 10.9a1 1 0 0 0 0 1.8L12 18l9.4-5.3a1 1 0 0 0 0-1.8Z"/><path d="M6 12.5V17c0 1 2.7 3 6 3s6-2 6-3v-4.5"/><path d="M22 10v6"/>',
  sparkles: '<path d="m12 3-1.4 4.1L7 9l3.6 1.9L12 15l1.4-4.1L17 9l-3.6-1.9Z"/><path d="M5 14l-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8Z"/><path d="M19 3l-.5 1.5L17 5l1.5.5L19 7l.5-1.5L21 5l-1.5-.5Z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-8.8 5.7a2 2 0 0 1-2.4 0L2 7"/>',
  lock: '<rect x="3" y="10" width="18" height="11" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  "eye-off": '<path d="m3 3 18 18"/><path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6"/><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-3.2 4.2"/><path d="M6.6 6.6C3.5 8.7 2 12 2 12s3.5 8 10 8a10.8 10.8 0 0 0 4.4-.9"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.6 6.8-4.2"/><path d="m8.6 13.4 6.8 4.2"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/>',
  "alert-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  "alert-triangle": '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  refresh: '<path d="M20 7h-5V2"/><path d="M20 7a9 9 0 1 0 1 5"/>',
  flag: '<path d="M4 22V4"/><path d="M4 4h13l-2 5 2 5H4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  settings: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.2a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.2a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.2a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.2a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V7"/><path d="M17 16v-8"/>',
  "cursor-click": '<path d="m9 9 5 12 1.8-5.2L21 14Z"/><path d="M7.2 2.2 8 5.1"/><path d="m2.2 7.2 2.9.8"/><path d="M14 4.1 12 6"/><path d="M6 12 4.1 14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  "file-plus": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  "list-tree": '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
  "user-check": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  "user-x": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  "wifi-off": '<path d="m2 2 20 20"/><path d="M8.5 8.5A10.8 10.8 0 0 1 21 9.7"/><path d="M5 12.6a10.8 10.8 0 0 1 1.5-.9"/><path d="M8.5 16a5.6 5.6 0 0 1 5.4.3"/><path d="M12 20h.01"/><path d="M2.5 8.7A15.7 15.7 0 0 1 7 6.5"/><path d="M18.5 6.5a15.7 15.7 0 0 1 3 2.2"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 18h.01"/>',
  play: '<path d="M6 3.8v16.4a1 1 0 0 0 1.5.9l13-8.2a1 1 0 0 0 0-1.8l-13-8.2A1 1 0 0 0 6 3.8Z"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  star: '<path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
  "file-warning": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 10v4"/><path d="M12 18h.01"/>',
  "bar-chart": '<path d="M3 3v18h18"/><path d="M7 16v-4"/><path d="M12 16V8"/><path d="M17 16v-6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  "book-marked": '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20l-5-3-5 3V2Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
  "message-circle": '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9.9 9.9 0 0 1-4-.8L3 21l1.8-5.5a8.5 8.5 0 1 1 16.2-4Z"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="3"/>',
  "map-pin": '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  "calendar-check": '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  "refresh-cw": '<path d="M21 12a9 9 0 0 0-15.5-6.3L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.3L21 16"/><path d="M21 21v-5h-5"/>',
  "external-link": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  minus: '<path d="M5 12h14"/>',
  "zoom-in": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  "zoom-out": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
};

export const DOC_TYPES = [
  { value: "main", label: "Main Notes" },
  { value: "pyq", label: "PYQ" },
  { value: "formula", label: "Formula Sheet" },
  { value: "syllabus", label: "Syllabus" },
  { value: "lab", label: "Lab Manual" },
  { value: "assignment", label: "Assignment" },
  { value: "other", label: "Other" },
];

export const DOC_TYPE_META = {
  main: { label: "Main Notes", icon: "book-open", short: "Main PDF" },
  pyq: { label: "Previous Year Questions", short: "PYQ", icon: "file-text" },
  formula: { label: "Formula Sheet", short: "Formula Sheet", icon: "sparkles" },
  syllabus: { label: "Syllabus", short: "Syllabus", icon: "list-tree" },
  lab: { label: "Lab Manual", short: "Lab Manual", icon: "database" },
  assignment: { label: "Assignment", short: "Assignment", icon: "edit" },
  other: { label: "Other Document", short: "Other", icon: "file" },
};

export const AD_PLACEMENTS = [
  { value: "home_banner", label: "Home banner" },
  { value: "between_lists", label: "Between subject lists" },
  { value: "subject_footer", label: "Subject detail footer" },
  { value: "viewer_bottom", label: "PDF viewer bottom" },
];

export const SUBJECT_COLORS = [
  "#DDEFD9",
  "#E3EEFF",
  "#FCE8CC",
  "#FADADD",
  "#E9E3FF",
  "#F0F5D9",
  "#F6D9CC",
  "#D5E8E5",
];

export function icon(name, className = "") {
  const markup = ICONS[name] || ICONS.file;
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${markup}</svg>`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

export function isHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function safeHttpUrl(value) {
  return isHttpUrl(value) ? value.trim() : "";
}

export function safeImageUrl(value) {
  return isHttpUrl(value) ? value.trim() : "";
}

export function safeColor(value, fallback = "#F0F5D9") {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function formatDate(value, options = {}) {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en", {
    month: options.month || "short",
    day: options.day || "numeric",
    year: options.year || "numeric",
    ...options,
  }).format(date);
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(date, { year: undefined });
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

export function initials(name = "") {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "A";
}

export function avatarHTML(person = {}, options = {}) {
  const size = options.size || "";
  const extra = options.className || "";
  const name = person.name || person.displayName || person.email || "Academix";
  const initialsStr = escapeHtml(initials(name));
  const photo = safeImageUrl(person.photoURL || person.avatarURL || "");
  const classes = ["avatar", size ? `avatar--${size}` : "", extra].filter(Boolean).join(" ");
  const fallback = `<span class="avatar__fallback">${initialsStr}</span>`;
  if (!photo) return `<span class="${classes}" aria-hidden="true">${fallback}</span>`;
  return `<span class="${classes}" aria-hidden="true">
    ${fallback}
    <img src="${escapeAttr(photo)}" alt="" loading="lazy" data-avatar-img />
  </span>`;
}

export function avatarStackHTML(people = [], max = 3) {
  const visible = people.slice(0, max);
  const remaining = Math.max(0, people.length - max);
  if (!people.length) return "";
  return `<span class="avatar-stack" aria-label="${escapeAttr(`${people.length} contributor${people.length === 1 ? "" : "s"}`)}">
    ${visible.map((person) => avatarHTML(person, { size: "sm" })).join("")}
    ${remaining ? `<span class="avatar-stack__more">+${remaining}</span>` : ""}
  </span>`;
}

export function typeChipHTML(type = "other", options = {}) {
  const meta = DOC_TYPE_META[type] || DOC_TYPE_META.other;
  const className = options.main ? "type-chip type-chip--main" : `type-chip type-chip--${type}`;
  const iconName = options.icon === false ? "" : icon(meta.icon);
  return `<span class="${className}">${iconName}${escapeHtml(options.label || meta.short)}</span>`;
}

export function statusChipHTML(label, variant = "new") {
  return `<span class="status-chip status-chip--${variant}">${escapeHtml(label)}</span>`;
}

export function debounce(fn, wait = 280) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function throttle(fn, wait = 800) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last < wait) return;
    last = now;
    fn(...args);
  };
}

export function setButtonLoading(button, loading, loadingLabel = "Working…") {
  if (!button) return;
  if (loading) {
    button.dataset.originalLabel = button.innerHTML;
    button.classList.add("is-loading");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.insertAdjacentHTML("beforeend", `<span class="btn__loader" aria-hidden="true"></span><span class="sr-only">${escapeHtml(loadingLabel)}</span>`);
  } else {
    button.classList.remove("is-loading");
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.querySelectorAll(".btn__loader, .sr-only").forEach((node) => node.remove());
    if (button.dataset.originalLabel) {
      button.innerHTML = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }
}

export function toast(message, options = {}) {
  const root = document.getElementById("toast-root");
  if (!root) return { close() {} };
  const type = options.type || "success";
  const iconName = options.icon || (type === "error" ? "alert-circle" : type === "info" ? "info" : "check");
  const node = document.createElement("div");
  node.className = `toast toast--${type}`;
  node.setAttribute("role", type === "error" ? "alert" : "status");
  node.innerHTML = `
    <span class="toast__icon">${icon(iconName)}</span>
    <span class="toast__message">${escapeHtml(message)}</span>
    ${options.actionLabel ? `<button class="toast__action" type="button">${escapeHtml(options.actionLabel)}</button>` : ""}
    <button class="toast__close" type="button" aria-label="Dismiss notification">${icon("x")}</button>
  `;

  const remove = () => {
    if (!node.isConnected) return;
    node.classList.add("is-leaving");
    window.setTimeout(() => node.remove(), 200);
  };

  node.querySelector(".toast__close")?.addEventListener("click", remove);
  node.querySelector(".toast__action")?.addEventListener("click", async () => {
    remove();
    try {
      await options.onAction?.();
    } catch (error) {
      toast(error?.message || "That action could not be completed.", { type: "error" });
    }
  });

  root.append(node);
  while (root.children.length > 3) root.firstElementChild?.remove();
  const duration = options.duration ?? (type === "error" ? 5600 : 4200);
  if (duration > 0) window.setTimeout(remove, duration);
  return { close: remove, node };
}

export function copyText(text, successMessage = "Copied to clipboard.") {
  const value = String(text || "");
  if (!value) return Promise.resolve(false);
  const fallback = () => {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };

  return (navigator.clipboard?.writeText(value).then(() => true).catch(() => fallback()) || Promise.resolve(fallback()))
    .then((copied) => {
      toast(copied ? successMessage : "Copy is unavailable in this browser.", { type: copied ? "success" : "error" });
      return copied;
    });
}

let overlayCount = 0;

function lockBackground() {
  overlayCount += 1;
  document.body.classList.add("no-scroll");
  // Only inert the main content area, NOT the sidebar.
  // Setting inert on #app would kill all sidebar click events
  // because the browser suppresses interaction on inert subtrees.
  const main = document.querySelector(".app-main");
  if (main) main.inert = true;
  const bnav = document.querySelector(".bottom-nav");
  if (bnav) bnav.inert = true;
}

function unlockBackground() {
  overlayCount = Math.max(0, overlayCount - 1);
  if (overlayCount === 0) {
    document.body.classList.remove("no-scroll");
    const main = document.querySelector(".app-main");
    if (main) main.inert = false;
    const bnav = document.querySelector(".bottom-nav");
    if (bnav) bnav.inert = false;
  }
}

function trapFocus(container) {
  const handler = (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((node) => node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  container.addEventListener("keydown", handler);
  return () => container.removeEventListener("keydown", handler);
}

export function closeAllOverlays() {
  const overlayRoot = document.getElementById("overlay-root");
  if (overlayRoot) overlayRoot.replaceChildren();
  overlayCount = 0;
  document.body.classList.remove("no-scroll");
  // Clear inert from all possible targets (legacy #app and new scoped targets)
  const app = document.getElementById("app");
  if (app) app.inert = false;
  const main = document.querySelector(".app-main");
  if (main) main.inert = false;
  const bnav = document.querySelector(".bottom-nav");
  if (bnav) bnav.inert = false;
}

export function openSheet(options = {}) {
  const overlayRoot = document.getElementById("overlay-root");
  if (!overlayRoot) return null;

  const previousFocus = document.activeElement;
  const id = `sheet-title-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `
    <section class="sheet ${options.size === "wide" ? "sheet--wide" : options.size === "auto" ? "sheet--auto" : ""}" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1">
      <div class="sheet__grabber" aria-hidden="true"></div>
      <header class="sheet__head">
        <div class="sheet__heading">
          <h2 class="sheet__title" id="${id}">${escapeHtml(options.title || "Academix")}</h2>
          ${options.subtitle ? `<p class="sheet__subtitle">${escapeHtml(options.subtitle)}</p>` : ""}
        </div>
        <div class="sheet__actions">
          ${options.headerActions || ""}
          <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-sheet-close aria-label="Close">${icon("x")}</button>
        </div>
      </header>
      <div class="sheet__body">${options.content || ""}</div>
      ${options.footer ? `<div class="sheet__footer">${options.footer}</div>` : ""}
    </section>
  `;

  overlayRoot.append(backdrop);
  lockBackground();
  const sheet = backdrop.querySelector(".sheet");
  let closed = false;
  const removeTrap = trapFocus(sheet);

  const close = (result) => {
    if (closed) return;
    closed = true;
    backdrop.classList.add("is-closing");
    document.removeEventListener("keydown", onKeydown);
    removeTrap();
    window.setTimeout(() => {
      backdrop.remove();
      unlockBackground();
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus({ preventScroll: true });
      }
      options.onClose?.(result);
    }, 220);
  };

  const onKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  document.addEventListener("keydown", onKeydown);
  backdrop.querySelectorAll("[data-sheet-close]").forEach((button) => {
    button.addEventListener("click", () => close());
  });
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop && options.closeOnBackdrop !== false) close();
  });

  sheet.focus({ preventScroll: true });
  options.onMount?.(sheet, close);
  return { element: sheet, close };
}

export function confirmDialog(options = {}) {
  return new Promise((resolve) => {
    const overlayRoot = document.getElementById("overlay-root");
    if (!overlayRoot) {
      resolve(false);
      return;
    }
    const previousFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    backdrop.innerHTML = `
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-text">
        <div class="dialog__icon ${options.danger ? "dialog__icon--danger" : ""}">${icon(options.danger ? "alert-triangle" : "info")}</div>
        <h2 class="dialog__title" id="dialog-title">${escapeHtml(options.title || "Are you sure?")}</h2>
        <p class="dialog__text" id="dialog-text">${escapeHtml(options.message || "This action cannot be undone.")}</p>
        <div class="dialog__actions">
          <button class="btn btn--white" type="button" data-cancel>${escapeHtml(options.cancelText || "Cancel")}</button>
          <button class="btn ${options.danger ? "btn--danger" : "btn--primary"}" type="button" data-confirm>${escapeHtml(options.confirmText || "Confirm")}</button>
        </div>
      </div>
    `;
    overlayRoot.append(backdrop);
    lockBackground();
    const dialog = backdrop.querySelector(".dialog");
    const removeTrap = trapFocus(dialog);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      removeTrap();
      backdrop.remove();
      unlockBackground();
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(false);
    };
    document.addEventListener("keydown", onKeydown);
    backdrop.querySelector("[data-cancel]")?.addEventListener("click", () => finish(false));
    backdrop.querySelector("[data-confirm]")?.addEventListener("click", () => finish(true));
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) finish(false);
    });
    window.setTimeout(() => backdrop.querySelector("[data-confirm]")?.focus(), 30);
  });
}

export function openConfirmSheet(options = {}) {
  return new Promise((resolve) => {
    let sheetHandle = null;
    sheetHandle = openSheet({
      title: options.title || "Confirm",
      subtitle: options.subtitle || "",
      size: "auto",
      content: `<p class="text-secondary" style="font-size:12px;line-height:1.65">${escapeHtml(options.message || "")}</p>`,
      footer: `<button class="btn btn--white" type="button" data-cancel>${escapeHtml(options.cancelText || "Cancel")}</button><button class="btn ${options.danger ? "btn--danger" : "btn--primary"}" type="button" data-confirm>${escapeHtml(options.confirmText || "Confirm")}</button>`,
      onMount(sheet, close) {
        sheet.querySelector("[data-cancel]")?.addEventListener("click", () => {
          close();
          resolve(false);
        });
        sheet.querySelector("[data-confirm]")?.addEventListener("click", () => {
          close();
          resolve(true);
        });
      },
      onClose() {
        if (!sheetHandle) resolve(false);
      },
    });
  });
}

export function emptyStateHTML(options = {}) {
  return `<div class="empty-state ${options.small ? "empty-state--sm" : ""}">
    <div class="empty-state__art">${icon(options.icon || "book-open")}</div>
    <h3 class="empty-state__title">${escapeHtml(options.title || "Nothing here yet")}</h3>
    <p class="empty-state__text">${escapeHtml(options.text || "")}</p>
    ${options.actions ? `<div class="empty-state__actions">${options.actions}</div>` : ""}
  </div>`;
}

export function errorStateHTML(options = {}) {
  return `<div class="error-state">
    <div class="error-state__icon">${icon(options.icon || "alert-circle")}</div>
    <h3 class="error-state__title">${escapeHtml(options.title || "Something went wrong")}</h3>
    <p class="error-state__text">${escapeHtml(options.text || "Please try again in a moment.")}</p>
    ${options.actions ? `<div class="error-state__actions">${options.actions}</div>` : ""}
  </div>`;
}

export function skeletonPageHTML(kind = "home") {
  if (kind === "library") {
    return `<div class="skeleton-page" aria-busy="true" aria-label="Loading library">
      <div class="skeleton-page__head"><div><div class="skeleton skeleton-text" style="width:110px;height:12px"></div><div class="skeleton" style="width:210px;height:48px;margin-top:12px"></div></div><div class="skeleton skeleton-circle" style="width:44px;height:44px"></div></div>
      <div style="display:flex;gap:8px">${Array.from({ length: 4 }, () => '<div class="skeleton" style="width:74px;height:59px;border-radius:19px"></div>').join("")}</div>
      <div class="skeleton" style="width:100%;height:40px;border-radius:99px"></div>
      <div class="skeleton" style="width:100%;height:38px;border-radius:99px"></div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">${Array.from({ length: 4 }, () => '<div class="skeleton" style="height:94px;border-radius:24px"></div>').join("")}</div>
    </div>`;
  }
  if (kind === "subject") {
    return `<div class="skeleton-page" aria-busy="true" aria-label="Loading subject">
      <div class="skeleton-page__head"><div class="skeleton skeleton-circle" style="width:40px;height:40px"></div><div class="skeleton skeleton-text" style="width:90px"></div><div style="width:40px"></div></div>
      <div style="display:flex;gap:13px;align-items:center"><div class="skeleton" style="width:58px;height:58px;border-radius:20px"></div><div style="flex:1"><div class="skeleton skeleton-text" style="width:60%;height:20px"></div><div class="skeleton skeleton-text" style="width:35%;margin-top:9px"></div></div></div>
      <div class="skeleton" style="height:156px;border-radius:30px"></div>
      <div class="skeleton" style="height:58px;border-radius:99px"></div>
      <div class="skeleton" style="height:230px;border-radius:30px"></div>
    </div>`;
  }
  return `<div class="skeleton-page" aria-busy="true" aria-label="Loading">
    <div class="skeleton-page__head"><div class="skeleton skeleton-circle" style="width:42px;height:42px"></div><div class="skeleton" style="width:88px;height:38px;border-radius:99px"></div></div>
    <div class="skeleton" style="width:72%;height:52px;border-radius:16px"></div>
    <div class="skeleton" style="width:88%;height:52px;border-radius:16px;margin-top:-10px"></div>
    <div class="skeleton" style="height:210px;border-radius:30px"></div>
    <div class="skeleton" style="height:56px;border-radius:99px"></div>
    <div style="display:flex;gap:12px">${Array.from({ length: 3 }, () => '<div class="skeleton" style="height:175px;border-radius:24px;flex:1"></div>').join("")}</div>
  </div>`;
}

export function adCardHTML(ad, variant = "card") {
  if (!ad) return "";
  const image = safeImageUrl(ad.imageURL);
  const target = safeHttpUrl(ad.targetURL);
  if (!target) return "";
  const clickAttrs = `data-ad-click="${escapeAttr(ad.id)}" data-ad-target="${escapeAttr(target)}" href="${escapeAttr(target)}" target="_blank" rel="noopener noreferrer sponsored"`;
  if (variant === "strip") {
    return `<div class="ad-slot js-ad-slot" data-ad-id="${escapeAttr(ad.id)}">
      <div class="ad-strip">
        <span class="ad-strip__label">Sponsored</span>
        <a class="ad-strip__title" ${clickAttrs}>${escapeHtml(ad.title || "Sponsored link")}</a>
        <button class="ad-strip__close" type="button" aria-label="Dismiss advertisement" data-ad-dismiss>${icon("x")}</button>
      </div>
    </div>`;
  }
  return `<div class="ad-slot js-ad-slot" data-ad-id="${escapeAttr(ad.id)}">
    <a class="ad-card ${variant === "wide" ? "ad-card--wide" : ""}" ${clickAttrs}>
      <span class="ad-card__media">
        ${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy" />` : `<span class="ad-card__media-fallback">${icon("image")}</span>`}
      </span>
      <span class="ad-card__body">
        <span class="ad-card__label">Sponsored</span>
        <span class="ad-card__title">${escapeHtml(ad.title || "")}</span>
        ${ad.description ? `<span class="ad-card__desc">${escapeHtml(ad.description)}</span>` : ""}
        ${ad.ctaText ? `<span class="ad-card__cta">${escapeHtml(ad.ctaText)} ${icon("arrow-up-right")}</span>` : ""}
      </span>
    </a>
  </div>`;
}

export function adStripHTML(ad) {
  return adCardHTML(ad, "strip");
}

export function setPageMeta(title, description, options = {}) {
  const fullTitle = title ? `${title} · Academix — Engineering Notes & Study Material` : "Academix — Free Engineering Notes, Study Material & College Notes PDF";
  document.title = fullTitle;
  if (description) {
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", description);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", description);
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute("content", description);
  }
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", fullTitle);
  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute("content", fullTitle);
  if (options.canonical) {
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", options.canonical);
  }
}

export function subjectIconHTML(iconName, className = "") {
  return `<span class="${className}">${icon(iconName || "book-open")}</span>`;
}

export function friendlyAuthError(error) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-email": "That email address doesn’t look right.",
    "auth/user-not-found": "No account was found with that email.",
    "auth/wrong-password": "The password is incorrect. Try again or reset it.",
    "auth/invalid-credential": "Email or password is incorrect. Try again or reset it.",
    "auth/invalid-login-credentials": "Email or password is incorrect. Try again or reset it.",
    "auth/email-already-in-use": "An account already exists with this email. Try logging in.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups and try again.",
    "auth/network-request-failed": "You appear to be offline. Check your connection and try again.",
    "auth/unauthorized-domain": "This domain is not authorized for sign-in. Add it in Firebase Authentication settings.",
    "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase Authentication.",
  };
  return map[code] || error?.message || "Something went wrong. Please try again.";
}

export function friendlyFirestoreError(error) {
  const code = error?.code || "";
  if (code === "permission-denied") return "You don’t have permission to do that.";
  if (code === "unavailable" || !navigator.onLine) return "You’re offline. Changes will sync when you reconnect.";
  if (code === "not-found") return "That item no longer exists.";
  if (code === "failed-precondition") return "A required Firestore index is still building. Try again shortly.";
  return error?.message || "The request could not be completed.";
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

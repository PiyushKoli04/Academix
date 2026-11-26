/**
 * Academix SEO Static Page Generator
 *
 * Fetches live academic catalog data (subjects, years, branches, documents,
 * contributors, settings) from Cloud Firestore and generates static HTML pages
 * styled identically to the Academix web application.
 *
 * Supported data sources (checked in order):
 *   1. --input <file> or ./seo/catalog.json (Admin-exported Firestore snapshot)
 *   2. FIREBASE_SERVICE_ACCOUNT env var (Firebase Admin SDK JSON)
 *   3. GOOGLE_APPLICATION_CREDENTIALS env var (Service account file path)
 *   4. FIREBASE_SEO_EMAIL + FIREBASE_SEO_PASSWORD env vars (Firebase Auth + Firestore REST API)
 *   5. --demo (ONLY when explicitly passed alongside --out-dir for isolated tests)
 *
 * Generated artifacts:
 *   - /notes/{subject-slug}/index.html   (prerendered subject study pages)
 *   - /notes/branch/{branch-slug}/index.html (branch-wise subject directory pages)
 *   - /notes/index.html                  (complete syllabus catalog landing page)
 *   - /sitemap.xml                       (XML Sitemap 0.9 with accurate lastmod)
 *   - /robots.txt                        (crawler directives + sitemap pointer)
 */

'use strict';

const fs = require('fs');
const path = require('path');

let admin = null;
try {
  admin = require('firebase-admin');
} catch {
  admin = null;
}

// ---------------------------------------------------------------------------
// Configuration & CLI Flags
// ---------------------------------------------------------------------------

const DOMAIN = 'https://academix.syntaxsyndicate.co.in';
const OG_IMAGE = `${DOMAIN}/icons/og.png?v=2`;
const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    input: '',
    outDir: '',
    demo: false,
    emptyOk: process.env.ALLOW_EMPTY === 'true',
  };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--input' && argv[i + 1]) {
      args.input = path.resolve(argv[++i]);
    } else if (flag === '--out-dir' && argv[i + 1]) {
      args.outDir = path.resolve(argv[++i]);
    } else if (flag === '--demo') {
      args.demo = true;
    } else if (flag === '--empty-ok') {
      args.emptyOk = true;
    }
  }
  return args;
}

function readFirebaseWebConfig() {
  const configPath = path.join(ROOT_DIR, 'firebase.config.js');
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, 'utf8');
  const apiKeyMatch = raw.match(/apiKey\s*:\s*["']([^"']+)["']/);
  const projectIdMatch = raw.match(/projectId\s*:\s*["']([^"']+)["']/);
  return {
    apiKey: apiKeyMatch ? apiKeyMatch[1] : '',
    projectId: projectIdMatch ? projectIdMatch[1] : 'academix-a4755',
  };
}

// ---------------------------------------------------------------------------
// Live Data Loaders
// ---------------------------------------------------------------------------

async function fetchViaAdminSdk(serviceAccountOrDefault) {
  if (!admin) {
    throw new Error(
      'firebase-admin package is not installed. Run "npm install" inside seo/ first.'
    );
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: serviceAccountOrDefault });
  }
  const db = admin.firestore();

  const fetchCollection = async (name) => {
    const snap = await db.collection(name).get();
    const items = [];
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
    return items;
  };

  const [subjects, years, branches, documents, contributors, settingsSnap] =
    await Promise.all([
      fetchCollection('subjects'),
      fetchCollection('years'),
      fetchCollection('branches'),
      fetchCollection('documents'),
      fetchCollection('contributors'),
      db.collection('settings').get(),
    ]);

  const settings = {};
  settingsSnap.forEach((doc) =>
    Object.assign(settings, { id: doc.id, ...doc.data() })
  );

  return {
    source: 'Firebase Admin SDK (Live Firestore)',
    subjects,
    years,
    branches,
    documents,
    contributors,
    settings,
  };
}

function decodeFirestoreValue(val) {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(decodeFirestoreValue);
  }
  if ('mapValue' in val) {
    const obj = {};
    const fields = val.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      obj[k] = decodeFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

function decodeFirestoreDoc(docObj) {
  const nameParts = String(docObj.name || '').split('/');
  const id = nameParts[nameParts.length - 1] || '';
  const data = {};
  for (const [k, v] of Object.entries(docObj.fields || {})) {
    data[k] = decodeFirestoreValue(v);
  }
  return { id, ...data };
}

async function fetchCollectionRest(projectId, idToken, collectionName) {
  const items = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({ pageSize: '300' });
    if (pageToken) qs.set('pageToken', pageToken);
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/(default)/documents/${encodeURIComponent(collectionName)}?${qs}`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Firestore REST fetch (${collectionName}) failed (${resp.status}): ${text}`);
    }
    const json = await resp.json();
    if (Array.isArray(json.documents)) {
      for (const d of json.documents) {
        items.push(decodeFirestoreDoc(d));
      }
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);

  return items;
}

async function fetchViaFirebaseUserAuth(email, password) {
  const { apiKey, projectId } = readFirebaseWebConfig();
  if (!apiKey || !projectId) {
    throw new Error('Could not read Firebase Web apiKey/projectId from firebase.config.js');
  }

  const authResp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(
      apiKey
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  if (!authResp.ok) {
    const errText = await authResp.text();
    throw new Error(`Firebase Auth sign-in failed (${authResp.status}): ${errText}`);
  }

  const authData = await authResp.json();
  const idToken = authData.idToken;
  if (!idToken) throw new Error('Firebase Auth response missing idToken');

  const [subjects, years, branches, documents, contributors, settingsDocs] =
    await Promise.all([
      fetchCollectionRest(projectId, idToken, 'subjects'),
      fetchCollectionRest(projectId, idToken, 'years'),
      fetchCollectionRest(projectId, idToken, 'branches'),
      fetchCollectionRest(projectId, idToken, 'documents'),
      fetchCollectionRest(projectId, idToken, 'contributors').catch(() => []),
      fetchCollectionRest(projectId, idToken, 'settings').catch(() => []),
    ]);

  const settings = Object.assign({}, ...settingsDocs);
  return {
    source: `Firebase Auth REST API (${projectId})`,
    subjects,
    years,
    branches,
    documents,
    contributors,
    settings,
  };
}

function loadFromCatalogJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  return {
    source: `Catalog Snapshot (${path.relative(ROOT_DIR, filePath)})`,
    subjects: Array.isArray(data.subjects) ? data.subjects : [],
    years: Array.isArray(data.years) ? data.years : [],
    branches: Array.isArray(data.branches) ? data.branches : [],
    documents: Array.isArray(data.documents) ? data.documents : [],
    contributors: Array.isArray(data.contributors) ? data.contributors : [],
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
  };
}

function buildIsolatedDemoFixture() {
  return {
    source: 'Isolated Test Fixture (--demo)',
    years: [
      { id: 'y1', name: 'First Year', order: 0, semesters: [1, 2] },
      { id: 'y2', name: 'Second Year', order: 1, semesters: [3, 4] },
    ],
    branches: [
      { id: 'b-aids', name: 'Artificial Intelligence & Data Science', shortName: 'AI&DS', color: '#DDEFD9', order: 0 },
      { id: 'b-ce', name: 'Computer Engineering', shortName: 'CE', color: '#E3EEFF', order: 1 },
    ],
    subjects: [
      {
        id: 'test-sub-1',
        name: 'Computer Network',
        code: 'CN401',
        yearId: 'y2',
        semester: 4,
        branchIds: ['b-aids', 'b-ce'],
        color: '#E3EEFF',
        description: 'Network models, protocols, IP addressing, TCP/IP stack, and routing algorithms.',
        modules: [{ name: 'OSI & TCP/IP Layers', order: 0 }, { name: 'Routing Protocols', order: 1 }],
        updatedAt: '2026-11-20T00:00:00Z',
      },
    ],
    documents: [
      {
        id: 'test-doc-1',
        title: 'Computer Network — All Modules',
        subjectId: 'test-sub-1',
        type: 'main',
        isMain: true,
        pages: 38,
        sizeLabel: '2.4 MB',
        description: 'Main study notes covering all modules.',
      },
    ],
    contributors: [{ id: 'c1', name: 'Academix Contributor', role: 'Notes Team', uploadsCount: 4 }],
    settings: { appName: 'Academix', version: '1.0.0' },
  };
}

async function resolveCatalogData(args) {
  const defaultCatalogFile = path.join(__dirname, 'catalog.json');

  if (args.demo) {
    if (!args.outDir || path.resolve(args.outDir) === ROOT_DIR) {
      throw new Error(
        '--demo cannot write into the production repository root. Pass an isolated --out-dir.'
      );
    }
    return buildIsolatedDemoFixture();
  }

  if (args.input) {
    if (!fs.existsSync(args.input)) {
      throw new Error(`Input catalog file not found: ${args.input}`);
    }
    return loadFromCatalogJson(args.input);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
      throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT JSON: ${err.message}`);
    }
    if (!admin) {
      throw new Error('firebase-admin package is not installed. Run "cd seo && npm install".');
    }
    return fetchViaAdminSdk(admin.credential.cert(serviceAccount));
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (!admin) {
      throw new Error('firebase-admin package is not installed. Run "cd seo && npm install".');
    }
    return fetchViaAdminSdk(admin.credential.applicationDefault());
  }

  if (process.env.FIREBASE_SEO_EMAIL && process.env.FIREBASE_SEO_PASSWORD) {
    return fetchViaFirebaseUserAuth(
      process.env.FIREBASE_SEO_EMAIL,
      process.env.FIREBASE_SEO_PASSWORD
    );
  }

  if (fs.existsSync(defaultCatalogFile)) {
    return loadFromCatalogJson(defaultCatalogFile);
  }

  if (args.emptyOk) {
    console.log(
      'ℹ  No live Firestore credentials or seo/catalog.json found.\n' +
        '   --empty-ok enabled: Generating clean permanent catalog shell with zero fake subjects.\n'
    );
    return {
      source: 'Empty Safe Catalog (--empty-ok)',
      subjects: [],
      years: [],
      branches: [],
      documents: [],
      contributors: [],
      settings: { appName: 'Academix', version: '1.0.0' },
    };
  }

  throw new Error(
    'No live Firestore data source found.\n' +
      'Provide one of:\n' +
      '  - FIREBASE_SERVICE_ACCOUNT (Firebase Admin SDK JSON)\n' +
      '  - GOOGLE_APPLICATION_CREDENTIALS (Service Account JSON file path)\n' +
      '  - FIREBASE_SEO_EMAIL + FIREBASE_SEO_PASSWORD (Firebase Auth credentials)\n' +
      '  - seo/catalog.json (exported from Academix Admin Dashboard -> Sync SEO)\n' +
      'Hardcoded demo fallback has been removed so search engines never index fake subjects.'
  );
}

// ---------------------------------------------------------------------------
// Helpers (Slugs, Formatting, Escaping, Cleaning)
// ---------------------------------------------------------------------------

function toSlug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, '-and-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function buildSlugMap(items, keyFn = (x) => x.name, fallbackFn = (x) => x.code || x.id) {
  const seen = new Map();
  const result = new Map();

  for (const item of items) {
    let slug = toSlug(keyFn(item)) || toSlug(fallbackFn(item)) || toSlug(item.id);
    if (!slug) slug = 'item';
    if (seen.has(slug)) {
      const suffix = toSlug(fallbackFn(item)) || toSlug(item.id);
      slug = suffix && !slug.endsWith(suffix) ? `${slug}-${suffix}` : `${slug}-${seen.size + 1}`;
    }
    seen.set(slug, item.id);
    result.set(item.id, slug);
  }
  return result;
}

function isEligibleSubject(subject) {
  if (!subject || !String(subject.name || '').trim()) return 'missing name';
  if (subject.published === false || subject.hidden === true || subject.archived === true) {
    return 'unpublished or archived';
  }
  const hasDocuments = Array.isArray(subject._documents) && subject._documents.length > 0;
  const hasModules = Array.isArray(subject.modules) && subject.modules.length > 0;
  const hasDescription = String(subject.description || '').trim().length >= 25;
  if (!hasDocuments && !hasModules && !hasDescription) {
    return 'no documents, modules, or description';
  }
  return null;
}

function toISODate(ts) {
  if (!ts) return new Date().toISOString().split('T')[0];
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString().split('T')[0];
  if (typeof ts._seconds === 'number') return new Date(ts._seconds * 1000).toISOString().split('T')[0];
  if (ts instanceof Date && !Number.isNaN(ts.getTime())) return ts.toISOString().split('T')[0];
  const parsed = new Date(ts);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHexColor(color, fallback = '#F0F5D9') {
  return /^#[0-9a-f]{3,8}$/i.test(String(color || '').trim()) ? String(color).trim() : fallback;
}

const DOC_TYPE_META = {
  main: { label: 'Main notes', short: 'Main PDF', chip: 'type-chip--main' },
  pyq: { label: 'Previous year papers', short: 'PYQ', chip: 'type-chip--pyq' },
  formula: { label: 'Formula sheet', short: 'Formula', chip: 'type-chip--formula' },
  syllabus: { label: 'Syllabus copy', short: 'Syllabus', chip: 'type-chip--syllabus' },
  lab: { label: 'Lab manual', short: 'Lab', chip: 'type-chip--lab' },
  assignment: { label: 'Assignment', short: 'Assignment', chip: 'type-chip--assignment' },
  other: { label: 'Helping document', short: 'Notes', chip: 'type-chip--other' },
};

// ---------------------------------------------------------------------------
// Academix Official Design System CSS (Matched Pixel-for-Pixel to css/*.css)
// ---------------------------------------------------------------------------

function academixCSS(isSubjectPage = false) {
  return `
    :root {
      --font-sans: "Plus Jakarta Sans", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
      --ink: #151515;
      --ink-soft: #1c1c1e;
      --ink-muted: #3e3e43;
      --text-secondary: #6b6b70;
      --text-hint: #a0a0a6;
      --bg: #f4f3f5;
      --surface: #ffffff;
      --surface-soft: #f7f6f8;
      --surface-tint: #eef1fb;
      --line: #ececef;
      --line-strong: #dedee3;
      --lime: #c9db74;
      --lime-bright: #d6e88a;
      --lime-soft: #f0f5d9;
      --gradient-app:
        radial-gradient(120% 65% at 8% 0%, rgba(246, 217, 204, 0.96) 0%, rgba(246, 217, 204, 0) 62%),
        radial-gradient(115% 70% at 72% 4%, rgba(233, 195, 224, 0.92) 0%, rgba(233, 195, 224, 0) 64%),
        radial-gradient(130% 75% at 100% 0%, rgba(213, 185, 240, 0.90) 0%, rgba(213, 185, 240, 0) 68%),
        linear-gradient(180deg, #f4e5e1 0%, #f4f0f5 36%, #f4f3f5 68%, #f4f3f5 100%);
      --radius-md: 20px;
      --radius-lg: 24px;
      --radius-xl: 30px;
      --radius-pill: 999px;
      --shadow-card: 0 8px 30px rgba(0, 0, 0, 0.06);
      --shadow-card-hover: 0 16px 42px rgba(0, 0, 0, 0.09);
      --shadow-nav: 0 18px 48px rgba(23, 18, 31, 0.14);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { min-height: 100%; scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
    body {
      min-height: 100vh;
      font-family: var(--font-sans);
      font-size: 15px;
      line-height: 1.5;
      color: var(--ink);
      background: ${isSubjectPage ? 'var(--bg)' : 'var(--gradient-app)'};
      background-attachment: fixed;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
      padding-bottom: 92px;
    }

    a { color: inherit; text-decoration: none; }
    h1, h2, h3, h4 { letter-spacing: -0.04em; line-height: 1.08; }

    /* Top Frosted Glass Pill Header */
    .seo-topbar-wrap {
      position: sticky;
      top: 12px;
      z-index: 60;
      padding: 0 16px;
      margin-top: 12px;
    }
    .seo-topbar {
      width: min(100%, 1040px);
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 10px 14px;
      border-radius: 26px;
      background: rgba(255, 255, 255, 0.84);
      border: 1px solid rgba(255, 255, 255, 0.72);
      box-shadow: 0 16px 42px rgba(55, 42, 62, 0.09);
      backdrop-filter: blur(22px) saturate(1.2);
      -webkit-backdrop-filter: blur(22px) saturate(1.2);
    }
    .brand-link {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .brand-mark {
      width: 38px;
      height: 38px;
      flex: 0 0 38px;
      display: grid;
      place-items: center;
      border-radius: 13px;
      background: var(--lime);
      overflow: hidden;
      box-shadow: 0 6px 16px rgba(150, 171, 72, 0.25);
    }
    .brand-mark img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .brand-wordmark {
      display: block;
      font-size: 16.5px;
      font-weight: 700;
      letter-spacing: -0.05em;
      line-height: 1.1;
      color: var(--ink);
    }
    .brand-tagline {
      display: block;
      font-size: 10px;
      font-weight: 500;
      color: var(--text-hint);
      line-height: 1.2;
    }
    .top-nav {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .top-nav a {
      padding: 8px 14px;
      border-radius: var(--radius-pill);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-secondary);
      transition: background 140ms ease, color 140ms ease;
      white-space: nowrap;
    }
    .top-nav a:hover {
      background: rgba(21, 21, 21, 0.05);
      color: var(--ink);
    }
    .top-nav a.is-active {
      background: var(--ink-soft);
      color: #fff;
      box-shadow: 0 8px 18px rgba(20, 20, 22, 0.16);
    }

    /* Main Container */
    .page-shell {
      width: min(100%, 1040px);
      margin: 0 auto;
      padding: 24px 18px 40px;
    }

    /* Icons & Buttons matching components.css */
    .icon-btn {
      width: 44px;
      height: 44px;
      flex: 0 0 auto;
      display: inline-grid;
      place-items: center;
      border-radius: 50%;
      color: var(--ink);
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
      transition: transform 120ms ease, background 120ms ease;
    }
    .icon-btn:hover { background: var(--surface-soft); transform: translateY(-1px); }
    .icon-btn--lime {
      background: var(--lime);
      border-color: var(--lime);
      color: var(--ink-soft);
    }
    .icon-btn svg { width: 18px; height: 18px; }

    /* Breadcrumb / Topbar row */
    .detail-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 18px;
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      list-style: none;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-hint);
    }
    .breadcrumb a { color: var(--text-secondary); }
    .breadcrumb a:hover { color: var(--ink); }
    .breadcrumb li::after { content: '/'; margin-left: 6px; color: var(--line-strong); }
    .breadcrumb li:last-child::after { content: ''; }
    .breadcrumb li[aria-current="page"] { color: var(--ink); }

    /* Catalog Mixed Headings (matching .library-heading) */
    .hero-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--lime-deep, #a9bc55);
    }
    .mixed-heading {
      font-size: clamp(36px, 8vw, 52px);
      line-height: 0.98;
      letter-spacing: -0.06em;
      margin-bottom: 12px;
    }
    .mixed-heading .light { display: block; font-weight: 300; }
    .mixed-heading .strong { display: block; font-weight: 600; }
    .hero-sub {
      max-width: 660px;
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--text-secondary);
      margin-bottom: 20px;
    }

    /* Subject Detail Head (matching subject.js) */
    .subject-detail-head {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
    }
    .subject-detail-head__icon {
      width: 60px;
      height: 60px;
      flex: 0 0 60px;
      display: grid;
      place-items: center;
      border-radius: 20px;
      color: var(--ink-soft);
      background: var(--subject-color, var(--lime-soft));
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
    }
    .subject-detail-head__icon svg { width: 26px; height: 26px; }
    .subject-detail-head__eyebrow {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-hint);
      letter-spacing: 0.02em;
    }
    .subject-detail-head__title {
      margin-top: 5px;
      font-size: clamp(27px, 5.2vw, 38px);
      font-weight: 600;
      letter-spacing: -0.055em;
      line-height: 1.06;
      color: var(--ink);
    }
    .subject-detail-head__desc {
      margin-top: 8px;
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--text-secondary);
      max-width: 680px;
    }

    /* Chips Row */
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: var(--radius-pill);
      background: var(--surface);
      border: 1px solid var(--line);
      font-size: 11.5px;
      font-weight: 600;
      color: var(--text-secondary);
      box-shadow: 0 2px 8px rgba(0,0,0,0.025);
    }
    .chip--active, a.chip:hover {
      background: var(--ink-soft);
      border-color: var(--ink-soft);
      color: #fff;
    }

    /* Primary Dark Pill CTA matching .open-notes-btn */
    .open-notes-btn {
      width: 100%;
      min-height: 60px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 14px 20px;
      border-radius: var(--radius-pill);
      color: #fff;
      background: var(--ink-soft);
      box-shadow: 0 12px 28px rgba(20, 20, 22, 0.18);
      transition: transform 120ms ease, box-shadow 120ms ease;
      margin-bottom: 24px;
    }
    .open-notes-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 16px 34px rgba(20, 20, 22, 0.24);
    }
    .open-notes-btn__left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .open-notes-btn__icon {
      width: 38px;
      height: 38px;
      flex: 0 0 38px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: var(--ink-soft);
      background: var(--lime);
    }
    .open-notes-btn__icon svg { width: 17px; height: 17px; }
    .open-notes-btn__label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.015em;
    }
    .open-notes-btn__sub {
      display: block;
      margin-top: 2px;
      color: rgba(255, 255, 255, 0.56);
      font-size: 11px;
    }
    .open-notes-btn__arrow {
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
    }
    .open-notes-btn__arrow svg { width: 15px; height: 15px; }

    /* Two-column detail grid */
    .detail-grid {
      display: grid;
      gap: 22px;
      grid-template-columns: minmax(0, 1fr);
    }
    .detail-main, .detail-aside {
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 0;
    }
    @media (min-width: 880px) {
      .detail-grid {
        grid-template-columns: minmax(0, 1.55fr) minmax(290px, 0.86fr);
        align-items: start;
        gap: 24px;
      }
      .detail-aside {
        position: sticky;
        top: 84px;
      }
    }

    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .section-head h2 {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.03em;
    }
    .section-head__meta {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-hint);
    }

    /* Bento White Card & Rows matching .helping-card / .helping-row */
    .bento-card {
      padding: 6px 18px;
      border-radius: var(--radius-xl);
      background: var(--surface);
      box-shadow: var(--shadow-card);
    }
    .helping-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 0;
      border-bottom: 1px solid var(--line);
    }
    .helping-row:last-child { border-bottom: 0; }
    .helping-row__icon {
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      display: grid;
      place-items: center;
      border-radius: 13px;
      color: var(--ink-soft);
      background: var(--surface-soft);
    }
    .helping-row__icon svg { width: 18px; height: 18px; }
    .helping-row__icon--main { color: var(--ink-soft); background: var(--lime-soft); }
    .helping-row__icon--pyq { color: #4d8f3e; background: #f4faef; }
    .helping-row__icon--formula { color: #b87508; background: #fff9ee; }
    .helping-row__icon--syllabus { color: #4776c8; background: #f3f7ff; }
    .helping-row__icon--lab { color: #8559c9; background: #f8f2ff; }
    .helping-row__icon--assignment { color: #c75d6b; background: #fff5f6; }

    .helping-row__copy { flex: 1; min-width: 0; }
    .helping-row__title {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
      letter-spacing: -0.015em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .helping-row__meta {
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 11px;
      color: var(--text-hint);
    }
    .type-chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 9px;
      border-radius: var(--radius-pill);
      font-size: 10px;
      font-weight: 600;
      background: var(--surface-soft);
      color: var(--text-secondary);
    }
    .type-chip--main { background: var(--lime-soft); color: var(--ink-soft); }
    .type-chip--pyq { background: #f4faef; color: #3c7a2e; }
    .type-chip--formula { background: #fff9ee; color: #a16505; }
    .type-chip--syllabus { background: #f3f7ff; color: #3662b5; }
    .type-chip--lab { background: #f8f2ff; color: #6e45b0; }

    .helping-row__view {
      flex: 0 0 auto;
      padding: 8px 14px;
      border-radius: var(--radius-pill);
      color: var(--ink);
      background: var(--surface-soft);
      font-size: 11.5px;
      font-weight: 600;
      transition: background 120ms ease;
    }
    .helping-row:hover .helping-row__view { background: var(--lime); }

    /* Module Rows */
    .module-list { list-style: none; counter-reset: mod; }
    .module-list li {
      counter-increment: mod;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 13px 0;
      border-bottom: 1px solid var(--line);
      font-size: 13.5px;
      font-weight: 500;
      color: var(--ink);
    }
    .module-list li:last-child { border-bottom: 0; }
    .module-list li::before {
      content: counter(mod);
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: var(--lime-soft);
      color: var(--ink-soft);
      font-size: 11.5px;
      font-weight: 700;
    }

    /* Sticky Details Aside matching .doc-details-panel */
    .doc-details-panel {
      padding: 18px;
      border-radius: var(--radius-xl);
      background: var(--surface-tint);
    }
    .doc-details-panel__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }
    .doc-details-panel__head h2 {
      font-size: 14.5px;
      font-weight: 600;
      letter-spacing: -0.025em;
    }
    .kv-list {
      background: var(--surface);
      border-radius: var(--radius-md);
      padding: 2px 14px;
    }
    .kv-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
    }
    .kv-row:last-child { border-bottom: 0; }
    .kv-row__label { color: var(--text-hint); font-weight: 500; }
    .kv-row__value { color: var(--ink); font-weight: 600; text-align: right; }

    .view-note {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-card);
      font-size: 11.5px;
      color: var(--text-secondary);
      line-height: 1.45;
    }
    .view-note svg { width: 18px; height: 18px; flex: 0 0 18px; color: var(--ink-soft); }

    /* Subject Rows & Cards (matching Library page) */
    .year-section { margin-top: 28px; }
    .year-section__title {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.04em;
      margin-bottom: 14px;
    }
    .semester-heading {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-hint);
      margin: 18px 0 10px 2px;
    }
    .subject-list {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
    }
    .subject-row {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr) auto;
      align-items: center;
      gap: 13px;
      padding: 15px;
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-card);
      border: 1px solid rgba(21, 21, 21, 0.03);
      transition: transform 160ms ease, box-shadow 160ms ease;
    }
    .subject-row:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-card-hover);
    }
    .subject-row__badge {
      min-height: 58px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 6px 4px;
      border-radius: 15px;
      background: var(--subject-color, var(--lime-soft));
      color: var(--ink-soft);
      font-size: 9px;
      font-weight: 600;
      text-align: center;
    }
    .subject-row__badge svg { width: 17px; height: 17px; }
    .subject-row__copy { min-width: 0; }
    .subject-row__eyebrow {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 9.5px;
      font-weight: 600;
      color: var(--text-hint);
      margin-bottom: 3px;
    }
    .subject-row__title {
      display: block;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.025em;
      color: var(--ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .subject-row__desc {
      display: block;
      margin-top: 3px;
      font-size: 11px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .subject-row__meta {
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 10px;
      color: var(--text-hint);
    }
    .status-chip {
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--lime-soft);
      color: var(--ink-soft);
      font-weight: 600;
      font-size: 9.5px;
    }
    .subject-row__arrow {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--surface-soft);
      color: var(--text-secondary);
      transition: background 120ms ease, color 120ms ease;
    }
    .subject-row:hover .subject-row__arrow {
      background: var(--lime);
      color: var(--ink-soft);
    }
    .subject-row__arrow svg { width: 15px; height: 15px; }

    /* Empty Sync Notice Card */
    .sync-card {
      padding: 28px 24px;
      border-radius: var(--radius-xl);
      background: var(--surface);
      box-shadow: var(--shadow-card);
      text-align: center;
      max-width: 560px;
      margin: 28px auto;
    }
    .sync-card__icon {
      width: 54px;
      height: 54px;
      margin: 0 auto 14px;
      border-radius: 18px;
      background: var(--lime-soft);
      display: grid;
      place-items: center;
      color: var(--ink-soft);
    }
    .sync-card h2 { font-size: 19px; font-weight: 600; margin-bottom: 8px; }
    .sync-card p { font-size: 13px; color: var(--text-secondary); margin-bottom: 18px; line-height: 1.55; }

    /* Footer */
    .site-footer {
      width: min(100%, 1040px);
      margin: 20px auto 0;
      padding: 22px 18px;
      border-top: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 12px;
      color: var(--text-hint);
    }
    .footer-links { display: flex; gap: 16px; flex-wrap: wrap; }
    .footer-links a { font-weight: 500; color: var(--text-secondary); }
    .footer-links a:hover { color: var(--ink); }

    /* Floating Mobile Dock matching .bottom-nav */
    .mobile-dock {
      display: none;
    }
    @media (max-width: 680px) {
      .top-nav { display: none; }
      .mobile-dock {
        position: fixed;
        left: 50%;
        bottom: calc(12px + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        z-index: 80;
        width: calc(100% - 24px);
        max-width: 440px;
        padding: 7px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        border-radius: 30px;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.72);
        box-shadow: var(--shadow-nav);
        backdrop-filter: blur(22px) saturate(1.2);
        -webkit-backdrop-filter: blur(22px) saturate(1.2);
      }
      .mobile-dock a {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 8px 4px;
        border-radius: 22px;
        font-size: 10px;
        font-weight: 600;
        color: var(--text-hint);
      }
      .mobile-dock a.is-active {
        flex: 0 0 auto;
        flex-direction: row;
        gap: 6px;
        padding: 10px 15px;
        background: var(--ink-soft);
        color: #fff;
        font-size: 11px;
      }
      .mobile-dock svg { width: 17px; height: 17px; }
      .subject-list { grid-template-columns: 1fr; }
    }
  `;
}

// ---------------------------------------------------------------------------
// Icons & Shared Chrome
// ---------------------------------------------------------------------------

const SVG_BOOK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H9a3 3 0 0 1 3 3v16a3 3 0 0 0-3-3H4.5A2.5 2.5 0 0 1 2 15.5Z"/><path d="M22 4.5A2.5 2.5 0 0 0 19.5 2H15a3 3 0 0 0-3 3v16a3 3 0 0 1 3-3h4.5a2.5 2.5 0 0 0 2.5-2.5Z"/></svg>';
const SVG_FILE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';
const SVG_ARROW_RIGHT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
const SVG_ARROW_LEFT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 12-14 0"/><path d="m12 19-7-7 7-7"/></svg>';
const SVG_SHIELD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/></svg>';
const SVG_HOME =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/></svg>';
const SVG_LIBRARY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>';
const SVG_INFO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
const SVG_UP_RIGHT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>';

function headerHTML(active = 'notes') {
  return `
  <div class="seo-topbar-wrap">
    <header class="seo-topbar">
      <a href="${DOMAIN}/#/home" class="brand-link" aria-label="Academix Home">
        <span class="brand-mark"><img src="/icons/icon-192.png" alt="Academix" width="38" height="38" /></span>
        <span>
          <span class="brand-wordmark">Academix</span>
          <span class="brand-tagline">Your notes. One place.</span>
        </span>
      </a>
      <nav class="top-nav" aria-label="Primary">
        <a href="${DOMAIN}/#/home">Home</a>
        <a href="${DOMAIN}/#/library">Library</a>
        <a href="${DOMAIN}/notes/" class="${active === 'notes' ? 'is-active' : ''}">All Notes</a>
        <a href="${DOMAIN}/#/about">About</a>
      </nav>
    </header>
  </div>`;
}

function mobileDockHTML(active = 'notes') {
  return `
  <nav class="mobile-dock" aria-label="Mobile Navigation">
    <a href="${DOMAIN}/#/home">${SVG_HOME}<span>Home</span></a>
    <a href="${DOMAIN}/#/library">${SVG_LIBRARY}<span>Library</span></a>
    <a href="${DOMAIN}/notes/" class="${active === 'notes' ? 'is-active' : ''}">${SVG_BOOK}<span>Notes</span></a>
    <a href="${DOMAIN}/#/about">${SVG_INFO}<span>About</span></a>
  </nav>`;
}

function footerHTML() {
  const year = new Date().getFullYear();
  return `
  <footer class="site-footer">
    <span>&copy; ${year} Academix — Free Engineering Notes Library</span>
    <div class="footer-links">
      <a href="${DOMAIN}/#/home">Open App</a>
      <a href="${DOMAIN}/#/library">Library</a>
      <a href="${DOMAIN}/notes/">All Notes</a>
      <a href="${DOMAIN}/#/about">About</a>
      <a href="${DOMAIN}/#/terms">Terms</a>
      <a href="${DOMAIN}/#/privacy">Privacy</a>
    </div>
  </footer>`;
}

// ---------------------------------------------------------------------------
// Page Templates
// ---------------------------------------------------------------------------

function buildSubjectPage(subject, slug, yearsMap, branchesMap, relatedSubjects, slugMap, branchSlugMap) {
  const year = yearsMap.get(subject.yearId);
  const yearName = year ? esc(year.name) : '';
  const semesterLabel = subject.semester ? `Sem ${subject.semester}` : '';
  const branches = (subject.branchIds || []).map((id) => branchesMap.get(id)).filter(Boolean);
  const subjectColor = safeHexColor(subject.color, '#F0F5D9');

  const modules = Array.isArray(subject.modules)
    ? [...subject.modules].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    : [];
  const docs = [...(subject._documents || [])].sort((a, b) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0));
  const mainDoc = docs.find((d) => d.isMain) || docs.find((d) => d.type === 'main') || docs[0] || null;

  const title = `${esc(subject.name)} Notes PDF — Study Material & PYQs | Academix`;
  const branchText = branches.map((b) => b.name).join(', ');
  const descParts = [];
  if (subject.description) descParts.push(subject.description);
  if (modules.length || docs.length) {
    descParts.push(
      `Includes ${modules.length} unit${modules.length === 1 ? '' : 's'} and ${docs.length} study document${docs.length === 1 ? '' : 's'}.`
    );
  }
  if (yearName) descParts.push(yearName);
  if (branchText) descParts.push(`for ${branchText}.`);
  const metaDescription = esc(descParts.join(' ').substring(0, 158));

  const canonicalURL = `${DOMAIN}/notes/${slug}/`;
  const lastmod = toISODate(subject.updatedAt || subject.createdAt);

  const jsonLdWebPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${subject.name} Notes PDF`,
    description: descParts.join(' ').substring(0, 260),
    url: canonicalURL,
    dateModified: lastmod,
    publisher: { '@type': 'Organization', name: 'Academix', url: DOMAIN },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${DOMAIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Notes Catalog', item: `${DOMAIN}/notes/` },
      { '@type': 'ListItem', position: 3, name: subject.name, item: canonicalURL },
    ],
  };

  const mainDocMeta = mainDoc
    ? ['PDF', Number(mainDoc.pages) > 0 ? `${mainDoc.pages} pages` : '', mainDoc.sizeLabel || 'View-only']
        .filter(Boolean)
        .join(' · ')
    : 'View-only interactive reader';

  const docsHTML = docs.length
    ? `
      <section>
        <div class="section-head">
          <h2>Study documents</h2>
          <span class="section-head__meta">${docs.length} ${docs.length === 1 ? 'file' : 'files'}</span>
        </div>
        <div class="bento-card">
          ${docs
            .map((d) => {
              const type = d.type || (d.isMain ? 'main' : 'other');
              const meta = DOC_TYPE_META[type] || DOC_TYPE_META.other;
              const subParts = [
                Number(d.pages) > 0 ? `${d.pages} pages` : '',
                d.sizeLabel || '',
                d.description || '',
              ].filter(Boolean);
              return `
              <a class="helping-row" href="${DOMAIN}/#/viewer/${encodeURIComponent(d.id)}">
                <span class="helping-row__icon helping-row__icon--${esc(type)}">${SVG_FILE}</span>
                <span class="helping-row__copy">
                  <span class="helping-row__title">${esc(d.title || meta.label)}</span>
                  <span class="helping-row__meta">
                    <span class="type-chip ${meta.chip}">${esc(meta.short)}</span>
                    <span>${esc(subParts.slice(0, 2).join(' · ') || 'Ready to view')}</span>
                  </span>
                </span>
                <span class="helping-row__view">View</span>
              </a>`;
            })
            .join('')}
        </div>
      </section>`
    : '';

  const modulesHTML = modules.length
    ? `
      <section>
        <div class="section-head">
          <h2>Syllabus modules</h2>
          <span class="section-head__meta">${modules.length} ${modules.length === 1 ? 'module' : 'modules'}</span>
        </div>
        <div class="bento-card">
          <ol class="module-list">
            ${modules.map((m) => `<li><span>${esc(m.name || m)}</span></li>`).join('')}
          </ol>
        </div>
      </section>`
    : '';

  const relatedHTML = relatedSubjects.length
    ? `
      <section style="margin-top:28px">
        <div class="section-head">
          <h2>Related subjects</h2>
          <a href="${DOMAIN}/notes/" class="section-head__meta" style="font-weight:600;color:var(--ink)">Browse all →</a>
        </div>
        <div class="subject-list">
          ${relatedSubjects
            .slice(0, 6)
            .map((r) => {
              const rSlug = slugMap.get(r.id);
              const rYear = yearsMap.get(r.yearId);
              const rColor = safeHexColor(r.color, '#F0F5D9');
              const rMods = Array.isArray(r.modules) ? r.modules.length : 0;
              const rDocs = Array.isArray(r._documents) ? r._documents.length : 0;
              return `
              <a class="subject-row" href="${DOMAIN}/notes/${rSlug}/" style="--subject-color:${rColor}">
                <span class="subject-row__badge">${SVG_BOOK}<span>${rMods} mods</span></span>
                <span class="subject-row__copy">
                  <span class="subject-row__eyebrow">${esc(r.code || 'SUBJECT')}${rYear ? ` · ${esc(rYear.name)}` : ''}${r.semester ? ` · Sem ${r.semester}` : ''}</span>
                  <span class="subject-row__title">${esc(r.name)}</span>
                  <span class="subject-row__meta">
                    <span class="status-chip">${rDocs} ${rDocs === 1 ? 'doc' : 'docs'}</span>
                  </span>
                </span>
                <span class="subject-row__arrow">${SVG_ARROW_RIGHT}</span>
              </a>`;
            })
            .join('')}
        </div>
      </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${title}</title>
  <meta name="description" content="${metaDescription}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonicalURL}" />

  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${metaDescription}" />
  <meta property="og:url" content="${canonicalURL}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Academix" />
  <meta property="og:image" content="${OG_IMAGE}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${metaDescription}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />

  <script type="application/ld+json">${JSON.stringify(jsonLdWebPage)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>

  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon.png" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

  <style>${academixCSS(true)}</style>
</head>
<body>
  ${headerHTML('notes')}

  <main class="page-shell">
    <div class="detail-topbar">
      <a class="icon-btn" href="${DOMAIN}/notes/" aria-label="Back to notes catalog">${SVG_ARROW_LEFT}</a>
      <nav aria-label="Breadcrumb">
        <ol class="breadcrumb">
          <li><a href="${DOMAIN}/#/home">Home</a></li>
          <li><a href="${DOMAIN}/notes/">Notes</a></li>
          <li aria-current="page">${esc(subject.name)}</li>
        </ol>
      </nav>
      <a class="icon-btn icon-btn--lime" href="${DOMAIN}/#/subject/${encodeURIComponent(subject.id)}" aria-label="Open in Academix">${SVG_UP_RIGHT}</a>
    </div>

    <div class="detail-grid">
      <div class="detail-main">
        <header class="subject-detail-head">
          <span class="subject-detail-head__icon" style="--subject-color:${subjectColor}">${SVG_BOOK}</span>
          <div>
            <div class="subject-detail-head__eyebrow">
              <span>${esc(subject.code || 'SUBJECT')}</span>
              <span class="dot" style="background:${subjectColor}"></span>
              <span>${[yearName, semesterLabel].filter(Boolean).join(' · ') || 'Academic Subject'}</span>
            </div>
            <h1 class="subject-detail-head__title">${esc(subject.name)}</h1>
            ${subject.description ? `<p class="subject-detail-head__desc">${esc(subject.description)}</p>` : ''}
          </div>
        </header>

        <div class="chip-row">
          ${branches
            .map((b) => {
              const bSlug = branchSlugMap.get(b.id);
              const label = esc(b.shortName || b.name);
              return bSlug
                ? `<a class="chip" href="${DOMAIN}/notes/branch/${bSlug}/">${label}</a>`
                : `<span class="chip">${label}</span>`;
            })
            .join('')}
          <span class="chip">${modules.length} ${modules.length === 1 ? 'module' : 'modules'}</span>
          <span class="chip">${docs.length} ${docs.length === 1 ? 'document' : 'documents'}</span>
        </div>

        <a class="open-notes-btn" href="${DOMAIN}/#/subject/${encodeURIComponent(subject.id)}">
          <span class="open-notes-btn__left">
            <span class="open-notes-btn__icon">${SVG_BOOK}</span>
            <span>
              <span class="open-notes-btn__label">${mainDoc ? 'Open main notes in Academix' : 'Open subject in Academix'}</span>
              <span class="open-notes-btn__sub">${esc(mainDocMeta)}</span>
            </span>
          </span>
          <span class="open-notes-btn__arrow">${SVG_ARROW_RIGHT}</span>
        </a>

        ${docsHTML}
        ${modulesHTML}
      </div>

      <aside class="detail-aside">
        <section class="doc-details-panel">
          <div class="doc-details-panel__head">
            <h2>Subject details</h2>
            <span class="type-chip type-chip--main">${esc(subject.code || 'Subject')}</span>
          </div>
          <div class="kv-list">
            <div class="kv-row"><span class="kv-row__label">Year</span><span class="kv-row__value">${yearName || '—'}</span></div>
            <div class="kv-row"><span class="kv-row__label">Semester</span><span class="kv-row__value">${semesterLabel || '—'}</span></div>
            <div class="kv-row"><span class="kv-row__label">Branches</span><span class="kv-row__value">${esc(branches.map((b) => b.shortName || b.name).join(', ') || 'All')}</span></div>
            <div class="kv-row"><span class="kv-row__label">Modules</span><span class="kv-row__value">${modules.length}</span></div>
            <div class="kv-row"><span class="kv-row__label">Documents</span><span class="kv-row__value">${docs.length}</span></div>
            <div class="kv-row"><span class="kv-row__label">Last updated</span><span class="kv-row__value">${lastmod}</span></div>
          </div>
        </section>

        <div class="view-note">
          ${SVG_SHIELD}
          <span>View only. Study notes open cleanly in Academix’s protected reader to respect contributor work.</span>
        </div>
      </aside>
    </div>

    ${relatedHTML}
  </main>

  ${footerHTML()}
  ${mobileDockHTML('notes')}
</body>
</html>`;
}

function buildBranchPage(branch, bSlug, branchSubjects, yearsMap, slugMap, allBranches, branchSlugMap) {
  const shortOrName = esc(branch.shortName || branch.name);
  const fullName = esc(branch.name);
  const title = `${fullName} (${shortOrName}) Notes PDF — Study Material | Academix`;
  const description = esc(
    `Browse all ${branchSubjects.length} published subjects, main notes PDFs, PYQs, and syllabus modules for ${branch.name} on Academix.`
  );
  const canonicalURL = `${DOMAIN}/notes/branch/${bSlug}/`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${branch.name} Engineering Notes`,
    description,
    url: canonicalURL,
    publisher: { '@type': 'Organization', name: 'Academix', url: DOMAIN },
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonicalURL}" />

  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonicalURL}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Academix" />
  <meta property="og:image" content="${OG_IMAGE}" />

  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

  <style>${academixCSS(false)}</style>
</head>
<body>
  ${headerHTML('notes')}

  <main class="page-shell">
    <nav aria-label="Breadcrumb" style="margin-bottom:14px">
      <ol class="breadcrumb">
        <li><a href="${DOMAIN}/#/home">Home</a></li>
        <li><a href="${DOMAIN}/notes/">All Notes</a></li>
        <li aria-current="page">${shortOrName}</li>
      </ol>
    </nav>

    <p class="hero-eyebrow"><span class="dot"></span>${shortOrName} · ${branchSubjects.length} subjects available</p>
    <h1 class="mixed-heading"><span class="light">${shortOrName}</span><span class="strong">Study Notes.</span></h1>
    <p class="hero-sub">Free unit-wise notes, main PDFs, PYQs, and study guides for ${fullName}.</p>

    <div class="chip-row">
      <a class="chip" href="${DOMAIN}/notes/">All branches</a>
      ${allBranches
        .map((other) => {
          const slug = branchSlugMap.get(other.id);
          return `<a class="chip ${other.id === branch.id ? 'chip--active' : ''}" href="${DOMAIN}/notes/branch/${slug}/">${esc(other.shortName || other.name)}</a>`;
        })
        .join('')}
    </div>

    <div class="subject-list">
      ${branchSubjects
        .map((sub) => {
          const sSlug = slugMap.get(sub.id);
          const sYear = yearsMap.get(sub.yearId);
          const sColor = safeHexColor(sub.color, '#F0F5D9');
          const mods = Array.isArray(sub.modules) ? sub.modules.length : 0;
          const docs = Array.isArray(sub._documents) ? sub._documents.length : 0;
          return `
          <a class="subject-row" href="${DOMAIN}/notes/${sSlug}/" style="--subject-color:${sColor}">
            <span class="subject-row__badge">${SVG_BOOK}<span>${mods} mods</span></span>
            <span class="subject-row__copy">
              <span class="subject-row__eyebrow">${esc(sub.code || 'SUBJECT')}${sYear ? ` · ${esc(sYear.name)}` : ''}${sub.semester ? ` · Sem ${sub.semester}` : ''}</span>
              <span class="subject-row__title">${esc(sub.name)}</span>
              ${sub.description ? `<span class="subject-row__desc">${esc(sub.description)}</span>` : ''}
              <span class="subject-row__meta">
                <span class="status-chip">${docs} ${docs === 1 ? 'document' : 'documents'}</span>
              </span>
            </span>
            <span class="subject-row__arrow">${SVG_ARROW_RIGHT}</span>
          </a>`;
        })
        .join('')}
    </div>
  </main>

  ${footerHTML()}
  ${mobileDockHTML('notes')}
</body>
</html>`;
}

function buildNotesIndexPage(eligibleSubjects, yearsMap, branches, slugMap, branchSlugMap) {
  const title = 'Engineering Notes Catalog — Free Study Material & PDFs | Academix';
  const description = eligibleSubjects.length
    ? `Browse ${eligibleSubjects.length} published subjects on Academix. Access semester-wise main notes PDFs, PYQs, formula sheets, and modules.`
    : 'Browse Engineering Notes, PYQs, and study materials across your semesters in Academix.';
  const canonicalURL = `${DOMAIN}/notes/`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: canonicalURL,
    publisher: { '@type': 'Organization', name: 'Academix', url: DOMAIN },
  };

  // Group eligible subjects by year → semester
  const yearGroups = new Map();
  const ungroupedSubjects = [];

  for (const sub of eligibleSubjects) {
    const year = yearsMap.get(sub.yearId);
    if (!year) {
      ungroupedSubjects.push(sub);
      continue;
    }
    if (!yearGroups.has(sub.yearId)) yearGroups.set(sub.yearId, { year, semesters: new Map() });
    const group = yearGroups.get(sub.yearId);
    const sem = Number(sub.semester) || 0;
    if (!group.semesters.has(sem)) group.semesters.set(sem, []);
    group.semesters.get(sem).push(sub);
  }

  const sortedYears = [...yearGroups.values()].sort(
    (a, b) => (Number(a.year.order) || 0) - (Number(b.year.order) || 0)
  );

  const renderSubjectRows = (subs) =>
    `<div class="subject-list">${subs
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .map((sub) => {
        const sSlug = slugMap.get(sub.id);
        const sColor = safeHexColor(sub.color, '#F0F5D9');
        const mods = Array.isArray(sub.modules) ? sub.modules.length : 0;
        const docs = Array.isArray(sub._documents) ? sub._documents : [];
        const hasMain = docs.some((d) => d.isMain || d.type === 'main');
        return `
        <a class="subject-row" href="${DOMAIN}/notes/${sSlug}/" style="--subject-color:${sColor}">
          <span class="subject-row__badge">${SVG_BOOK}<span>${mods} mods</span></span>
          <span class="subject-row__copy">
            <span class="subject-row__eyebrow">${esc(sub.code || 'SUBJECT')}${sub.semester ? ` · Sem ${sub.semester}` : ''}</span>
            <span class="subject-row__title">${esc(sub.name)}</span>
            ${sub.description ? `<span class="subject-row__desc">${esc(sub.description)}</span>` : ''}
            <span class="subject-row__meta">
              <span class="status-chip">${hasMain ? 'Main notes ready' : `${docs.length} docs`}</span>
              <span>${docs.length} ${docs.length === 1 ? 'document' : 'documents'}</span>
            </span>
          </span>
          <span class="subject-row__arrow">${SVG_ARROW_RIGHT}</span>
        </a>`;
      })
      .join('')}</div>`;

  let catalogHTML = '';
  if (!eligibleSubjects.length) {
    catalogHTML = `
      <div class="sync-card">
        <div class="sync-card__icon">${SVG_BOOK}</div>
        <h2>Live subjects are inside the library</h2>
        <p>Open the Academix app to browse all current semesters, branches, and PDFs directly, or trigger SEO synchronization from the Admin Dashboard.</p>
        <a class="open-notes-btn" style="max-width:340px;margin:0 auto" href="${DOMAIN}/#/library">
          <span class="open-notes-btn__left">
            <span class="open-notes-btn__icon">${SVG_LIBRARY}</span>
            <span>
              <span class="open-notes-btn__label">Open Academix Library</span>
              <span class="open-notes-btn__sub">Browse all published notes</span>
            </span>
          </span>
          <span class="open-notes-btn__arrow">${SVG_ARROW_RIGHT}</span>
        </a>
      </div>`;
  } else {
    for (const yg of sortedYears) {
      const sortedSemesters = [...yg.semesters.entries()].sort((a, b) => a[0] - b[0]);
      let semestersHTML = '';
      for (const [sem, subs] of sortedSemesters) {
        semestersHTML += `
          <h3 class="semester-heading">${sem ? `Semester ${sem}` : 'Subjects'} · ${subs.length} ${subs.length === 1 ? 'subject' : 'subjects'}</h3>
          ${renderSubjectRows(subs)}`;
      }
      catalogHTML += `
        <section class="year-section">
          <h2 class="year-section__title">${esc(yg.year.name)}</h2>
          ${semestersHTML}
        </section>`;
    }
    if (ungroupedSubjects.length) {
      catalogHTML += `
        <section class="year-section">
          <h2 class="year-section__title">Subjects</h2>
          ${renderSubjectRows(ungroupedSubjects)}
        </section>`;
    }
  }

  const branchPillsHTML = branches.length
    ? `<div class="chip-row">
        <span class="chip chip--active">All branches</span>
        ${branches
          .map((b) => {
            const bSlug = branchSlugMap.get(b.id);
            return bSlug
              ? `<a class="chip" href="${DOMAIN}/notes/branch/${bSlug}/">${esc(b.shortName || b.name)}</a>`
              : `<span class="chip">${esc(b.shortName || b.name)}</span>`;
          })
          .join('')}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${title}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonicalURL}" />

  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${canonicalURL}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Academix" />
  <meta property="og:image" content="${OG_IMAGE}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />

  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon.png" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

  <style>${academixCSS(false)}</style>
</head>
<body>
  ${headerHTML('notes')}

  <main class="page-shell">
    <p class="hero-eyebrow"><span class="dot"></span>Study catalog · ${eligibleSubjects.length} published ${eligibleSubjects.length === 1 ? 'subject' : 'subjects'}</p>
    <h1 class="mixed-heading"><span class="light">Your whole</span><span class="strong">syllabus.</span></h1>
    <p class="hero-sub">Browse free unit-wise engineering notes, main PDFs, PYQs, and study materials across every semester and branch.</p>

    ${branchPillsHTML}
    ${catalogHTML}
  </main>

  ${footerHTML()}
  ${mobileDockHTML('notes')}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Sitemap & Robots Generators
// ---------------------------------------------------------------------------

function buildSitemap(eligibleSubjects, slugMap, activeBranches, branchSlugMap) {
  const today = new Date().toISOString().split('T')[0];

  let urls = `
  <url>
    <loc>${DOMAIN}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${DOMAIN}/notes/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

  for (const branch of activeBranches) {
    const bSlug = branchSlugMap.get(branch.id);
    urls += `
  <url>
    <loc>${DOMAIN}/notes/branch/${bSlug}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.75</priority>
  </url>`;
  }

  for (const sub of eligibleSubjects) {
    const slug = slugMap.get(sub.id);
    const lastmod = toISODate(sub.updatedAt || sub.createdAt);
    urls += `
  <url>
    <loc>${DOMAIN}/notes/${slug}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
}

function buildRobotsTxt() {
  return `# Academix — Engineering Notes Library
# ${DOMAIN}

User-agent: *
Allow: /
Allow: /notes/

# Private/internal directories
Disallow: /app/
Disallow: /android/

# Sitemap
Sitemap: ${DOMAIN}/sitemap.xml
`;
}

// ---------------------------------------------------------------------------
// File System & Cleanup Utilities
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFileSafe(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function cleanStaleSubjectDirs(notesDir, validSlugs, validBranchSlugs) {
  if (!fs.existsSync(notesDir)) return 0;
  let removed = 0;
  const entries = fs.readdirSync(notesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'branch') {
      const branchDir = path.join(notesDir, 'branch');
      const bEntries = fs.readdirSync(branchDir, { withFileTypes: true });
      for (const bEntry of bEntries) {
        if (bEntry.isDirectory() && !validBranchSlugs.has(bEntry.name)) {
          fs.rmSync(path.join(branchDir, bEntry.name), { recursive: true, force: true });
          removed++;
        }
      }
      if (!fs.readdirSync(branchDir).length) {
        fs.rmSync(branchDir, { recursive: true, force: true });
      }
      continue;
    }
    if (!validSlugs.has(entry.name)) {
      fs.rmSync(path.join(notesDir, entry.name), { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const targetRoot = args.outDir || ROOT_DIR;
  const targetNotesDir = path.join(targetRoot, 'notes');

  console.log('═══════════════════════════════════════════════════');
  console.log('  Academix SEO Static Page Generator');
  console.log('═══════════════════════════════════════════════════\n');

  const catalog = await resolveCatalogData(args);
  const { subjects, years, branches, documents, source } = catalog;

  console.log(`→ Data Source: ${source}`);
  console.log(`  Subjects:  ${subjects.length}`);
  console.log(`  Years:     ${years.length}`);
  console.log(`  Branches:  ${branches.length}`);
  console.log(`  Documents: ${documents.length}\n`);

  const yearsMap = new Map(years.map((y) => [y.id, y]));
  const branchesMap = new Map(branches.map((b) => [b.id, b]));
  const docsMap = new Map();
  for (const d of documents) {
    if (!docsMap.has(d.subjectId)) docsMap.set(d.subjectId, []);
    docsMap.get(d.subjectId).push(d);
  }
  for (const sub of subjects) {
    sub._documents = docsMap.get(sub.id) || [];
  }

  const eligible = [];
  const skipped = [];
  for (const sub of subjects) {
    const reason = isEligibleSubject(sub);
    if (reason) skipped.push({ name: sub.name || sub.id, reason });
    else eligible.push(sub);
  }

  console.log(`→ Eligible subjects: ${eligible.length}`);
  if (skipped.length) {
    console.log(`  Skipped (${skipped.length}):`);
    skipped.forEach((s) => console.log(`    — ${s.name}: ${s.reason}`));
  }

  const slugMap = buildSlugMap(eligible);
  const branchSlugMap = buildSlugMap(branches, (b) => b.name, (b) => b.shortName || b.id);

  // Determine branches that actually have >= 1 eligible subject
  const activeBranches = branches.filter((b) =>
    eligible.some((sub) => Array.isArray(sub.branchIds) && sub.branchIds.includes(b.id))
  );

  // Remove any stale, removed, or hardcoded demo folders
  const validSlugs = new Set(eligible.map((s) => slugMap.get(s.id)));
  const validBranchSlugs = new Set(activeBranches.map((b) => branchSlugMap.get(b.id)));
  const removedStale = cleanStaleSubjectDirs(targetNotesDir, validSlugs, validBranchSlugs);
  if (removedStale > 0) {
    console.log(`→ Cleaned ${removedStale} stale/removed page directory(ies)`);
  }

  // Generate Subject Pages
  let generated = 0;
  for (const sub of eligible) {
    const slug = slugMap.get(sub.id);
    const related = eligible.filter((other) => {
      if (other.id === sub.id) return false;
      if (other.semester === sub.semester && other.yearId === sub.yearId) return true;
      return (
        Array.isArray(sub.branchIds) &&
        Array.isArray(other.branchIds) &&
        sub.branchIds.some((bid) => other.branchIds.includes(bid))
      );
    });
    const html = buildSubjectPage(
      sub,
      slug,
      yearsMap,
      branchesMap,
      related,
      slugMap,
      branchSlugMap
    );
    writeFileSafe(path.join(targetNotesDir, slug, 'index.html'), html);
    generated++;
  }

  // Generate Branch Directory Pages
  for (const branch of activeBranches) {
    const bSlug = branchSlugMap.get(branch.id);
    const branchSubjects = eligible.filter(
      (sub) => Array.isArray(sub.branchIds) && sub.branchIds.includes(branch.id)
    );
    const branchHTML = buildBranchPage(
      branch,
      bSlug,
      branchSubjects,
      yearsMap,
      slugMap,
      activeBranches,
      branchSlugMap
    );
    writeFileSafe(path.join(targetNotesDir, 'branch', bSlug, 'index.html'), branchHTML);
  }

  // Generate Notes Catalog Index
  const indexHTML = buildNotesIndexPage(
    eligible,
    yearsMap,
    activeBranches,
    slugMap,
    branchSlugMap
  );
  writeFileSafe(path.join(targetNotesDir, 'index.html'), indexHTML);

  // Generate Sitemap & Robots.txt
  const sitemapXML = buildSitemap(eligible, slugMap, activeBranches, branchSlugMap);
  writeFileSafe(path.join(targetRoot, 'sitemap.xml'), sitemapXML);
  writeFileSafe(path.join(targetRoot, 'robots.txt'), buildRobotsTxt());

  const sitemapUrlCount = (sitemapXML.match(/<url>/g) || []).length;
  console.log(`\n✔ Generated ${generated} subject page(s), ${activeBranches.length} branch page(s), notes/index.html, and sitemap.xml (${sitemapUrlCount} URLs).`);
}

main().catch((err) => {
  console.error('\n✖ SEO Generation Error:', err.message);
  process.exit(1);
});

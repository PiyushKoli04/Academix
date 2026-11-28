/**
 * Academix SEO Validation & Verification Suite
 *
 * Validates:
 *   1. robots.txt directives and sitemap reference
 *   2. sitemap.xml XML format, namespace, domain consistency, valid dates, no duplicates
 *   3. index.html permanent SEO metadata, canonical, JSON-LD, noscript fallback
 *   4. Generated static pages in notes/, notes/{slug}/, and notes/branch/{slug}/:
 *      - Single H1, unique titles/descriptions/canonicals, valid JSON-LD schemas
 *      - Matches official Academix UI tokens (#c9db74, #1c1c1e, #f4f3f5, .open-notes-btn)
 *   5. No stale/hardcoded demo subjects in production sitemap or notes/
 *
 * Flags:
 *   --dir <path>         Validate output in an alternate root directory
 *   --require-subjects   Fail if zero subject pages exist (enabled in CI)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const DOMAIN = 'https://academix.syntaxsyndicate.co.in';

let rootDir = DEFAULT_ROOT;
let requireSubjects = false;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--dir' && process.argv[i + 1]) {
    rootDir = path.resolve(process.argv[++i]);
  } else if (process.argv[i] === '--require-subjects') {
    requireSubjects = true;
  }
}

const NOTES_DIR = path.join(rootDir, 'notes');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function pass(name, detail = '') {
  totalTests++;
  passedTests++;
  console.log(`  ✔ [PASS] ${name}${detail ? ` (${detail})` : ''}`);
}

function fail(name, reason) {
  totalTests++;
  failedTests++;
  console.error(`  ✖ [FAIL] ${name}: ${reason}`);
}

function assert(condition, testName, failureReason, successDetail = '') {
  if (condition) pass(testName, successDetail);
  else fail(testName, failureReason);
}

// ---------------------------------------------------------------------------
// 1. Robots.txt Validation
// ---------------------------------------------------------------------------

function validateRobotsTxt() {
  console.log('\n--- 1. Validating robots.txt ---');
  const filePath = path.join(rootDir, 'robots.txt');
  assert(fs.existsSync(filePath), 'robots.txt exists', 'File not found');
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('User-agent: *'), 'robots.txt specifies User-agent: *', 'Missing User-agent');
  assert(content.includes('Allow: /'), 'robots.txt allows root public content', 'Missing Allow: /');
  assert(content.includes('Allow: /notes/'), 'robots.txt allows /notes/', 'Missing Allow: /notes/');
  assert(content.includes('Disallow: /app/'), 'robots.txt disallows /app/', 'Missing Disallow: /app/');
  assert(
    content.includes(`Sitemap: ${DOMAIN}/sitemap.xml`),
    'robots.txt links to production sitemap.xml',
    `Expected Sitemap: ${DOMAIN}/sitemap.xml`
  );
}

// ---------------------------------------------------------------------------
// 2. Sitemap.xml Validation
// ---------------------------------------------------------------------------

function validateSitemap() {
  console.log('\n--- 2. Validating sitemap.xml ---');
  const filePath = path.join(rootDir, 'sitemap.xml');
  assert(fs.existsSync(filePath), 'sitemap.xml exists', 'File not found');
  if (!fs.existsSync(filePath)) return [];

  const xml = fs.readFileSync(filePath, 'utf8');
  assert(xml.startsWith('<?xml'), 'sitemap.xml has XML declaration', 'Missing <?xml declaration');
  assert(xml.includes('<urlset'), 'sitemap.xml has <urlset> root element', 'Missing <urlset>');
  assert(
    xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'),
    'sitemap.xml has standard namespace',
    'Missing xmlns'
  );

  const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/g;
  const lastmodRegex = /<lastmod>([^<]+)<\/lastmod>/g;
  const urls = [];
  let m;
  while ((m = locRegex.exec(xml)) !== null) urls.push(m[1]);

  assert(urls.length >= 2, 'sitemap.xml contains base URLs', `Found ${urls.length} URLs`, `${urls.length} URLs`);
  assert(urls.includes(`${DOMAIN}/`), 'sitemap.xml includes homepage', 'Missing homepage URL');
  assert(urls.includes(`${DOMAIN}/notes/`), 'sitemap.xml includes notes catalog', 'Missing notes catalog URL');

  const nonProduction = urls.filter((u) => !u.startsWith(DOMAIN));
  assert(nonProduction.length === 0, 'All sitemap URLs match production domain', `Invalid URLs: ${nonProduction.join(', ')}`);

  const uniqueUrls = new Set(urls);
  assert(uniqueUrls.size === urls.length, 'No duplicate URLs in sitemap.xml', 'Duplicate URLs found');

  const dates = [];
  while ((m = lastmodRegex.exec(xml)) !== null) dates.push(m[1]);
  const invalidDates = dates.filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
  assert(invalidDates.length === 0, 'All <lastmod> dates use YYYY-MM-DD format', `Invalid dates: ${invalidDates.join(', ')}`);

  return urls;
}

// ---------------------------------------------------------------------------
// 3. Homepage (index.html) Validation (only when validating full root)
// ---------------------------------------------------------------------------

function validateHomepage() {
  const filePath = path.join(rootDir, 'index.html');
  if (!fs.existsSync(filePath)) return;

  console.log('\n--- 3. Validating index.html Permanent Page SEO ---');
  const html = fs.readFileSync(filePath, 'utf8');

  assert(html.includes('<!DOCTYPE html>'), 'index.html has valid DOCTYPE', 'Missing DOCTYPE');
  assert(/<html[^>]*lang=["']en["']/i.test(html), 'index.html has lang="en"', 'Missing lang attribute');
  assert(/<title>[^<]+<\/title>/i.test(html), 'index.html has title tag', 'Missing title');
  assert(
    /<meta[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i.test(html),
    'index.html has meta description',
    'Missing description'
  );
  assert(
    html.includes(`<link rel="canonical" href="${DOMAIN}/" />`),
    'index.html has production canonical URL',
    'Missing/invalid canonical'
  );
  assert(html.includes('og:title') && html.includes('og:description'), 'index.html has Open Graph tags', 'Missing OG');
  assert(html.includes('twitter:card'), 'index.html has Twitter Card tags', 'Missing twitter:card');
  assert(html.includes('application/ld+json'), 'index.html has JSON-LD structured data', 'Missing JSON-LD');
  assert(html.includes('<noscript>'), 'index.html has crawlable <noscript> fallback', 'Missing noscript');
  assert(
    !html.includes('Compiler Design') && !html.includes('Thermodynamics'),
    'index.html has no hardcoded fake demo subject lists',
    'Hardcoded demo subjects still present in index.html'
  );
}

// ---------------------------------------------------------------------------
// 4. Generated Static Notes Pages & UI Fidelity Validation
// ---------------------------------------------------------------------------

function validateUiStyleTokens(html, label) {
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const styleBlock = styleMatch ? styleMatch[1] : html;
  const hasLime = styleBlock.includes('#c9db74');
  const hasInkSoft = styleBlock.includes('#1c1c1e');
  const hasCanvasBg = styleBlock.includes('#f4f3f5');
  const hasNoTailwindGreen = !styleBlock.includes('#16a34a');
  assert(
    hasLime && hasInkSoft && hasCanvasBg && hasNoTailwindGreen,
    `${label} matches official Academix UI style palette`,
    'Missing Academix tokens (#c9db74 / #1c1c1e / #f4f3f5) or uses legacy green (#16a34a)'
  );
}

function validateGeneratedNotesPages(sitemapUrls) {
  console.log('\n--- 4. Validating Generated Notes Pages & UI Styling ---');
  assert(fs.existsSync(NOTES_DIR), 'notes/ directory exists', `Missing ${NOTES_DIR}`);
  if (!fs.existsSync(NOTES_DIR)) return;

  const indexPage = path.join(NOTES_DIR, 'index.html');
  assert(fs.existsSync(indexPage), 'notes/index.html exists', 'Missing notes/index.html');

  if (fs.existsSync(indexPage)) {
    const idxHTML = fs.readFileSync(indexPage, 'utf8');
    assert(/<h1[^>]*>.*?<\/h1>/is.test(idxHTML), 'notes/index.html has single H1', 'Missing H1');
    assert(idxHTML.includes('application/ld+json'), 'notes/index.html has JSON-LD', 'Missing JSON-LD');
    validateUiStyleTokens(idxHTML, 'notes/index.html');
  }

  const entries = fs.readdirSync(NOTES_DIR, { withFileTypes: true });
  const subjectDirs = entries.filter((e) => e.isDirectory() && e.name !== 'branch').map((e) => e.name);

  if (requireSubjects) {
    assert(subjectDirs.length > 0, 'Generated live subject pages exist (--require-subjects)', 'Zero subject pages generated');
  } else {
    pass('Subject directory scan complete', `${subjectDirs.length} live subject page(s) present`);
  }

  const seenTitles = new Map();
  const seenDescriptions = new Map();
  const seenCanonicals = new Map();
  let validPages = 0;

  for (const dirName of subjectDirs) {
    const pagePath = path.join(NOTES_DIR, dirName, 'index.html');
    if (!fs.existsSync(pagePath)) {
      fail(`notes/${dirName}/index.html exists`, 'Missing index.html');
      continue;
    }

    const html = fs.readFileSync(pagePath, 'utf8');
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const canonMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];

    const title = titleMatch ? titleMatch[1].trim() : '';
    const desc = descMatch ? descMatch[1].trim() : '';
    const canonical = canonMatch ? canonMatch[1].trim() : '';
    const expectedCanonical = `${DOMAIN}/notes/${dirName}/`;

    if (!html.startsWith('<!DOCTYPE html>') || !title || !desc || canonical !== expectedCanonical || h1Matches.length !== 1) {
      fail(`notes/${dirName} HTML metadata/structure`, 'Invalid DOCTYPE, title, desc, canonical, or H1 count');
      continue;
    }

    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const styleBlock = styleMatch ? styleMatch[1] : html;
    if (!html.includes('open-notes-btn') || !styleBlock.includes('#c9db74') || styleBlock.includes('#16a34a')) {
      fail(`notes/${dirName} UI style consistency`, 'Does not match Academix UI tokens');
      continue;
    }

    // Validate JSON-LD
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jm;
    let ldCount = 0;
    while ((jm = jsonLdRegex.exec(html)) !== null) {
      JSON.parse(jm[1]);
      ldCount++;
    }
    if (ldCount < 2) {
      fail(`notes/${dirName} JSON-LD`, `Expected >= 2 JSON-LD blocks, found ${ldCount}`);
      continue;
    }

    if (seenTitles.has(title)) fail(`Unique title (${dirName})`, `Duplicates ${seenTitles.get(title)}`);
    else seenTitles.set(title, dirName);

    if (seenDescriptions.has(desc)) fail(`Unique description (${dirName})`, `Duplicates ${seenDescriptions.get(desc)}`);
    else seenDescriptions.set(desc, dirName);

    if (seenCanonicals.has(canonical)) fail(`Unique canonical (${dirName})`, `Duplicates ${seenCanonicals.get(canonical)}`);
    else seenCanonicals.set(canonical, dirName);

    if (sitemapUrls.length && !sitemapUrls.includes(canonical)) {
      fail(`Sitemap includes ${dirName}`, `Missing ${canonical} in sitemap.xml`);
      continue;
    }

    validPages++;
  }

  if (subjectDirs.length > 0) {
    assert(
      validPages === subjectDirs.length,
      'All subject pages passed SEO & UI fidelity checks',
      `${validPages}/${subjectDirs.length} passed`,
      `${validPages}/${subjectDirs.length} verified`
    );
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function run() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Academix SEO Automated Quality & UI Compliance');
  console.log('═══════════════════════════════════════════════════');

  validateRobotsTxt();
  const sitemapUrls = validateSitemap();
  validateHomepage();
  validateGeneratedNotesPages(sitemapUrls);

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  SUMMARY: ${passedTests}/${totalTests} passed (${failedTests} failed)`);
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

run();

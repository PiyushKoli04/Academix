/**
 * Academix SEO Validation & Verification Suite
 *
 * Runs automated tests across:
 *   1. robots.txt structure & rules
 *   2. sitemap.xml validity, namespaces, URLs, dates
 *   3. index.html permanent page SEO metadata & structured data
 *   4. Generated static notes pages (notes/index.html and notes/ * /index.html)
 *   5. Cross-page uniqueness (titles, descriptions, canonicals)
 *
 * Usage:
 *   node seo/validate.js
 * Exits with 0 on all tests passing, 1 on any failure.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const NOTES_DIR = path.join(ROOT_DIR, 'notes');
const DOMAIN = 'https://academix.syntaxsyndicate.co.in';

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
  if (condition) {
    pass(testName, successDetail);
  } else {
    fail(testName, failureReason);
  }
}

// ---------------------------------------------------------------------------
// 1. Robots.txt Validation
// ---------------------------------------------------------------------------

function validateRobotsTxt() {
  console.log('\n--- 1. Validating robots.txt ---');
  const filePath = path.join(ROOT_DIR, 'robots.txt');

  assert(fs.existsSync(filePath), 'robots.txt exists', 'File not found at repository root');
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');

  assert(content.includes('User-agent: *'), 'robots.txt specifies User-agent: *', 'Missing User-agent directive');
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
  const filePath = path.join(ROOT_DIR, 'sitemap.xml');

  assert(fs.existsSync(filePath), 'sitemap.xml exists', 'File not found at repository root');
  if (!fs.existsSync(filePath)) return [];

  const xml = fs.readFileSync(filePath, 'utf8');

  assert(xml.startsWith('<?xml'), 'sitemap.xml has XML declaration', 'Missing <?xml declaration');
  assert(xml.includes('<urlset'), 'sitemap.xml has <urlset> root element', 'Missing <urlset>');
  assert(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), 'sitemap.xml has standard sitemap namespace', 'Missing or invalid xmlns');

  // Extract all <loc> URLs
  const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/g;
  const lastmodRegex = /<lastmod>([^<]+)<\/lastmod>/g;

  const urls = [];
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    urls.push(match[1]);
  }

  assert(urls.length >= 2, `sitemap.xml contains URLs`, `Found ${urls.length} URLs, expected at least 2`, `${urls.length} URLs found`);

  // Check homepage is first
  assert(urls.includes(`${DOMAIN}/`), 'sitemap.xml includes production homepage URL', 'Missing homepage URL');
  assert(urls.includes(`${DOMAIN}/notes/`), 'sitemap.xml includes notes index URL', 'Missing notes index URL');

  // Verify all URLs use correct production domain
  const nonProduction = urls.filter((u) => !u.startsWith(DOMAIN));
  assert(nonProduction.length === 0, 'All sitemap URLs match production domain', `Found non-production URLs: ${nonProduction.join(', ')}`);

  // Verify no duplicate URLs
  const uniqueUrls = new Set(urls);
  assert(uniqueUrls.size === urls.length, 'No duplicate URLs in sitemap.xml', `Found ${urls.length - uniqueUrls.size} duplicate URL(s)`);

  // Verify dates
  const dates = [];
  while ((match = lastmodRegex.exec(xml)) !== null) {
    dates.push(match[1]);
  }
  const invalidDates = dates.filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
  assert(invalidDates.length === 0, 'All <lastmod> entries use ISO YYYY-MM-DD format', `Invalid dates: ${invalidDates.join(', ')}`);

  return urls;
}

// ---------------------------------------------------------------------------
// 3. Homepage (index.html) Validation
// ---------------------------------------------------------------------------

function validateHomepage() {
  console.log('\n--- 3. Validating index.html Permanent Page SEO ---');
  const filePath = path.join(ROOT_DIR, 'index.html');

  assert(fs.existsSync(filePath), 'index.html exists', 'File not found at repository root');
  if (!fs.existsSync(filePath)) return;

  const html = fs.readFileSync(filePath, 'utf8');

  assert(html.includes('<!DOCTYPE html>'), 'index.html has valid DOCTYPE', 'Missing DOCTYPE');
  assert(/<html[^>]*lang=["']en["']/i.test(html), 'index.html specifies lang="en"', 'Missing lang attribute on <html>');
  assert(/<title>[^<]+<\/title>/i.test(html), 'index.html has title tag', 'Missing or empty <title>');
  assert(
    /<meta[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i.test(html),
    'index.html has meta description',
    'Missing meta description'
  );
  assert(
    html.includes(`<link rel="canonical" href="${DOMAIN}/" />`) ||
    html.includes(`<link rel="canonical" href="${DOMAIN}/">`),
    'index.html has correct canonical URL pointing to production root',
    'Missing or incorrect canonical URL'
  );
  assert(html.includes('og:title') && html.includes('og:description'), 'index.html has Open Graph tags', 'Missing og tags');
  assert(html.includes('twitter:card'), 'index.html has Twitter Card tags', 'Missing twitter:card');
  assert(html.includes('application/ld+json'), 'index.html has JSON-LD structured data', 'Missing JSON-LD script tag');
  assert(html.includes('<noscript>'), 'index.html has crawlable <noscript> fallback content', 'Missing noscript block');
  assert(html.includes('href="./notes/"') || html.includes('href="/notes/"'), 'index.html has crawlable link to notes catalog', 'Missing link to notes catalog');
}

// ---------------------------------------------------------------------------
// 4. Generated Subject Pages Validation
// ---------------------------------------------------------------------------

function validateSubjectPages(sitemapUrls) {
  console.log('\n--- 4. Validating Generated Static Notes Pages ---');

  assert(fs.existsSync(NOTES_DIR), 'notes directory exists', `Directory not found: ${NOTES_DIR}`);
  if (!fs.existsSync(NOTES_DIR)) return;

  const indexPage = path.join(NOTES_DIR, 'index.html');
  assert(fs.existsSync(indexPage), 'notes/index.html catalog page exists', 'Missing notes/index.html');

  if (fs.existsSync(indexPage)) {
    const idxHTML = fs.readFileSync(indexPage, 'utf8');
    assert(/<h1[^>]*>.*?<\/h1>/is.test(idxHTML), 'notes/index.html has an <h1> heading', 'Missing H1 in notes/index.html');
    assert(idxHTML.includes('application/ld+json'), 'notes/index.html has JSON-LD structured data', 'Missing JSON-LD in index');
  }

  // Scan all subdirectories in notes/
  const entries = fs.readdirSync(NOTES_DIR, { withFileTypes: true });
  const subjectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  assert(subjectDirs.length >= 10, 'Generated substantial set of academic subject pages', `Found ${subjectDirs.length} subject pages, expected >= 10`, `${subjectDirs.length} subject pages found`);

  const seenTitles = new Map();
  const seenDescriptions = new Map();
  const seenCanonicals = new Map();

  let validPagesCount = 0;

  for (const dirName of subjectDirs) {
    const pagePath = path.join(NOTES_DIR, dirName, 'index.html');
    if (!fs.existsSync(pagePath)) {
      fail(`notes/${dirName}/index.html exists`, 'Missing index.html in subject folder');
      continue;
    }

    const html = fs.readFileSync(pagePath, 'utf8');

    // Basic structure checks
    const hasDoctype = html.startsWith('<!DOCTYPE html>');
    const hasLang = /<html[^>]*lang=["']en["']/i.test(html);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const canonMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];

    const title = titleMatch ? titleMatch[1].trim() : '';
    const desc = descMatch ? descMatch[1].trim() : '';
    const canonical = canonMatch ? canonMatch[1].trim() : '';
    const expectedCanonical = `${DOMAIN}/notes/${dirName}/`;

    if (!hasDoctype || !hasLang) {
      fail(`notes/${dirName}`, 'Invalid DOCTYPE or missing lang attribute');
      continue;
    }

    if (!title || title.length < 10) {
      fail(`notes/${dirName} title`, `Title too short or missing: "${title}"`);
      continue;
    }

    if (!desc || desc.length < 30) {
      fail(`notes/${dirName} description`, `Description too short or missing: "${desc}"`);
      continue;
    }

    if (canonical !== expectedCanonical) {
      fail(`notes/${dirName} canonical`, `Expected ${expectedCanonical}, got ${canonical}`);
      continue;
    }

    if (h1Matches.length !== 1) {
      fail(`notes/${dirName} H1 count`, `Expected exactly 1 H1, found ${h1Matches.length}`);
      continue;
    }

    // Check JSON-LD
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    let validJsonLdCount = 0;
    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        JSON.parse(jsonLdMatch[1]);
        validJsonLdCount++;
      } catch (err) {
        fail(`notes/${dirName} JSON-LD parsing`, err.message);
      }
    }

    if (validJsonLdCount < 2) {
      fail(`notes/${dirName} structured data`, `Expected at least 2 valid JSON-LD schemas (WebPage + BreadcrumbList), found ${validJsonLdCount}`);
      continue;
    }

    // Uniqueness tracking
    if (seenTitles.has(title)) {
      fail(`Title uniqueness for ${dirName}`, `Duplicate title with ${seenTitles.get(title)}`);
    } else {
      seenTitles.set(title, dirName);
    }

    if (seenDescriptions.has(desc)) {
      fail(`Description uniqueness for ${dirName}`, `Duplicate description with ${seenDescriptions.get(desc)}`);
    } else {
      seenDescriptions.set(desc, dirName);
    }

    if (seenCanonicals.has(canonical)) {
      fail(`Canonical uniqueness for ${dirName}`, `Duplicate canonical URL with ${seenCanonicals.get(canonical)}`);
    } else {
      seenCanonicals.set(canonical, dirName);
    }

    // Check sitemap contains this URL
    if (sitemapUrls && sitemapUrls.length > 0) {
      if (!sitemapUrls.includes(canonical)) {
        fail(`Sitemap inclusion for ${dirName}`, `URL ${canonical} is not in sitemap.xml`);
      }
    }

    validPagesCount++;
  }

  assert(
    validPagesCount === subjectDirs.length,
    'All generated subject pages passed strict SEO audits',
    `${validPagesCount}/${subjectDirs.length} passed`,
    `${validPagesCount}/${subjectDirs.length} pages verified`
  );
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------

function run() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Academix SEO Automated Quality & Compliance Tests');
  console.log('═══════════════════════════════════════════════════');

  validateRobotsTxt();
  const sitemapUrls = validateSitemap();
  validateHomepage();
  validateSubjectPages(sitemapUrls);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Total Checks: ${totalTests}`);
  console.log(`  Passed:       ${passedTests}`);
  console.log(`  Failed:       ${failedTests}`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failedTests > 0) {
    console.error('✖ SEO Validation Failed. Please fix the above errors.');
    process.exit(1);
  } else {
    console.log('✔ All SEO quality and structural audits passed perfectly!');
    process.exit(0);
  }
}

run();


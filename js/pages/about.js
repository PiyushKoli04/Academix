import { state } from "../state.js";
import {
  avatarHTML,
  emptyStateHTML,
  escapeHtml,
  icon,
  safeHttpUrl,
  setPageMeta,
} from "../ui.js";

function contributorTileHTML(person, index) {
  const link = safeHttpUrl(person.link);
  const tag = link ? "a" : "div";
  const attrs = link
    ? `href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer"`
    : "";
  return `<${tag} class="contributor-tile ${index < 3 ? "contributor-tile--top" : ""}" ${attrs}>
    ${index < 3 ? `<span class="contributor-tile__rank">TOP ${index + 1}</span>` : ""}
    ${avatarHTML(person, { size: index < 3 ? "lg" : "md" })}
    <span class="contributor-tile__copy">
      <span class="contributor-tile__name">${escapeHtml(person.name || "Contributor")}</span>
      <span class="contributor-tile__role">${escapeHtml(person.role || "Notes contributor")}</span>
      <span class="contributor-tile__meta">${icon("file-text", "icon--xs")} ${Number(person.uploadsCount) || 0} ${Number(person.uploadsCount) === 1 ? "contribution" : "contributions"}</span>
    </span>
    ${link ? `<span class="contributor-tile__link">${icon("arrow-up-right")}</span>` : ""}
  </${tag}>`;
}

export function renderAbout(root) {
  const settings = state.settings || {};
  const aboutText = String(settings.aboutText || "").trim()
    || "Academix keeps every semester subject, the one main PDF you actually need, and the helping documents around it in one calm, view-only library. No noisy feeds. No download maze. Just the notes you came for.";
  const contactEmail = String(settings.contactEmail || "").trim();
  const version = settings.version || "1.0.0";
  const contributors = Array.isArray(state.contributors) ? state.contributors : [];

  setPageMeta("About", "How Academix works, who made it, and how to get in touch.");

  root.innerHTML = `<div class="page page--compact">
    <div class="about-shell">
      <header class="about-hero">
        <span class="about-hero__eyebrow">${icon("sparkles", "icon--sm")} About Academix</span>
        <h1 class="about-hero__title">Notes that feel<br /><strong>lighter.</strong></h1>
        <p class="about-hero__text">${escapeHtml(aboutText).replace(/\n/g, "<br />")}</p>
        <span class="about-version">${icon("layers", "icon--xs")} Version ${escapeHtml(version)}</span>
      </header>

      <div class="about-grid">
        <section class="about-card about-card--wide">
          <h2 class="about-card__title"><span class="about-card__title-icon">${icon("play")}</span> How it works</h2>
          <div class="about-steps">
            <div class="about-step">
              <span class="about-step__n">1</span>
              <div><p class="about-step__title">Pick your semester</p><p class="about-step__text">Choose your year, semester, and branch. Academix remembers it for your next visit.</p></div>
            </div>
            <div class="about-step">
              <span class="about-step__n">2</span>
              <div><p class="about-step__title">Open the main notes</p><p class="about-step__text">Every subject puts the main PDF first. PYQs, formula sheets, and the syllabus sit right beside it.</p></div>
            </div>
            <div class="about-step">
              <span class="about-step__n">3</span>
              <div><p class="about-step__title">Make it yours</p><p class="about-step__text">Bookmark subjects and documents, tick off modules, and pick up exactly where you left off.</p></div>
            </div>
          </div>
        </section>

        <section class="about-card">
          <h2 class="about-card__title"><span class="about-card__title-icon">${icon("shield-check")}</span> View-only by design</h2>
          <p class="about-card__text">Academix is a study library, not a file locker. Documents open in a protected reader with downloads and printing disabled, so the people who shared their work keep control of it.</p>
        </section>

        <section class="about-card about-card--tint">
          <h2 class="about-card__title"><span class="about-card__title-icon">${icon("database")}</span> Where notes live</h2>
          <p class="about-card__text">PDFs stay in the contributor’s Google Drive. Academix stores only the details needed to show them here: subject, type, and a view-only preview link. Your bookmarks and progress are saved privately to your account.</p>
        </section>

        <section class="about-card">
          <h2 class="about-card__title"><span class="about-card__title-icon">${icon("message-circle")}</span> Need help?</h2>
          <p class="about-card__text">A document not opening, or a subject missing a PDF? Tell your Academix admin and they can fix it from the dashboard.</p>
          ${contactEmail ? `<a class="about-contact-row" href="mailto:${escapeHtml(contactEmail)}">
            ${icon("mail")}
            <span class="about-contact-row__copy"><span class="about-contact-row__label">Contact</span><span class="about-contact-row__value">${escapeHtml(contactEmail)}</span></span>
            ${icon("arrow-up-right", "icon--sm")}
          </a>` : ""}
        </section>

        <section class="about-card about-card--tint">
          <h2 class="about-card__title"><span class="about-card__title-icon">${icon("info")}</span> A note on ads</h2>
          <p class="about-card__text">Academix may show clearly labelled sponsor cards to help keep the library running. They are always separated from study content, and you can dismiss them. Ads never affect which notes you see.</p>
        </section>
      </div>

      <div class="credits-heading">
        <h2><span class="fw-light">The people</span> <strong>behind the notes.</strong></h2>
        <p class="credits-heading__meta">${contributors.length} ${contributors.length === 1 ? "contributor" : "contributors"}<br />Thank you for sharing.</p>
      </div>

      ${contributors.length ? `
        ${contributors.length > 3 ? `<div class="top-contributors">${contributors.slice(0, 3).map((person, index) => contributorTileHTML(person, index)).join("")}</div>` : `<div class="top-contributors">${contributors.map((person, index) => contributorTileHTML(person, index)).join("")}</div>`}
        ${contributors.length > 3 ? `<div class="credits-list">${contributors.slice(3).map((person, index) => contributorTileHTML(person, index + 3)).join("")}</div>` : ""}
      ` : `<div class="credit-empty">${emptyStateHTML({
        small: true,
        icon: "users",
        title: "Contributors are being added",
        text: "Credits will appear here as notes are shared with the library.",
      })}</div>`}

      <p class="about-disclaimer" style="margin-top:22px;text-align:center">Academix is built for personal study. Please respect your college’s academic policies and the contributors who shared their notes.</p>
    </div>
  </div>`;

  return () => {};
}

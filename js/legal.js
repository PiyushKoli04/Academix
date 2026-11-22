import { escapeHtml, icon, openSheet } from "./ui.js";

export const TERMS_AND_CONDITIONS_HTML = `
  <div class="legal-doc">
    <div class="legal-badge">${icon("shield-check", "icon--xs")} <span>Effective Date: November 2026</span></div>
    
    <section class="legal-section">
      <h3 class="legal-section__title">1. Introduction & Acceptance</h3>
      <p>Welcome to <strong>Academix</strong>. By accessing, browsing, or creating an account on Academix, you agree to be legally bound by these Terms and Conditions and our Privacy Policy. If you do not agree to all terms stated herein, you must immediately discontinue use of the application.</p>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">2. Purpose & Academic Study License</h3>
      <p>Academix is created exclusively as an educational study platform for students and educators. All notes, blueprints, formula sheets, previous year questions (PYQs), and module materials accessible through the platform are provided under a limited, personal, non-transferable, non-exclusive license strictly for non-commercial academic study.</p>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">3. View-Only Reader & Document Protection</h3>
      <p>Academix utilizes a view-only document viewer. This reader is engineered to protect contributor ownership and respect original authors. You expressly agree not to:</p>
      <ul class="legal-list">
        <li>Attempt to download, scrape, print, copy, capture, or extract files through automated scripts or developer tools.</li>
        <li>Bypass, disable, or tamper with security, DRM, or view-only constraints.</li>
        <li>Re-host, republish, sell, rent, distribute, or license any study material obtained from Academix.</li>
      </ul>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">4. Contributor Ownership & Intellectual Property</h3>
      <p>All study notes and academic files remain the intellectual property of their original contributors, students, and educators. Academix does not claim copyright ownership over user-contributed content. Contributor credits are maintained in the Contributors and Document views. If you believe any document infringes upon your copyright or institutional policy, please notify an administrator for prompt review.</p>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">5. User Conduct & Accounts</h3>
      <p>When using Academix, you agree to:</p>
      <ul class="legal-list">
        <li>Provide accurate and truthful account information during registration.</li>
        <li>Maintain the confidentiality of your login credentials.</li>
        <li>Respect academic integrity codes and policies established by your educational institution.</li>
        <li>Never use the service to harass others, distribute malware, or compromise server infrastructure.</li>
      </ul>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">6. Disclaimer of Warranties</h3>
      <p>Academix provides study materials on an "as is" and "as available" basis. While contributors strive for high quality, Academix does not guarantee completeness, accuracy, or curriculum alignment with any official university exam. Academix is not liable for academic outcomes, exam scores, or errors in contributed notes.</p>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">7. Modifications to Terms</h3>
      <p>We reserve the right to amend these Terms and Conditions at any time. Continued use of Academix following any updates constitutes acceptance of the modified Terms.</p>
    </section>
  </div>
`;

export const PRIVACY_POLICY_HTML = `
  <div class="legal-doc">
    <div class="legal-badge">${icon("lock", "icon--xs")} <span>Effective Date: November 2026</span></div>

    <section class="legal-section">
      <h3 class="legal-section__title">1. Overview</h3>
      <p>At <strong>Academix</strong>, we respect your privacy. This Privacy Policy transparently outlines the categories of data we collect, why we collect it, how it is secured, and your rights regarding your personal information.</p>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">2. Information We Collect</h3>
      <p>We only collect data strictly necessary to provide a personalized, synchronized study experience:</p>
      <ul class="legal-list">
        <li><strong>Account Data:</strong> Your name, college email address, profile picture (if provided via Google or profile setup), and unique user authentication ID.</li>
        <li><strong>Study Setup:</strong> Your selected academic year, semester, and engineering/college branch so Academix can load your relevant course materials.</li>
        <li><strong>Study Activity:</strong> Your saved bookmarks, checked-off modules, and recently viewed documents so you can resume studying seamlessly across devices.</li>
        <li><strong>Technical Information:</strong> Basic anonymous error logs, Service Worker cache states, and browser device metrics for offline support and performance optimization.</li>
      </ul>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">3. How We Use Your Information</h3>
      <p>Your data is used solely for the following purposes:</p>
      <ul class="legal-list">
        <li>Customizing your dashboard and semester subject library according to your branch.</li>
        <li>Synchronizing your study progress, completed modules, and saved documents.</li>
        <li>Securing your account and distinguishing student accounts from administrators.</li>
        <li><strong>We never sell, rent, monetize, or share your personal data with third-party data brokers or marketing firms.</strong></li>
      </ul>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">4. Document Previews & Third-Party Services</h3>
      <p>Academix uses Google Firebase (Authentication & Cloud Firestore) for secure user sessions and database management. Study document previews link to view-only Google Drive files. Academix does not access, modify, or read your personal Google Drive account.</p>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">5. Data Security & Storage</h3>
      <p>All communications between your device and Academix are encrypted using modern HTTPS/TLS. Database records in Cloud Firestore are protected with stringent role-based security rules ensuring only you can modify your bookmarks and study preferences.</p>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">6. Your Rights & Choices</h3>
      <p>You have full control over your information:</p>
      <ul class="legal-list">
        <li>You can update your branch, year, name, or profile photo at any time from the Profile page.</li>
        <li>You can clear your bookmarks and study history directly within the app.</li>
        <li>You may request complete account deletion by contacting your Academix administrator or via the contact email in the About section.</li>
      </ul>
    </section>

    <section class="legal-section">
      <h3 class="legal-section__title">7. Contact Us</h3>
      <p>If you have any questions, feedback, or concerns regarding this Privacy Policy or your data, please contact us via the contact link in the About section of Academix.</p>
    </section>
  </div>
`;

export function openLegalSheet(type = "terms") {
  const isTerms = type === "terms";
  return openSheet({
    title: isTerms ? "Terms and Conditions" : "Privacy Policy",
    subtitle: isTerms
      ? "Rules and guidelines for personal study on Academix"
      : "How Academix collects, uses, and safeguards your data",
    size: "wide",
    content: isTerms ? TERMS_AND_CONDITIONS_HTML : PRIVACY_POLICY_HTML,
    footer: `<button class="btn btn--primary btn--block" type="button" data-legal-close>${icon("check", "icon--xs")} I understand</button>`,
    onMount(sheet, close) {
      sheet.querySelector("[data-legal-close]")?.addEventListener("click", () => close());
    },
  });
}

export function renderTerms(root) {
  root.innerHTML = `<div class="page page--compact">
    <div class="legal-page-shell">
      <header class="legal-page-head">
        <a class="btn btn--white btn--sm" href="#/home">${icon("arrow-left", "icon--xs")} Back to Home</a>
        <h1 class="legal-page-title">Terms & <strong>Conditions</strong></h1>
        <p class="legal-page-sub">Please review the rules governing personal study and content on Academix.</p>
      </header>
      <div class="legal-card">${TERMS_AND_CONDITIONS_HTML}</div>
    </div>
  </div>`;
  return () => {};
}

export function renderPrivacy(root) {
  root.innerHTML = `<div class="page page--compact">
    <div class="legal-page-shell">
      <header class="legal-page-head">
        <a class="btn btn--white btn--sm" href="#/home">${icon("arrow-left", "icon--xs")} Back to Home</a>
        <h1 class="legal-page-title">Privacy <strong>Policy</strong></h1>
        <p class="legal-page-sub">How Academix respects, manages, and secures your personal and study data.</p>
      </header>
      <div class="legal-card">${PRIVACY_POLICY_HTML}</div>
    </div>
  </div>`;
  return () => {};
}


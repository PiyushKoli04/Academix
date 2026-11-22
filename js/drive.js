const DRIVE_ID_PATTERN = /^[a-zA-Z0-9_-]{10,}$/;

export function isValidDriveId(value) {
  return typeof value === "string" && DRIVE_ID_PATTERN.test(value.trim());
}

/**
 * Extracts a Drive file ID from the common share-link formats. Folder links are
 * deliberately rejected because the platform stores individual documents only.
 */
export function extractDriveId(input) {
  if (!input || typeof input !== "string") return "";

  const value = input.trim();
  if (isValidDriveId(value)) return value;

  const folderPatterns = [
    /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//i,
    /drive\.google\.com\/drive\/mobile\/folders\//i,
  ];
  if (folderPatterns.some((pattern) => pattern.test(value))) return "";

  const filePatterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i,
    /docs\.google\.com\/[^/]+\/d\/([a-zA-Z0-9_-]+)/i,
    /drive\.google\.com\/(?:open|uc|thumbnail)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i,
    /[?&]id=([a-zA-Z0-9_-]{10,})(?:[&#]|$)/i,
  ];

  for (const pattern of filePatterns) {
    const match = value.match(pattern);
    if (match?.[1] && isValidDriveId(match[1])) {
      return match[1];
    }
  }

  return "";
}

export function getPreviewUrl(fileId) {
  if (!isValidDriveId(fileId)) return "";
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

/**
 * Used only by the admin-side accessibility check. The returned URL is never
 * inserted into student-facing UI.
 */
export function getThumbnailUrl(fileId) {
  if (!isValidDriveId(fileId)) return "";
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`;
}

/**
 * Best-effort public-access check. Google Drive does not expose a reliable
 * cross-origin HEAD check without an API key, so this tests whether Drive can
 * render a thumbnail for the file. A warning is advisory, not definitive.
 */
export function checkDriveLinkAccessible(fileId, timeoutMs = 9000) {
  return new Promise((resolve) => {
    if (!isValidDriveId(fileId)) {
      resolve({
        status: "error",
        message: "That does not look like a valid Google Drive file link or file ID.",
      });
      return;
    }

    let settled = false;
    const image = new Image();
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      image.src = "";
      resolve({
        status: "warning",
        message: "Could not confirm access in time. Check that link sharing is set to “Anyone with the link”.",
      });
    }, timeoutMs);

    image.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve({
        status: "ok",
        message: "Drive responded with a preview thumbnail. Public access looks good.",
      });
    };

    image.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve({
        status: "warning",
        message: "Drive could not render this file. It may be private, still processing, or not a PDF. Double-check sharing.",
      });
    };

    image.src = getThumbnailUrl(fileId);
  });
}

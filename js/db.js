import { db } from "./firebase.js";
import {
  FieldPath,
  addDoc,
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { isValidDriveId } from "./drive.js";
import { triggerSeoBuild } from "./services/seoTrigger.js";

const CACHE_TTL = 60_000;
const LONG_CACHE_TTL = 5 * 60_000;
const cache = new Map();

function cacheKey(prefix, value) {
  return `${prefix}:${JSON.stringify(value ?? null)}`;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value, ttl = CACHE_TTL) {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
}

async function cached(key, ttl, loader) {
  const hit = readCache(key);
  if (hit) return hit;
  const value = await loader();
  return writeCache(key, value, ttl);
}

export function invalidateCache(prefix = "") {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${prefix}:`)) cache.delete(key);
  }
}

function invalidateCatalog() {
  ["years", "branches", "subjects", "documents", "activity", "dashboard", "search", "contributors", "ads"].forEach(invalidateCache);
}

function cleanString(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanTags(tags) {
  return Array.isArray(tags)
    ? [...new Set(tags.map((tag) => cleanString(tag, 40)).filter(Boolean))].slice(0, 20)
    : [];
}

function cleanModules(modules) {
  if (!Array.isArray(modules)) return [];
  return modules
    .map((module, index) => ({
      name: cleanString(module?.name || module, 140),
      order: Number.isFinite(Number(module?.order)) ? Number(module.order) : index,
    }))
    .filter((module) => module.name)
    .slice(0, 40)
    .map((module, index) => ({ ...module, order: index }));
}

function mapSnapshot(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function sortSubjects(subjects) {
  return [...subjects].sort((a, b) => {
    const orderA = Number(a.order) || 0;
    const orderB = Number(b.order) || 0;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function sortDocuments(documents) {
  return [...documents].sort((a, b) => {
    if (Boolean(b.isMain) !== Boolean(a.isMain)) return b.isMain ? 1 : -1;
    const dateA = a.updatedAt?.toDate?.()?.getTime?.() || a.createdAt?.toDate?.()?.getTime?.() || 0;
    const dateB = b.updatedAt?.toDate?.()?.getTime?.() || b.createdAt?.toDate?.()?.getTime?.() || 0;
    return dateB - dateA;
  });
}

export async function fetchYears() {
  return cached(cacheKey("years", "all"), LONG_CACHE_TTL, async () => {
    const snapshot = await getDocs(query(collection(db, "years"), orderBy("order", "asc")));
    return mapSnapshot(snapshot).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  });
}

export async function fetchBranches() {
  return cached(cacheKey("branches", "all"), LONG_CACHE_TTL, async () => {
    const snapshot = await getDocs(query(collection(db, "branches"), orderBy("order", "asc")));
    return mapSnapshot(snapshot).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  });
}

export async function fetchContributors() {
  return cached(cacheKey("contributors", "all"), CACHE_TTL, async () => {
    const snapshot = await getDocs(query(collection(db, "contributors"), orderBy("order", "asc")));
    return mapSnapshot(snapshot).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  });
}

export async function fetchSettings() {
  return cached(cacheKey("settings", "app"), 30_000, async () => {
    const snapshot = await getDoc(doc(db, "settings", "app"));
    const defaults = {
      adsEnabled: false,
      appName: "Academix",
      aboutText: "",
      contactEmail: "",
      version: "1.0.0",
      announcement: "",
      driveUploaderEmail: "",
      driveFolders: {},
    };
    return snapshot.exists() ? { ...defaults, ...snapshot.data() } : defaults;
  });
}

export function subscribeSettings(callback, onError) {
  return onSnapshot(
    doc(db, "settings", "app"),
    (snapshot) => {
      const defaults = {
        adsEnabled: false,
        appName: "Academix",
        aboutText: "",
        contactEmail: "",
        version: "1.0.0",
        announcement: "",
        driveUploaderEmail: "",
        driveFolders: {},
      };
      const settings = snapshot.exists() ? { ...defaults, ...snapshot.data() } : defaults;
      writeCache(cacheKey("settings", "app"), settings, 30_000);
      callback(settings);
    },
    onError,
  );
}

export async function saveSettings(patch) {
  const payload = {};
  if (typeof patch.adsEnabled === "boolean") payload.adsEnabled = patch.adsEnabled;
  if (typeof patch.announcement === "string") payload.announcement = cleanString(patch.announcement, 1000);
  if (typeof patch.aboutText === "string") payload.aboutText = cleanString(patch.aboutText, 5000);
  if (typeof patch.contactEmail === "string") payload.contactEmail = cleanString(patch.contactEmail, 200);
  if (typeof patch.version === "string") payload.version = cleanString(patch.version, 30);
  if (typeof patch.appName === "string") payload.appName = cleanString(patch.appName, 80);
  if (typeof patch.driveUploaderEmail === "string") payload.driveUploaderEmail = cleanString(patch.driveUploaderEmail, 200);
  if (patch.driveFolders && typeof patch.driveFolders === "object" && !Array.isArray(patch.driveFolders)) {
    const folders = {};
    Object.entries(patch.driveFolders).slice(0, 100).forEach(([key, value]) => {
      const cleanKey = cleanString(key, 240);
      const cleanValue = cleanString(value, 240);
      if (cleanKey && cleanValue) folders[cleanKey] = cleanValue;
    });
    payload.driveFolders = folders;
  }
  if (!Object.keys(payload).length) return;
  if (patch.replaceDriveFolders) {
    try {
      await updateDoc(doc(db, "settings", "app"), payload);
    } catch (error) {
      if (error?.code === "not-found") {
        await setDoc(doc(db, "settings", "app"), payload, { merge: true });
      } else {
        throw error;
      }
    }
  } else {
    await setDoc(doc(db, "settings", "app"), payload, { merge: true });
  }
  invalidateCache("settings");
}

export async function fetchSubject(subjectId, force = false) {
  if (!subjectId) return null;
  const key = cacheKey("subjects", subjectId);
  if (!force) {
    const hit = readCache(key);
    if (hit) return hit;
  }
  const snapshot = await getDoc(doc(db, "subjects", subjectId));
  if (!snapshot.exists()) return null;
  return writeCache(key, { id: snapshot.id, ...snapshot.data() });
}

export async function fetchSubjectsFor(yearId, semester) {
  return cached(cacheKey("subjects", { yearId, semester: Number(semester) }), CACHE_TTL, async () => {
    try {
      const snapshot = await getDocs(
        query(
          collection(db, "subjects"),
          where("yearId", "==", yearId),
          where("semester", "==", Number(semester)),
        ),
      );
      return sortSubjects(mapSnapshot(snapshot));
    } catch (error) {
      console.warn("fetchSubjectsFor compound query failed, falling back to yearId:", error);
      try {
        const fallback = await getDocs(
          query(collection(db, "subjects"), where("yearId", "==", yearId)),
        );
        const filtered = mapSnapshot(fallback).filter((s) => Number(s.semester) === Number(semester));
        return sortSubjects(filtered);
      } catch (fallbackError) {
        console.warn("fetchSubjectsFor fallback also failed:", fallbackError);
        return [];
      }
    }
  });
}

export async function fetchAllSubjects() {
  return cached(cacheKey("subjects", "all"), CACHE_TTL, async () => {
    const snapshot = await getDocs(query(collection(db, "subjects"), limit(500)));
    return sortSubjects(mapSnapshot(snapshot));
  });
}

export async function fetchDocumentsForSubject(subjectId) {
  return cached(cacheKey("documents", { subjectId }), CACHE_TTL, async () => {
    try {
      const snapshot = await getDocs(
        query(
          collection(db, "documents"),
          where("subjectId", "==", subjectId),
        ),
      );
      return sortDocuments(mapSnapshot(snapshot));
    } catch (error) {
      console.warn("fetchDocumentsForSubject failed:", error);
      return [];
    }
  });
}

export async function fetchDocumentsForSubjects(subjectIds = []) {
  const ids = [...new Set(subjectIds.filter(Boolean))].sort();
  if (!ids.length) return [];
  return cached(cacheKey("documents", { ids }), CACHE_TTL, async () => {
    const documents = [];
    for (let index = 0; index < ids.length; index += 30) {
      const chunk = ids.slice(index, index + 30);
      const snapshot = await getDocs(
        query(collection(db, "documents"), where("subjectId", "in", chunk)),
      );
      documents.push(...mapSnapshot(snapshot));
    }
    return sortDocuments(documents);
  });
}

export async function fetchDocument(docId) {
  if (!docId) return null;
  return cached(cacheKey("documents", { docId }), CACHE_TTL, async () => {
    const snapshot = await getDoc(doc(db, "documents", docId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  });
}

export async function fetchAllDocuments(limitCount = 300) {
  return cached(cacheKey("documents", { all: limitCount }), 45_000, async () => {
    const snapshot = await getDocs(
      query(collection(db, "documents"), orderBy("updatedAt", "desc"), limit(limitCount)),
    );
    return sortDocuments(mapSnapshot(snapshot));
  });
}

export async function fetchSubjectsByIds(ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const results = [];
  for (const id of unique) {
    try {
      const subject = await fetchSubject(id);
      if (subject) results.push(subject);
    } catch {
      // A deleted bookmark should not break the whole list.
    }
  }
  return results;
}

export async function fetchDocumentsByIds(ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const results = [];
  for (const id of unique) {
    try {
      const document = await fetchDocument(id);
      if (document) results.push(document);
    } catch {
      // Ignore deleted documents in bookmark lists.
    }
  }
  return results;
}

export async function fetchActivityForSubject(subjectId) {
  return cached(cacheKey("activity", { subjectId }), 30_000, async () => {
    try {
      const snapshot = await getDocs(
        query(
          collection(db, "activity"),
          where("subjectId", "==", subjectId),
        ),
      );
      return mapSnapshot(snapshot)
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.()?.getTime?.() || 0;
          const dateB = b.createdAt?.toDate?.()?.getTime?.() || 0;
          return dateB - dateA;
        })
        .slice(0, 30);
    } catch {
      return [];
    }
  });
}

export async function fetchActiveAds() {
  return cached(cacheKey("ads", "active"), 30_000, async () => {
    try {
      const snapshot = await getDocs(
        query(collection(db, "ads"), where("active", "==", true)),
      );
      const now = Date.now();
      return mapSnapshot(snapshot)
        .filter((ad) => {
          const starts = ad.startDate?.toDate?.()?.getTime?.() || (ad.startDate ? new Date(ad.startDate).getTime() : 0);
          const ends = ad.endDate?.toDate?.()?.getTime?.() || (ad.endDate ? new Date(ad.endDate).getTime() : 0);
          if (starts && starts > now) return false;
          if (ends) {
            const endOfDay = new Date(ends);
            endOfDay.setHours(23, 59, 59, 999);
            if (endOfDay.getTime() < now) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.()?.getTime?.() || 0;
          const dateB = b.createdAt?.toDate?.()?.getTime?.() || 0;
          return dateB - dateA;
        });
    } catch {
      return [];
    }
  });
}

export async function fetchAllAds() {
  return cached(cacheKey("ads", "all"), 30_000, async () => {
    const snapshot = await getDocs(query(collection(db, "ads"), orderBy("createdAt", "desc")));
    return mapSnapshot(snapshot);
  });
}

export function adsForPlacement(ads, placement) {
  return ads.filter((ad) => ad.active && ad.placement === placement);
}

export async function recordAdImpression(adId) {
  if (!adId) return;
  try {
    await updateDoc(doc(db, "ads", adId), { impressions: increment(1) });
  } catch {
    // Analytics must never interrupt content.
  }
}

export async function recordAdClick(adId) {
  if (!adId) return;
  try {
    await updateDoc(doc(db, "ads", adId), { clicks: increment(1) });
  } catch {
    // Analytics must never interrupt navigation.
  }
}

export async function recordSubjectView(subjectId) {
  if (!subjectId) return;
  try {
    await updateDoc(doc(db, "subjects", subjectId), { viewCount: increment(1) });
    invalidateCache("subjects");
  } catch {
    // Viewing must still work if analytics is unavailable.
  }
}

export async function recordRecentlyViewed(uid, entry) {
  if (!uid || !entry?.subjectId) return;
  const ref = doc(db, "users", uid);
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return;
        const current = Array.isArray(snapshot.data().recentlyViewed) ? snapshot.data().recentlyViewed : [];
        const nextEntry = {
          subjectId: entry.subjectId,
          docId: entry.docId || "",
          title: cleanString(entry.title, 180),
          type: entry.type || "",
          viewedAt: new Date(),
        };
        const filtered = current.filter((item) => {
          if (String(item?.subjectId || "") !== nextEntry.subjectId) return true;
          return String(item?.docId || "") !== nextEntry.docId;
        });
        transaction.update(ref, { recentlyViewed: [nextEntry, ...filtered].slice(0, 12) });
      });
      return;
    } catch (error) {
      if (error?.code === "failed-precondition" && attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 * Math.pow(2, attempt)));
        continue;
      }
      if (error?.code !== "failed-precondition") throw error;
    }
  }
}

export async function toggleBookmark(uid, bookmarkKey) {
  if (!uid || !bookmarkKey) return false;
  const ref = doc(db, "users", uid);
  let nowBookmarked = false;
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error("Your profile could not be found.");
        const bookmarks = Array.isArray(snapshot.data().bookmarks) ? snapshot.data().bookmarks : [];
        const exists = bookmarks.includes(bookmarkKey);
        nowBookmarked = !exists;
        transaction.update(ref, {
          bookmarks: exists ? bookmarks.filter((item) => item !== bookmarkKey) : [...bookmarks, bookmarkKey].slice(0, 200),
        });
      });
      return nowBookmarked;
    } catch (error) {
      if (error?.code === "failed-precondition" && attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 * Math.pow(2, attempt)));
        continue;
      }
      if (error?.code !== "failed-precondition") throw error;
    }
  }
  return nowBookmarked;
}

export async function setCompletedModules(uid, subjectId, moduleIndexes) {
  if (!uid || !subjectId) return;
  const values = [...new Set(moduleIndexes.map(Number).filter((value) => Number.isInteger(value) && value >= 0))].sort((a, b) => a - b);
  await updateDoc(doc(db, "users", uid), new FieldPath("completedModules", subjectId), values);
}

export async function saveYear(yearId, data) {
  const semesters = [...new Set((data.semesters || []).map(Number).filter((value) => Number.isInteger(value) && value > 0 && value <= 12))].sort((a, b) => a - b);
  const payload = {
    name: cleanString(data.name, 80) || "Untitled Year",
    order: cleanNumber(data.order, 0),
    semesters,
  };
  if (yearId) {
    await updateDoc(doc(db, "years", yearId), payload);
  } else {
    const ref = await addDoc(collection(db, "years"), payload);
    yearId = ref.id;
  }
  invalidateCache("years");
  return yearId;
}

export async function saveBranch(branchId, data) {
  const payload = {
    name: cleanString(data.name, 80) || "Untitled Branch",
    shortName: cleanString(data.shortName, 20),
    order: cleanNumber(data.order, 0),
    color: /^#[0-9a-f]{6}$/i.test(String(data.color || "")) ? data.color : "#C9DB74",
    icon: cleanString(data.icon, 40) || "graduation-cap",
  };
  if (branchId) {
    await updateDoc(doc(db, "branches", branchId), payload);
  } else {
    const ref = await addDoc(collection(db, "branches"), payload);
    branchId = ref.id;
  }
  invalidateCache("branches");
  return branchId;
}

export async function reorderCollection(collectionName, orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, collectionName, id), { order: index });
  });
  await batch.commit();
  invalidateCatalog();
}

export async function saveSubject(subjectId, data) {
  const modules = cleanModules(data.modules);
  const branchIds = [...new Set((data.branchIds || []).map((id) => cleanString(id, 100)).filter(Boolean))];
  const payload = {
    name: cleanString(data.name, 160),
    code: cleanString(data.code, 30),
    yearId: cleanString(data.yearId, 100),
    semester: cleanNumber(data.semester, 1),
    branchIds,
    description: cleanString(data.description, 600),
    color: /^#[0-9a-f]{6}$/i.test(String(data.color || "")) ? data.color : "#F0F5D9",
    icon: cleanString(data.icon, 40) || "book-open",
    modules,
    order: cleanNumber(data.order, 0),
    updatedAt: serverTimestamp(),
  };
  if (!payload.name || !payload.code || !payload.yearId || !branchIds.length) {
    throw new Error("Name, code, year, semester, and at least one branch are required.");
  }
  if (subjectId) {
    await updateDoc(doc(db, "subjects", subjectId), payload);
  } else {
    const ref = await addDoc(collection(db, "subjects"), {
      ...payload,
      mainDocId: "",
      viewCount: 0,
      createdAt: serverTimestamp(),
    });
    subjectId = ref.id;
  }
  invalidateCache("subjects");
  invalidateCache("documents");
  invalidateCache("dashboard");
  triggerSeoBuild("subject_saved", { subjectId });
  return subjectId;
}

async function deleteQueryDocs(snapshot) {
  const docs = snapshot.docs || [];
  for (let index = 0; index < docs.length; index += 400) {
    const batch = writeBatch(db);
    docs.slice(index, index + 400).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
}

export async function deleteSubjectCascade(subjectId) {
  const [documentsSnapshot, activitySnapshot] = await Promise.all([
    getDocs(query(collection(db, "documents"), where("subjectId", "==", subjectId))),
    getDocs(query(collection(db, "activity"), where("subjectId", "==", subjectId))),
  ]);
  await Promise.all([deleteQueryDocs(documentsSnapshot), deleteQueryDocs(activitySnapshot)]);
  await deleteDoc(doc(db, "subjects", subjectId));
  invalidateCatalog();
  triggerSeoBuild("subject_deleted", { subjectId });
}

export async function deleteSubjectsForSemester(yearId, semester) {
  const snapshot = await getDocs(
    query(
      collection(db, "subjects"),
      where("yearId", "==", yearId),
      where("semester", "==", Number(semester)),
    ),
  );
  for (const item of snapshot.docs) {
    await deleteSubjectCascade(item.id);
  }
  invalidateCatalog();
}

export async function deleteYearCascade(yearId) {
  const snapshot = await getDocs(query(collection(db, "subjects"), where("yearId", "==", yearId)));
  for (const item of snapshot.docs) {
    await deleteSubjectCascade(item.id);
  }
  await deleteDoc(doc(db, "years", yearId));
  invalidateCatalog();
}

export async function deleteBranchCascade(branchId) {
  const snapshot = await getDocs(
    query(collection(db, "subjects"), where("branchIds", "array-contains", branchId)),
  );
  for (const item of snapshot.docs) {
    const branches = Array.isArray(item.data().branchIds) ? item.data().branchIds : [];
    if (branches.length <= 1) {
      await deleteSubjectCascade(item.id);
    } else {
      await updateDoc(doc(db, "subjects", item.id), { branchIds: arrayRemove(branchId) });
    }
  }
  await deleteDoc(doc(db, "branches", branchId));
  invalidateCatalog();
}

export async function saveDocument(documentId, data, actorUid) {
  if (!isValidDriveId(data.driveFileId)) {
    throw new Error("A valid Google Drive file ID is required.");
  }
  const isMain = data.type === "main";
  const subjectId = cleanString(data.subjectId, 100);
  if (!subjectId) throw new Error("Choose a subject for this document.");
  const subjectSnapshot = await getDoc(doc(db, "subjects", subjectId));
  if (!subjectSnapshot.exists()) throw new Error("The selected subject no longer exists.");

  const documentRef = documentId ? doc(db, "documents", documentId) : doc(collection(db, "documents"));
  const payload = {
    subjectId,
    title: cleanString(data.title, 180) || "Untitled document",
    description: cleanString(data.description, 600),
    type: data.type || "other",
    driveFileId: data.driveFileId,
    pages: data.pages ? cleanNumber(data.pages, 0) : 0,
    sizeLabel: cleanString(data.sizeLabel, 30),
    tags: cleanTags(data.tags),
    contributorId: cleanString(data.contributorId, 100),
    isMain,
    isNew: Boolean(data.isNew),
    mimeType: cleanString(data.mimeType, 100) || "application/pdf",
    uploadedBy: cleanString(data.uploadedBy, 200),
    updatedAt: serverTimestamp(),
  };

  const existingSnapshot = documentId ? await getDoc(documentRef) : null;
  const previous = existingSnapshot?.exists() ? existingSnapshot.data() : null;

  const mainSnapshot = isMain
    ? await getDocs(
      query(
        collection(db, "documents"),
        where("subjectId", "==", subjectId),
        where("isMain", "==", true),
      ),
    )
    : null;

  const batch = writeBatch(db);
  if (mainSnapshot) {
    mainSnapshot.docs.forEach((item) => {
      if (item.id !== documentRef.id) batch.update(item.ref, { isMain: false });
    });
  }

  if (documentId) {
    batch.update(documentRef, payload);
  } else {
    batch.set(documentRef, {
      ...payload,
      createdAt: serverTimestamp(),
      createdBy: actorUid || "",
    });
  }

  const subjectUpdate = { updatedAt: serverTimestamp() };
  if (isMain) subjectUpdate.mainDocId = documentRef.id;
  if (!isMain && previous?.isMain && subjectSnapshot.data().mainDocId === documentRef.id) {
    subjectUpdate.mainDocId = "";
  }
  batch.update(doc(db, "subjects", subjectId), subjectUpdate);

  const activityRef = doc(collection(db, "activity"));
  batch.set(activityRef, {
    type: documentId ? "document_updated" : "document_created",
    subjectId,
    docId: documentRef.id,
    byUid: actorUid || "",
    message: `${payload.title} was ${documentId ? "updated" : "added"}${isMain ? " as the main notes PDF" : ""}.`,
    createdAt: serverTimestamp(),
  });

  await batch.commit();
  invalidateCache("documents");
  invalidateCache("subjects");
  invalidateCache("activity");
  invalidateCache("dashboard");
  triggerSeoBuild("document_saved", { documentId: documentRef.id, subjectId: payload.subjectId });
  return documentRef.id;
}

export async function deleteDocument(document, actorUid) {
  if (!document?.id) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, "documents", document.id));
  if (document.subjectId) {
    const subjectSnapshot = await getDoc(doc(db, "subjects", document.subjectId));
    const subjectData = subjectSnapshot.exists() ? subjectSnapshot.data() : null;
    const update = { updatedAt: serverTimestamp() };
    if (subjectData?.mainDocId === document.id) update.mainDocId = "";
    batch.update(doc(db, "subjects", document.subjectId), update);
    const activityRef = doc(collection(db, "activity"));
    batch.set(activityRef, {
      type: "document_deleted",
      subjectId: document.subjectId,
      docId: document.id,
      byUid: actorUid || "",
      message: `${document.title || "A document"} was removed.`,
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
  invalidateCache("documents");
  invalidateCache("subjects");
  invalidateCache("activity");
  invalidateCache("dashboard");
  triggerSeoBuild("document_deleted", { documentId: document.id, subjectId: document.subjectId });
}

export async function saveContributor(contributorId, data) {
  const payload = {
    name: cleanString(data.name, 100),
    role: cleanString(data.role, 80) || "Notes Contributor",
    photoURL: cleanString(data.photoURL, 2048),
    link: cleanString(data.link, 2048),
    uploadsCount: cleanNumber(data.uploadsCount, 0),
    order: cleanNumber(data.order, 0),
  };
  if (!payload.name) throw new Error("Contributor name is required.");
  if (contributorId) {
    await updateDoc(doc(db, "contributors", contributorId), payload);
  } else {
    await addDoc(collection(db, "contributors"), { ...payload, createdAt: serverTimestamp() });
  }
  invalidateCache("contributors");
}

export async function deleteContributor(contributorId) {
  await deleteDoc(doc(db, "contributors", contributorId));
  invalidateCache("contributors");
}

export async function saveAd(adId, data) {
  const payload = {
    title: cleanString(data.title, 140),
    description: cleanString(data.description, 500),
    imageURL: cleanString(data.imageURL, 2048),
    ctaText: cleanString(data.ctaText, 40) || "Learn more",
    targetURL: cleanString(data.targetURL, 2048),
    placement: data.placement || "home_banner",
    active: Boolean(data.active),
    startDate: data.startDate ? new Date(`${data.startDate}T00:00:00`) : null,
    endDate: data.endDate ? new Date(`${data.endDate}T00:00:00`) : null,
  };
  if (!payload.title || !payload.targetURL) throw new Error("Ad title and target URL are required.");
  if (adId) {
    await updateDoc(doc(db, "ads", adId), payload);
  } else {
    await addDoc(collection(db, "ads"), {
      ...payload,
      impressions: 0,
      clicks: 0,
      createdAt: serverTimestamp(),
    });
  }
  invalidateCache("ads");
}

export async function setAdActive(adId, active) {
  await updateDoc(doc(db, "ads", adId), { active: Boolean(active) });
  invalidateCache("ads");
}

export async function deleteAd(adId) {
  await deleteDoc(doc(db, "ads", adId));
  invalidateCache("ads");
}

export async function fetchUsersPage({ pageSize = 40, cursor = null } = {}) {
  const constraints = [
    orderBy("createdAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const snapshot = await getDocs(query(collection(db, "users"), ...constraints));
  return {
    users: mapSnapshot(snapshot),
    lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
    hasMore: snapshot.docs.length === pageSize,
  };
}

export async function updateUserRole(uid, role) {
  if (!["user", "admin"].includes(role)) throw new Error("Invalid role.");
  await updateDoc(doc(db, "users", uid), { role });
  invalidateCache("users");
}

export async function updateUserBlocked(uid, blocked) {
  await updateDoc(doc(db, "users", uid), { blocked: Boolean(blocked) });
  invalidateCache("users");
}

export async function fetchDashboardData() {
  return cached(cacheKey("dashboard", "main"), 30_000, async () => {
    const [
      usersCount,
      subjectsCount,
      documentsCount,
      contributorsCount,
      topSubjectsSnapshot,
      recentDocumentsSnapshot,
    ] = await Promise.all([
      getCountFromServer(collection(db, "users")).catch(() => ({ data: () => ({ count: 0 }) })),
      getCountFromServer(collection(db, "subjects")).catch(() => ({ data: () => ({ count: 0 }) })),
      getCountFromServer(collection(db, "documents")).catch(() => ({ data: () => ({ count: 0 }) })),
      getCountFromServer(collection(db, "contributors")).catch(() => ({ data: () => ({ count: 0 }) })),
      getDocs(query(collection(db, "subjects"), orderBy("viewCount", "desc"), limit(5))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, "documents"), orderBy("createdAt", "desc"), limit(5))).catch(() => ({ docs: [] })),
    ]);
    return {
      totalUsers: usersCount.data?.()?.count ?? 0,
      totalSubjects: subjectsCount.data?.()?.count ?? 0,
      totalDocuments: documentsCount.data?.()?.count ?? 0,
      totalContributors: contributorsCount.data?.()?.count ?? 0,
      topSubjects: mapSnapshot(topSubjectsSnapshot),
      recentDocuments: mapSnapshot(recentDocumentsSnapshot),
    };
  });
}

export async function searchCatalog(rawQuery, filters = {}) {
  const queryText = cleanString(rawQuery, 120).toLowerCase();
  if (!queryText) return { subjects: [], documents: [] };
  const [subjects, documents] = await Promise.all([fetchAllSubjects(), fetchAllDocuments(500)]);
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));

  const subjectMatches = subjects.filter((subject) => {
    if (filters.yearId && subject.yearId !== filters.yearId) return false;
    if (filters.semester && Number(subject.semester) !== Number(filters.semester)) return false;
    if (filters.branchId && filters.branchId !== "all" && !(subject.branchIds || []).includes(filters.branchId)) return false;
    if (filters.docType) {
      const hasType = documents.some((document) => document.subjectId === subject.id && document.type === filters.docType);
      if (!hasType) return false;
    }
    const haystack = [
      subject.name,
      subject.code,
      subject.description,
      ...(subject.modules || []).map((module) => module.name),
    ].join(" ").toLowerCase();
    return haystack.includes(queryText);
  }).slice(0, 12);

  const documentMatches = documents.filter((document) => {
    const subject = subjectMap.get(document.subjectId);
    if (!subject) return false;
    if (filters.yearId && subject.yearId !== filters.yearId) return false;
    if (filters.semester && Number(subject.semester) !== Number(filters.semester)) return false;
    if (filters.branchId && filters.branchId !== "all" && !(subject.branchIds || []).includes(filters.branchId)) return false;
    if (filters.docType && document.type !== filters.docType) return false;
    const haystack = [
      document.title,
      document.description,
      ...(document.tags || []),
      subject.name,
      subject.code,
    ].join(" ").toLowerCase();
    return haystack.includes(queryText);
  }).slice(0, 25).map((document) => {
    const subject = subjectMap.get(document.subjectId);
    return {
      ...document,
      subjectName: subject?.name || "",
      subjectCode: subject?.code || "",
      subjectSemester: subject?.semester || "",
    };
  });

  return { subjects: subjectMatches, documents: documentMatches };
}

export async function fetchBookmarkCatalog(bookmarks = []) {
  const subjectKeys = bookmarks.filter((key) => String(key).startsWith("subject:")).map((key) => key.slice(8));
  const docKeys = bookmarks.filter((key) => String(key).startsWith("doc:")).map((key) => key.slice(4));
  const [subjects, documents] = await Promise.all([
    fetchSubjectsByIds(subjectKeys),
    fetchDocumentsByIds(docKeys),
  ]);
  return { subjects, documents };
}

export { serverTimestamp };

import { fetchUsersPage, updateUserBlocked, updateUserRole } from "../../db.js";
import {
  avatarHTML,
  confirmDialog,
  escapeAttr,
  escapeHtml,
  formatDate,
  icon,
  setButtonLoading,
  toast,
} from "../../ui.js";
import { adminEmptyHTML, adminHeaderHTML, adminPageClose, adminPageOpen } from "./shared.js";

export async function renderUsers(main, context) {
  const pageSize = 40;
  let users = [];
  let lastDoc = null;
  let hasMore = false;
  let loading = false;
  let query = "";

  const firstPage = await fetchUsersPage({ pageSize });
  if (!location.hash.startsWith("#/admin/users")) return;
  users = firstPage.users;
  lastDoc = firstPage.lastDoc;
  hasMore = firstPage.hasMore;

  main.innerHTML = `${adminPageOpen("users")}
    ${adminHeaderHTML({
      title: '<span class="fw-light">Everyone in</span> <strong>the library.</strong>',
      subtitle: "Promote trusted admins or block accounts that should no longer have access.",
    })}
    <div class="admin-toolbar">
      <label class="admin-toolbar__search">
        ${icon("search")}
        <input class="input" type="search" placeholder="Search loaded accounts" data-user-search autocomplete="off" />
      </label>
      <span class="status-chip" data-user-count>${users.length} loaded</span>
    </div>
    <div class="admin-list-grid" data-user-list></div>
    <div class="admin-pagination" data-user-pagination></div>
  ${adminPageClose()}`;

  const list = main.querySelector("[data-user-list]");
  const pagination = main.querySelector("[data-user-pagination]");
  const searchInput = main.querySelector("[data-user-search]");
  const countChip = main.querySelector("[data-user-count]");

  function filteredUsers() {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => [user.name, user.displayName, user.email, user.role]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle));
  }

  function renderList() {
    const visible = filteredUsers();
    if (countChip) countChip.textContent = `${users.length} loaded`;
    if (!visible.length) {
      list.innerHTML = adminEmptyHTML({
        iconName: users.length ? "search" : "users",
        title: users.length ? "No matching accounts" : "No accounts yet",
        text: users.length ? "Try a different name or email." : "Students appear here after their first sign-in.",
      });
      renderPagination();
      return;
    }
    list.innerHTML = visible.map((user) => userCardHTML(user, context)).join("");
    list.querySelectorAll("[data-role-toggle]").forEach((button) => {
      button.addEventListener("click", () => changeRole(button, button.dataset.roleToggle, button.dataset.nextRole));
    });
    list.querySelectorAll("[data-block-toggle]").forEach((button) => {
      button.addEventListener("click", () => changeBlocked(button, button.dataset.blockToggle, button.dataset.nextBlocked === "true"));
    });
    renderPagination();
  }

  function renderPagination() {
    if (!hasMore) {
      pagination.innerHTML = "";
      return;
    }
    pagination.innerHTML = `<button class="btn btn--white btn--sm" type="button" data-load-users>${icon("plus")} Load more accounts</button>`;
    pagination.querySelector("[data-load-users]")?.addEventListener("click", async (event) => {
      if (loading) return;
      const button = event.currentTarget;
      loading = true;
      setButtonLoading(button, true, "Loading");
      try {
        const next = await fetchUsersPage({ pageSize, cursor: lastDoc });
        users = [...users, ...next.users];
        lastDoc = next.lastDoc;
        hasMore = next.hasMore;
        renderList();
      } catch (error) {
        setButtonLoading(button, false);
        toast(error?.message || "More accounts could not be loaded.", { type: "error" });
      } finally {
        loading = false;
      }
    });
  }

  async function changeRole(button, uid, nextRole) {
    const user = users.find((item) => item.uid === uid || item.id === uid);
    if (!user || !nextRole) return;
    if ((user.uid || user.id) === context.state.profile?.uid) {
      toast("You can’t change your own admin role.", { type: "info" });
      return;
    }
    const promoting = nextRole === "admin";
    const confirmed = await confirmDialog({
      title: promoting ? "Make this user an admin?" : "Remove admin access?",
      message: promoting
        ? `${user.name || user.email || "This user"} will be able to edit the catalog, upload documents, and manage other users.`
        : `${user.name || user.email || "This user"} will lose access to the admin console.`,
      confirmText: promoting ? "Make admin" : "Remove admin",
      danger: !promoting,
    });
    if (!confirmed) return;
    setButtonLoading(button, true);
    try {
      await updateUserRole(user.uid || user.id, nextRole);
      user.role = nextRole;
      toast(promoting ? "Admin access granted." : "Admin access removed.", { type: "success" });
      renderList();
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || "The role could not be updated.", { type: "error" });
    }
  }

  async function changeBlocked(button, uid, nextBlocked) {
    const user = users.find((item) => item.uid === uid || item.id === uid);
    if (!user) return;
    if ((user.uid || user.id) === context.state.profile?.uid) {
      toast("You can’t block your own account.", { type: "info" });
      return;
    }
    const confirmed = await confirmDialog({
      title: nextBlocked ? "Block this account?" : "Unblock this account?",
      message: nextBlocked
        ? `${user.name || user.email || "This user"} will be signed out and prevented from using Academix until unblocked.`
        : `${user.name || user.email || "This user"} will be able to sign in again.`,
      confirmText: nextBlocked ? "Block account" : "Unblock account",
      danger: nextBlocked,
    });
    if (!confirmed) return;
    setButtonLoading(button, true);
    try {
      await updateUserBlocked(user.uid || user.id, nextBlocked);
      user.blocked = nextBlocked;
      toast(nextBlocked ? "Account blocked." : "Account unblocked.", { type: "success" });
      renderList();
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || "The account could not be updated.", { type: "error" });
    }
  }

  searchInput?.addEventListener("input", () => {
    query = searchInput.value;
    renderList();
  });

  renderList();
}

function userCardHTML(user, context) {
  const uid = user.uid || user.id;
  const isSelf = uid === context.state.profile?.uid;
  const year = context.state.years.find((item) => item.id === user.yearId);
  const branch = context.state.branches.find((item) => item.id === user.branchId);
  const studyMeta = [year?.name, branch?.shortName || branch?.name, user.semester ? `Sem ${user.semester}` : ""]
    .filter(Boolean)
    .join(" · ");
  const nextRole = user.role === "admin" ? "user" : "admin";
  return `<article class="user-admin-card">
    ${avatarHTML(user, { size: "md" })}
    <div class="user-admin-card__copy">
      <p class="user-admin-card__name">${escapeHtml(user.name || user.displayName || "Student")}${isSelf ? ' <span class="role-badge">You</span>' : ""}</p>
      <p class="user-admin-card__email">${escapeHtml(user.email || "No email")}</p>
      <div class="user-admin-card__meta">
        <span class="role-badge ${user.role === "admin" ? "role-badge--admin" : ""}">${user.role === "admin" ? "Admin" : "Student"}</span>
        ${user.blocked ? `<span class="role-badge role-badge--blocked">Blocked</span>` : ""}
        <span class="admin-card__sub">${escapeHtml(studyMeta || "Study setup pending")} · Joined ${formatDate(user.createdAt)}</span>
      </div>
    </div>
    <div class="user-admin-card__actions">
      <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-role-toggle="${escapeAttr(uid)}" data-next-role="${nextRole}" aria-label="${nextRole === "admin" ? "Make admin" : "Remove admin"}" ${isSelf ? "disabled" : ""}>
        ${icon(nextRole === "admin" ? "shield" : "user-x")}
      </button>
      <button class="icon-btn icon-btn--sm icon-btn--ghost ${user.blocked ? "" : "icon-btn--danger"}" type="button" data-block-toggle="${escapeAttr(uid)}" data-next-blocked="${user.blocked ? "false" : "true"}" aria-label="${user.blocked ? "Unblock account" : "Block account"}" ${isSelf ? "disabled" : ""}>
        ${icon(user.blocked ? "check-circle" : "ban")}
      </button>
    </div>
  </article>`;
}

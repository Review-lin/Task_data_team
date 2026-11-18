"use strict";

const config = window.APP_CONFIG || {};
const state = {
  user: null,
  tasks: [],
  deleteId: "",
  busy: false,
};

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  setDateGreeting();
  checkSession();
});

function cacheElements() {
  [
    "auth-view", "app-view", "login-form", "login-username", "login-password",
    "login-button", "auth-message", "user-name", "signout-button", "today-label", "day-period",
    "progress-copy", "progress-percent", "progress-count", "progress-bar",
    "task-total", "task-list", "empty-state", "empty-title", "empty-copy",
    "add-task-button", "empty-add-button", "status-filter", "priority-filter", "owner-filter",
    "loading-overlay", "loading-text", "toast-region", "task-dialog",
    "task-form", "dialog-title", "task-id", "task-title", "task-description",
    "task-owner", "task-priority", "title-error", "close-dialog",
    "cancel-task", "delete-dialog", "cancel-delete", "confirm-delete",
  ].forEach((id) => { el[toCamel(id)] = document.getElementById(id); });
}

function bindEvents() {
  el.loginForm.addEventListener("submit", login);
  el.signoutButton.addEventListener("click", signOut);
  el.addTaskButton.addEventListener("click", () => openTaskDialog());
  el.emptyAddButton.addEventListener("click", () => openTaskDialog());
  el.closeDialog.addEventListener("click", closeTaskDialog);
  el.cancelTask.addEventListener("click", closeTaskDialog);
  el.taskForm.addEventListener("submit", saveTask);
  el.statusFilter.addEventListener("change", renderTasks);
  el.priorityFilter.addEventListener("change", renderTasks);
  el.ownerFilter.addEventListener("change", renderTasks);
  el.taskList.addEventListener("click", handleTaskAction);
  el.cancelDelete.addEventListener("click", () => el.deleteDialog.close());
  el.confirmDelete.addEventListener("click", confirmDelete);
  el.taskTitle.addEventListener("input", clearTitleError);
  el.taskDialog.addEventListener("click", closeOnBackdrop);
  el.deleteDialog.addEventListener("click", closeOnBackdrop);
  populateOwnerOptions();
}

async function checkSession() {
  if (!isConfigured()) {
    el.authMessage.textContent = "config.js に担当者を1名以上設定してください。";
    return;
  }
  setBusy(true, "ログイン状態を確認しています…", true);
  try {
    const response = await fetch("/api/session", { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!response.ok) return showAuth();
    const result = await response.json();
    state.user = result.user;
    await loadTasks(false);
    showApp();
  } catch {
    showAuth();
    el.authMessage.textContent = "サーバーに接続できません。しばらくしてからもう一度お試しください。";
  } finally {
    setBusy(false);
  }
}

async function login(event) {
  event.preventDefault();
  if (state.busy) return;
  const username = el.loginUsername.value.trim();
  const password = el.loginPassword.value;
  if (!username || !password) {
    el.authMessage.textContent = "ユーザー名とパスワードを入力してください。";
    return;
  }

  setBusy(true, "ログインしています…", true);
  el.authMessage.textContent = "";
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const result = await readJsonResponse(response);
    if (!response.ok || !result.ok) throw new Error(result.error || "ログインに失敗しました。");
    state.user = result.user;
    el.loginPassword.value = "";
    await loadTasks(false);
    showApp();
  } catch (error) {
    el.loginPassword.value = "";
    el.authMessage.textContent = friendlyError(error);
    el.loginPassword.focus();
  } finally {
    setBusy(false);
  }
}

function showApp() {
  el.userName.textContent = state.user?.displayName || "ログイン中";
  el.authMessage.textContent = "";
  el.authView.hidden = true;
  el.appView.hidden = false;
  renderTasks();
}

async function signOut() {
  if (state.busy) return;
  setBusy(true, "ログアウトしています…", true);
  try {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } });
  } finally {
    showAuth();
    setBusy(false);
  }
}

function showAuth() {
  resetSession();
  el.appView.hidden = true;
  el.authView.hidden = false;
  el.taskList.replaceChildren();
  window.setTimeout(() => el.loginUsername.focus(), 50);
}

function resetSession() {
  state.user = null;
  state.tasks = [];
}

async function apiRequest(action, payload = null) {
  assertActiveSession();
  const response = await fetch("/api/tasks", action === "list" ? {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  } : {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, data: payload }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok || !result.ok) {
    if (response.status === 401) showAuth();
    throw new Error(result.error || `リクエストに失敗しました（${response.status}）。`);
  }
  return result;
}

async function loadTasks(showFullLoader = false) {
  setBusy(true, "タスクを読み込んでいます…", showFullLoader);
  try {
    const result = await apiRequest("list");
    state.tasks = Array.isArray(result.tasks) ? result.tasks : [];
    renderTasks();
  } finally {
    setBusy(false);
  }
}

async function saveTask(event) {
  event.preventDefault();
  if (state.busy) return;
  const title = el.taskTitle.value.trim();
  if (!title) {
    el.taskTitle.classList.add("invalid");
    el.titleError.textContent = "タスクのタイトルを入力してください。";
    el.taskTitle.focus();
    return;
  }

  const id = el.taskId.value;
  const existing = state.tasks.find((task) => task.id === id);
  const task = {
    id,
    title,
    description: el.taskDescription.value.trim(),
    owner: el.taskOwner.value,
    priority: el.taskPriority.value,
    status: existing?.status || "Pending",
  };

  setBusy(true, id ? "タスクを更新しています…" : "タスクを追加しています…", true);
  try {
    const result = await apiRequest(id ? "update" : "create", task);
    upsertLocalTask(result.task);
    closeTaskDialog();
    renderTasks();
    showToast(id ? "タスクを更新しました。" : "タスクを追加しました。");
  } catch (error) {
    showToast(friendlyError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function handleTaskAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || state.busy) return;
  const task = state.tasks.find((item) => item.id === button.dataset.id);
  if (!task) return;
  const action = button.dataset.action;
  if (action === "edit") openTaskDialog(task);
  if (action === "delete") {
    state.deleteId = task.id;
    el.deleteDialog.showModal();
  }
  if (action === "toggle") await toggleTask(task);
}

async function toggleTask(task) {
  const previous = task.status;
  task.status = previous === "Completed" ? "Pending" : "Completed";
  renderTasks();
  setBusy(true, "保存しています…", false);
  try {
    const result = await apiRequest("update", task);
    upsertLocalTask(result.task);
    renderTasks();
  } catch (error) {
    task.status = previous;
    renderTasks();
    showToast(friendlyError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function confirmDelete(event) {
  event.preventDefault();
  if (!state.deleteId || state.busy) return;
  const id = state.deleteId;
  el.deleteDialog.close();
  setBusy(true, "タスクを削除しています…", true);
  try {
    await apiRequest("delete", { id });
    state.tasks = state.tasks.filter((task) => task.id !== id);
    state.deleteId = "";
    renderTasks();
    showToast("タスクを削除しました。");
  } catch (error) {
    showToast(friendlyError(error), "error");
  } finally {
    setBusy(false);
  }
}

function renderTasks() {
  const status = el.statusFilter.value;
  const priority = el.priorityFilter.value;
  const owner = el.ownerFilter.value;
  const filtered = state.tasks
    .filter((task) => status === "All" || task.status === status)
    .filter((task) => priority === "All" || task.priority === priority)
    .filter((task) => owner === "All" || task.owner === owner)
    .sort(sortTasks);

  el.taskList.replaceChildren(...filtered.map(createTaskCard));
  el.taskTotal.textContent = String(state.tasks.length);
  const hasFilters = status !== "All" || priority !== "All" || owner !== "All";
  el.emptyState.hidden = filtered.length > 0;
  el.emptyTitle.textContent = hasFilters ? "条件に一致するタスクはありません。" : "タスクはありません。";
  el.emptyCopy.textContent = hasFilters
    ? "絞り込み条件を変更してください。"
    : "最初のタスクを追加しましょう。";
  el.emptyAddButton.hidden = hasFilters;
  updateProgress();
}

function createTaskCard(task) {
  const article = document.createElement("article");
  article.className = `task-card priority-${task.priority.toLowerCase()}${task.status === "Completed" ? " is-completed" : ""}`;

  const toggle = iconButton("toggle", task.id, task.status === "Completed" ? "未完了に戻す" : "完了にする", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M5 12l4 4L19 6\"/></svg>");
  toggle.classList.add("task-check");

  const main = document.createElement("div");
  main.className = "task-main";
  const title = document.createElement("h3");
  title.className = "task-title";
  title.textContent = task.title;
  main.append(title);
  if (task.description) {
    const description = document.createElement("p");
    description.className = "task-description";
    description.textContent = task.description;
    main.append(description);
  }
  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.append(makePill(`担当 · ${task.owner || "未設定"}`, "owner"));
  meta.append(makePill(priorityLabel(task.priority), `priority-${task.priority.toLowerCase()}`));
  main.append(meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";
  actions.append(
    iconButton("edit", task.id, "タスクを編集", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 20h9M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z\"/></svg>"),
    iconButton("delete", task.id, "タスクを削除", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14M10 10v6m4-6v6\"/></svg>", "delete-action"),
  );
  article.append(toggle, main, actions);
  return article;
}

function updateProgress() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.status === "Completed").length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  el.progressPercent.textContent = `${percent}%`;
  el.progressCount.textContent = `完了 ${completed} / ${total} 件`;
  el.progressBar.style.width = `${percent}%`;
  el.progressCopy.textContent = total === 0
    ? "タスクを追加して、仕事を整理しましょう。"
    : completed === total
      ? "すべて完了しました。お疲れさまでした。"
      : `残り ${total - completed} 件です。`;
}

function openTaskDialog(task = null) {
  el.taskForm.reset();
  clearTitleError();
  el.taskId.value = task?.id || "";
  el.taskTitle.value = task?.title || "";
  el.taskDescription.value = task?.description || "";
  ensureOwnerOption(task?.owner);
  el.taskOwner.value = task?.owner || config.TASK_OWNERS[0] || "";
  el.taskPriority.value = task?.priority || "Medium";
  el.dialogTitle.textContent = task ? "タスクを編集" : "タスクを追加";
  el.taskDialog.showModal();
  window.setTimeout(() => el.taskTitle.focus(), 50);
}

function closeTaskDialog() { if (el.taskDialog.open) el.taskDialog.close(); }
function clearTitleError() { el.taskTitle.classList.remove("invalid"); el.titleError.textContent = ""; }
function closeOnBackdrop(event) { if (event.target === event.currentTarget) event.currentTarget.close(); }
function upsertLocalTask(task) {
  const index = state.tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) state.tasks[index] = task;
  else state.tasks.push(task);
}

function setBusy(value, message = "処理中…", overlay = false) {
  state.busy = value;
  el.loadingText.textContent = message;
  el.loadingOverlay.hidden = !(value && overlay);
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function setDateGreeting() {
  const now = new Date();
  el.todayLabel.textContent = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
  const hour = now.getHours();
  el.dayPeriod.textContent = hour < 12 ? "おはようございます。" : hour < 18 ? "こんにちは。" : "お疲れさまです。";
}

function assertActiveSession() {
  if (!state.user) throw new Error("続けるにはログインしてください。");
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    throw new Error("サーバーから正しい応答を受け取れませんでした。");
  }
}

function sortTasks(a, b) {
  if (a.status !== b.status) return a.status === "Pending" ? -1 : 1;
  return (b.createdAt || "").localeCompare(a.createdAt || "");
}

function iconButton(action, id, label, svg, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-button ${extraClass}`.trim();
  button.dataset.action = action;
  button.dataset.id = id;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = svg;
  return button;
}

function makePill(text, className = "") {
  const pill = document.createElement("span");
  pill.className = `meta-pill ${className}`.trim();
  pill.textContent = text;
  return pill;
}

function populateOwnerOptions() {
  const owners = Array.isArray(config.TASK_OWNERS)
    ? [...new Set(config.TASK_OWNERS.map((owner) => String(owner).trim()).filter(Boolean))]
    : [];
  el.taskOwner.replaceChildren(...owners.map((owner) => new Option(owner, owner)));
  el.ownerFilter.replaceChildren(new Option("すべての担当者", "All"), ...owners.map((owner) => new Option(owner, owner)));
}

function ensureOwnerOption(owner) {
  if (!owner) return;
  if (![...el.taskOwner.options].some((option) => option.value === owner)) el.taskOwner.add(new Option(owner, owner));
}

function isConfigured() {
  return Array.isArray(config.TASK_OWNERS) && config.TASK_OWNERS.length > 0;
}

function friendlyError(error) {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return "サーバーに接続できません。通信環境を確認してもう一度お試しください。";
  }
  return error?.message || "問題が発生しました。もう一度お試しください。";
}

function priorityLabel(priority) {
  return ({ High: "優先度：高", Medium: "優先度：中", Low: "優先度：低" })[priority] || priority;
}

function toCamel(value) { return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); }

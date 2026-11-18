"use strict";

const state = {
  user: null,
  tasks: [],
  owners: [],
  editingOwnerId: "",
  deleteId: "",
  busy: false,
  serviceWorkerRegistration: null,
  installPrompt: null,
  vapidPublicKey: "",
};

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  setDateGreeting();
  initializePwa();
  checkSession();
});

function cacheElements() {
  [
    "auth-view", "app-view", "brand-home", "tasks-nav-button", "analytics-nav-button",
    "tasks-page", "analytics-page", "login-form", "login-username", "login-password",
    "login-button", "auth-message", "user-name", "signout-button", "install-button",
    "notification-button", "today-label", "day-period",
    "progress-copy", "progress-percent", "progress-count", "progress-bar",
    "task-total", "task-list", "empty-state", "empty-title", "empty-copy",
    "add-task-button", "empty-add-button", "status-filter", "priority-filter", "owner-filter", "manage-owners-button",
    "loading-overlay", "loading-text", "toast-region", "task-dialog",
    "task-form", "dialog-title", "task-id", "task-title", "task-description",
    "task-owner", "task-priority", "task-start-date", "task-deadline", "title-error", "close-dialog",
    "cancel-task", "owner-dialog", "owner-form", "owner-name", "save-owner",
    "cancel-owner-edit", "close-owner-dialog", "owner-list", "delete-dialog", "cancel-delete", "confirm-delete",
    "analytics-weeks", "analytics-total", "analytics-completed", "analytics-rate", "analytics-overdue",
    "weekly-chart", "weekly-chart-total", "owner-performance",
  ].forEach((id) => { el[toCamel(id)] = document.getElementById(id); });
}

function bindEvents() {
  el.loginForm.addEventListener("submit", login);
  el.signoutButton.addEventListener("click", signOut);
  el.installButton.addEventListener("click", installPwa);
  el.notificationButton.addEventListener("click", togglePushNotifications);
  el.brandHome.addEventListener("click", (event) => { event.preventDefault(); showPage("tasks"); });
  el.tasksNavButton.addEventListener("click", () => showPage("tasks"));
  el.analyticsNavButton.addEventListener("click", () => showPage("analytics"));
  el.analyticsWeeks.addEventListener("change", renderAnalytics);
  el.addTaskButton.addEventListener("click", () => openTaskDialog());
  el.emptyAddButton.addEventListener("click", () => openTaskDialog());
  el.closeDialog.addEventListener("click", closeTaskDialog);
  el.cancelTask.addEventListener("click", closeTaskDialog);
  el.taskForm.addEventListener("submit", saveTask);
  el.statusFilter.addEventListener("change", renderTasks);
  el.priorityFilter.addEventListener("change", renderTasks);
  el.ownerFilter.addEventListener("change", renderTasks);
  el.manageOwnersButton.addEventListener("click", openOwnerDialog);
  el.ownerForm.addEventListener("submit", saveOwner);
  el.ownerList.addEventListener("click", handleOwnerAction);
  el.closeOwnerDialog.addEventListener("click", closeOwnerDialog);
  el.cancelOwnerEdit.addEventListener("click", resetOwnerEditor);
  el.taskList.addEventListener("click", handleTaskAction);
  el.taskList.addEventListener("keydown", handleTaskKeydown);
  el.cancelDelete.addEventListener("click", () => el.deleteDialog.close());
  el.confirmDelete.addEventListener("click", confirmDelete);
  el.taskTitle.addEventListener("input", clearTitleError);
  el.taskDialog.addEventListener("click", closeOnBackdrop);
  el.ownerDialog.addEventListener("click", closeOnBackdrop);
  el.deleteDialog.addEventListener("click", closeOnBackdrop);
  window.addEventListener("hashchange", () => {
    if (state.user) showPage(window.location.hash === "#analysis" ? "analytics" : "tasks", false);
  });
}

async function checkSession() {
  setBusy(true, "ログイン状態を確認しています…", true);
  try {
    const response = await fetch("/api/session", { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!response.ok) return showAuth();
    const result = await response.json();
    state.user = result.user;
    await loadOwners(false);
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
    await loadOwners(false);
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
  showPage(window.location.hash === "#analysis" ? "analytics" : "tasks", false);
  refreshNotificationState();
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
  state.owners = [];
  state.editingOwnerId = "";
  state.vapidPublicKey = "";
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

async function ownerApi(action = "list", payload = null) {
  assertActiveSession();
  const response = await fetch("/api/owners", action === "list" ? {
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

async function loadOwners(showFullLoader = false) {
  setBusy(true, "担当者を読み込んでいます…", showFullLoader);
  try {
    const result = await ownerApi();
    state.owners = Array.isArray(result.owners) ? result.owners : [];
    renderOwnerOptions();
    renderOwnerList();
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
    startDate: el.taskStartDate.value,
    dueDate: el.taskDeadline.value,
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
  const card = event.target.closest(".task-card[data-id]");
  if (state.busy || (!button && !card)) return;
  const task = state.tasks.find((item) => item.id === (button?.dataset.id || card?.dataset.id));
  if (!task) return;
  if (!button) {
    openTaskDialog(task);
    return;
  }
  const action = button.dataset.action;
  if (action === "edit") openTaskDialog(task);
  if (action === "delete") {
    state.deleteId = task.id;
    el.deleteDialog.showModal();
  }
  if (action === "toggle") await toggleTask(task);
}

function handleTaskKeydown(event) {
  if ((event.key !== "Enter" && event.key !== " ") || event.target.closest("button")) return;
  const card = event.target.closest(".task-card[data-id]");
  if (!card || state.busy) return;
  event.preventDefault();
  const task = state.tasks.find((item) => item.id === card.dataset.id);
  if (task) openTaskDialog(task);
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
  renderAnalytics();
}

function showPage(page, updateHash = true) {
  const analytics = page === "analytics";
  el.tasksPage.hidden = analytics;
  el.analyticsPage.hidden = !analytics;
  el.tasksNavButton.classList.toggle("is-active", !analytics);
  el.analyticsNavButton.classList.toggle("is-active", analytics);
  el.tasksNavButton.setAttribute("aria-current", analytics ? "false" : "page");
  el.analyticsNavButton.setAttribute("aria-current", analytics ? "page" : "false");
  if (analytics) renderAnalytics();
  if (updateHash) window.history.replaceState(null, "", analytics ? "#analysis" : "#tasks");
}

function renderAnalytics() {
  if (!el.analyticsTotal) return;
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.status === "Completed").length;
  const today = localDateKey(new Date());
  const overdue = state.tasks.filter((task) => task.status !== "Completed" && task.dueDate && task.dueDate < today).length;
  el.analyticsTotal.textContent = String(total);
  el.analyticsCompleted.textContent = String(completed);
  el.analyticsRate.textContent = `${total ? Math.round((completed / total) * 100) : 0}%`;
  el.analyticsOverdue.textContent = String(overdue);
  renderOwnerPerformance();
  renderWeeklyChart();
}

function renderOwnerPerformance() {
  const names = [...new Set([
    ...state.owners.map((owner) => owner.name),
    ...state.tasks.map((task) => task.owner).filter(Boolean),
  ])];
  const stats = names.map((name) => {
    const tasks = state.tasks.filter((task) => task.owner === name);
    const done = tasks.filter((task) => task.status === "Completed").length;
    return { name, total: tasks.length, done, rate: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  }).sort((a, b) => b.rate - a.rate || b.done - a.done || a.name.localeCompare(b.name, "ja"));

  if (!stats.length) {
    const empty = document.createElement("p");
    empty.className = "analytics-empty";
    empty.textContent = "担当者を追加すると分析が表示されます。";
    el.ownerPerformance.replaceChildren(empty);
    return;
  }

  el.ownerPerformance.replaceChildren(...stats.map((stat) => {
    const row = document.createElement("div");
    row.className = "owner-performance-row";
    const name = document.createElement("strong");
    name.textContent = stat.name;
    const total = document.createElement("span");
    total.textContent = `${stat.total}件`;
    const done = document.createElement("span");
    done.textContent = `${stat.done}件`;
    const progress = document.createElement("div");
    progress.className = "owner-progress";
    const label = document.createElement("span");
    label.textContent = `${stat.rate}%`;
    const track = document.createElement("span");
    track.className = "owner-progress-track";
    const bar = document.createElement("span");
    bar.className = "owner-progress-bar";
    bar.style.width = `${stat.rate}%`;
    track.append(bar);
    progress.append(label, track);
    row.append(name, total, done, progress);
    return row;
  }));
}

function renderWeeklyChart() {
  const weeks = Math.max(1, Math.min(12, Number.parseInt(el.analyticsWeeks.value, 10) || 1));
  const currentWeek = startOfWeek(new Date());
  const firstWeek = new Date(currentWeek);
  firstWeek.setDate(firstWeek.getDate() - ((weeks - 1) * 7));
  const buckets = Array.from({ length: weeks }, (_, index) => {
    const start = new Date(firstWeek);
    start.setDate(firstWeek.getDate() + (index * 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end, count: 0 };
  });

  for (const task of state.tasks) {
    if (task.status !== "Completed" || !task.completedAt) continue;
    const completedAt = new Date(task.completedAt);
    if (Number.isNaN(completedAt.getTime())) continue;
    const bucket = buckets.find((item) => completedAt >= item.start && completedAt < item.end);
    if (bucket) bucket.count += 1;
  }

  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const periodTotal = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  el.weeklyChartTotal.textContent = `期間内 ${periodTotal}件`;
  el.weeklyChart.setAttribute("aria-label", `${weeks}週間の完了タスクは${periodTotal}件です。`);
  el.weeklyChart.style.setProperty("--chart-columns", String(weeks));
  el.weeklyChart.replaceChildren(...buckets.map((bucket) => {
    const column = document.createElement("div");
    column.className = "weekly-column";
    const value = document.createElement("strong");
    value.textContent = String(bucket.count);
    const barArea = document.createElement("div");
    barArea.className = "weekly-bar-area";
    const bar = document.createElement("span");
    bar.className = "weekly-bar";
    bar.style.height = `${Math.max(bucket.count ? 8 : 2, (bucket.count / maximum) * 100)}%`;
    barArea.append(bar);
    const label = document.createElement("span");
    label.className = "weekly-label";
    label.textContent = `${bucket.start.getMonth() + 1}/${bucket.start.getDate()}`;
    column.append(value, barArea, label);
    return column;
  }));
}

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysFromMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysFromMonday);
  return result;
}

function createTaskCard(task) {
  const article = document.createElement("article");
  article.className = `task-card priority-${task.priority.toLowerCase()}${task.status === "Completed" ? " is-completed" : ""}`;
  article.dataset.id = task.id;
  article.tabIndex = 0;
  article.setAttribute("aria-label", `${task.title}を編集`);

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
  if (task.startDate) meta.append(makePill(`開始 · ${formatShortDate(task.startDate)}`));
  if (task.dueDate) {
    const overdue = task.status !== "Completed" && task.dueDate < localDateKey(new Date());
    meta.append(makePill(`期限 · ${formatShortDate(task.dueDate)}`, overdue ? "overdue" : ""));
  }
  main.append(meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const complete = document.createElement("button");
  complete.type = "button";
  complete.className = "complete-button";
  complete.dataset.action = "toggle";
  complete.dataset.id = task.id;
  complete.textContent = task.status === "Completed" ? "未完了に戻す" : "完了";
  actions.append(
    complete,
    iconButton("edit", task.id, "タスクを編集", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 20h9M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z\"/></svg>"),
    iconButton("delete", task.id, "タスクを削除", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14M10 10v6m4-6v6\"/></svg>", "delete-action"),
  );
  article.append(main, actions);
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
  if (!task && state.owners.length === 0) {
    showToast("先に担当者を追加してください。", "error");
    openOwnerDialog();
    return;
  }
  el.taskForm.reset();
  clearTitleError();
  el.taskId.value = task?.id || "";
  el.taskTitle.value = task?.title || "";
  el.taskDescription.value = task?.description || "";
  el.taskStartDate.value = task?.startDate || (task ? "" : localDateKey(new Date()));
  el.taskDeadline.value = task?.dueDate || "";
  ensureOwnerOption(task?.owner);
  el.taskOwner.value = task?.owner || state.owners[0]?.name || "";
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
  if (a.status === "Pending" && a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }
  return (b.createdAt || "").localeCompare(a.createdAt || "");
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
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

function renderOwnerOptions() {
  const selectedTaskOwner = el.taskOwner.value;
  const selectedFilter = el.ownerFilter.value;
  const options = state.owners.map((owner) => new Option(owner.name, owner.name));
  el.taskOwner.replaceChildren(...options);
  el.ownerFilter.replaceChildren(
    new Option("すべての担当者", "All"),
    ...state.owners.map((owner) => new Option(owner.name, owner.name)),
  );
  if (state.owners.some((owner) => owner.name === selectedTaskOwner)) el.taskOwner.value = selectedTaskOwner;
  if (state.owners.some((owner) => owner.name === selectedFilter)) el.ownerFilter.value = selectedFilter;
}

function ensureOwnerOption(owner) {
  if (!owner) return;
  if (![...el.taskOwner.options].some((option) => option.value === owner)) el.taskOwner.add(new Option(owner, owner));
}

function openOwnerDialog() {
  resetOwnerEditor();
  renderOwnerList();
  el.ownerDialog.showModal();
  window.setTimeout(() => el.ownerName.focus(), 50);
}

function closeOwnerDialog() {
  resetOwnerEditor();
  if (el.ownerDialog.open) el.ownerDialog.close();
}

function resetOwnerEditor() {
  state.editingOwnerId = "";
  el.ownerName.value = "";
  el.saveOwner.textContent = "追加";
  el.cancelOwnerEdit.hidden = true;
}

function renderOwnerList() {
  if (!el.ownerList) return;
  el.ownerList.replaceChildren(...state.owners.map((owner) => {
    const row = document.createElement("div");
    row.className = "owner-row";
    const name = document.createElement("span");
    name.textContent = owner.name;
    const actions = document.createElement("div");
    actions.className = "owner-row-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-button";
    edit.dataset.ownerAction = "edit";
    edit.dataset.id = owner.id;
    edit.textContent = "変更";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button owner-delete-button";
    remove.dataset.ownerAction = "delete";
    remove.dataset.id = owner.id;
    remove.textContent = "削除";
    actions.append(edit, remove);
    row.append(name, actions);
    return row;
  }));
}

async function saveOwner(event) {
  event.preventDefault();
  if (state.busy) return;
  const name = el.ownerName.value.trim();
  if (!name) {
    showToast("担当者名を入力してください。", "error");
    el.ownerName.focus();
    return;
  }
  const action = state.editingOwnerId ? "rename" : "create";
  setBusy(true, action === "rename" ? "担当者名を変更しています…" : "担当者を追加しています…", true);
  try {
    await ownerApi(action, { id: state.editingOwnerId, name });
    resetOwnerEditor();
    await loadOwners(false);
    if (action === "rename") await loadTasks(false);
    showToast(action === "rename" ? "担当者名を変更しました。" : "担当者を追加しました。");
  } catch (error) {
    showToast(friendlyError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function handleOwnerAction(event) {
  const button = event.target.closest("button[data-owner-action]");
  if (!button || state.busy) return;
  const owner = state.owners.find((item) => item.id === button.dataset.id);
  if (!owner) return;
  if (button.dataset.ownerAction === "edit") {
    state.editingOwnerId = owner.id;
    el.ownerName.value = owner.name;
    el.saveOwner.textContent = "更新";
    el.cancelOwnerEdit.hidden = false;
    el.ownerName.focus();
    el.ownerName.select();
    return;
  }
  if (!window.confirm(`「${owner.name}」を削除しますか？`)) return;
  setBusy(true, "担当者を削除しています…", true);
  try {
    await ownerApi("delete", { id: owner.id });
    resetOwnerEditor();
    await loadOwners(false);
    renderTasks();
    showToast("担当者を削除しました。");
  } catch (error) {
    showToast(friendlyError(error), "error");
  } finally {
    setBusy(false);
  }
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

async function initializePwa() {
  if ("serviceWorker" in navigator) {
    try {
      state.serviceWorkerRegistration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
    } catch (error) {
      console.error("Service worker registration failed", error);
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    el.installButton.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    el.installButton.hidden = true;
    showToast("アプリをインストールしました。");
  });
  window.addEventListener("offline", () => showToast("オフラインです。表示済みの画面のみ利用できます。", "error"));
  window.addEventListener("online", () => showToast("オンラインに戻りました。"));
}

async function installPwa() {
  if (!state.installPrompt) return;
  await state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  el.installButton.hidden = true;
}

async function refreshNotificationState() {
  const supported = "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;
  el.notificationButton.hidden = !supported;
  if (!supported) return;
  try {
    const registration = state.serviceWorkerRegistration || await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    updateNotificationButton(Boolean(subscription));
    if (state.user && Notification.permission !== "denied") preloadVapidKey().catch(() => {});
  } catch {
    updateNotificationButton(false);
  }
}

async function preloadVapidKey() {
  if (state.vapidPublicKey) return state.vapidPublicKey;
  const response = await fetch("/api/push", { credentials: "same-origin", headers: { Accept: "application/json" } });
  const result = await readJsonResponse(response);
  if (!response.ok || !result.ok) throw new Error(result.error || "通知設定を取得できませんでした。");
  state.vapidPublicKey = result.publicKey;
  return result.publicKey;
}

async function togglePushNotifications() {
  if (state.busy || !state.user) return;
  setBusy(true, "通知設定を更新しています…", true);
  try {
    // Request permission before the first await so browsers retain the click gesture.
    const permissionRequest = Notification.permission === "default"
      ? Notification.requestPermission()
      : Promise.resolve(Notification.permission);
    const registration = state.serviceWorkerRegistration || await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await updatePushServer("unsubscribe", existing.toJSON());
      await existing.unsubscribe();
      updateNotificationButton(false);
      showToast("プッシュ通知を無効にしました。");
      return;
    }

    const permission = await permissionRequest;
    if (permission === "denied") throw new Error("ブラウザーの設定で通知が拒否されています。");
    if (permission !== "granted") throw new Error("通知が許可されませんでした。");
    const publicKey = await preloadVapidKey();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await updatePushServer("subscribe", subscription.toJSON());
    updateNotificationButton(true);
    showToast("プッシュ通知を有効にしました。");
  } catch (error) {
    showToast(friendlyError(error), "error");
  } finally {
    setBusy(false);
  }
}

async function updatePushServer(action, subscription) {
  const response = await fetch("/api/push", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, subscription }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok || !result.ok) throw new Error(result.error || "通知設定を保存できませんでした。");
}

function updateNotificationButton(enabled) {
  el.notificationButton.classList.toggle("is-active", enabled);
  const label = enabled ? "通知を無効にする" : "通知を有効にする";
  el.notificationButton.title = label;
  el.notificationButton.setAttribute("aria-label", label);
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function toCamel(value) { return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); }

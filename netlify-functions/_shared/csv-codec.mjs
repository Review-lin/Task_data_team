import { HttpError } from "./http.mjs";

const HEADERS = ["ID", "Title", "Description", "Owner", "StartDate", "DueDate", "Priority", "Status", "CreatedAt", "CompletedAt"];
const DEADLINE_HEADERS = ["ID", "Title", "Description", "Owner", "DueDate", "Priority", "Status", "CreatedAt"];
const LEGACY_HEADERS = ["ID", "Title", "Description", "Owner", "Priority", "Status", "CreatedAt"];
const VALID_PRIORITIES = new Set(["Low", "Medium", "High"]);
const VALID_STATUSES = new Set(["Pending", "Completed"]);
export const MAX_TASKS = 5000;
export const MAX_CSV_BYTES = 5 * 1024 * 1024;

export function validateTask(input, requireId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "タスクデータが必要です。", "VALIDATION_ERROR");
  }
  const task = {
    id: clean(input.id, 100),
    title: clean(input.title, 150),
    description: clean(input.description, 2000),
    owner: clean(input.owner, 100),
    startDate: clean(input.startDate, 10),
    dueDate: clean(input.dueDate, 10),
    priority: clean(input.priority, 20) || "Medium",
    status: clean(input.status, 20) || "Pending",
    createdAt: "",
    completedAt: "",
  };
  if (requireId && !task.id) throw new HttpError(400, "タスクIDが必要です。", "VALIDATION_ERROR");
  if (!task.title) throw new HttpError(400, "タスクのタイトルが必要です。", "VALIDATION_ERROR");
  if (!task.owner) throw new HttpError(400, "担当者を選択してください。", "VALIDATION_ERROR");
  if (task.startDate && !isValidDate(task.startDate)) throw new HttpError(400, "開始日が正しくありません。", "VALIDATION_ERROR");
  if (task.dueDate && !isValidDate(task.dueDate)) throw new HttpError(400, "期限の日付が正しくありません。", "VALIDATION_ERROR");
  if (task.startDate && task.dueDate && task.startDate > task.dueDate) throw new HttpError(400, "期限は開始日以降に設定してください。", "VALIDATION_ERROR");
  if (!VALID_PRIORITIES.has(task.priority)) throw new HttpError(400, "優先度の値が正しくありません。", "VALIDATION_ERROR");
  if (!VALID_STATUSES.has(task.status)) throw new HttpError(400, "タスク状態の値が正しくありません。", "VALIDATION_ERROR");
  return task;
}

export function parseTasks(csv) {
  const rows = parseCsv(String(csv || "").replace(/^\uFEFF/, ""));
  if (!rows.length) return [];
  const supportedHeaders = [HEADERS, DEADLINE_HEADERS, LEGACY_HEADERS];
  const validFormat = supportedHeaders.some((headers) => rows[0].length === headers.length && headers.every((header, index) => rows[0][index] === header));
  if (!validFormat) {
    throw new Error("The stored CSV has invalid headers.");
  }
  const column = Object.fromEntries(rows[0].map((header, index) => [header, index]));
  if (rows.length - 1 > MAX_TASKS) throw new Error("The stored CSV has too many rows.");
  return rows.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row, index) => {
    if (row.length !== rows[0].length) throw new Error(`Malformed CSV row ${index + 2}.`);
    return {
      id: row[0],
      title: restoreCsvText(row[1]),
      description: restoreCsvText(row[2]),
      owner: restoreCsvText(row[3]),
      startDate: column.StartDate == null ? "" : row[column.StartDate],
      dueDate: column.DueDate == null ? "" : row[column.DueDate],
      priority: row[column.Priority] || "Medium",
      status: row[column.Status] || "Pending",
      createdAt: row[column.CreatedAt] || "",
      completedAt: column.CompletedAt == null ? "" : row[column.CompletedAt],
    };
  });
}

export function serializeCsv(tasks) {
  const rows = [HEADERS, ...tasks.map((task) => [
    task.id,
    safeCsvText(task.title),
    safeCsvText(task.description),
    safeCsvText(task.owner),
    task.startDate || "",
    task.dueDate || "",
    task.priority,
    task.status,
    task.createdAt,
    task.completedAt || "",
  ])];
  const csv = `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) throw new HttpError(409, "保存容量の上限を超えます。", "LIMIT_REACHED");
  return csv;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") {
      if (field.endsWith("\r")) field = field.slice(0, -1);
      row.push(field); rows.push(row); row = []; field = "";
    } else field += character;
  }
  if (quoted) throw new Error("The stored CSV contains an unterminated quote.");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function escapeCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function safeCsvText(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? `\t${text}` : text;
}

function restoreCsvText(value) {
  return String(value || "").replace(/^\t(?=[=+\-@])/, "");
}

export function clean(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

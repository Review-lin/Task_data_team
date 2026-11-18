import { HttpError } from "./http.mjs";

const HEADERS = ["ID", "Title", "Description", "Owner", "Priority", "Status", "CreatedAt"];
const VALID_PRIORITIES = new Set(["Low", "Medium", "High"]);
const VALID_STATUSES = new Set(["Pending", "Completed"]);
export const MAX_TASKS = 5000;
export const MAX_CSV_BYTES = 5 * 1024 * 1024;

export function validateTask(input, requireId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "Task data is required.", "VALIDATION_ERROR");
  }
  const task = {
    id: clean(input.id, 100),
    title: clean(input.title, 150),
    description: clean(input.description, 2000),
    owner: clean(input.owner, 100),
    priority: clean(input.priority, 20) || "Medium",
    status: clean(input.status, 20) || "Pending",
    createdAt: "",
  };
  if (requireId && !task.id) throw new HttpError(400, "A task ID is required.", "VALIDATION_ERROR");
  if (!task.title) throw new HttpError(400, "A task title is required.", "VALIDATION_ERROR");
  if (!task.owner) throw new HttpError(400, "A task owner is required.", "VALIDATION_ERROR");
  if (!VALID_PRIORITIES.has(task.priority)) throw new HttpError(400, "Priority must be Low, Medium, or High.", "VALIDATION_ERROR");
  if (!VALID_STATUSES.has(task.status)) throw new HttpError(400, "Status must be Pending or Completed.", "VALIDATION_ERROR");
  return task;
}

export function parseTasks(csv) {
  const rows = parseCsv(String(csv || "").replace(/^\uFEFF/, ""));
  if (!rows.length) return [];
  if (rows[0].length !== HEADERS.length || !HEADERS.every((header, index) => rows[0][index] === header)) {
    throw new Error("The stored CSV has invalid headers.");
  }
  if (rows.length - 1 > MAX_TASKS) throw new Error("The stored CSV has too many rows.");
  return rows.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row, index) => {
    if (row.length !== HEADERS.length) throw new Error(`Malformed CSV row ${index + 2}.`);
    return {
      id: row[0],
      title: restoreCsvText(row[1]),
      description: restoreCsvText(row[2]),
      owner: restoreCsvText(row[3]),
      priority: row[4] || "Medium",
      status: row[5] || "Pending",
      createdAt: row[6] || "",
    };
  });
}

export function serializeCsv(tasks) {
  const rows = [HEADERS, ...tasks.map((task) => [
    task.id,
    safeCsvText(task.title),
    safeCsvText(task.description),
    safeCsvText(task.owner),
    task.priority,
    task.status,
    task.createdAt,
  ])];
  const csv = `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) throw new HttpError(409, "The CSV storage limit would be exceeded.", "LIMIT_REACHED");
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

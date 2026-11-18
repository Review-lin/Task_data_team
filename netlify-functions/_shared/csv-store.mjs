import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { clean, MAX_CSV_BYTES, MAX_TASKS, parseTasks, serializeCsv, validateTask } from "./csv-codec.mjs";
import { HttpError } from "./http.mjs";

const STORE_NAME = "daymark-data";
const CSV_KEY = "tasks.csv";

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function listTasks() {
  return (await readSnapshot()).tasks;
}

export async function createTask(input) {
  const task = validateTask(input, false);
  task.id = randomUUID();
  task.createdAt = new Date().toISOString();
  return mutateTasks((tasks) => {
    if (tasks.length >= MAX_TASKS) throw new HttpError(409, "The CSV task limit has been reached.", "LIMIT_REACHED");
    tasks.push(task);
    return task;
  });
}

export async function updateTask(input) {
  const task = validateTask(input, true);
  return mutateTasks((tasks) => {
    const index = tasks.findIndex((item) => item.id === task.id);
    if (index === -1) throw new HttpError(404, "Task not found.", "NOT_FOUND");
    task.createdAt = tasks[index].createdAt;
    tasks[index] = task;
    return task;
  });
}

export async function deleteTask(input) {
  const id = clean(input?.id, 100);
  if (!id) throw new HttpError(400, "A task ID is required.", "VALIDATION_ERROR");
  return mutateTasks((tasks) => {
    const index = tasks.findIndex((item) => item.id === id);
    if (index === -1) throw new HttpError(404, "Task not found.", "NOT_FOUND");
    tasks.splice(index, 1);
    return null;
  });
}

async function mutateTasks(mutator) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snapshot = await readSnapshot();
    const result = mutator(snapshot.tasks);
    const csv = serializeCsv(snapshot.tasks);
    const options = snapshot.etag ? { onlyIfMatch: snapshot.etag } : { onlyIfNew: true };
    const write = await store().set(CSV_KEY, csv, options);
    if (write.modified) return result;
  }
  throw new HttpError(409, "The task list changed at the same time. Please try again.", "WRITE_CONFLICT");
}

async function readSnapshot() {
  const entry = await store().getWithMetadata(CSV_KEY, { consistency: "strong", type: "text" });
  if (!entry) return { tasks: [], etag: null };
  if (Buffer.byteLength(entry.data, "utf8") > MAX_CSV_BYTES) throw new Error("The stored CSV is too large.");
  return { tasks: parseTasks(entry.data), etag: entry.etag };
}


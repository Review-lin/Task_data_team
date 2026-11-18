import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { clean, MAX_CSV_BYTES, MAX_TASKS, parseTasks, serializeCsv, validateTask } from "./csv-codec.mjs";
import { HttpError } from "./http.mjs";

const STORE_NAME = "task-manage-datateam-data";
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
    if (tasks.length >= MAX_TASKS) throw new HttpError(409, "保存できるタスク数の上限に達しました。", "LIMIT_REACHED");
    tasks.push(task);
    return task;
  });
}

export async function updateTask(input) {
  const task = validateTask(input, true);
  return mutateTasks((tasks) => {
    const index = tasks.findIndex((item) => item.id === task.id);
    if (index === -1) throw new HttpError(404, "タスクが見つかりません。", "NOT_FOUND");
    task.createdAt = tasks[index].createdAt;
    tasks[index] = task;
    return task;
  });
}

export async function deleteTask(input) {
  const id = clean(input?.id, 100);
  if (!id) throw new HttpError(400, "タスクIDが必要です。", "VALIDATION_ERROR");
  return mutateTasks((tasks) => {
    const index = tasks.findIndex((item) => item.id === id);
    if (index === -1) throw new HttpError(404, "タスクが見つかりません。", "NOT_FOUND");
    return tasks.splice(index, 1)[0];
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
  throw new HttpError(409, "同時にタスクが更新されました。もう一度お試しください。", "WRITE_CONFLICT");
}

async function readSnapshot() {
  const entry = await store().getWithMetadata(CSV_KEY, { consistency: "strong", type: "text" });
  if (!entry) return { tasks: [], etag: null };
  if (Buffer.byteLength(entry.data, "utf8") > MAX_CSV_BYTES) throw new Error("The stored CSV is too large.");
  return { tasks: parseTasks(entry.data), etag: entry.etag };
}


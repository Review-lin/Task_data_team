import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { HttpError } from "./http.mjs";

const STORE_NAME = "task-manage-datateam-owners";
const KEY = "owners.json";
const MAX_OWNERS = 50;
const DEFAULT_OWNERS = [{ id: "default-owner", name: "自分", createdAt: new Date(0).toISOString() }];

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function listOwners() {
  return (await readSnapshot()).owners;
}

export async function ownerExists(name) {
  const normalized = normalizeName(name);
  return (await listOwners()).some((owner) => normalizedKey(owner.name) === normalizedKey(normalized));
}

export async function getOwnerById(id) {
  return (await listOwners()).find((owner) => owner.id === String(id || "")) || null;
}

export async function createOwner(input) {
  const name = normalizeName(input?.name);
  return mutateOwners((owners) => {
    if (owners.length >= MAX_OWNERS) throw new HttpError(409, "登録できる担当者数の上限に達しました。", "LIMIT_REACHED");
    assertUnique(owners, name);
    const owner = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    owners.push(owner);
    return owner;
  });
}

export async function renameOwner(input) {
  const id = String(input?.id || "");
  const name = normalizeName(input?.name);
  return mutateOwners((owners) => {
    const index = owners.findIndex((owner) => owner.id === id);
    if (index === -1) throw new HttpError(404, "担当者が見つかりません。", "NOT_FOUND");
    assertUnique(owners, name, id);
    const previousName = owners[index].name;
    owners[index] = { ...owners[index], name };
    return { owner: owners[index], previousName };
  });
}

export async function deleteOwner(input) {
  const id = String(input?.id || "");
  return mutateOwners((owners) => {
    if (owners.length <= 1) throw new HttpError(409, "担当者は1名以上必要です。", "LAST_OWNER");
    const index = owners.findIndex((owner) => owner.id === id);
    if (index === -1) throw new HttpError(404, "担当者が見つかりません。", "NOT_FOUND");
    return owners.splice(index, 1)[0];
  });
}

async function mutateOwners(mutator) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snapshot = await readSnapshot();
    const result = mutator(snapshot.owners);
    const options = snapshot.etag ? { onlyIfMatch: snapshot.etag } : { onlyIfNew: true };
    const write = await store().setJSON(KEY, snapshot.owners, options);
    if (write.modified) return result;
  }
  throw new HttpError(409, "担当者が同時に更新されました。もう一度お試しください。", "WRITE_CONFLICT");
}

async function readSnapshot() {
  const entry = await store().getWithMetadata(KEY, { consistency: "strong", type: "json" });
  if (!entry) return { owners: DEFAULT_OWNERS.map((owner) => ({ ...owner })), etag: null };
  if (!Array.isArray(entry.data)) throw new Error("Owner data has an invalid format.");
  const owners = entry.data.map(validateStoredOwner);
  if (!owners.length || owners.length > MAX_OWNERS) throw new Error("Owner data contains an invalid number of entries.");
  return { owners, etag: entry.etag };
}

function validateStoredOwner(owner) {
  const id = String(owner?.id || "");
  const name = normalizeName(owner?.name);
  if (!id || id.length > 100) throw new Error("Owner data contains an invalid ID.");
  return { id, name, createdAt: String(owner?.createdAt || "") };
}

function normalizeName(value) {
  const name = String(value == null ? "" : value).normalize("NFKC").trim();
  if (!name) throw new HttpError(400, "担当者名を入力してください。", "VALIDATION_ERROR");
  if (name.length > 50) throw new HttpError(400, "担当者名は50文字以内で入力してください。", "VALIDATION_ERROR");
  if (/[\u0000-\u001F\u007F]/.test(name)) throw new HttpError(400, "担当者名に使用できない文字が含まれています。", "VALIDATION_ERROR");
  return name;
}

function normalizedKey(name) {
  return name.toLocaleLowerCase("ja-JP");
}

function assertUnique(owners, name, ignoredId = "") {
  if (owners.some((owner) => owner.id !== ignoredId && normalizedKey(owner.name) === normalizedKey(name))) {
    throw new HttpError(409, "同じ担当者名がすでに登録されています。", "DUPLICATE_OWNER");
  }
}

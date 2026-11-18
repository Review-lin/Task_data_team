import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import webpush from "web-push";
import { HttpError } from "./http.mjs";

const STORE_NAME = "task-manage-datateam-push";
const KEY_PREFIX = "subscription-";
const MAX_SUBSCRIPTIONS = 10;

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Functions environment variable: ${name}`);
  return value;
}

function configureWebPush() {
  const subject = env("VAPID_SUBJECT");
  if (!/^(mailto:|https:\/\/)/.test(subject)) throw new Error("VAPID_SUBJECT must be a mailto: or https: URI.");
  webpush.setVapidDetails(subject, env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
}

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

function subscriptionKey(endpoint) {
  return `${KEY_PREFIX}${createHash("sha256").update(endpoint).digest("hex")}`;
}

function validateSubscription(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "通知の登録情報が必要です。", "VALIDATION_ERROR");
  }
  const endpoint = String(input.endpoint || "");
  const p256dh = String(input.keys?.p256dh || "");
  const auth = String(input.keys?.auth || "");
  if (!endpoint.startsWith("https://") || endpoint.length > 2048 || !p256dh || !auth || p256dh.length > 512 || auth.length > 256) {
    throw new HttpError(400, "通知の登録情報が正しくありません。", "VALIDATION_ERROR");
  }
  return { endpoint, expirationTime: input.expirationTime || null, keys: { p256dh, auth } };
}

export function getVapidPublicKey() {
  configureWebPush();
  return env("VAPID_PUBLIC_KEY");
}

export async function saveSubscription(input) {
  const subscription = validateSubscription(input);
  const subscriptions = await store().list({ prefix: KEY_PREFIX });
  const key = subscriptionKey(subscription.endpoint);
  const alreadyExists = subscriptions.blobs.some((blob) => blob.key === key);
  if (!alreadyExists && subscriptions.blobs.length >= MAX_SUBSCRIPTIONS) {
    throw new HttpError(409, "登録できる通知端末数の上限に達しました。", "LIMIT_REACHED");
  }
  await store().setJSON(key, subscription);
  return subscription;
}

export async function removeSubscription(input) {
  const endpoint = String(input?.endpoint || "");
  if (!endpoint.startsWith("https://") || endpoint.length > 2048) {
    throw new HttpError(400, "通知の登録情報が正しくありません。", "VALIDATION_ERROR");
  }
  await store().delete(subscriptionKey(endpoint));
}

export async function sendWelcomeNotification(subscription) {
  configureWebPush();
  await webpush.sendNotification(subscription, JSON.stringify({
    title: "通知を有効にしました",
    body: "Task Manage DataTeamから更新をお知らせします。",
    tag: "push-enabled",
    url: "/",
  }), { TTL: 60, urgency: "normal" });
}

export async function notifyTaskChange(action, task) {
  try {
    configureWebPush();
    const listing = await store().list({ prefix: KEY_PREFIX });
    if (!listing.blobs.length) return;

    const payload = JSON.stringify(notificationPayload(action, task));
    await Promise.all(listing.blobs.slice(0, MAX_SUBSCRIPTIONS).map(async (blob) => {
      const subscription = await store().get(blob.key, { consistency: "strong", type: "json" });
      if (!subscription) return;
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 3600, urgency: "normal", topic: "task-change" });
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) await store().delete(blob.key);
        else console.error("Push delivery failed", error);
      }
    }));
  } catch (error) {
    // Task writes must succeed even when push delivery is temporarily unavailable.
    console.error("Push notification setup failed", error);
  }
}

function notificationPayload(action, task) {
  const title = action === "create"
    ? "タスクを追加しました"
    : action === "delete"
      ? "タスクを削除しました"
      : task?.status === "Completed"
        ? "タスクを完了しました"
        : "タスクを更新しました";
  return {
    title,
    body: String(task?.title || "タスクに変更があります。").slice(0, 100),
    tag: `task-${String(task?.id || "update").slice(0, 24)}`,
    url: "/",
  };
}

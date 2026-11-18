import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http.mjs";

const COOKIE_NAME = "task_manage_datateam_session";
const SESSION_SECONDS = 8 * 60 * 60;

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Functions environment variable: ${name}`);
  return value;
}

function sessionSecret() {
  const value = env("SESSION_SECRET");
  if (value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return value;
}

function sign(value) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const a = createHash("sha256").update(String(left)).digest();
  const b = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(a, b);
}

export function verifyLogin(username, password) {
  const expectedUsername = env("AUTH_USERNAME");
  const expectedPassword = env("AUTH_PASSWORD");
  if (expectedPassword.length < 12) throw new Error("AUTH_PASSWORD must contain at least 12 characters.");
  const passwordMatches = safeEqual(String(password || ""), expectedPassword);
  const usernameMatches = safeEqual(String(username || ""), expectedUsername);
  return passwordMatches && usernameMatches;
}

export function createSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: env("AUTH_USERNAME"),
    iat: now,
    exp: now + SESSION_SECONDS,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function requireSession(request) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const token = cookies[COOKIE_NAME];
  if (!token) throw new HttpError(401, "ログインの有効期限が切れました。もう一度ログインしてください。", "UNAUTHORIZED");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) {
    throw new HttpError(401, "ログインの有効期限が切れました。もう一度ログインしてください。", "UNAUTHORIZED");
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (claims.sub !== env("AUTH_USERNAME") || !Number.isInteger(claims.exp) || claims.exp <= now) {
      throw new Error("Invalid claims");
    }
    return { username: claims.sub };
  } catch {
    throw new HttpError(401, "ログインの有効期限が切れました。もう一度ログインしてください。", "UNAUTHORIZED");
  }
}

export function sessionCookie(token, request) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Priority=High; Max-Age=${SESSION_SECONDS}${secureSuffix(request)}`;
}

export function clearSessionCookie(request) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Priority=High; Max-Age=0${secureSuffix(request)}`;
}

function secureSuffix(request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? "" : "; Secure";
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part.trim(), ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }).filter(([key]) => key));
}

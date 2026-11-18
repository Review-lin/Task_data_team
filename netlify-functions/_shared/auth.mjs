import { createHmac, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./http.mjs";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "daymark_session";
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
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyLogin(username, password) {
  const expectedUsername = env("AUTH_USERNAME");
  const encodedHash = env("AUTH_PASSWORD_HASH");
  const parts = encodedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") throw new Error("AUTH_PASSWORD_HASH has an invalid format.");

  const salt = Buffer.from(parts[1], "base64url");
  const expectedHash = Buffer.from(parts[2], "base64url");
  if (salt.length < 16 || expectedHash.length !== 64) throw new Error("AUTH_PASSWORD_HASH has an invalid format.");
  const actualHash = await scrypt(String(password || ""), salt, 64);
  const passwordMatches = timingSafeEqual(actualHash, expectedHash);
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
  if (!token) throw new HttpError(401, "Your session has expired. Please sign in again.", "UNAUTHORIZED");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) {
    throw new HttpError(401, "Your session has expired. Please sign in again.", "UNAUTHORIZED");
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (claims.sub !== env("AUTH_USERNAME") || !Number.isInteger(claims.exp) || claims.exp <= now) {
      throw new Error("Invalid claims");
    }
    return { username: claims.sub };
  } catch {
    throw new HttpError(401, "Your session has expired. Please sign in again.", "UNAUTHORIZED");
  }
}

export function sessionCookie(token, request) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secureSuffix(request)}`;
}

export function clearSessionCookie(request) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureSuffix(request)}`;
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

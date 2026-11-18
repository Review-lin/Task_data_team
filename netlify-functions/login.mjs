import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { createSessionToken, sessionCookie, verifyLogin } from "./_shared/auth.mjs";
import { errorResponse, HttpError, json, readJson, requireMethod, requireSameOrigin } from "./_shared/http.mjs";

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export default async (request, context) => {
  try {
    requireMethod(request, ["POST"]);
    requireSameOrigin(request);
    const ip = context?.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";
    const rate = await getRate(ip);
    if (rate.count >= MAX_ATTEMPTS && rate.startedAt + RATE_WINDOW_MS > Date.now()) {
      throw new HttpError(429, "Too many sign-in attempts. Try again later.", "RATE_LIMITED");
    }

    const body = await readJson(request, 2_000);
    const valid = await verifyLogin(body.username, body.password);
    if (!valid) {
      await recordFailure(ip, rate);
      throw new HttpError(401, "Invalid username or password.", "INVALID_LOGIN");
    }

    await clearFailures(ip);
    const token = createSessionToken();
    return json({ ok: true, user: { displayName: "Task owner" } }, 200, {
      "Set-Cookie": sessionCookie(token, request),
    });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config = { path: "/api/login" };

function rateStore() {
  return getStore({ name: "daymark-login-rate", consistency: "strong" });
}

function rateKey(ip) {
  return `ip-${createHash("sha256").update(ip).digest("hex")}`;
}

async function getRate(ip) {
  return (await rateStore().get(rateKey(ip), { consistency: "strong", type: "json" })) || { count: 0, startedAt: Date.now() };
}

async function recordFailure(ip, current) {
  const now = Date.now();
  const value = current.startedAt + RATE_WINDOW_MS > now
    ? { count: current.count + 1, startedAt: current.startedAt }
    : { count: 1, startedAt: now };
  await rateStore().setJSON(rateKey(ip), value);
}

async function clearFailures(ip) {
  await rateStore().delete(rateKey(ip));
}

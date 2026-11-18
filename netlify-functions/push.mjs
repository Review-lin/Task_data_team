import { requireSession } from "./_shared/auth.mjs";
import { errorResponse, HttpError, json, readJson, requireMethod, requireSameOrigin } from "./_shared/http.mjs";
import { getVapidPublicKey, removeSubscription, saveSubscription, sendWelcomeNotification } from "./_shared/push-service.mjs";

export default async (request) => {
  try {
    requireMethod(request, ["GET", "POST"]);
    requireSession(request);

    if (request.method === "GET") {
      return json({ ok: true, publicKey: getVapidPublicKey() });
    }

    requireSameOrigin(request);
    const body = await readJson(request, 8_000);
    if (body.action === "subscribe") {
      const subscription = await saveSubscription(body.subscription);
      try {
        await sendWelcomeNotification(subscription);
      } catch (error) {
        console.error("Welcome push failed", error);
      }
      return json({ ok: true });
    }
    if (body.action === "unsubscribe") {
      await removeSubscription(body.subscription);
      return json({ ok: true });
    }
    throw new HttpError(400, "対応していない通知操作です。", "BAD_REQUEST");
  } catch (error) {
    return errorResponse(error);
  }
};

export const config = { path: "/api/push" };

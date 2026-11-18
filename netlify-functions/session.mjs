import { requireSession } from "./_shared/auth.mjs";
import { errorResponse, json, requireMethod } from "./_shared/http.mjs";

export default async (request) => {
  try {
    requireMethod(request, ["GET"]);
    requireSession(request);
    return json({ ok: true, user: { displayName: "データチーム" } });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config = { path: "/api/session" };

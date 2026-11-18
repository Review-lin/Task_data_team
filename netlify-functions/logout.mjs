import { clearSessionCookie } from "./_shared/auth.mjs";
import { errorResponse, json, requireMethod, requireSameOrigin } from "./_shared/http.mjs";

export default async (request) => {
  try {
    requireMethod(request, ["POST"]);
    requireSameOrigin(request);
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config = { path: "/api/logout" };

export class HttpError extends Error {
  constructor(status, message, code = "REQUEST_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function errorResponse(error) {
  if (error instanceof HttpError) {
    return json({ ok: false, code: error.code, error: error.message }, error.status);
  }
  console.error(error);
  return json({ ok: false, code: "SERVER_ERROR", error: "サーバーで処理を完了できませんでした。" }, 500);
}

export async function readJson(request, maxBytes = 16_000) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new HttpError(413, "送信データが大きすぎます。", "TOO_LARGE");
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new HttpError(413, "送信データが大きすぎます。", "TOO_LARGE");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "送信データの形式が正しくありません。", "BAD_REQUEST");
  }
}

export function requireSameOrigin(request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) throw new HttpError(403, "外部サイトからのリクエストは許可されていません。", "FORBIDDEN");
}

export function requireMethod(request, methods) {
  if (!methods.includes(request.method)) {
    throw new HttpError(405, "許可されていない操作です。", "METHOD_NOT_ALLOWED");
  }
}

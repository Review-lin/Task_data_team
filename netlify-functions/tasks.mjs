import { requireSession } from "./_shared/auth.mjs";
import { createTask, deleteTask, listTasks, updateTask } from "./_shared/csv-store.mjs";
import { errorResponse, HttpError, json, readJson, requireMethod, requireSameOrigin } from "./_shared/http.mjs";

export default async (request) => {
  try {
    requireMethod(request, ["GET", "POST"]);
    requireSession(request);

    if (request.method === "GET") {
      return json({ ok: true, tasks: await listTasks() });
    }

    requireSameOrigin(request);
    const body = await readJson(request);
    if (body.action === "create") return json({ ok: true, task: await createTask(body.data) }, 201);
    if (body.action === "update") return json({ ok: true, task: await updateTask(body.data) });
    if (body.action === "delete") {
      await deleteTask(body.data);
      return json({ ok: true });
    }
    throw new HttpError(400, "対応していないタスク操作です。", "BAD_REQUEST");
  } catch (error) {
    return errorResponse(error);
  }
};

export const config = { path: "/api/tasks" };

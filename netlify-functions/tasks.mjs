import { requireSession } from "./_shared/auth.mjs";
import { createTask, deleteTask, listTasks, updateTask } from "./_shared/csv-store.mjs";
import { errorResponse, HttpError, json, readJson, requireMethod, requireSameOrigin } from "./_shared/http.mjs";
import { notifyTaskChange } from "./_shared/push-service.mjs";
import { ownerExists } from "./_shared/owner-store.mjs";

export default async (request) => {
  try {
    requireMethod(request, ["GET", "POST"]);
    requireSession(request);

    if (request.method === "GET") {
      return json({ ok: true, tasks: await listTasks() });
    }

    requireSameOrigin(request);
    const body = await readJson(request);
    if (body.action === "create") {
      if (!await ownerExists(body.data?.owner)) throw new HttpError(400, "登録されていない担当者です。", "INVALID_OWNER");
      const task = await createTask(body.data);
      await notifyTaskChange("create", task);
      return json({ ok: true, task }, 201);
    }
    if (body.action === "update") {
      if (!await ownerExists(body.data?.owner)) throw new HttpError(400, "登録されていない担当者です。", "INVALID_OWNER");
      const task = await updateTask(body.data);
      await notifyTaskChange("update", task);
      return json({ ok: true, task });
    }
    if (body.action === "delete") {
      const task = await deleteTask(body.data);
      await notifyTaskChange("delete", task);
      return json({ ok: true });
    }
    throw new HttpError(400, "対応していないタスク操作です。", "BAD_REQUEST");
  } catch (error) {
    return errorResponse(error);
  }
};

export const config = { path: "/api/tasks" };

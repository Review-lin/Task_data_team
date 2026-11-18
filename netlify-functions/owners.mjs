import { requireSession } from "./_shared/auth.mjs";
import { countTasksForOwner, renameTasksOwner } from "./_shared/csv-store.mjs";
import { errorResponse, HttpError, json, readJson, requireMethod, requireSameOrigin } from "./_shared/http.mjs";
import { createOwner, deleteOwner, getOwnerById, listOwners, renameOwner } from "./_shared/owner-store.mjs";

export default async (request) => {
  try {
    requireMethod(request, ["GET", "POST"]);
    requireSession(request);

    if (request.method === "GET") return json({ ok: true, owners: await listOwners() });

    requireSameOrigin(request);
    const body = await readJson(request, 4_000);
    if (body.action === "create") return json({ ok: true, owner: await createOwner(body.data) }, 201);
    if (body.action === "rename") {
      const currentOwner = await getOwnerById(body.data?.id);
      if (!currentOwner) throw new HttpError(404, "担当者が見つかりません。", "NOT_FOUND");
      const taskCount = await countTasksForOwner(currentOwner.name);
      const result = await renameOwner(body.data);
      try {
        if (taskCount > 0) await renameTasksOwner(result.previousName, result.owner.name);
      } catch (error) {
        try {
          await renameOwner({ id: result.owner.id, name: result.previousName });
        } catch (rollbackError) {
          console.error("Failed to roll back owner rename", rollbackError);
        }
        throw error;
      }
      return json({ ok: true, owner: result.owner });
    }
    if (body.action === "delete") {
      const owner = await getOwnerById(body.data?.id);
      if (!owner) throw new HttpError(404, "担当者が見つかりません。", "NOT_FOUND");
      const taskCount = await countTasksForOwner(owner.name);
      if (taskCount > 0) {
        throw new HttpError(409, `この担当者には${taskCount}件のタスクがあります。先に担当者を変更してください。`, "OWNER_IN_USE");
      }
      await deleteOwner(body.data);
      return json({ ok: true });
    }
    throw new HttpError(400, "対応していない担当者操作です。", "BAD_REQUEST");
  } catch (error) {
    return errorResponse(error);
  }
};

export const config = { path: "/api/owners" };

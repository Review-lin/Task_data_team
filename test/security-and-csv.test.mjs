import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionCookie,
  createSessionToken,
  requireSession,
  sessionCookie,
  verifyLogin,
} from "../netlify-functions/_shared/auth.mjs";
import { parseTasks, serializeCsv, validateTask } from "../netlify-functions/_shared/csv-codec.mjs";
import { HttpError, requireSameOrigin } from "../netlify-functions/_shared/http.mjs";

test.before(() => {
  process.env.AUTH_USERNAME = "owner";
  process.env.AUTH_PASSWORD = "correct horse battery staple";
  process.env.SESSION_SECRET = "test-only-session-secret-that-is-long-enough";
});

test("password verification accepts only the exact credentials", () => {
  assert.equal(verifyLogin("owner", "correct horse battery staple"), true);
  assert.equal(verifyLogin("Owner", "correct horse battery staple"), false);
  assert.equal(verifyLogin("owner", "wrong password"), false);
});

test("session cookie is HttpOnly and signed tokens reject tampering", () => {
  const request = new Request("https://tasks.example.com/api/session");
  const token = createSessionToken();
  const cookie = sessionCookie(token, request);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /; Secure/);
  const authenticated = new Request(request.url, { headers: { Cookie: cookie.split(";")[0] } });
  assert.equal(requireSession(authenticated).username, "owner");

  const tampered = new Request(request.url, { headers: { Cookie: `task_manage_datateam_session=${token}x` } });
  assert.throws(() => requireSession(tampered), (error) => error instanceof HttpError && error.status === 401);
  assert.match(clearSessionCookie(request), /Max-Age=0/);
});

test("same-origin protection rejects foreign and missing origins", () => {
  assert.doesNotThrow(() => requireSameOrigin(new Request("https://tasks.example.com/api/tasks", { headers: { Origin: "https://tasks.example.com" } })));
  assert.throws(() => requireSameOrigin(new Request("https://tasks.example.com/api/tasks", { headers: { Origin: "https://evil.example" } })), HttpError);
  assert.throws(() => requireSameOrigin(new Request("https://tasks.example.com/api/tasks")), HttpError);
});

test("CSV round-trips commas, quotes, newlines, and formula-like text", () => {
  const task = {
    id: "task-1",
    title: "=SUM(1,2)",
    description: "First line, with comma\n\"Second line\"",
    owner: "Me",
    startDate: "2026-11-18",
    dueDate: "2026-11-30",
    priority: "High",
    status: "Pending",
    createdAt: "2026-11-18T00:00:00.000Z",
    completedAt: "",
  };
  const csv = serializeCsv([task]);
  assert.match(csv, /\t=SUM/);
  assert.deepEqual(parseTasks(csv), [task]);
});

test("legacy CSV files load with an empty deadline", () => {
  const csv = '"ID","Title","Description","Owner","Priority","Status","CreatedAt"\r\n"task-1","Task","","Me","Medium","Pending","2026-11-18T00:00:00.000Z"\r\n';
  assert.equal(parseTasks(csv)[0].dueDate, "");
  assert.equal(parseTasks(csv)[0].startDate, "");
  assert.equal(parseTasks(csv)[0].completedAt, "");
});

test("deadline CSV files load with empty analytics timestamps", () => {
  const csv = '"ID","Title","Description","Owner","DueDate","Priority","Status","CreatedAt"\r\n"task-1","Task","","Me","2026-11-30","Medium","Completed","2026-11-18T00:00:00.000Z"\r\n';
  const task = parseTasks(csv)[0];
  assert.equal(task.dueDate, "2026-11-30");
  assert.equal(task.startDate, "");
  assert.equal(task.completedAt, "");
});

test("task validation enforces required fields and enums", () => {
  assert.equal(validateTask({ title: "Task", owner: "Me", priority: "Low", status: "Pending" }, false).title, "Task");
  assert.throws(() => validateTask({ title: "Task", owner: "Me", priority: "Urgent" }, false), HttpError);
  assert.throws(() => validateTask({ owner: "Me" }, false), HttpError);
  assert.throws(() => validateTask({ title: "Task", owner: "Me", dueDate: "2026-02-30" }, false), HttpError);
  assert.throws(() => validateTask({ title: "Task", owner: "Me", startDate: "2026-12-01", dueDate: "2026-11-30" }, false), HttpError);
});

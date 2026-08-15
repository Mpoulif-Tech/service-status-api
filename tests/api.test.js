import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { createHandler } from "../src/app.js";
import { JsonRepository } from "../src/repository.js";

async function fixture(t) {
  const temporaryRoot = join(process.cwd(), ".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(join(temporaryRoot, "service-status-api-"));
  const filePath = join(directory, "status.json");
  const repository = await new JsonRepository(filePath).init();
  const ids = ["request-1", "service-1", "request-2", "incident-1", "request-3", "request-4", "request-5", "request-6"];
  const handler = createHandler({
    repository,
    clock: () => new Date("2026-08-15T12:00:00.000Z"),
    idFactory: () => ids.shift() ?? "fallback-id",
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { baseUrl: `http://127.0.0.1:${address.port}`, filePath };
}

async function json(response) {
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test("runs a complete service incident lifecycle", async (t) => {
  const { baseUrl, filePath } = await fixture(t);

  const createdService = await json(
    await fetch(`${baseUrl}/api/services`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Public API", url: "https://api.example.com" }),
    }),
  );
  assert.equal(createdService.status, 201);
  assert.equal(createdService.body.data.id, "service-1");

  const createdIncident = await json(
    await fetch(`${baseUrl}/api/incidents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serviceId: "service-1", title: "Elevated response times", severity: "high" }),
    }),
  );
  assert.equal(createdIncident.status, 201);
  assert.equal(createdIncident.body.data.status, "open");

  const activeSummary = await json(await fetch(`${baseUrl}/api/summary`));
  assert.equal(activeSummary.body.data.statusBreakdown.degraded, 1);
  assert.equal(activeSummary.body.data.totals.openIncidents, 1);

  const resolved = await json(await fetch(`${baseUrl}/api/incidents/incident-1/resolve`, { method: "PATCH" }));
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.data.status, "resolved");

  const healthySummary = await json(await fetch(`${baseUrl}/api/summary`));
  assert.equal(healthySummary.body.data.statusBreakdown.operational, 1);
  assert.equal(healthySummary.body.data.totals.openIncidents, 0);

  const persisted = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(persisted.services.length, 1);
  assert.equal(persisted.incidents[0].status, "resolved");
});

test("returns structured validation and routing errors", async (t) => {
  const { baseUrl } = await fixture(t);
  const invalid = await json(
    await fetch(`${baseUrl}/api/services`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "client-request" },
      body: JSON.stringify({ name: "", url: "invalid" }),
    }),
  );
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
  assert.equal(invalid.body.error.requestId, "client-request");
  assert.equal(invalid.headers.get("x-request-id"), "client-request");

  const missing = await json(await fetch(`${baseUrl}/missing`));
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "NOT_FOUND");
});

test("rejects malformed JSON", async (t) => {
  const { baseUrl } = await fixture(t);
  const response = await json(
    await fetch(`${baseUrl}/api/services`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{broken",
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_JSON");
});

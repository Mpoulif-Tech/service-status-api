import { randomUUID } from "node:crypto";
import { validateIncident, validateService } from "./validation.js";

const JSON_LIMIT = 1_000_000;
const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };

function sendJson(response, status, body, requestId, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-request-id": requestId,
    ...headers,
  });
  response.end(payload);
}

function problem(response, status, code, message, requestId, details) {
  sendJson(response, status, { error: { code, message, requestId, ...(details && { details }) } }, requestId);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > JSON_LIMIT) {
      const error = new Error("Request body exceeds 1 MB.");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function serviceState(serviceId, openIncidents) {
  const incidents = openIncidents.filter((incident) => incident.serviceId === serviceId);
  const highest = incidents.reduce((rank, incident) => Math.max(rank, severityRank[incident.severity]), 0);
  if (highest >= severityRank.critical) return "outage";
  if (highest >= severityRank.medium) return "degraded";
  return "operational";
}

export function createHandler(options) {
  const { repository } = options;
  const clock = options.clock ?? (() => new Date());
  const idFactory = options.idFactory ?? randomUUID;

  return async function handler(request, response) {
    const requestId = request.headers["x-request-id"] || idFactory();
    const url = new URL(request.url, "http://localhost");

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, { status: "ok", timestamp: clock().toISOString() }, requestId);
      }

      if (request.method === "GET" && url.pathname === "/api/services") {
        return sendJson(response, 200, { data: repository.listServices() }, requestId);
      }

      if (request.method === "POST" && url.pathname === "/api/services") {
        const { value, errors } = validateService(await readJson(request));
        if (Object.keys(errors).length) {
          return problem(response, 422, "VALIDATION_ERROR", "Service is invalid.", requestId, errors);
        }
        const service = await repository.createService({
          id: idFactory(),
          ...value,
          createdAt: clock().toISOString(),
        });
        return sendJson(response, 201, { data: service }, requestId, { location: `/api/services/${service.id}` });
      }

      if (request.method === "GET" && url.pathname === "/api/incidents") {
        const status = url.searchParams.get("status") || undefined;
        if (status && !["open", "resolved"].includes(status)) {
          return problem(response, 400, "INVALID_FILTER", "status must be open or resolved.", requestId);
        }
        const data = repository.listIncidents({
          serviceId: url.searchParams.get("serviceId") || undefined,
          status,
        });
        return sendJson(response, 200, { data }, requestId);
      }

      if (request.method === "POST" && url.pathname === "/api/incidents") {
        const { value, errors } = validateIncident(await readJson(request));
        if (Object.keys(errors).length) {
          return problem(response, 422, "VALIDATION_ERROR", "Incident is invalid.", requestId, errors);
        }
        if (!repository.findService(value.serviceId)) {
          return problem(response, 404, "SERVICE_NOT_FOUND", "The referenced service does not exist.", requestId);
        }
        const incident = await repository.createIncident({
          id: idFactory(),
          ...value,
          status: "open",
          startedAt: clock().toISOString(),
          resolvedAt: null,
        });
        return sendJson(response, 201, { data: incident }, requestId, { location: `/api/incidents/${incident.id}` });
      }

      const resolveMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)\/resolve$/);
      if (request.method === "PATCH" && resolveMatch) {
        const incident = await repository.resolveIncident(decodeURIComponent(resolveMatch[1]), clock().toISOString());
        if (!incident) return problem(response, 404, "INCIDENT_NOT_FOUND", "Incident not found.", requestId);
        return sendJson(response, 200, { data: incident }, requestId);
      }

      if (request.method === "GET" && url.pathname === "/api/summary") {
        const openIncidents = repository.listIncidents({ status: "open" });
        const services = repository.listServices().map((service) => ({
          ...service,
          status: serviceState(service.id, openIncidents),
          openIncidentCount: openIncidents.filter((incident) => incident.serviceId === service.id).length,
        }));
        const statusBreakdown = services.reduce(
          (summary, service) => ({ ...summary, [service.status]: summary[service.status] + 1 }),
          { operational: 0, degraded: 0, outage: 0 },
        );
        return sendJson(
          response,
          200,
          { data: { totals: { services: services.length, openIncidents: openIncidents.length }, statusBreakdown, services } },
          requestId,
        );
      }

      return problem(response, 404, "NOT_FOUND", "Route not found.", requestId);
    } catch (error) {
      if (error.code === "INVALID_JSON") return problem(response, 400, error.code, error.message, requestId);
      if (error.code === "BODY_TOO_LARGE") return problem(response, 413, error.code, error.message, requestId);
      console.error(JSON.stringify({ level: "error", requestId, message: error.message }));
      return problem(response, 500, "INTERNAL_ERROR", "An unexpected error occurred.", requestId);
    }
  };
}

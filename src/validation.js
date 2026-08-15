export const SEVERITIES = Object.freeze(["low", "medium", "high", "critical"]);

const text = (value) => String(value ?? "").trim();

function validHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validateService(input) {
  const errors = {};
  const name = text(input?.name);
  const url = text(input?.url);

  if (name.length < 2 || name.length > 80) {
    errors.name = "Name must contain between 2 and 80 characters.";
  }
  if (!validHttpUrl(url)) errors.url = "URL must be a complete http(s) URL.";

  return { value: { name, url }, errors };
}

export function validateIncident(input) {
  const errors = {};
  const serviceId = text(input?.serviceId);
  const title = text(input?.title);
  const severity = text(input?.severity).toLowerCase();

  if (!serviceId) errors.serviceId = "serviceId is required.";
  if (title.length < 4 || title.length > 120) {
    errors.title = "Title must contain between 4 and 120 characters.";
  }
  if (!SEVERITIES.includes(severity)) {
    errors.severity = `Severity must be one of: ${SEVERITIES.join(", ")}.`;
  }

  return { value: { serviceId, title, severity }, errors };
}

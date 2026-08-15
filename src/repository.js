import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_DATABASE = Object.freeze({ services: [], incidents: [] });

export class JsonRepository {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = structuredClone(EMPTY_DATABASE);
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!Array.isArray(parsed.services) || !Array.isArray(parsed.incidents)) {
        throw new Error("Database has an unsupported shape.");
      }
      this.data = parsed;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.#persist();
    }
    return this;
  }

  listServices() {
    return structuredClone(this.data.services);
  }

  findService(id) {
    return structuredClone(this.data.services.find((service) => service.id === id) ?? null);
  }

  async createService(service) {
    return this.#mutate((data) => {
      data.services.push(service);
      return service;
    });
  }

  listIncidents(filters = {}) {
    return structuredClone(
      this.data.incidents.filter((incident) => {
        if (filters.serviceId && incident.serviceId !== filters.serviceId) return false;
        if (filters.status && incident.status !== filters.status) return false;
        return true;
      }),
    );
  }

  async createIncident(incident) {
    return this.#mutate((data) => {
      data.incidents.push(incident);
      return incident;
    });
  }

  async resolveIncident(id, resolvedAt) {
    return this.#mutate((data) => {
      const incident = data.incidents.find((item) => item.id === id);
      if (!incident) return null;
      incident.status = "resolved";
      incident.resolvedAt = incident.resolvedAt ?? resolvedAt;
      return incident;
    });
  }

  async #mutate(change) {
    let result;
    this.writeQueue = this.writeQueue.then(async () => {
      result = change(this.data);
      await this.#persist();
    });
    await this.writeQueue;
    return structuredClone(result);
  }

  async #persist() {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

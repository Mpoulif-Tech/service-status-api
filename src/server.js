import { createServer } from "node:http";
import { resolve } from "node:path";
import { createHandler } from "./app.js";
import { JsonRepository } from "./repository.js";

const port = Number(process.env.PORT ?? 3000);
const dataFile = resolve(process.env.DATA_FILE ?? "data/status.json");
const repository = await new JsonRepository(dataFile).init();
const server = createServer(createHandler({ repository }));

server.listen(port, () => {
  console.log(JSON.stringify({ level: "info", message: "API listening", port, dataFile }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ level: "info", message: "Shutting down", signal }));
  server.close((error) => process.exit(error ? 1 : 0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

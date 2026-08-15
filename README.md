# Service Status API

A small production-minded REST API for registering services, tracking incidents and generating an operational status summary. It uses only the Node.js standard library while still demonstrating validation, persistence, error design, tests and containerization.

## API at a glance

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET/POST` | `/api/services` | List or register monitored services |
| `GET/POST` | `/api/incidents` | Filter or create incidents |
| `PATCH` | `/api/incidents/:id/resolve` | Resolve an incident idempotently |
| `GET` | `/api/summary` | Current operational/degraded/outage breakdown |

The full contract is documented in [`openapi.yaml`](openapi.yaml).

## Run locally

```bash
git clone https://github.com/Mpoulif-Tech/service-status-api.git
cd service-status-api
npm test
npm start
```

The API listens on `http://localhost:3000`.

```bash
curl -X POST http://localhost:3000/api/services \
  -H 'content-type: application/json' \
  -d '{"name":"Public API","url":"https://api.example.com"}'
```

## Run with Docker

```bash
docker build -t service-status-api .
docker run --rm -p 3000:3000 service-status-api
```

## Engineering highlights

- Atomic JSON persistence prevents partially written state
- Serialized writes avoid data races between concurrent mutations
- Consistent structured errors include stable codes and request IDs
- Request bodies are limited to 1 MB
- Dependency injection makes time, IDs and storage deterministic in tests
- Graceful shutdown supports container orchestration
- OpenAPI contract, Docker image and GitHub Actions workflow are included

## Test coverage

The integration suite starts the real HTTP server on an ephemeral port and covers:

- service creation and validation
- incident creation and resolution
- operational summary transitions
- durable file persistence
- malformed JSON and unknown routes

```bash
npm test
```

## License

[MIT](LICENSE)

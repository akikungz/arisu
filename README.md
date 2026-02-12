# Arisu

Arisu is a TypeScript/Node.js backend project utilizing Prisma ORM for database management. This project is structured for scalable authentication, user management, and platform integration.

## Features
- **Authentication**: Secure user authentication and session management
- **User Management**: Models for users, accounts, sessions, and verification
- **Prisma ORM**: Type-safe database access and migrations
- **TypeScript**: Modern, strongly-typed JavaScript
- **Docker Support**: Containerized development and deployment

## Project Structure
```
.
├── Dockerfile                # Containerization setup
├── package.json              # Project dependencies and scripts
├── prisma.config.ts          # Prisma configuration
├── tsconfig.json             # TypeScript configuration
├── src/
│   ├── auth.ts               # Authentication logic
│   ├── database.ts           # Database connection
│   ├── env.ts                # Environment variable management
│   ├── index.ts              # Entry point
│   ├── instrumentation.ts    # Monitoring/Instrumentation
│   └── prisma/
│       ├── schema.prisma     # Prisma schema definition
│       └── generated/        # Prisma generated client code
│           └── ...           # (browser, client, models, etc.)
```

## Observability
- **Metrics, traces, logs, and Grafana provisioning**: See `docs/observability.md`.

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- pnpm (or npm/yarn)
- Docker (optional, for containerization)
- A supported database (see `schema.prisma`)

### Installation
1. **Install dependencies:**
   ```bash
   pnpm install
   ```
2. **Set up environment variables:**
   - Copy `.env.example` to `.env` and fill in required values.
   - See the **Environment Variables** section below for details.
3. **Generate Prisma client:**
   ```bash
   pnpm prisma generate
   ```
4. **Run database migrations:**
   ```bash
   pnpm prisma migrate dev
   ```
5. **Start the application:**
   ```bash
   pnpm start
   ```

### Environment Variables
The `.env.example` file documents all supported settings. Copy it to `.env` and update values as needed.

| Variable                      | Required | Description                                                | Example                                         |
| ----------------------------- | -------- | ---------------------------------------------------------- | ----------------------------------------------- |
| `NODE_ENV`                    | No       | Runtime environment (`development`, `production`, `test`). | `development`                                   |
| `PORT`                        | No       | HTTP port for the server.                                  | `3000`                                          |
| `JWT_SECRET`                  | Yes      | Secret used to sign tokens (min 32 chars).                 | `change-me-32-chars-minimum`                    |
| `BETTER_AUTH_URL`             | No       | Base URL for Better Auth callbacks.                        | `https://auth.example.com`                      |
| `GOOGLE_CLIENT_ID`            | No       | Google OAuth client ID.                                    | `1234567890-abc.apps.googleusercontent.com`     |
| `GOOGLE_CLIENT_SECRET`        | No       | Google OAuth client secret.                                | `GOCSPX-xxxx`                                   |
| `ALLOW_CORS_ORIGINS`          | No       | Comma-separated list of allowed CORS origins.              | `http://localhost:3000,https://app.example.com` |
| `DATABASE_URL`                | Yes      | Postgres connection string.                                | `postgresql://user:pass@localhost:5432/arisu`   |
| `REDIS_URL`                   | No       | Redis connection string.                                   | `redis://localhost:6379`                        |
| `OTEL_SERVICE_NAME`           | No       | OpenTelemetry service name.                                | `momoi`                                         |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No       | OTLP collector endpoint.                                   | `http://localhost:4317`                         |
| `LOG_LEVEL`                   | No       | Log verbosity (`debug`, `info`, `warn`, `error`).          | `info`                                          |
| `LOG_FORMAT`                  | No       | Log output format (`json`, `plain`).                       | `plain`                                         |
| `LOG_PRETTY`                  | No       | Pretty-print logs when `true`.                             | `false`                                         |
| `LOG_LOKI_ENDPOINT`           | No       | Loki push endpoint.                                        | `http://localhost:3100`                         |

### Docker
To build and run with Docker:
```bash
docker build -t arisu .
docker run --env-file .env -p 3000:3000 arisu
```

## Scripts
- `pnpm start` — Start the application
- `pnpm dev` — Start in development mode (if available)
- `pnpm prisma generate` — Generate Prisma client
- `pnpm prisma migrate dev` — Run migrations

## License
MIT

---

*Generated by GitHub Copilot (GPT-4.1)*

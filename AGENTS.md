# Agent Instructions

This repository contains templates and scripts for Dokploy. Read `README.md` and `TEMPLATE.md` at the repo root before acting, and strictly adhere to the following rules to avoid common mistakes.

## 1. Local Development & Workflow

- Always use the wrapper script to start services: `npx tsx scripts/local-compose-up.ts <template-name> [options]` — never run `docker compose up` directly.
- You may run `docker compose down` to bring down local instances.

## 2. Common Docker Compose Mistakes

- Use `expose:` for ports, not `ports:` — Dokploy handles all external port routing.
- Omit `container_name:` — Dokploy manages container names automatically.
- Omit explicit `networks:` — Dokploy creates networks automatically for isolation.
- Use relative paths for volume mounts (e.g., `"../files/my-database:/var/lib/mysql"`), never absolute paths.
- Set `version` to `"3.8"` only.
- Name services in lowercase with hyphens (e.g., `my-service`, not `my_service` or `MyService`).

## 3. Common Template Configuration Mistakes

- `serviceName` must exactly match a service name defined in `docker-compose.yml`.
- Ports must be valid integers between 1 and 65535.
- Always use variable substitution in `host:` (e.g., `"${main_domain}"`), never hard-coded values like `"example.com"`.
- Only use recognized helpers: `${domain}`, `${password:length}`, `${base64:length}`, `${hash:length}`, `${uuid}`, `${randomPort}`, `${email}`, `${username}`, `${timestamp}`, `${timestamps:datetime}`, `${timestampms:datetime}`, `${jwt:secret_var:payload_var}`.
- `env:` must be an array of strings (e.g., `env = ["KEY=VALUE", "DB_PASSWORD=${db_pass}"]`), never an object.

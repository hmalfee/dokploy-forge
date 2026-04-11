# Dokploy Forge 🔨

> A toolkit for building, validating, and locally testing custom Docker Compose templates for [Dokploy](https://dokploy.com) — then deploying them in two clicks.

---

Dokploy's built-in templates are, frankly, _meh_. They require too much manual setup, don't let you customize easily, and — worst of all — getting a Docker Compose just right means deploying and rebuilding over and over until something sticks.

**Dokploy Forge fixes this.** Write your template once, validate it against Dokploy's spec, and test it locally until it's exactly right — then generate the Base64 import string and deploy with confidence. No more redeploy loops.

> Dokploy provisions services by decoding a single Base64 string containing both your `docker-compose.yml` and `template.toml`. Dokploy Forge helps you craft that string reliably.

## ✨ Highlights

- **Build your own templates** — Full authoring workflow with validation and local testing before anything touches your server.
- **Zero manual UI config** — No more fiddling with domains, mounts, or environment variables in the Dokploy interface. Everything lives in your template.
- **Bonus: one-shot templates** — Comes with fully-tested templates for **Uptime Kuma**, **Beszel**, and **Dozzle**. Every aspect of the service — from initial setup to the admin account — is driven entirely by environment variables. Want to change your password? Change `PASSWORD`. No post-deploy configuration, no clicking around in the UI. More templates on the way.

---

## 🚀 Getting Started

**Prerequisite:** Node.js installed on your system.

```bash
# 1. Clone the repository
git clone <repo-url>
cd dokploy-forge

# 2. Install dependencies
npm install
```

---

## 🛠️ Building Your Own Templates

1. Read the official [Dokploy Templates Contributing Guide](https://github.com/Dokploy/templates/blob/canary/CONTRIBUTING.md) for the full `docker-compose.yml` and `template.toml` spec.
2. Create a folder under `templates/` (e.g., `templates/my-template`) containing both files.
3. Validate your template against Dokploy's rules:
   ```bash
   npx tsx scripts/validate.ts my-template
   ```
4. Test it locally before deploying:
   ```bash
   npx tsx scripts/local-compose-up.ts my-template
   ```
5. Generate the Base64 import string when you're ready:
   ```bash
   npx tsx scripts/generate-base64.ts my-template
   ```

### Local Testing

Since Dokploy templates omit port bindings, `local-compose-up` dynamically binds the port defined in `template.toml` so the service is accessible on your machine during testing. It also applies resource limits (0.25 vCPU, 128MB RAM) to all services to simulate the constrained environment of typical Dokploy deployments — helping you catch performance issues early.

---

## 📦 Deploying to Dokploy

Once your template is ready, import it with three steps:

1. Copy the Base64 string from `output/<template-name>.txt`.
2. In Dokploy, create a new Compose service.
3. Paste the string in the **Import** field under the **Advanced** tab and load.

Done. ✅

---

## 📜 Scripts Reference

### `validate.ts` — Lint your templates

Validates templates against Dokploy's official rules.

```bash
# Validate a single template
npx tsx scripts/validate.ts beszel

# Validate all templates at once
npx tsx scripts/validate.ts --all
```

---

### `generate-base64.ts` — Build the import string

Generates the Base64 import string and saves it to `output/`.

```bash
# Generate for a specific template
npx tsx scripts/generate-base64.ts beszel

# Generate for all templates
npx tsx scripts/generate-base64.ts --all

# Inject a custom domain at generation time
npx tsx scripts/generate-base64.ts beszel --domain monitor.example.com
```

---

### `local-compose-up.ts` — Run locally before deploying

Spins up a template locally with automatic port binding and resource limits (0.25 vCPU, 128MB RAM per service) to simulate a constrained environment similar to most Dokploy hosting deployments.

```bash
# Run interactively
npx tsx scripts/local-compose-up.ts beszel

# Run in detached mode
npx tsx scripts/local-compose-up.ts beszel -d
```

---

## 📁 Project Structure

```
dokploy-forge/
├── templates/          # Your Docker Compose templates
│   ├── beszel/
│   ├── dozzle/
│   └── uptime-kuma/
├── scripts/
│   ├── validate.ts
│   ├── generate-base64.ts
│   └── local-compose-up.ts
└── output/             # Generated Base64 strings land here
```

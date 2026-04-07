# Dokploy Forge

Dokploy Forge is a comprehensive toolkit designed for building, validating, locally testing, and generating customized Docker Compose templates for [Dokploy](https://dokploy.com).

While it includes a library of ready-to-use templates, its primary focus is providing the tooling out-of-the-box to ensure your custom templates are perfectly formatted and instantly deployable using Dokploy's Base64 import feature for rapid, zero-config deployments.

Instead of manually configuring environments, domains, and mounts in the UI, Dokploy decodes a single Base64 string containing both your `docker-compose.yml` and `template.toml` to automatically provision the service. Dokploy Forge helps you craft that Base64 string reliably.

## Getting Started

To use Dokploy Forge, ensure you have **Node.js** installed on your system.

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Using the Template in Dokploy

Use the included script to bundle a template directory into an importable Base64 string:

```bash
# Basic usage
npx tsx scripts/generate-base64.ts <template-name>
```

1. The script outputs a text file inside the `output/` directory (e.g., `output/beszel.txt`).
2. Copy the generated Base64 string from that file.
3. In Dokploy, create a new Compose service and paste the string in the `Import` section of the `Advanced` tab and load.

## Creating Your Own Templates

1. Refer to the official [Dokploy Templates Contributing Guide](https://github.com/Dokploy/templates/blob/canary/CONTRIBUTING.md) for the complete rules and specifications regarding `docker-compose.yml` and `template.toml` files.
2. Create a folder under `templates` (e.g., `templates/my-template`) containing your `docker-compose.yml` and `template.toml` following the official guidelines.
3. Run `npx tsx scripts/validate.ts <your-template-name>` to validate whether your template follows the Dokploy rules and specifications.

### Local Testing

To test your template locally before deploying to Dokploy, use the `scripts/local-compose-up.ts` script. Since Dokploy templates omit port bindings, this script dynamically binds the port defined in `template.toml` for local access:

```bash
npx tsx scripts/local-compose-up.ts <template-name> [docker compose arguments...]
```

## Scripts Reference

Here are the 3 core scripts provided in this repository to manage templates:

### 1. `validate.ts`

Validates templates against Dokploy's official rules and specifications.

```bash
# Validate a specific template
npx tsx scripts/validate.ts beszel

# Validate all templates in the templates/ directory
npx tsx scripts/validate.ts --all
```

### 2. `generate-base64.ts`

Generates the Base64 import string for a template and saves it to the `output/` directory.

```bash
# Generate for a specific template
npx tsx scripts/generate-base64.ts beszel

# Generate for all templates
npx tsx scripts/generate-base64.ts --all

# Inject a custom domain during generation
npx tsx scripts/generate-base64.ts beszel --domain monitor.example.com
```

### 3. `local-compose-up.ts`

Runs a template locally. It automatically binds the port defined in `template.toml` to your local machine so you can test the service before deploying it.

```bash
# Run the template locally
npx tsx scripts/local-compose-up.ts beszel

# Run in detached mode (passing native `docker compose up` flags)
npx tsx scripts/local-compose-up.ts beszel -d
```

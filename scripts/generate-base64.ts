/**
 * Workflow for `npm run generate -- <template-name> [--domain <value>]` or `npm run generate -- --all`:
 *
 * 1) Validate template structure and parse `template.toml`.
 * 2) Read `docker-compose.yml` from templates/<template>/.
 * 3) Recursively collect all files from `templates/<template>/mounts/**`:
 *    - Preserve nested folder structure in filePath (e.g., `config/app.conf`).
 *    - Convert to inline [[config.mounts]] entries for Dokploy deployment.
 * 4) Optionally inject --domain flag value into [variables] section.
 * 5) Combine compose + config into JSON and Base64 encode.
 * 6) Write to output/<template>.txt for import into Dokploy.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const die = (msg: string): never => {
  console.error(`❌ generate-base64.ts: error: ${msg}`);
  process.exit(1);
};
const info = (msg: string) => console.log(`✅ ${msg}`);

const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");
const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const REQUIRED_FILES = ["template.toml", "docker-compose.yml"];

const isTemplate = (name: string) => {
  const dir = path.join(TEMPLATES_DIR, name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  return REQUIRED_FILES.every((file) => fs.existsSync(path.join(dir, file)));
};

function listTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) die(`Templates directory not found.`);
  return fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isTemplate(e.name))
    .map((e) => e.name);
}

function collectMountsFromFilesystem(dir: string): string {
  const mountsDir = path.join(dir, "mounts");
  let mountsToml = "";

  if (!fs.existsSync(mountsDir)) {
    return mountsToml;
  }

  function walkDir(currentPath: string, relativePath: string = "") {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        walkDir(fullPath, relPath);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const escaped = content
          .replace(/\\/g, "\\\\")
          .replace(/'''/g, "\\'\\'\\'");
        mountsToml += `\n[[config.mounts]]\nfilePath = "${relPath}"\ncontent = '''\n${escaped}\n'''\n`;
      }
    }
  }

  walkDir(mountsDir);
  return mountsToml;
}

function processTemplate(name: string, domain: string | null) {
  if (!isTemplate(name)) die(`Template '${name}' is invalid or not found.`);

  const dir = path.join(TEMPLATES_DIR, name);
  try {
    execSync(`npx tsx scripts/validate.ts ${name}`, { stdio: "inherit" });
  } catch {
    die(`Validation failed for '${name}'. Please fix the errors above.`);
  }

  const composeContent = fs.readFileSync(
    path.join(dir, "docker-compose.yml"),
    "utf-8",
  );
  let configContent = fs.readFileSync(path.join(dir, "template.toml"), "utf-8");

  if (domain) {
    info(`Injecting main_domain: ${domain} into '${name}'`);
    const escaped = domain.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const replacement = `main_domain = "${escaped}"`;
    const pattern = /^\s*main_domain\s*=\s*"[^"]*"\s*$/m;
    configContent = pattern.test(configContent)
      ? configContent.replace(pattern, replacement)
      : `[variables]\n${replacement}\n\n${configContent}`;
  }

  const mountsToml = collectMountsFromFilesystem(dir);
  if (mountsToml) {
    info(`Including ${dir}/mounts/** files as inline [[config.mounts]]`);
    configContent += mountsToml;
  }

  const base64Str = Buffer.from(
    JSON.stringify({ compose: composeContent, config: configContent }),
    "utf-8",
  ).toString("base64");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, `${name}.txt`);
  fs.writeFileSync(outputPath, base64Str + "\n", "utf-8");
  info(`Generated: ${outputPath}`);
}

function main() {
  const args = process.argv.slice(2);
  const isAll = args.includes("--all");
  const name = args.find((a) => !a.startsWith("-"));
  const domainIdx = args.findIndex((a) => a === "-d" || a === "--domain");
  const domain = domainIdx !== -1 ? args[domainIdx + 1] : null;

  if (!isAll && !name) {
    console.log(
      "Usage: npm run generate -- <template-name> [--domain <value>]",
    );
    console.log("       npm run generate -- --all [--domain <value>]");
    process.exit(0);
  }

  const targets = isAll ? listTemplates() : [name!];
  if (targets.length === 0) {
    console.warn("\n⚠️  No templates found to generate base64 for.");
    return;
  }
  targets.forEach((t) => processTemplate(t, domain));
}

main();

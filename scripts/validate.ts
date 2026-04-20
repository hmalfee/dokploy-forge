import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const die = (msg: string): never => {
  console.error(`❌ validate.ts: error: ${msg}`);
  process.exit(1);
};
const info = (msg: string) => console.log(`✅ ${msg}`);

const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");
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

function parseTargets(args: string[]): string[] {
  const all = args.includes("--all");
  const name = args.find((a) => !a.startsWith("-"));

  if (!all && !name) {
    console.log("Usage: npm run validate -- <template-name> [--all]");
    process.exit(0);
  }

  if (all) return listTemplates();
  if (!isTemplate(name!)) die(`Template '${name}' is invalid or not found.`);
  return [name!];
}

function processTemplate(name: string) {
  const dir = path.join(TEMPLATES_DIR, name);
  console.log(`\n  🔍 Validating template '${name}'\n${"─".repeat(40)}`);

  try {
    execSync(
      `npx tsx scripts/dokploy-utils/validate-template.ts --dir ${dir}`,
      { stdio: "inherit" },
    );
    execSync(
      `npx tsx scripts/dokploy-utils/validate-docker-compose.ts --file ${path.join(dir, "docker-compose.yml")}`,
      { stdio: "inherit" },
    );
  } catch {
    die(`Validation failed for template '${name}'.`);
  }
  info(`Template '${name}' is valid.`);
}

function main() {
  const targets = parseTargets(process.argv.slice(2));
  if (targets.length === 0) {
    console.warn("\n⚠️  No templates found to validate.");
    return;
  }
  targets.forEach(processTemplate);
  console.log("\n✅ All templates passed validation.");
}

main();

import * as fs from "fs";
import * as path from "path";
import { spawnSync, spawn } from "child_process";
import * as toml from "toml";

const die = (msg: string): never => {
  console.error(`❌ local-compose-up.ts: error: ${msg}`);
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

function processTemplate(name: string, dokployArgs: string[]) {
  if (!isTemplate(name)) die(`Template '${name}' is invalid or not found.`);

  const dir = path.join(TEMPLATES_DIR, name);
  const tomlPath = path.join(dir, "template.toml");

  if (
    spawnSync("npx", ["tsx", "scripts/validate.ts", name], {
      stdio: "inherit",
    }).status !== 0
  ) {
    die("Validation failed. Please fix the errors above.");
  }

  let tomlData: any;
  try {
    tomlData = toml.parse(fs.readFileSync(tomlPath, "utf-8"));
  } catch (e: any) {
    die(`Failed to parse ${tomlPath}: ${e.message}`);
  }

  const domains = tomlData?.config?.domains ?? [];
  if (domains.length === 0)
    die(`At least one [[config.domains]] block is required in '${tomlPath}'.`);

  const { serviceName, port } = domains[0];
  if (!serviceName)
    die(`Missing required key 'serviceName' in [[config.domains]].`);
  if (typeof port !== "number")
    die(`'port' must be a numeric value, got: '${port}'`);

  info(`Parsed template '${name}' — service='${serviceName}', port='${port}'`);

  const overrideFile = `tmp_${Math.random().toString(36).substring(7)}.compose-override.yml`;
  const overridePath = path.join(dir, overrideFile);

  fs.writeFileSync(
    overridePath,
    `services:\n  ${serviceName}:\n    ports:\n      - "${port}:${port}"\n`,
    "utf-8",
  );

  info(`Injecting port binding ${port}:${port} for template '${name}' → running docker compose...`);

  const cleanup = () => {
    try {
      if (fs.existsSync(overridePath)) fs.unlinkSync(overridePath);
    } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => process.exit());

  const child = spawn(
    "docker",
    ["compose", "-f", "docker-compose.yml", "-f", overrideFile, "up", ...dokployArgs],
    {
      cwd: dir,
      stdio: "inherit",
    },
  );
  child.on("close", (code) => process.exit(code || 0));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    console.log("Usage: npx tsx scripts/local-compose-up.ts <template-name> [docker compose arguments...]");
    process.exit(0);
  }

  const [templateName, ...dokployArgs] = args;
  processTemplate(templateName, dokployArgs);
}

main();

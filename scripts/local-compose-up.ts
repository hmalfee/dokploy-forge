/**
* Workflow for `npm run compose-up -- <template-name> [args]`:
* 
* 1) Validate template structure and parse `template.toml`.
* 2) Create one per-run temporary directory under cache.
* 3) Materialize mount files from both sources into `../files/...`:
*   - `[[config.mounts]]` entries from `template.toml`
*   - `templates/<template>/mounts/**` recursive directory contents
* 4) Build a compose override that injects:
  - port mapping from the first `[[config.domains]]`
  - resource limits for all services
  - volume remaps for `../files/...` bind sources to runtime materialized files
* 5) Run `docker compose` with original compose + override.
* 6) Cleanup the per-run temporary directory on process exit.
*/

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync, spawn } from "child_process";
import * as toml from "toml";
import * as yaml from "yaml";

const die = (msg: string): never => {
  console.error(`❌ local-compose-up.ts: error: ${msg}`);
  process.exit(1);
};
const info = (msg: string) => console.log(`✅ ${msg}`);

const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");
const CACHE_BASE_DIR = process.env.XDG_CACHE_HOME
  ? path.resolve(process.env.XDG_CACHE_HOME)
  : path.join(os.homedir(), ".cache");
const DOKPLOY_FORGE_TMP_ROOT = path.join(
  CACHE_BASE_DIR,
  "dokploy-forge",
  "tmp",
);
const REQUIRED_FILES = ["template.toml", "docker-compose.yml"];

const isTemplate = (name: string) => {
  const dir = path.join(TEMPLATES_DIR, name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  return REQUIRED_FILES.every((file) => fs.existsSync(path.join(dir, file)));
};

function processTemplate(name: string, composeArgs: string[]) {
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

  const mounts = Array.isArray(tomlData?.config?.mounts)
    ? tomlData.config.mounts
    : [];
  const templateMountsDir = path.join(dir, "mounts");
  const templateMountsPathExists = fs.existsSync(templateMountsDir);
  if (
    templateMountsPathExists &&
    !fs.statSync(templateMountsDir).isDirectory()
  ) {
    die(`'${templateMountsDir}' exists but is not a directory.`);
  }

  fs.mkdirSync(DOKPLOY_FORGE_TMP_ROOT, { recursive: true });
  const runTempDir = fs.mkdtempSync(
    path.join(DOKPLOY_FORGE_TMP_ROOT, `dokploy-forge-${name}-`),
  );
  let mountDir: string | null = null;

  if (mounts.length > 0 || templateMountsPathExists) {
    mountDir = path.join(runTempDir, "files");
    fs.mkdirSync(mountDir, { recursive: true });

    mounts.forEach((mount: any, index: number) => {
      const filePath =
        typeof mount?.filePath === "string" ? mount.filePath : null;
      const content = typeof mount?.content === "string" ? mount.content : null;
      if (!filePath || content === null) return;

      const relPath = filePath.replace(/^\/+/, "");
      const hostPath = path.join(
        mountDir as string,
        relPath || `mount_${index}`,
      );

      fs.mkdirSync(path.dirname(hostPath), { recursive: true });
      fs.writeFileSync(hostPath, content, "utf-8");
    });

    const copyMountsDirectory = (sourceDir: string, targetDir: string) => {
      const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
      for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
          fs.mkdirSync(targetPath, { recursive: true });
          copyMountsDirectory(sourcePath, targetPath);
          continue;
        }

        if (entry.isFile()) {
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.copyFileSync(sourcePath, targetPath);
        }
      }
    };

    if (templateMountsPathExists) {
      copyMountsDirectory(templateMountsDir, mountDir);
    }
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

  const overridePath = path.join(runTempDir, "compose-override.yml");
  const composePath = path.join(dir, "docker-compose.yml");
  const composeData = yaml.parse(fs.readFileSync(composePath, "utf-8")) || {};
  const serviceNames = Object.keys(composeData.services || {});

  const overrideData: any = { services: {} };
  for (const sName of serviceNames) {
    overrideData.services[sName] = {
      deploy: {
        resources: {
          limits: {
            cpus: "0.25",
            memory: "128M",
          },
        },
      },
    };

    if (sName === serviceName) {
      overrideData.services[sName].ports = [`${port}:${port}`];
    }

    const serviceVolumes = composeData?.services?.[sName]?.volumes;
    if (mountDir && Array.isArray(serviceVolumes)) {
      const remappedVolumes = serviceVolumes
        .map((volume: any) => {
          if (typeof volume !== "string") return null;

          const parts = volume.split(":");
          if (parts.length < 2) return null;

          const source = parts[0];
          if (!(source === "../files" || source.startsWith("../files/"))) {
            return null;
          }

          const relativePath = source.replace(/^\.\.\/files\/?/, "");
          const remappedSource = relativePath
            ? path.join(mountDir, relativePath)
            : mountDir;

          return [remappedSource, ...parts.slice(1)].join(":");
        })
        .filter((value: string | null) => value !== null);

      if (remappedVolumes.length > 0) {
        overrideData.services[sName].volumes = remappedVolumes;
      }
    }
  }

  fs.writeFileSync(overridePath, yaml.stringify(overrideData), "utf-8");

  info(
    `Injecting port binding ${port}:${port} (for ${serviceName}) and resource limits (0.25 vCPU, 128MB RAM) for all services in template '${name}' → running docker compose...`,
  );

  const cleanup = () => {
    try {
      if (fs.existsSync(runTempDir)) {
        fs.rmSync(runTempDir, { recursive: true, force: true });
      }
    } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => process.exit());

  const child = spawn(
    "docker",
    [
      "compose",
      "-f",
      "docker-compose.yml",
      "-f",
      overridePath,
      "up",
      ...composeArgs,
    ],
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
    console.log(
      "Usage: npm run compose-up -- <template-name> [docker compose arguments...]",
    );
    process.exit(0);
  }

  const [templateName, ...composeArgs] = args;
  processTemplate(templateName, composeArgs);
}

main();

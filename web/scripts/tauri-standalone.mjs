import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const nextDir = path.join(root, ".next");
const standaloneDir = path.join(nextDir, "standalone");
const tauriStandaloneDir = path.join(root, "src-tauri", "resources", "standalone");

if (!existsSync(standaloneDir)) {
  console.error("Standalone build not found. Run `npm run build` first.");
  process.exit(1);
}

const staticSrc = path.join(nextDir, "static");
const staticDest = path.join(standaloneDir, ".next", "static");
const publicSrc = path.join(root, "public");
const publicDest = path.join(standaloneDir, "public");

await mkdir(path.dirname(staticDest), { recursive: true });
await cp(staticSrc, staticDest, { recursive: true });

if (existsSync(publicSrc)) {
  await cp(publicSrc, publicDest, { recursive: true });
}

if (existsSync(tauriStandaloneDir)) {
  await rm(tauriStandaloneDir, { recursive: true, force: true });
}
await cp(standaloneDir, tauriStandaloneDir, { recursive: true });

console.log("Prepared standalone output for Tauri.");

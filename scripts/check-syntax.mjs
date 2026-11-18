import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["netlify", "netlify-functions", "scripts", "test"];
const files = roots.flatMap(walk).filter((file) => [".js", ".mjs"].includes(extname(file)) && !file.endsWith("check-syntax.mjs"));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);

function walk(path) {
  try {
    return statSync(path).isDirectory()
      ? readdirSync(path).flatMap((entry) => walk(join(path, entry)))
      : [path];
  } catch {
    return [];
  }
}

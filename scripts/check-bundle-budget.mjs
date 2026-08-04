import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const distDir = new URL("../apps/showcase/dist/assets/", import.meta.url);
const distPath = fileURLToPath(distDir);
const budgets = {
  jsGzipBytes: 75 * 1024,
  cssGzipBytes: 5 * 1024,
  totalGzipBytes: 85 * 1024
};

let jsGzipBytes = 0;
let cssGzipBytes = 0;

for (const file of readdirSync(distDir)) {
  const path = join(distPath, file);
  if (!statSync(path).isFile()) continue;
  const gzipBytes = gzipSync(readFileSync(path)).byteLength;
  if (file.endsWith(".js")) jsGzipBytes += gzipBytes;
  if (file.endsWith(".css")) cssGzipBytes += gzipBytes;
}

const totalGzipBytes = jsGzipBytes + cssGzipBytes;
const failures = [
  ["js", jsGzipBytes, budgets.jsGzipBytes],
  ["css", cssGzipBytes, budgets.cssGzipBytes],
  ["total", totalGzipBytes, budgets.totalGzipBytes]
].filter(([, actual, budget]) => actual > budget);

for (const [name, actual, budget] of [["js", jsGzipBytes, budgets.jsGzipBytes], ["css", cssGzipBytes, budgets.cssGzipBytes], ["total", totalGzipBytes, budgets.totalGzipBytes]]) {
  console.log(`${name} gzip: ${format(actual)} / ${format(budget)}`);
}

if (failures.length) {
  throw new Error(`Bundle budget exceeded: ${failures.map(([name, actual, budget]) => `${name} ${format(actual)} > ${format(budget)}`).join(", ")}`);
}

function format(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

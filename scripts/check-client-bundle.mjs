import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const budgetKb = Number(process.env.CLIENT_MAX_CHUNK_KB || 600);
const budgetGzipKb = Number(process.env.CLIENT_MAX_CHUNK_GZIP_KB || 0);
const entryBudgetKb = Number(process.env.CLIENT_MAX_ENTRY_KB || 0);
const entryBudgetGzipKb = Number(process.env.CLIENT_MAX_ENTRY_GZIP_KB || 0);
const assetsDir = path.resolve(process.cwd(), "dist", "assets");
const manifestPath = path.resolve(process.cwd(), "dist", ".vite", "manifest.json");

if (!fs.existsSync(assetsDir)) {
  console.error(`Bundle check failed: assets directory not found at ${assetsDir}`);
  process.exit(1);
}

const jsAssets = fs
  .readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => {
    const fullPath = path.join(assetsDir, name);
    const content = fs.readFileSync(fullPath);
    return {
      name,
      sizeBytes: fs.statSync(fullPath).size,
      gzipBytes: zlib.gzipSync(content).length,
    };
  })
  .sort((a, b) => b.sizeBytes - a.sizeBytes);

if (jsAssets.length === 0) {
  console.error("Bundle check failed: no JavaScript assets found in dist/assets.");
  process.exit(1);
}

const oversized = jsAssets.filter(
  (asset) =>
    asset.sizeBytes > budgetKb * 1024 ||
    (budgetGzipKb > 0 && asset.gzipBytes > budgetGzipKb * 1024)
);

const entryFiles = new Set();
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  Object.values(manifest).forEach((entry) => {
    if (entry && typeof entry === "object" && entry.isEntry && typeof entry.file === "string" && entry.file.endsWith(".js")) {
      entryFiles.add(path.basename(entry.file));
    }
  });
}
const entryAssets = jsAssets.filter((asset) => entryFiles.has(asset.name));
const oversizedEntries = entryAssets.filter(
  (asset) =>
    (entryBudgetKb > 0 && asset.sizeBytes > entryBudgetKb * 1024) ||
    (entryBudgetGzipKb > 0 && asset.gzipBytes > entryBudgetGzipKb * 1024)
);

console.log(`Bundle budget: ${budgetKb} kB raw per JS chunk${budgetGzipKb > 0 ? `, ${budgetGzipKb} kB gzip` : ""}`);
jsAssets.slice(0, 10).forEach((asset) => {
  const sizeKb = (asset.sizeBytes / 1024).toFixed(2);
  const gzipKb = (asset.gzipBytes / 1024).toFixed(2);
  console.log(`${asset.name}: ${sizeKb} kB raw, ${gzipKb} kB gzip`);
});

if (entryAssets.length > 0) {
  console.log(
    `Entry budget: ${entryBudgetKb > 0 ? `${entryBudgetKb} kB raw` : "disabled"}${
      entryBudgetGzipKb > 0 ? `, ${entryBudgetGzipKb} kB gzip` : ""
    }`
  );
  entryAssets.forEach((asset) => {
    const sizeKb = (asset.sizeBytes / 1024).toFixed(2);
    const gzipKb = (asset.gzipBytes / 1024).toFixed(2);
    console.log(`entry ${asset.name}: ${sizeKb} kB raw, ${gzipKb} kB gzip`);
  });
}

if (oversized.length > 0) {
  console.error("Bundle check failed: oversized chunks detected.");
  oversized.forEach((asset) => {
    const sizeKb = (asset.sizeBytes / 1024).toFixed(2);
    const gzipKb = (asset.gzipBytes / 1024).toFixed(2);
    console.error(`- ${asset.name}: ${sizeKb} kB raw, ${gzipKb} kB gzip`);
  });
  process.exit(1);
}

if (oversizedEntries.length > 0) {
  console.error("Bundle check failed: oversized entry chunks detected.");
  oversizedEntries.forEach((asset) => {
    const sizeKb = (asset.sizeBytes / 1024).toFixed(2);
    const gzipKb = (asset.gzipBytes / 1024).toFixed(2);
    console.error(`- ${asset.name}: ${sizeKb} kB raw, ${gzipKb} kB gzip`);
  });
  process.exit(1);
}

console.log("Bundle check passed.");

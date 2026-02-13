import fs from "node:fs";
import path from "node:path";

const budgetKb = Number(process.env.CLIENT_MAX_CHUNK_KB || 600);
const assetsDir = path.resolve(process.cwd(), "dist", "assets");

if (!fs.existsSync(assetsDir)) {
  console.error(`Bundle check failed: assets directory not found at ${assetsDir}`);
  process.exit(1);
}

const jsAssets = fs
  .readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => {
    const fullPath = path.join(assetsDir, name);
    return {
      name,
      sizeBytes: fs.statSync(fullPath).size,
    };
  })
  .sort((a, b) => b.sizeBytes - a.sizeBytes);

if (jsAssets.length === 0) {
  console.error("Bundle check failed: no JavaScript assets found in dist/assets.");
  process.exit(1);
}

const oversized = jsAssets.filter((asset) => asset.sizeBytes > budgetKb * 1024);

console.log(`Bundle budget: ${budgetKb} kB per JS chunk`);
jsAssets.slice(0, 10).forEach((asset) => {
  const sizeKb = (asset.sizeBytes / 1024).toFixed(2);
  console.log(`${asset.name}: ${sizeKb} kB`);
});

if (oversized.length > 0) {
  console.error("Bundle check failed: oversized chunks detected.");
  oversized.forEach((asset) => {
    const sizeKb = (asset.sizeBytes / 1024).toFixed(2);
    console.error(`- ${asset.name}: ${sizeKb} kB`);
  });
  process.exit(1);
}

console.log("Bundle check passed.");

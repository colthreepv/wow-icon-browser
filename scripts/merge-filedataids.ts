import { parseCatalog } from "../src/lib/catalog";

const file = Bun.file("public/data/catalog.json");
const manifest = await file.json();
const mapping = await Bun.file("public/data/filedataids.json").json();
if (mapping.version !== 1 || !mapping.ids || !mapping.source || !mapping.stats)
  throw new Error("Invalid FileDataID snapshot");
manifest.version = 2;
manifest.icons = manifest.icons.map((row: unknown[]) => [
  ...row.slice(0, 4),
  mapping.ids[String(row[0])] ?? null,
]);
manifest.fileDataIdSource = mapping.source;
manifest.fileDataIdStats = mapping.stats;
parseCatalog(manifest);
await Bun.write(file, JSON.stringify(manifest));
const reportFile = Bun.file("public/data/import-report.json");
const report = await reportFile.json();
report.fileDataIds = { ...mapping.stats, source: mapping.source };
report.metadataBytes = Bun.file("public/data/catalog.json").size;
await Bun.write(reportFile, JSON.stringify(report, null, 2));
console.log(mapping.stats);

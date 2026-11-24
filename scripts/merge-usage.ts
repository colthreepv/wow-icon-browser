import { parseCatalog } from "../src/lib/catalog";

const catalogFile = Bun.file("public/data/catalog.json");
const manifest = await catalogFile.json();
const enrichment: unknown = await Bun.file("public/data/usage.json").json();
if (
  typeof enrichment !== "object" ||
  enrichment === null ||
  !("icons" in enrichment) ||
  !("source" in enrichment)
)
  throw new Error("Invalid usage snapshot");
const data = enrichment as {
  icons: Record<string, unknown>;
  source: { scope: string };
};
const names = new Set<string>(manifest.icons.map((row: unknown[]) => row[0]));
manifest.usage = Object.fromEntries(
  Object.entries(data.icons).filter(
    ([name, rows]) => names.has(name) && Array.isArray(rows) && rows.length,
  ),
);
manifest.usageCoverage = {
  icons: Object.keys(manifest.usage).length,
  relations: Object.values(manifest.usage as Record<string, unknown[]>).reduce(
    (sum, rows) => sum + rows.length,
    0,
  ),
  scope: data.source.scope,
};
parseCatalog(manifest);
await Bun.write(catalogFile, JSON.stringify(manifest));
const reportFile = Bun.file("public/data/import-report.json");
const report = await reportFile.json();
report.usageCoverage = manifest.usageCoverage;
report.metadataBytes = catalogFile.size;
await Bun.write(reportFile, JSON.stringify(report, null, 2));
console.log(manifest.usageCoverage);

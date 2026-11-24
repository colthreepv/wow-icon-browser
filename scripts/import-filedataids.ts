import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  matchCatalogFileDataIds,
  parseFileDataIds,
} from "../src/lib/filedataids";

const ROOT = resolve(import.meta.dir, "..");
const REVISION = "70a4e328f80069db2a3be88925e626ffad07ef4b";
const SOURCE_FILE = "parts/interface.csv";
const SOURCE_URL = `https://raw.githubusercontent.com/wowdev/wow-listfile/${REVISION}/${SOURCE_FILE}`;
const CACHE_PATH = join(ROOT, ".cache", "listfile", REVISION, "interface.csv");
const CATALOG_PATH = join(ROOT, "public", "data", "catalog.json");
const OUTPUT_PATH = join(ROOT, "public", "data", "filedataids.json");
const NORMALIZATION =
  "Case-insensitive Interface/Icons paths; forward and backslash separators; " +
  "trailing .blp or .tga removed from catalog basenames; exact basename matching only.";

async function readOrFetchSource(): Promise<Buffer> {
  try {
    return await readFile(CACHE_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  console.log(`Downloading pinned listfile: ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok)
    throw new Error(`Listfile download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, buffer);
  console.log(`Cached ${buffer.length.toLocaleString("en-US")} bytes.`);
  return buffer;
}

async function main() {
  const source = await readOrFetchSource();
  const sha256 = createHash("sha256").update(source).digest("hex");
  const parsed = parseFileDataIds(source.toString("utf8"));

  const rawCatalog: unknown = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  if (
    typeof rawCatalog !== "object" ||
    rawCatalog === null ||
    !Array.isArray((rawCatalog as { icons?: unknown }).icons)
  )
    throw new Error("catalog.json has no icons array");

  const catalogNames = (rawCatalog as { icons: unknown[] }).icons.map(
    (icon, index) => {
      if (!Array.isArray(icon) || typeof icon[0] !== "string")
        throw new Error(`Invalid catalog icon at index ${index}`);
      return icon[0];
    },
  );
  const matched = matchCatalogFileDataIds(catalogNames, parsed);
  const output = {
    version: 1,
    source: {
      repository: "wowdev/wow-listfile",
      revision: REVISION,
      file: SOURCE_FILE,
      sha256,
      normalization: NORMALIZATION,
    },
    ids: matched.ids,
    stats: {
      matched: Object.keys(matched.ids).length,
      unmatched: matched.unmatched.length,
      ambiguous: matched.ambiguous.length,
      total: catalogNames.length,
    },
    unmatched: matched.unmatched,
    ambiguous: matched.ambiguous,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`);
  await rename(temporaryPath, OUTPUT_PATH);

  const coverage = ((output.stats.matched / output.stats.total) * 100).toFixed(
    2,
  );
  console.log(
    `FileDataID coverage: ${output.stats.matched}/${output.stats.total} (${coverage}%), ` +
      `${output.stats.unmatched} unmatched, ${output.stats.ambiguous} ambiguous.`,
  );
  console.log(
    `ability_hunter_eagleeye FileDataID: ${output.ids.ability_hunter_eagleeye ?? "unmatched"}`,
  );
  console.log(`Source SHA-256: ${sha256}`);
}

await main();

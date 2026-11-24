import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ORIGIN = "https://www.wowhead.com";
const GALLERY_URL = `${ORIGIN}/forever/icons`;
const CACHE_DIR = join(".cache", "usage");
const CACHE_HTML_DIR = join(CACHE_DIR, "html");
const OUTPUT_PATH = join("public", "data", "usage.json");
const TOTAL_PAGE_BUDGET = 40;
const BROAD_LIST_URLS = [
  `${ORIGIN}/forever/spells/abilities/hunter`,
  `${ORIGIN}/forever/spells/abilities/warrior`,
  `${ORIGIN}/forever/spells/abilities/paladin`,
  `${ORIGIN}/forever/spells/abilities/rogue`,
  `${ORIGIN}/forever/spells/abilities/priest`,
  `${ORIGIN}/forever/spells/abilities/shaman`,
  `${ORIGIN}/forever/spells/abilities/mage`,
  `${ORIGIN}/forever/spells/abilities/warlock`,
  `${ORIGIN}/forever/spells/abilities/druid`,
  `${ORIGIN}/forever/spells`,
  `${ORIGIN}/forever/items`,
];
const DETAIL_LIMIT = boundedPageLimit(
  Bun.env.USAGE_DETAIL_LIMIT ?? argsValue("--limit"),
  TOTAL_PAGE_BUDGET - BROAD_LIST_URLS.length - 1,
  TOTAL_PAGE_BUDGET - BROAD_LIST_URLS.length - 1,
);
const CONCURRENCY = positiveInteger(Bun.env.USAGE_CONCURRENCY, 3);
const REFRESH = Bun.argv.includes("--refresh");

type Kind = "item" | "spell";
type Relation = [Kind, number, string];
type GalleryIcon = {
  id: number;
  name: string;
  itemcount: number;
  spellcount: number;
};
type UsageOutput = {
  version: 1;
  generatedAt: string;
  source: { name: "Wowhead Forever"; urls: string[]; scope: string };
  icons: Record<string, Relation[]>;
  stats: { icons: number; relations: number };
};

await main();

async function main() {
  await mkdir(CACHE_HTML_DIR, { recursive: true });

  console.log("Fetching the Wowhead Forever icon gallery...");
  const galleryHtml = await cachedFetch(
    GALLERY_URL,
    join(CACHE_HTML_DIR, "icons.html"),
  );
  const galleryData = extractListviewData(galleryHtml, "icons");
  const gallery = galleryData.map(parseGalleryIcon);
  const displayed = galleryData.length;
  if (displayed === 0)
    throw new Error("The icon gallery contained no listview rows.");
  const totalMatch = /([\d,]+) icons found(?: \(([\d,]+) displayed\))?/.exec(
    galleryHtml,
  );
  const totalIcons = totalMatch
    ? Number(totalMatch[1].replaceAll(",", ""))
    : undefined;

  const selected = selectIcons(gallery, DETAIL_LIMIT);
  const hunterSelected = selected.filter((entry) =>
    isHunterIcon(entry.name),
  ).length;
  const spellSelected = selected.filter((entry) => entry.spellcount > 0).length;
  console.log(
    `Selected ${selected.length} of ${gallery.length} gallery icons ` +
      `(${hunterSelected} Hunter-related, ${spellSelected} with spells).`,
  );

  const relationsByIcon = new Map<string, Map<string, Relation>>();
  const sourceUrls = [GALLERY_URL, ...BROAD_LIST_URLS];
  const broadFailures: string[] = [];
  let broadPagesRead = 0;
  let broadRelations = 0;

  console.log(
    `Trying ${BROAD_LIST_URLS.length} broad spell/item list pages first...`,
  );
  await mapConcurrent(BROAD_LIST_URLS, 2, async (url) => {
    try {
      const filename = `broad-${new URL(url).pathname.slice("/forever/".length).replaceAll("/", "-")}.html`;
      const html = await cachedFetch(url, join(CACHE_HTML_DIR, filename), 1);
      const gathered = new Map<string, Map<string, Relation>>();
      const mapsRead = collectAllGathererRelations(html, gathered);
      if (mapsRead === 0) throw new Error("no Gatherer data");

      broadPagesRead += 1;
      for (const [iconName, relations] of gathered) {
        const iconRelations = getRelations(relationsByIcon, iconName);
        for (const [key, relation] of relations) {
          if (!iconRelations.has(key)) broadRelations += 1;
          iconRelations.set(key, relation);
        }
      }
      console.log(`Read broad list ${url} (${mapsRead} Gatherer maps).`);
    } catch (error) {
      broadFailures.push(url);
      console.warn(
        `Broad list unavailable ${url}: ${error instanceof Error ? error.message : error}`,
      );
    }
  });
  console.log(
    `Broad lists: ${broadPagesRead} readable, ${broadFailures.length} unavailable, ` +
      `${broadRelations} new relations.`,
  );

  const failures: string[] = [];
  let completed = 0;

  await mapConcurrent(selected, CONCURRENCY, async (icon) => {
    const url = iconDetailUrl(icon);
    sourceUrls.push(url);
    try {
      const html = await cachedFetch(
        url,
        join(CACHE_HTML_DIR, `${icon.name}-${icon.id}.html`),
      );
      const gathered = new Map<string, Relation>();
      collectGathererRelations(html, 3, "item", icon.name, gathered);
      collectGathererRelations(html, 6, "spell", icon.name, gathered);
      if (gathered.size === 0) {
        const itemCount = optionalListviewData(html, "used-by-item").length;
        const spellCount = optionalListviewData(html, "used-by-spell").length;
        if (itemCount + spellCount > 0) {
          throw new Error(
            "Listview rows exist without matching Gatherer icon data.",
          );
        }
      }
      if (gathered.size > 0) relationsByIcon.set(icon.name, gathered);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${icon.name}: ${message}`);
      console.warn(`Skipping ${icon.name}: ${message}`);
    } finally {
      completed += 1;
      if (completed % 25 === 0 || completed === selected.length) {
        console.log(`Processed ${completed}/${selected.length} icon pages.`);
      }
    }
  });

  const icons: Record<string, Relation[]> = {};
  let relationCount = 0;
  for (const name of [...relationsByIcon.keys()].sort()) {
    const relations = [...relationsByIcon.get(name)!.values()].sort(
      compareRelations,
    );
    icons[name] = relations;
    relationCount += relations.length;
  }

  const coverage = totalIcons
    ? `the first ${displayed.toLocaleString("en-US")} of ${totalIcons.toLocaleString("en-US")} gallery icons`
    : `the first ${displayed.toLocaleString("en-US")} gallery icons`;
  const failureNote =
    failures.length > 0
      ? ` ${failures.length} selected detail pages could not be read after retries.`
      : "";
  const broadNote =
    broadPagesRead > 0
      ? `${broadPagesRead} broad class or global spell/item list pages were readable and parsed before details. `
      : `None of the ${BROAD_LIST_URLS.length} attempted broad class or global spell/item list pages returned usable native HTML. `;
  const scope =
    `Partial build-time snapshot drawn from ${coverage}, ${selected.length - failures.length} ` +
    `native icon detail pages, and ${BROAD_LIST_URLS.length} attempted broad list pages. ` +
    broadNote +
    `Selection prioritizes Hunter icon names, then spell-bearing ` +
    `and high-usage icons. Only exact item/spell IDs whose Wowhead icon field matches the ` +
    `page icon are included. The snapshot is cached locally and creates no runtime external traffic. ` +
    `This local snapshot requires a redistribution rights review before publishing. ` +
    `Terms relevant to publishing include https://corp.fanbyte.com/legal/terms section 4.` +
    failureNote;

  const output: UsageOutput = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      name: "Wowhead Forever",
      urls: sourceUrls,
      scope,
    },
    icons,
    stats: { icons: Object.keys(icons).length, relations: relationCount },
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, OUTPUT_PATH);

  console.log(
    `Wrote ${OUTPUT_PATH}: ${output.stats.relations} relations across ${output.stats.icons} icons.`,
  );
  if (failures.length > 0) {
    console.warn(
      `${failures.length} detail pages failed. The scope records the incomplete coverage.`,
    );
  }
}

async function cachedFetch(
  url: string,
  cachePath: string,
  attempts = 4,
): Promise<string> {
  if (!REFRESH) {
    try {
      const cached = await readFile(cachePath, "utf8");
      if (cached.length > 1_000) return cached;
    } catch {
      // A missing cache file is expected on the first run.
    }
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        },
        signal: AbortSignal.timeout(30_000),
      });
      const html = await response.text();
      if (response.ok && html.length > 1_000) {
        await writeFile(cachePath, html, "utf8");
        return html;
      }
      throw new Error(`HTTP ${response.status}, ${html.length} response bytes`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await Bun.sleep(
          350 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250),
        );
      }
    }
  }

  if (process.platform === "win32") {
    try {
      const html = await fetchWithPowerShell(url);
      await writeFile(cachePath, html, "utf8");
      return html;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Failed to fetch ${url}: ${lastError instanceof Error ? lastError.message : lastError}`,
  );
}

async function fetchWithPowerShell(url: string): Promise<string> {
  const command = [
    "$ProgressPreference = 'SilentlyContinue'",
    `$r = Invoke-WebRequest -UseBasicParsing -Uri '${url.replaceAll("'", "''")}' ` +
      "-Headers @{ 'User-Agent' = 'Mozilla/5.0 wow-icon-browser usage importer' }",
    "if ([string]::IsNullOrEmpty($r.Content)) { exit 2 }",
    "[Console]::Out.Write($r.Content)",
  ].join("; ");
  const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
  const process = Bun.spawn(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodedCommand,
    ],
    {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [html, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0 || html.length <= 1_000) {
    throw new Error(
      `PowerShell HTTP fallback failed (${exitCode}): ${stderr.trim() || `${html.length} bytes`}`,
    );
  }
  return html;
}

function extractListviewData(html: string, id: string): unknown[] {
  const idPattern = new RegExp(`\\bid\\s*:\\s*['"]${escapeRegExp(id)}['"]`);
  const idMatch = idPattern.exec(html);
  if (!idMatch) throw new Error(`Listview '${id}' was not found.`);
  const dataMatch = /\bdata\s*:/.exec(
    html.slice(idMatch.index, idMatch.index + 4_000),
  );
  if (!dataMatch) throw new Error(`Listview '${id}' has no data array.`);
  const start = idMatch.index + dataMatch.index + dataMatch[0].length;
  const parsed = parseBalancedJson(html, start, "array");
  if (!Array.isArray(parsed))
    throw new Error(`Listview '${id}' data is not an array.`);
  return parsed;
}

function optionalListviewData(html: string, id: string): unknown[] {
  try {
    return extractListviewData(html, id);
  } catch {
    return [];
  }
}

function parseGalleryIcon(value: unknown): GalleryIcon {
  if (!record(value)) throw new Error("Icon gallery row is not an object.");
  const name = cleanIconName(value.icon ?? value.name);
  const id = safePositiveInteger(value.id);
  const itemcount = safeNonNegativeInteger(value.itemcount);
  const spellcount = safeNonNegativeInteger(value.spellcount);
  return { id, name, itemcount, spellcount };
}

function collectGathererRelations(
  html: string,
  dataType: number,
  kind: Kind,
  iconName: string,
  output: Map<string, Relation>,
) {
  const marker = new RegExp(
    `WH\\.Gatherer\\.addData\\(\\s*${dataType}\\s*,\\s*16\\s*,`,
    "g",
  );
  for (const match of html.matchAll(marker)) {
    const parsed = parseBalancedJson(
      html,
      match.index + match[0].length,
      "object",
    );
    if (!record(parsed))
      throw new Error(`Gatherer type ${dataType} data is not an object.`);
    collectGathererRecords(parsed, kind, output, iconName);
  }
}

function collectAllGathererRelations(
  html: string,
  byIcon: Map<string, Map<string, Relation>>,
): number {
  const marker = /WH\.Gatherer\.addData\(\s*([36])\s*,\s*16\s*,/g;
  let mapsRead = 0;
  for (const match of html.matchAll(marker)) {
    const parsed = parseBalancedJson(
      html,
      match.index + match[0].length,
      "object",
    );
    if (!record(parsed)) continue;
    mapsRead += 1;
    const kind: Kind = match[1] === "3" ? "item" : "spell";
    for (const [rawId, value] of Object.entries(parsed)) {
      if (!record(value) || typeof value.icon !== "string") continue;
      let iconName: string;
      try {
        iconName = cleanIconName(value.icon);
      } catch {
        continue;
      }
      collectGathererRecords(
        { [rawId]: value },
        kind,
        getRelations(byIcon, iconName),
      );
    }
  }
  return mapsRead;
}

function collectGathererRecords(
  gathered: Record<string, unknown>,
  kind: Kind,
  output: Map<string, Relation>,
  requiredIcon?: string,
) {
  for (const [rawId, value] of Object.entries(gathered)) {
    if (
      !record(value) ||
      (requiredIcon !== undefined && value.icon !== requiredIcon)
    )
      continue;
    const numericId = Number(rawId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) continue;
    const name = cleanName(value.name_enus);
    if (name) output.set(`${kind}:${numericId}`, [kind, numericId, name]);
  }
}

function getRelations(
  relationsByIcon: Map<string, Map<string, Relation>>,
  iconName: string,
): Map<string, Relation> {
  let relations = relationsByIcon.get(iconName);
  if (!relations) {
    relations = new Map();
    relationsByIcon.set(iconName, relations);
  }
  return relations;
}

function parseBalancedJson(
  html: string,
  from: number,
  expected: "array" | "object",
): unknown {
  let start = from;
  while (start < html.length && /\s/.test(html[start])) start += 1;
  const opening = expected === "array" ? "[" : "{";
  const closing = expected === "array" ? "]" : "}";
  if (html[start] !== opening) throw new Error(`Expected JSON ${expected}.`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === opening) depth += 1;
    else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(start, index + 1)) as unknown;
      }
    }
  }
  throw new Error(`Unterminated JSON ${expected}.`);
}

function selectIcons(gallery: GalleryIcon[], limit: number): GalleryIcon[] {
  const unique = new Map<string, GalleryIcon>();
  for (const icon of gallery) {
    if (!unique.has(icon.name)) unique.set(icon.name, icon);
  }
  const remaining = [...unique.values()].filter(
    (icon) => icon.itemcount + icon.spellcount > 0,
  );
  const selected: GalleryIcon[] = [];
  const selectedNames = new Set<string>();

  const add = (icon: GalleryIcon | undefined) => {
    if (!icon || selected.length >= limit || selectedNames.has(icon.name))
      return;
    selected.push(icon);
    selectedNames.add(icon.name);
  };

  const addCategory = (
    candidates: GalleryIcon[],
    compare: (a: GalleryIcon, b: GalleryIcon) => number,
    categoryLimit: number,
  ) => {
    const categoryStart = selected.length;
    for (const icon of [...candidates].sort(compare)) {
      if (
        selected.length - categoryStart >= categoryLimit ||
        selected.length >= limit
      )
        break;
      add(icon);
    }
  };

  // Reserve most detail requests for Hunter abilities while leaving room for
  // other spell-bearing icons and item-rich icons in each small snapshot.
  addCategory(
    remaining.filter((icon) => isHunterIcon(icon.name)),
    (a, b) => usageWeight(b) - usageWeight(a) || a.name.localeCompare(b.name),
    Math.ceil(limit * 0.45),
  );
  addCategory(
    remaining.filter((icon) => icon.spellcount > 0),
    (a, b) => b.spellcount - a.spellcount || usageWeight(b) - usageWeight(a),
    Math.ceil(limit * 0.3),
  );
  remaining
    .sort(
      (a, b) => usageWeight(b) - usageWeight(a) || a.name.localeCompare(b.name),
    )
    .forEach(add);
  return selected;
}

function isHunterIcon(name: string): boolean {
  return /(?:^|_)hunter(?:_|$)|hunters?mark|aimedshot|arcaneshot|killcommand|steady_?shot|rapidfire|multishot|serpentsting|explosiveshot|blackarrow|feigndeath|deterrence|wyvernsting|trueshot|chimera_?shot|kill_?shot|tamebeast|beast_?mastery|marksman|survival_?spec|track_?(?:beasts|humanoids|undead|hidden)/i.test(
    name,
  );
}

function usageWeight(icon: GalleryIcon): number {
  return icon.spellcount * 8 + icon.itemcount;
}

function iconDetailUrl(icon: GalleryIcon): string {
  return `${ORIGIN}/forever/icon=${icon.id}/${encodeURIComponent(icon.name)}`;
}

function compareRelations(a: Relation, b: Relation): number {
  return a[0].localeCompare(b[0]) || a[1] - b[1] || a[2].localeCompare(b[2]);
}

function cleanIconName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9_ -]+$/.test(value) ||
    value.length > 200
  ) {
    throw new Error("Invalid icon filename.");
  }
  return value;
}

function cleanName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  if (
    name.length === 0 ||
    name.length > 200 ||
    /[\u0000-\u001f\u007f<>]/.test(name) ||
    /\(DND\)/i.test(name) ||
    /^(?:Deprecated\b|\[PH\]|\[DND\]|\[UNUSED\]|ZZOLD\b)/i.test(name)
  ) {
    return undefined;
  }
  return name;
}

function safePositiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid positive integer: ${String(value)}`);
  }
  return value;
}

function safeNonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid non-negative integer: ${String(value)}`);
  }
  return value;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Expected a positive integer, received ${JSON.stringify(value)}.`,
    );
  }
  return parsed;
}

function boundedPageLimit(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const limit = positiveInteger(value, fallback);
  if (limit > maximum) {
    throw new Error(
      `Usage import is bounded to ${maximum} detail pages, received ${limit}.`,
    );
  }
  return limit;
}

function argsValue(flag: string): string | undefined {
  const index = Bun.argv.indexOf(flag);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function mapConcurrent<T>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) return;
        await worker(values[index], index);
        await Bun.sleep(80);
      }
    },
  );
  await Promise.all(runners);
}

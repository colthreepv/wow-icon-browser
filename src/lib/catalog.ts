export type Usage = { kind: "item" | "spell"; id: number; name: string };
export type Icon = {
  id: number;
  name: string;
  filename: string;
  texturePath: string;
  fileDataId: number | null;
  groups: string[];
  atlas: number;
  cell: number;
  usage: Usage[];
};
export type Group = { id: string; category: string; label: string };
export type Atlas = {
  file: string;
  width: number;
  height: number;
  cellSize: number;
  columns: number;
  count: number;
  bytes: number;
};
export type Catalog = {
  icons: Icon[];
  groups: Group[];
  atlases: Atlas[];
  source: {
    revision: string;
    fileCount: number;
    uniqueIconCount: number;
    originalBytes: number;
  };
  usageCoverage: { icons: number; relations: number; scope: string };
  fileDataIdCoverage: {
    matched: number;
    unmatched: number;
    ambiguous: number;
    source: {
      repository: string;
      revision: string;
      file: string;
      sha256: string;
      normalization: string;
    } | null;
  };
};
export const assetUrl = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
  const response = await fetch(assetUrl("data/catalog.json"), {
    signal,
    cache: "no-cache",
  });
  if (!response.ok)
    throw new Error("The icon catalog could not be loaded. Please retry.");
  const raw: unknown = await response.json();
  return parseCatalog(raw);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function parseCatalog(raw: unknown): Catalog {
  if (
    !record(raw) ||
    (raw.version !== 1 && raw.version !== 2) ||
    !Array.isArray(raw.groups) ||
    !Array.isArray(raw.icons) ||
    !Array.isArray(raw.atlases) ||
    !record(raw.source) ||
    !record(raw.usageCoverage) ||
    !record(raw.usage)
  )
    throw new Error("Unsupported or damaged catalog. Please reload.");
  const groups: Group[] = raw.groups.map((value) => {
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      value.some((x) => typeof x !== "string")
    )
      throw new Error("Invalid catalog group");
    return {
      id: value[1],
      category: value[0],
      label: value[1].split("/").slice(1).join(" / "),
    };
  });
  const atlases: Atlas[] = raw.atlases.map((a) => {
    if (
      !record(a) ||
      typeof a.file !== "string" ||
      !/^atlases\/[a-zA-Z0-9._-]+\.webp$/.test(a.file) ||
      !["width", "height", "cellSize", "columns", "count", "bytes"].every(
        (k) =>
          typeof a[k] === "number" &&
          Number.isSafeInteger(a[k]) &&
          Number(a[k]) > 0,
      )
    )
      throw new Error("Invalid catalog atlas");
    return a as Atlas;
  });
  const source = raw.source;
  if (
    typeof source.revision !== "string" ||
    !["fileCount", "uniqueIconCount", "originalBytes"].every(
      (k) => typeof source[k] === "number" && Number.isSafeInteger(source[k]),
    )
  )
    throw new Error("Invalid catalog source");
  const usageMap = raw.usage;
  const icons: Icon[] = raw.icons.map((value, id) => {
    if (!Array.isArray(value) || value.length !== (raw.version === 2 ? 5 : 4))
      throw new Error("Invalid icon record");
    const [name, memberships, atlas, cell] = value;
    const fileDataId: unknown = raw.version === 2 ? value[4] : null;
    if (
      fileDataId !== null &&
      (typeof fileDataId !== "number" ||
        !Number.isSafeInteger(fileDataId) ||
        fileDataId <= 0 ||
        fileDataId > 0xffffffff)
    )
      throw new Error("Invalid FileDataID");
    if (
      typeof name !== "string" ||
      !name.length ||
      name.length > 300 ||
      /[\\/\x00-\x1f]/.test(name) ||
      !Array.isArray(memberships) ||
      memberships.length === 0 ||
      !memberships.every(
        (g) => Number.isInteger(g) && g >= 0 && g < groups.length,
      ) ||
      !Number.isInteger(atlas) ||
      !atlases[atlas] ||
      !Number.isInteger(cell) ||
      cell < 0 ||
      cell >= atlases[atlas].count
    )
      throw new Error("Invalid icon association");
    const entries = usageMap[name] ?? [];
    if (!Array.isArray(entries)) throw new Error("Invalid usage records");
    const usage: Usage[] = entries.map((e) => {
      if (
        !Array.isArray(e) ||
        e.length !== 3 ||
        !["item", "spell"].includes(e[0]) ||
        !Number.isSafeInteger(e[1]) ||
        e[1] <= 0 ||
        typeof e[2] !== "string"
      )
        throw new Error("Invalid usage record");
      return { kind: e[0], id: e[1], name: e[2] };
    });
    return {
      id,
      name,
      filename: `${name}.jpg`,
      texturePath: `Interface\\Icons\\${name}`,
      fileDataId: fileDataId as number | null,
      groups: memberships.map((g) => groups[g].id),
      atlas,
      cell,
      usage,
    };
  });
  if (
    source.uniqueIconCount !== icons.length ||
    new Set(icons.map((i) => i.name)).size !== icons.length
  )
    throw new Error("Incomplete catalog");
  const coverage = raw.usageCoverage;
  if (
    typeof coverage.icons !== "number" ||
    typeof coverage.relations !== "number" ||
    typeof coverage.scope !== "string"
  )
    throw new Error("Invalid usage coverage");
  let fileDataIdCoverage: Catalog["fileDataIdCoverage"] = {
    matched: 0,
    unmatched: icons.length,
    ambiguous: 0,
    source: null,
  };
  if (raw.version === 2) {
    const ids = raw.fileDataIdStats;
    const origin = raw.fileDataIdSource;
    if (
      !record(ids) ||
      !["matched", "unmatched", "ambiguous", "total"].every(
        (key) =>
          typeof ids[key] === "number" &&
          Number.isSafeInteger(ids[key]) &&
          Number(ids[key]) >= 0,
      ) ||
      ids.total !== icons.length ||
      Number(ids.matched) + Number(ids.unmatched) + Number(ids.ambiguous) !==
        icons.length ||
      ids.matched !== icons.filter((icon) => icon.fileDataId !== null).length
    )
      throw new Error("Invalid FileDataID coverage");
    if (
      origin !== null &&
      (!record(origin) ||
        !["repository", "revision", "file", "sha256", "normalization"].every(
          (key) => typeof origin[key] === "string",
        ) ||
        !/^[a-f0-9]{40}$/.test(String(origin.revision)) ||
        !/^[a-f0-9]{64}$/.test(String(origin.sha256)))
    )
      throw new Error("Invalid FileDataID source");
    if (origin === null && ids.matched !== 0)
      throw new Error("Missing FileDataID source");
    fileDataIdCoverage = {
      matched: Number(ids.matched),
      unmatched: Number(ids.unmatched),
      ambiguous: Number(ids.ambiguous),
      source: origin as Catalog["fileDataIdCoverage"]["source"],
    };
  }
  return {
    icons,
    groups,
    atlases,
    source: source as Catalog["source"],
    usageCoverage: coverage as Catalog["usageCoverage"],
    fileDataIdCoverage,
  };
}

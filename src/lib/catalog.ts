export type Usage = { kind: "item" | "spell"; id: number; name: string };
export type Icon = {
  id: number;
  name: string;
  filename: string;
  texturePath: string;
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
};
export const assetUrl = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
  const response = await fetch(assetUrl("data/catalog.json"), { signal });
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
    raw.version !== 1 ||
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
    if (!Array.isArray(value) || value.length !== 4)
      throw new Error("Invalid icon record");
    const [name, memberships, atlas, cell] = value;
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
  return {
    icons,
    groups,
    atlases,
    source: source as Catalog["source"],
    usageCoverage: coverage as Catalog["usageCoverage"],
  };
}

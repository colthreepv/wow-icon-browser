export type FileDataIdConflict = { name: string; ids: number[] };

export type ParsedFileDataIds = {
  /** Lower-case texture basenames with exactly one valid source FileDataID. */
  ids: Map<string, number>;
  /** Source basenames that resolve to more than one distinct FileDataID. */
  ambiguous: FileDataIdConflict[];
};

export type CatalogFileDataIdMatches = {
  ids: Record<string, number>;
  unmatched: string[];
  ambiguous: FileDataIdConflict[];
};

const MAX_UINT32 = 0xffff_ffff;
const interfaceIconPattern = /^interface\/icons\/([^/\\]+)\.(blp|tga)$/i;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Normalizes only case and the known texture extensions. */
export function normalizeCatalogIconName(originalName: string): string {
  return originalName
    .replaceAll("\\", "/")
    .toLowerCase()
    .replace(/\.(?:blp|tga)$/, "");
}

function normalizedTextureName(path: string): string | null {
  const match = interfaceIconPattern.exec(path.replaceAll("\\", "/"));
  return match?.[1].toLowerCase() ?? null;
}

function parseFileDataId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > MAX_UINT32) return null;
  return id;
}

/**
 * Parses the semicolon-delimited wowdev/listfile interface CSV format.
 * Only exact Interface/Icons basenames ending in .blp or .tga are relevant.
 */
export function parseFileDataIds(csv: string): ParsedFileDataIds {
  const idsByName = new Map<string, Set<number>>();
  const lines = csv.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fields = line.split(";");
    if (fields.length !== 2) continue;

    const name = normalizedTextureName(fields[1]);
    if (name === null) continue;

    const id = parseFileDataId(fields[0]);
    if (id === null) {
      throw new Error(
        `Invalid FileDataID on line ${index + 1}: ${JSON.stringify(fields[0])}`,
      );
    }

    const ids = idsByName.get(name) ?? new Set<number>();
    ids.add(id);
    idsByName.set(name, ids);
  }

  const uniqueIds = new Map<string, number>();
  const ambiguous: FileDataIdConflict[] = [];
  for (const name of [...idsByName.keys()].sort(compareStrings)) {
    const sourceIds = [...idsByName.get(name)!].sort((left, right) => left - right);
    if (sourceIds.length === 1) uniqueIds.set(name, sourceIds[0]);
    else ambiguous.push({ name, ids: sourceIds });
  }

  return { ids: uniqueIds, ambiguous };
}

/** Matches catalog basenames exactly after the documented name normalization. */
export function matchCatalogFileDataIds(
  catalogNames: readonly string[],
  parsed: ParsedFileDataIds,
): CatalogFileDataIdMatches {
  const ambiguousByName = new Map(
    parsed.ambiguous.map((conflict) => [conflict.name, conflict]),
  );
  const matches: Array<[string, number]> = [];
  const unmatched: string[] = [];
  const ambiguous: FileDataIdConflict[] = [];

  for (const catalogName of catalogNames) {
    const normalizedName = normalizeCatalogIconName(catalogName);
    const id = parsed.ids.get(normalizedName);
    if (id !== undefined) {
      matches.push([catalogName, id]);
      continue;
    }

    const conflict = ambiguousByName.get(normalizedName);
    if (conflict) ambiguous.push({ name: catalogName, ids: [...conflict.ids] });
    else unmatched.push(catalogName);
  }

  matches.sort(([left], [right]) => compareStrings(left, right));
  unmatched.sort(compareStrings);
  ambiguous.sort((left, right) => compareStrings(left.name, right.name));

  return {
    ids: Object.fromEntries(matches),
    unmatched,
    ambiguous,
  };
}

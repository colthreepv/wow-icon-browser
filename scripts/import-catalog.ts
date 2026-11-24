import sharp from "sharp";
import { mkdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { REVISION, SOURCE_URL, sourceFiles } from "./source";

const output = resolve("public");
const atlasDir = join(output, "atlases");
const quality = Number(process.env.ATLAS_QUALITY ?? 78);
const columns = Number(process.env.ATLAS_COLUMNS ?? 16);
if (![8, 16].includes(columns))
  throw new Error("ATLAS_COLUMNS must be 8 or 16");
const perAtlas = columns ** 2;
if (!Number.isInteger(quality) || quality < 1 || quality > 100)
  throw new Error("ATLAS_QUALITY must be 1–100");
const files = await sourceFiles();
const originalBytes = files.reduce((s, f) => s + f.bytes, 0);
if (files.length !== 33193 || originalBytes !== 60676471)
  throw new Error(
    `Snapshot integrity mismatch: ${files.length} files, ${originalBytes} bytes`,
  );
const groups = [...new Set(files.map((f) => f.group))].map((g) => [
  g.split("/")[0],
  g,
]);
const groupIndex = new Map(groups.map((g, i) => [g[1], i]));
const byName = new Map<
  string,
  {
    name: string;
    groups: number[];
    hash: string;
    absolute: string;
    paths: string[];
  }
>();
const collisions: { name: string; paths: string[] }[] = [];
const dimensions = new Map<string, number>();
for (const file of files) {
  const hash = createHash("sha256")
    .update(new Uint8Array(await Bun.file(file.absolute).arrayBuffer()))
    .digest("hex");
  const previous = byName.get(file.name);
  if (previous) {
    previous.paths.push(file.path);
    if (previous.hash !== hash)
      collisions.push({ name: file.name, paths: [...previous.paths] });
    if (!previous.groups.includes(groupIndex.get(file.group)!))
      previous.groups.push(groupIndex.get(file.group)!);
  } else
    byName.set(file.name, {
      name: file.name,
      groups: [groupIndex.get(file.group)!],
      hash,
      absolute: file.absolute,
      paths: [file.path],
    });
}
await mkdir(join(output, "data"), { recursive: true });
await mkdir(atlasDir, { recursive: true });
if (collisions.length) {
  await Bun.write(
    join(output, "data/collisions.json"),
    JSON.stringify(collisions, null, 2),
  );
  throw new Error(
    `Found ${collisions.length} same-filename/different-content collisions. Review public/data/collisions.json; nothing silently overwritten.`,
  );
}
const icons = [...byName.values()];
const uniqueImages = new Map<string, (typeof icons)[number]>();
for (const icon of icons)
  if (!uniqueImages.has(icon.hash)) uniqueImages.set(icon.hash, icon);
const images = [...uniqueImages.values()];
let cellSize = 0;
for (let offset = 0; offset < images.length; offset += 128) {
  await Promise.all(
    images.slice(offset, offset + 128).map(async (image) => {
      const meta = await sharp(image.absolute).metadata();
      if (!meta.width || !meta.height)
        throw new Error(`Unreadable image: ${image.name}`);
      const key = `${meta.width}x${meta.height}`;
      dimensions.set(key, (dimensions.get(key) ?? 0) + 1);
      cellSize = Math.max(cellSize, meta.width, meta.height);
    }),
  );
}
if (cellSize > 128)
  throw new Error(
    `Unexpected native image size ${cellSize}; review before building atlases`,
  );
const oldManifestFile = Bun.file(join(output, "data/catalog.json"));
const oldFiles: string[] = (await oldManifestFile.exists())
  ? (await oldManifestFile.json()).atlases.map((a: { file: string }) => a.file)
  : [];
const atlases: {
  file: string;
  width: number;
  height: number;
  cellSize: number;
  columns: number;
  count: number;
  bytes: number;
}[] = [];
const locations = new Map<string, [number, number]>();
for (let offset = 0; offset < images.length; offset += perAtlas) {
  const batch = images.slice(offset, offset + perAtlas);
  const width = columns * cellSize;
  const height = Math.ceil(batch.length / columns) * cellSize;
  const inputs = await Promise.all(
    batch.map(async (image, cell) => ({
      input: await sharp(image.absolute)
        .resize(cellSize, cellSize, {
          fit: "contain",
          withoutEnlargement: true,
          background: "#151719",
        })
        .ensureAlpha()
        .raw()
        .toBuffer(),
      raw: { width: cellSize, height: cellSize, channels: 4 as const },
      left: (cell % columns) * cellSize,
      top: Math.floor(cell / columns) * cellSize,
    })),
  );
  const buffer = await sharp({
    create: { width, height, channels: 4, background: "#151719" },
  })
    .composite(inputs)
    .removeAlpha()
    .webp({ quality, effort: 5 })
    .toBuffer();
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  const file = `atlases/${String(atlases.length).padStart(4, "0")}-${hash}.webp`;
  const atlasIndex = atlases.length;
  await Bun.write(join(output, file), buffer);
  atlases.push({
    file,
    width,
    height,
    cellSize,
    columns,
    count: batch.length,
    bytes: buffer.length,
  });
  batch.forEach((image, cell) => locations.set(image.hash, [atlasIndex, cell]));
  if (atlasIndex % 50 === 0)
    console.log(
      `Atlas ${atlasIndex}: ${Math.min(offset + perAtlas, images.length)}/${images.length} unique images`,
    );
}
const usageFile = Bun.file(join(output, "data/usage.json"));
const usageSource = (await usageFile.exists())
  ? await usageFile.json()
  : { icons: {}, source: { scope: "Usage enrichment has not been imported." } };
const usage: Record<string, unknown[]> = {};
for (const icon of icons)
  if (
    Array.isArray(usageSource.icons[icon.name]) &&
    usageSource.icons[icon.name].length
  )
    usage[icon.name] = usageSource.icons[icon.name];
const usageCoverage = {
  icons: Object.keys(usage).length,
  relations: Object.values(usage).reduce((s, u) => s + u.length, 0),
  scope: usageSource.source.scope,
};
const source = {
  revision: REVISION,
  fileCount: files.length,
  uniqueIconCount: icons.length,
  originalBytes,
};
const manifest = {
  version: 1,
  source,
  groups,
  atlases,
  icons: icons.map((icon) => [
    icon.name,
    icon.groups,
    ...locations.get(icon.hash)!,
  ]),
  usage,
  usageCoverage,
};
await Bun.write(join(output, "data/catalog.json"), JSON.stringify(manifest));
const totalAtlasBytes = atlases.reduce((s, a) => s + a.bytes, 0);
const report = {
  source: {
    repository: "ZHamburglar/wow-forever-icons-and-macros",
    revision: REVISION,
    archive: SOURCE_URL,
  },
  files: files.length,
  originalBytes,
  uniqueNames: icons.length,
  uniqueImages: images.length,
  duplicateFilenames: icons
    .filter((i) => i.paths.length > 1)
    .map((i) => ({ name: i.name, paths: i.paths })),
  sameNameContentCollisions: collisions,
  caseCollisions: [...Map.groupBy(icons, (i) => i.name.toLowerCase()).values()]
    .filter((list) => list.length > 1)
    .map((list) => list.map((i) => i.name)),
  originalDimensions: Object.fromEntries(dimensions),
  atlas: {
    format: "lossy WebP",
    quality,
    columns,
    perAtlas,
    cellSize,
    count: atlases.length,
    bytes: totalAtlasBytes,
    decodedRgbaBytes: atlases.reduce((s, a) => s + a.width * a.height * 4, 0),
  },
  metadataBytes: await oldManifestFile.size,
  usageCoverage,
};
report.metadataBytes = Bun.file(join(output, "data/catalog.json")).size;
await Bun.write(
  join(output, "data/import-report.json"),
  JSON.stringify(report, null, 2),
);
const currentFiles = new Set(atlases.map((a) => a.file));
for (const file of oldFiles)
  if (!currentFiles.has(file) && /^atlases\/[\w.-]+\.webp$/.test(file))
    await unlink(join(output, file));
console.log(
  JSON.stringify(
    { ...report, duplicateFilenames: report.duplicateFilenames.length },
    null,
    2,
  ),
);

// Reuse the separately pinned ID snapshot when rebuilding image assets.
if (await Bun.file(join(output, "data/filedataids.json")).exists()) {
  const merge = Bun.spawn(
    [process.execPath, resolve("scripts/merge-filedataids.ts")],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await merge.exited) !== 0)
    throw new Error("FileDataID merge failed after import");
}

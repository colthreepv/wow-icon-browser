import { mkdir, readdir, stat } from "node:fs/promises";
import { resolve, join, relative } from "node:path";

export const REVISION = "207c135a931044deb51808f7a65c2aa0ec1c1be2";
export const SOURCE_URL = `https://codeload.github.com/ZHamburglar/wow-forever-icons-and-macros/tar.gz/${REVISION}`;
export const SOURCE_ROOT = resolve(".cache/upstream");
export async function ensureSource(): Promise<void> {
  if (await Bun.file(join(SOURCE_ROOT, "icons/index.html")).exists()) return;
  await mkdir(SOURCE_ROOT, { recursive: true });
  const archive = resolve(".cache/upstream.tar.gz");
  if (!(await Bun.file(archive).exists())) {
    console.log("Downloading pinned upstream snapshot…");
    const response = await fetch(SOURCE_URL);
    if (!response.ok)
      throw new Error(`Upstream download failed: ${response.status}`);
    await Bun.write(archive, response);
  }
  const proc = Bun.spawn(
    ["tar", "-xf", archive, "-C", SOURCE_ROOT, "--strip-components=1"],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await proc.exited) !== 0) throw new Error("Snapshot extraction failed");
}
export type SourceFile = {
  absolute: string;
  path: string;
  name: string;
  group: string;
  category: string;
  bytes: number;
};
export async function sourceFiles(): Promise<SourceFile[]> {
  await ensureSource();
  const root = join(SOURCE_ROOT, "icons");
  const files: SourceFile[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (/\.jpg$/i.test(entry.name)) {
        const path = relative(root, absolute).replaceAll("\\", "/");
        const group = path.slice(0, path.lastIndexOf("/"));
        files.push({
          absolute,
          path,
          group,
          category: group.split("/")[0],
          name: entry.name.slice(0, -4),
          bytes: (await stat(absolute)).size,
        });
      }
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

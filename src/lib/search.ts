import type { Icon } from "./catalog";

export const normalize = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const compact = (text: string) => normalize(text).replaceAll(" ", "");
type Indexed = {
  name: string;
  compactName: string;
  all: string;
  compactAll: string;
};
const index = new WeakMap<Icon, Indexed>();
function indexed(icon: Icon): Indexed {
  let value = index.get(icon);
  if (!value) {
    const name = normalize(icon.name);
    const all = normalize(
      [icon.name, ...icon.groups, ...icon.usage.map((u) => u.name)].join(" "),
    );
    value = {
      name,
      compactName: name.replaceAll(" ", ""),
      all,
      compactAll: all.replaceAll(" ", ""),
    };
    index.set(icon, value);
  }
  return value;
}
export function searchIcons(icons: Icon[], query: string): Icon[] {
  const q = normalize(query.replace(/\.jpg$/i, ""));
  if (!q) return icons;
  const tokens = q.split(" ");
  const cq = compact(q);
  const matches: { icon: Icon; score: number }[] = [];
  for (const icon of icons) {
    const text = indexed(icon);
    if (
      !tokens.every(
        (token) => text.all.includes(token) || text.compactAll.includes(token),
      )
    )
      continue;
    const score =
      text.name === q || text.compactName === cq
        ? 0
        : text.name.startsWith(q) || text.compactName.startsWith(cq)
          ? 1
          : text.compactName.includes(cq)
            ? 2
            : tokens.every((t) => text.compactName.includes(t))
              ? 3
              : 4;
    matches.push({ icon, score });
  }
  return matches
    .sort((a, b) => a.score - b.score || a.icon.id - b.icon.id)
    .map((m) => m.icon);
}

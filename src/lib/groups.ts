import type { Catalog, Group, Icon } from "./catalog";
import achievements from "../data/semantic-achievements.json";
import generalA from "../data/semantic-general-a.json";
import generalB from "../data/semantic-general-b.json";

export type CategoryNode = {
  id: string;
  label: string;
  category: string;
  children: CategoryNode[];
};
export const curatedGroups: Record<string, string> = {
  ...achievements,
  ...generalA,
  ...generalB,
};
export const withinGroup = (path: string, parent: string) =>
  path === parent || path.startsWith(`${parent}/`);
export function ancestors(path: string): string[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}
export function buildCategoryTree(groups: Group[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  for (const group of groups) {
    for (const id of ancestors(group.id)) {
      if (nodes.has(id)) continue;
      const parts = id.split("/");
      const node: CategoryNode = {
        id,
        label: parts.at(-1)!,
        category: parts[0],
        children: [],
      };
      nodes.set(id, node);
      if (parts.length === 1) roots.push(node);
      else nodes.get(parts.slice(0, -1).join("/"))!.children.push(node);
    }
  }
  function sort(list: CategoryNode[]) {
    list.sort((a, b) => a.label.localeCompare(b.label, "en"));
    list.forEach((node) => sort(node.children));
  }
  sort(roots);
  return roots;
}
export function createBrowseGroups(catalog: Catalog) {
  const originalPaths = new Set(catalog.groups.map((g) => g.id));
  for (const [source, target] of Object.entries(curatedGroups)) {
    if (
      !originalPaths.has(source) ||
      source.split("/")[0] !== target.split("/")[0] ||
      /^(Classes|Professions)\//.test(source)
    )
      throw new Error(`Invalid curated group mapping: ${source}`);
  }
  const paths = new Map(
    catalog.groups.map((g) => [g.id, curatedGroups[g.id] ?? g.id]),
  );
  const groups = [...new Set(paths.values())].map((id) => ({
    id,
    category: id.split("/")[0],
    label: id.split("/").slice(1).join(" / "),
  }));
  const ancestry = new Map(
    catalog.groups.map((g) => [g.id, ancestors(paths.get(g.id)!)]),
  );
  return { paths, groups, ancestry, tree: buildCategoryTree(groups) };
}
export function countHierarchy(
  icons: Icon[],
  ancestry: Map<string, string[]>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const icon of icons) {
    const memberships = new Set(
      icon.groups.flatMap((id) => ancestry.get(id) ?? ancestors(id)),
    );
    for (const id of memberships) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

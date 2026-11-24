import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { parseCatalog, type Icon } from "../src/lib/catalog";
import { searchIcons } from "../src/lib/search";
import { luaString, makeMacroCommand } from "../src/lib/macro";
import {
  buildCategoryTree,
  countHierarchy,
  createBrowseGroups,
  curatedGroups,
  withinGroup,
} from "../src/lib/groups";

const raw = JSON.parse(readFileSync("public/data/catalog.json", "utf8"));
const catalog = parseCatalog(raw);

describe("semantic browse hierarchy", () => {
  test("builds intermediate levels and matches only complete path segments", () => {
    const tree = buildCategoryTree([
      {
        id: "General/Achievements/Dungeons/Raids",
        category: "General",
        label: "Raids",
      },
    ]);
    expect(tree[0].children[0].label).toBe("Achievements");
    expect(tree[0].children[0].children[0].children[0].id).toBe(
      "General/Achievements/Dungeons/Raids",
    );
    expect(
      withinGroup("General/Achievements/Dungeons", "General/Achievements"),
    ).toBe(true);
    expect(
      withinGroup("General/AchievementsExtra", "General/Achievements"),
    ).toBe(false);
  });
  test("preserves all icon associations and standalone class/profession identities", () => {
    const browse = createBrowseGroups(catalog);
    for (const group of catalog.groups) {
      expect(browse.paths.has(group.id)).toBe(true);
      if (group.category === "Classes" || group.category === "Professions")
        expect(browse.paths.get(group.id)).toBe(group.id);
    }
    expect(browse.paths.get("Professions/Mining")).toBe("Professions/Mining");
    const counts = countHierarchy(catalog.icons, browse.ancestry);
    expect(counts.get("Classes")).toBe(1395);
    expect(counts.get("General")).toBe(28925);
    expect(counts.get("Professions")).toBe(2873);
    expect(browse.groups.length).toBeLessThan(catalog.groups.length / 2);
  });
  test("semantic themes join related small folders without changing source metadata", () => {
    const browse = createBrowseGroups(catalog);
    const admiral = catalog.icons.find((icon) =>
      icon.groups.includes("General/Achievements/Admiral"),
    )!;
    expect(admiral.groups).toContain("General/Achievements/Admiral");
    expect(browse.paths.get("General/Achievements/Admiral")).not.toBe(
      "General/Achievements",
    );
    expect(
      Object.keys(curatedGroups).every((path) =>
        catalog.groups.some((group) => group.id === path),
      ),
    ).toBe(true);
  });
  test("parent counters deduplicate icons belonging to several descendant folders", () => {
    const fixture = { ...catalog.icons[0], groups: ["source/a", "source/b"] };
    const counts = countHierarchy(
      [fixture],
      new Map([
        ["source/a", ["General", "General/World", "General/World/A"]],
        ["source/b", ["General", "General/World", "General/World/B"]],
      ]),
    );
    expect(counts.get("General/World")).toBe(1);
    expect(counts.get("General/World/A")).toBe(1);
    expect(counts.get("General/World/B")).toBe(1);
  });
});

describe("full upstream import", () => {
  test("every source record remains represented in its exact original group", () => {
    const html = readFileSync(".cache/upstream/icons/index.html", "utf8");
    const match = html.match(/^const DATA = (.+);$/m);
    expect(match).not.toBeNull();
    const upstream: { cat: string; folder: string; icons: string[] }[] =
      JSON.parse(match![1]);
    const byName = new Map(catalog.icons.map((i) => [i.name, i]));
    let sourceAssociations = 0;
    for (const group of upstream)
      for (const name of group.icons) {
        sourceAssociations++;
        const icon = byName.get(name);
        if (!icon || !icon.groups.includes(group.folder))
          throw new Error(`Missing association ${group.folder}/${name}`);
      }
    expect(sourceAssociations).toBe(33193);
    expect(catalog.source.fileCount).toBe(33193);
    expect(catalog.source.originalBytes).toBe(60676471);
    expect(byName.size).toBe(new Set(upstream.flatMap((g) => g.icons)).size);
    expect(catalog.icons.at(-1)).toBeDefined();
  });
  test("every atlas address falls inside the actual image bounds", () => {
    for (const icon of catalog.icons) {
      const atlas = catalog.atlases[icon.atlas];
      expect(
        ((icon.cell % atlas.columns) + 1) * atlas.cellSize,
      ).toBeLessThanOrEqual(atlas.width);
      expect(
        (Math.floor(icon.cell / atlas.columns) + 1) * atlas.cellSize,
      ).toBeLessThanOrEqual(atlas.height);
      expect(readFileSync(`public/${atlas.file}`).length).toBe(atlas.bytes);
    }
  });
  test("boundary parser rejects a broken address rather than silently losing an icon", () => {
    const broken = structuredClone(raw);
    broken.icons[0][2] = 999999;
    expect(() => parseCatalog(broken)).toThrow();
  });
});

describe("user search behavior", () => {
  test("eagle eye resolves compact filenames and preserves exact source identity", () => {
    for (const query of ["eagle eye", "EAGLE_EYE", "eagleeye"])
      expect(
        searchIcons(catalog.icons, query).some(
          (i) => i.name === "ability_hunter_eagleeye",
        ),
      ).toBe(true);
  });
  test("all matches are returned beyond the rejected 1000 ceiling", () => {
    const matches = searchIcons(catalog.icons, "inv");
    expect(matches.length).toBeGreaterThan(1000);
    expect(searchIcons(catalog.icons, "")).toHaveLength(catalog.icons.length);
  });
  test("all words must match and exact identity outranks prefix and substring", () => {
    const fixture = (name: string, id: number): Icon => ({
      id,
      name,
      filename: `${name}.jpg`,
      texturePath: `Interface\\Icons\\${name}`,
      groups: ["General/Spells"],
      atlas: 0,
      cell: 0,
      usage: [],
    });
    const icons = [
      fixture("my_frost_bolt", 0),
      fixture("frost_bolt_extra", 1),
      fixture("frost_bolt", 2),
      fixture("frost_fire", 3),
    ];
    expect(searchIcons(icons, "frost bolt").map((i) => i.id)).toEqual([
      2, 1, 0,
    ]);
    expect(searchIcons(icons, "frost nonexistent")).toHaveLength(0);
  });
  test("verified item/spell names participate in search", () => {
    const fixture: Icon = {
      ...catalog.icons[0],
      usage: [{ kind: "spell", id: 123, name: "An Unusual Spell Name" }],
    };
    expect(searchIcons([fixture], "unusual spell")).toHaveLength(1);
    const known = catalog.icons.find((i) => i.usage.length > 0);
    if (known)
      expect(searchIcons(catalog.icons, known.usage[0].name)).toContain(known);
  });
  test("full-catalog searches have bounded measured runtime", () => {
    const queries = [
      "eagle eye",
      "inv",
      "fire",
      "frost bolt",
      "sword",
      "zzzz_no_matches",
    ];
    queries.forEach((q) => searchIcons(catalog.icons, q));
    const times = Array.from({ length: 30 }, (_, i) => {
      const start = performance.now();
      searchIcons(catalog.icons, queries[i % queries.length]);
      return performance.now() - start;
    }).sort((a, b) => a - b);
    console.log(
      `Search p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)}ms; metadata ${gzipSync(JSON.stringify(raw)).length} bytes gzip`,
    );
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(100);
  });
});

describe("Lua command output", () => {
  test("explicitly preserves both macro name arguments and the escaped texture path", () => {
    expect(
      makeMacroCommand("UI", "Interface\\Icons\\Ability_Hunter_EagleEye"),
    ).toBe(
      '/run EditMacro("UI","UI","Interface\\\\Icons\\\\Ability_Hunter_EagleEye")',
    );
  });
  test("quotes, slash, unicode and control characters cannot break the Lua string", () => {
    expect(luaString('A"B\\C')).toBe('"A\\"B\\\\C"');
    expect(luaString("Làra 🐺")).toBe('"Làra 🐺"');
    expect(luaString("\n\r\t\0" + "12")).toBe('"\\010\\013\\009\\00012"');
    expect(luaString('"); print("oops')).toBe('"\\"); print(\\"oops"');
  });
});

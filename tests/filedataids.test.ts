import { describe, expect, test } from "bun:test";
import {
  matchCatalogFileDataIds,
  normalizeCatalogIconName,
  parseFileDataIds,
} from "../src/lib/filedataids";

describe("FileDataID listfile parsing", () => {
  test("matches the known Eagle Eye record and ignores its meta record", () => {
    const csv = [
      "132172;Interface/ICONS/Ability_Hunter_EagleEye.blp",
      "2207067;Interface/ICONS/Ability_Hunter_EagleEye.blp.meta",
    ].join("\n");
    const parsed = parseFileDataIds(csv);
    expect(parsed.ids.get("ability_hunter_eagleeye")).toBe(132172);
    expect(parsed.ids.size).toBe(1);
    expect(parsed.ambiguous).toEqual([]);
  });

  test("normalizes case and both slash styles", () => {
    const parsed = parseFileDataIds(
      "12;interface\\icons\\MixedCase.BLP\n13;INTERFACE/ICONS/OTHER.TGA\n",
    );
    expect([...parsed.ids]).toEqual([
      ["mixedcase", 12],
      ["other", 13],
    ]);
  });

  test("reports same-basename source conflicts without choosing an ID", () => {
    const parsed = parseFileDataIds(
      "10;Interface/Icons/Shared.blp\n11;Interface/Icons/shared.tga\n",
    );
    expect(parsed.ids.has("shared")).toBe(false);
    expect(parsed.ambiguous).toEqual([{ name: "shared", ids: [10, 11] }]);
    const matched = matchCatalogFileDataIds(["shared", "absent"], parsed);
    expect(matched.ids).toEqual({});
    expect(matched.ambiguous).toEqual([{ name: "shared", ids: [10, 11] }]);
    expect(matched.unmatched).toEqual(["absent"]);
  });

  test("rejects invalid relevant IDs and ignores malformed nontexture rows", () => {
    for (const id of ["0", "-1", "1.5", "4294967296", "abc"]) {
      expect(() =>
        parseFileDataIds(`${id};Interface/Icons/Broken.blp`),
      ).toThrow("Invalid FileDataID");
    }
    expect(() =>
      parseFileDataIds("not-an-id;Interface/Icons/Broken.blp.meta"),
    ).not.toThrow();
    expect(() => parseFileDataIds("abc;Interface/Spells/Other.blp")).not.toThrow();
  });

  test("strips known catalog texture extensions before exact matching", () => {
    const parsed = parseFileDataIds("20;Interface/Icons/tga_icon.tga");
    expect(normalizeCatalogIconName("TGA_ICON.tga")).toBe("tga_icon");
    expect(matchCatalogFileDataIds(["TGA_ICON.tga"], parsed).ids).toEqual({
      "TGA_ICON.tga": 20,
    });
  });
});

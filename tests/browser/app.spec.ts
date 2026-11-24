import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { makeMacroCommand } from "../../src/lib/macro";

const manifest = JSON.parse(readFileSync("public/data/catalog.json", "utf8"));
const artifacts = process.env.ARTIFACT_DIR ?? "docs";
mkdirSync(artifacts, { recursive: true });
const search = (page: import("@playwright/test").Page) =>
  page.getByRole("searchbox");
const tiles = (page: import("@playwright/test").Page) =>
  page.getByTestId("icon-tile");

test("desktop: complete virtualized catalog, real search, escaped clipboard, saved state and privacy", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(tiles(page).first()).toBeVisible();
  await expect(page.getByTestId("result-count")).toContainText(/33[,.\s]?193/);
  await expect
    .poll(() =>
      tiles(page)
        .locator("img")
        .evaluateAll(
          (images) =>
            images.length > 0 &&
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
  const mountedInitial = await tiles(page).count();
  expect(mountedInitial).toBeLessThan(1000);
  expect(requests.filter((u) => u.includes("/atlases/")).length).toBeLessThan(
    manifest.atlases.length / 3,
  );
  const initialResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => ({
      name: e.name,
      bytes: (e as PerformanceResourceTiming).encodedBodySize,
      transfer: (e as PerformanceResourceTiming).transferSize,
    })),
  );
  await page.screenshot({
    path: `${artifacts}/desktop.png`,
    animations: "disabled",
  });

  const grid = page.getByTestId("icon-grid");
  await grid.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    page.locator(`[data-icon-id="${manifest.icons.length - 1}"]`),
  ).toBeVisible();
  expect(await tiles(page).count()).toBeLessThan(1000);
  const lastName = manifest.icons.at(-1)[0];
  await search(page).fill(lastName);
  await expect(tiles(page)).toHaveCount(1);
  await tiles(page).first().click();
  await expect(
    page.getByText(`${lastName}.jpg`, { exact: true }).first(),
  ).toBeVisible();

  await search(page).fill("eagle eye");
  await expect(tiles(page)).toHaveCount(1);
  await tiles(page).first().click();
  await expect(
    page.getByText("ability_hunter_eagleeye.jpg", { exact: true }).first(),
  ).toBeVisible();
  const macroName = 'Raid "UI"\\Hunter';
  await page.getByLabel(/macro name/i).fill(macroName);
  const expected = makeMacroCommand(macroName, 132172);
  await page
    .getByRole("button", { name: /copy.*(?:editmacro|command)/i })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    expected,
  );
  await expect(page.getByText(/copied/i).first()).toBeVisible();
  await page.screenshot({
    path: `${artifacts}/desktop-detail.png`,
    animations: "disabled",
  });
  await expect(page.getByLabel("FileDataID", { exact: true })).toHaveValue(
    "132172",
  );
  await page
    .getByRole("button", { name: "Copy FileDataID", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "132172",
  );
  await page
    .getByRole("button", { name: "Add to favorites", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove from favorites", exact: true })
    .waitFor();
  await page.getByLabel("Show names", { exact: true }).check();
  await page.getByLabel("Size", { exact: true }).fill("2");
  const shared = page.url();
  expect(new URL(shared).searchParams.get("q")).toBe("eagle eye");
  await page.reload();
  await expect(search(page)).toHaveValue("eagle eye");
  await expect(page.getByLabel(/macro name/i)).toHaveValue(macroName);
  await expect(page.getByLabel("Show names", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Size", { exact: true })).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: "Remove from favorites", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Favorites/ }).click();
  await expect(tiles(page)).toHaveCount(1);

  await search(page).fill("no_such_icon_987654321");
  await expect(tiles(page)).toHaveCount(0);
  await expect(page.getByText(/no (?:icons|results)/i).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await search(page).blur();
  await page.keyboard.press("/");
  await expect(search(page)).toBeFocused();
  expect(
    requests.every((url) => new URL(url).origin === new URL(page.url()).origin),
  ).toBe(true);
  expect(errors).toEqual([]);

  const initialAtlasFiles = [
    ...new Set(
      initialResources
        .filter((r) => r.name.includes("/atlases/"))
        .map((r) => r.name.split("/atlases/")[1]),
    ),
  ];
  const initialAtlases = manifest.atlases.filter((a: { file: string }) =>
    initialAtlasFiles.includes(a.file.replace("atlases/", "")),
  );
  const report = {
    viewport: "1920x1080",
    catalogEntries: manifest.icons.length,
    mountedInitial,
    atlasSize: manifest.atlases[0].count,
    initialImageRequests: initialAtlasFiles.length,
    initialImageEncodedBytes: initialResources
      .filter((r) => r.name.includes("/atlases/"))
      .reduce((s, r) => s + r.bytes, 0),
    initialImageDecodedRgbaEstimateBytes: initialAtlases.reduce(
      (s: number, a: { width: number; height: number }) =>
        s + a.width * a.height * 4,
      0,
    ),
    metadataEncodedBytes: initialResources
      .filter((r) => r.name.includes("/data/catalog.json"))
      .reduce((s, r) => s + r.bytes, 0),
    initialResourcesEncodedBytes: initialResources.reduce(
      (s, r) => s + r.bytes,
      0,
    ),
    privacy: "Only same-origin requests observed",
    note: "Decoded image estimate is width × height × 4 for distinct initial atlas resources, excluding browser/GPU cache overhead. Encoded bytes use browser Resource Timing and account for server content encoding.",
  };
  writeFileSync(
    `${artifacts}/browser-${manifest.atlases[0].count}.json`,
    JSON.stringify(report, null, 2),
  );
});

test("mobile: searchable catalog and usable icon drawer without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?q=eagle+eye");
  await expect(tiles(page)).toHaveCount(1);
  await page.screenshot({
    path: `${artifacts}/mobile.png`,
    animations: "disabled",
  });
  await tiles(page).first().click();
  await expect(page.getByLabel(/macro name/i)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${artifacts}/mobile-detail.png`,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Close detail", exact: true }).click();
  await expect(tiles(page).first()).toBeVisible();
});

test("1200px: filters, zoom and keyboard work together; scrolling and sparse search are measured", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("./");
  await expect(tiles(page).first()).toBeVisible();
  await page.getByRole("button", { name: /^Hunter\s*163$/ }).click();
  await expect(page.getByTestId("result-count")).toContainText("163");
  await tiles(page).first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tiles(page).nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^All icons/ }).click();
  const scroll = await page.getByTestId("icon-grid").evaluate(async (el) => {
    const frames: number[] = [];
    let previous = performance.now();
    for (let i = 0; i < 24; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const now = performance.now();
      frames.push(now - previous);
      previous = now;
      el.scrollTop = i * 1500;
    }
    frames.sort((a, b) => a - b);
    return {
      p95FrameMs: frames[Math.floor(frames.length * 0.95)],
      maxFrameMs: frames.at(-1),
    };
  });
  const queries = ["eagle eye", "fire", "frost bolt", "gem", "inv", "sword"];
  for (const query of queries) {
    await search(page).fill(query);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((r) => r.name.includes("/atlases/"))
      .map((r) => ({
        file: r.name.split("/atlases/")[1],
        bytes: (r as PerformanceResourceTiming).encodedBodySize,
      })),
  );
  const uniqueFiles = new Set(resources.map((r) => r.file));
  writeFileSync(
    `${artifacts}/workload-${manifest.atlases[0].count}.json`,
    JSON.stringify(
      {
        viewport: "1200x900",
        atlasSize: manifest.atlases[0].count,
        workload:
          "Initial viewport, Hunter filter/keyboard, 24 frames of 1500px scrolling, then six real search queries",
        queries,
        ...scroll,
        uniqueAtlasRequests: uniqueFiles.size,
        imageEncodedBytes: resources.reduce((s, r) => s + r.bytes, 0),
        requestedAtlasDecodedRgbaEstimateBytes: manifest.atlases
          .filter((a: { file: string }) =>
            uniqueFiles.has(a.file.replace("atlases/", "")),
          )
          .reduce(
            (s: number, a: { width: number; height: number }) =>
              s + a.width * a.height * 4,
            0,
          ),
        note: "Cumulative requested-image estimate, not simultaneous residency. Resource Timing encoded bytes; cache and GPU overhead excluded.",
      },
      null,
      2,
    ),
  );
});

test("catalog failure can be retried, clipboard denial leaves the command available", async ({
  page,
}) => {
  await page.route("**/data/catalog.json", (r) => r.abort());
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: /retry|try again/i }),
  ).toBeVisible();
  await page.unroute("**/data/catalog.json");
  await page.getByRole("button", { name: /retry|try again/i }).click();
  await expect(tiles(page).first()).toBeVisible();
  await search(page).fill("eagle eye");
  await tiles(page).first().click();
  await page.getByLabel(/macro name/i).fill("UI");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: /copy.*(?:editmacro|command)/i })
    .click();
  await expect(
    page
      .getByText(
        /could not|failed|select.*copy|clipboard.*(?:unavailable|denied|blocked)/i,
      )
      .first(),
  ).toBeVisible();
});

test("missing images and disabled storage keep the selection flow usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", {
      value: () => {
        throw new Error("Storage blocked");
      },
    });
    Object.defineProperty(Storage.prototype, "setItem", {
      value: () => {
        throw new Error("Storage blocked");
      },
    });
  });
  await page.route("**/atlases/**", (r) => r.abort());
  await page.goto("./?q=eagle+eye");
  await expect(tiles(page)).toHaveCount(1);
  await expect(
    page.getByRole("img", { name: /image unavailable/ }).first(),
  ).toBeVisible();
  await expect(page.getByText(/browser storage unavailable/i)).toBeVisible();
  await tiles(page).first().click();
  await page
    .getByRole("button", { name: "Add to favorites", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove from favorites", exact: true }),
  ).toBeVisible();
  await page.getByLabel(/macro name/i).fill("UI");
  await expect(
    page.getByLabel("EditMacro command", { exact: true }),
  ).toHaveValue(makeMacroCommand("UI", 132172));
});

test("keyboard focus survives inspector dismissal, grid resize and scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("./");
  await expect(tiles(page).first()).toBeVisible();
  const tile = page.locator('[data-icon-id="7"]');
  await tile.click();
  await page.getByLabel(/macro name/i).focus();
  await page.keyboard.press("Escape");
  await expect(tile).toBeFocused();
  await tile.click();
  await page.setViewportSize({ width: 830, height: 900 });
  await expect(tile).toBeFocused();
  await page.getByTestId("icon-grid").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByTestId("icon-grid")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("dialog", { name: "icon detail", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close detail", exact: true }).click();
  await expect(page.getByTestId("icon-grid")).toBeFocused();
});

test("an unmapped ID disables command copying instead of silently using a texture path", async ({
  page,
}) => {
  const fixture = structuredClone(manifest);
  fixture.icons.find(
    (row: unknown[]) => row[0] === "ability_hunter_eagleeye",
  )[4] = null;
  fixture.fileDataIdStats.matched--;
  fixture.fileDataIdStats.unmatched++;
  await page.route("**/data/catalog.json", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto("./?q=eagle+eye");
  await expect(tiles(page)).toHaveCount(1);
  await tiles(page).first().click();
  await page.getByLabel(/macro name/i).fill("UI");
  await expect(
    page.getByRole("button", { name: "Copy command", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Copy FileDataID", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("EditMacro command", { exact: true }),
  ).toHaveValue("No unambiguous FileDataID mapping found.");
});

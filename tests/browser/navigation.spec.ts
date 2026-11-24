import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const artifacts = process.env.ARTIFACT_DIR ?? "docs";
mkdirSync(artifacts, { recursive: true });

test("semantic groups, ancestor filters, source links and standalone Mining remain reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("./?cat=General&group=General%2FAchievements");
  const achievements = page.getByTitle("General/Achievements", { exact: true });
  await expect(achievements).toHaveAttribute("aria-current", "true");
  const theme = page.getByTitle(
    "General/Achievements/Exploration & milestones",
    { exact: true },
  );
  await expect(theme).toBeVisible();
  await expect(
    page.getByTitle("General/Achievements/Admiral", { exact: true }),
  ).toHaveCount(0);
  await theme.click();
  await expect(page.getByTestId("icon-tile").first()).toBeVisible();
  await expect(theme).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(/group=General%2FAchievements%2FExploration/);
  await page.reload();
  await expect(theme).toHaveAttribute("aria-current", "true");
  await page.getByRole("searchbox").fill("admiral");
  await expect(page.getByTestId("result-count")).not.toContainText(/^0 /);
  await page.getByRole("searchbox").fill("");
  await expect
    .poll(async () =>
      Number(
        (await page.getByTestId("result-count").innerText()).replace(
          /[^0-9]/g,
          "",
        ),
      ),
    )
    .toBeGreaterThan(1);
  await page
    .getByRole("button", { name: "Collapse Classes", exact: true })
    .click();
  const splitter = page.getByRole("separator", {
    name: "Resize category sidebar",
  });
  await splitter.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", "320");
  await theme.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${artifacts}/semantic-sidebar.png`,
    animations: "disabled",
  });

  await page.goto("./?cat=General&group=General%2FAchievements%2FAdmiral");
  await expect(page.getByTestId("result-count")).toHaveText("1 icon");
  await page.getByTestId("icon-tile").first().click();
  await expect(
    page.getByText("Original folder", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "General Achievements / Admiral",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close detail", exact: true }).click();
  await page.getByTitle("Professions", { exact: true }).click();
  await page.getByTitle("Professions/Mining", { exact: true }).click();
  await expect(
    page.getByTitle("Professions/Mining", { exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("icon-tile").first()).toBeVisible();
  await expect(page).toHaveURL(/group=Professions%2FMining/);
});

test("sidebar width persists after pointer drag and supports keyboard limits and reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("./");
  const splitter = page.getByRole("separator", {
    name: "Resize category sidebar",
  });
  await expect(splitter).toHaveAttribute("aria-valuenow", "240");
  await splitter.focus();
  await page.keyboard.press("ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", "250");
  const box = (await splitter.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 110, box.y + 100, { steps: 8 });
  await page.mouse.up();
  await expect(splitter).toHaveAttribute("aria-valuenow", "360");
  await page.reload();
  await expect(splitter).toHaveAttribute("aria-valuenow", "360");
  expect(
    Math.round(
      (await page
        .getByRole("complementary", { name: "Category sidebar" })
        .boundingBox())!.width,
    ),
  ).toBe(360);
  await splitter.focus();
  await page.keyboard.press("End");
  expect(await splitter.getAttribute("aria-valuenow")).toBe(
    await splitter.getAttribute("aria-valuemax"),
  );
  await page.setViewportSize({ width: 1001, height: 900 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1001);
  await splitter.focus();
  await page.keyboard.press("Home");
  await expect(splitter).toHaveAttribute("aria-valuenow", "200");
  await splitter.dblclick({ position: { x: 4, y: 90 } });
  await expect(splitter).toHaveAttribute("aria-valuenow", "240");
});

test("mobile drawer exposes the same nested categories without a resize handle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Open categories", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "categories", exact: true });
  await drawer
    .getByRole("button", { name: "Collapse Classes", exact: true })
    .click();
  await drawer
    .getByRole("button", { name: "Expand General", exact: true })
    .click();
  await drawer
    .getByRole("button", { name: "Expand General / Achievements", exact: true })
    .click();
  await expect(
    drawer.getByTitle("General/Achievements/Exploration & milestones", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: `${artifacts}/mobile-categories.png`,
    animations: "disabled",
  });
  await drawer
    .getByTitle("General/Achievements/Exploration & milestones", {
      exact: true,
    })
    .click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("separator")).not.toBeVisible();
  await expect(page.getByTestId("icon-tile").first()).toBeVisible();
});

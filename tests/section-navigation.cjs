const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { chromium } = require("playwright");
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const entries = [
  "search-section",
  "pokemon-card",
  "species-heading",
  "notes-heading",
  "matchup-heading",
  "evolution-heading",
  "team-heading",
  "comparison-heading",
  "attack-heading",
  "collection-heading",
  "backup-heading",
];
const focusId = (id) => (id === "search-section" ? "pokemon-search" : id);
async function ready(page) {
  await page.waitForFunction(
    () =>
      document.querySelector("#pokemon-name").textContent === "bulbasaur" &&
      !document.querySelector("#section-dock").hidden,
  );
}
async function routeOffline(context, outbound = []) {
  await context.route("**/*", (route) => {
    if (route.request().url() === baseURL + "/preview-offline.html")
      return route.continue();
    outbound.push(route.request().url());
    return route.abort();
  });
}
async function open(page) {
  await page.locator("#section-menu-open").click();
  await page.waitForFunction(
    () => document.querySelector("#section-menu").open,
  );
}
async function go(page, id) {
  await open(page);
  await page.locator(`[data-section-id="${id}"]`).click();
  await page.waitForFunction(
    (id) =>
      !document.querySelector("#section-menu").open &&
      document.activeElement.id === id,
    focusId(id),
  );
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : existsSync("/usr/bin/chromium")
        ? { executablePath: "/usr/bin/chromium" }
        : {}),
  });
  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 1100 },
    });
    const outbound = [],
      errors = [];
    await routeOffline(context, outbound);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL + "/preview-offline.html");
    await ready(page);
    const before = await page.evaluate(() =>
      Object.fromEntries(
        Object.keys(localStorage).map((key) => [
          key,
          localStorage.getItem(key),
        ]),
      ),
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator(".skip-content")
        .evaluate((element) => document.activeElement === element),
      true,
    );
    assert.ok(
      await page
        .locator(".skip-content")
        .evaluate((element) => element.getBoundingClientRect().top >= 0),
    );
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "main-content",
    );
    await page
      .locator("#team-heading")
      .evaluate((element) =>
        element.scrollIntoView({ behavior: "instant", block: "start" }),
      );
    await page.waitForFunction(
      () => document.querySelector("#section-current").textContent === "Equipe",
    );
    assert.equal(
      await page
        .locator('.header-nav a[href="#team-heading"]')
        .getAttribute("aria-current"),
      "location",
    );
    const scrollBefore = await page.evaluate(() => scrollY);
    await open(page);
    assert.equal(
      await page.locator("#section-menu-open").getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.sectionId),
      "team-heading",
    );
    assert.ok(
      Math.abs((await page.evaluate(() => scrollY)) - scrollBefore) < 3,
    );
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press(key);
        assert.equal(
          await page
            .locator("#section-menu")
            .evaluate((element) => element.contains(document.activeElement)),
          true,
        );
      }
    }
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("/");
    assert.equal(
      await page.locator("#pokemon-name").textContent(),
      "bulbasaur",
    );
    assert.notEqual(
      await page.evaluate(() => document.activeElement.id),
      "pokemon-search",
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        !document.querySelector("#section-menu").open &&
        document.activeElement.id === "section-menu-open",
    );
    assert.equal(
      await page.locator("#section-menu-open").getAttribute("aria-expanded"),
      "false",
    );
    console.log(
      "PASS visible skip link, scroll-aware section/header markers, native dialog focus containment, isolated page shortcuts and Escape focus restoration without changing page position",
    );

    for (const id of entries) {
      await go(page, id);
      await page
        .waitForFunction(
          (id) =>
            document.querySelector(
              '.section-menu-item[aria-current="location"]',
            ).dataset.sectionId === id,
          id,
          { timeout: 3000 },
        )
        .catch((error) => {
          throw new Error(`Section ${id} did not become active`, {
            cause: error,
          });
        });
      assert.ok(
        await page.locator(`#${id}`).evaluate((element) => {
          const header = document
              .querySelector(".header")
              .getBoundingClientRect(),
            target = element.getBoundingClientRect();
          return (
            target.top >= header.bottom - 2 && target.top < innerHeight - 20
          );
        }),
        id,
      );
    }
    await page.locator("#section-search").click();
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "pokemon-search",
    );
    assert.ok(
      await page
        .locator("#pokemon-search")
        .evaluate(
          (element) =>
            element.getBoundingClientRect().top >=
            document.querySelector(".header").getBoundingClientRect().bottom,
        ),
    );
    await page.locator('.header-nav a[href="#collection-heading"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("#section-current").textContent === "Coleção",
    );
    assert.equal(
      await page.evaluate(() => location.hash),
      "#collection-heading",
    );
    assert.deepEqual(
      await page.evaluate(() =>
        Object.fromEntries(
          Object.keys(localStorage).map((key) => [
            key,
            localStorage.getItem(key),
          ]),
        ),
      ),
      before,
    );
    await open(page);
    await page.locator("#section-menu-close").click();
    await page.waitForFunction(
      () => document.activeElement.id === "section-menu-open",
    );
    await open(page);
    await page.mouse.click(2, 2);
    await page.waitForFunction(
      () =>
        !document.querySelector("#section-menu").open &&
        document.activeElement.id === "section-menu-open",
    );
    console.log(
      "PASS all eleven section jumps focus visible targets below the measured sticky header; search/header anchors, close button and backdrop work while saved data stays intact",
    );

    for (const theme of ["light", "dark"]) {
      await page.locator("#theme-select").selectOption(theme);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await go(page, "team-heading");
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `${theme}: ${width}`,
        );
        assert.ok(
          await page.locator("#section-dock").evaluate((element) => {
            const r = element.getBoundingClientRect();
            return (
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.bottom <= innerHeight &&
              r.top >= 0
            );
          }),
        );
        assert.ok(
          await page
            .locator("#team-heading")
            .evaluate(
              (element) =>
                element.getBoundingClientRect().top >=
                document.querySelector(".header").getBoundingClientRect()
                  .bottom -
                  2,
            ),
        );
        await open(page);
        assert.ok(
          await page.locator("#section-menu").evaluate((element) => {
            const r = element.getBoundingClientRect();
            return (
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.bottom <= innerHeight &&
              r.top >= 0
            );
          }),
        );
        assert.equal(
          await page.locator("#section-menu-list button").count(),
          11,
        );
        assert.equal(
          await page.locator("#section-menu-scroll-hint").isVisible(),
          width <= 375,
        );
        await page.keyboard.press("Escape");
      }
      await page.screenshot({
        path: `/tmp/pokedex-section-dock-${theme}-desktop.png`,
      });
      await open(page);
      await page.screenshot({
        path: `/tmp/pokedex-section-menu-${theme}-desktop.png`,
      });
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 375, height: 900 });
      await go(page, "team-heading");
      await page.screenshot({
        path: `/tmp/pokedex-section-dock-${theme}-mobile.png`,
      });
      await open(page);
      await page.screenshot({
        path: `/tmp/pokedex-section-menu-${theme}-mobile.png`,
      });
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 375, height: 480 });
    await open(page);
    assert.equal(
      await page.locator("#section-menu-scroll-hint").isVisible(),
      true,
    );
    await page.locator(".section-menu-links").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.locator('[data-section-id="backup-heading"]').click();
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "backup-heading",
    );
    await page.setViewportSize({ width: 375, height: 900 });
    await page.evaluate(() =>
      scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      }),
    );
    assert.ok(
      await page
        .locator("footer")
        .evaluate(
          (element) =>
            element.getBoundingClientRect().bottom <=
            document.querySelector("#section-dock").getBoundingClientRect().top,
        ),
    );
    await page.locator("#favorite").click();
    await page.locator("#toast").waitFor();
    assert.ok(
      await page
        .locator("#toast")
        .evaluate(
          (element) =>
            element.getBoundingClientRect().bottom <=
            document.querySelector("#section-dock").getBoundingClientRect().top,
        ),
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(outbound, []);
    console.log(
      "PASS responsive dock/dialog, dynamic mobile header spacing, footer and toast clearance in both themes at 320–1440px with ZERO external requests",
    );

    const mobile = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
      isMobile: true,
      hasTouch: true,
      viewport: { width: 375, height: 900 },
    });
    await routeOffline(mobile);
    const touch = await mobile.newPage();
    await touch.goto(baseURL + "/preview-offline.html");
    await ready(touch);
    await touch.locator("#section-menu-open").tap();
    await touch.locator('[data-section-id="attack-heading"]').tap();
    await touch.waitForFunction(
      () =>
        !document.querySelector("#section-menu").open &&
        document.activeElement.id === "attack-heading",
    );
    await touch.locator("#section-search").tap();
    assert.equal(
      await touch.evaluate(() => document.activeElement.id),
      "pokemon-search",
    );
    const sharedContext = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await routeOffline(sharedContext);
    const shared = await sharedContext.newPage();
    await shared.goto(baseURL + "/preview-offline.html#team=v1:1,25");
    await ready(shared);
    await shared.waitForFunction(
      () => !document.querySelector("#shared-team-import").disabled,
    );
    await go(shared, "attack-heading");
    assert.equal(await shared.evaluate(() => location.hash), "#team=v1:1,25");
    assert.equal(await shared.locator(".team-member").count(), 0);
    await shared.locator("#shared-team-import").click();
    assert.equal(await shared.locator(".team-member").count(), 2);
    const blocked = await context.newPage();
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw Error("Blocked");
      };
      Storage.prototype.setItem = () => {
        throw Error("Blocked");
      };
    });
    await blocked.goto(baseURL + "/preview-offline.html");
    await ready(blocked);
    await go(blocked, "backup-heading");
    const fallback = await context.newPage();
    await fallback.addInitScript(() => {
      HTMLDialogElement.prototype.showModal = undefined;
    });
    await fallback.goto(baseURL + "/preview-offline.html");
    await fallback.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    assert.equal(await fallback.locator("#section-dock").isHidden(), true);
    await fallback.locator('.header-nav a[href="#collection-heading"]').click();
    assert.equal(
      await fallback.evaluate(() => location.hash),
      "#collection-heading",
    );
    console.log(
      "PASS touch navigation/search, preserved incoming shared-team fragment and deliberate import, blocked storage and original-header fallback without native dialogs",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const snapshot = JSON.parse(
  readFileSync(path.join(__dirname, "../.preview-data.json"), "utf8"),
);
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
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
    await context.route("**/*", (route) => {
      if (route.request().url() === baseURL + "/preview-offline.html")
        return route.continue();
      outbound.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    async function ready(target = page) {
      await target.waitForFunction(
        () =>
          document.querySelector("#pokemon-name").textContent === "bulbasaur",
      );
      await target.waitForFunction(
        () =>
          document
            .querySelector("#collection-results")
            .getAttribute("aria-busy") === "false",
      );
    }
    async function pick(id, target = page) {
      await target.locator("#pokemon-search").fill(String(id));
      await target.locator(".search-button").click();
      await target.waitForFunction(
        (name) => document.querySelector("#pokemon-name").textContent === name,
        snapshot.pokemon[id].name.replaceAll("-", " "),
      );
    }
    const historyIds = () =>
      page
        .locator("#recent-pokemon-list button")
        .evaluateAll((buttons) =>
          buttons.map((button) => Number(button.dataset.pokemonId)),
        );
    const results = () =>
      page
        .locator("#collection-list button")
        .evaluateAll((buttons) =>
          buttons.map((button) => Number(button.dataset.pokemonId)),
        );
    async function settled() {
      await page.waitForFunction(
        () =>
          document
            .querySelector("#collection-results")
            .getAttribute("aria-busy") === "false",
      );
    }
    async function expand(selector, target = page) {
      await target.locator(selector).evaluate((element) => {
        element.open = true;
      });
    }
    async function save(name, target = page) {
      await target.locator("#filter-preset-name").fill(name);
      await target.locator('#filter-preset-form button[type="submit"]').click();
    }
    await page.goto(baseURL + "/preview-offline.html");
    await ready();
    assert.deepEqual(await historyIds(), []);
    await expand(".recent-panel");
    for (const id of [25, 7, 10100, 25]) await pick(id);
    assert.deepEqual(await historyIds(), [25, 10100, 7]);
    assert.match(
      await page
        .locator('#recent-pokemon-list [data-pokemon-id="10100"]')
        .textContent(),
      /#026/,
    );
    await page.reload();
    await ready();
    await expand(".recent-panel");
    assert.deepEqual(await historyIds(), [25, 10100, 7]);
    await page.locator("#recent-enabled").uncheck();
    await pick(6);
    assert.deepEqual(await historyIds(), [25, 10100, 7]);
    await page.reload();
    await ready();
    await expand(".recent-panel");
    assert.equal(await page.locator("#recent-enabled").isChecked(), false);
    await page.locator("#recent-enabled").check();
    await page
      .locator('#recent-pokemon-list [data-pokemon-id="10100"]')
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector("#pokemon-name").textContent === "raichu alola",
    );
    assert.deepEqual(await historyIds(), [10100, 25, 7]);
    await page.locator("#recent-clear").click();
    assert.deepEqual(await historyIds(), []);
    await pick(150);
    assert.equal(await page.locator("#recent-status").textContent(), "");
    await page.locator("#recent-undo").click();
    assert.deepEqual(await historyIds(), [150, 10100, 25, 7]);
    await page.locator("#pokemon-search").fill("987654");
    await page.locator(".search-button").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").classList.contains("error"),
    );
    assert.deepEqual(await historyIds(), [150, 10100, 25, 7]);
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 25, 26, 92, 93, 94])
      await pick(id);
    assert.equal((await historyIds()).length, 12);
    assert.equal((await historyIds())[0], 94);
    console.log(
      "PASS successful-visit history, deduplication, regional species number, persisted pause, bounded storage and undo preserving later visits; failed searches and initial load do not alter it",
    );

    for (const id of [7, 134, 25]) {
      await pick(id);
      await page.locator("#favorite").click();
    }
    await page.locator("#favorites-only").click();
    await page.locator("#type-filter").selectOption("water");
    await page.locator("#generation-filter").selectOption("1");
    await expand(".advanced-filter-panel");
    await page.locator("#stat-filter").selectOption("speed");
    await page.locator("#stat-min").fill("0");
    await page.locator("#stat-max").fill("100");
    await page.locator("#sort-filter").selectOption("stat-desc");
    await page.locator('#advanced-filters button[type="submit"]').click();
    await settled();
    assert.deepEqual(await results(), [134, 7]);
    await expand(".filter-presets-panel");
    await save("Águas amigas");
    const presetId = await page.locator("#filter-preset-select").inputValue();
    await page.locator("#stat-max").fill("0");
    await save("Mesmo filtro aplicado");
    const state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("pokedex.filters.v1")),
    );
    assert.equal(state.presets[1].filters.advanced.max, 100);
    await save(" águas amigas ");
    assert.match(
      await page.locator("#filter-preset-status").textContent(),
      /Já existe/,
    );
    await save(" ");
    assert.match(
      await page.locator("#filter-preset-status").textContent(),
      /1 a 40/,
    );
    assert.equal(
      await page.locator("#filter-preset-count").textContent(),
      "2 / 8",
    );
    await page.locator("#clear-filters").click();
    await settled();
    await page.locator("#filter-preset-select").selectOption(presetId);
    await page.locator("#filter-preset-load").click();
    await settled();
    assert.equal(await page.locator("#type-filter").inputValue(), "water");
    assert.equal(await page.locator("#generation-filter").inputValue(), "1");
    assert.equal(
      await page.locator("#favorites-only").getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await page.locator("#stat-min").inputValue(), "0");
    assert.equal(await page.locator("#stat-max").inputValue(), "100");
    assert.deepEqual(await results(), [134, 7]);
    await page.locator("#category-filter").selectOption("mythical");
    await page.locator("#habitat-filter").selectOption("unknown");
    await page.locator('#advanced-filters button[type="submit"]').click();
    await settled();
    await save("Míticos sem habitat");
    const mythicalPreset = await page
      .locator("#filter-preset-select")
      .inputValue();
    await page.locator("#clear-filters").click();
    await settled();
    await page.locator("#filter-preset-select").selectOption(mythicalPreset);
    await page.locator("#filter-preset-load").click();
    await settled();
    assert.equal(
      await page.locator("#category-filter").inputValue(),
      "mythical",
    );
    assert.equal(await page.locator("#habitat-filter").inputValue(), "unknown");
    assert.deepEqual(await results(), []);
    await page.reload();
    await ready();
    await expand(".filter-presets-panel");
    assert.equal(await page.locator("#type-filter").inputValue(), "");
    await page.locator("#filter-preset-select").selectOption(presetId);
    await page.locator("#filter-preset-load").click();
    await settled();
    assert.deepEqual(await results(), [134, 7]);
    await page.locator("#filter-preset-delete").click();
    assert.equal(
      await page.locator("#filter-preset-count").textContent(),
      "2 / 8",
    );
    assert.deepEqual(await results(), [134, 7]);
    await page.locator("#filter-preset-undo").click();
    assert.equal(
      await page.locator("#filter-preset-select").inputValue(),
      presetId,
    );
    for (let i = 1; i <= 5; i++) await save(`Busca ${i}`);
    await save("Nona busca");
    assert.match(
      await page.locator("#filter-preset-status").textContent(),
      /até oito/,
    );
    assert.equal(
      await page.locator("#filter-preset-count").textContent(),
      "8 / 8",
    );
    await page.locator("#filter-preset-delete").click();
    await save("Nova busca");
    await page.locator("#filter-preset-undo").click();
    assert.match(
      await page.locator("#filter-preset-status").textContent(),
      /Libere uma vaga/,
    );
    console.log(
      "PASS named applied-filter snapshots, favorites/type/generation/zero-range/sort recall, draft exclusion, persisted combinations, duplicate/blank names, deletion/undo and eight-search limit",
    );

    await expand(".recent-panel");
    for (const theme of ["light", "dark"]) {
      await page.locator("#theme-select").selectOption(theme);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `${theme}: ${width}`,
        );
        assert.equal(
          await page.locator("#filter-preset-load").isVisible(),
          true,
        );
      }
      await page
        .locator(".recent-panel")
        .screenshot({ path: `/tmp/pokedex-recent-${theme}-desktop.png` });
      await page
        .locator(".filter-presets-panel")
        .screenshot({ path: `/tmp/pokedex-presets-${theme}-desktop.png` });
      await page.setViewportSize({ width: 375, height: 1100 });
      await page
        .locator(".recent-panel")
        .screenshot({ path: `/tmp/pokedex-recent-${theme}-mobile.png` });
      await page
        .locator(".filter-presets-panel")
        .screenshot({ path: `/tmp/pokedex-presets-${theme}-mobile.png` });
    }
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS responsive history and saved-search controls in both themes at 320–1440px with ZERO external requests",
    );

    const broken = await context.newPage();
    await broken.addInitScript(() => {
      localStorage.setItem("pokedex.recent.v1", "{");
      localStorage.setItem(
        "pokedex.filters.v1",
        JSON.stringify({
          version: 1,
          presets: [{ id: "broken", name: "Invalid", filters: {} }],
        }),
      );
    });
    await broken.goto(baseURL + "/preview-offline.html");
    await ready(broken);
    await expand(".recent-panel", broken);
    await expand(".filter-presets-panel", broken);
    assert.equal(await broken.locator("#recent-notice").isVisible(), true);
    assert.equal(
      await broken.locator("#filter-preset-notice").isVisible(),
      true,
    );
    await pick(25, broken);
    await save("Recuperada", broken);
    assert.equal(
      await broken.locator("#recent-pokemon-list button").count(),
      1,
    );
    assert.equal(
      await broken.locator("#filter-preset-count").textContent(),
      "1 / 8",
    );
    await broken.close();
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
    await expand(".recent-panel", blocked);
    await expand(".filter-presets-panel", blocked);
    await pick(7, blocked);
    await save("Nesta sessão", blocked);
    assert.equal(
      await blocked.locator("#recent-pokemon-list button").count(),
      1,
    );
    await blocked.locator("#filter-preset-load").click();
    assert.match(
      await blocked.locator("#recent-notice").textContent(),
      /nesta sessão/,
    );
    assert.match(
      await blocked.locator("#filter-preset-notice").textContent(),
      /nesta sessão/,
    );
    await blocked.locator("#recent-clear").click();
    await blocked.locator("#recent-undo").click();
    assert.equal(
      await blocked.locator("#recent-pokemon-list button").count(),
      1,
    );
    console.log(
      "PASS corrupted storage recovery and usable history, saved searches and undo when browser storage is blocked",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

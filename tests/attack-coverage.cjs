const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const snapshot = JSON.parse(
  readFileSync(path.join(__dirname, "../.preview-data.json"), "utf8"),
);
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const ready = (page) =>
  page.waitForFunction(
    () =>
      !document.querySelector("#attack-coverage-results").hidden &&
      document.querySelector("#attack-coverage").getAttribute("aria-busy") ===
        "false",
  );
async function pick(page, id) {
  await page.locator("#pokemon-search").fill(String(id));
  await page.locator(".search-button").click();
  await page.waitForFunction(
    (name) => document.querySelector("#pokemon-name").textContent === name,
    snapshot.pokemon[id].name.replaceAll("-", " "),
  );
}
async function setTypes(page, choices) {
  if (!(await page.locator("#attack-clear").isDisabled()))
    await page.locator("#attack-clear").click();
  for (let i = 0; i < choices.length; i++)
    await page.locator(`#attack-type-${i + 1}`).selectOption(choices[i]);
  await ready(page);
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
    const errors = [],
      outbound = [];
    await context.route("**/*", (route) => {
      if (route.request().url() === baseURL + "/preview-offline.html")
        return route.continue();
      outbound.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL + "/preview-offline.html");
    await page.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    assert.equal(
      await page.locator("#attack-coverage-results").isHidden(),
      true,
    );
    assert.equal(await page.locator("#attack-clear").isDisabled(), true);
    await pick(page, 6);
    await setTypes(page, ["rock", "grass", "ground", "water"]);
    assert.equal(
      await page.locator("#attack-coverage-table tbody tr").count(),
      18,
    );
    assert.equal(
      await page.locator("#attack-coverage-table thead th").count(),
      6,
    );
    assert.equal(
      await page
        .locator('#attack-type-2 option[value="rock"]')
        .evaluate((option) => option.disabled),
      true,
    );
    const target = page.locator("#attack-target-options");
    assert.equal(
      await target
        .locator('[data-type="rock"]')
        .getAttribute("data-multiplier"),
      "4",
    );
    assert.equal(
      await target
        .locator('[data-type="grass"]')
        .getAttribute("data-multiplier"),
      "0.25",
    );
    assert.equal(
      await target
        .locator('[data-type="ground"]')
        .getAttribute("data-multiplier"),
      "0",
    );
    assert.match(
      await page.locator("#attack-target-best").textContent(),
      /Pedra · ×4/,
    );
    assert.equal(
      await page
        .locator(".attack-counts dd")
        .evaluateAll((cells) =>
          cells.reduce((total, cell) => total + Number(cell.textContent), 0),
        ),
      18,
    );
    await page.locator(".attack-table-details summary").click();
    await setTypes(page, ["fire", "ice"]);
    assert.equal(
      await page
        .locator('#attack-coverage-table tr[data-type="grass"] .attack-best')
        .getAttribute("data-best"),
      "2",
    );
    assert.match(
      await page
        .locator('#attack-coverage-table tr[data-type="grass"] .attack-best')
        .textContent(),
      /Fogo \/ Gelo/,
    );
    await pick(page, 260);
    await setTypes(page, ["electric", "grass"]);
    assert.equal(
      await target
        .locator('[data-type="electric"]')
        .getAttribute("data-multiplier"),
      "0",
    );
    assert.equal(
      await target
        .locator('[data-type="grass"]')
        .getAttribute("data-multiplier"),
      "4",
    );
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("pokedex.attack-coverage.v1")),
    );
    assert.deepEqual(saved.types, ["electric", "grass"]);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    await ready(page);
    assert.equal(await page.locator("#attack-type-1").inputValue(), "electric");
    assert.equal(await page.locator("#attack-type-2").inputValue(), "grass");
    assert.equal(
      await page.locator("#attack-target-name").textContent(),
      "bulbasaur",
    );
    await pick(page, 10034);
    await ready(page);
    await page.locator("#attack-use-current").click();
    await ready(page);
    assert.equal(await page.locator("#attack-type-1").inputValue(), "fire");
    assert.equal(await page.locator("#attack-type-2").inputValue(), "dragon");
    assert.equal(
      await page.locator("#attack-target-name").textContent(),
      "charizard mega x",
    );
    await pick(page, 92);
    await setTypes(page, ["normal", "fighting"]);
    assert.match(
      await page.locator("#attack-target-best").textContent(),
      /bloqueados por imunidade/,
    );
    assert.equal(
      await page
        .locator('#attack-coverage-table tr[data-type="ghost"] .attack-best')
        .getAttribute("data-best"),
      "0",
    );
    await page.locator("#attack-type-3").selectOption("dark");
    await ready(page);
    assert.match(
      await page.locator("#attack-target-best").textContent(),
      /Sombrio · ×2/,
    );
    assert.equal(await page.locator("#favorite-count").textContent(), "0");
    assert.equal(
      await page.locator("#team-count").textContent(),
      "0 / 6 integrantes",
    );
    assert.equal(await page.locator("#progress-seen-count").textContent(), "0");
    console.log(
      "PASS four unique attack choices, 18-type counts/table, strongest-hit ties, dual-type ×4/×0.25, immunities, alternate-form target, use-current shortcut and saved choices without changing favorites/team/progress",
    );

    await page.evaluate(() => {
      globalThis.savedCoverageIce =
        globalThis.__POKEDEX_OFFLINE_PREVIEW__.resources["type/ice"];
      delete globalThis.__POKEDEX_OFFLINE_PREVIEW__.resources["type/ice"];
    });
    await page.locator("#attack-clear").click();
    await page.locator("#attack-type-1").selectOption("fire");
    await page.locator("#attack-coverage-retry").waitFor();
    assert.equal(
      await page.locator("#attack-coverage-results").isHidden(),
      true,
    );
    assert.equal(await page.locator("#attack-type-1").inputValue(), "fire");
    await page.evaluate(() => {
      globalThis.__POKEDEX_OFFLINE_PREVIEW__.resources["type/ice"] =
        globalThis.savedCoverageIce;
    });
    await page.locator("#attack-coverage-retry").click();
    await ready(page);
    await page.evaluate(() => {
      const slot = document.querySelector("#attack-type-1");
      slot.value = "water";
      slot.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("#attack-clear").click();
    });
    assert.equal(
      await page.locator("#attack-coverage-results").isHidden(),
      true,
    );
    assert.equal(
      await page.locator("#attack-coverage").getAttribute("aria-busy"),
      "false",
    );
    await setTypes(page, ["rock", "grass", "ground", "water"]);
    await pick(page, 6);
    await ready(page);
    await page.locator(".attack-table-details").evaluate((element) => {
      element.open = true;
    });
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
        assert.equal(await page.locator("#attack-type-4").isVisible(), true);
      }
      await page.locator("#attack-coverage").screenshot({
        path: `/tmp/pokedex-attack-coverage-${theme}-desktop.png`,
      });
      await page.setViewportSize({ width: 375, height: 1100 });
      await page.locator(".attack-table-scroll").focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        () => document.querySelector(".attack-table-scroll").scrollLeft > 0,
      );
      assert.equal(
        await page.locator("#pokemon-name").textContent(),
        "charizard",
      );
      await page.locator("#attack-coverage").screenshot({
        path: `/tmp/pokedex-attack-coverage-${theme}-mobile.png`,
      });
      assert.equal(
        await page.locator(".attack-table-scroll").evaluate((element) => {
          if (element.scrollWidth <= element.clientWidth) return false;
          element.scrollLeft = element.scrollWidth;
          return (
            Math.abs(
              element.querySelector("tbody th").getBoundingClientRect().left -
                element.getBoundingClientRect().left,
            ) < 3
          );
        }),
        true,
      );
      await page.locator(".attack-table-scroll").evaluate((element) => {
        element.scrollLeft = 0;
      });
    }
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS missing type failure/retry, immediate cancellation on clear, both themes, responsive controls and pinned table labels at 320–1440px with ZERO external requests",
    );

    const malformed = await context.newPage();
    await malformed.addInitScript(() =>
      localStorage.setItem(
        "pokedex.attack-coverage.v1",
        JSON.stringify({ version: 1, types: ["fire", "fire"] }),
      ),
    );
    await malformed.goto(baseURL + "/preview-offline.html");
    await malformed.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    assert.equal(
      await malformed.locator("#attack-coverage-notice").isVisible(),
      true,
    );
    assert.equal(
      await malformed.locator("#attack-coverage-results").isHidden(),
      true,
    );
    await malformed.locator("#attack-use-current").click();
    await ready(malformed);
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
    await blocked.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    await blocked.locator("#attack-use-current").click();
    await ready(blocked);
    assert.match(
      await blocked.locator("#attack-coverage-notice").textContent(),
      /nesta sessão/,
    );
    console.log(
      "PASS invalid saved-choice recovery and usable coverage with browser storage blocked",
    );

    const online = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    let started,
      release,
      hold = true;
    const gated = new Promise((resolve) => {
      started = resolve;
    });
    await online.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL) return route.continue();
      if (url.hostname !== "pokeapi.co") return route.abort();
      const key = url.pathname.replace("/api/v2/", "") + url.search;
      const q = key.startsWith("pokemon/") ? key.slice(8) : null;
      const data = q
        ? snapshot.pokemon[Number(q) || snapshot.names[q]]
        : snapshot.resources[key];
      if (key === "type/fairy" && hold) {
        hold = false;
        started();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return route
        .fulfill({
          status: data ? 200 : 404,
          contentType: "application/json",
          body: JSON.stringify(data || {}),
        })
        .catch(() => {});
    });
    const networkPage = await online.newPage();
    await networkPage.goto(baseURL + "/index.html");
    await networkPage.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    await networkPage.clock.install();
    await networkPage.locator("#attack-type-1").selectOption("fire");
    await gated;
    await networkPage.clock.fastForward(12001);
    await networkPage.locator("#attack-coverage-retry").waitFor();
    assert.equal(
      await networkPage.locator("#attack-coverage-results").isHidden(),
      true,
    );
    assert.equal(
      await networkPage.locator("#attack-type-1").inputValue(),
      "fire",
    );
    release();
    await networkPage.clock.resume();
    await networkPage.locator("#attack-coverage-retry").click();
    await ready(networkPage);
    assert.match(
      await networkPage.locator("#attack-target-best").textContent(),
      /Fogo · ×2/,
    );
    console.log(
      "PASS real timed-out type request hides incomplete results, preserves choices and recovers on retry",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

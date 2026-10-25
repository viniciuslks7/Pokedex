const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { chromium } = require("playwright");
const snapshot = JSON.parse(
  readFileSync(
    require("node:path").join(__dirname, "../.preview-data.json"),
    "utf8",
  ),
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
    const ready = () =>
      page.waitForFunction(
        () => !document.querySelector("#team-suggest").disabled,
      );
    const pick = async (id) => {
      await page.locator("#pokemon-search").fill(String(id));
      await page.locator(".search-button").click();
      await page.waitForFunction(
        (name) => document.querySelector("#pokemon-name").textContent === name,
        snapshot.pokemon[id].name.replaceAll("-", " "),
      );
    };
    const suggest = async () => {
      await page.locator("#team-suggest").click();
      await page.waitForFunction(
        () => document.querySelectorAll("#team-suggestions li").length > 0,
      );
    };
    await page.goto(baseURL + "/preview-offline.html");
    await page.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    assert.equal(await page.locator("#team-suggest").isDisabled(), true);
    for (const id of [6, 260]) {
      await pick(id);
      await page.locator("#team-add").click();
      await ready();
    }
    await page.locator("#team-defense summary").click();
    assert.equal(
      await page.locator("#team-defense-table tbody tr").count(),
      18,
    );
    assert.equal(
      await page
        .locator('#team-defense-table tr[data-type="rock"] td')
        .nth(0)
        .textContent(),
      "×4",
    );
    assert.equal(
      await page
        .locator('#team-defense-table tr[data-type="grass"] td')
        .nth(0)
        .textContent(),
      "×0,25",
    );
    assert.equal(
      await page
        .locator('#team-defense-table tr[data-type="electric"] td')
        .nth(1)
        .textContent(),
      "×0",
    );
    const before = await page.evaluate(() =>
      localStorage.getItem("pokedex.team.v1"),
    );
    await suggest();
    assert.equal(await page.locator("#team-suggestions li").count(), 3);
    assert.match(
      await page.locator("#team-suggestions").textContent(),
      /Recebe menos dano/,
    );
    const suggested = Number(
      await page
        .locator("#team-suggestions li")
        .first()
        .getAttribute("data-pokemon-id"),
    );
    assert.ok(![6, 260].includes(suggested));
    await page.locator("#team-suggestions .advisor-open").first().click();
    await page.waitForFunction(
      (name) => document.querySelector("#pokemon-name").textContent === name,
      snapshot.pokemon[suggested].name.replaceAll("-", " "),
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pokedex.team.v1")),
      before,
    );
    await page.locator("#team-add").click();
    await ready();
    assert.equal(await page.locator(".team-member").count(), 3);
    assert.equal(await page.locator("#team-suggestions li").count(), 0);
    console.log(
      "PASS real 18-type defensive matrix, dual-type multipliers, explained suggestions and deliberate addition without changing the team on view",
    );

    await page.evaluate(() => {
      globalThis.savedAdvisorIce =
        globalThis.__POKEDEX_OFFLINE_PREVIEW__.resources["type/ice"];
      delete globalThis.__POKEDEX_OFFLINE_PREVIEW__.resources["type/ice"];
    });
    const preserved = await page.evaluate(() =>
      localStorage.getItem("pokedex.team.v1"),
    );
    await page.locator("#team-suggest").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#team-advisor-status")
        .textContent.includes("Não foi possível"),
    );
    assert.equal(await page.locator("#team-suggestions li").count(), 0);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pokedex.team.v1")),
      preserved,
    );
    await page.evaluate(() => {
      globalThis.__POKEDEX_OFFLINE_PREVIEW__.resources["type/ice"] =
        globalThis.savedAdvisorIce;
    });
    await suggest();
    await page.evaluate(() => {
      document.querySelector("#team-suggest").click();
      document.querySelector("#team-list .trainer-remove").click();
    });
    await ready();
    assert.equal(await page.locator("#team-suggestions li").count(), 0);
    assert.equal(await page.locator("#team-defense-table thead th").count(), 3);
    await suggest();
    console.log(
      "PASS missing type failure/retry preserves the team and a team change cancels outdated suggestions and matrix columns",
    );

    for (const id of [1, 2, 3, 4, 7, 25, 150]) {
      const savedIds = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("pokedex.team.v1")).map(
          (member) => member.id,
        ),
      );
      if (savedIds.length === 6) break;
      if (savedIds.includes(id)) continue;
      await pick(id);
      await page.locator("#team-add").click();
      await ready();
    }
    assert.equal(await page.locator(".team-member").count(), 6);
    await suggest();
    assert.match(
      await page.locator("#team-advisor-status").textContent(),
      /Equipe completa/,
    );
    const fullTeam = await page.evaluate(() =>
      localStorage.getItem("pokedex.team.v1"),
    );
    await page.locator("#team-suggestions .advisor-open").first().click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pokedex.team.v1")),
      fullTeam,
    );
    await page.locator("#team-suggestions .advisor-details").first().click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pokedex.team.v1")),
      fullTeam,
    );
    for (const theme of ["light", "dark"]) {
      await page.locator("#theme-select").selectOption(theme);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `${theme} at ${width}`,
        );
        assert.equal(
          await page.locator("#team-defense-table tbody tr").count(),
          18,
        );
        assert.equal(
          await page
            .locator("#team-suggestions .advisor-open")
            .first()
            .isVisible(),
          true,
        );
      }
    }
    await page
      .locator(".team-advisor")
      .screenshot({ path: "/tmp/pokedex-advisor-desktop.png" });
    await page.setViewportSize({ width: 375, height: 1100 });
    assert.ok(
      await page.locator(".team-defense-scroll").evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        const heading = element.querySelector("tbody th");
        return (
          Math.abs(
            heading.getBoundingClientRect().left -
              element.getBoundingClientRect().left,
          ) < 3
        );
      }),
    );
    await page.locator(".team-defense-scroll").evaluate((element) => {
      element.scrollLeft = 0;
    });
    await page
      .locator(".team-advisor")
      .screenshot({ path: "/tmp/pokedex-advisor-mobile.png" });
    await page
      .locator("#team-defense")
      .screenshot({ path: "/tmp/pokedex-defense-mobile.png" });
    await page.reload();
    await ready();
    assert.equal(await page.locator(".team-member").count(), 6);
    assert.equal(await page.locator("#team-suggestions li").count(), 0);
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS six-member limit, persisted team, both themes and responsive table scrolling at 320–1440px with ZERO external requests",
    );

    const partial = await context.newPage();
    await partial.addInitScript(() =>
      localStorage.setItem(
        "pokedex.team.v1",
        JSON.stringify([
          { id: 6, name: "charizard" },
          { id: 999999, name: "unknown" },
        ]),
      ),
    );
    await partial.goto(baseURL + "/preview-offline.html");
    await partial.waitForFunction(
      () => !document.querySelector("#team-analysis").hidden,
    );
    assert.equal(await partial.locator("#team-suggest").isDisabled(), true);
    assert.match(
      await partial.locator("#team-defense-table caption").textContent(),
      /1 de 2/,
    );
    assert.equal(await partial.locator(".team-member").count(), 2);
    console.log(
      "PASS incomplete teams retain every saved member, label partial defenses and do not invent recommendations",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

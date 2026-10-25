const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const snapshot = JSON.parse(
  readFileSync(path.join(root, ".preview-data.json"), "utf8"),
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
      if (
        route
          .request()
          .url()
          .startsWith(baseURL + "/preview-offline.html")
      )
        return route.continue();
      outbound.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const nameIs = (id) =>
      page.waitForFunction(
        (name) => document.querySelector("#pokemon-name").textContent === name,
        snapshot.pokemon[id].name.replaceAll("-", " "),
      );
    const search = async (id) => {
      await page.locator("#pokemon-search").fill(String(id));
      await page.locator(".search-button").click();
      await nameIs(id);
    };
    const teamReady = () =>
      page.waitForFunction(
        () => !document.querySelector("#team-analysis").hidden,
      );
    await page.goto(baseURL + "/preview-offline.html");
    await nameIs(1);
    await page.waitForFunction(
      () => !document.querySelector("#species-content").hidden,
    );
    assert.equal(
      await page.locator("#species-capture").textContent(),
      "45 / 255",
    );
    assert.match(
      await page.locator("#species-generation").textContent(),
      /1ª geração/,
    );
    assert.ok(
      (await page.locator("#species-description").textContent()).length > 30,
    );
    if (
      (await page.locator("#species-description").getAttribute("lang")) === "en"
    )
      assert.match(
        await page.locator("#species-language").textContent(),
        /inglês/,
      );
    await page.locator("#favorite").click();
    await page.locator("#team-add").click();
    await teamReady();
    assert.equal(await page.locator(".team-member").count(), 1);
    await page.locator("#team-add").click();
    assert.equal(await page.locator(".team-member").count(), 0);
    for (const id of [1, 2, 3, 4, 5, 6]) {
      await search(id);
      await page.locator("#team-add").click();
      await teamReady();
    }
    assert.equal(await page.locator(".team-member").count(), 6);
    assert.match(
      await page.locator('#team-weaknesses [data-type="fire"]').textContent(),
      /3 vulneráveis · 3 resistentes/,
    );
    await search(25);
    await page.locator("#team-add").click();
    assert.equal(await page.locator(".team-member").count(), 6);
    assert.match(
      await page.locator("#toast").textContent(),
      /seis integrantes/,
    );
    await page.reload();
    await nameIs(1);
    await teamReady();
    assert.equal(await page.locator(".team-member").count(), 6);
    assert.equal(
      await page.locator("#favorite").getAttribute("aria-pressed"),
      "true",
    );
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("pokedex.team.v1")),
    );
    assert.equal(stored.length, 6);
    assert.deepEqual(Object.keys(stored[0]).sort(), ["id", "name"]);
    console.log(
      "PASS team add/remove, six-member limit, shared weaknesses, persistence and independent favorites",
    );

    await page.locator("#compare-add").click();
    await search(25);
    await page.locator("#compare-add").click();
    assert.equal(await page.locator("#comparison-results").isVisible(), true);
    assert.equal(await page.locator("#comparison-table tbody tr").count(), 7);
    const hp = page.locator('#comparison-table [data-stat="hp"] td');
    assert.ok((await hp.nth(0).textContent()).startsWith("45"));
    assert.ok((await hp.nth(1).textContent()).startsWith("35"));
    assert.equal(await hp.nth(0).getAttribute("class"), "stat-better");
    const attack = page.locator('#comparison-table [data-stat="attack"] td');
    assert.equal(await attack.nth(1).getAttribute("class"), "stat-better");
    await search(4);
    await page.locator("#compare-add").click();
    assert.equal(
      await page.locator("#comparison-slots .trainer-card").count(),
      2,
    );
    assert.match(await page.locator("#toast").textContent(), /dois Pokémon/);
    await page
      .getByRole("button", {
        name: "Remover bulbasaur da comparação",
        exact: true,
      })
      .click();
    assert.equal(await page.locator("#comparison-results").isHidden(), true);
    await page.locator("#compare-add").click();
    assert.equal(await page.locator("#comparison-results").isVisible(), true);
    await page.locator("#compare-clear").click();
    assert.equal(
      await page.locator("#comparison-slots .comparison-empty").count(),
      2,
    );
    assert.equal(await page.locator(".team-member").count(), 6);
    await page
      .getByRole("button", { name: "Remover bulbasaur da equipe", exact: true })
      .click();
    await search(25);
    await page.locator("#team-add").click();
    await teamReady();
    assert.equal(await page.locator(".team-member").count(), 6);
    await search(150);
    await page.waitForFunction(
      () => !document.querySelector("#species-content").hidden,
    );
    assert.match(await page.locator("#species-tags").textContent(), /Lendário/);
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `overflow at ${width}px`,
      );
    }
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS two-slot comparison, accurate values/highlights, remove/clear, species facts and mobile layout without Internet",
    );

    await page.evaluate(() =>
      localStorage.setItem("pokedex.team.v1", "broken json"),
    );
    await page.reload();
    await nameIs(1);
    assert.equal(await page.locator("#team-storage-notice").isVisible(), true);
    assert.equal(await page.locator(".team-member").count(), 0);
    await page.locator("#team-add").click();
    await teamReady();
    assert.equal(await page.locator("#team-storage-notice").isHidden(), true);
    await page.evaluate(() =>
      localStorage.setItem(
        "pokedex.team.v1",
        JSON.stringify([{ id: 999999, name: "outside-collection" }]),
      ),
    );
    await page.reload();
    await nameIs(1);
    await page.waitForFunction(() =>
      document
        .querySelector("#team-status")
        .textContent.includes("não estão nesta coleção offline"),
    );
    assert.equal(await page.locator(".team-member").count(), 1);
    await context.close();
    console.log(
      "PASS malformed storage recovery and saved members unavailable in the offline collection",
    );

    const restricted = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await restricted.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw Error("Storage blocked");
      };
      Storage.prototype.setItem = () => {
        throw Error("Storage blocked");
      };
    });
    let speciesFailures = 2;
    await restricted.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL) return route.continue();
      if (url.hostname === "pokeapi.co") {
        const key = url.pathname.replace("/api/v2/", "") + url.search;
        if (key === "pokemon-species/1" && speciesFailures-- > 0)
          return route.abort();
        const data = key.startsWith("pokemon/")
          ? snapshot.pokemon[key.split("/")[1]]
          : snapshot.resources[key];
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      }
      return route.abort();
    });
    const privatePage = await restricted.newPage();
    privatePage.on("pageerror", (error) => errors.push(error.message));
    await privatePage.goto(baseURL);
    await privatePage.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    await privatePage.waitForFunction(
      () => document.querySelector("#species-retry").hidden === false,
    );
    assert.equal(
      await privatePage.locator("#pokemon-name").textContent(),
      "bulbasaur",
    );
    await privatePage.locator("#species-retry").click();
    await privatePage.waitForFunction(
      () => !document.querySelector("#species-content").hidden,
    );
    await privatePage.locator("#team-add").click();
    await privatePage.waitForFunction(
      () => !document.querySelector("#team-analysis").hidden,
    );
    assert.equal(await privatePage.locator(".team-member").count(), 1);
    assert.match(
      await privatePage.locator("#team-storage-notice").textContent(),
      /navegador não permitiu/,
    );
    assert.deepEqual(errors, []);
    await restricted.close();
    console.log(
      "PASS blocked storage preserves session team; species failure retries independently of the Pokémon details",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Exercise real cached varieties, autocomplete accessibility, and independent failures.
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
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
  const errors = [];
  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 1100 },
    });
    const external = [];
    await context.route("**/*", (route) => {
      if (route.request().url() === baseURL + "/preview-offline.html")
        return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const nameIs = (target, id) =>
      target.waitForFunction(
        (name) => document.querySelector("#pokemon-name").textContent === name,
        snapshot.pokemon[id].name.replaceAll("-", " "),
      );
    const search = async (target, id) => {
      await target.locator("#pokemon-search").fill(String(id));
      await target.locator(".search-button").click();
      await nameIs(target, id);
      await target.waitForFunction(
        () => !document.querySelector("#team-add").disabled,
      );
    };
    const formsReady = (target) =>
      target.waitForFunction(
        () =>
          !document.querySelector("#form-select").hidden &&
          !document.querySelector("#form-select").disabled,
      );
    await page.goto(baseURL + "/preview-offline.html");
    await nameIs(page, 1);
    const input = page.locator("#pokemon-search");
    await input.fill("PÍKA");
    await page.locator('#suggestions-list [role="option"]').first().waitFor();
    assert.equal(await input.getAttribute("aria-expanded"), "true");
    assert.match(
      await page
        .locator('#suggestions-list [role="option"]')
        .first()
        .textContent(),
      /pikachu/,
    );
    await input.press("ArrowDown");
    assert.equal(
      await input.getAttribute("aria-activedescendant"),
      "suggestion-0",
    );
    assert.equal(
      await page.locator("#suggestion-0").getAttribute("aria-selected"),
      "true",
    );
    await input.press("Enter");
    await nameIs(page, 25);
    assert.equal(await page.locator("#search-suggestions").isHidden(), true);
    await input.fill("00026");
    await page.locator('#suggestions-list [role="option"]').first().waitFor();
    assert.equal(
      await page.locator('#suggestions-list [role="option"]').count(),
      1,
    );
    await page.locator('#suggestions-list [role="option"]').first().click();
    await nameIs(page, 26);
    await formsReady(page);
    await page.locator("#form-select").selectOption("10100");
    await nameIs(page, 10100);
    await formsReady(page);
    assert.equal(await page.locator("#pokemon-number").textContent(), "#026");
    assert.match(
      await page.locator("#pokemon-types").textContent(),
      /Psíquico/,
    );
    assert.equal(await page.locator("#form-select").inputValue(), "10100");
    await page.locator("#previous").click();
    await nameIs(page, 25);
    await search(page, 6);
    await formsReady(page);
    await page.locator("#form-select").selectOption("10034");
    await nameIs(page, 10034);
    await formsReady(page);
    assert.equal(await page.locator("#pokemon-number").textContent(), "#006");
    assert.match(await page.locator("#pokemon-types").textContent(), /Dragão/);
    assert.equal(await page.locator("#stats-total").textContent(), "TOTAL 634");
    await page.locator("#favorite").click();
    await page.locator("#team-add").click();
    await page.waitForFunction(
      () => !document.querySelector("#team-analysis").hidden,
    );
    await page.locator("#compare-add").click();
    await page.locator("#form-select").selectOption("6");
    await nameIs(page, 6);
    await page.locator("#compare-add").click();
    assert.equal(await page.locator("#comparison-results").isVisible(), true);
    assert.match(
      await page.locator('#comparison-table [data-stat="total"]').textContent(),
      /634.*534/,
    );
    await page.locator("#favorites-only").click();
    await page.locator(".collection-number").waitFor();
    assert.equal(
      await page.locator(".collection-number").textContent(),
      "#006",
    );
    await page.reload();
    await nameIs(page, 1);
    await page.waitForFunction(() =>
      document
        .querySelector("#team-list")
        .textContent.includes("charizard mega x"),
    );
    await page.locator(".team-member .trainer-open").click();
    await nameIs(page, 10034);
    await formsReady(page);
    await page.locator("#next").click();
    await nameIs(page, 7);
    console.log(
      "PASS accessible keyboard/click suggestions, real Alola/Mega forms, species numbering/navigation, comparison and saved form favorites/team",
    );

    await input.fill("not-a-real-pokemon");
    await page.waitForFunction(() =>
      document
        .querySelector("#suggestions-status")
        .textContent.includes("Nenhuma sugestão"),
    );
    assert.equal(await input.getAttribute("aria-expanded"), "false");
    await input.press("Escape");
    assert.equal(await page.locator("#search-suggestions").isHidden(), true);
    await input.fill("char");
    await page.locator('#suggestions-list [role="option"]').first().waitFor();
    await input.press("ArrowUp");
    assert.ok(await input.getAttribute("aria-activedescendant"));
    await input.press("Tab");
    assert.equal(await page.locator("#search-suggestions").isHidden(), true);
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await input.fill("charizard");
      await page.locator('#suggestions-list [role="option"]').first().waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `overflow ${width}`,
      );
      const bounds = await page.locator("#search-suggestions").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      await input.press("Escape");
    }
    // Every shipped alternative must resolve, render and use its species' forms.
    for (const pokemon of Object.values(snapshot.pokemon).filter(
      (data) => data.is_default === false,
    )) {
      await search(page, pokemon.id);
      await formsReady(page);
      assert.equal(
        await page.locator("#form-select").inputValue(),
        String(pokemon.id),
      );
      if (pokemon.sprites.front_default)
        await page.waitForFunction(
          () => !document.querySelector("#pokemon-image").hidden,
        );
    }
    assert.deepEqual(external, []);
    console.log(
      `PASS all ${snapshot.formCount} offline forms, bounded/no-result suggestions, dismissal and responsive layouts with ZERO external requests`,
    );
    await context.close();

    const touch = await browser.newContext({
      serviceWorkers: "block",
      hasTouch: true,
      isMobile: true,
      viewport: { width: 375, height: 950 },
      reducedMotion: "reduce",
    });
    await touch.route("**/*", (route) =>
      route.request().url() === baseURL + "/preview-offline.html"
        ? route.continue()
        : route.abort(),
    );
    const touchPage = await touch.newPage();
    touchPage.on("pageerror", (error) => errors.push(error.message));
    await touchPage.goto(baseURL + "/preview-offline.html");
    await nameIs(touchPage, 1);
    await touchPage.locator("#pokemon-search").fill("raichu alola");
    await touchPage.locator('#suggestions-list [role="option"]').first().tap();
    await nameIs(touchPage, 10100);
    await formsReady(touchPage);
    assert.equal(await touchPage.locator("#form-select").inputValue(), "10100");
    console.log("PASS touch selection of a regional form from the suggestions");
    await touch.close();

    let indexCalls = 0,
      releaseIndex,
      indexRequested;
    const indexStarted = new Promise((resolve) => {
      indexRequested = resolve;
    });
    let failForm = true,
      speciesFailures = 3;
    const online = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await online.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL) return route.continue();
      if (url.hostname !== "pokeapi.co") return route.abort();
      const key = url.pathname.replace("/api/v2/", "") + url.search;
      if (key === "pokemon?limit=100000") {
        indexCalls++;
        if (indexCalls === 1) return route.abort();
        if (indexCalls === 2) {
          indexRequested();
          await new Promise((resolve) => {
            releaseIndex = resolve;
          });
        }
      }
      if (key === "pokemon-species/1" && speciesFailures-- > 0)
        return route.abort();
      if (key === "pokemon/10034" && failForm) {
        failForm = false;
        return route.abort();
      }
      const query = key.startsWith("pokemon/") ? key.slice(8) : null;
      const data = query
        ? snapshot.pokemon[query] || snapshot.pokemon[snapshot.names[query]]
        : snapshot.resources[key];
      return route.fulfill({
        status: data ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(data || {}),
      });
    });
    const onlinePage = await online.newPage();
    onlinePage.on("pageerror", (error) => errors.push(error.message));
    await onlinePage.goto(baseURL);
    await nameIs(onlinePage, 1);
    await onlinePage.locator("#forms-retry").waitFor();
    await onlinePage.locator("#forms-retry").click();
    await onlinePage.waitForFunction(() =>
      document
        .querySelector("#forms-status")
        .textContent.includes("Nenhuma forma alternativa"),
    );
    assert.equal(await onlinePage.locator("#forms-retry").isHidden(), true);
    assert.equal(
      await onlinePage.locator("#pokemon-name").textContent(),
      "bulbasaur",
    );
    const onlineInput = onlinePage.locator("#pokemon-search");
    await onlineInput.fill("pika");
    await onlinePage.waitForFunction(() =>
      document
        .querySelector("#suggestions-status")
        .textContent.includes("indisponíveis"),
    );
    await onlineInput.fill("char");
    await indexStarted;
    await onlineInput.fill("rai");
    releaseIndex();
    await onlinePage.waitForFunction(() =>
      document
        .querySelector("#suggestions-list li")
        ?.textContent.includes("raichu"),
    );
    assert.ok(
      !(await onlinePage.locator("#suggestions-list").textContent()).includes(
        "charizard",
      ),
    );
    await onlineInput.fill("pikachu");
    await onlinePage.waitForFunction(() =>
      document
        .querySelector("#suggestions-list li")
        ?.textContent.includes("pikachu"),
    );
    assert.equal(
      indexCalls,
      2,
      "index should be reused after successful download",
    );
    await search(onlinePage, 6);
    await formsReady(onlinePage);
    await onlinePage.locator("#form-select").selectOption("10034");
    await onlinePage.waitForFunction(() =>
      document.querySelector("#status").classList.contains("error"),
    );
    assert.equal(
      await onlinePage.locator("#pokemon-name").textContent(),
      "charizard",
    );
    assert.equal(await onlinePage.locator("#form-select").inputValue(), "6");
    await onlinePage.locator("#form-select").selectOption("10034");
    await nameIs(onlinePage, 10034);
    await onlinePage.locator("#next").click();
    await nameIs(onlinePage, 7);
    assert.deepEqual(errors, []);
    console.log(
      "PASS index failure/retry, cached index, stale query protection, independent forms retry, failed form preservation and online species navigation",
    );
    await online.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

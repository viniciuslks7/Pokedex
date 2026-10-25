const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const snapshot = JSON.parse(
  readFileSync(path.join(root, ".preview-data.json"), "utf8"),
);
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
      acceptDownloads: true,
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
    await page.goto(baseURL + "/preview-offline.html");
    await page.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    assert.equal(await page.locator("#team-image-export").isDisabled(), true);
    const search = async (id) => {
      await page.locator("#pokemon-search").fill(String(id));
      await page.locator(".search-button").click();
      await page.waitForFunction(
        (name) => document.querySelector("#pokemon-name").textContent === name,
        snapshot.pokemon[id].name.replaceAll("-", " "),
      );
    };
    for (const id of [1, 7, 25, 10034, 149, 150]) {
      await search(id);
      await page.locator("#team-add").click();
    }
    await page.locator("#team-image-export").click();
    await page.locator("#team-image-download").waitFor();
    assert.match(
      await page.locator("#team-image-preview").getAttribute("alt"),
      /charizard mega x/,
    );
    assert.equal(
      await page
        .locator("#team-image-preview")
        .evaluate((image) => image.naturalWidth),
      1200,
    );
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#team-image-download").click();
    const download = await downloadPromise,
      bytes = readFileSync(await download.path());
    assert.equal(download.suggestedFilename(), "pokedex-minha-equipe.png");
    assert.ok(
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    );
    assert.equal(bytes.readUInt32BE(16), 1200);
    assert.equal(bytes.readUInt32BE(20), 1080);
    await download.saveAs("/tmp/pokedex-team-export.png");
    await page.locator("#team-image-title").fill("Time elétrico & amigos");
    assert.equal(await page.locator("#team-image-download").isHidden(), true);
    await page.locator("#team-image-generate").click();
    await page.locator("#team-image-download").waitFor();
    assert.match(
      await page.locator("#team-image-preview").getAttribute("alt"),
      /^Time elétrico & amigos:/,
    );
    console.log(
      "PASS real PNG download at 1200×1080 with six real portraits, alternative forms and editable title without Internet",
    );

    await page.evaluate(() => {
      const nativeFetch = window.fetch;
      window.imageGates = [];
      window.holdTeamImages = true;
      window.fetch = async (...args) => {
        if (String(args[0]).startsWith("data:image/") && window.holdTeamImages)
          await new Promise((resolve) => window.imageGates.push(resolve));
        return nativeFetch(...args);
      };
    });
    await page.locator("#team-image-generate").click();
    await page.waitForFunction(() => window.imageGates.length > 0);
    await page
      .getByRole("button", { name: "Remover pikachu da equipe", exact: true })
      .click();
    await page.evaluate(() => {
      window.holdTeamImages = false;
      window.imageGates.forEach((resolve) => resolve());
    });
    assert.equal(await page.locator("#team-image-download").isHidden(), true);
    await page.locator("#team-image-generate").click();
    await page.locator("#team-image-download").waitFor();
    assert.ok(
      !(await page.locator("#team-image-preview").getAttribute("alt")).includes(
        "pikachu",
      ),
    );
    await page.evaluate(() => {
      globalThis.__POKEDEX_OFFLINE_PREVIEW__.pokemon[1].sprites = {};
    });
    await page.locator("#team-image-generate").click();
    await page.locator("#team-image-download").waitFor();
    assert.match(
      await page.locator("#team-image-status").textContent(),
      /1 retrato indisponível/,
    );
    for (const theme of ["light", "dark"]) {
      await page.locator("#theme-select").selectOption(theme);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${theme} overflow ${width}`,
        );
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(outbound, []);
    console.log(
      "PASS a changed team cancels stale generation, missing portraits receive a symbol, and preview/download controls fit both themes and mobile widths",
    );
    await context.close();

    const unavailable = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await unavailable.addInitScript(() =>
      localStorage.setItem(
        "pokedex.team.v1",
        JSON.stringify([{ id: 999999, name: "outside-collection" }]),
      ),
    );
    await unavailable.route("**/*", (route) =>
      route.request().url() === baseURL + "/preview-offline.html"
        ? route.continue()
        : route.abort(),
    );
    const missing = await unavailable.newPage();
    await missing.goto(baseURL + "/preview-offline.html");
    await missing.locator("#team-image-export").click();
    await missing.waitForFunction(() =>
      document
        .querySelector("#team-image-status")
        .textContent.includes("Não foi possível consultar"),
    );
    assert.equal(
      await missing.locator("#team-image-download").isHidden(),
      true,
    );
    assert.equal(await missing.locator(".team-member").count(), 1);
    await unavailable.close();
    console.log(
      "PASS unavailable Pokémon do not produce fabricated team images or remove saved members",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

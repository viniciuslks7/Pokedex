const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const snapshot = JSON.parse(
  readFileSync(path.join(root, ".preview-data.json"), "utf8"),
);
const html = readFileSync(path.join(root, "preview-offline.html"), "utf8");
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const errors = [],
  external = [];
const nameIs = (page, id) =>
  page.waitForFunction(
    (name) => document.querySelector("#pokemon-name").textContent === name,
    snapshot.pokemon[id].name.replaceAll("-", " "),
  );
async function search(page, id) {
  await page.locator("#pokemon-search").fill(String(id));
  await page.locator(".search-button").click();
  await nameIs(page, id);
  await page.waitForFunction(
    () => !document.querySelector("#team-add").disabled,
  );
}
const teamIds = (page) =>
  page
    .locator(".team-member .trainer-open")
    .evaluateAll((buttons) =>
      buttons.map((button) => Number(button.dataset.pokemonId)),
    );
const saved = (page) =>
  page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("pokedex.teams.v1") || '{"version":1,"teams":[]}',
      ).teams,
  );
async function saveAs(page, name) {
  await page.locator("#new-team-name").fill(name);
  await page.locator("#saved-team-save").click();
}
async function choose(page, name) {
  const value = await page
    .locator("#saved-team-select option")
    .evaluateAll(
      (options, name) =>
        options.find((option) => option.textContent.startsWith(name + " · "))
          ?.value,
      name,
    );
  assert.ok(value, `Missing named team ${name}`);
  await page.locator("#saved-team-select").selectOption(value);
}
async function routeOffline(context) {
  await context.route("**/*", (route) => {
    if (route.request().url() === baseURL + "/preview-offline.html")
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
}
async function expectTheme(page, theme) {
  await page.waitForFunction(
    (theme) => document.documentElement.dataset.theme === theme,
    theme,
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
      colorScheme: "dark",
      viewport: { width: 1440, height: 1100 },
    });
    await context.addInitScript(() => {
      if (!localStorage.getItem("pokedex.team.v1"))
        localStorage.setItem(
          "pokedex.team.v1",
          JSON.stringify([{ id: 1, name: "bulbasaur" }]),
        );
    });
    await routeOffline(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL + "/preview-offline.html");
    await nameIs(page, 1);
    await expectTheme(page, "dark");
    assert.equal(await page.locator("#theme-select").inputValue(), "system");
    await page.emulateMedia({ colorScheme: "light" });
    await expectTheme(page, "light");
    await page.locator("#theme-select").selectOption("dark");
    await expectTheme(page, "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expectTheme(page, "dark");
    await page.reload();
    await nameIs(page, 1);
    await expectTheme(page, "dark");
    assert.equal(await page.locator("#theme-select").inputValue(), "dark");
    await page.locator("#theme-select").selectOption("light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expectTheme(page, "light");
    await page.locator("#scene-night").click();
    await expectTheme(page, "light");
    assert.equal(
      await page.locator("#scene-night").getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#theme-select").selectOption("system");
    await expectTheme(page, "dark");
    assert.equal(
      await page.locator('meta[name="theme-color"]').getAttribute("content"),
      "#101a17",
    );
    console.log(
      "PASS automatic system appearance, explicit light/dark overrides, persistence and independent landscape night mode",
    );

    assert.deepEqual(await teamIds(page), [1]);
    await page.locator(".saved-teams-panel summary").click();
    await saveAs(page, "  Kanto  ");
    assert.equal((await saved(page))[0].name, "Kanto");
    await search(page, 25);
    await page.locator("#team-add").click();
    assert.deepEqual(
      (await saved(page))[0].members.map((member) => member.id),
      [1],
    );
    await saveAs(page, "Exploradores");
    assert.equal((await saved(page)).length, 2);
    await choose(page, "Kanto");
    await page.locator("#saved-team-load").click();
    assert.deepEqual(await teamIds(page), [1]);
    await search(page, 10034);
    await page.locator("#team-add").click();
    assert.deepEqual(
      (await saved(page))[0].members.map((member) => member.id),
      [1],
    );
    assert.match(
      await page.locator("#saved-team-dirty").textContent(),
      /difere de/,
    );
    await page.locator("#saved-team-update").click();
    assert.deepEqual(
      (await saved(page))[0].members.map((member) => member.id),
      [1, 10034],
    );
    await page.locator("#saved-team-rename").fill("Kanto & amigos");
    await page.locator("#saved-team-rename-button").click();
    assert.equal((await saved(page))[0].name, "Kanto & amigos");
    await choose(page, "Exploradores");
    await page.locator("#saved-team-load").click();
    assert.deepEqual(await teamIds(page), [1, 25]);
    assert.deepEqual(
      (await saved(page))[0].members.map((member) => member.id),
      [1, 10034],
    );
    await page.locator("#saved-team-rename").fill(" kanto & AMIGOS ");
    await page.locator("#saved-team-rename-button").click();
    assert.equal((await saved(page))[1].name, "Exploradores");
    assert.equal(
      await page
        .locator("#saved-team-rename")
        .evaluate((element) => element.validity.valid),
      false,
    );
    await choose(page, "Kanto & amigos");
    assert.equal(
      await page
        .locator("#saved-team-rename")
        .evaluate((element) => element.validity.valid),
      true,
    );
    await choose(page, "Exploradores");
    await page.locator("#saved-team-rename").fill("Time elétrico");
    await page.locator("#saved-team-rename-button").click();
    await page.locator("#saved-team-delete").click();
    assert.equal((await saved(page)).length, 1);
    assert.deepEqual(await teamIds(page), [1, 25]);
    await page.locator("#saved-team-undo").click();
    assert.equal((await saved(page)).length, 2);
    await page.reload();
    await nameIs(page, 1);
    assert.deepEqual(await teamIds(page), [1, 25]);
    assert.equal((await saved(page)).length, 2);
    await page.locator(".saved-teams-panel summary").click();
    await choose(page, "Kanto & amigos");
    await page.locator("#saved-team-load").click();
    assert.deepEqual(await teamIds(page), [1, 10034]);
    await page.locator("#team-share").click();
    assert.equal(
      await page.locator("#team-share-value").inputValue(),
      "pokedex-team:v1:1,10034",
    );
    await saveAs(page, "   ");
    assert.equal((await saved(page)).length, 2);
    console.log(
      "PASS existing team retained, independent named copies, load/update/rename, duplicate/blank name validation, delete/undo, persistence and alternative-form sharing",
    );

    await page.locator("#compare-add").click();
    await search(page, 25);
    await page.locator("#compare-add").click();
    await page.locator(".advanced-filter-panel summary").click();
    await page.locator("#pokemon-search").fill("char");
    await page.locator("#suggestions-list li").first().waitFor();
    const selectors = [
      ".header",
      ".intro-kicker",
      "h1 span",
      "#pokemon-search",
      ".search-button",
      ".quick-picks button",
      ".pokemon-details",
      "#team-share",
      "#stat-min",
      "#advanced-filter-summary",
      "#saved-team-select",
      "#saved-team-dirty",
      ".evolution-condition",
      "#comparison-table td.stat-better",
      ".offline-preview-note",
    ];
    for (const selector of selectors) {
      const element = page.locator(selector).first();
      if (!(await element.count())) continue;
      const ratio = await element.evaluate((element) => {
        const parse = (color) => {
          const numbers = color.match(/[\d.]+/g).map(Number);
          return [...numbers.slice(0, 3), numbers[3] ?? 1];
        };
        let background = [16, 26, 23];
        const layers = [];
        for (let node = element; node; node = node.parentElement)
          layers.unshift(parse(getComputedStyle(node).backgroundColor));
        for (const [r, g, b, a] of layers)
          background = [r, g, b].map(
            (channel, index) => channel * a + background[index] * (1 - a),
          );
        const luminance = (color) =>
          color
            .slice(0, 3)
            .map((value) => {
              value /= 255;
              return value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4;
            })
            .reduce(
              (sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i],
              0,
            );
        const foreground = luminance(parse(getComputedStyle(element).color)),
          back = luminance(background);
        return (
          (Math.max(foreground, back) + 0.05) /
          (Math.min(foreground, back) + 0.05)
        );
      });
      assert.ok(ratio >= 4.5, `${selector} contrast ${ratio}`);
    }
    await page.locator("#pokemon-search").press("Escape");
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `overflow ${width}`,
      );
    }
    assert.deepEqual(external, []);
    console.log(
      "PASS dark surfaces, readable text/control contrast, dropdowns, table highlights and responsive widths 320–1440 without Internet",
    );
    await context.close();

    const capped = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await routeOffline(capped);
    await capped.addInitScript(() => {
      localStorage.setItem(
        "pokedex.team.v1",
        JSON.stringify([{ id: 25, name: "pikachu" }]),
      );
      localStorage.setItem(
        "pokedex.teams.v1",
        JSON.stringify({
          version: 1,
          teams: Array.from({ length: 20 }, (_, i) => ({
            id: `team-${i}`,
            name: `Equipe ${i}`,
            members: [{ id: 1, name: "bulbasaur" }],
          })),
        }),
      );
    });
    const capPage = await capped.newPage();
    capPage.on("pageerror", (error) => errors.push(error.message));
    await capPage.goto(baseURL + "/preview-offline.html");
    await nameIs(capPage, 1);
    await capPage.locator(".saved-teams-panel summary").click();
    assert.equal(await capPage.locator("#saved-team-save").isDisabled(), true);
    await choose(capPage, "Equipe 0");
    await capPage.locator("#saved-team-delete").click();
    assert.equal(await capPage.locator("#saved-team-save").isEnabled(), true);
    await capPage.locator("#saved-team-undo").click();
    assert.equal((await saved(capPage)).length, 20);
    assert.deepEqual(await teamIds(capPage), [25]);
    await capped.close();
    console.log(
      "PASS twenty-team boundary, space recovery and undo without changing the active team",
    );

    const corrupt = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await routeOffline(corrupt);
    await corrupt.addInitScript(() => {
      localStorage.setItem(
        "pokedex.team.v1",
        JSON.stringify([{ id: 1, name: "bulbasaur" }]),
      );
      localStorage.setItem("pokedex.teams.v1", "broken json");
    });
    const badPage = await corrupt.newPage();
    badPage.on("pageerror", (error) => errors.push(error.message));
    await badPage.goto(baseURL + "/preview-offline.html");
    await nameIs(badPage, 1);
    await badPage.locator(".saved-teams-panel summary").click();
    assert.equal(
      await badPage.locator("#saved-teams-notice").isVisible(),
      true,
    );
    assert.deepEqual(await teamIds(badPage), [1]);
    await saveAs(badPage, "Recuperada");
    assert.equal((await saved(badPage)).length, 1);
    assert.equal(await badPage.locator("#saved-teams-notice").isHidden(), true);
    await corrupt.close();

    const restricted = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
      colorScheme: "dark",
    });
    await restricted.route("**/*", (route) => route.abort());
    await restricted.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw Error("blocked");
      };
      Storage.prototype.setItem = () => {
        throw Error("blocked");
      };
    });
    const privatePage = await restricted.newPage();
    privatePage.on("pageerror", (error) => errors.push(error.message));
    await privatePage.goto("about:blank");
    await privatePage.setContent(html);
    await nameIs(privatePage, 1);
    await expectTheme(privatePage, "dark");
    await privatePage.locator("#theme-select").selectOption("light");
    await expectTheme(privatePage, "light");
    assert.equal(await privatePage.locator("#theme-notice").isVisible(), true);
    await privatePage.locator("#team-add").click();
    await privatePage.locator(".saved-teams-panel summary").click();
    await saveAs(privatePage, "Nesta sessão");
    assert.match(
      await privatePage.locator("#saved-teams-notice").textContent(),
      /não permitiu/,
    );
    await search(privatePage, 25);
    await privatePage.locator("#team-add").click();
    await privatePage.locator("#saved-team-load").click();
    assert.deepEqual(await teamIds(privatePage), [1]);
    await restricted.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS corrupted library recovery and functional session theme/team library with storage blocked",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const html = readFileSync(path.join(root, "preview-offline.html"), "utf8");
const snapshot = JSON.parse(
  readFileSync(path.join(root, ".preview-data.json"), "utf8"),
);
const origin = "https://pokedex.example.test";
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const errors = [];
const ready = (page) =>
  page.waitForFunction(
    () =>
      document
        .querySelector("#collection-results")
        .getAttribute("aria-busy") === "false",
  );
const ids = (page) =>
  page
    .locator("#collection-list button")
    .evaluateAll((buttons) =>
      buttons.map((button) => Number(button.dataset.pokemonId)),
    );
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
async function importPreview(page, code) {
  if ((await page.locator(".team-import").getAttribute("open")) === null)
    await page.locator(".team-import summary").click();
  await page.locator("#team-import-value").fill(code);
  await page.locator('#team-import-form button[type="submit"]').click();
}
async function apply(page) {
  await page.locator('#advanced-filters button[type="submit"]').click();
  await ready(page);
}
async function savedTeam(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("pokedex.team.v1") || "[]").map(
      (member) => member.id,
    ),
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
    const external = [];
    const context = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 1100 },
    });
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === origin)
        return route.fulfill({ contentType: "text/html", body: html });
      external.push(route.request().url());
      return route.abort();
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/index.html?discard=this");
    await nameIs(page, 1);
    await ready(page);
    assert.equal(await page.locator("#team-share").isDisabled(), true);
    for (const id of [1, 10034]) {
      await search(page, id);
      await page.locator("#team-add").click();
    }
    await page.locator("#team-share").click();
    const link = await page.locator("#team-share-value").inputValue();
    assert.equal(link, origin + "/index.html#team=v1:1,10034");
    await page.locator("#team-copy").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#team-share-status")
        .textContent.includes("Copiado!"),
    );
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      link,
    );
    const recipient = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await recipient.addInitScript(() => {
      if (!localStorage.getItem("pokedex.team.v1"))
        localStorage.setItem(
          "pokedex.team.v1",
          JSON.stringify([{ id: 7, name: "squirtle" }]),
        );
    });
    await recipient.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.fulfill({ contentType: "text/html", body: html })
        : route.abort(),
    );
    const receiver = await recipient.newPage();
    receiver.on("pageerror", (error) => errors.push(error.message));
    await receiver.goto(link);
    await receiver.waitForFunction(
      () => !document.querySelector("#shared-team-import").disabled,
    );
    assert.deepEqual(await savedTeam(receiver), [7]);
    assert.equal(await receiver.locator("#shared-team-list li").count(), 2);
    await receiver.locator("#shared-team-cancel").click();
    assert.deepEqual(await savedTeam(receiver), [7]);
    assert.equal(await receiver.locator("#shared-team-panel").isHidden(), true);
    await receiver.goto(link);
    await receiver.waitForFunction(
      () => !document.querySelector("#shared-team-import").disabled,
    );
    await receiver.locator("#shared-team-import").click();
    assert.deepEqual(await savedTeam(receiver), [1, 10034]);
    await receiver.reload();
    await receiver.waitForFunction(
      () => document.querySelectorAll(".team-member").length === 2,
    );
    assert.equal(await receiver.locator("#shared-team-panel").isHidden(), true);
    assert.deepEqual(await savedTeam(receiver), [1, 10034]);
    await importPreview(receiver, "pokedex-team:v1:1,1");
    await receiver.waitForFunction(() =>
      document
        .querySelector("#shared-team-status")
        .textContent.includes("inválido"),
    );
    assert.deepEqual(await savedTeam(receiver), [1, 10034]);
    await importPreview(receiver, "pokedex-team:v1:1,999999");
    await receiver.waitForFunction(() =>
      document
        .querySelector("#shared-team-status")
        .textContent.includes("fora da coleção offline"),
    );
    assert.equal(
      await receiver.locator("#shared-team-import").isDisabled(),
      true,
    );
    assert.deepEqual(await savedTeam(receiver), [1, 10034]);
    await recipient.close();
    console.log(
      "PASS public link and clipboard, recipient preview/cancel/atomic import, saved forms and invalid/unavailable team preservation",
    );

    await page.locator(".advanced-filter-panel summary").click();
    await page.locator("#category-filter").selectOption("legendary");
    await page.locator("#habitat-filter").selectOption("5");
    await page.locator("#stat-filter").selectOption("special-attack");
    await page.locator("#stat-min").fill("154");
    await page.locator("#stat-max").fill("154");
    await page.locator("#type-filter").selectOption("psychic");
    await page.locator("#generation-filter").selectOption("1");
    await apply(page);
    assert.deepEqual(await ids(page), [150]);
    assert.match(
      await page.locator("#advanced-filter-summary").textContent(),
      /Lendários.*Raro.*154–154/,
    );
    await page.locator("#stat-min").fill("200");
    await apply(page);
    assert.deepEqual(
      await ids(page),
      [150],
      "invalid range must preserve current results",
    );
    assert.equal(
      await page
        .locator("#stat-max")
        .evaluate((element) => element.validity.valid),
      false,
    );
    await page.locator("#stat-min").fill("0");
    await page.locator("#stat-max").fill("0");
    await apply(page);
    assert.deepEqual(await ids(page), []);
    await page.locator("#clear-filters").click();
    await ready(page);
    assert.equal(await page.locator("#category-filter").inputValue(), "");
    assert.equal(await page.locator("#stat-filter").inputValue(), "total");
    assert.match(
      await page.locator("#collection-status").textContent(),
      /43 Pokémon/,
    );
    await page.locator("#category-filter").selectOption("mythical");
    await apply(page);
    assert.deepEqual(await ids(page), [151, 1025]);
    await page.locator("#category-filter").selectOption("baby");
    await apply(page);
    assert.deepEqual(await ids(page), [172, 446, 447]);
    await page.locator("#clear-filters").click();
    await ready(page);
    await page.locator("#stat-filter").selectOption("speed");
    await page.locator("#sort-filter").selectOption("stat-desc");
    await apply(page);
    const expected = snapshot.ids
      .slice()
      .sort(
        (a, b) =>
          snapshot.pokemon[b].stats.find((stat) => stat.stat.name === "speed")
            .base_stat -
            snapshot.pokemon[a].stats.find((stat) => stat.stat.name === "speed")
              .base_stat || a - b,
      );
    assert.deepEqual(await ids(page), expected.slice(0, 12));
    await page.locator("#collection-next").click();
    assert.deepEqual(await ids(page), expected.slice(12, 24));
    await page.locator("#clear-filters").click();
    await ready(page);
    for (const id of [6, 10034, 150]) {
      await search(page, id);
      await page.locator("#favorite").click();
    }
    await page.locator("#favorites-only").click();
    await ready(page);
    await page.locator("#stat-min").fill("600");
    await page.locator("#sort-filter").selectOption("stat-desc");
    await apply(page);
    assert.deepEqual(await ids(page), [150, 10034]);
    await page.locator("#type-filter").selectOption("dragon");
    await ready(page);
    assert.deepEqual(await ids(page), [10034]);
    await page.locator("#generation-filter").selectOption("1");
    await ready(page);
    assert.deepEqual(await ids(page), [10034]);
    assert.deepEqual(external, []);
    console.log(
      "PASS combined category/habitat/type/generation/stat range, invalid and zero ranges, reset, baby/mythical filters, sort/pagination and real form favorites without Internet",
    );

    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.locator("#team-share").click();
      if ((await page.locator(".team-import").getAttribute("open")) === null)
        await page.locator(".team-import summary").click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `overflow at ${width}`,
      );
    }
    await context.close();

    const restricted = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await restricted.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw Error("blocked");
      };
      Storage.prototype.setItem = () => {
        throw Error("blocked");
      };
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async () => {
            throw Error("blocked");
          },
        },
      });
    });
    const privatePage = await restricted.newPage();
    privatePage.on("pageerror", (error) => errors.push(error.message));
    await restricted.route("**/*", (route) => route.abort());
    await privatePage.setContent(html);
    await nameIs(privatePage, 1);
    await privatePage.locator("#team-add").click();
    await privatePage.locator("#team-share").click();
    assert.equal(
      await privatePage.locator("#team-share-value").inputValue(),
      "pokedex-team:v1:1",
    );
    await privatePage.locator("#team-copy").click();
    assert.match(
      await privatePage.locator("#team-share-status").textContent(),
      /cópia automática não está disponível/,
    );
    await importPreview(privatePage, "pokedex-team:v1:25,10034");
    await privatePage.waitForFunction(
      () => !document.querySelector("#shared-team-import").disabled,
    );
    await privatePage.locator("#shared-team-import").click();
    assert.equal(await privatePage.locator(".team-member").count(), 2);
    assert.match(
      await privatePage.locator("#team-storage-notice").textContent(),
      /não permitiu/,
    );
    await restricted.close();
    console.log(
      "PASS responsive share/filter controls and portable-code import with blocked clipboard and blocked storage",
    );

    let failOnce = true,
      releaseSlow,
      slowRequested;
    const slowStarted = new Promise((resolve) => {
      slowRequested = resolve;
    });
    const online = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await online.addInitScript(() =>
      localStorage.setItem(
        "pokedex.team.v1",
        JSON.stringify([{ id: 7, name: "squirtle" }]),
      ),
    );
    await online.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL) return route.continue();
      if (url.hostname !== "pokeapi.co") return route.abort();
      const key = url.pathname.replace("/api/v2/", "") + url.search;
      if (key === "pokemon/10034" && failOnce) {
        failOnce = false;
        return route.abort();
      }
      if (key === "pokemon/150") {
        slowRequested();
        await new Promise((resolve) => {
          releaseSlow = resolve;
        });
      }
      const query = key.startsWith("pokemon/") ? key.slice(8) : null;
      const data = query
        ? snapshot.pokemon[query] || snapshot.pokemon[snapshot.names[query]]
        : snapshot.resources[key];
      return route
        .fulfill({
          status: data ? 200 : 404,
          contentType: "application/json",
          body: JSON.stringify(data || {}),
        })
        .catch(() => {});
    });
    const onlinePage = await online.newPage();
    onlinePage.on("pageerror", (error) => errors.push(error.message));
    await onlinePage.goto(baseURL);
    await nameIs(onlinePage, 1);
    await importPreview(onlinePage, "pokedex-team:v1:10034");
    await onlinePage.locator("#shared-team-retry").waitFor();
    assert.deepEqual(await savedTeam(onlinePage), [7]);
    await onlinePage.locator("#shared-team-retry").click();
    await onlinePage.waitForFunction(
      () => !document.querySelector("#shared-team-import").disabled,
    );
    await onlinePage.locator("#shared-team-import").click();
    assert.deepEqual(await savedTeam(onlinePage), [10034]);
    await importPreview(onlinePage, "pokedex-team:v1:150");
    await slowStarted;
    await importPreview(onlinePage, "pokedex-team:v1:1");
    await onlinePage.waitForFunction(
      () => !document.querySelector("#shared-team-import").disabled,
    );
    releaseSlow();
    await onlinePage.locator("#shared-team-import").click();
    assert.deepEqual(await savedTeam(onlinePage), [1]);
    await online.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS import network failure/retry and stale preview cancellation preserve saved teams and latest selection",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

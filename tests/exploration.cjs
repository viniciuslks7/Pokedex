const assert = require("node:assert/strict");
const { typeResource } = require("./fixtures/type-chart.cjs");
const { existsSync } = require("node:fs");
const { chromium } = require("playwright");
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const gif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);
const names = {
  1: "bulbasaur",
  2: "ivysaur",
  3: "venusaur",
  4: "charmander",
  5: "charmeleon",
  6: "charizard",
  7: "squirtle",
  8: "wartortle",
  9: "blastoise",
  25: "pikachu",
  26: "raichu",
  133: "eevee",
  134: "vaporeon",
  135: "jolteon",
  136: "flareon",
  196: "espeon",
  197: "umbreon",
  470: "leafeon",
  471: "glaceon",
  700: "sylveon",
  1000: "gholdengo",
  1025: "pecharunt",
};
const species = (id) => ({
  name: names[id] || `pokemon-${id}`,
  url: `https://pokeapi.co/api/v2/pokemon-species/${id}/`,
});
const node = (id, children = []) => ({
  species: species(id),
  evolves_to: children,
});
const eeveeFamily = [133, 134, 135, 136, 196, 197, 470, 471, 700];
const fixture = (id) => ({
  id,
  name: species(id).name,
  species: species(id),
  height: 7,
  weight: 69,
  types: [{ type: { name: "grass" } }],
  abilities: [{ ability: { name: "overgrow" } }],
  stats: [
    "hp",
    "attack",
    "defense",
    "special-attack",
    "special-defense",
    "speed",
  ].map((name) => ({ stat: { name }, base_stat: 50 })),
  sprites: {
    front_default: `${baseURL}/test-sprites/${id}.gif`,
    front_shiny: `${baseURL}/test-sprites/shiny-${id}.gif`,
  },
});

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
    const errors = [];
    let failWater = true;
    let failEvolution = true;
    let releaseIce, releaseSpecies;
    let iceStarted, speciesStarted;
    const context = await browser.newContext({ serviceWorkers: "block" });
    async function routes(route) {
      const url = new URL(route.request().url());
      const json = (data) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (
        url.hostname === "raw.githubusercontent.com" ||
        url.pathname.startsWith("/test-sprites/")
      )
        return route.fulfill({ contentType: "image/gif", body: gif });
      if (url.hostname !== "pokeapi.co") return route.continue();
      if (url.pathname.endsWith("/pokemon"))
        return json({
          results: Object.entries(names).map(([id, name]) => ({
            name,
            url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
          })),
        });
      const id = Number(url.pathname.split("/").filter(Boolean).pop());
      if (url.pathname.endsWith("/pokemon-species"))
        return json({
          count: 1025,
          results: Object.keys(names).map(Number).map(species),
        });
      if (url.pathname.includes("/type/")) {
        const type = url.pathname.split("/").pop();
        if (type === "water" && failWater) {
          failWater = false;
          return route.abort();
        }
        if (type === "ice") {
          iceStarted();
          await new Promise((resolve) => {
            releaseIce = resolve;
          });
        }
        const ids =
          {
            grass: [1, 2, 3, 470],
            fire: [4, 5, 6, 136],
            water: [7, 8, 9, 134],
            ice: [471],
          }[type] || [];
        return json({
          ...typeResource(type),
          pokemon: ids.map((id) => ({
            pokemon: {
              name: species(id).name,
              url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
            },
          })),
        }).catch(() => {});
      }
      if (url.pathname.includes("/generation/"))
        return json({
          pokemon_species: Object.keys(names)
            .map(Number)
            .filter((pokemonId) =>
              id === 1
                ? pokemonId <= 151
                : id === 9
                  ? pokemonId >= 1000
                  : false,
            )
            .map(species),
        });
      if (url.pathname.includes("/pokemon-species/")) {
        if (id === 4 && speciesStarted) {
          speciesStarted();
          await new Promise((resolve) => {
            releaseSpecies = resolve;
          });
        }
        return json({
          evolution_chain: {
            url: `https://pokeapi.co/api/v2/evolution-chain/${eeveeFamily.includes(id) ? 67 : id <= 3 ? 1 : id}/`,
          },
        }).catch(() => {});
      }
      if (url.pathname.includes("/evolution-chain/")) {
        if (id === 7 && failEvolution) {
          failEvolution = false;
          return route.abort();
        }
        return json({
          chain:
            id === 1
              ? node(1, [node(2, [node(3)])])
              : id === 67
                ? node(
                    133,
                    eeveeFamily.slice(1).map((id) => node(id)),
                  )
                : node(id),
        });
      }
      if (url.pathname.includes("/pokemon/"))
        return json(
          fixture(
            id ||
              Number(
                Object.keys(names).find(
                  (id) => names[id] === url.pathname.split("/").pop(),
                ),
              ) ||
              1,
          ),
        );
      throw new Error(`Unexpected request: ${url.pathname}`);
    }
    await context.route("**/*", routes);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const nameIs = (name) =>
      page.waitForFunction(
        (expected) =>
          document.querySelector("#pokemon-name").textContent === expected,
        name,
      );
    const collectionReady = () =>
      page.waitForFunction(
        () =>
          document
            .querySelector("#collection-results")
            .getAttribute("aria-busy") === "false",
      );
    const evolutionReady = () =>
      page.waitForFunction(
        () =>
          document
            .querySelector(".evolution-section")
            .getAttribute("aria-busy") === "false",
      );
    const search = async (value) => {
      await page.locator("#pokemon-search").fill(value);
      await page.locator(".search-button").click();
    };
    const ids = () =>
      page
        .locator("#collection-list button")
        .evaluateAll((buttons) =>
          buttons.map((button) => Number(button.dataset.pokemonId)),
        );
    await page.goto(baseURL);
    await nameIs("bulbasaur");
    await collectionReady();
    await evolutionReady();
    assert.equal(await page.locator("#collection-list button").count(), 12);
    assert.equal(await page.locator("#evolution-tree button").count(), 3);
    assert.equal(
      await page.locator("#evolution-tree ul ul button").count(),
      1,
      "three-stage chain stays nested",
    );
    await page.locator("#collection-next").click();
    assert.ok((await ids()).includes(1000));
    await page.locator("#collection-previous").click();
    assert.equal((await ids())[0], 1);
    console.log("PASS catalog pagination and three-stage evolution hierarchy");

    await page.locator("#favorite").click();
    assert.equal(
      await page.locator("#favorite").getAttribute("aria-pressed"),
      "true",
    );
    await page.reload();
    await nameIs("bulbasaur");
    assert.equal(
      await page.locator("#favorite").getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await page.locator("#favorite-count").textContent(), "1");
    await page.locator("#favorites-only").click();
    await collectionReady();
    assert.deepEqual(await ids(), [1]);
    await page.locator("#favorite").click();
    await collectionReady();
    assert.deepEqual(await ids(), []);
    assert.match(
      await page.locator("#collection-status").textContent(),
      /Sua coleção começa aqui/,
    );
    await page.locator("#clear-filters").click();
    await collectionReady();
    console.log(
      "PASS favorites persist on reload, remove and empty collection",
    );

    await page.locator("#type-filter").selectOption("grass");
    await collectionReady();
    assert.deepEqual(await ids(), [1, 2, 3, 470]);
    await page.locator("#generation-filter").selectOption("1");
    await collectionReady();
    assert.deepEqual(await ids(), [1, 2, 3]);
    await page.locator("#generation-filter").selectOption("9");
    await collectionReady();
    assert.deepEqual(await ids(), []);
    await page.locator("#clear-filters").click();
    await collectionReady();
    await page.locator("#type-filter").selectOption("water");
    await collectionReady();
    assert.equal(await page.locator("#collection-retry").isVisible(), true);
    assert.equal(
      await page.locator("#pokemon-name").textContent(),
      "bulbasaur",
    );
    await page.locator("#collection-retry").click();
    await collectionReady();
    assert.deepEqual(await ids(), [7, 8, 9, 134]);
    console.log(
      "PASS combined type/generation filters, empty results and independent retry",
    );

    const icePending = new Promise((resolve) => {
      iceStarted = resolve;
    });
    await page.locator("#type-filter").selectOption("ice");
    await icePending;
    await page.locator("#type-filter").selectOption("fire");
    await collectionReady();
    releaseIce();
    await page.waitForLoadState("networkidle");
    assert.deepEqual(await ids(), [4, 5, 6, 136]);
    await page.locator("#clear-filters").click();
    await collectionReady();
    await page.locator('#collection-list [data-pokemon-id="25"]').click();
    await nameIs("pikachu");
    await page.locator("#favorite").click();
    await page.locator("#favorites-only").click();
    await collectionReady();
    assert.deepEqual(await ids(), [25]);
    await page.locator("#type-filter").selectOption("grass");
    await collectionReady();
    assert.deepEqual(await ids(), [], "filters also apply to favorites");
    await page.locator("#clear-filters").click();
    await collectionReady();
    console.log(
      "PASS stale filter cancellation, result selection and filtered favorites",
    );

    await search("133");
    await nameIs("eevee");
    await evolutionReady();
    assert.equal(await page.locator("#evolution-tree button").count(), 9);
    assert.equal(
      await page.locator("#evolution-tree > li > ul > li").count(),
      8,
      "Eevee evolutions are siblings",
    );
    await page.locator('#evolution-tree [data-pokemon-id="135"]').click();
    await nameIs("jolteon");
    await evolutionReady();
    assert.equal(
      await page
        .locator('#evolution-tree [aria-current="true"]')
        .getAttribute("data-pokemon-id"),
      "135",
    );
    await search("1025");
    await nameIs("pecharunt");
    await evolutionReady();
    assert.match(
      await page.locator("#evolution-status").textContent(),
      /não possui evoluções/,
    );
    await search("7");
    await nameIs("squirtle");
    await evolutionReady();
    assert.equal(await page.locator("#evolution-retry").isVisible(), true);
    await page.locator("#evolution-retry").click();
    await evolutionReady();
    assert.equal(await page.locator("#evolution-retry").isHidden(), true);
    console.log(
      "PASS branched evolutions, selection, no evolution and failed-chain recovery",
    );

    const speciesPending = new Promise((resolve) => {
      speciesStarted = resolve;
    });
    await search("4");
    await speciesPending;
    await search("25");
    await nameIs("pikachu");
    await evolutionReady();
    releaseSpecies();
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page
        .locator('#evolution-tree [aria-current="true"]')
        .getAttribute("data-pokemon-id"),
      "25",
    );
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `overflow at ${width}px`,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS stale evolution cancellation, responsive layout and no uncaught errors",
    );

    await page.evaluate(() =>
      localStorage.setItem("pokedex.favorites.v1", "broken json"),
    );
    await page.reload();
    await nameIs("bulbasaur");
    assert.equal(await page.locator("#favorites-notice").isVisible(), true);
    assert.equal(await page.locator("#favorite-count").textContent(), "0");
    await context.close();
    const privateContext = await browser.newContext({
      serviceWorkers: "block",
    });
    await privateContext.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error("Storage unavailable");
      };
      Storage.prototype.setItem = () => {
        throw new Error("Storage unavailable");
      };
    });
    await privateContext.route("**/*", routes);
    const privatePage = await privateContext.newPage();
    await privatePage.goto(baseURL);
    await privatePage.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    await privatePage.locator("#favorite").click();
    assert.equal(
      await privatePage.locator("#favorite-count").textContent(),
      "1",
    );
    assert.match(
      await privatePage.locator("#favorites-notice").textContent(),
      /navegador não permitiu/,
    );
    await privateContext.close();
    console.log(
      "PASS malformed and unavailable storage gracefully fall back to session favorites",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { chromium } = require("playwright");
const { typeResource } = require("./fixtures/type-chart.cjs");
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const gif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);
const pokemon = {
  1: ["bulbasaur", ["grass", "poison"]],
  2: ["ivysaur", ["grass", "poison"]],
  3: ["venusaur", ["grass", "poison"]],
  6: ["charizard", ["fire", "flying"]],
  25: ["pikachu", ["electric"]],
  95: ["onix", ["rock", "ground"]],
  133: ["eevee", ["normal"]],
  134: ["vaporeon", ["water"]],
  135: ["jolteon", ["electric"]],
  144: ["articuno", ["ice", "flying"]],
  149: ["dragonite", ["dragon", "flying"]],
  196: ["espeon", ["psychic"]],
  197: ["umbreon", ["dark"]],
  208: ["steelix", ["steel", "ground"]],
  260: ["swampert", ["water", "ground"]],
  470: ["leafeon", ["grass"]],
  700: ["sylveon", ["fairy"]],
};
const species = (id) => ({
  name: pokemon[id][0],
  url: `https://pokeapi.co/api/v2/pokemon-species/${id}/`,
});
const node = (id, children = [], details = []) => ({
  species: species(id),
  evolves_to: children,
  evolution_details: details,
});
const level = (value) => ({ trigger: { name: "level-up" }, min_level: value });
const useItem = (name) => ({ trigger: { name: "use-item" }, item: { name } });
const fixture = (id) => ({
  id,
  name: pokemon[id][0],
  species: species(id),
  types: pokemon[id][1].map((name) => ({ type: { name } })),
  height: 7,
  weight: 69,
  abilities: [{ ability: { name: "overgrow" } }],
  stats: [
    "hp",
    "attack",
    "defense",
    "special-attack",
    "special-defense",
    "speed",
  ].map((name) => ({ stat: { name }, base_stat: 50 })),
  sprites: { front_default: `${baseURL}/test-sprites/${id}.gif` },
});
const chain = (id) =>
  id === 1
    ? node(1, [node(2, [node(3, [], [level(32)])], [level(16)])])
    : id === 67
      ? node(133, [
          node(134, [], [useItem("water-stone")]),
          node(135, [], [useItem("thunder-stone")]),
          node(
            196,
            [],
            [
              {
                trigger: { name: "level-up" },
                min_happiness: 160,
                time_of_day: "day",
              },
            ],
          ),
          node(
            197,
            [],
            [
              {
                trigger: { name: "level-up" },
                min_happiness: 160,
                time_of_day: "night",
              },
            ],
          ),
          node(
            470,
            [],
            [
              {
                ...useItem("leaf-stone"),
                is_default: true,
                version_group: { name: "sword-shield" },
              },
              {
                trigger: { name: "level-up" },
                location: { name: "eterna-forest" },
                near_special_rock: true,
                is_default: false,
                version_group: { name: "diamond-pearl" },
              },
            ],
          ),
          node(
            700,
            [],
            [
              {
                trigger: { name: "level-up" },
                known_move_type: { name: "fairy" },
                min_happiness: 160,
                is_default: true,
                version_group: { name: "sword-shield" },
              },
              {
                trigger: { name: "level-up" },
                known_move_type: { name: "fairy" },
                min_affection: 2,
                is_default: false,
                version_group: { name: "x-y" },
              },
            ],
          ),
        ])
      : id === 95
        ? node(95, [
            node(
              208,
              [],
              [
                {
                  trigger: { name: "trade" },
                  held_item: { name: "metal-coat" },
                },
              ],
            ),
          ])
        : node(id);

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
    const page = await browser.newPage({
      serviceWorkers: "block",
      viewport: { width: 1440, height: 1100 },
      reducedMotion: "reduce",
    });
    const errors = [];
    let failIce = true;
    let dragonMode = "slow",
      dragonStarted,
      releaseDragon;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
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
          results: Object.entries(pokemon).map(([id, [name]]) => ({
            name,
            url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
          })),
        });
      const value = url.pathname.split("/").filter(Boolean).pop();
      if (url.pathname.includes("/type/")) {
        if (value === "ice" && failIce) {
          failIce = false;
          return route.abort();
        }
        if (value === "dragon") {
          dragonStarted();
          if (dragonMode === "timeout") return;
          await new Promise((resolve) => {
            releaseDragon = resolve;
          });
        }
        return json(typeResource(value)).catch(() => {});
      }
      if (url.pathname.endsWith("/pokemon-species"))
        return json({
          count: 1025,
          results: Object.keys(pokemon).map(Number).map(species),
        });
      const id = Number(value);
      if (url.pathname.includes("/pokemon-species/"))
        return json({
          evolution_chain: {
            url: `https://pokeapi.co/api/v2/evolution-chain/${[133, 134, 135, 196, 197, 470, 700].includes(id) ? 67 : id <= 3 ? 1 : id === 208 ? 95 : id}/`,
          },
        });
      if (url.pathname.includes("/evolution-chain/"))
        return json({ chain: chain(id) });
      if (url.pathname.includes("/pokemon/")) return json(fixture(id));
      throw Error(`Unexpected request ${url.pathname}`);
    });
    const nameIs = (id) =>
      page.waitForFunction(
        (name) => document.querySelector("#pokemon-name").textContent === name,
        pokemon[id][0],
      );
    const ready = () =>
      page.waitForFunction(
        () =>
          document
            .querySelector(".matchup-section")
            .getAttribute("aria-busy") === "false" &&
          document
            .querySelector(".evolution-section")
            .getAttribute("aria-busy") === "false",
      );
    const search = async (id) => {
      await page.locator("#pokemon-search").fill(String(id));
      await page.locator(".search-button").click();
      await nameIs(id);
      await ready();
    };
    const multiplier = (type) =>
      page
        .locator(`#matchup-groups [data-type="${type}"]`)
        .getAttribute("data-multiplier");
    const step = (id) =>
      page
        .locator(".evolution-step")
        .filter({ has: page.locator(`[data-pokemon-id="${id}"]`) });
    await page.goto(baseURL);
    await nameIs(1);
    await ready();
    assert.equal(await multiplier("grass"), "0.25");
    assert.equal(await multiplier("psychic"), "2");
    assert.equal(
      await page.locator('#matchup-groups [data-type="bug"]').count(),
      0,
    );
    assert.equal(
      await page.locator("#pokemon-immunities .matchup-empty").count(),
      1,
    );
    assert.match(await step(2).textContent(), /Nível 16/);
    assert.match(await step(3).textContent(), /Nível 32/);
    await search(6);
    assert.equal(await multiplier("rock"), "4");
    assert.equal(await multiplier("grass"), "0.25");
    assert.equal(await multiplier("ground"), "0");
    assert.equal(
      await page.locator('#matchup-groups [data-type="ice"]').count(),
      0,
    );
    await search(260);
    assert.equal(await multiplier("grass"), "4");
    assert.equal(await multiplier("electric"), "0");
    console.log(
      "PASS dual-type multipliers, cancellations, immunities, localized values and level evolution conditions",
    );

    await search(133);
    assert.match(await step(134).textContent(), /Usar Pedra de Água/);
    assert.match(await step(196).textContent(), /Durante o dia/);
    assert.match(await step(197).textContent(), /Durante a noite/);
    assert.match(await step(197).textContent(), /Amizade de pelo menos 160/);
    const alternatives = step(700).locator("details");
    assert.equal(await alternatives.getAttribute("open"), null);
    assert.match(
      await step(700).locator(".evolution-conditions > div").textContent(),
      /Amizade/,
    );
    await alternatives.locator("summary").click();
    assert.equal(await alternatives.getAttribute("open"), "");
    assert.match(await alternatives.textContent(), /Afeição de pelo menos 2/);
    assert.match(await alternatives.textContent(), /X \/ Y/);
    await step(470).locator("summary").click();
    assert.match(await step(470).textContent(), /Diamond \/ Pearl/);
    assert.match(await step(470).textContent(), /Eterna Forest/);
    await step(197).locator("button").click();
    await nameIs(197);
    await ready();
    assert.equal(
      await page
        .locator('#evolution-tree [aria-current="true"]')
        .getAttribute("data-pokemon-id"),
      "197",
    );
    await search(95);
    assert.match(await step(208).textContent(), /Trocar com outro treinador/);
    assert.match(
      await step(208).textContent(),
      /Segurando Revestimento Metálico/,
    );
    console.log(
      "PASS item, friendship, time, held-item trade, per-game alternatives and evolution selection",
    );

    await search(144);
    assert.equal(await page.locator("#matchup-retry").isVisible(), true);
    assert.equal(await page.locator("#matchup-groups").isHidden(), true);
    assert.equal(await page.locator("#pokemon-name").textContent(), "articuno");
    await page.locator("#matchup-retry").click();
    await ready();
    assert.equal(await multiplier("rock"), "4");
    const pending = new Promise((resolve) => {
      dragonStarted = resolve;
    });
    await page.locator("#pokemon-search").fill("149");
    await page.locator(".search-button").click();
    await pending;
    await search(25);
    releaseDragon();
    await page.waitForLoadState("networkidle");
    assert.match(
      await page.locator("#matchup-status").textContent(),
      /pikachu/,
    );
    assert.equal(await multiplier("ground"), "2");
    dragonMode = "timeout";
    const timeoutPending = new Promise((resolve) => {
      dragonStarted = resolve;
    });
    await page.clock.install();
    await page.locator("#pokemon-search").fill("149");
    await page.locator(".search-button").click();
    await timeoutPending;
    await page.clock.fastForward(12001);
    await page.waitForFunction(
      () =>
        document.querySelector(".matchup-section").getAttribute("aria-busy") ===
        "false",
    );
    assert.equal(await page.locator("#matchup-retry").isVisible(), true);
    assert.equal(
      await page.locator("#pokemon-name").textContent(),
      "dragonite",
    );
    await page.clock.resume();
    await search(133);
    await step(700).locator("summary").click();
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
    assert.deepEqual(errors, []);
    console.log(
      "PASS independent failure/retry, stale response protection, timeout and branched-tree mobile layout",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Browser regression tests use deterministic API fixtures; no Internet required.
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
  25: "pikachu",
  26: "raichu",
  1000: "gholdengo",
  1025: "pecharunt",
};
const fixture = (id) => ({
  id,
  name: names[id] || `pokemon-${id}`,
  species: {
    name: names[id] || `pokemon-${id}`,
    url: `https://pokeapi.co/api/v2/pokemon-species/${id}/`,
  },
  height: 7,
  weight: 69,
  types: [{ type: { name: id === 25 ? "electric" : "grass" } }],
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
    versions: {
      "generation-v": {
        "black-white": {
          animated: { front_default: `${baseURL}/test-sprites/broken.gif` },
        },
      },
    },
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
    const page = await browser.newPage({
      serviceWorkers: "block",
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    const calls = new Map();
    let slowStarted;
    let slowRelease;
    let failOnce = true;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const json = (data, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (url.pathname.startsWith("/test-sprites/")) {
        return route.fulfill({
          status: url.pathname.endsWith("/broken.gif") ? 404 : 200,
          contentType: "image/gif",
          body: url.pathname.endsWith("/broken.gif") ? Buffer.alloc(0) : gif,
        });
      }
      if (url.hostname === "raw.githubusercontent.com")
        return route.fulfill({ contentType: "image/gif", body: gif });
      if (url.hostname !== "pokeapi.co") return route.continue();
      if (url.pathname.endsWith("/pokemon"))
        return json({
          results: Object.entries(names).map(([id, name]) => ({
            name,
            url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
          })),
        });
      if (url.pathname.endsWith("/pokemon-species"))
        return json({
          count: 1025,
          results: Object.entries(names).map(([id, name]) => ({
            name,
            url: `https://pokeapi.co/api/v2/pokemon-species/${id}/`,
          })),
        });
      if (url.pathname.includes("/pokemon-species/")) {
        const id = Number(url.pathname.split("/").filter(Boolean).pop());
        return json({
          evolution_chain: {
            url: `https://pokeapi.co/api/v2/evolution-chain/${id}/`,
          },
        });
      }
      if (url.pathname.includes("/evolution-chain/")) {
        const id = Number(url.pathname.split("/").filter(Boolean).pop());
        return json({
          chain: {
            species: {
              name: names[id] || `pokemon-${id}`,
              url: `https://pokeapi.co/api/v2/pokemon-species/${id}/`,
            },
            evolves_to: [],
          },
        });
      }
      if (url.pathname.includes("/type/"))
        return json(typeResource(url.pathname.split("/").pop()));
      const query = decodeURIComponent(url.pathname.split("/").pop());
      calls.set(query, (calls.get(query) || 0) + 1);
      if (query === "offline" && failOnce) {
        failOnce = false;
        return route.abort();
      }
      if (query === "missing") return json({}, 404);
      if (query === "server-error") return json({}, 503);
      if (query === "slow") {
        slowStarted();
        await new Promise((resolve) => {
          slowRelease = resolve;
        });
        // Aborted requests can no longer be fulfilled in every browser version.
        return json(fixture(2)).catch(() => {});
      }
      if (query === "timeout") return;
      const id =
        Number(query) ||
        Number(Object.keys(names).find((key) => names[key] === query)) ||
        25;
      return json(fixture(id));
    });
    const nameIs = (name) =>
      page.waitForFunction(
        (expected) =>
          document.querySelector("#pokemon-name").textContent === expected,
        name,
      );
    const search = async (value) => {
      await page.locator("#pokemon-search").fill(value);
      await page.locator(".search-button").click();
    };
    const statusContains = (text) =>
      page.waitForFunction(
        (expected) =>
          document.querySelector("#status").textContent.includes(expected),
        text,
      );
    await page.goto(baseURL);
    await nameIs("bulbasaur");
    await page.waitForFunction(
      () => !document.querySelector("#pokemon-image").hidden,
    );
    assert.equal(await page.locator("#previous").isDisabled(), true);
    assert.equal(await page.locator("meter").count(), 6);
    assert.equal(await page.locator("#stats-total").textContent(), "TOTAL 300");
    assert.ok(
      (await page.locator("#pokemon-image").getAttribute("src")).endsWith(
        "/1.gif",
      ),
    );
    console.log(
      "PASS initial load, attributes, image fallback and first-page boundary",
    );

    await search("  PIKACHU  ");
    await nameIs("pikachu");
    await page.locator("#shiny").click();
    assert.equal(
      await page.locator("#shiny").getAttribute("aria-pressed"),
      "true",
    );
    assert.ok(
      (await page.locator("#pokemon-image").getAttribute("src")).includes(
        "shiny-25",
      ),
    );
    await page.locator("#next").click();
    await nameIs("raichu");
    assert.equal(
      await page.locator("#shiny").getAttribute("aria-pressed"),
      "false",
    );
    await page.locator("#previous").click();
    await nameIs("pikachu");
    assert.equal(
      calls.get("25"),
      undefined,
      "name and ID aliases should share the cache",
    );
    console.log("PASS normalized search, shiny, navigation and cached aliases");

    await search("missing");
    await statusContains("não encontrado");
    assert.equal(await page.locator("#pokemon-name").textContent(), "pikachu");
    await search("server-error");
    await statusContains("Não foi possível conectar");
    await search("offline");
    await statusContains("Não foi possível conectar");
    await page.locator("#retry").click();
    await statusContains("encontrado");
    assert.equal(await page.locator("#retry").isHidden(), true);
    console.log(
      "PASS not found, service/network failures, preserved details and retry",
    );

    const started = new Promise((resolve) => {
      slowStarted = resolve;
    });
    await search("slow");
    await started;
    await search("1000");
    await nameIs("gholdengo");
    slowRelease();
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.locator("#pokemon-name").textContent(),
      "gholdengo",
    );
    assert.equal(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("pokedex.recent.v1")).items.some(
          (item) => item.id === 2,
        ),
      ),
      false,
    );
    console.log("PASS stale request cancellation and recent Pokémon fallback");

    await page.clock.install();
    const historyBeforeTimeout = await page.evaluate(() =>
      localStorage.getItem("pokedex.recent.v1"),
    );
    await search("timeout");
    await page.clock.fastForward(12001);
    await statusContains("demorou");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pokedex.recent.v1")),
      historyBeforeTimeout,
    );
    assert.equal(
      await page.locator(".pokemon-card").getAttribute("aria-busy"),
      "false",
    );
    await page.clock.resume();
    await search("1025");
    await nameIs("pecharunt");
    assert.equal(await page.locator("#next").isDisabled(), true);
    await page.locator(".random-button").click();
    await statusContains("encontrado");
    assert.notEqual(
      await page.locator("#pokemon-number").textContent(),
      "#1025",
    );
    console.log(
      "PASS timeout recovery, last-page boundary and random discovery",
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
      "PASS responsive widths 320–1440px and no uncaught JavaScript errors",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

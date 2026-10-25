const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { typeResource } = require("./fixtures/type-chart.cjs");
const preview = path.resolve(__dirname, "../preview.html");
const html = readFileSync(preview, "utf8");
const gif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);
const names = { 1: "bulbasaur", 25: "pikachu" };
const species = (id) => ({
  name: names[id],
  url: `https://pokeapi.co/api/v2/pokemon-species/${id}/`,
});
const pokemon = (id) => ({
  id,
  name: names[id],
  species: species(id),
  height: 7,
  weight: 69,
  types: (id === 1 ? ["grass", "poison"] : ["electric"]).map((name) => ({
    type: { name },
  })),
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
    front_default: `https://raw.githubusercontent.com/test/${id}.gif`,
    front_shiny: `https://raw.githubusercontent.com/test/shiny-${id}.gif`,
  },
});
(async () => {
  assert.ok(!/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(html));
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
    });
    const fileRequests = [];
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === "file:") {
        fileRequests.push(url.href);
        return route.continue();
      }
      const json = (data) =>
        route.fulfill({
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify(data),
        });
      if (url.hostname === "raw.githubusercontent.com")
        return route.fulfill({ contentType: "image/gif", body: gif });
      if (url.hostname !== "pokeapi.co") return route.abort();
      if (url.pathname.endsWith("/pokemon"))
        return json({
          results: Object.entries(names).map(([id, name]) => ({
            name,
            url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
          })),
        });
      const value = url.pathname.split("/").filter(Boolean).pop();
      const id = Number(value) || 25;
      if (url.pathname.endsWith("/pokemon-species"))
        return json({
          count: 1025,
          results: Object.keys(names).map(Number).map(species),
        });
      if (url.pathname.includes("/type/")) return json(typeResource(value));
      if (url.pathname.includes("/pokemon-species/"))
        return json({
          evolution_chain: {
            url: `https://pokeapi.co/api/v2/evolution-chain/${id}/`,
          },
        });
      if (url.pathname.includes("/evolution-chain/"))
        return json({ chain: { species: species(id), evolves_to: [] } });
      if (url.pathname.includes("/pokemon/")) return json(pokemon(id));
      throw Error(`Unexpected request ${url.href}`);
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // The managed Chromium blocks file: navigation by policy; load the exact
    // saved HTML content, as a single-document viewer does.
    await page.setContent(html);
    const nameIs = (name) =>
      page.waitForFunction(
        (expected) =>
          document.querySelector("#pokemon-name").textContent === expected,
        name,
      );
    await nameIs("bulbasaur");
    assert.ok(
      await page
        .locator("h1")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) > 30),
    );
    assert.ok(
      (
        await page
          .locator(".pokemon-stage")
          .evaluate((el) => getComputedStyle(el).backgroundImage)
      ).includes("data:image/svg+xml;base64,"),
    );
    await page.locator("#pokemon-search").fill("25");
    await page.locator(".search-button").click();
    await nameIs("pikachu");
    await page.locator("#shiny").click();
    assert.equal(
      await page.locator("#shiny").getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#scene-night").click();
    assert.equal(
      await page.locator("#scene-night").getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(
      fileRequests,
      [],
      "the exported HTML must not request local companion files",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS saved single-file HTML renders with styles, embedded scene, search and interactions",
    );

    const isolated = await context.newPage();
    isolated.on("pageerror", (error) => errors.push(error.message));
    await isolated.setContent(
      '<style>body{margin:0}iframe{display:block;width:100%;height:100vh;border:0}</style><iframe sandbox="allow-scripts allow-forms" title="Prévia isolada"></iframe>',
    );
    await isolated.locator("iframe").evaluate((iframe, content) => {
      iframe.srcdoc = content;
    }, html);
    const frame = await isolated.locator("iframe").contentFrame();
    await frame
      .locator("#pokemon-name")
      .filter({ hasText: "bulbasaur" })
      .waitFor();
    await frame.locator("#favorite").click();
    assert.equal(await frame.locator("#favorite-count").textContent(), "1");
    assert.equal(
      await frame.locator("#favorites-notice").isVisible(),
      true,
      "restricted storage must preserve in-session functionality",
    );
    await frame.locator("#pokemon-search").fill("25");
    await frame.locator(".search-button").click();
    await frame
      .locator("#pokemon-name")
      .filter({ hasText: "pikachu" })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS sandboxed HTML viewer: CSS/JS work and unavailable storage does not block browsing",
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

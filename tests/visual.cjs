// Browser checks for the local scenes, pointer/touch feedback and audio lifecycle.
const assert = require("node:assert/strict");
const { typeResource } = require("./fixtures/type-chart.cjs");
const { existsSync } = require("node:fs");
const { chromium } = require("playwright");
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const gif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);
const pokemon = {
  1: ["bulbasaur", "grass", "forest"],
  4: ["charmander", "fire", "volcano"],
  7: ["squirtle", "water", "coast"],
  25: ["pikachu", "electric", "storm"],
  94: ["gengar", "ghost", "twilight"],
  144: ["articuno", "ice", "alpine"],
};
const species = (id) => ({
  name: pokemon[id]?.[0] || `pokemon-${id}`,
  url: `https://pokeapi.co/api/v2/pokemon-species/${id}/`,
});
const fixture = (id) => ({
  id,
  name: species(id).name,
  species: species(id),
  height: 7,
  weight: 69,
  types: [{ type: { name: pokemon[id]?.[1] || "grass" } }],
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
  cries: id === 144 ? {} : { latest: `${baseURL}/test-cry/${id}.wav` },
});
const wav = Buffer.alloc(44 + 160000);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(160000, 40);

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
      viewport: { width: 1440, height: 1100 },
    });
    await context.addInitScript(() => {
      const NativeAudio = window.Audio;
      window.testClips = [];
      window.Audio = function (...args) {
        const audio = new NativeAudio(...args);
        window.testClips.push(audio);
        return audio;
      };
    });
    const routeRequest = async (route) => {
      const url = new URL(route.request().url());
      const json = (data) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (url.pathname.startsWith("/test-cry/"))
        return route.fulfill({
          status: url.pathname.endsWith("/94.wav") ? 404 : 200,
          contentType: "audio/wav",
          body: url.pathname.endsWith("/94.wav") ? Buffer.alloc(0) : wav,
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
      const id = Number(url.pathname.split("/").filter(Boolean).pop());
      if (url.pathname.endsWith("/pokemon-species"))
        return json({
          count: 1025,
          results: Object.keys(pokemon).map(Number).map(species),
        });
      if (url.pathname.includes("/pokemon-species/"))
        return json({
          evolution_chain: {
            url: `https://pokeapi.co/api/v2/evolution-chain/${id}/`,
          },
        });
      if (url.pathname.includes("/evolution-chain/"))
        return json({ chain: { species: species(id), evolves_to: [] } });
      if (url.pathname.includes("/type/"))
        return json(typeResource(url.pathname.split("/").pop()));
      if (url.pathname.includes("/pokemon/")) return json(fixture(id));
      throw Error(`Unexpected request ${url.pathname}`);
    };
    await context.route("**/*", routeRequest);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const nameIs = (name) =>
      page.waitForFunction(
        (expected) =>
          document.querySelector("#pokemon-name").textContent === expected,
        name,
      );
    const search = async (id) => {
      await page.locator("#pokemon-search").fill(String(id));
      await page.locator(".search-button").click();
      await nameIs(species(id).name);
      await page.waitForFunction(
        () => !document.querySelector("#pokemon-greet").disabled,
      );
    };
    await page.goto(baseURL);
    await nameIs("bulbasaur");
    await page.waitForFunction(
      () => !document.querySelector("#pokemon-greet").disabled,
    );
    assert.equal(
      await page.evaluate(() => window.testClips.length),
      0,
      "audio must never autoplay",
    );
    await page.locator("#pokemon-greet").click();
    assert.match(
      await page.locator("#scene-speech").textContent(),
      /bulbasaur/,
    );
    await page.locator("#scene-night").click();
    assert.equal(
      await page.locator("#scene-night").getAttribute("aria-pressed"),
      "true",
    );
    assert.match(
      await page.locator(".pokemon-stage").getAttribute("class"),
      /is-night/,
    );
    await page.locator("#scene-night").hover();
    const contrast = await page.locator("#scene-night").evaluate((el) => {
      const style = getComputedStyle(el);
      const luminance = (color) =>
        color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((value) => {
            value /= 255;
            return value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, value, index) =>
              sum + value * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      const a = luminance(style.color),
        b = luminance(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    assert.ok(
      contrast >= 4.5,
      "pressed scene control must retain readable contrast on hover",
    );
    for (const [id, [name, type, habitat]] of Object.entries(pokemon)) {
      await search(id);
      assert.equal(
        await page.locator(".pokemon-stage").getAttribute("data-habitat"),
        habitat,
      );
      assert.equal(
        await page.locator(".pokemon-card").getAttribute("data-type"),
        type,
      );
      assert.ok(
        (
          await page
            .locator(".pokemon-stage")
            .evaluate((el) => getComputedStyle(el).backgroundImage)
        ).includes(`${habitat}.svg`),
      );
      const response = await page.request.get(
        `${baseURL}/images/habitats/${habitat}.svg`,
      );
      assert.equal(response.status(), 200);
      assert.match(await response.text(), /<svg/);
      assert.equal(
        await page.locator("#scene-night").getAttribute("aria-pressed"),
        "true",
      );
    }
    console.log(
      "PASS six local landscapes, per-type selection, persistent night state and greeting",
    );

    await page.locator('.quick-picks [data-query="25"]').click();
    await nameIs("pikachu");
    await page.locator("#shiny").click();
    assert.match(
      await page.locator(".pokemon-stage").getAttribute("class"),
      /is-shiny/,
    );
    await page.locator("#favorite").click();
    assert.match(
      await page.locator("#toast").textContent(),
      /adicionado aos favoritos/,
    );
    await page.locator("#pokemon-cry").click();
    await page.waitForFunction(() => window.testClips.at(-1)?.readyState >= 2);
    assert.equal(
      await page.locator("#pokemon-cry").getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page.evaluate(() => window.testClips.at(-1).paused),
      false,
    );
    await page.locator("#pokemon-cry").click();
    assert.equal(
      await page.evaluate(() => window.testClips.at(-1).paused),
      true,
    );
    await page.locator("#pokemon-cry").click();
    await search(7);
    assert.equal(
      await page.evaluate(() => window.testClips.every((clip) => clip.paused)),
      true,
    );
    assert.equal(
      await page.locator("#pokemon-cry").getAttribute("aria-pressed"),
      "false",
    );
    await search(94);
    await page.locator("#pokemon-cry").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#toast")
        .textContent.includes("Não foi possível reproduzir"),
    );
    assert.equal(
      await page.locator("#pokemon-cry").getAttribute("aria-pressed"),
      "false",
    );
    await search(144);
    assert.equal(await page.locator("#pokemon-cry").isDisabled(), true);
    console.log(
      "PASS suggestions, shiny/favorite feedback, real media playback, stop, navigation cleanup and unavailable audio",
    );

    await page.locator("body").click({ position: { x: 2, y: 2 } });
    await page.keyboard.press("/");
    assert.equal(
      await page
        .locator("#pokemon-search")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator("#pokemon-search").fill("25");
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.locator("#pokemon-name").textContent(),
      "articuno",
      "shortcuts must not navigate while typing",
    );
    await page.locator("#pokemon-search").press("Enter");
    await nameIs("pikachu");
    await page.locator("body").click({ position: { x: 2, y: 2 } });
    await page.keyboard.press("ArrowRight");
    await nameIs("pokemon 26");
    await page.keyboard.press("ArrowLeft");
    await nameIs("pikachu");
    await page.locator("#scene-motion").click();
    assert.equal(
      await page.locator("#scene-motion").getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(
      await page
        .locator("#pokemon-image")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await page.locator("#scene-motion").click();
    assert.equal(
      await page.locator("#scene-motion").getAttribute("aria-pressed"),
      "true",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(
      () => document.querySelector("#scene-motion").disabled,
    );
    assert.equal(
      await page
        .locator("#pokemon-image")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await page.locator("#pokemon-greet").click();
    assert.equal(await page.locator("#scene-speech").isVisible(), true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
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
      "PASS keyboard focus/shortcuts, motion toggle, reduced motion and responsive widths",
    );
    const touchContext = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 375, height: 950 },
      hasTouch: true,
      isMobile: true,
    });
    await touchContext.route("**/*", routeRequest);
    const touchPage = await touchContext.newPage();
    await touchPage.goto(baseURL);
    await touchPage.waitForFunction(
      () => !document.querySelector("#pokemon-greet").disabled,
    );
    await touchPage.locator("#pokemon-greet").tap();
    assert.equal(await touchPage.locator("#scene-speech").isVisible(), true);
    console.log("PASS touch interaction");
    await touchContext.close();
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const snapshot = JSON.parse(
  readFileSync(path.join(root, ".preview-data.json"), "utf8"),
);
const html = readFileSync(path.join(root, "preview-offline.html"), "utf8");
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
    await context.setOffline(true);
    await context.route("**/*", (route) => {
      outbound.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.evaluate(() => {
      const NativeAudio = window.Audio;
      window.offlineAudioPlayed = false;
      window.Audio = function (...args) {
        const clip = new NativeAudio(...args);
        clip.addEventListener("playing", () => {
          window.offlineAudioPlayed = true;
        });
        return clip;
      };
    });
    await page.setContent(html);
    const ready = () =>
      page.waitForFunction(
        () =>
          document.querySelector(".pokemon-card").getAttribute("aria-busy") ===
            "false" &&
          document
            .querySelector(".matchup-section")
            .getAttribute("aria-busy") === "false" &&
          document
            .querySelector(".evolution-section")
            .getAttribute("aria-busy") === "false",
      );
    const nameIs = (id) =>
      page.waitForFunction(
        (name) => document.querySelector("#pokemon-name").textContent === name,
        snapshot.pokemon[id].name.replaceAll("-", " "),
      );
    const search = async (query) => {
      await page.locator("#pokemon-search").fill(String(query));
      await page.locator(".search-button").click();
      await ready();
    };
    await nameIs(1);
    await ready();
    assert.match(
      await page.locator(".offline-preview-note").textContent(),
      new RegExp(`${snapshot.ids.length} Pokémon`),
    );
    for (const id of snapshot.ids) {
      await search(id);
      await nameIs(id);
      await page.waitForFunction(
        () =>
          !document.querySelector("#pokemon-image").hidden &&
          document.querySelector("#pokemon-image").naturalWidth > 0,
      );
      assert.equal(
        await page.locator("#evolution-retry").isHidden(),
        true,
        `evolutions ${id}`,
      );
      assert.equal(
        await page.locator("#matchup-retry").isHidden(),
        true,
        `types ${id}`,
      );
      assert.equal(
        await page.locator("#retry").isHidden(),
        true,
        `details ${id}`,
      );
    }
    console.log(
      `PASS all ${snapshot.ids.length} real Pokémon, portraits, evolution families and matchups with networking disabled`,
    );
    await search("pikachu");
    await nameIs(25);
    await page.locator("#shiny").click();
    await page.waitForFunction(
      () => !document.querySelector("#pokemon-image").hidden,
    );
    assert.ok(
      (await page.locator("#pokemon-image").getAttribute("src")).startsWith(
        "data:image/png;",
      ),
    );
    await page.locator("#favorite").click();
    await page.locator("#favorites-only").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#collection-results")
          .getAttribute("aria-busy") === "false",
    );
    assert.equal(await page.locator("#collection-list button").count(), 1);
    await page.locator("#clear-filters").click();
    await page.locator("#generation-filter").selectOption("9");
    await page.waitForFunction(
      () =>
        document
          .querySelector("#collection-results")
          .getAttribute("aria-busy") === "false",
    );
    assert.ok((await page.locator("#collection-list button").count()) > 0);
    await page.locator("#clear-filters").click();
    for (let i = 0; i < 5; i++) {
      await page.locator(".random-button").click();
      await ready();
      assert.equal(await page.locator("#retry").isHidden(), true);
    }
    await search(snapshot.ids.at(-1));
    assert.equal(await page.locator("#next").isDisabled(), true);
    await page.locator("#previous").click();
    await ready();
    await nameIs(snapshot.ids.at(-2));
    await search("not-in-this-collection");
    assert.match(
      await page.locator("#status").textContent(),
      /coleção offline/,
    );
    console.log(
      "PASS offline name search, shiny, favorites, generation filters, random and bounded navigation; unavailable names are explained",
    );
    await search(1);
    await nameIs(1);
    await page.locator("#pokemon-cry").click();
    await page.waitForFunction(() => window.offlineAudioPlayed === true);
    assert.ok(
      !(await page.locator("#toast").textContent()).includes(
        "Não foi possível reproduzir",
      ),
    );
    await page.locator("#pokemon-greet").click();
    assert.equal(await page.locator("#scene-speech").isVisible(), true);
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    assert.deepEqual(
      outbound,
      [],
      "offline artifact must not attempt external requests",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS embedded sound, interaction, responsive layout and ZERO external requests",
    );
    const isolated = await context.newPage();
    isolated.on("pageerror", (error) => errors.push(error.message));
    await isolated.setContent(
      '<style>body{margin:0}iframe{display:block;width:100%;height:100vh;border:0}</style><iframe sandbox="allow-scripts allow-forms" title="Prévia offline"></iframe>',
    );
    await isolated.locator("iframe").evaluate((frame, content) => {
      frame.srcdoc = content;
    }, html);
    const frame = isolated.locator("iframe").contentFrame();
    await frame
      .locator("#pokemon-name")
      .filter({ hasText: "bulbasaur" })
      .waitFor();
    await frame.locator("#pokemon-search").fill("pikachu");
    await frame.locator(".search-button").click();
    await frame
      .locator("#pokemon-name")
      .filter({ hasText: "pikachu" })
      .waitFor();
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS sandboxed viewer with blocked Internet and blocked persistent storage",
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

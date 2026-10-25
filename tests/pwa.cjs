const assert = require("node:assert/strict");
const http = require("node:http");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const sourceRoot = path.resolve(__dirname, ".."),
  root = process.env.POKEDEX_SITE_DIR
    ? path.resolve(process.env.POKEDEX_SITE_DIR)
    : sourceRoot,
  snapshot = JSON.parse(
    readFileSync(path.join(sourceRoot, ".preview-data.json"), "utf8"),
  );
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
let suffix = "",
  broken = false,
  network = true;
const server = http.createServer((request, response) => {
  try {
    const pathname = new URL(request.url, "http://test").pathname;
    if (!pathname.startsWith("/pokedex/")) {
      response.writeHead(404);
      response.end();
      return;
    }
    const relative =
        decodeURIComponent(pathname.slice("/pokedex/".length)) || "index.html",
      file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    let data = readFileSync(file);
    if (relative === "offline-assets.js") {
      const source = data.toString(),
        config = JSON.parse(
          source
            .slice(source.indexOf("=") + 1)
            .trim()
            .replace(/;$/, ""),
        );
      config.version += suffix;
      if (broken) config.files.push("missing-shell-test.txt");
      data = Buffer.from(
        `self.POKEDEX_OFFLINE_ASSETS=${JSON.stringify(config)};`,
      );
    }
    response.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
function pokemonFixture(id) {
  const data = structuredClone(snapshot.pokemon[id]);
  if (!data) return null;
  const base =
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
  data.sprites = {
    front_default: `${base}${id}.png`,
    front_shiny: `${base}shiny/${id}.png`,
  };
  data.cries = {
    latest: `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`,
  };
  return data;
}
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`,
    url = origin + "/pokedex/";
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
      serviceWorkers: "allow",
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      const NativeAudio = window.Audio;
      window.testAudio = [];
      window.Audio = function (...args) {
        const audio = new NativeAudio(...args);
        window.testAudio.push(audio);
        return audio;
      };
    });
    let workerApiCalls = 0;
    await context.route("https://pokeapi.co/**", (route) => {
      if (route.request().serviceWorker()) workerApiCalls++;
      if (!network) return route.abort();
      const request = new URL(route.request().url()),
        key = request.pathname.replace("/api/v2/", "") + request.search,
        query = key.startsWith("pokemon/") ? key.slice(8) : null;
      const id = query ? Number(query) || snapshot.names[query] : null;
      const data = query ? pokemonFixture(id) : snapshot.resources[key];
      return route.fulfill({
        status: data ? 200 : 404,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(data || {}),
      });
    });
    await context.route("https://raw.githubusercontent.com/**", (route) => {
      if (!network) return route.abort();
      const url = route.request().url(),
        id = Number(url.match(/\/(\d+)\.(?:png|ogg)$/)?.[1]);
      const data = url.endsWith(".ogg")
        ? snapshot.pokemon[id]?.cries.latest
        : snapshot.pokemon[id]?.sprites[
            url.includes("/shiny/") ? "front_shiny" : "front_default"
          ];
      if (!data) return route.fulfill({ status: 404, body: "missing" });
      const [, type, bytes] = data.match(/^data:([^;]+);base64,(.*)$/);
      return route.fulfill({
        contentType: type,
        headers: { "access-control-allow-origin": "*" },
        body: Buffer.from(bytes, "base64"),
      });
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForFunction(
      () =>
        Number(document.querySelector("#offline-pokemon-count").textContent) >=
        1,
    );
    const registration = await page.evaluate(async () => ({
      scope: (await navigator.serviceWorker.ready).scope,
      manifest: await (
        await fetch(document.querySelector('link[rel="manifest"]').href)
      ).json(),
    }));
    assert.equal(registration.scope, url);
    assert.equal(registration.manifest.display, "standalone");
    assert.deepEqual(
      registration.manifest.icons.map((icon) => icon.sizes),
      ["192x192", "512x512"],
    );
    await page.locator("#pokemon-search").fill("25");
    await page.locator(".search-button").click();
    await page.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "pikachu",
    );
    await page.waitForFunction(() =>
      document
        .querySelector("#offline-pokemon-list")
        .textContent.includes("pikachu"),
    );
    await page.waitForFunction(async () => {
      const keys = await caches.keys(),
        media = await caches.open(keys.find((key) => key.endsWith("media-v1")));
      return (
        Boolean(
          await media.match(
            "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png",
          ),
        ) &&
        Boolean(
          await media.match(
            "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/25.ogg",
          ),
        )
      );
    });
    assert.ok(
      workerApiCalls > 0,
      "API fixture must exercise the actual service worker",
    );
    await page.locator("#favorite").click();
    await page.locator("#team-add").click();
    await page.locator("#progress-caught").click();
    await page.locator("#favorites-only").click();
    await page.locator("#type-filter").selectOption("electric");
    await page.waitForFunction(
      () =>
        document
          .querySelector("#collection-results")
          .getAttribute("aria-busy") === "false",
    );
    await page.locator(".filter-presets-panel summary").click();
    await page.locator("#filter-preset-name").fill("Retomar Pikachu");
    await page.locator('#filter-preset-form button[type="submit"]').click();
    await page.locator("#attack-type-1").selectOption("ground");
    await page.locator("#attack-type-2").selectOption("ice");
    await page.waitForFunction(
      () => !document.querySelector("#attack-coverage-results").hidden,
    );
    await page.locator("#field-note").fill("Meu parceiro de viagem.");
    const personalMemory = await page.evaluate(() => ({
      history: localStorage.getItem("pokedex.recent.v1"),
      filters: localStorage.getItem("pokedex.filters.v1"),
      progress: localStorage.getItem("pokedex.progress.v1"),
      attacks: localStorage.getItem("pokedex.attack-coverage.v1"),
      notes: localStorage.getItem("pokedex.notes.v1"),
    }));
    console.log(
      "PASS real service worker, manifest/icons, subdirectory scope, initial-visit warm-up and cached API aliases/media",
    );

    network = false;
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
    );
    await page.locator("#section-menu-open").click();
    await page.locator('[data-section-id="collection-heading"]').click();
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "collection-heading",
    );
    await page.locator("#section-search").click();
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "pokemon-search",
    );
    await page.locator(".recent-panel summary").click();
    await page.locator('#recent-pokemon-list [data-pokemon-id="25"]').click();
    await page.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "pikachu",
    );
    assert.equal(
      await page.locator("#field-note").inputValue(),
      "Meu parceiro de viagem.",
    );
    await page.waitForFunction(
      () =>
        !document.querySelector("#attack-coverage-results").hidden &&
        document.querySelector("#attack-target-name").textContent === "pikachu",
    );
    assert.match(
      await page.locator("#attack-target-best").textContent(),
      /Terra · ×2/,
    );
    assert.equal(
      await page.locator("#attack-coverage-table tbody tr").count(),
      18,
    );
    assert.equal(
      await page.locator("#progress-caught").getAttribute("aria-pressed"),
      "true",
    );
    await page.locator(".filter-presets-panel summary").click();
    await page
      .locator("#filter-preset-select")
      .selectOption({ label: "Retomar Pikachu" });
    await page.locator("#filter-preset-load").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#collection-results")
          .getAttribute("aria-busy") === "false",
    );
    assert.equal(await page.locator("#collection-list button").count(), 1);
    assert.equal(await page.locator("#type-filter").inputValue(), "electric");
    assert.equal(
      await page.locator("#favorites-only").getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#pokemon-search").fill("pikachu");
    await page.locator(".search-button").click();
    await page.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "pikachu",
    );
    await page.waitForFunction(
      () =>
        !document.querySelector("#pokemon-image").hidden &&
        document.querySelector("#pokemon-image").naturalWidth > 0,
    );
    await page.waitForFunction(
      () =>
        !document.querySelector("#species-content").hidden &&
        document.querySelector("#matchup-groups").hidden === false,
    );
    const range = await page.evaluate(async () => {
      const response = await fetch(
        "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/25.ogg",
        { headers: { Range: "bytes=0-15" } },
      );
      return {
        status: response.status,
        length: (await response.arrayBuffer()).byteLength,
        range: response.headers.get("content-range"),
      };
    });
    assert.equal(range.status, 206);
    assert.equal(range.length, 16);
    assert.match(range.range, /^bytes 0-15\//);
    await page.locator("#team-image-export").click();
    await page.locator("#team-image-download").waitFor();
    assert.equal(
      await page
        .locator("#team-image-preview")
        .evaluate((image) => image.naturalWidth),
      1200,
    );
    await page.locator("#pokemon-search").fill("658");
    await page.locator(".search-button").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#status")
        .textContent.includes("ainda não foi guardado"),
    );
    assert.equal(await page.locator("#pokemon-name").textContent(), "pikachu");
    console.log(
      "PASS reloading without network, cached name search, sprites/species/types, audio byte ranges and honest uncached search errors",
    );

    await page.locator("#offline-catalog summary").click();
    await page.locator("#offline-app-clear").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#offline-pokemon-count").textContent === "0",
    );
    assert.equal(await page.locator("#favorite-count").textContent(), "1");
    assert.equal(await page.locator(".team-member").count(), 1);
    assert.deepEqual(
      await page.evaluate(() => ({
        history: localStorage.getItem("pokedex.recent.v1"),
        filters: localStorage.getItem("pokedex.filters.v1"),
        progress: localStorage.getItem("pokedex.progress.v1"),
        attacks: localStorage.getItem("pokedex.attack-coverage.v1"),
        notes: localStorage.getItem("pokedex.notes.v1"),
      })),
      personalMemory,
    );
    assert.equal(
      await page.evaluate(async () => {
        const names = await caches.keys();
        return names.some((name) => name.includes("shell-"));
      }),
      true,
    );
    console.log(
      "PASS clearing only public offline data preserves the app shell, favorites and team",
    );

    network = true;
    await context.setOffline(false);
    await page.waitForFunction(
      () =>
        Number(document.querySelector("#offline-pokemon-count").textContent) >
        0,
    );
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt");
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(event);
    });
    await page.locator("#install-app").click();
    assert.match(
      await page.locator("#app-install-status").textContent(),
      /Instalação solicitada/,
    );
    suffix = "-update";
    await page.reload();
    await page.locator("#update-app").waitFor();
    await Promise.all([
      page.waitForEvent("load"),
      page.locator("#update-app").click(),
    ]);
    await page.waitForFunction(
      () =>
        navigator.serviceWorker.controller &&
        document.querySelector("#favorite-count").textContent === "1",
    );
    const shellNames = await page.evaluate(async () =>
      (await caches.keys()).filter((name) => name.includes("shell-")),
    );
    assert.equal(shellNames.length, 1);
    assert.ok(shellNames[0].endsWith("-update"));
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS install-prompt interaction and real waiting-worker update/reload preserve favorites and clean the old shell cache",
    );

    suffix = "-broken";
    broken = true;
    const failed = await browser.newContext({
      serviceWorkers: "allow",
      reducedMotion: "reduce",
    });
    await failed.route("https://pokeapi.co/**", (route) => {
      const u = new URL(route.request().url()),
        key = u.pathname.replace("/api/v2/", "") + u.search,
        q = key.startsWith("pokemon/") ? key.slice(8) : null;
      const data = q
        ? snapshot.pokemon[q] || snapshot.pokemon[snapshot.names[q]]
        : snapshot.resources[key];
      return route.fulfill({
        status: data ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(data || {}),
      });
    });
    await failed.route("https://raw.githubusercontent.com/**", (route) =>
      route.abort(),
    );
    const bad = await failed.newPage();
    await bad.goto(url);
    await bad.waitForFunction(
      () => !document.querySelector("#offline-app-retry").hidden,
    );
    assert.equal(await bad.locator("#pokemon-name").textContent(), "bulbasaur");
    assert.match(
      await bad.locator("#offline-app-status").textContent(),
      /Não foi possível preparar/,
    );
    await failed.close();
    console.log(
      "PASS a failed shell installation is explained and does not block ordinary Pokémon browsing",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

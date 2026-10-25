const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const snapshot = JSON.parse(
  readFileSync(path.join(__dirname, "../.preview-data.json"), "utf8"),
);
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
async function routeOffline(context) {
  await context.route("**/*", (route) =>
    route.request().url() === baseURL + "/preview-offline.html"
      ? route.continue()
      : route.abort(),
  );
}
async function ready(page) {
  await page.waitForFunction(
    () => document.querySelector("#pokemon-name").textContent === "bulbasaur",
  );
  await settled(page);
}
async function settled(page) {
  await page.waitForFunction(
    () =>
      document
        .querySelector("#collection-results")
        .getAttribute("aria-busy") === "false",
  );
}
async function pick(page, id) {
  await page.locator("#pokemon-search").fill(String(id));
  await page.locator(".search-button").click();
  await page.waitForFunction(
    (name) => document.querySelector("#pokemon-name").textContent === name,
    snapshot.pokemon[id].name.replaceAll("-", " "),
  );
}
async function ids(page) {
  return page
    .locator("#collection-list button")
    .evaluateAll((buttons) =>
      buttons.map((button) => Number(button.dataset.pokemonId)),
    );
}
async function stored(page) {
  return page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("pokedex.progress.v1") || '{"entries":[]}',
      ).entries,
  );
}
async function upload(page, data) {
  await page
    .locator("#backup-file")
    .setInputFiles({
      name: "progresso.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
}
async function previewReady(page) {
  await page.waitForFunction(
    () => !document.querySelector("#backup-import").disabled,
  );
}
async function downloadBackup(page) {
  const pending = page.waitForEvent("download");
  await page.locator("#backup-export").click();
  const download = await pending;
  return JSON.parse(readFileSync(await download.path(), "utf8"));
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
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
    });
    const errors = [];
    await routeOffline(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL + "/preview-offline.html");
    await ready(page);
    assert.equal(await page.locator("#progress-seen-count").textContent(), "0");
    assert.equal(
      await page.locator("#progress-total-count").textContent(),
      "43",
    );
    assert.deepEqual(await stored(page), []);
    await page.locator("#progress-seen").click();
    await settled(page);
    assert.equal(
      await page.locator("#progress-seen").getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#progress-caught").click();
    await settled(page);
    assert.equal(await page.locator("#progress-seen").isDisabled(), true);
    assert.match(
      await page
        .locator('#collection-list [data-pokemon-id="1"]')
        .getAttribute("aria-label"),
      /capturado/,
    );
    await page.locator("#progress-caught").click();
    await settled(page);
    assert.equal(
      await page.locator("#progress-seen").getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page.locator("#progress-caught").getAttribute("aria-pressed"),
      "false",
    );
    await page.locator("#progress-seen").click();
    await settled(page);
    assert.deepEqual(await stored(page), []);
    await page.locator("#progress-seen").click();
    await pick(page, 10034);
    await page.locator("#progress-caught").click();
    await settled(page);
    await pick(page, 6);
    assert.equal(
      await page.locator("#progress-caught").getAttribute("aria-pressed"),
      "true",
    );
    await pick(page, 25);
    await page.locator("#progress-caught").click();
    await settled(page);
    const expected = [
      { id: 1, state: "seen" },
      { id: 6, state: "caught" },
      { id: 25, state: "caught" },
    ];
    assert.deepEqual(await stored(page), expected);
    assert.equal(await page.locator("#progress-seen-count").textContent(), "3");
    assert.equal(
      await page.locator("#progress-caught-count").textContent(),
      "2",
    );
    await page.reload();
    await ready(page);
    assert.deepEqual(await stored(page), expected);
    await page.locator("#progress-filter").selectOption("caught");
    await settled(page);
    assert.deepEqual(await ids(page), [6, 25]);
    assert.equal(
      await page.locator("#progress-total-count").textContent(),
      "43",
    );
    await page.locator(".filter-presets-panel summary").click();
    await page.locator("#filter-preset-name").fill("Capturados");
    await page.locator('#filter-preset-form button[type="submit"]').click();
    const preset = await page.locator("#filter-preset-select").inputValue();
    await page.locator("#progress-filter").selectOption("seen");
    await settled(page);
    assert.deepEqual(await ids(page), [1, 6, 25]);
    await page.locator("#progress-filter").selectOption("unseen");
    await settled(page);
    assert.match(
      await page.locator("#collection-status").textContent(),
      /40 Pokémon/,
    );
    await page.locator("#progress-filter").selectOption("uncaught");
    await settled(page);
    assert.match(
      await page.locator("#collection-status").textContent(),
      /41 Pokémon/,
    );
    await page.locator("#clear-filters").click();
    await settled(page);
    await page.locator("#filter-preset-select").selectOption(preset);
    await page.locator("#filter-preset-load").click();
    await settled(page);
    assert.equal(await page.locator("#progress-filter").inputValue(), "caught");
    assert.deepEqual(await ids(page), [6, 25]);
    await page.locator("#generation-filter").selectOption("2");
    await settled(page);
    assert.deepEqual(await ids(page), []);
    assert.equal(
      await page.locator("#progress-caught-count").textContent(),
      "0",
    );
    await page.locator("#clear-filters").click();
    for (const id of [6, 10034]) {
      await pick(page, id);
      await page.locator("#favorite").click();
    }
    await page.locator("#favorites-only").click();
    await settled(page);
    assert.equal(
      await page.locator("#progress-total-count").textContent(),
      "1",
    );
    assert.equal(
      await page.locator("#progress-caught-count").textContent(),
      "1",
    );
    assert.deepEqual(await ids(page), [6, 10034]);
    await page.locator("#type-filter").selectOption("water");
    await settled(page);
    assert.equal(
      await page.locator("#progress-total-count").textContent(),
      "0",
    );
    assert.match(
      await page.locator("#progress-percentage").textContent(),
      /^0%/,
    );
    console.log(
      "PASS manual seen/caught transitions, shared species status across forms, persistence, all progress filters, saved-search recall and distinct-species counts with empty/generation/type/favorite selections",
    );

    const exported = await downloadBackup(page);
    assert.deepEqual(exported.progress, expected);
    assert.equal(exported.version, 1);
    const receiver = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
      acceptDownloads: true,
    });
    await routeOffline(receiver);
    const oldProgress = [
      { id: 6, state: "seen" },
      { id: 7, state: "caught" },
    ];
    await receiver.addInitScript((entries) => {
      if (!localStorage.getItem("test.progress.seeded")) {
        localStorage.setItem(
          "pokedex.progress.v1",
          JSON.stringify({ version: 1, entries }),
        );
        localStorage.setItem("test.progress.seeded", "yes");
      }
    }, oldProgress);
    const recipient = await receiver.newPage();
    recipient.on("pageerror", (error) => errors.push(error.message));
    await recipient.goto(baseURL + "/preview-offline.html");
    await ready(recipient);
    await upload(recipient, exported);
    await previewReady(recipient);
    assert.match(
      await recipient.locator("#backup-summary").textContent(),
      /preservando capturas/,
    );
    assert.deepEqual(await stored(recipient), oldProgress);
    await recipient.locator("#backup-import").click();
    const merged = [
      { id: 1, state: "seen" },
      { id: 6, state: "caught" },
      { id: 7, state: "caught" },
      { id: 25, state: "caught" },
    ];
    assert.deepEqual(await stored(recipient), merged);
    await recipient.locator("#backup-undo").click();
    assert.deepEqual(await stored(recipient), oldProgress);
    await upload(recipient, exported);
    await previewReady(recipient);
    await recipient.locator("#progress-seen").click();
    await settled(recipient);
    await recipient.locator("#backup-import").click();
    assert.match(
      await recipient.locator("#backup-status").textContent(),
      /coleção mudou/,
    );
    await recipient.locator("#backup-import").click();
    assert.deepEqual(await stored(recipient), merged);
    await recipient.locator("#progress-caught").click();
    await recipient.locator("#backup-undo").click();
    assert.match(
      await recipient.locator("#backup-status").textContent(),
      /coleção mudou depois/,
    );
    const changed = await stored(recipient),
      legacy = { ...exported };
    delete legacy.progress;
    await upload(recipient, legacy);
    await recipient
      .locator('input[name="backup-mode"][value="replace"]')
      .check();
    await previewReady(recipient);
    assert.match(
      await recipient.locator("#backup-summary").textContent(),
      /não contém progresso/,
    );
    await recipient.locator("#backup-import").click();
    assert.deepEqual(await stored(recipient), changed);
    await upload(recipient, { ...exported, progress: [] });
    await previewReady(recipient);
    assert.match(
      await recipient.locator("#backup-summary").textContent(),
      /progresso será substituído/,
    );
    await recipient.locator("#backup-import").click();
    assert.deepEqual(await stored(recipient), []);
    await recipient.locator("#backup-undo").click();
    assert.deepEqual(await stored(recipient), changed);
    await upload(recipient, {
      ...exported,
      progress: [
        { id: 6, state: "seen" },
        { id: 6, state: "caught" },
      ],
    });
    await recipient.waitForFunction(() =>
      document
        .querySelector("#backup-status")
        .textContent.includes("progresso inválido"),
    );
    assert.equal(await recipient.locator("#backup-import").isDisabled(), true);
    assert.deepEqual(await stored(recipient), changed);
    console.log(
      "PASS real backup download/transfer, capture-preserving merge, stale preview and undo protection, legacy replacement preservation, explicit replacement/clear and invalid-file atomic rejection",
    );

    await page.locator("#clear-filters").click();
    await settled(page);
    await pick(page, 6);
    for (const theme of ["light", "dark"]) {
      await page.locator("#theme-select").selectOption(theme);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `${theme}: ${width}`,
        );
        assert.equal(await page.locator("#progress-caught").isVisible(), true);
      }
      await page
        .locator(".dex-progress-controls")
        .screenshot({
          path: `/tmp/pokedex-progress-controls-${theme}-desktop.png`,
        });
      await page
        .locator("#collection-progress-summary")
        .screenshot({
          path: `/tmp/pokedex-progress-summary-${theme}-desktop.png`,
        });
      await page.setViewportSize({ width: 375, height: 1100 });
      await page
        .locator(".dex-progress-controls")
        .screenshot({
          path: `/tmp/pokedex-progress-controls-${theme}-mobile.png`,
        });
      await page
        .locator("#collection-progress-summary")
        .screenshot({
          path: `/tmp/pokedex-progress-summary-${theme}-mobile.png`,
        });
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS progress controls, indicators and summary in both themes at 320–1440px without Internet",
    );

    const broken = await context.newPage();
    await broken.addInitScript(() =>
      localStorage.setItem(
        "pokedex.progress.v1",
        JSON.stringify({ version: 1, entries: [{ id: 6, state: "invalid" }] }),
      ),
    );
    await broken.goto(baseURL + "/preview-offline.html");
    await ready(broken);
    assert.equal(await broken.locator("#progress-notice").isVisible(), true);
    await broken.locator("#progress-seen").click();
    await settled(broken);
    assert.deepEqual(await stored(broken), [{ id: 1, state: "seen" }]);
    const blocked = await context.newPage();
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw Error("Blocked");
      };
      Storage.prototype.setItem = () => {
        throw Error("Blocked");
      };
    });
    await blocked.goto(baseURL + "/preview-offline.html");
    await ready(blocked);
    await pick(blocked, 25);
    await blocked.locator("#progress-caught").click();
    await settled(blocked);
    assert.match(
      await blocked.locator("#progress-notice").textContent(),
      /nesta sessão/,
    );
    assert.deepEqual((await downloadBackup(blocked)).progress, [
      { id: 25, state: "caught" },
    ]);
    console.log(
      "PASS corrupt progress recovery and real export of session captures when browser storage is blocked",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

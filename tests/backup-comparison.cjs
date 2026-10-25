const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const html = readFileSync(path.join(root, "preview-offline.html"), "utf8"),
  snapshot = JSON.parse(
    readFileSync(path.join(root, ".preview-data.json"), "utf8"),
  );
const source = {
  favorites: [
    { id: 25, name: "pikachu", speciesId: 25 },
    { id: 10034, name: "charizard-mega-x", speciesId: 6 },
  ],
  team: [
    { id: 1, name: "bulbasaur" },
    { id: 10034, name: "charizard-mega-x" },
  ],
  teams: [
    {
      id: "kanto",
      name: "Kanto",
      members: [
        { id: 1, name: "bulbasaur" },
        { id: 25, name: "pikachu" },
      ],
    },
    {
      id: "dragons",
      name: "Dragões",
      members: [
        { id: 10034, name: "charizard-mega-x" },
        { id: 149, name: "dragonite" },
      ],
    },
  ],
};
const existing = {
  favorites: [{ id: 7, name: "squirtle", speciesId: 7 }],
  team: [{ id: 7, name: "squirtle" }],
  teams: [
    { id: "kanto", name: "Kanto", members: [{ id: 7, name: "squirtle" }] },
  ],
};
const errors = [],
  outbound = [];
async function seed(context, state) {
  await context.addInitScript((state) => {
    if (!localStorage.getItem("test.seeded")) {
      localStorage.setItem(
        "pokedex.favorites.v1",
        JSON.stringify(state.favorites),
      );
      localStorage.setItem("pokedex.team.v1", JSON.stringify(state.team));
      localStorage.setItem(
        "pokedex.teams.v1",
        JSON.stringify({ version: 1, teams: state.teams }),
      );
      localStorage.setItem("pokedex.theme.v1", "dark");
      localStorage.setItem("test.seeded", "true");
    }
  }, state);
}
async function offline(context) {
  await context.route("**/*", (route) => {
    if (route.request().url() === baseURL + "/preview-offline.html")
      return route.continue();
    outbound.push(route.request().url());
    return route.abort();
  });
}
const state = (page) =>
  page.evaluate(() => ({
    favorites: JSON.parse(localStorage.getItem("pokedex.favorites.v1") || "[]"),
    team: JSON.parse(localStorage.getItem("pokedex.team.v1") || "[]"),
    teams: JSON.parse(
      localStorage.getItem("pokedex.teams.v1") || '{"teams":[]}',
    ).teams,
  }));
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
    () => !document.querySelector("#compare-add").disabled,
  );
}
async function upload(page, data, name = "backup.json") {
  await page.locator("#backup-file").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(typeof data === "string" ? data : JSON.stringify(data)),
  });
}
const previewReady = (page) =>
  page.waitForFunction(
    () => !document.querySelector("#backup-import").disabled,
  );
const compareReady = (page) =>
  page.waitForFunction(
    () => !document.querySelector("#comparison-matchups-table").hidden,
  );
async function clearCompare(page) {
  await page.locator("#compare-clear").click();
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
    const sender = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
    });
    await seed(sender, source);
    await offline(sender);
    const page = await sender.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL + "/preview-offline.html");
    await nameIs(page, 1);
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#backup-export").click();
    const download = await downloadPromise;
    assert.match(
      download.suggestedFilename(),
      /^pokedex-backup-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
    assert.equal(exported.format, "pokedex-backup");
    assert.equal(exported.version, 1);
    assert.deepEqual(
      {
        favorites: exported.favorites,
        team: exported.team,
        teams: exported.teams,
      },
      source,
    );
    assert.ok(!("theme" in exported));
    const receiverContext = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await seed(receiverContext, existing);
    await offline(receiverContext);
    const receiver = await receiverContext.newPage();
    receiver.on("pageerror", (error) => errors.push(error.message));
    await receiver.goto(baseURL + "/preview-offline.html");
    await nameIs(receiver, 1);
    await receiver.locator("#backup-file").setInputFiles(await download.path());
    await previewReady(receiver);
    assert.deepEqual(await state(receiver), existing);
    assert.match(
      await receiver.locator("#backup-summary").textContent(),
      /equipe atual será mantida/,
    );
    await receiver.locator("#backup-import").click();
    const merged = await state(receiver);
    assert.deepEqual(merged.team, existing.team);
    assert.deepEqual(
      merged.favorites.map((entry) => entry.id),
      [7, 25, 10034],
    );
    assert.deepEqual(
      merged.teams.map((team) => team.name),
      ["Kanto", "Kanto (importada)", "Dragões", "Equipe do backup"],
    );
    await receiver.locator("#backup-undo").click();
    assert.deepEqual(await state(receiver), existing);
    await upload(receiver, exported);
    await previewReady(receiver);
    await receiver
      .locator('input[name="backup-mode"][value="replace"]')
      .check();
    await previewReady(receiver);
    assert.match(
      await receiver.locator("#backup-summary").textContent(),
      /serão substituídos/,
    );
    await receiver.locator("#backup-import").click();
    assert.deepEqual(await state(receiver), source);
    await receiver.reload();
    await nameIs(receiver, 1);
    assert.deepEqual(await state(receiver), source);
    assert.equal(await receiver.locator("#favorite-count").textContent(), "2");
    assert.equal(await receiver.locator(".team-member").count(), 2);
    assert.equal(await receiver.locator("#theme-select").inputValue(), "dark");
    console.log(
      "PASS real JSON download, transfer to a separate browser, review-before-import, conflict-safe merge, undo, exact replacement and persisted form metadata",
    );

    for (const data of [
      "broken JSON",
      { ...exported, version: 99 },
      {
        ...exported,
        favorites: [
          { id: 25, name: "pikachu" },
          { id: 25, name: "pikachu" },
        ],
      },
    ]) {
      await upload(receiver, data);
      await receiver.waitForFunction(
        () =>
          !document
            .querySelector("#backup-status")
            .textContent.includes("Lendo o arquivo"),
      );
      assert.equal(await receiver.locator("#backup-import").isDisabled(), true);
      assert.deepEqual(await state(receiver), source);
    }
    await upload(receiver, " ".repeat(1024 * 1024 + 1));
    assert.match(
      await receiver.locator("#backup-status").textContent(),
      /até 1 MB/,
    );
    assert.deepEqual(await state(receiver), source);
    const extra = {
      format: "pokedex-backup",
      version: 1,
      exportedAt: "2026-10-23T12:00:00Z",
      favorites: [{ id: 133, name: "eevee", speciesId: 133 }],
      team: [{ id: 25, name: "pikachu" }],
      teams: [],
    };
    await upload(receiver, extra);
    await previewReady(receiver);
    await receiver.locator("#favorite").click();
    const changed = await state(receiver);
    await receiver.locator("#backup-import").click();
    assert.match(
      await receiver.locator("#backup-status").textContent(),
      /Sua coleção mudou/,
    );
    assert.deepEqual(await state(receiver), changed);
    await receiver.locator("#backup-import").click();
    assert.ok(
      (await state(receiver)).favorites.some((entry) => entry.id === 133),
    );
    await receiver.locator("#favorite").click();
    const afterEdit = await state(receiver);
    await receiver.locator("#backup-undo").click();
    assert.deepEqual(await state(receiver), afterEdit);
    assert.match(
      await receiver.locator("#backup-status").textContent(),
      /desfazer não foi aplicado/,
    );
    await receiverContext.close();
    console.log(
      "PASS invalid/duplicate/oversized backups preserve data; stale previews refresh and undo preserves later edits",
    );

    await search(page, 6);
    await page.locator("#compare-add").click();
    await search(page, 260);
    await page.locator("#compare-add").click();
    await compareReady(page);
    assert.equal(
      await page.locator("#comparison-matchups-table tbody tr").count(),
      18,
    );
    const cells = (type) =>
      page.locator(`#comparison-matchups-table [data-type="${type}"] td`);
    assert.deepEqual(
      await cells("rock").evaluateAll((cells) =>
        cells.map((cell) => Number(cell.dataset.multiplier)),
      ),
      [4, 0.5],
    );
    assert.deepEqual(
      await cells("electric").evaluateAll((cells) =>
        cells.map((cell) => Number(cell.dataset.multiplier)),
      ),
      [2, 0],
    );
    assert.deepEqual(
      await cells("grass").evaluateAll((cells) =>
        cells.map((cell) => Number(cell.dataset.multiplier)),
      ),
      [0.25, 4],
    );
    assert.equal(
      await page
        .locator('#comparison-matchups-table [data-type="ice"] .damage-lower')
        .count(),
      0,
    );
    assert.match(
      await page.locator("#comparison-profiles").textContent(),
      /solar powerOculta/,
    );
    assert.match(await cells("electric").nth(1).textContent(), /Imune/);
    await clearCompare(page);
    await search(page, 6);
    await page.locator("#compare-add").click();
    await search(page, 10034);
    await page.locator("#compare-add").click();
    await compareReady(page);
    assert.match(
      await page.locator("#comparison-profiles").textContent(),
      /tough claws/,
    );
    assert.deepEqual(
      await cells("rock").evaluateAll((cells) =>
        cells.map((cell) => Number(cell.dataset.multiplier)),
      ),
      [4, 2],
    );
    await upload(page, extra);
    await previewReady(page);
    for (const theme of ["light", "dark"]) {
      await page.locator("#theme-select").selectOption(theme);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${theme} overflow ${width}`,
        );
      }
    }
    await clearCompare(page);
    assert.equal(await page.locator("#comparison-details").isHidden(), true);
    assert.deepEqual(outbound, []);
    console.log(
      "PASS detailed abilities/hidden abilities, all 18 matchups, immunities, dual-type ×4/×0.25 and alternative forms in both themes at mobile/desktop widths with ZERO Internet requests",
    );
    await sender.close();

    const restricted = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
      acceptDownloads: true,
    });
    await restricted.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw Error("blocked");
      };
      Storage.prototype.setItem = () => {
        throw Error("blocked");
      };
    });
    await restricted.route("**/*", (route) => route.abort());
    const privatePage = await restricted.newPage();
    privatePage.on("pageerror", (error) => errors.push(error.message));
    await privatePage.goto("about:blank");
    await privatePage.setContent(html);
    await nameIs(privatePage, 1);
    await upload(privatePage, exported);
    await previewReady(privatePage);
    await privatePage.locator("#backup-import").click();
    assert.match(
      await privatePage.locator("#backup-status").textContent(),
      /nesta sessão/,
    );
    assert.equal(
      await privatePage.locator("#favorite-count").textContent(),
      "2",
    );
    assert.equal(await privatePage.locator(".team-member").count(), 2);
    const sessionDownloadPromise = privatePage.waitForEvent("download");
    await privatePage.locator("#backup-export").click();
    const sessionExport = JSON.parse(
      readFileSync(await (await sessionDownloadPromise).path(), "utf8"),
    );
    assert.deepEqual(sessionExport.favorites, source.favorites);
    assert.deepEqual(sessionExport.teams, source.teams);
    await privatePage.locator("#backup-undo").click();
    assert.equal(
      await privatePage.locator("#favorite-count").textContent(),
      "0",
    );
    assert.equal(await privatePage.locator(".team-member").count(), 0);
    await restricted.close();
    console.log(
      "PASS blocked storage still supports session import, a real export of session data and undo without network access",
    );

    let failIce = true,
      holdElectric = false;
    const releases = [];
    const online = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await online.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL) return route.continue();
      if (url.hostname !== "pokeapi.co") return route.abort();
      const key = url.pathname.replace("/api/v2/", "") + url.search;
      if (key === "type/ice" && failIce) return route.abort();
      if (key === "type/electric" && holdElectric)
        await new Promise((resolve) => releases.push(resolve));
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
    await search(onlinePage, 6);
    await onlinePage.locator("#compare-add").click();
    await search(onlinePage, 471);
    await onlinePage.locator("#compare-add").click();
    await onlinePage.locator("#comparison-matchups-retry").waitFor();
    assert.equal(
      await onlinePage.locator("#comparison-table tbody tr").count(),
      7,
    );
    assert.equal(await onlinePage.locator(".comparison-profile").count(), 2);
    failIce = false;
    await onlinePage.locator("#comparison-matchups-retry").click();
    await compareReady(onlinePage);
    await clearCompare(onlinePage);
    await search(onlinePage, 6);
    await onlinePage.locator("#compare-add").click();
    holdElectric = true;
    await search(onlinePage, 25);
    await onlinePage.locator("#compare-add").click();
    await clearCompare(onlinePage);
    await search(onlinePage, 6);
    await onlinePage.locator("#compare-add").click();
    await search(onlinePage, 260);
    await onlinePage.locator("#compare-add").click();
    await compareReady(onlinePage);
    holdElectric = false;
    releases.forEach((release) => release());
    assert.match(
      await onlinePage
        .locator("#comparison-matchups-table thead")
        .textContent(),
      /charizard.*swampert/,
    );
    assert.ok(
      !(
        await onlinePage
          .locator("#comparison-matchups-table thead")
          .textContent()
      ).includes("pikachu"),
    );
    await online.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS comparison failure/retry preserves profile/stats and cancelled earlier pair cannot overwrite the latest comparison",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

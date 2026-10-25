const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const snapshot = JSON.parse(
  readFileSync(path.join(__dirname, "../.preview-data.json"), "utf8"),
);
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
async function ready(page) {
  await page.waitForFunction(
    () =>
      document.querySelector("#pokemon-name").textContent === "bulbasaur" &&
      !document.querySelector("#field-note").disabled,
  );
}
async function pick(page, id) {
  await page.locator("#pokemon-search").fill(String(id));
  await page.locator(".search-button").click();
  await page.waitForFunction(
    (name) =>
      document.querySelector("#pokemon-name").textContent === name &&
      !document.querySelector("#field-note").disabled,
    snapshot.pokemon[id].name.replaceAll("-", " "),
  );
}
async function stored(page) {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("pokedex.notes.v1") || '{"entries":[]}')
        .entries,
  );
}
async function exportBackup(page) {
  const pending = page.waitForEvent("download");
  await page.locator("#backup-export").click();
  const download = await pending;
  return JSON.parse(readFileSync(await download.path(), "utf8"));
}
async function upload(page, data) {
  await page.locator("#backup-file").setInputFiles({
    name: "anotacoes.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
}
async function preview(page) {
  await page.waitForFunction(
    () => !document.querySelector("#backup-import").disabled,
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
  const outbound = [],
    errors = [];
  async function context(options = {}) {
    const ctx = await browser.newContext({
      serviceWorkers: "block",
      reducedMotion: "reduce",
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
      ...options,
    });
    await ctx.route("**/*", (route) => {
      if (route.request().url() === baseURL + "/preview-offline.html")
        return route.continue();
      outbound.push(route.request().url());
      return route.abort();
    });
    ctx.on("page", (page) =>
      page.on("pageerror", (error) => errors.push(error.message)),
    );
    return ctx;
  }
  try {
    const ctx = await context(),
      page = await ctx.newPage();
    await page.goto(baseURL + "/preview-offline.html");
    await ready(page);
    assert.equal(await page.locator("#field-note").inputValue(), "");
    const original = "Estratégia de campo\nEncontrado perto da floresta.";
    await page.locator("#field-note").fill(original);
    await page.locator("#field-note").evaluate((element) => {
      element.focus();
      element.setSelectionRange(0, 0);
    });
    await page.keyboard.type("Olá! ");
    await page.keyboard.press("/");
    const edited = "Olá! /" + original;
    assert.equal(await page.locator("#field-note").inputValue(), edited);
    assert.equal((await stored(page))[0].text, edited);
    assert.equal(
      await page.locator("#pokemon-name").textContent(),
      "bulbasaur",
    );
    await pick(page, 10034);
    await page.locator("#field-note").fill("Meu parceiro de fogo 🔥");
    assert.match(
      await page.locator("#field-note-context").textContent(),
      /#006/,
    );
    await pick(page, 6);
    assert.equal(
      await page.locator("#field-note").inputValue(),
      "Meu parceiro de fogo 🔥",
    );
    assert.equal((await stored(page)).length, 2);
    await page.reload();
    await ready(page);
    assert.equal(await page.locator("#field-note").inputValue(), edited);
    await page.locator(".field-notes-library summary").click();
    await page.locator("#field-notes-search").fill("estrategia");
    assert.equal(await page.locator("#field-notes-list li").count(), 1);
    await page.locator("#field-notes-search").fill("CHARIZARD");
    assert.equal(await page.locator("#field-notes-list li").count(), 1);
    await page.locator("#field-notes-search").fill("nada disso");
    assert.equal(await page.locator("#field-notes-list li").count(), 0);
    await page.locator("#field-notes-search").fill("");
    await page.locator('#field-notes-list [data-pokemon-id="6"]').click();
    await page.waitForFunction(
      () => document.querySelector("#pokemon-name").textContent === "charizard",
    );
    const literal =
      'Texto literal: <img src=x onerror="alert(1)">\n& uma estratégia.';
    await page.locator("#field-note").fill(literal);
    assert.match(
      await page.locator("#field-notes-list").textContent(),
      /<img src=x/,
    );
    assert.equal(await page.locator("#field-notes-list img").count(), 0);
    await page.locator("#field-note").fill("x".repeat(500));
    await page.keyboard.type("extra");
    assert.equal((await page.locator("#field-note").inputValue()).length, 500);
    await page.locator("#field-note").fill("Nota original");
    await page.locator("#field-note-delete").click();
    assert.equal(await page.locator("#field-note").inputValue(), "");
    await page.locator("#field-note").fill("Versão nova");
    await page.locator("#field-note-undo").click();
    assert.match(
      await page.locator("#field-note-status").textContent(),
      /nova versão foi preservada/,
    );
    assert.equal(await page.locator("#field-note").inputValue(), "Versão nova");
    await page.locator("#field-note-delete").click();
    await page.locator("#field-note-undo").click();
    assert.equal(await page.locator("#field-note").inputValue(), "Versão nova");
    await page
      .getByRole("button", {
        name: "Apagar anotação de bulbasaur",
        exact: true,
      })
      .click();
    assert.equal((await stored(page)).length, 1);
    await page.locator("#field-note-undo").click();
    assert.equal((await stored(page)).length, 2);
    console.log(
      "PASS automatic local saving, caret preservation, shared species notes across forms, reload, accent-insensitive text/name search, literal markup, 500-character boundary and conflict-safe delete/undo",
    );

    const exported = await exportBackup(page);
    assert.equal(exported.notes.length, 2);
    const receiver = await context();
    const previous = [
      { id: 6, name: "charizard", text: "Anotação atual" },
      { id: 7, name: "squirtle", text: "Tartaruga" },
    ];
    await receiver.addInitScript((entries) => {
      if (location.protocol === "about:") return;
      if (!localStorage.getItem("test.notes.seeded")) {
        localStorage.setItem(
          "pokedex.notes.v1",
          JSON.stringify({ version: 1, entries }),
        );
        localStorage.setItem("test.notes.seeded", "yes");
      }
    }, previous);
    const recipient = await receiver.newPage();
    await recipient.goto(baseURL + "/preview-offline.html");
    await ready(recipient);
    await upload(recipient, exported);
    await preview(recipient);
    assert.match(
      await recipient.locator("#backup-summary").textContent(),
      /1 nota diferente/,
    );
    assert.deepEqual(await stored(recipient), previous);
    await recipient.locator("#backup-import").click();
    assert.equal(
      (await stored(recipient)).find((entry) => entry.id === 6).text,
      "Anotação atual",
    );
    assert.equal((await stored(recipient)).length, 3);
    await recipient.locator("#backup-undo").click();
    assert.deepEqual(await stored(recipient), previous);
    await upload(recipient, exported);
    await preview(recipient);
    await recipient.locator("#field-note").fill("Editado durante a prévia");
    await recipient.locator("#backup-import").click();
    assert.match(
      await recipient.locator("#backup-status").textContent(),
      /coleção mudou/,
    );
    await recipient.locator("#backup-import").click();
    assert.equal(
      await recipient.locator("#field-note").inputValue(),
      "Editado durante a prévia",
    );
    await recipient.locator("#field-note").fill("Mudou depois");
    await recipient.locator("#backup-undo").click();
    assert.match(
      await recipient.locator("#backup-status").textContent(),
      /coleção mudou depois/,
    );
    const preserved = await stored(recipient),
      legacy = { ...exported };
    delete legacy.notes;
    await upload(recipient, legacy);
    await recipient
      .locator('input[name="backup-mode"][value="replace"]')
      .check();
    await preview(recipient);
    assert.match(
      await recipient.locator("#backup-summary").textContent(),
      /não contém anotações/,
    );
    await recipient.locator("#backup-import").click();
    assert.deepEqual(await stored(recipient), preserved);
    await upload(recipient, { ...exported, notes: [] });
    await preview(recipient);
    await recipient.locator("#backup-import").click();
    assert.deepEqual(await stored(recipient), []);
    await recipient.locator("#backup-undo").click();
    assert.deepEqual(await stored(recipient), preserved);
    await upload(recipient, {
      ...exported,
      notes: [exported.notes[0], exported.notes[0]],
    });
    await recipient.waitForFunction(() =>
      document
        .querySelector("#backup-status")
        .textContent.includes("Anotação inválida"),
    );
    assert.equal(await recipient.locator("#backup-import").isDisabled(), true);
    assert.deepEqual(await stored(recipient), preserved);
    console.log(
      "PASS real backup download/transfer, reviewed conflict-safe merging, legacy replacement preservation, explicit clearing/undo, invalid files and stale import/undo protection for notes edited later",
    );

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
      }
      await page
        .locator(".field-notes-section")
        .screenshot({ path: `/tmp/pokedex-notes-${theme}-desktop.png` });
      await page.setViewportSize({ width: 375, height: 1100 });
      await page
        .locator(".field-notes-section")
        .screenshot({ path: `/tmp/pokedex-notes-${theme}-mobile.png` });
    }
    const capacity = await context();
    await capacity.addInitScript(
      (entries) => {
        if (location.protocol === "about:") return;
        localStorage.setItem(
          "pokedex.notes.v1",
          JSON.stringify({
            version: 1,
            entries,
          }),
        );
      },
      Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: snapshot.pokemon[i + 1]?.name || `pokemon-${i + 1}`,
        text: `Nota ${i + 1}`,
      })),
    );
    const full = await capacity.newPage();
    await full.goto(baseURL + "/preview-offline.html");
    await ready(full);
    await pick(full, 150);
    assert.equal(
      await full.locator("#field-note").evaluate((element) => element.readOnly),
      true,
    );
    assert.equal(await full.locator("#field-note-limit").isVisible(), true);
    await full.locator(".field-notes-library summary").click();
    await full
      .getByRole("button", { name: "Apagar anotação de ivysaur", exact: true })
      .click();
    assert.equal(
      await full.locator("#field-note").evaluate((element) => element.readOnly),
      false,
    );
    await full.locator("#field-note").fill("Anotação de Mewtwo");
    assert.equal((await stored(full)).length, 100);
    await full.locator("#field-note-undo").click();
    assert.match(
      await full.locator("#field-note-status").textContent(),
      /Abra espaço/,
    );
    const unavailable = await context();
    await unavailable.addInitScript(() => {
      if (location.protocol === "about:") return;
      localStorage.setItem(
        "pokedex.notes.v1",
        JSON.stringify({
          version: 1,
          entries: [
            {
              id: 200,
              name: "misdreavus",
              text: "Esta nota continua legível sem os dados do Pokémon.",
            },
          ],
        }),
      );
    });
    const limited = await unavailable.newPage();
    await limited.goto(baseURL + "/preview-offline.html");
    await ready(limited);
    await limited.locator(".field-notes-library summary").click();
    assert.match(
      await limited.locator("#field-notes-list").textContent(),
      /continua legível/,
    );
    await limited.locator('.saved-note-open[data-pokemon-id="200"]').click();
    await limited.waitForFunction(() =>
      document.querySelector("#status").classList.contains("error"),
    );
    assert.equal((await stored(limited))[0].id, 200);
    assert.match(
      await limited.locator("#field-notes-list").textContent(),
      /continua legível/,
    );
    console.log(
      "PASS responsive editing/library in both themes at 320–1440px, bounded 100-species storage, space recovery and readable notes for unavailable offline species",
    );

    const broken = await context();
    await broken.addInitScript(() => {
      if (location.protocol === "about:") return;
      localStorage.setItem("pokedex.notes.v1", "{");
    });
    const corrupt = await broken.newPage();
    await corrupt.goto(baseURL + "/preview-offline.html");
    await ready(corrupt);
    assert.equal(
      await corrupt.locator("#field-notes-notice").isVisible(),
      true,
    );
    await corrupt.locator("#field-note").fill("Recuperada");
    assert.equal((await stored(corrupt))[0].text, "Recuperada");
    const blocked = await context();
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw Error("Blocked");
      };
      Storage.prototype.setItem = () => {
        throw Error("Blocked");
      };
    });
    const session = await blocked.newPage();
    await session.goto(baseURL + "/preview-offline.html");
    await ready(session);
    await session.locator("#field-note").fill("Anotação nesta sessão");
    assert.match(
      await session.locator("#field-notes-notice").textContent(),
      /nesta sessão/,
    );
    assert.deepEqual((await exportBackup(session)).notes, [
      { id: 1, name: "bulbasaur", text: "Anotação nesta sessão" },
    ]);
    assert.deepEqual(errors, []);
    assert.deepEqual(outbound, []);
    console.log(
      "PASS corrupt storage recovery and actual export of session notes with storage blocked and ZERO external requests",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

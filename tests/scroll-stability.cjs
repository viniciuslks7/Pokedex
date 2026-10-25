const assert = require("node:assert/strict");
const { existsSync, mkdirSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { typeResource } = require("./fixtures/type-chart.cjs");
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const output = path.resolve(__dirname, "../test-results");
const gif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

async function mockAPI(context, count) {
  const names = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: i === 0 ? "bulbasaur" : `pokemon-${i + 1}`,
    url: `https://pokeapi.co/api/v2/pokemon-species/${i + 1}/`,
  }));
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "raw.githubusercontent.com")
      return route.fulfill({ contentType: "image/gif", body: gif });
    if (url.origin === baseURL) return route.continue();
    assert.equal(url.hostname, "pokeapi.co", "unexpected external request");
    const resource = url.pathname.replace(/\/$/, "").replace("/api/v2/", "");
    const [kind, value] = resource.split("/");
    const id = Number(value) || 1;
    let data;
    if (kind === "pokemon-species" && !value) data = { count, results: names };
    else if (kind === "pokemon" && !value)
      data = {
        results: names.map((entry) => ({
          ...entry,
          url: entry.url.replace("pokemon-species", "pokemon"),
        })),
      };
    else if (kind === "type") data = typeResource(value);
    else if (kind === "pokemon")
      data = {
        id,
        name: names[id - 1]?.name || `pokemon-${id}`,
        species: names[id - 1],
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
        sprites: { front_default: `${baseURL}/test-sprites/${id}.gif` },
      };
    else if (kind === "pokemon-species")
      data = {
        ...names[id - 1],
        capture_rate: 45,
        evolution_chain: {
          url: `https://pokeapi.co/api/v2/evolution-chain/${id}/`,
        },
        varieties: [],
        flavor_text_entries: [],
        genera: [],
      };
    else if (kind === "evolution-chain")
      data = { chain: { species: names[id - 1], evolves_to: [] } };
    else throw new Error(`Unexpected API resource ${resource}`);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await context.route("**/test-sprites/*", (route) =>
    route.fulfill({ contentType: "image/gif", body: gif }),
  );
}

// Wait for several actual frames so CSS smooth scrolling cannot hide a late jump.
async function frames(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let remaining = 5;
        function next() {
          if (--remaining) requestAnimationFrame(next);
          else resolve();
        }
        requestAnimationFrame(next);
      }),
  );
}
async function position(page, selector) {
  return page.locator(selector).evaluate((el) => ({
    y: el.getBoundingClientRect().y,
    scroll: scrollY,
    focus: document.activeElement.id,
  }));
}
async function assertStationary(
  page,
  selector,
  before,
  label,
  sameScroll = true,
) {
  await frames(page);
  const after = await position(page, selector);
  assert.ok(
    Math.abs(after.y - before.y) < 3,
    `${label}: button moved ${after.y - before.y}px (${JSON.stringify({ before, after })})`,
  );
  if (sameScroll)
    assert.ok(
      Math.abs(after.scroll - before.scroll) < 3,
      `${label}: page scrolled unexpectedly`,
    );
}

(async () => {
  mkdirSync(output, { recursive: true });
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
    for (const [width, reducedMotion, count] of [
      [1440, "no-preference", 1025],
      [375, "no-preference", 25],
      [1440, "reduce", 25],
      [375, "reduce", 25],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion,
        hasTouch: width === 375,
        serviceWorkers: "block",
      });
      const label = `${width}px-${reducedMotion}`;
      const errors = [];
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await mockAPI(context, count);
        await page.goto(baseURL);
        await page.waitForFunction(
          () =>
            document
              .querySelector("#collection-results")
              .getAttribute("aria-busy") === "false",
        );
        assert.equal(await page.locator("#collection-list button").count(), 12);
        const next = page.locator("#collection-next");
        await next.evaluate((el) =>
          el.scrollIntoView({ block: "center", behavior: "instant" }),
        );
        await frames(page);
        const rect = await next.boundingBox();
        const point = {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        };
        const total = Math.ceil(count / 12);
        for (let number = 2; number <= total; number++) {
          const before = await position(page, "#collection-next");
          // Use the same physical coordinates; locator.click() could conceal
          // the bug by automatically scrolling the moved button into view.
          if (width === 375) await page.touchscreen.tap(point.x, point.y);
          else await page.mouse.click(point.x, point.y);
          assert.equal(
            await page.locator("#collection-page").textContent(),
            `Página ${number} de ${total}`,
          );
          await assertStationary(
            page,
            "#collection-next",
            before,
            `${label} page ${number}`,
            number < total,
          );
        }
        assert.equal(await next.isDisabled(), true);
        assert.equal(
          await page.locator("#collection-list button").count(),
          count % 12 || 12,
        );
        const previous = page.locator("#collection-previous");
        await previous.focus({ preventScroll: true });
        const before = await position(page, "#collection-previous");
        await page.keyboard.press("Enter");
        assert.equal(
          await page.locator("#collection-page").textContent(),
          `Página ${total - 1} de ${total}`,
        );
        await assertStationary(
          page,
          "#collection-previous",
          before,
          `${label} previous`,
          false,
        );
        assert.equal(
          await page.evaluate(() => document.activeElement.id),
          "collection-previous",
        );
        await next.focus({ preventScroll: true });
        const beforeSpace = await position(page, "#collection-next");
        await page.keyboard.press("Space");
        await assertStationary(
          page,
          "#collection-next",
          beforeSpace,
          `${label} space`,
          false,
        );
        assert.equal(
          await page.locator("#collection-page").textContent(),
          `Página ${total} de ${total}`,
        );
        // Choosing a Pokémon remains intentional navigation to its details.
        await page.locator("#collection-list button").first().click();
        await page.waitForFunction(
          () => document.activeElement.id === "pokemon-name",
        );
        await page.waitForFunction(() => {
          const card = document
            .querySelector("#pokemon-card")
            .getBoundingClientRect();
          const header = document
            .querySelector(".header")
            .getBoundingClientRect();
          return card.top >= header.bottom - 2 && card.top < innerHeight - 20;
        });
        assert.deepEqual(errors, []);
        console.log(
          `PASS ${label}: repeated pagination at fixed coordinates, last partial page, Enter/Space, retained focus and intentional Pokémon navigation`,
        );
      } catch (error) {
        await page.screenshot({
          path: path.join(output, `scroll-${label}.png`),
          fullPage: true,
        });
        await context.tracing.stop({
          path: path.join(output, `scroll-${label}.zip`),
        });
        throw error;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

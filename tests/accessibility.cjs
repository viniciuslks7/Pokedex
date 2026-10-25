// Automated WCAG checks complement the keyboard/touch navigation tests.
const assert = require("node:assert/strict");
const { existsSync, writeFileSync } = require("node:fs");
const { chromium } = require("playwright");
const axe = require("axe-core");
const baseURL = process.env.POKEDEX_URL || "http://127.0.0.1:8000";
const results = [];

async function audit(page, state) {
  const result = await page.evaluate(async () =>
    axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    }),
  );
  const violations = result.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    nodes: nodes.map(({ target, failureSummary }) => ({
      target,
      failureSummary,
    })),
  }));
  results.push({
    ...state,
    violations,
    incomplete: result.incomplete.map(({ id }) => id),
  });
  assert.deepEqual(violations, [], JSON.stringify({ ...state, violations }));
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
  try {
    for (const theme of ["light", "dark"]) {
      for (const width of [1440, 375]) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          serviceWorkers: "block",
          reducedMotion: "reduce",
        });
        try {
          await context.route("**/*", (route) => {
            if (route.request().url() === baseURL + "/preview-offline.html")
              return route.continue();
            outbound.push(route.request().url());
            return route.abort();
          });
          const page = await context.newPage();
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(baseURL + "/preview-offline.html");
          await page.waitForFunction(
            () =>
              document.querySelector("#pokemon-name").textContent === "bulbasaur" &&
              !document.querySelector("#section-dock").hidden,
          );
          await page.locator("#theme-select").selectOption(theme);
          await page.addScriptTag({ content: axe.source });
          await audit(page, { theme, width, state: "initial" });

          await page.locator("#section-menu-open").click();
          await audit(page, { theme, width, state: "menu" });
          await page.keyboard.press("Escape");

          await page.locator("#favorite").click();
          await page.locator("#team-add").click();
          await page.locator("#field-note").fill("Meu parceiro de viagem.");
          await page.locator(".field-notes-library").evaluate((el) => {
            el.open = true;
          });
          await page.locator(".advanced-filter-panel").evaluate((el) => {
            el.open = true;
          });
          await audit(page, { theme, width, state: "populated" });
          console.log(
            `PASS WCAG 2.1 A/AA automated checks: ${theme}, ${width}px, initial page, menu and populated controls`,
          );
        } finally {
          await context.close();
        }
      }
    }
    assert.deepEqual(
      outbound, [], "the offline audit must not request external data",
    );
    assert.deepEqual(
      errors, [], "the audited interactions must not throw page errors",
    );
    console.log(
      "PASS zero page errors and zero external requests; automated checks do not replace manual accessibility review",
    );
  } finally {
    writeFileSync(
      "/tmp/pokedex-accessibility-results.json", JSON.stringify(results, null, 2),
    );
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

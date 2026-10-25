// Export the application for viewers that can open only one HTML file.
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
let esbuild;
try {
  esbuild = require("esbuild");
} catch {
  console.error(
    "Instale esbuild conforme a seção “Prévia em arquivo único” do README.",
  );
  process.exit(1);
}
const root = path.resolve(__dirname, "..");
require("./update-offline-assets.cjs");
const mimeTypes = { ".svg": "image/svg+xml", ".png": "image/png" };
function inlineAsset(relativePath) {
  const file = path.resolve(root, relativePath);
  if (!file.startsWith(root + path.sep))
    throw new Error("Asset outside project");
  const mime = mimeTypes[path.extname(file)];
  if (!mime) throw new Error(`Unsupported asset: ${relativePath}`);
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}
(async () => {
  const offline = process.argv.includes("--offline");
  let bootstrap = "globalThis.__POKEDEX_SINGLE_FILE__=true;";
  let offlineNote = "";
  if (offline) {
    const snapshot = JSON.parse(
      readFileSync(path.join(root, ".preview-data.json"), "utf8"),
    );
    if (
      snapshot.version !== 1 ||
      !snapshot.ids?.length ||
      !snapshot.pokemon ||
      !snapshot.resources
    )
      throw new Error(
        "Gere os dados offline com scripts/cache-preview-data.cjs",
      );
    const savedDate = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date(snapshot.fetchedAt));
    bootstrap += `globalThis.__POKEDEX_OFFLINE_PREVIEW__=${JSON.stringify(snapshot).replace(/</g, "\\u003c")};`;
    offlineNote = `<aside class="offline-preview-note" role="note"><strong>Coleção offline · ${snapshot.ids.length} Pokémon${snapshot.formCount ? ` + ${snapshot.formCount} formas alternativas` : ""}</strong><span>Dados reais salvos em ${savedDate}. Busca, navegação e filtros usam esta coleção, sem conexão externa.</span></aside>`;
  }
  const result = await esbuild.build({
    entryPoints: [path.join(root, "js/script.js")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "none",
  });
  const css = readFileSync(path.join(root, "style.css"), "utf8").replace(
    /url\(["']?([^\s"')]+)["']?\)/g,
    (match, asset) => {
      if (/^(data:|https?:|#)/.test(asset)) return match;
      return `url("${inlineAsset(asset)}")`;
    },
  );
  let html = readFileSync(path.join(root, "index.html"), "utf8");
  const stylesheet = '<link rel="stylesheet" href="style.css" />';
  const entryScript = '<script type="module" src="js/script.js"></script>';
  const icon = 'href="favicons/favicon-16x16.png"';
  for (const marker of [stylesheet, entryScript, icon]) {
    if (!html.includes(marker))
      throw new Error(`HTML entry changed: ${marker}`);
  }
  html = html
    .replace(/\s*<link rel="manifest"[^>]*>/, "")
    .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, "")
    .replace(
      stylesheet,
      () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
    )
    .replace(entryScript, "")
    .replace(icon, () => `href="${inlineAsset("favicons/favicon-16x16.png")}"`)
    .replace("<main>", () => `<main>${offlineNote}`)
    .replace(
      "</body>",
      () =>
        `<script>${bootstrap}${result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>\n</body>`,
    );
  if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/i.test(html))
    throw new Error("External application files remain");
  const output = path.join(
    root,
    offline ? "preview-offline.html" : "preview.html",
  );
  writeFileSync(output, html);
  console.log(
    `Prévia atualizada: ${output} (${Buffer.byteLength(html)} bytes)`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

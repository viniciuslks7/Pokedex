// CI/browser entry point: build the public site, serve it locally and run
// deterministic Playwright suites without downloading PokéAPI preview data.
const http = require("node:http");
const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  publicRoot = path.join(root, "dist"),
  output = path.join(root, "test-results"),
  suites = ["browser", "exploration", "visual", "strategy", "scroll-stability"];
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
require("./build-site.cjs");
mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(
        new URL(request.url, "http://local").pathname,
      ),
      file = path.resolve(
        publicRoot,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
    if (!file.startsWith(publicRoot + path.sep))
      throw new Error("Invalid path");
    const content = readFileSync(file);
    response.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end();
  }
});

(async () => {
  const results = [];
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    for (const suite of suites) {
      const start = Date.now();
      let log = "";
      console.log(`\nRunning Playwright suite: ${suite}`);
      const child = spawn(process.execPath, [`tests/${suite}.cjs`], {
        cwd: root,
        env: { ...process.env, POKEDEX_URL: baseURL },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 180000,
      });
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (chunk) => {
          log += chunk.toString();
          process.stdout.write(chunk);
        });
      const result = await new Promise((resolve) => {
        child.once("error", (error) =>
          resolve({ code: 1, error: error.message }),
        );
        child.once("close", (code, signal) =>
          resolve({ code: code ?? 1, signal }),
        );
      });
      writeFileSync(path.join(output, `${suite}.log`), log);
      results.push({ suite, ...result, milliseconds: Date.now() - start });
      if (result.code !== 0) process.exitCode = 1;
    }
  } finally {
    writeFileSync(
      path.join(output, "browser-summary.json"),
      JSON.stringify(results, null, 2),
    );
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

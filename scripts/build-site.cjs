// Build only the public application, without previews, test data or local caches.
const {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  existsSync,
  lstatSync,
} = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, ".."),
  output = path.join(root, "dist");
if (existsSync(output) && lstatSync(output).isSymbolicLink())
  throw new Error("dist must be a generated directory, not a symbolic link.");

require("./update-offline-assets.cjs");
const source = readFileSync(path.join(root, "offline-assets.js"), "utf8"),
  manifest = JSON.parse(
    source.slice(source.indexOf("=") + 1).trim().replace(/;$/, ""),
  ),
  files = [...manifest.files, "sw.js", "offline-assets.js"];

// Validate the complete input before replacing a previous build.
for (const file of files) {
  const input = path.resolve(root, file);
  if (!input.startsWith(root + path.sep) || !lstatSync(input).isFile())
    throw new Error(`Invalid public application file: ${file}`);
}
rmSync(output, { recursive: true, force: true });
for (const file of files) {
  const destination = path.join(output, file);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(root, file), destination);
}
console.log(
  `Site ready in dist/: ${files.length} public files, revision ${manifest.version}.`,
);

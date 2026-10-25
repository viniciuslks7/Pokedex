// Keep the small suggestion collection tied to official data used by the preview.
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const snapshot = JSON.parse(
  readFileSync(path.join(root, ".preview-data.json"), "utf8"),
);
const candidates = snapshot.ids
  .filter((id) => id < 10000)
  .map((id) => {
    const pokemon = snapshot.pokemon[id];
    return {
      id,
      name: pokemon.name,
      types: pokemon.types.map((entry) => entry.type.name),
    };
  });
writeFileSync(
  path.join(root, "js/team-candidates.js"),
  `// Public PokéAPI data. Regenerate with scripts/update-team-candidates.cjs.\nexport const teamCandidates = ${JSON.stringify(candidates)};\n`,
);
console.log(`Team suggestions: ${candidates.length} Pokémon.`);

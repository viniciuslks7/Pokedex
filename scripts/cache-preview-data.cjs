// Download a small, explicit collection of public data for network-isolated previews.
// curl preserves the environment's proxy and CA trust; no verification is disabled.
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const run = promisify(execFile);
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".preview-cache");
mkdirSync(cacheDir, { recursive: true });
const api = "https://pokeapi.co/api/v2/";
const refresh = process.argv.includes("--refresh");
let oldestSource = Date.now();
const seeds = [
  1, 4, 7, 25, 94, 133, 143, 149, 150, 151, 197, 260, 448, 658, 700, 778, 1000,
  1025,
];
const idOf = (url) => Number(url.match(/\/(\d+)\/?$/)[1]);
async function bytes(url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !["pokeapi.co", "raw.githubusercontent.com"].includes(parsed.hostname)
  )
    throw Error("Unsupported public data host");
  const file = path.join(
    cacheDir,
    createHash("sha256").update(url).digest("hex"),
  );
  if (existsSync(file) && !refresh) {
    oldestSource = Math.min(oldestSource, statSync(file).mtimeMs);
    return readFileSync(file);
  }
  const { stdout } = await run(
    "curl",
    ["--fail", "--silent", "--show-error", "--max-time", "25", url],
    { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 },
  );
  writeFileSync(file, stdout);
  return stdout;
}
async function json(route) {
  return JSON.parse(
    (await bytes(route.startsWith("https:") ? route : api + route)).toString(),
  );
}
async function mapLimit(entries, action) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, entries.length) }, async () => {
      while (index < entries.length) {
        const next = entries[index++];
        await action(next);
      }
    }),
  );
}
function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([, value]) => value !== null && value !== false && value !== "",
        )
        .map(([key, value]) => [key, compact(value)]),
    );
  return value;
}
async function image(url) {
  if (!url) return null;
  const data = await bytes(url);
  if (
    !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("Invalid PNG asset");
  return `data:image/png;base64,${data.toString("base64")}`;
}
async function sound(url) {
  if (!url) return null;
  const data = await bytes(url);
  const ogg = data.subarray(0, 4).toString() === "OggS";
  const mp3 =
    data.subarray(0, 3).toString() === "ID3" ||
    (data[0] === 255 && (data[1] & 224) === 224 && (data[1] & 6) !== 0);
  if (!ogg && !mp3) throw Error("Unsupported audio asset");
  return `data:audio/${ogg ? "ogg" : "mpeg"};base64,${data.toString("base64")}`;
}
(async () => {
  const snapshot = {
    version: 1,
    fetchedAt: new Date().toISOString(),
    ids: [],
    pokemon: {},
    names: {},
    resources: {},
  };
  const ids = new Set(seeds),
    speciesData = new Map(),
    chains = new Map();
  console.log("Consultando famílias dos Pokémon selecionados…");
  await mapLimit(seeds, async (id) => {
    const species = await json(`pokemon-species/${id}`);
    speciesData.set(id, species);
    if (!species.evolution_chain?.url) return;
    const chain = await json(species.evolution_chain.url);
    chains.set(idOf(species.evolution_chain.url), chain);
    function walk(node) {
      ids.add(idOf(node.species.url));
      node.evolves_to.forEach(walk);
    }
    walk(chain.chain);
  });
  snapshot.ids = [...ids].sort((a, b) => a - b);
  console.log(
    `Incorporando ${snapshot.ids.length} Pokémon, imagens normais/shiny e sons reais…`,
  );
  await mapLimit(snapshot.ids, async (id) => {
    const [data, species] = await Promise.all([
      json(`pokemon/${id}`),
      speciesData.has(id) ? speciesData.get(id) : json(`pokemon-species/${id}`),
    ]);
    const [normal, shiny, cry] = await Promise.all([
      image(data.sprites.front_default),
      image(data.sprites.front_shiny),
      sound(data.cries?.latest || data.cries?.legacy),
    ]);
    snapshot.pokemon[id] = {
      id: data.id,
      name: data.name,
      is_default: data.is_default,
      species: data.species,
      types: data.types,
      abilities: data.abilities,
      height: data.height,
      weight: data.weight,
      stats: data.stats,
      sprites: { front_default: normal, front_shiny: shiny },
      cries: cry ? { latest: cry } : {},
    };
    snapshot.names[data.name] = id;
    snapshot.names[species.name] = id;
    snapshot.resources[`pokemon-species/${id}`] = {
      id: species.id,
      name: species.name,
      evolution_chain: species.evolution_chain,
      varieties: species.varieties,
      genera: species.genera.filter((entry) =>
        ["pt-BR", "pt", "en"].includes(entry.language.name),
      ),
      flavor_text_entries: species.flavor_text_entries.filter((entry) =>
        ["pt-BR", "pt", "en"].includes(entry.language.name),
      ),
      habitat: species.habitat,
      generation: species.generation,
      capture_rate: species.capture_rate,
      is_baby: species.is_baby,
      is_legendary: species.is_legendary,
      is_mythical: species.is_mythical,
    };
  });
  // Preserve species navigation while making each downloaded variety searchable.
  const variants = [
    ...new Map(
      snapshot.ids.flatMap((id) =>
        snapshot.resources[`pokemon-species/${id}`].varieties
          .filter((entry) => !entry.is_default)
          .map((entry) => [idOf(entry.pokemon.url), entry.pokemon]),
      ),
    ).values(),
  ];
  console.log(`Incorporando ${variants.length} formas alternativas reais…`);
  await mapLimit(variants, async ({ url }) => {
    const data = await json(url);
    const [normal, shiny, cry] = await Promise.all([
      image(data.sprites.front_default),
      image(data.sprites.front_shiny),
      sound(data.cries?.latest || data.cries?.legacy),
    ]);
    snapshot.pokemon[data.id] = {
      id: data.id,
      name: data.name,
      is_default: data.is_default,
      species: data.species,
      types: data.types,
      abilities: data.abilities,
      height: data.height,
      weight: data.weight,
      stats: data.stats,
      sprites: { front_default: normal, front_shiny: shiny },
      cries: cry ? { latest: cry } : {},
    };
    snapshot.names[data.name] = data.id;
  });
  snapshot.formCount = variants.length;
  snapshot.resources["pokemon?limit=100000"] = {
    count: Object.keys(snapshot.pokemon).length,
    results: Object.values(snapshot.pokemon).map((data) => ({
      name: data.name,
      url: `${api}pokemon/${data.id}/`,
    })),
  };
  for (const [id, chain] of chains)
    snapshot.resources[`evolution-chain/${id}`] = compact(chain);
  const catalog = snapshot.ids.map((id) => ({
    name: snapshot.pokemon[id].species.name,
    url: snapshot.pokemon[id].species.url,
  }));
  snapshot.resources["pokemon-species?limit=100000"] = {
    count: catalog.length,
    results: catalog,
  };
  snapshot.resources["pokemon-species?limit=1"] = {
    count: catalog.length,
    results: catalog.slice(0, 1),
  };
  const typeList = await json("type?limit=100");
  await mapLimit(
    typeList.results.filter(
      (type) => !["unknown", "shadow", "stellar"].includes(type.name),
    ),
    async ({ name, url }) => {
      const data = await json(url);
      snapshot.resources[`type/${name}`] = {
        name: data.name,
        damage_relations: data.damage_relations,
        pokemon: data.pokemon.filter(({ pokemon }) =>
          Boolean(snapshot.pokemon[idOf(pokemon.url)]),
        ),
      };
    },
  );
  const generations = await json("generation?limit=100");
  await mapLimit(generations.results, async ({ url }) => {
    const data = await json(url);
    snapshot.resources[`generation/${data.id}`] = {
      id: data.id,
      pokemon_species: data.pokemon_species.filter((species) =>
        ids.has(idOf(species.url)),
      ),
    };
  });
  const file = path.join(root, ".preview-data.json");
  snapshot.fetchedAt = new Date(oldestSource).toISOString();
  writeFileSync(file, JSON.stringify(snapshot));
  console.log(
    `Dados reais salvos: ${snapshot.ids.length} Pokémon, ${chains.size} famílias, ${Object.keys(snapshot.resources).length} recursos.`,
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

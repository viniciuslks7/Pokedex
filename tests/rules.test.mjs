import test from "node:test";
import assert from "node:assert/strict";
import { calculateDefensiveMatchups } from "../js/matchups.js";
import { validateNotes, mergeNotes } from "../js/field-notes.js";
import {
  validateAttackTypes,
  attackOptions,
  calculateAttackCoverage,
} from "../js/attack-coverage.js";
import { teamDefense, suggestPartners } from "../js/team-advisor.js";
import { teamCandidates } from "../js/team-candidates.js";
import {
  validateProgress,
  mergeProgress,
  matchesProgress,
  progressCounts,
} from "../js/dex-progress.js";
import { emptyAdvancedFilters } from "../js/advanced-filters.js";
import {
  readRecent,
  rememberPokemon,
  restoreRecent,
} from "../js/recent-pokemon.js";
import {
  validateCollectionFilters,
  readFilterPresets,
  filterPresetName,
} from "../js/filter-presets.js";
import {
  formatEvolutionCondition,
  evolutionOptions,
} from "../js/evolution-conditions.js";
import fixtures from "./fixtures/type-chart.cjs";
const { chart, typeResource } = fixtures;
test("Field notes preserve multiline and literal markup text and validate species, duplicate and character limits", () => {
  const entries = [
    {
      id: 6,
      name: "charizard",
      text: "Linha 1\n<img src=x onerror=alert(1)>\nEstratégia 🔥",
    },
  ];
  assert.deepEqual(validateNotes(entries), entries);
  assert.notEqual(validateNotes(entries)[0], entries[0]);
  for (const invalid of [
    null,
    [{ ...entries[0], id: 10034 }],
    [{ ...entries[0], text: "  " }],
    [{ ...entries[0], text: "x".repeat(501) }],
    [{ ...entries[0], name: "<script>" }],
    [...entries, entries[0]],
    Array.from({ length: 101 }, (_, i) => ({
      id: i + 1,
      name: "pokemon",
      text: "Nota",
    })),
  ])
    assert.throws(() => validateNotes(invalid));
});
test("Field-note merge keeps existing conflicting text, adds missing species and is idempotent", () => {
  const current = [{ id: 6, name: "charizard", text: "Minha estratégia" }];
  const incoming = [
    { id: 6, name: "charizard", text: "Outra estratégia" },
    { id: 25, name: "pikachu", text: "Meu parceiro" },
  ];
  const result = mergeNotes(current, incoming);
  assert.deepEqual(result.conflicts, [6]);
  assert.equal(result.entries[0].text, "Minha estratégia");
  assert.equal(result.entries[1].id, 25);
  assert.deepEqual(
    mergeNotes(result.entries, incoming).entries,
    result.entries,
  );
  assert.equal(current.length, 1);
  assert.equal(incoming[0].text, "Outra estratégia");
});
test("Attack choices allow up to four distinct known types and never mutate the input", () => {
  const allowed = Object.keys(chart),
    choices = ["fire", "water", "grass", "rock"];
  assert.deepEqual(validateAttackTypes(choices, allowed), choices);
  assert.notEqual(validateAttackTypes(choices, allowed), choices);
  for (const invalid of [
    null,
    "fire",
    ["fire", "fire"],
    ["stellar"],
    [...choices, "ice"],
  ])
    assert.throws(() => validateAttackTypes(invalid, allowed));
});
test("Attack coverage chooses the strongest individual attack, preserves ties and never multiplies different attacks", () => {
  const resources = new Map(
    Object.keys(chart).map((type) => [type, typeResource(type)]),
  );
  const rows = calculateAttackCoverage(
    ["fire", "ice"],
    resources,
    Object.keys(chart),
  );
  assert.equal(rows.length, 18);
  const grass = rows.find((row) => row.type === "grass"),
    water = rows.find((row) => row.type === "water");
  assert.equal(grass.best, 2);
  assert.deepEqual(grass.bestTypes, ["fire", "ice"]);
  assert.equal(water.best, 0.5);
  assert.equal(
    rows.filter((row) => row.best > 1).length +
      rows.filter((row) => row.best === 1).length +
      rows.filter((row) => row.best > 0 && row.best < 1).length +
      rows.filter((row) => row.best === 0).length,
    18,
  );
  assert.deepEqual(
    calculateAttackCoverage([], resources, Object.keys(chart)),
    [],
  );
});
test("Attack options honor dual-type ×4, ×0.25 and immunity rather than adding attack types to the defender", () => {
  const resources = new Map(
    Object.keys(chart).map((type) => [type, typeResource(type)]),
  );
  const charizard = attackOptions(
    ["rock", "grass", "ground"],
    ["fire", "flying"],
    resources,
  );
  assert.deepEqual(
    charizard.values.map((value) => value.multiplier),
    [4, 0.25, 0],
  );
  assert.equal(charizard.best, 4);
  assert.deepEqual(charizard.bestTypes, ["rock"]);
  const swampert = attackOptions(
    ["electric", "grass"],
    ["water", "ground"],
    resources,
  );
  assert.deepEqual(
    swampert.values.map((value) => value.multiplier),
    [0, 4],
  );
});
test("Coverage identifies complete immunity and improves only when another attack can hit", () => {
  const resources = new Map(
    Object.keys(chart).map((type) => [type, typeResource(type)]),
  );
  assert.equal(
    attackOptions(["normal", "fighting"], ["ghost"], resources).best,
    0,
  );
  assert.equal(
    attackOptions(["normal", "fighting", "dark"], ["ghost"], resources).best,
    2,
  );
  assert.deepEqual(attackOptions([], ["ghost"], resources), {
    values: [],
    best: null,
    bestTypes: [],
  });
});
test("Coverage rejects missing, incomplete and repeated defensive data without inventing neutral results", () => {
  const resources = new Map(
    Object.keys(chart).map((type) => [type, typeResource(type)]),
  );
  assert.throws(() => attackOptions(["fire"], [], resources));
  assert.throws(() => attackOptions(["fire"], ["grass", "grass"], resources));
  assert.throws(() => attackOptions(["fire"], ["unknown"], resources));
  const missing = new Map(resources);
  missing.delete("grass");
  assert.throws(() =>
    calculateAttackCoverage(["fire"], missing, Object.keys(chart)),
  );
  const incomplete = new Map(resources);
  incomplete.set("grass", { damage_relations: {} });
  assert.throws(() =>
    calculateAttackCoverage(["fire"], incomplete, Object.keys(chart)),
  );
});
test("Recent history recovers valid unique entries, caps storage and preserves the paused preference", () => {
  const entries = Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    speciesId: i + 1,
    name: `pokemon-${i + 1}`,
  }));
  const result = readRecent(
    JSON.stringify({
      version: 1,
      enabled: false,
      items: [null, entries[0], entries[0], ...entries.slice(1)],
    }),
  );
  assert.equal(result.enabled, false);
  assert.equal(result.recovered, true);
  assert.equal(result.items.length, 12);
  assert.deepEqual(
    result.items.map((item) => item.id),
    Array.from({ length: 12 }, (_, i) => i + 1),
  );
  for (const text of [
    "{",
    "[]",
    JSON.stringify({ version: 2, enabled: true, items: [] }),
  ])
    assert.throws(() => readRecent(text));
});
test("Reopening a form moves it to the front and undo preserves newer visits without mutating the saved history", () => {
  const form = { id: 10104, speciesId: 38, name: "ninetales-alola" },
    pika = { id: 25, speciesId: 25, name: "pikachu" };
  const original = [pika, form],
    recent = rememberPokemon(original, form);
  assert.deepEqual(recent, [form, pika]);
  assert.deepEqual(original, [pika, form]);
  const restored = restoreRecent(
    [{ id: 6, speciesId: 6, name: "charizard" }, pika],
    original,
  );
  assert.deepEqual(
    restored.map((item) => item.id),
    [6, 25, 10104],
  );
  assert.equal(restored[2].speciesId, 38);
});
test("Saved filters retain zero ranges and reject invalid types, generations and numeric limits", () => {
  const valid = {
    type: "water",
    generation: "3",
    onlyFavorites: true,
    advanced: {
      ...emptyAdvancedFilters(),
      stat: "speed",
      min: 0,
      max: 0,
      sort: "stat-desc",
    },
  };
  assert.deepEqual(validateCollectionFilters(valid), {
    ...valid,
    progress: "",
  });
  const copied = validateCollectionFilters(valid);
  copied.advanced.min = 1;
  assert.equal(valid.advanced.min, 0);
  for (const change of [
    { type: "unknown" },
    { generation: "10" },
    { onlyFavorites: "true" },
    { advanced: { ...valid.advanced, min: -1 } },
    { advanced: { ...valid.advanced, max: 256 } },
    { advanced: { ...valid.advanced, min: 1 } },
    { advanced: { ...valid.advanced, habitat: "10" } },
    { advanced: { ...valid.advanced, stat: "constructor" } },
  ])
    assert.throws(() => validateCollectionFilters({ ...valid, ...change }));
});
test("Saved filter recovery rejects duplicate names/IDs and broken filters while retaining independent valid combinations", () => {
  const filters = {
    type: "",
    generation: "",
    onlyFavorites: false,
    advanced: emptyAdvancedFilters(),
  };
  const entry = { id: "first", name: "Kanto", filters };
  const data = {
    version: 1,
    presets: [
      entry,
      { ...entry, id: "second", name: " kanto " },
      { ...entry, name: "Other" },
      { id: "bad", name: "Broken", filters: {} },
      { ...entry, id: "third", name: "Minha busca" },
    ],
  };
  const result = readFilterPresets(JSON.stringify(data));
  assert.equal(result.recovered, true);
  assert.deepEqual(
    result.presets.map((item) => item.id),
    ["first", "third"],
  );
  assert.throws(() => readFilterPresets("{}"));
  assert.throws(() => readFilterPresets("{"));
});
test("Saved filter storage is bounded and names normalize whitespace and compatibility characters", () => {
  assert.equal(filterPresetName("  Ａgua \n e   amigos  "), "Agua e amigos");
  assert.throws(() => filterPresetName(" "));
  assert.throws(() => filterPresetName("x".repeat(41)));
  const filters = {
    type: "",
    generation: "",
    onlyFavorites: false,
    advanced: emptyAdvancedFilters(),
  };
  const data = {
    version: 1,
    presets: Array.from({ length: 10 }, (_, i) => ({
      id: `preset-${i}`,
      name: `Busca ${i}`,
      filters,
    })),
  };
  assert.equal(readFilterPresets(JSON.stringify(data)).presets.length, 8);
  assert.equal(readFilterPresets(JSON.stringify(data)).recovered, true);
});
const advisorTypes = Object.keys(chart);
const advisorResources = new Map(
  advisorTypes.map((type) => [type, typeResource(type)]),
);
const advisorMember = (id, names, speciesId = id) => ({
  id,
  name: `pokemon-${id}`,
  species: { url: `https://pokeapi.co/api/v2/pokemon-species/${speciesId}/` },
  types: names.map((name) => ({ type: { name } })),
});

test("Team defense preserves ×4, ×0.25 and immunities for every member", () => {
  const [charizard, swampert] = teamDefense(
    [
      advisorMember(6, ["fire", "flying"]),
      advisorMember(260, ["water", "ground"]),
    ],
    advisorResources,
    advisorTypes,
  );
  const value = (member, type) =>
    member.values.find((entry) => entry.type === type).multiplier;
  assert.equal(value(charizard, "rock"), 4);
  assert.equal(value(charizard, "grass"), 0.25);
  assert.equal(value(charizard, "ground"), 0);
  assert.equal(value(swampert, "electric"), 0);
  assert.equal(value(swampert, "grass"), 4);
});
test("Partner suggestions explain actual coverage and risks and never suggest the same species", () => {
  const members = [
    advisorMember(25, ["electric"]),
    advisorMember(10100, ["electric", "psychic"], 26),
  ];
  const results = suggestPartners(
    members,
    teamCandidates,
    advisorResources,
    advisorTypes,
  );
  assert.ok(results.length > 0 && results.length <= 3);
  assert.ok(results.every((result) => ![25, 26].includes(result.id)));
  assert.ok(
    results.some((result) =>
      result.helped.some((entry) => entry.type === "ground"),
    ),
  );
  assert.equal(
    new Set(results.map((result) => [...result.types].sort().join("/"))).size,
    results.length,
  );
  for (const result of results) {
    const matchups = calculateDefensiveMatchups(
      result.types.map(typeResource),
      advisorTypes,
    );
    for (const entry of result.helped)
      assert.ok(
        matchups.find((value) => value.type === entry.type).multiplier < 1,
      );
    for (const entry of result.risks)
      assert.ok(
        matchups.find((value) => value.type === entry.type).multiplier > 1,
      );
  }
  assert.deepEqual(
    members.map((member) => member.id),
    [25, 10100],
  );
});
test("An uncovered shared threat outweighs an already covered threat", () => {
  const members = [
    advisorMember(1, ["electric"]),
    advisorMember(2, ["electric"]),
    advisorMember(3, ["fire", "flying"]),
  ];
  const candidates = [
    { id: 10, name: "flying", types: ["flying"] },
    { id: 11, name: "ground", types: ["ground"] },
  ];
  const results = suggestPartners(
    members,
    candidates,
    advisorResources,
    advisorTypes,
  );
  assert.equal(results[0].id, 11);
});
test("Suggestions handle empty teams and missing type data without inventing neutral damage", () => {
  assert.deepEqual(
    suggestPartners([], teamCandidates, advisorResources, advisorTypes),
    [],
  );
  assert.throws(() =>
    teamDefense(
      [advisorMember(6, ["fire", "flying"])],
      new Map(),
      advisorTypes,
    ),
  );
  assert.throws(() =>
    suggestPartners(
      [advisorMember(25, ["electric"])],
      teamCandidates,
      new Map([["electric", typeResource("electric")]]),
      advisorTypes,
    ),
  );
});
test("Bundled suggestion types match official preview data", async () => {
  const { readFile } = await import("node:fs/promises");
  const snapshot = JSON.parse(
    await readFile(new URL("../.preview-data.json", import.meta.url), "utf8"),
  );
  assert.equal(teamCandidates.length, 43);
  for (const candidate of teamCandidates) {
    const pokemon = snapshot.pokemon[candidate.id];
    assert.equal(candidate.name, pokemon.name);
    assert.deepEqual(
      candidate.types,
      pokemon.types.map((entry) => entry.type.name),
    );
  }
});
const matchup = (...names) =>
  Object.fromEntries(
    calculateDefensiveMatchups(names.map(typeResource), Object.keys(chart)).map(
      ({ type, multiplier }) => [type, multiplier],
    ),
  );

test("Fire/Flying: Rock ×4, Grass ×0.25, Ground immune and Ice neutral", () => {
  const values = matchup("fire", "flying");
  assert.equal(values.rock, 4);
  assert.equal(values.grass, 0.25);
  assert.equal(values.ground, 0);
  assert.equal(values.ice, 1);
  assert.equal(values.electric, 2);
});
test("Water/Ground: Grass ×4 and Electric immunity overrides weakness", () => {
  const values = matchup("water", "ground");
  assert.equal(values.grass, 4);
  assert.equal(values.electric, 0);
  assert.equal(values.ice, 1);
});
test("Grass/Poison: weaknesses cancel and shared resistances multiply", () => {
  const values = matchup("grass", "poison");
  assert.equal(values.bug, 1);
  assert.equal(values.ground, 1);
  assert.equal(values.poison, 1);
  assert.equal(values.grass, 0.25);
  assert.equal(values.psychic, 2);
  assert.equal(values.fairy, 0.5);
});
test("Single-type Normal and Ghost immunities use incoming damage relations", () => {
  assert.equal(matchup("normal").ghost, 0);
  assert.equal(matchup("normal").fighting, 2);
  assert.equal(matchup("ghost").normal, 0);
  assert.equal(matchup("ghost").fighting, 0);
});
test("All type pairs are order-independent and use only valid multipliers", () => {
  for (const first of Object.keys(chart))
    for (const second of Object.keys(chart)) {
      const values = matchup(first, second);
      assert.deepEqual(values, matchup(second, first));
      for (const value of Object.values(values))
        assert.ok([0, 0.25, 0.5, 1, 2, 4].includes(value));
    }
});
test("Incomplete type data is rejected rather than presented as neutral", () => {
  assert.throws(() => calculateDefensiveMatchups([], ["normal"]));
  assert.throws(() => calculateDefensiveMatchups([{}], ["normal"]));
  assert.throws(() =>
    calculateDefensiveMatchups([{ damage_relations: {} }], ["normal"]),
  );
});
test("Level, friendship and time conditions remain simultaneous requirements", () => {
  const text = formatEvolutionCondition({
    trigger: { name: "level-up" },
    min_level: 25,
    min_happiness: 160,
    time_of_day: "night",
  });
  assert.match(text, /Nível 25/);
  assert.match(text, /Amizade de pelo menos 160/);
  assert.match(text, /Durante a noite/);
  assert.ok(!text.includes(" ou Durante"));
});
test("Item and held-item trades are distinct and translated", () => {
  assert.equal(
    formatEvolutionCondition({
      trigger: { name: "use-item" },
      item: { name: "water-stone" },
    }),
    "Usar Pedra de Água",
  );
  const trade = formatEvolutionCondition({
    trigger: { name: "trade" },
    held_item: { name: "metal-coat" },
    trade_species: { name: "shelmet" },
  });
  assert.match(trade, /Trocar com outro treinador/);
  assert.match(trade, /Segurando Revestimento Metálico/);
  assert.match(trade, /Trocar por Shelmet/);
});
test("Alternative evolution methods stay separate and duplicates are removed", () => {
  const a = { trigger: { name: "use-item" }, item: { name: "leaf-stone" } };
  const b = {
    trigger: { name: "level-up" },
    location: { name: "eterna-forest" },
  };
  const result = evolutionOptions([a, b, a]);
  assert.equal(result.primary.length, 2);
  assert.equal(result.alternatives.length, 0);
  assert.equal(result.primary[0].text, "Usar Pedra de Folha");
  assert.match(result.primary[1].text, /Eterna Forest/);
});
test("Default and historical game-specific conditions are not mixed", () => {
  const result = evolutionOptions(
    [
      {
        is_default: false,
        version_group: { name: "x-y" },
        trigger: { name: "level-up" },
        min_affection: 2,
        known_move_type: { name: "fairy" },
      },
      {
        is_default: true,
        version_group: { name: "sword-shield" },
        trigger: { name: "level-up" },
        min_happiness: 160,
        known_move_type: { name: "fairy" },
      },
    ],
    { fairy: "Fada" },
  );
  assert.equal(result.primary.length, 1);
  assert.equal(result.primary[0].game, "Sword / Shield");
  assert.match(result.primary[0].text, /Amizade/);
  assert.equal(result.alternatives[0].game, "X / Y");
  assert.match(result.alternatives[0].text, /Afeição/);
  assert.match(result.primary[0].text, /tipo Fada/);
});
test("Zero-valued Attack/Defense equality and gender constraints are preserved", () => {
  const text = formatEvolutionCondition({
    trigger: { name: "level-up" },
    relative_physical_stats: 0,
    gender: 1,
  });
  assert.match(text, /Ataque igual à Defesa/);
  assert.match(text, /Somente fêmeas/);
});
test("Modern move counts, steps, damage, forms and multiplayer requirements are shown", () => {
  const text = formatEvolutionCondition(
    {
      trigger: { name: "agile-style-move" },
      used_move: { name: "psyshield-bash" },
      min_move_count: 20,
      min_steps: 1000,
      min_damage_taken: 49,
      needs_multiplayer: true,
      required_pokemon_form: { name: "yamask-galar" },
      evolved_pokemon_form: { name: "runerigus" },
      region: { name: "galar" },
      allowed_natures: [{ name: "adamant" }],
    },
    {},
    { parentName: "yamask", childName: "runerigus" },
  );
  for (const fragment of [
    "estilo ágil",
    "20 vezes",
    "1000 passos",
    "49 pontos de dano",
    "multijogador",
    "Yamask Galar",
    "Galar",
    "Adamant",
  ])
    assert.ok(text.includes(fragment), fragment);
  assert.ok(!text.includes("Forma resultante"));
});
test("Rain, orientation, party member, move and stat requirements are not dropped", () => {
  const text = formatEvolutionCondition(
    {
      trigger: { name: "level-up" },
      needs_overworld_rain: true,
      turn_upside_down: true,
      party_species: { name: "remoraid" },
      party_type: { name: "dark" },
      known_move: { name: "ancient-power" },
      relative_physical_stats: -1,
    },
    { dark: "Sombrio" },
  );
  for (const fragment of [
    "chuva",
    "cabeça para baixo",
    "Remoraid",
    "Sombrio",
    "Ancient Power",
    "Ataque menor",
  ])
    assert.ok(text.includes(fragment), fragment);
});
test("Absent and special rules never invent a level requirement or execute expressions", () => {
  assert.match(evolutionOptions([]).primary[0].text, /não informada/);
  assert.match(evolutionOptions(undefined).primary[0].text, /não informada/);
  const text = formatEvolutionCondition({
    trigger: { name: "unrecognized-method" },
    condition_expression: "throw new Error()",
  });
  assert.match(text, /Método especial/);
  assert.match(text, /condições especiais adicionais/);
  assert.ok(!text.includes("throw"));
});

// Team and comparison calculations must keep immunities and missing values intact.
const { comparisonStats, summarizeTeamWeaknesses } = await import(
  "../js/trainer.js"
);
const { preferredDescription } = await import("../js/species.js");
const { findSuggestions, normalizeSearch } = await import(
  "../js/suggestions.js"
);
const { speciesNumber, varietyLabel } = await import("../js/forms.js");
const { parseSharedTeam, teamCode, shareTeamValue } = await import(
  "../js/team-sharing.js"
);
const { catalogFacts } = await import("../js/catalog-facts.js");
const { supportsOfflineApp } = await import("../js/offline-app.js");
test("Installable offline mode is limited to secure web pages with service workers, never single-file previews", () => {
  const context = {
    singleFile: false,
    protocol: "https:",
    secure: true,
    serviceWorker: true,
  };
  assert.equal(supportsOfflineApp(context), true);
  assert.equal(supportsOfflineApp({ ...context, protocol: "http:" }), true);
  for (const invalid of [
    { singleFile: true },
    { protocol: "file:" },
    { secure: false },
    { serviceWorker: false },
  ])
    assert.equal(supportsOfflineApp({ ...context, ...invalid }), false);
});
const { parseBackup, exportBackup, planBackupImport, MAX_BACKUP_BYTES } =
  await import("../js/backup.js");
const { compareDefenses } = await import("../js/comparison.js");

test("Backups round trip notes and preview conflict-safe merges before applying data", () => {
  const current = {
    favorites: [],
    team: [],
    teams: [],
    notes: [{ id: 6, name: "charizard", text: "Atual" }],
  };
  const backup = exportBackup({
    favorites: [],
    team: [],
    teams: [],
    notes: [
      { id: 6, name: "charizard", text: "Importada" },
      { id: 25, name: "pikachu", text: "Nova" },
    ],
  });
  assert.deepEqual(parseBackup(JSON.stringify(backup)).notes, backup.notes);
  const plan = planBackupImport(current, backup);
  assert.deepEqual(plan.noteConflicts, [6]);
  assert.equal(plan.state.notes[0].text, "Atual");
  assert.equal(plan.state.notes.length, 2);
  assert.deepEqual(planBackupImport(plan.state, backup).state, plan.state);
});
test("Legacy backups preserve notes in either mode and included replacement or empty notes are explicit", () => {
  const current = {
    favorites: [],
    team: [],
    teams: [],
    notes: [{ id: 6, name: "charizard", text: "Preservar" }],
  };
  const legacy = exportBackup({ favorites: [], team: [], teams: [] });
  for (const mode of ["merge", "replace"])
    assert.deepEqual(
      planBackupImport(current, legacy, mode).state.notes,
      current.notes,
    );
  const empty = exportBackup({ favorites: [], team: [], teams: [], notes: [] });
  assert.deepEqual(planBackupImport(current, empty, "replace").state.notes, []);
  const replacement = exportBackup({
    favorites: [],
    team: [],
    teams: [],
    notes: [{ id: 25, name: "pikachu", text: "Substituir" }],
  });
  assert.deepEqual(
    planBackupImport(current, replacement, "replace").state.notes,
    replacement.notes,
  );
});
test("Invalid notes reject the entire backup and merging above capacity never truncates current notes", () => {
  const current = {
    favorites: [],
    team: [],
    teams: [],
    notes: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: "pokemon",
      text: `Nota ${i}`,
    })),
  };
  const before = JSON.stringify(current);
  const backup = exportBackup({
    favorites: [],
    team: [],
    teams: [],
    notes: [{ id: 150, name: "mewtwo", text: "Nova" }],
  });
  assert.throws(() => planBackupImport(current, backup));
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, notes: null })));
  assert.throws(() =>
    parseBackup(
      JSON.stringify({ ...backup, notes: [...backup.notes, backup.notes[0]] }),
    ),
  );
  assert.equal(JSON.stringify(current), before);
});
test("A maximum-size valid note collection remains exportable within the one-megabyte backup limit", () => {
  const state = {
    favorites: Array.from({ length: 3000 }, (_, i) => ({
      id: Number.MAX_SAFE_INTEGER - i,
      speciesId: Number.MAX_SAFE_INTEGER - i,
      name: "x".repeat(100),
    })),
    team: [],
    teams: [],
    notes: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: "x".repeat(100),
      text: "\u0001".repeat(500),
    })),
  };
  const json = JSON.stringify(exportBackup(state), null, 2);
  assert.ok(new TextEncoder().encode(json).byteLength <= MAX_BACKUP_BYTES);
  assert.equal(parseBackup(json).notes.length, 100);
});

test("Progress rejects duplicate species, alternative-form IDs, unknown states and oversized data", () => {
  const valid = [
    { id: 6, state: "caught" },
    { id: 25, state: "seen" },
  ];
  assert.deepEqual(validateProgress(valid), valid);
  assert.notEqual(validateProgress(valid)[0], valid[0]);
  for (const entries of [
    null,
    [{ id: 0, state: "seen" }],
    [{ id: 10034, state: "caught" }],
    [{ id: 6, state: "unknown" }],
    [
      { id: 6, state: "seen" },
      { id: 6, state: "caught" },
    ],
    Array.from({ length: 3001 }, (_, i) => ({ id: i + 1, state: "seen" })),
  ])
    assert.throws(() => validateProgress(entries));
});
test("Progress counts species once across forms and keeps unseen and uncaught distinct", () => {
  const records = new Map([
    [6, "seen"],
    [25, "caught"],
  ]);
  const entries = [
    { id: 6 },
    { id: 10034, speciesId: 6 },
    { id: 25 },
    { id: 10100, speciesId: 26 },
  ];
  assert.deepEqual(progressCounts(entries, records), {
    total: 3,
    seen: 2,
    caught: 1,
  });
  assert.deepEqual(
    entries
      .filter((entry) => matchesProgress(entry, "seen", records))
      .map((entry) => entry.id),
    [6, 10034, 25],
  );
  assert.deepEqual(
    entries
      .filter((entry) => matchesProgress(entry, "unseen", records))
      .map((entry) => entry.id),
    [10100],
  );
  assert.deepEqual(
    entries
      .filter((entry) => matchesProgress(entry, "uncaught", records))
      .map((entry) => entry.id),
    [6, 10034, 10100],
  );
  assert.deepEqual(progressCounts([], records), {
    total: 0,
    seen: 0,
    caught: 0,
  });
});
test("Progress merging preserves captured species and never mutates either collection", () => {
  const current = [
    { id: 6, state: "caught" },
    { id: 7, state: "seen" },
  ];
  const incoming = [
    { id: 6, state: "seen" },
    { id: 7, state: "caught" },
    { id: 25, state: "seen" },
  ];
  const merged = mergeProgress(current, incoming);
  assert.deepEqual(merged, [
    { id: 6, state: "caught" },
    { id: 7, state: "caught" },
    { id: 25, state: "seen" },
  ]);
  assert.deepEqual(mergeProgress(merged, incoming), merged);
  assert.equal(current[1].state, "seen");
  assert.equal(incoming[0].state, "seen");
});
test("Backup round trips progress, merges captures and explicitly replaces or clears included progress", () => {
  const current = {
    favorites: [],
    team: [],
    teams: [],
    progress: [{ id: 6, state: "caught" }],
  };
  const backup = exportBackup({
    favorites: [],
    team: [],
    teams: [],
    progress: [
      { id: 6, state: "seen" },
      { id: 25, state: "caught" },
    ],
  });
  assert.deepEqual(
    parseBackup(JSON.stringify(backup)).progress,
    backup.progress,
  );
  assert.deepEqual(planBackupImport(current, backup).state.progress, [
    { id: 6, state: "caught" },
    { id: 25, state: "caught" },
  ]);
  assert.deepEqual(
    planBackupImport(current, backup, "replace").state.progress,
    backup.progress,
  );
  assert.deepEqual(
    planBackupImport(
      current,
      exportBackup({ favorites: [], team: [], teams: [], progress: [] }),
      "replace",
    ).state.progress,
    [],
  );
});
test("Legacy backups preserve current progress in both modes and invalid progress rejects the whole file", () => {
  const current = {
    favorites: [],
    team: [],
    teams: [],
    progress: [{ id: 25, state: "caught" }],
  };
  const legacy = exportBackup({ favorites: [], team: [], teams: [] });
  assert.equal(Object.hasOwn(legacy, "progress"), false);
  for (const mode of ["merge", "replace"])
    assert.deepEqual(
      planBackupImport(current, legacy, mode).state.progress,
      current.progress,
    );
  assert.throws(() =>
    parseBackup(
      JSON.stringify({
        ...legacy,
        progress: [
          { id: 6, state: "seen" },
          { id: 6, state: "caught" },
        ],
      }),
    ),
  );
  assert.throws(() =>
    parseBackup(JSON.stringify({ ...legacy, progress: null })),
  );
  assert.deepEqual(current.progress, [{ id: 25, state: "caught" }]);
});
test("Saved searches preserve progress filters and legacy combinations default to all records", () => {
  const legacy = {
    type: "",
    generation: "",
    onlyFavorites: false,
    advanced: emptyAdvancedFilters(),
  };
  assert.equal(validateCollectionFilters(legacy).progress, "");
  for (const progress of ["seen", "caught", "unseen", "uncaught"])
    assert.equal(
      validateCollectionFilters({ ...legacy, progress }).progress,
      progress,
    );
  for (const progress of [null, "invalid", 1])
    assert.throws(() => validateCollectionFilters({ ...legacy, progress }));
});

test("Backup round trips favorites, species and alternative forms without exporting unrelated storage", () => {
  const state = {
    favorites: [{ id: 10034, name: "charizard-mega-x", speciesId: 6 }],
    team: [{ id: 10034, name: "charizard-mega-x" }],
    teams: [
      { id: "kanto", name: "Kanto", members: [{ id: 1, name: "bulbasaur" }] },
    ],
  };
  const backup = exportBackup(state, new Date("2026-10-23T12:00:00Z"));
  assert.deepEqual(parseBackup(JSON.stringify(backup)), backup);
  assert.equal(backup.favorites[0].speciesId, 6);
  assert.equal(backup.team[0].id, 10034);
  assert.deepEqual(Object.keys(backup).sort(), [
    "exportedAt",
    "favorites",
    "format",
    "team",
    "teams",
    "version",
  ]);
});
test("Backup rejects incompatible, malformed, oversized, duplicate and incomplete data as a whole", () => {
  const empty = exportBackup({ favorites: [], team: [], teams: [] });
  for (const data of [
    null,
    {},
    { ...empty, version: 2 },
    { ...empty, exportedAt: "invalid" },
    { ...empty, team: [{ id: 0, name: "bad" }] },
    {
      ...empty,
      favorites: [
        { id: 1, name: "bulbasaur" },
        { id: 1, name: "bulbasaur" },
      ],
    },
    { ...empty, teams: [{ id: "bad", name: "", members: [] }] },
    { ...empty, teams: null },
    { ...empty, favorites: [{ id: 1, name: "<script>" }] },
  ])
    assert.throws(() => parseBackup(JSON.stringify(data)));
  assert.throws(() => parseBackup("broken json"));
  assert.throws(() => parseBackup(" ".repeat(MAX_BACKUP_BYTES + 1)));
});
test("Backup merge preserves current data, handles name/ID conflicts and is idempotent", () => {
  const current = {
    favorites: [{ id: 1, name: "bulbasaur", speciesId: 1 }],
    team: [{ id: 1, name: "bulbasaur" }],
    teams: [
      { id: "kanto", name: "Kanto", members: [{ id: 1, name: "bulbasaur" }] },
    ],
  };
  const backup = exportBackup({
    favorites: [
      { id: 1, name: "bulbasaur", speciesId: 1 },
      { id: 25, name: "pikachu", speciesId: 25 },
    ],
    team: [{ id: 10034, name: "charizard-mega-x" }],
    teams: [
      { id: "kanto", name: "Kanto", members: [{ id: 25, name: "pikachu" }] },
    ],
  });
  const original = JSON.stringify(current),
    plan = planBackupImport(current, backup);
  assert.deepEqual(plan.state.team, current.team);
  assert.equal(plan.state.favorites.length, 2);
  assert.deepEqual(
    plan.state.teams.map((team) => team.name),
    ["Kanto", "Kanto (importada)", "Equipe do backup"],
  );
  assert.equal(new Set(plan.state.teams.map((team) => team.id)).size, 3);
  assert.deepEqual(planBackupImport(plan.state, backup).state, plan.state);
  assert.equal(JSON.stringify(current), original);
});
test("Backup merge adopts the imported current team when empty and avoids redundant saved copies", () => {
  const backup = exportBackup({
    favorites: [],
    team: [{ id: 25, name: "pikachu" }],
    teams: [],
  });
  const empty = { favorites: [], team: [], teams: [] },
    plan = planBackupImport(empty, backup);
  assert.equal(plan.teamAction, "adopt");
  assert.deepEqual(plan.state.team, backup.team);
  assert.equal(plan.state.teams.length, 0);
  const current = {
    ...empty,
    team: [{ id: 1, name: "bulbasaur" }],
    teams: [{ id: "saved", name: "Elétrico", members: backup.team }],
  };
  assert.equal(planBackupImport(current, backup).state.teams.length, 1);
});
test("Backup replacement preserves exactly the file data, including intentional empty collections", () => {
  const current = {
    favorites: [{ id: 1, name: "bulbasaur", speciesId: 1 }],
    team: [{ id: 1, name: "bulbasaur" }],
    teams: [],
  };
  const backup = exportBackup({ favorites: [], team: [], teams: [] });
  assert.deepEqual(planBackupImport(current, backup, "replace").state, {
    favorites: [],
    team: [],
    teams: [],
  });
  assert.equal(current.team.length, 1);
  assert.throws(() => planBackupImport(current, backup, "unknown"));
});
test("Backup capacity failures never truncate teams, while existing duplicates can merge into a full library", () => {
  const teams = Array.from({ length: 20 }, (_, i) => ({
    id: `team-${i}`,
    name: `Team ${i}`,
    members: [{ id: 1, name: "bulbasaur" }],
  }));
  const current = { favorites: [], team: [], teams },
    backup = exportBackup({
      favorites: [],
      team: [],
      teams: [
        { id: "extra", name: "Extra", members: [{ id: 25, name: "pikachu" }] },
      ],
    });
  assert.throws(() => planBackupImport(current, backup));
  assert.equal(current.teams.length, 20);
  const same = exportBackup({ favorites: [], team: [], teams: [teams[0]] });
  assert.equal(planBackupImport(current, same).state.teams.length, 20);
});
test("Detailed comparison preserves dual-type weaknesses, resistances, neutral damage and immunities", () => {
  const member = (...names) => ({
    types: names.map((name) => ({ type: { name } })),
  });
  const resources = new Map(
    Object.keys(chart).map((name) => [name, typeResource(name)]),
  );
  const rows = compareDefenses(
    member("fire", "flying"),
    member("water", "ground"),
    resources,
    Object.keys(chart),
  );
  assert.deepEqual(
    rows.find((row) => row.type === "rock"),
    { type: "rock", left: 4, right: 0.5 },
  );
  assert.deepEqual(
    rows.find((row) => row.type === "electric"),
    { type: "electric", left: 2, right: 0 },
  );
  assert.deepEqual(
    rows.find((row) => row.type === "grass"),
    { type: "grass", left: 0.25, right: 4 },
  );
  assert.deepEqual(
    rows.find((row) => row.type === "ice"),
    { type: "ice", left: 1, right: 1 },
  );
});
test("Detailed comparison rejects missing type relations instead of fabricating neutral matchups", () => {
  const member = { types: [{ type: { name: "fire" } }] };
  assert.throws(() => compareDefenses(member, member, new Map(), ["water"]));
  assert.throws(() =>
    compareDefenses({ types: [] }, member, new Map(), ["water"]),
  );
});
const { validTheme, resolvedTheme } = await import("../js/theme.js");
const { teamName, sameMembers, readSavedTeams, MAX_SAVED_TEAMS } = await import(
  "../js/saved-teams.js"
);

test("Appearance follows the system only in automatic mode, including invalid saved preferences", () => {
  assert.equal(resolvedTheme("system", true), "dark");
  assert.equal(resolvedTheme("system", false), "light");
  assert.equal(resolvedTheme("light", true), "light");
  assert.equal(resolvedTheme("dark", false), "dark");
  assert.equal(validTheme("unknown"), "system");
  assert.equal(resolvedTheme("unknown", true), "dark");
});
test("Named teams normalize readable names and reject empty, oversized or non-string names", () => {
  assert.equal(teamName("  Equipe   de Kanto  "), "Equipe de Kanto");
  assert.equal(teamName("Água e dragões"), "Água e dragões");
  for (const value of [
    "   ",
    "a".repeat(41),
    null,
    undefined,
    42,
    "Time\u0000",
  ])
    assert.throws(() => teamName(value));
});
test("Named team recovery preserves valid teams and form IDs without retaining malformed records", () => {
  const good = {
    id: "kanto",
    name: "Kanto",
    members: [
      { id: 1, name: "bulbasaur" },
      { id: 10034, name: "charizard-mega-x" },
    ],
  };
  const data = {
    version: 1,
    teams: [
      good,
      { ...good, id: "duplicate-name" },
      { id: "bad", name: "Bad", members: [{ id: 0, name: "bad" }] },
      null,
    ],
  };
  assert.deepEqual(readSavedTeams(JSON.stringify(data)), {
    teams: [good],
    recovered: true,
  });
  assert.deepEqual(readSavedTeams(null), { teams: [], recovered: false });
  assert.throws(() => readSavedTeams("invalid json"));
  assert.throws(() =>
    readSavedTeams(JSON.stringify({ version: 2, teams: [] })),
  );
});
test("Named team change detection preserves member order and distinguishes alternative forms", () => {
  assert.ok(sameMembers([{ id: 1 }, { id: 25 }], [{ id: 1 }, { id: 25 }]));
  assert.ok(!sameMembers([{ id: 25 }, { id: 1 }], [{ id: 1 }, { id: 25 }]));
  assert.ok(!sameMembers([{ id: 6 }], [{ id: 10034 }]));
  assert.ok(!sameMembers([], [{ id: 1 }]));
});
test("Named team storage is bounded and never accepts duplicate members or teams larger than six", () => {
  const member = { id: 1, name: "bulbasaur" };
  const teams = Array.from({ length: MAX_SAVED_TEAMS + 1 }, (_, i) => ({
    id: `team-${i}`,
    name: `Team ${i}`,
    members: [member],
  }));
  const data = readSavedTeams(JSON.stringify({ version: 1, teams }));
  assert.equal(data.teams.length, MAX_SAVED_TEAMS);
  assert.equal(data.recovered, true);
  assert.equal(
    readSavedTeams(
      JSON.stringify({
        version: 1,
        teams: [{ id: "bad", name: "Repeated", members: [member, member] }],
      }),
    ).teams.length,
    0,
  );
  assert.equal(
    readSavedTeams(
      JSON.stringify({
        version: 1,
        teams: [
          {
            id: "large",
            name: "Large",
            members: Array.from({ length: 7 }, (_, i) => ({
              id: i + 1,
              name: "pokemon",
            })),
          },
        ],
      }),
    ).teams.length,
    0,
  );
});
const { matchesAdvanced, sortAdvanced, filterFacts, hasAdvancedFacts } =
  await import("../js/advanced-filters.js");
test("Comparison matches stat names rather than API order and preserves zero", () => {
  const first = {
    stats: [
      { stat: { name: "hp" }, base_stat: 0 },
      { stat: { name: "attack" }, base_stat: 60 },
    ],
  };
  const second = {
    stats: [
      { stat: { name: "attack" }, base_stat: 40 },
      { stat: { name: "hp" }, base_stat: 50 },
    ],
  };
  assert.deepEqual(comparisonStats(first, second, ["hp", "attack"]), [
    { name: "hp", left: 0, right: 50 },
    { name: "attack", left: 60, right: 40 },
    { name: "total", left: 60, right: 90 },
  ]);
});
test("Missing comparison attributes and totals remain unavailable, never fabricated as zero", () => {
  const rows = comparisonStats(
    { stats: [] },
    { stats: [{ stat: { name: "hp" }, base_stat: 45 }] },
    ["hp", "attack"],
  );
  assert.equal(rows[0].left, null);
  assert.equal(rows[0].right, 45);
  assert.equal(rows.at(-1).left, null);
  assert.equal(rows.at(-1).right, null);
});
test("Shared team weaknesses count vulnerable members, resistances and immunities separately", () => {
  const member = (...names) => ({
    types: names.map((name) => ({ type: { name } })),
  });
  const resources = new Map(
    Object.keys(chart).map((name) => [name, typeResource(name)]),
  );
  const summary = summarizeTeamWeaknesses(
    [member("fire"), member("fire", "flying"), member("water", "ground")],
    resources,
    Object.keys(chart),
  );
  assert.deepEqual(
    summary.find((entry) => entry.type === "rock"),
    { type: "rock", weak: 2, resistant: 1, immune: 0 },
  );
  assert.equal(summary.find((entry) => entry.type === "water").weak, 2);
  assert.ok(!summary.some((entry) => entry.type === "ground"));
  assert.deepEqual(
    summarizeTeamWeaknesses([member("normal")], resources, Object.keys(chart)),
    [],
  );
});
test("Species descriptions prefer Portuguese, normalize line breaks and identify English fallback", () => {
  const descriptions = [
    { language: { name: "en" }, flavor_text: "English entry" },
    { language: { name: "pt" }, flavor_text: "Texto\n português" },
    {
      language: { name: "pt-BR" },
      flavor_text: "Texto\fbrasileiro\n  atualizado.",
    },
  ];
  assert.deepEqual(preferredDescription(descriptions), {
    language: "pt-BR",
    text: "Texto brasileiro atualizado.",
  });
  assert.deepEqual(preferredDescription([descriptions[0]]), {
    language: "en",
    text: "English entry",
  });
  assert.equal(
    preferredDescription([{ language: { name: "ja" }, flavor_text: "説明" }]),
    null,
  );
});

test("Search suggestions normalize accents, spaces and gender symbols and match exact padded numbers", () => {
  const entries = [
    { id: 25, name: "pikachu" },
    { id: 10080, name: "pikachu-rock-star" },
    { id: 122, name: "mr-mime" },
    { id: 29, name: "nidoran-f" },
  ];
  assert.equal(normalizeSearch("  PÍKACHU  "), "pikachu");
  assert.equal(findSuggestions(entries, "00025")[0].id, 25);
  assert.equal(findSuggestions(entries, "Mr. Mime")[0].id, 122);
  assert.equal(findSuggestions(entries, "Nidoran♀")[0].id, 29);
  assert.deepEqual(findSuggestions(entries, ""), []);
  assert.deepEqual(findSuggestions(entries, "999999"), []);
});
test("Suggestions prefer exact names and prefixes, then word and substring matches, with a bounded list", () => {
  const entries = [
    { id: 1, name: "xx-pika" },
    { id: 2, name: "apika" },
    { id: 25, name: "pikachu" },
    { id: 26, name: "pika" },
  ];
  assert.deepEqual(
    findSuggestions(entries, "pika").map((entry) => entry.id),
    [26, 25, 1, 2],
  );
  assert.equal(findSuggestions(entries, "pika", 2).length, 2);
});
test("Alternative forms keep the species number and translate regional, Mega and Gigantamax labels", () => {
  assert.equal(
    speciesNumber({
      id: 10034,
      species: { url: "https://pokeapi.co/api/v2/pokemon-species/6/" },
    }),
    6,
  );
  assert.equal(speciesNumber({ id: 25 }), 25);
  const label = (name) => varietyLabel({ pokemon: { name } });
  assert.equal(label("charizard-mega-x"), "Mega Evolução X");
  assert.equal(label("raichu-alola"), "Forma de Alola");
  assert.equal(label("meowth-galar"), "Forma de Galar");
  assert.equal(label("zoroark-hisui"), "Forma de Hisui");
  assert.equal(label("tauros-paldea"), "Forma de Paldea");
  assert.equal(
    label("tauros-paldea-aqua-breed"),
    "Forma de Paldea · aqua breed",
  );
  assert.equal(label("gengar-gmax"), "Gigantamax");
  assert.equal(
    varietyLabel({ is_default: true, pokemon: { name: "charizard" } }),
    "Forma padrão",
  );
});

test("Shared team links and codes round-trip order and alternative-form IDs", () => {
  const ids = [25, 10034, 1, 150, 7, 10100];
  assert.deepEqual(parseSharedTeam(teamCode(ids)), ids);
  const shared = shareTeamValue(
    ids,
    "https://pokedex.example/app/index.html?search=private#old",
  );
  assert.equal(shared.kind, "link");
  assert.equal(new URL(shared.value).search, "");
  assert.deepEqual(parseSharedTeam(shared.value), ids);
  assert.deepEqual(parseSharedTeam("#team=v1%3A25%2C10034"), [25, 10034]);
});
test("Shared teams reject duplicates, unsupported versions, unsafe IDs, oversized inputs and executable URLs", () => {
  for (const value of [
    "",
    "pokedex-team:v2:1",
    "pokedex-team:v1:0",
    "pokedex-team:v1:-1",
    "pokedex-team:v1:01",
    "pokedex-team:v1:1,1",
    "pokedex-team:v1:1,2,3,4,5,6,7",
    "pokedex-team:v1:9007199254740992",
    "pokedex-team:v1:1.5",
    "#team=v1:1&team=v1:2",
    "javascript:alert(1)#team=v1:1",
    "https://example.com/#team=v1:1<script>",
    "a".repeat(2049),
  ])
    assert.throws(() => parseSharedTeam(value), value);
  assert.throws(() => teamCode([]));
});
test("Local and single-file viewers share a portable code instead of a loopback URL", () => {
  for (const address of [
    "about:blank",
    "file:///tmp/preview.html",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://[::1]:8000",
  ])
    assert.deepEqual(shareTeamValue([1, 25], address), {
      kind: "code",
      value: "pokedex-team:v1:1,25",
    });
});
test("Advanced classification, habitat and stat filters combine using real species and form facts", () => {
  const base = emptyAdvancedFilters();
  assert.ok(matchesAdvanced({ id: 150 }, { ...base, category: "legendary" }));
  assert.ok(!matchesAdvanced({ id: 151 }, { ...base, category: "legendary" }));
  assert.ok(matchesAdvanced({ id: 151 }, { ...base, category: "mythical" }));
  assert.ok(matchesAdvanced({ id: 172 }, { ...base, category: "baby" }));
  assert.ok(
    matchesAdvanced(
      { id: 25 },
      { ...base, habitat: "2", stat: "speed", min: 90, max: 90 },
    ),
  );
  assert.ok(
    !matchesAdvanced(
      { id: 25 },
      { ...base, habitat: "7", stat: "speed", min: 90, max: 90 },
    ),
  );
  assert.equal(filterFacts({ id: 10034 }).stats.total, 634);
  assert.ok(matchesAdvanced({ id: 10034 }, { ...base, min: 600 }));
  assert.ok(!matchesAdvanced({ id: 6 }, { ...base, min: 600 }));
});
test("Advanced filters preserve zero, distinguish unrecorded habitats from missing data, and sort without mutating input", () => {
  const index = {
    species: { 1: [0, null] },
    pokemon: { 1: [1, 0, 1, 2, 3, 4, 5], 2: [1, 20, 10, 10, 10, 10, 10] },
  };
  const base = emptyAdvancedFilters(),
    entries = [
      { id: 1, name: "z" },
      { id: 2, name: "a" },
      { id: 99, name: "unknown" },
    ];
  assert.ok(
    matchesAdvanced(entries[0], { ...base, stat: "hp", min: 0, max: 0 }, index),
  );
  assert.ok(
    matchesAdvanced(entries[0], { ...base, habitat: "unknown" }, index),
  );
  assert.ok(
    !matchesAdvanced(entries[2], { ...base, habitat: "unknown" }, index),
  );
  assert.ok(
    !hasAdvancedFacts(entries[2], { ...base, stat: "hp", min: 0 }, index),
  );
  assert.ok(hasAdvancedFacts(entries[2], base, index));
  assert.deepEqual(
    sortAdvanced(
      entries,
      { ...base, stat: "hp", sort: "stat-desc" },
      index,
    ).map((entry) => entry.id),
    [2, 1, 99],
  );
  assert.deepEqual(
    sortAdvanced(entries, { ...base, sort: "name" }, index).map(
      (entry) => entry.id,
    ),
    [2, 99, 1],
  );
  assert.equal(entries[0].id, 1);
});
test("Generated filter facts agree with the official offline collection's stats and species flags", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const file = new URL("../.preview-data.json", import.meta.url);
  // Optional downloaded snapshot is not required for pure rule checks.
  if (!existsSync(file)) {
    assert.ok(Object.keys(catalogFacts.species).length >= 1025);
    return;
  }
  const snapshot = JSON.parse(readFileSync(file, "utf8"));
  for (const pokemon of Object.values(snapshot.pokemon)) {
    const facts = filterFacts(pokemon);
    for (const { stat, base_stat } of pokemon.stats)
      assert.equal(
        facts.stats[stat.name],
        base_stat,
        `${pokemon.name} ${stat.name}`,
      );
    const species =
      snapshot.resources[`pokemon-species/${speciesNumber(pokemon)}`];
    assert.equal(Boolean(facts.flags & 1), Boolean(species.is_baby));
    assert.equal(Boolean(facts.flags & 2), Boolean(species.is_legendary));
    assert.equal(Boolean(facts.flags & 4), Boolean(species.is_mythical));
  }
});

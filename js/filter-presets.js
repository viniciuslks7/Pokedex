import {
  emptyAdvancedFilters,
  filterStats,
  habitats,
} from "./advanced-filters.js";

export const MAX_FILTER_PRESETS = 8;
const KEY = "pokedex.filters.v1";
const TYPES = new Set([
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
]);
export function validateCollectionFilters(data) {
  if (
    !data ||
    typeof data.onlyFavorites !== "boolean" ||
    typeof data.type !== "string" ||
    (data.type && !TYPES.has(data.type)) ||
    !/^(|[1-9])$/.test(data.generation) ||
    typeof data.generation !== "string"
  )
    throw Error("Filtros inválidos.");
  const progress = data.progress === undefined ? "" : data.progress;
  if (!["", "seen", "caught", "unseen", "uncaught"].includes(progress))
    throw Error("Filtro de progresso inválido.");
  const a = data.advanced;
  if (
    !a ||
    !["", "baby", "legendary", "mythical"].includes(a.category) ||
    !["", "unknown", ...Object.keys(habitats)].includes(a.habitat) ||
    !Object.hasOwn(filterStats, a.stat) ||
    !["number", "name", "stat-desc", "stat-asc"].includes(a.sort)
  )
    throw Error("Filtros avançados inválidos.");
  const limit = a.stat === "total" ? 1530 : 255;
  if (
    [a.min, a.max].some(
      (value) =>
        value !== null &&
        (!Number.isInteger(value) || value < 0 || value > limit),
    ) ||
    (a.min !== null && a.max !== null && a.min > a.max)
  )
    throw Error("Faixa de atributos inválida.");
  return {
    type: data.type,
    generation: data.generation,
    onlyFavorites: data.onlyFavorites,
    progress,
    advanced: {
      ...emptyAdvancedFilters(),
      category: a.category,
      habitat: a.habitat,
      stat: a.stat,
      min: a.min,
      max: a.max,
      sort: a.sort,
    },
  };
}
export function filterPresetName(value) {
  if (typeof value !== "string")
    throw Error("Escolha um nome para os filtros.");
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name || name.length > 40)
    throw Error("Use um nome de 1 a 40 caracteres.");
  return name;
}
export function readFilterPresets(text) {
  if (!text) return { presets: [], recovered: false };
  if (typeof text !== "string" || text.length > 100000)
    throw Error("Invalid filters");
  const data = JSON.parse(text);
  if (data?.version !== 1 || !Array.isArray(data.presets))
    throw Error("Invalid filters");
  const ids = new Set(),
    names = new Set(),
    presets = [];
  for (const item of data.presets) {
    try {
      if (
        !item ||
        typeof item.id !== "string" ||
        !/^[a-z0-9-]{1,80}$/.test(item.id) ||
        ids.has(item.id)
      )
        continue;
      const name = filterPresetName(item.name),
        key = name.toLocaleLowerCase("pt-BR");
      if (names.has(key) || presets.length === MAX_FILTER_PRESETS) continue;
      const filters = validateCollectionFilters(item.filters);
      ids.add(item.id);
      names.add(key);
      presets.push({ id: item.id, name, filters });
    } catch {
      /* Preserve valid entries while reporting recovery. */
    }
  }
  return { presets, recovered: presets.length !== data.presets.length };
}

export function createFilterPresets({ getFilters, onApply, types }) {
  const select = (id) => document.querySelector(id),
    picker = select("#filter-preset-select"),
    name = select("#filter-preset-name");
  const status = select("#filter-preset-status"),
    notice = select("#filter-preset-notice"),
    undo = select("#filter-preset-undo");
  let presets = [],
    removed = null;
  function warn(message) {
    notice.textContent = message;
    notice.hidden = false;
  }
  try {
    const saved = readFilterPresets(localStorage.getItem(KEY));
    presets = saved.presets;
    if (saved.recovered)
      warn(
        "Algumas buscas salvas inválidas foram ignoradas. As demais continuam disponíveis.",
      );
  } catch {
    warn(
      "Não foi possível recuperar as buscas salvas. Você pode criá-las nesta sessão.",
    );
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, presets }));
      notice.hidden = true;
    } catch {
      warn(
        "As buscas salvas funcionam nesta sessão. O navegador não permitiu guardá-las para a próxima visita.",
      );
    }
  }
  function selected() {
    return presets.find((preset) => preset.id === picker.value);
  }
  function describe() {
    const preset = selected();
    if (!preset) {
      select("#filter-preset-description").textContent = "";
      return;
    }
    const f = preset.filters,
      a = f.advanced;
    const labels = [
      f.type ? types[f.type][0] : "Todos os tipos",
      f.generation ? `${f.generation}ª geração` : "Todas as gerações",
      f.onlyFavorites ? "Somente favoritos" : "Catálogo completo",
    ];
    if (f.progress)
      labels.push(
        {
          seen: "Espécies vistas",
          caught: "Espécies capturadas",
          unseen: "Ainda não vistas",
          uncaught: "Faltam capturar",
        }[f.progress],
      );
    if (a.category)
      labels.push(
        { baby: "Bebês", legendary: "Lendários", mythical: "Míticos" }[
          a.category
        ],
      );
    if (a.habitat)
      labels.push(`Habitat: ${habitats[a.habitat] || "Não informado"}`);
    if (a.min !== null || a.max !== null)
      labels.push(
        `${filterStats[a.stat]}: ${a.min ?? 0}–${a.max ?? (a.stat === "total" ? 1530 : 255)}`,
      );
    const order = {
      number: "Número da Pokédex",
      name: "Nome (A–Z)",
      "stat-desc": "Maior atributo",
      "stat-asc": "Menor atributo",
    };
    labels.push(
      `Ordem: ${order[a.sort]}${a.sort.startsWith("stat") ? ` (${filterStats[a.stat]})` : ""}`,
    );
    select("#filter-preset-description").textContent = labels.join(" · ");
  }
  function render(id = picker.value) {
    picker.replaceChildren(
      new Option("Escolha uma busca salva", ""),
      ...presets.map((preset) => new Option(preset.name, preset.id)),
    );
    picker.value = presets.some((preset) => preset.id === id) ? id : "";
    picker.disabled = !presets.length;
    select("#filter-preset-count").textContent =
      `${presets.length} / ${MAX_FILTER_PRESETS}`;
    select("#filter-preset-load").disabled = select(
      "#filter-preset-delete",
    ).disabled = !selected();
    undo.hidden = !removed;
    describe();
  }
  picker.addEventListener("change", () => {
    render();
    status.textContent = "Confira a combinação e use “Aplicar busca salva”.";
  });
  select("#filter-preset-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const label = filterPresetName(name.value);
      if (
        presets.some(
          (preset) =>
            preset.name.toLocaleLowerCase("pt-BR") ===
            label.toLocaleLowerCase("pt-BR"),
        )
      )
        throw Error("Já existe uma busca com esse nome. Escolha outro nome.");
      if (presets.length >= MAX_FILTER_PRESETS)
        throw Error(
          "Você pode guardar até oito buscas. Exclua uma para salvar outra.",
        );
      const filters = validateCollectionFilters(getFilters());
      const id =
        globalThis.crypto?.randomUUID?.() ||
        `filters-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      presets.push({ id, name: label, filters });
      persist();
      render(id);
      name.value = "";
      status.textContent = `“${label}” salva com os filtros aplicados. Use “Aplicar busca salva” para retomá-la.`;
    } catch (error) {
      status.textContent = error.message;
    }
  });
  select("#filter-preset-load").addEventListener("click", () => {
    const preset = selected();
    if (!preset) return;
    onApply(validateCollectionFilters(preset.filters));
    status.textContent = `Busca “${preset.name}” aplicada. Os resultados abaixo refletem a coleção disponível agora.`;
  });
  select("#filter-preset-delete").addEventListener("click", () => {
    const preset = selected();
    if (!preset) return;
    removed = preset;
    presets = presets.filter((item) => item.id !== preset.id);
    persist();
    render();
    status.textContent = `“${preset.name}” excluída. Os filtros em uso continuam aplicados.`;
    undo.focus({ preventScroll: true });
  });
  undo.addEventListener("click", () => {
    if (!removed) return;
    if (
      presets.length >= MAX_FILTER_PRESETS ||
      presets.some(
        (preset) =>
          preset.name.toLocaleLowerCase("pt-BR") ===
          removed.name.toLocaleLowerCase("pt-BR"),
      )
    ) {
      status.textContent =
        "Libere uma vaga e um nome antes de restaurar esta busca.";
      return;
    }
    const restored = removed;
    presets.push(restored);
    removed = null;
    persist();
    render(restored.id);
    status.textContent = `“${restored.name}” restaurada.`;
    select("#filter-preset-load").focus({ preventScroll: true });
  });
  render();
}

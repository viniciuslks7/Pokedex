import { catalogFacts } from "./catalog-facts.js";

export const habitats = {
  1: "Caverna",
  2: "Floresta",
  3: "Pradaria",
  4: "Montanha",
  5: "Raro",
  6: "Terreno acidentado",
  7: "Mar",
  8: "Área urbana",
  9: "Margem de água",
};
export const filterStats = {
  total: "Total dos atributos",
  hp: "HP",
  attack: "Ataque",
  defense: "Defesa",
  "special-attack": "Ataque esp.",
  "special-defense": "Defesa esp.",
  speed: "Velocidade",
};
export const emptyAdvancedFilters = () => ({
  category: "",
  habitat: "",
  stat: "total",
  min: null,
  max: null,
  sort: "number",
});

export function filterFacts(entry, index = catalogFacts) {
  const pokemon = index.pokemon[entry.id];
  const speciesId = pokemon?.[0] || entry.speciesId || entry.id;
  const species = index.species[speciesId];
  const values = pokemon?.slice(1);
  return {
    flags: species?.[0] ?? null,
    habitat: species ? species[1] : undefined,
    stats: values
      ? Object.fromEntries(
          Object.keys(filterStats).map((name, i) => [
            name,
            i ? values[i - 1] : values.reduce((a, b) => a + b, 0),
          ]),
        )
      : null,
  };
}

export function matchesAdvanced(entry, filters, index = catalogFacts) {
  const facts = filterFacts(entry, index);
  const flags = { baby: 1, legendary: 2, mythical: 4 };
  if (
    filters.category &&
    (facts.flags === null || !(facts.flags & flags[filters.category]))
  )
    return false;
  if (
    filters.habitat &&
    (filters.habitat === "unknown"
      ? facts.habitat !== null
      : facts.habitat !== Number(filters.habitat))
  )
    return false;
  const value = facts.stats?.[filters.stat];
  if ((filters.min !== null || filters.max !== null) && !Number.isFinite(value))
    return false;
  return (
    (filters.min === null || value >= filters.min) &&
    (filters.max === null || value <= filters.max)
  );
}

export function hasAdvancedFacts(entry, filters, index = catalogFacts) {
  const facts = filterFacts(entry, index);
  return (
    (!filters.category || facts.flags !== null) &&
    (!filters.habitat || facts.habitat !== undefined) &&
    (!(
      filters.min !== null ||
      filters.max !== null ||
      filters.sort.startsWith("stat")
    ) ||
      Number.isFinite(facts.stats?.[filters.stat]))
  );
}

export function sortAdvanced(entries, filters, index = catalogFacts) {
  return entries.slice().sort((a, b) => {
    if (filters.sort === "name")
      return a.name.localeCompare(b.name, "pt-BR") || a.id - b.id;
    if (filters.sort === "stat-desc" || filters.sort === "stat-asc") {
      const left = filterFacts(a, index).stats?.[filters.stat],
        right = filterFacts(b, index).stats?.[filters.stat];
      if (!Number.isFinite(left))
        return Number.isFinite(right) ? 1 : a.id - b.id;
      if (!Number.isFinite(right)) return -1;
      return (
        (filters.sort === "stat-desc" ? right - left : left - right) ||
        a.id - b.id
      );
    }
    return a.id - b.id;
  });
}

export function createAdvancedFilters({ onApply }) {
  const form = document.querySelector("#advanced-filters");
  const select = (id) => document.querySelector(id);
  const category = select("#category-filter"),
    habitat = select("#habitat-filter");
  const stat = select("#stat-filter"),
    min = select("#stat-min"),
    max = select("#stat-max");
  const sort = select("#sort-filter"),
    status = select("#advanced-filter-status");
  const summary = select("#advanced-filter-summary");
  for (const [id, label] of Object.entries(habitats))
    habitat.add(new Option(label, id));
  habitat.add(new Option("Não informado", "unknown"));
  for (const [id, label] of Object.entries(filterStats))
    stat.add(new Option(label, id));
  select("#filter-data-date").textContent = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
  }).format(new Date(catalogFacts.updatedAt));
  function clearValidity() {
    min.setCustomValidity("");
    max.setCustomValidity("");
  }
  function limits() {
    clearValidity();
    const limit = stat.value === "total" ? 1530 : 255;
    min.max = max.max = limit;
  }
  function summaryText(filters) {
    const parts = [];
    if (filters.category) parts.push(category.selectedOptions[0].textContent);
    if (filters.habitat)
      parts.push(`Habitat: ${habitat.selectedOptions[0].textContent}`);
    if (filters.min !== null || filters.max !== null)
      parts.push(
        `${filterStats[filters.stat]}: ${filters.min ?? 0}–${filters.max ?? (filters.stat === "total" ? 1530 : 255)}`,
      );
    if (filters.sort !== "number")
      parts.push(
        `Ordem: ${sort.selectedOptions[0].textContent}${filters.sort.startsWith("stat") ? ` (${filterStats[filters.stat]})` : ""}`,
      );
    return parts.length
      ? `Aplicado: ${parts.join(" · ")}.`
      : "Nenhum filtro avançado aplicado.";
  }
  form.addEventListener("input", () => {
    clearValidity();
    status.textContent = "Aplique para atualizar os resultados.";
  });
  stat.addEventListener("change", limits);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearValidity();
    if (
      min.value !== "" &&
      max.value !== "" &&
      Number(min.value) > Number(max.value)
    ) {
      max.setCustomValidity("O máximo precisa ser maior ou igual ao mínimo.");
      status.textContent =
        "Confira a faixa: o máximo precisa ser maior ou igual ao mínimo.";
    }
    if (!form.reportValidity()) return;
    const filters = {
      category: category.value,
      habitat: habitat.value,
      stat: stat.value,
      min: min.value === "" ? null : Number(min.value),
      max: max.value === "" ? null : Number(max.value),
      sort: sort.value,
    };
    summary.textContent = summaryText(filters);
    status.textContent = "Filtros aplicados.";
    onApply(filters);
  });
  limits();
  return {
    set(filters) {
      category.value = filters.category;
      habitat.value = filters.habitat;
      stat.value = filters.stat;
      sort.value = filters.sort;
      limits();
      min.value = filters.min ?? "";
      max.value = filters.max ?? "";
      summary.textContent = summaryText(filters);
      status.textContent = "Filtros da busca salva aplicados.";
    },
    reset() {
      form.reset();
      limits();
      status.textContent = "";
      summary.textContent = "Nenhum filtro avançado aplicado.";
    },
  };
}

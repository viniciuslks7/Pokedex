import { getResource, pokemonLabel } from "./api.js";
import { calculateDefensiveMatchups } from "./matchups.js";

const KEY = "pokedex.attack-coverage.v1";
export const MAX_ATTACK_TYPES = 4;

export function validateAttackTypes(selected, allowed) {
  if (
    !Array.isArray(selected) ||
    selected.length > MAX_ATTACK_TYPES ||
    selected.some(
      (type) => typeof type !== "string" || !allowed.includes(type),
    ) ||
    new Set(selected).size !== selected.length
  )
    throw Error("Invalid attack types");
  return [...selected];
}

export function attackOptions(selected, defendingTypes, resources) {
  validateAttackTypes(selected, [...resources.keys()]);
  if (
    !defendingTypes.length ||
    defendingTypes.length > 2 ||
    new Set(defendingTypes).size !== defendingTypes.length
  )
    throw Error("Invalid defending types");
  const defending = defendingTypes.map((type) => {
    const resource = resources.get(type);
    if (!resource) throw Error("Missing defensive type");
    return resource;
  });
  const values = calculateDefensiveMatchups(defending, selected);
  if (!values.length) return { values, best: null, bestTypes: [] };
  const best = Math.max(...values.map((value) => value.multiplier));
  return {
    values,
    best,
    bestTypes: values
      .filter((value) => value.multiplier === best)
      .map((value) => value.type),
  };
}

export function calculateAttackCoverage(selected, resources, defendingTypes) {
  validateAttackTypes(selected, [...resources.keys()]);
  if (!selected.length) return [];
  return defendingTypes.map((type) => ({
    type,
    ...attackOptions(selected, [type], resources),
  }));
}

export function createAttackCoverage({ types }) {
  const select = (id) => document.querySelector(id),
    panel = select("#attack-coverage");
  const status = select("#attack-coverage-status"),
    notice = select("#attack-coverage-notice");
  const table = select("#attack-coverage-table"),
    results = select("#attack-coverage-results");
  const useCurrent = select("#attack-use-current"),
    retry = select("#attack-coverage-retry");
  const slots = [...panel.querySelectorAll(".attack-type-select")],
    allowed = Object.keys(types);
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  let selected = [],
    current = null,
    busy = false,
    controller = null,
    version = 0;
  function warn(message) {
    notice.hidden = false;
    notice.textContent = message;
  }
  try {
    const text = localStorage.getItem(KEY);
    if (text) {
      if (text.length > 1000) throw Error("Invalid choices");
      const saved = JSON.parse(text);
      if (saved?.version !== 1) throw Error("Invalid choices");
      selected = validateAttackTypes(saved.types, allowed);
    }
  } catch {
    warn(
      "Não foi possível recuperar os tipos de ataque salvos. Escolha uma nova combinação.",
    );
  }
  function persist() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ version: 1, types: selected }),
      );
      notice.hidden = true;
    } catch {
      warn(
        "Os tipos escolhidos funcionam nesta sessão. O navegador não permitiu guardá-los para a próxima visita.",
      );
    }
  }
  for (const slot of slots) {
    for (const [id, [label]] of Object.entries(types).sort((a, b) =>
      a[1][0].localeCompare(b[1][0], "pt-BR"),
    ))
      slot.add(new Option(label, id));
  }
  function controls({ reset = false } = {}) {
    if (reset)
      slots.forEach((slot, index) => {
        slot.value = selected[index] || "";
      });
    for (const slot of slots)
      for (const option of slot.options)
        option.disabled = Boolean(
          option.value &&
            option.value !== slot.value &&
            selected.includes(option.value),
        );
    useCurrent.disabled = busy || !current;
    select("#attack-clear").disabled = !selected.length;
    select("#attack-choice-count").textContent =
      `${selected.length} / ${MAX_ATTACK_TYPES} tipos`;
    useCurrent.textContent = current
      ? `Usar tipos de ${pokemonLabel(current.name)}`
      : "Usar tipos do Pokémon aberto";
  }
  function damageClass(value) {
    return value === 0
      ? "attack-immune"
      : value < 1
        ? "attack-resistant"
        : value > 1
          ? "attack-super"
          : "";
  }
  function renderTable(rows) {
    const head = document.createElement("thead"),
      header = document.createElement("tr"),
      body = document.createElement("tbody");
    for (const label of [
      "Tipo defensor",
      ...selected.map((type) => types[type][0]),
      "Melhor opção",
    ]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      header.append(cell);
    }
    head.append(header);
    rows.forEach((row) => {
      const line = document.createElement("tr"),
        name = document.createElement("th");
      line.dataset.type = row.type;
      name.scope = "row";
      name.textContent = types[row.type][0];
      line.append(name);
      row.values.forEach((value) => {
        const cell = document.createElement("td");
        cell.dataset.attackType = value.type;
        cell.dataset.multiplier = value.multiplier;
        cell.textContent = `×${number.format(value.multiplier)}`;
        cell.className = damageClass(value.multiplier);
        line.append(cell);
      });
      const best = document.createElement("td"),
        value = document.createElement("strong"),
        names = document.createElement("span");
      best.className = `attack-best ${damageClass(row.best)}`;
      best.dataset.best = row.best;
      value.textContent = `×${number.format(row.best)}`;
      names.textContent = row.bestTypes
        .map((type) => types[type][0])
        .join(" / ");
      best.append(value, names);
      line.append(best);
      body.append(line);
    });
    const caption = document.createElement("caption");
    caption.textContent =
      "Cobertura contra cada tipo isolado. A melhor opção é o maior multiplicador entre os ataques escolhidos; tipos defensivos duplos são calculados no painel do Pokémon aberto.";
    table.replaceChildren(caption, head, body);
    const groups = {
      super: rows.filter((row) => row.best > 1),
      neutral: rows.filter((row) => row.best === 1),
      resistant: rows.filter((row) => row.best > 0 && row.best < 1),
      immune: rows.filter((row) => row.best === 0),
    };
    for (const [key, group] of Object.entries(groups))
      select(`#attack-count-${key}`).textContent = String(group.length);
  }
  function renderTarget(resources) {
    const target = select("#attack-target"),
      list = select("#attack-target-options");
    target.hidden = !current;
    if (!current) return;
    const defending = [
      ...new Set(current.types.map((entry) => entry.type.name)),
    ];
    const options = attackOptions(selected, defending, resources);
    select("#attack-target-name").textContent = pokemonLabel(current.name);
    select("#attack-target-types").textContent = defending
      .map((type) => types[type][0])
      .join(" · ");
    select("#attack-target-best").textContent =
      options.best === 0
        ? "Todos os tipos escolhidos são bloqueados por imunidade (×0)."
        : `Melhor opção: ${options.bestTypes.map((type) => types[type][0]).join(" / ")} · ×${number.format(options.best)}`;
    list.replaceChildren(
      ...options.values.map((value) => {
        const item = document.createElement("li");
        item.dataset.type = value.type;
        item.dataset.multiplier = value.multiplier;
        item.className = damageClass(value.multiplier);
        const name = document.createElement("span"),
          multiplier = document.createElement("strong");
        name.textContent = types[value.type][0];
        multiplier.textContent = `×${number.format(value.multiplier)}`;
        item.append(name, multiplier);
        return item;
      }),
    );
  }
  async function analyze() {
    controller?.abort();
    const request = ++version,
      active = new AbortController();
    controller = active;
    results.hidden = true;
    retry.hidden = true;
    table.replaceChildren();
    select("#attack-target").hidden = true;
    if (!selected.length) {
      panel.setAttribute("aria-busy", "false");
      status.textContent =
        "Escolha de um a quatro tipos de ataque para comparar a cobertura.";
      return;
    }
    const chosen = [...selected],
      target = current;
    panel.setAttribute("aria-busy", "true");
    status.textContent = "Consultando a tabela de tipos…";
    const timeout = setTimeout(() => active.abort(), 12000);
    try {
      const resources = new Map(
        await Promise.all(
          allowed.map(async (type) => [
            type,
            await getResource(`type/${type}`, active.signal),
          ]),
        ),
      );
      active.signal.throwIfAborted();
      if (request !== version || target !== current) return;
      const rows = calculateAttackCoverage(chosen, resources, allowed);
      renderTarget(resources);
      renderTable(rows);
      results.hidden = false;
      status.textContent = `${chosen.length} ${chosen.length === 1 ? "tipo escolhido" : "tipos escolhidos"}. Comparação contra os 18 tipos isolados${current ? ` e contra ${pokemonLabel(current.name)}` : ""}.`;
    } catch {
      if (request !== version) return;
      status.textContent =
        "Não foi possível consultar todos os tipos. Suas escolhas foram mantidas. Conecte-se ou tente novamente com os dados guardados.";
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (request === version) panel.setAttribute("aria-busy", "false");
    }
  }
  for (const slot of slots)
    slot.addEventListener("change", () => {
      selected = validateAttackTypes(
        slots.map((slot) => slot.value).filter(Boolean),
        allowed,
      );
      persist();
      controls();
      analyze();
    });
  select("#attack-clear").addEventListener("click", () => {
    selected = [];
    persist();
    controls({ reset: true });
    analyze();
  });
  useCurrent.addEventListener("click", () => {
    if (busy || !current) return;
    selected = [
      ...new Set(current.types.map((entry) => entry.type.name)),
    ].filter((type) => allowed.includes(type));
    persist();
    controls({ reset: true });
    analyze();
  });
  retry.addEventListener("click", analyze);
  controls({ reset: true });
  analyze();
  return {
    setCurrent(pokemon) {
      current = pokemon;
      controls();
      if (selected.length) analyze();
    },
    setBusy(value) {
      busy = value;
      controls();
    },
  };
}

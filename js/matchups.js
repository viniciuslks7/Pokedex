import { getResource } from "./api.js";

export function calculateDefensiveMatchups(resources, attackTypes) {
  if (!resources.length) throw new Error("Missing defensive types");
  const relations = resources.map((resource) => {
    const data = resource.damage_relations;
    if (
      !data ||
      !["double_damage_from", "half_damage_from", "no_damage_from"].every(
        (key) => Array.isArray(data[key]),
      )
    )
      throw new Error("Incomplete type relations");
    return {
      weak: new Set(data.double_damage_from.map((type) => type.name)),
      resistant: new Set(data.half_damage_from.map((type) => type.name)),
      immune: new Set(data.no_damage_from.map((type) => type.name)),
    };
  });
  return attackTypes.map((type) => ({
    type,
    multiplier: relations.reduce(
      (value, relation) =>
        value *
        (relation.immune.has(type)
          ? 0
          : relation.weak.has(type)
            ? 2
            : relation.resistant.has(type)
              ? 0.5
              : 1),
      1,
    ),
  }));
}

export function createMatchups({ types }) {
  const section = document.querySelector(".matchup-section");
  const status = document.querySelector("#matchup-status");
  const groups = document.querySelector("#matchup-groups");
  const retry = document.querySelector("#matchup-retry");
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  let current = null;
  let activeRequest = null;
  let version = 0;

  function renderGroup(selector, entries) {
    const list = document.querySelector(selector);
    list.replaceChildren(
      ...entries.map(({ type, multiplier }) => {
        const item = document.createElement("li");
        item.className = "matchup-type";
        item.dataset.type = type;
        item.dataset.multiplier = multiplier;
        const palette = types[type];
        item.style.setProperty("--badge-color", palette[1]);
        item.style.setProperty("--badge-background", palette[2]);
        const label = document.createElement("span");
        label.textContent = palette[0];
        const value = document.createElement("strong");
        value.textContent = `×${number.format(multiplier)}`;
        item.setAttribute(
          "aria-label",
          `${palette[0]}: ${number.format(multiplier)} vezes o dano`,
        );
        item.append(label, value);
        return item;
      }),
    );
    if (!entries.length) {
      const empty = document.createElement("li");
      empty.className = "matchup-empty";
      empty.textContent = "Nenhuma pela combinação de tipos.";
      list.append(empty);
    }
  }

  async function show(pokemon) {
    current = pokemon;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const request = ++version;
    const timeout = setTimeout(() => controller.abort(), 12000);
    section.setAttribute("aria-busy", "true");
    groups.hidden = true;
    retry.hidden = true;
    status.textContent = "Analisando a combinação de tipos…";
    try {
      const names = [...new Set(pokemon.types.map(({ type }) => type.name))];
      const resources = await Promise.all(
        names.map((name) =>
          getResource(`type/${encodeURIComponent(name)}`, controller.signal),
        ),
      );
      if (request !== version) return;
      const entries = calculateDefensiveMatchups(resources, Object.keys(types));
      renderGroup(
        "#pokemon-weaknesses",
        entries
          .filter(({ multiplier }) => multiplier > 1)
          .sort((a, b) => b.multiplier - a.multiplier),
      );
      renderGroup(
        "#pokemon-resistances",
        entries
          .filter(({ multiplier }) => multiplier > 0 && multiplier < 1)
          .sort((a, b) => a.multiplier - b.multiplier),
      );
      renderGroup(
        "#pokemon-immunities",
        entries.filter(({ multiplier }) => multiplier === 0),
      );
      groups.hidden = false;
      status.textContent = `Afinidades de ${pokemon.name.replaceAll("-", " ")}. ×1 é dano neutro e não aparece nas listas.`;
    } catch {
      if (request !== version) return;
      status.textContent =
        "Não foi possível carregar as afinidades de tipos. Os detalhes do Pokémon continuam disponíveis.";
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (request === version) section.setAttribute("aria-busy", "false");
    }
  }
  retry.addEventListener("click", () => {
    if (current) show(current);
  });
  return { show };
}

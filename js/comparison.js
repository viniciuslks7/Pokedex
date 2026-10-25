import { getResource, pokemonLabel } from "./api.js";
import { calculateDefensiveMatchups } from "./matchups.js";

export function compareDefenses(first, second, resources, attackTypes) {
  const values = (pokemon) =>
    calculateDefensiveMatchups(
      [...new Set(pokemon.types.map(({ type }) => type.name))].map((name) =>
        resources.get(name),
      ),
      attackTypes,
    );
  const left = values(first),
    right = values(second);
  return left.map((entry, index) => ({
    type: entry.type,
    left: entry.multiplier,
    right: right[index].multiplier,
  }));
}

export function createDetailedComparison({ types }) {
  const select = (id) => document.querySelector(id);
  const container = select("#comparison-details"),
    profiles = select("#comparison-profiles");
  const table = select("#comparison-matchups-table"),
    status = select("#comparison-matchups-status");
  const retry = select("#comparison-matchups-retry");
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  let current = [],
    controller = null,
    version = 0;
  function profile(pokemon) {
    const section = document.createElement("section");
    section.className = "comparison-profile";
    const heading = document.createElement("h3");
    heading.textContent = pokemonLabel(pokemon.name);
    const typeHeading = document.createElement("h4");
    typeHeading.textContent = "Tipos";
    const badges = document.createElement("ul");
    badges.className = "types";
    badges.setAttribute("aria-label", `Tipos de ${pokemonLabel(pokemon.name)}`);
    badges.replaceChildren(
      ...pokemon.types.map(({ type }) => {
        const item = document.createElement("li"),
          palette = types[type.name];
        item.className = "type";
        item.textContent = palette?.[0] || type.name;
        if (palette) {
          item.style.color = palette[1];
          item.style.background = palette[2];
        }
        return item;
      }),
    );
    const abilitiesHeading = document.createElement("h4");
    abilitiesHeading.textContent = "Habilidades";
    const abilities = document.createElement("ul");
    abilities.className = "comparison-abilities";
    for (const entry of pokemon.abilities || []) {
      const item = document.createElement("li");
      item.textContent = pokemonLabel(entry.ability.name);
      if (entry.is_hidden) {
        const badge = document.createElement("span");
        badge.className = "hidden-ability";
        badge.textContent = "Oculta";
        item.append(badge);
      }
      abilities.append(item);
    }
    if (!abilities.children.length) {
      const empty = document.createElement("li");
      empty.textContent = "Não informadas";
      abilities.append(empty);
    }
    section.append(heading, typeHeading, badges, abilitiesHeading, abilities);
    return section;
  }
  async function loadMatchups(pair) {
    controller?.abort();
    const requestController = new AbortController();
    controller = requestController;
    const request = ++version,
      timeout = setTimeout(() => requestController.abort(), 12000);
    table.hidden = true;
    retry.hidden = true;
    status.textContent = "Comparando as afinidades dos dois Pokémon…";
    try {
      const names = [
        ...new Set(
          pair.flatMap((pokemon) => pokemon.types.map(({ type }) => type.name)),
        ),
      ];
      const resources = new Map(
        await Promise.all(
          names.map(async (name) => [
            name,
            await getResource(`type/${name}`, requestController.signal),
          ]),
        ),
      );
      if (request !== version) return;
      const rows = compareDefenses(
        pair[0],
        pair[1],
        resources,
        Object.keys(types),
      );
      const header = document.createElement("tr");
      for (const label of [
        "Tipo de ataque",
        ...pair.map((pokemon) => pokemonLabel(pokemon.name)),
      ]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        header.append(th);
      }
      table.querySelector("thead").replaceChildren(header);
      table.querySelector("tbody").replaceChildren(
        ...rows.map((row) => {
          const tr = document.createElement("tr");
          tr.dataset.type = row.type;
          const label = document.createElement("th");
          label.scope = "row";
          label.textContent = types[row.type][0];
          tr.append(label);
          for (const side of ["left", "right"]) {
            const value = row[side],
              cell = document.createElement("td");
            cell.dataset.multiplier = value;
            const multiplier = document.createElement("strong");
            multiplier.textContent = `×${number.format(value)}`;
            const description = document.createElement("span");
            description.textContent =
              value === 0
                ? "Imune"
                : value < 1
                  ? "Resistência"
                  : value > 1
                    ? "Fraqueza"
                    : "Neutro";
            cell.className =
              value === 0
                ? "damage-immune"
                : value < 1
                  ? "damage-resistant"
                  : value > 1
                    ? "damage-weak"
                    : "damage-neutral";
            if (value < row[side === "left" ? "right" : "left"]) {
              cell.classList.add("damage-lower");
              const hint = document.createElement("span");
              hint.className = "sr-only";
              hint.textContent = " (menor dano recebido)";
              description.append(hint);
            }
            cell.append(multiplier, description);
            tr.append(cell);
          }
          return tr;
        }),
      );
      table.hidden = false;
      status.textContent =
        "Dano recebido pela combinação de tipos. O destaque indica o menor multiplicador entre os dois.";
    } catch {
      if (request !== version) return;
      status.textContent =
        "Não foi possível comparar as afinidades. Os atributos, tipos e habilidades continuam disponíveis.";
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
    }
  }
  function show(pair) {
    controller?.abort();
    version++;
    current = pair.slice();
    container.hidden = pair.length !== 2;
    if (pair.length !== 2) {
      profiles.replaceChildren();
      table.hidden = true;
      retry.hidden = true;
      return;
    }
    profiles.replaceChildren(...pair.map(profile));
    loadMatchups(current);
  }
  retry.addEventListener("click", () => {
    if (current.length === 2) loadMatchups(current);
  });
  return { show };
}

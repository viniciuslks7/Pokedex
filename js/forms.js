import {
  getResource,
  resourceId,
  pokemonLabel,
  previewPokemonIds,
} from "./api.js";

export function speciesNumber(pokemon) {
  return resourceId(pokemon?.species?.url) || pokemon?.id;
}

export function varietyLabel(entry) {
  if (entry.is_default) return "Forma padrão";
  const name = entry.pokemon.name;
  if (/-mega(?:-|$)/.test(name)) {
    const suffix = name.split("-mega")[1].replace(/^-/, "").toUpperCase();
    return `Mega Evolução${suffix ? ` ${suffix}` : ""}`;
  }
  const regional = {
    alola: "Alola",
    galar: "Galar",
    hisui: "Hisui",
    paldea: "Paldea",
  };
  const region = Object.keys(regional).find((region) =>
    name.split("-").includes(region),
  );
  if (region) {
    const suffix = pokemonLabel(name.split(`-${region}`)[1].replace(/^-/, ""));
    return `Forma de ${regional[region]}${suffix ? ` · ${suffix}` : ""}`;
  }
  if (name.endsWith("-gmax")) return "Gigantamax";
  return pokemonLabel(name);
}

export function createFormExplorer({ onSelect }) {
  const container = document.querySelector("#pokemon-forms");
  const select = document.querySelector("#form-select");
  const status = document.querySelector("#forms-status");
  const retry = document.querySelector("#forms-retry");
  let current = null,
    controller = null,
    version = 0,
    busy = false;
  let shownFor = null;
  async function show(pokemon) {
    current = pokemon;
    controller?.abort();
    controller = new AbortController();
    const requestController = controller;
    const request = ++version;
    const timeout = setTimeout(() => requestController.abort(), 12000);
    container.hidden = false;
    select.disabled = true;
    select.replaceChildren();
    select.hidden = true;
    retry.hidden = true;
    status.textContent = "Consultando formas disponíveis…";
    try {
      const data = await getResource(
        `pokemon-species/${speciesNumber(pokemon)}`,
        requestController.signal,
      );
      if (request !== version) return;
      const varieties = (data.varieties || []).filter((entry) =>
        resourceId(entry.pokemon?.url),
      );
      // Older or incomplete species records must not invent alternative forms.
      if (varieties.length < 2) {
        status.textContent =
          "Nenhuma forma alternativa registrada para esta espécie.";
        shownFor = pokemon.id;
        return;
      }
      select.replaceChildren(
        ...varieties.map((entry) => {
          const option = document.createElement("option");
          option.value = resourceId(entry.pokemon.url);
          option.textContent = varietyLabel(entry);
          return option;
        }),
      );
      select.value = String(pokemon.id);
      shownFor = pokemon.id;
      select.hidden = false;
      select.disabled = busy;
      status.textContent = previewPokemonIds()
        ? "Selecione uma forma desta coleção offline. Tipos, atributos e imagens acompanham a escolha."
        : "Selecione uma forma para explorar seus tipos, atributos e imagens. A disponibilidade varia por jogo.";
    } catch {
      if (request !== version) return;
      status.textContent =
        "Não foi possível consultar as formas. Os detalhes atuais continuam disponíveis.";
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
    }
  }
  select.addEventListener("change", async () => {
    const chosen = Number(select.value);
    if (busy || !chosen || chosen === current?.id) return;
    await onSelect(chosen);
    // A failed Pokémon request preserves the currently displayed form.
    if (shownFor === current?.id) select.value = String(current.id);
  });
  retry.addEventListener("click", () => {
    if (current) show(current);
  });
  return {
    show,
    setBusy(value) {
      busy = value;
      select.disabled = busy || select.hidden;
    },
  };
}

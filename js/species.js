import { getResource, resourceId } from "./api.js";

const habitats = {
  cave: "Caverna",
  forest: "Floresta",
  grassland: "Pradaria",
  mountain: "Montanha",
  rare: "Raro",
  "rough-terrain": "Terreno acidentado",
  sea: "Mar",
  urban: "Área urbana",
  "waters-edge": "Margem de água",
};
const regions = [
  "Kanto",
  "Johto",
  "Hoenn",
  "Sinnoh",
  "Unova",
  "Kalos",
  "Alola",
  "Galar / Hisui",
  "Paldea",
];
const generations = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"];
export function preferredDescription(entries = []) {
  for (const language of ["pt-BR", "pt", "en"]) {
    const available = entries.filter(
      (entry) =>
        entry.language?.name === language &&
        typeof entry.flavor_text === "string" &&
        entry.flavor_text.trim(),
    );
    const entry = available.at(-1);
    if (entry)
      return {
        text: entry.flavor_text
          .replace(/[\f\r\n]+/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
        language,
      };
  }
  return null;
}

export function createSpeciesProfile() {
  const select = (selector) => document.querySelector(selector);
  const section = select(".species-section");
  const status = select("#species-status");
  const content = select("#species-content");
  const retry = select("#species-retry");
  let current = null,
    activeRequest = null,
    version = 0;
  async function show(pokemon) {
    current = pokemon;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const request = ++version;
    const timeout = setTimeout(() => controller.abort(), 12000);
    section.setAttribute("aria-busy", "true");
    content.hidden = true;
    retry.hidden = true;
    select("#species-tags").replaceChildren();
    status.textContent = "Consultando o diário de campo…";
    try {
      const data = await getResource(
        `pokemon-species/${resourceId(pokemon.species?.url) || pokemon.id}`,
        controller.signal,
      );
      if (request !== version) return;
      const description = preferredDescription(data.flavor_text_entries);
      select("#species-description").textContent =
        description?.text ||
        "A PokéAPI não fornece uma descrição disponível em português ou inglês para esta espécie.";
      select("#species-description").lang =
        description?.language === "en" ? "en" : "pt-BR";
      select("#species-language").textContent =
        description?.language === "en"
          ? "Descrição em inglês, conforme disponibilizada pela PokéAPI."
          : description
            ? "Descrição em português, disponibilizada pela PokéAPI."
            : "";
      const genera = data.genera || [];
      select("#species-genus").textContent =
        (
          genera.find((entry) => entry.language?.name === "pt-BR") ||
          genera.find((entry) => entry.language?.name === "pt") ||
          genera.find((entry) => entry.language?.name === "en")
        )?.genus || "Não informada";
      const generation = generations.indexOf(
        data.generation?.name?.replace("generation-", ""),
      );
      select("#species-generation").textContent =
        generation >= 0
          ? `${generation + 1}ª geração · ${regions[generation]}`
          : "Não informada";
      select("#species-habitat").textContent =
        habitats[data.habitat?.name] || "Não informado";
      select("#species-capture").textContent = Number.isFinite(
        data.capture_rate,
      )
        ? `${data.capture_rate} / 255`
        : "Não informada";
      const tags = [
        [data.is_baby, "Pokémon bebê"],
        [data.is_legendary, "Lendário"],
        [data.is_mythical, "Mítico"],
      ]
        .filter(([enabled]) => enabled)
        .map(([, label]) => {
          const tag = document.createElement("li");
          tag.className = "type";
          tag.textContent = label;
          return tag;
        });
      select("#species-tags").replaceChildren(...tags);
      content.hidden = false;
      status.textContent = "Informações da espécie registradas na PokéAPI.";
    } catch {
      if (request !== version) return;
      status.textContent =
        "Não foi possível carregar as informações da espécie. Os outros detalhes continuam disponíveis.";
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

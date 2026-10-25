import { getResource, resourceId, pokemonLabel, spriteImage } from "./api.js";
import { evolutionOptions } from "./evolution-conditions.js";

export function createEvolutionExplorer({ onSelect, types }) {
  const section = document.querySelector(".evolution-section");
  const status = document.querySelector("#evolution-status");
  const tree = document.querySelector("#evolution-tree");
  const retry = document.querySelector("#evolution-retry");
  let activeRequest = null;
  let version = 0;
  let currentPokemon = null;
  let ruleIndex = 0;
  const typeLabels = Object.fromEntries(
    Object.entries(types).map(([name, palette]) => [name, palette[0]]),
  );

  function appendOptions(container, options) {
    options.forEach((option, index) => {
      if (index) {
        const or = document.createElement("span");
        or.className = "evolution-or";
        or.textContent = "ou";
        container.append(or);
      }
      const text = document.createElement("p");
      text.className = "evolution-condition";
      text.textContent = option.text;
      container.append(text);
      if (option.game) {
        const game = document.createElement("small");
        game.className = "evolution-game";
        game.textContent = `Em ${option.game}`;
        container.append(game);
      }
    });
  }

  function evolutionNode(node, currentId, parentName = null) {
    const id = resourceId(node.species.url);
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "evolution-pokemon";
    button.dataset.pokemonId = id;
    button.setAttribute("aria-label", `Ver ${pokemonLabel(node.species.name)}`);
    if (id === currentId) button.setAttribute("aria-current", "true");
    const name = document.createElement("span");
    name.textContent = pokemonLabel(node.species.name);
    const number = document.createElement("small");
    number.textContent = `#${String(id).padStart(3, "0")}${id === currentId ? " · Atual" : ""}`;
    button.append(spriteImage(id), name, number);
    button.addEventListener("click", () => onSelect(id));
    const step = document.createElement("div");
    step.className = "evolution-step";
    step.append(button);
    if (parentName) {
      const options = evolutionOptions(node.evolution_details, typeLabels, {
        parentName,
        childName: node.species.name,
      });
      const conditions = document.createElement("div");
      conditions.className = "evolution-conditions";
      const primary = document.createElement("div");
      primary.id = `evolution-rule-${++ruleIndex}`;
      button.setAttribute("aria-describedby", primary.id);
      appendOptions(primary, options.primary);
      conditions.append(primary);
      if (options.alternatives.length) {
        const details = document.createElement("details");
        details.className = "evolution-alternatives";
        const summary = document.createElement("summary");
        summary.textContent = `Outras condições (${options.alternatives.length})`;
        details.append(summary);
        appendOptions(details, options.alternatives);
        conditions.append(details);
      }
      step.append(conditions);
    }
    item.append(step);
    if (node.evolves_to.length) {
      const branches = document.createElement("ul");
      branches.classList.toggle("evolution-fan", node.evolves_to.length > 3);
      branches.setAttribute(
        "aria-label",
        `Evoluções de ${pokemonLabel(node.species.name)}`,
      );
      branches.append(
        ...node.evolves_to.map((child) =>
          evolutionNode(child, currentId, node.species.name),
        ),
      );
      item.append(branches);
    }
    return item;
  }

  async function show(pokemon) {
    currentPokemon = pokemon;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const request = ++version;
    const timeout = setTimeout(() => controller.abort(), 12000);
    section.setAttribute("aria-busy", "true");
    status.textContent = "Descobrindo a família deste Pokémon…";
    tree.replaceChildren();
    retry.hidden = true;
    try {
      const speciesId = resourceId(pokemon.species?.url) || pokemon.id;
      const species = await getResource(
        `pokemon-species/${speciesId}`,
        controller.signal,
      );
      const chainId = resourceId(species.evolution_chain?.url);
      if (!chainId) throw new Error("No evolution data");
      const data = await getResource(
        `evolution-chain/${chainId}`,
        controller.signal,
      );
      if (request !== version) return;
      ruleIndex = 0;
      tree.replaceChildren(evolutionNode(data.chain, speciesId));
      status.textContent = data.chain.evolves_to.length
        ? "Siga as ramificações e selecione um Pokémon para conhecer seus detalhes."
        : "Este Pokémon não possui evoluções conhecidas.";
    } catch {
      if (request !== version) return;
      status.textContent =
        "Não foi possível carregar a linha evolutiva. Os detalhes do Pokémon continuam disponíveis.";
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (request === version) section.setAttribute("aria-busy", "false");
    }
  }
  retry.addEventListener("click", () => {
    if (currentPokemon) show(currentPokemon);
  });
  return { show };
}

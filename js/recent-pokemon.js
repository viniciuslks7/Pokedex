import { pokemonLabel, resourceId, spriteImage } from "./api.js";

export const MAX_RECENT = 12;
const KEY = "pokedex.recent.v1";

export function readRecent(text) {
  if (!text) return { enabled: true, items: [], recovered: false };
  if (typeof text !== "string" || text.length > 100000)
    throw Error("Invalid history");
  const data = JSON.parse(text);
  if (
    data?.version !== 1 ||
    typeof data.enabled !== "boolean" ||
    !Array.isArray(data.items)
  )
    throw Error("Invalid history");
  const seen = new Set();
  const items = data.items
    .filter((item) => {
      if (
        !item ||
        !Number.isSafeInteger(item.id) ||
        item.id <= 0 ||
        !Number.isSafeInteger(item.speciesId) ||
        item.speciesId <= 0 ||
        typeof item.name !== "string" ||
        !/^[a-z0-9-]{1,100}$/.test(item.name) ||
        seen.has(item.id)
      )
        return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, MAX_RECENT)
    .map(({ id, speciesId, name }) => ({ id, speciesId, name }));
  return {
    enabled: data.enabled,
    items,
    recovered: items.length !== data.items.length,
  };
}

export function rememberPokemon(items, pokemon) {
  return [
    { id: pokemon.id, name: pokemon.name, speciesId: pokemon.speciesId },
    ...items.filter((item) => item.id !== pokemon.id),
  ].slice(0, MAX_RECENT);
}

export function restoreRecent(items, removed) {
  const seen = new Set(items.map((item) => item.id));
  return [...items, ...removed.filter((item) => !seen.has(item.id))].slice(
    0,
    MAX_RECENT,
  );
}

export function createRecentPokemon({ onSelect }) {
  const select = (id) => document.querySelector(id),
    list = select("#recent-pokemon-list");
  const toggle = select("#recent-enabled"),
    clear = select("#recent-clear"),
    undo = select("#recent-undo");
  const status = select("#recent-status"),
    notice = select("#recent-notice");
  let enabled = true,
    items = [],
    removed = null;
  function warn(message) {
    notice.hidden = false;
    notice.textContent = message;
  }
  try {
    const saved = readRecent(localStorage.getItem(KEY));
    enabled = saved.enabled;
    items = saved.items;
    if (saved.recovered)
      warn(
        "Alguns registros inválidos foram ignorados. Os demais continuam disponíveis.",
      );
  } catch {
    warn(
      "Não foi possível recuperar o histórico. Você pode usá-lo nesta sessão.",
    );
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, enabled, items }));
      notice.hidden = true;
    } catch {
      warn(
        "O histórico e a pausa funcionam nesta sessão. O navegador não permitiu salvá-los para a próxima visita.",
      );
    }
  }
  function render() {
    toggle.checked = enabled;
    clear.disabled = !items.length;
    undo.hidden = !removed;
    select("#recent-count").textContent = `${items.length} / ${MAX_RECENT}`;
    select("#recent-empty").hidden = Boolean(items.length);
    list.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement("li"),
          button = document.createElement("button");
        button.type = "button";
        button.className = "recent-pokemon";
        button.dataset.pokemonId = item.id;
        button.setAttribute("aria-label", `Reabrir ${pokemonLabel(item.name)}`);
        const name = document.createElement("strong");
        name.textContent = pokemonLabel(item.name);
        const number = document.createElement("span");
        number.textContent = `#${String(item.speciesId).padStart(3, "0")}`;
        button.append(spriteImage(item.id), number, name);
        button.addEventListener("click", () => onSelect(item.id));
        li.append(button);
        return li;
      }),
    );
  }
  toggle.addEventListener("change", () => {
    enabled = toggle.checked;
    persist();
    render();
    status.textContent = enabled
      ? "Histórico ativado para os próximos Pokémon abertos."
      : "Histórico pausado. Os registros existentes continuam disponíveis.";
  });
  clear.addEventListener("click", () => {
    if (!items.length) return;
    removed = items;
    items = [];
    persist();
    render();
    status.textContent =
      "Histórico limpo. Você pode desfazer até recarregar a página ou limpar novamente.";
    undo.focus({ preventScroll: true });
  });
  undo.addEventListener("click", () => {
    if (!removed) return;
    items = restoreRecent(items, removed);
    removed = null;
    persist();
    render();
    status.textContent =
      "Histórico restaurado, preservando os acessos feitos depois da limpeza.";
    clear.focus({ preventScroll: true });
  });
  render();
  return {
    visit(pokemon) {
      if (!enabled) return;
      items = rememberPokemon(items, {
        id: pokemon.id,
        name: pokemon.name,
        speciesId: resourceId(pokemon.species?.url) || pokemon.id,
      });
      persist();
      render();
      status.textContent = "";
    },
  };
}

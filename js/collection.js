import { getResource, resourceId, pokemonLabel, spriteImage } from "./api.js";
import { notify, pop } from "./feedback.js";
import { createFilterPresets } from "./filter-presets.js";
import { createDexProgress } from "./dex-progress.js";
import {
  createAdvancedFilters,
  emptyAdvancedFilters,
  matchesAdvanced,
  sortAdvanced,
  hasAdvancedFacts,
} from "./advanced-filters.js";

const STORAGE_KEY = "pokedex.favorites.v1";
const PAGE_SIZE = 12;

export function createCollection({ types, onSelect }) {
  const select = (selector) => document.querySelector(selector);
  const favoriteButton = select("#favorite");
  const favoritesButton = select("#favorites-only");
  const notice = select("#favorites-notice");
  const typeFilter = select("#type-filter");
  const generationFilter = select("#generation-filter");
  const progressFilter = select("#progress-filter");
  const status = select("#collection-status");
  const retry = select("#collection-retry");
  const list = select("#collection-list");
  const results = select("#collection-results");
  const pagination = select(".collection-pagination");
  const previous = select("#collection-previous");
  const next = select("#collection-next");
  const favorites = new Map();
  let current = null;
  let busy = false;
  let onlyFavorites = false;
  let matches = [];
  let page = 0;
  let activeRequest = null;
  let version = 0;
  let advanced = emptyAdvancedFilters();
  const advancedControls = createAdvancedFilters({
    onApply(filters) {
      advanced = filters;
      refresh();
    },
  });
  const progress = createDexProgress({
    onChange() {
      refresh({ resetPage: false });
    },
  });

  function storageNotice(message) {
    notice.textContent = message;
    notice.hidden = false;
  }

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) throw new Error("Invalid favorites");
    for (const item of stored) {
      if (
        item &&
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        typeof item.name === "string" &&
        /^[a-z0-9-]+$/.test(item.name)
      ) {
        favorites.set(item.id, {
          id: item.id,
          name: item.name,
          speciesId:
            Number.isSafeInteger(item.speciesId) && item.speciesId > 0
              ? item.speciesId
              : item.id,
        });
      }
    }
  } catch {
    storageNotice(
      "Não foi possível recuperar seus favoritos. Você ainda pode criar uma coleção nesta sessão.",
    );
  }

  function updateFavoriteControls() {
    const saved = current && favorites.has(current.id);
    favoriteButton.disabled = busy || !current;
    favoriteButton.setAttribute("aria-pressed", String(Boolean(saved)));
    favoriteButton.textContent = saved ? "♥ Favoritado" : "♡ Favoritar";
    if (current)
      favoriteButton.setAttribute(
        "aria-label",
        `${saved ? "Remover" : "Adicionar"} ${pokemonLabel(current.name)} ${saved ? "dos" : "aos"} favoritos`,
      );
    select("#favorite-count").textContent = favorites.size;
    favoritesButton.setAttribute("aria-pressed", String(onlyFavorites));
  }

  function persistFavorites() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...favorites.values()]),
      );
      notice.hidden = true;
      notice.textContent = "";
      return true;
    } catch {
      storageNotice(
        "Seus favoritos estão disponíveis nesta sessão. O navegador não permitiu salvá-los para a próxima visita.",
      );
      return false;
    }
  }

  function renderPage() {
    const totalPages = Math.ceil(matches.length / PAGE_SIZE);
    page = Math.max(0, Math.min(page, totalPages - 1));
    list.replaceChildren(
      ...matches
        .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        .map((pokemon) => {
          const item = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.className = "collection-pokemon";
          button.dataset.pokemonId = pokemon.id;
          button.setAttribute(
            "aria-label",
            `Ver ${pokemonLabel(pokemon.name)}${favorites.has(pokemon.id) ? ", favorito" : ""}`,
          );
          const number = document.createElement("span");
          number.className = "collection-number";
          number.textContent = `#${String(pokemon.speciesId || pokemon.id).padStart(3, "0")}`;
          const name = document.createElement("span");
          name.className = "collection-name";
          name.textContent = pokemonLabel(pokemon.name);
          button.append(number, spriteImage(pokemon.id), name);
          const progressState = progress.state(pokemon.speciesId || pokemon.id);
          if (progressState) {
            const mark = document.createElement("span");
            mark.className = `collection-progress ${progressState}`;
            mark.textContent =
              progressState === "caught" ? "● Capturado" : "✓ Visto";
            button.append(mark);
            button.setAttribute(
              "aria-label",
              `${button.getAttribute("aria-label")}, ${progressState === "caught" ? "capturado" : "visto"}`,
            );
          }
          if (favorites.has(pokemon.id)) {
            const heart = document.createElement("span");
            heart.className = "collection-heart";
            heart.textContent = "♥";
            heart.setAttribute("aria-hidden", "true");
            button.append(heart);
          }
          if (pokemon.id === current?.id)
            button.setAttribute("aria-current", "true");
          button.addEventListener("click", () => onSelect(pokemon.id));
          item.append(button);
          return item;
        }),
    );
    pagination.hidden = totalPages <= 1;
    previous.disabled = page === 0;
    next.disabled = page >= totalPages - 1;
    select("#collection-page").textContent =
      `Página ${page + 1} de ${totalPages}`;
    status.textContent = matches.length
      ? `${matches.length} Pokémon ${matches.length === 1 ? "encontrado" : "encontrados"}${onlyFavorites ? " nos favoritos" : ""}. Exibindo ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, matches.length)}.`
      : onlyFavorites && !favorites.size
        ? "Sua coleção começa aqui. Use “Favoritar” nos detalhes de um Pokémon."
        : "Nenhum Pokémon corresponde a esses filtros. Experimente outra combinação.";
  }

  async function refresh({ resetPage = true } = {}) {
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const request = ++version;
    const timeout = setTimeout(() => controller.abort(), 12000);
    if (resetPage) page = 0;
    list.replaceChildren();
    pagination.hidden = true;
    retry.hidden = true;
    select("#collection-filter-notice").hidden = true;
    results.setAttribute("aria-busy", "true");
    select("#collection-progress-summary").hidden = true;
    status.textContent = "Buscando Pokémon na coleção…";
    const selectedType = typeFilter.value;
    const selectedGeneration = generationFilter.value;
    try {
      const [catalog, type, generation] = await Promise.all([
        onlyFavorites
          ? null
          : getResource("pokemon-species?limit=100000", controller.signal),
        selectedType
          ? getResource(`type/${selectedType}`, controller.signal)
          : null,
        selectedGeneration
          ? getResource(`generation/${selectedGeneration}`, controller.signal)
          : null,
      ]);
      if (request !== version) return;
      const entries = onlyFavorites
        ? [...favorites.values()]
        : catalog.results
            .map(({ name, url }) => ({
              id: resourceId(url),
              speciesId: resourceId(url),
              name,
            }))
            .filter(({ id }) => id);
      const typeIds =
        type &&
        new Set(type.pokemon.map(({ pokemon }) => resourceId(pokemon.url)));
      const generationIds =
        generation &&
        new Set(generation.pokemon_species.map(({ url }) => resourceId(url)));
      const candidates = entries.filter(
        (entry) =>
          (!typeIds || typeIds.has(entry.id)) &&
          (!generationIds || generationIds.has(entry.speciesId)),
      );
      const missing = candidates.filter(
        (entry) => !hasAdvancedFacts(entry, advanced),
      ).length;
      const filtered = sortAdvanced(
        candidates.filter(
          (entry) =>
            hasAdvancedFacts(entry, advanced) &&
            matchesAdvanced(entry, advanced),
        ),
        advanced,
      );
      progress.setPool(filtered);
      select("#collection-progress-summary").hidden = false;
      matches = filtered.filter((entry) =>
        progress.matches(entry, progressFilter.value),
      );
      const notice = select("#collection-filter-notice");
      notice.hidden = !missing;
      notice.textContent = `${missing} Pokémon com dados indisponíveis para estes filtros não aparecem nos resultados.`;
      renderPage();
    } catch {
      if (request !== version) return;
      status.textContent =
        "Não foi possível carregar a coleção. Tente novamente; a busca por nome ou número continua disponível.";
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (request === version) results.setAttribute("aria-busy", "false");
    }
  }

  for (const [value, [label]] of Object.entries(types).sort((a, b) =>
    a[1][0].localeCompare(b[1][0], "pt-BR"),
  )) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    typeFilter.append(option);
  }
  favoriteButton.addEventListener("click", () => {
    if (!current || busy) return;
    const wasSaved = favorites.has(current.id);
    if (favorites.has(current.id)) favorites.delete(current.id);
    else
      favorites.set(current.id, {
        id: current.id,
        name: current.name,
        speciesId: resourceId(current.species?.url) || current.id,
      });
    persistFavorites();
    updateFavoriteControls();
    notify(
      `${pokemonLabel(current.name)} ${wasSaved ? "removido dos" : "adicionado aos"} favoritos.`,
    );
    pop(favoriteButton);
    if (onlyFavorites) refresh({ resetPage: false });
    else if (results.getAttribute("aria-busy") === "false" && retry.hidden)
      renderPage();
  });
  favoritesButton.addEventListener("click", () => {
    onlyFavorites = !onlyFavorites;
    updateFavoriteControls();
    refresh();
  });
  typeFilter.addEventListener("change", () => refresh());
  generationFilter.addEventListener("change", () => refresh());
  progressFilter.addEventListener("change", () => refresh());
  select("#clear-filters").addEventListener("click", () => {
    typeFilter.value = "";
    generationFilter.value = "";
    progressFilter.value = "";
    onlyFavorites = false;
    advanced = emptyAdvancedFilters();
    advancedControls.reset();
    updateFavoriteControls();
    refresh();
  });
  retry.addEventListener("click", () => refresh({ resetPage: false }));
  function turnPage(offset) {
    page += offset;
    renderPage();
    select("#collection-heading").focus({ preventScroll: true });
    select("#collection-heading").scrollIntoView({ block: "start" });
  }
  previous.addEventListener("click", () => {
    if (!previous.disabled) turnPage(-1);
  });
  next.addEventListener("click", () => {
    if (!next.disabled) turnPage(1);
  });
  createFilterPresets({
    types,
    getFilters() {
      return {
        type: typeFilter.value,
        generation: generationFilter.value,
        onlyFavorites,
        progress: progressFilter.value,
        advanced,
      };
    },
    onApply(filters) {
      typeFilter.value = filters.type;
      generationFilter.value = filters.generation;
      onlyFavorites = filters.onlyFavorites;
      progressFilter.value = filters.progress;
      advanced = filters.advanced;
      advancedControls.set(advanced);
      updateFavoriteControls();
      refresh();
    },
  });
  updateFavoriteControls();
  refresh();

  return {
    snapshot() {
      return [...favorites.values()].map((entry) => ({ ...entry }));
    },
    progressSnapshot: progress.snapshot,
    restoreBackup(entries, progressEntries) {
      favorites.clear();
      entries.forEach((entry) => favorites.set(entry.id, { ...entry }));
      const saved = persistFavorites();
      const progressSaved =
        progressEntries === undefined
          ? true
          : progress.restore(progressEntries);
      updateFavoriteControls();
      refresh();
      return saved && progressSaved;
    },
    setCurrent(pokemon) {
      current = pokemon;
      progress.setCurrent(pokemon);
      updateFavoriteControls();
      for (const button of list.querySelectorAll("[data-pokemon-id]")) {
        if (Number(button.dataset.pokemonId) === current.id)
          button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      }
    },
    setBusy(value) {
      busy = value;
      progress.setBusy(value);
      updateFavoriteControls();
    },
  };
}

"use strict";

import { createCollection } from "./collection.js";
import { createEvolutionExplorer } from "./evolution.js";
import { createScene } from "./scene.js";
import { motionAllowed } from "./feedback.js";
import { createMatchups } from "./matchups.js";
import {
  getResource,
  previewPokemonIds,
  completedResourcePaths,
} from "./api.js";
import { createTrainer } from "./trainer.js";
import { createSpeciesProfile } from "./species.js";
import { createSearchSuggestions, normalizeSearch } from "./suggestions.js";
import { createFormExplorer, speciesNumber } from "./forms.js";
import { createThemeControl } from "./theme.js";
import { createBackupManager } from "./backup.js";
import { createOfflineApp } from "./offline-app.js";
import { createRecentPokemon } from "./recent-pokemon.js";
import { createAttackCoverage } from "./attack-coverage.js";
import { createSectionNavigation } from "./section-navigation.js";
import { createFieldNotes } from "./field-notes.js";

createThemeControl();

const select = (selector) => document.querySelector(selector);
const form = select(".search-form");
const input = select("#pokemon-search");
const card = select(".pokemon-card");
const image = select("#pokemon-image");
const placeholder = select("#image-placeholder");
const status = select("#status");
const previous = select("#previous");
const next = select("#next");
const shinyButton = select("#shiny");
const retryButton = select("#retry");
const randomButton = select(".random-button");
const cache = new Map();
const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});
const types = {
  normal: ["Normal", "#77745c", "#edece2"],
  fire: ["Fogo", "#b25129", "#f4e1d3"],
  water: ["Água", "#3979a1", "#dcebf2"],
  electric: ["Elétrico", "#967219", "#f5efcd"],
  grass: ["Planta", "#477a42", "#e6edda"],
  ice: ["Gelo", "#397d88", "#dff1ef"],
  fighting: ["Lutador", "#a34b43", "#f1e0da"],
  poison: ["Veneno", "#84519b", "#eadff0"],
  ground: ["Terra", "#9a713b", "#eee4d2"],
  flying: ["Voador", "#7166a8", "#e8e6f3"],
  psychic: ["Psíquico", "#b44e7b", "#f5dfe9"],
  bug: ["Inseto", "#72842d", "#ecedcf"],
  rock: ["Pedra", "#89783e", "#eae5d6"],
  ghost: ["Fantasma", "#6f5895", "#e5e0ee"],
  dragon: ["Dragão", "#6457a6", "#e4e0f3"],
  dark: ["Sombrio", "#6e6159", "#e5e1dd"],
  steel: ["Aço", "#647986", "#e2e9eb"],
  fairy: ["Fada", "#ae5e8f", "#f3e1ee"],
};
const statLabels = {
  hp: "HP",
  attack: "Ataque",
  defense: "Defesa",
  "special-attack": "Ataque esp.",
  "special-defense": "Defesa esp.",
  speed: "Velocidade",
};
let currentPokemon = null;
let activeRequest = null;
let requestVersion = 0;
let lastQuery = "1";
let isShiny = false;
let loading = false;
// National Pokédex fallback if the optional catalog request is unavailable.
let pokemonCount = 1025;
const offlineIds = previewPokemonIds();

function adjacentPokemon(offset) {
  const id = speciesNumber(currentPokemon);
  return offlineIds ? offlineIds[offlineIds.indexOf(id) + offset] : id + offset;
}

async function selectPokemon(id) {
  const data = await loadPokemon(id);
  if (!data) return;
  card.scrollIntoView({
    behavior: motionAllowed() ? "smooth" : "instant",
    block: "start",
  });
  select("#pokemon-name").focus({ preventScroll: true });
}

const scene = createScene();
const collection = createCollection({ types, onSelect: selectPokemon });
const evolution = createEvolutionExplorer({ onSelect: selectPokemon, types });
const matchups = createMatchups({ types });
const attackCoverage = createAttackCoverage({ types });
const trainer = createTrainer({ types, statLabels, onSelect: selectPokemon });
const species = createSpeciesProfile();
const forms = createFormExplorer({ onSelect: selectPokemon });
const suggestions = createSearchSuggestions({ onSelect: selectPokemon });
const recent = createRecentPokemon({ onSelect: selectPokemon });
const fieldNotes = createFieldNotes({ onSelect: selectPokemon });
createSectionNavigation();
const offlineApp = createOfflineApp({
  onSelect: selectPokemon,
  getVisitedPaths: completedResourcePaths,
});
createBackupManager({
  getSnapshot() {
    return {
      favorites: collection.snapshot(),
      progress: collection.progressSnapshot(),
      notes: fieldNotes.snapshot(),
      ...trainer.snapshot(),
    };
  },
  applySnapshot(data) {
    const favoritesSaved = collection.restoreBackup(
      data.favorites,
      data.progress,
    );
    const teamsSaved = trainer.restoreBackup(data);
    const notesSaved =
      data.notes === undefined ? true : fieldNotes.restore(data.notes);
    return favoritesSaved && teamsSaved && notesSaved;
  },
});

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function updateControls() {
  previous.disabled =
    loading ||
    !currentPokemon ||
    (offlineIds ? !adjacentPokemon(-1) : speciesNumber(currentPokemon) <= 1);
  next.disabled =
    loading ||
    !currentPokemon ||
    (offlineIds
      ? !adjacentPokemon(1)
      : speciesNumber(currentPokemon) >= pokemonCount);
  shinyButton.disabled = loading || !currentPokemon || !getSprites(true).length;
  collection.setBusy(loading);
  scene.setBusy(loading);
  trainer.setBusy(loading);
  forms.setBusy(loading);
  attackCoverage.setBusy(loading);
  fieldNotes.setBusy(loading);
}

function getSprites(shiny) {
  const sprites = currentPokemon?.sprites;
  if (!sprites) return [];
  const key = shiny ? "front_shiny" : "front_default";
  return [
    ...new Set(
      [
        sprites.versions?.["generation-v"]?.["black-white"]?.animated?.[key],
        sprites[key],
        sprites.other?.["official-artwork"]?.[key],
      ].filter(Boolean),
    ),
  ];
}

function showImage() {
  image.onload = null;
  image.onerror = null;
  image.hidden = true;
  placeholder.hidden = false;
  placeholder.textContent = "Carregando imagem…";
  const candidates = getSprites(isShiny);
  image.alt = `${currentPokemon.name}${isShiny ? " na versão shiny" : ""}`;
  image.onload = () => {
    image.hidden = false;
    placeholder.hidden = true;
  };
  image.onerror = () => {
    if (candidates.length) image.src = candidates.shift();
    else {
      image.hidden = true;
      placeholder.hidden = false;
      placeholder.textContent = "Imagem indisponível";
    }
  };
  if (candidates.length) image.src = candidates.shift();
  else {
    image.removeAttribute("src");
    placeholder.textContent = "Imagem indisponível";
  }
  shinyButton.setAttribute("aria-pressed", String(isShiny));
}

function renderDetails(data) {
  currentPokemon = data;
  isShiny = false;
  select("#pokemon-name").textContent = data.name.replaceAll("-", " ");
  select("#pokemon-number").textContent =
    `#${String(speciesNumber(data)).padStart(3, "0")}`;
  select("#pokemon-height").textContent =
    `${numberFormat.format(data.height / 10)} m`;
  select("#pokemon-weight").textContent =
    `${numberFormat.format(data.weight / 10)} kg`;
  select("#pokemon-abilities").textContent = data.abilities
    .map(({ ability }) => ability.name.replaceAll("-", " "))
    .join(" / ");
  const primaryType = types[data.types[0]?.type.name] || types.normal;
  card.style.setProperty("--type-color", primaryType[1]);
  card.style.setProperty("--stage-color", primaryType[2]);
  select("#pokemon-types").replaceChildren(
    ...data.types.map(({ type }) => {
      const badge = document.createElement("li");
      const palette = types[type.name] || [type.name, "#64705b", "#edf1e9"];
      badge.className = "type";
      badge.textContent = palette[0];
      badge.style.color = palette[1];
      badge.style.background = palette[2];
      return badge;
    }),
  );
  select("#pokemon-stats").replaceChildren(
    ...data.stats.map(({ stat, base_stat }, index) => {
      const row = document.createElement("li");
      row.className = "stat";
      row.style.setProperty("--row", index);
      const label = document.createElement("span");
      label.textContent = statLabels[stat.name] || stat.name;
      const value = document.createElement("span");
      value.className = "stat-value";
      value.textContent = base_stat;
      const meter = document.createElement("meter");
      meter.min = 0;
      meter.max = 255;
      meter.value = base_stat;
      meter.setAttribute(
        "aria-label",
        `${label.textContent}: ${base_stat} de 255`,
      );
      row.append(label, value, meter);
      return row;
    }),
  );
  select("#stats-total").textContent =
    `TOTAL ${data.stats.reduce((sum, stat) => sum + stat.base_stat, 0)}`;
  scene.setPokemon(data);
  showImage();
  collection.setCurrent(data);
  evolution.show(data);
  matchups.show(data);
  attackCoverage.setCurrent(data);
  trainer.setCurrent(data);
  species.show(data);
  fieldNotes.setCurrent(data);
  forms.show(data);
  offlineApp.visit(data);
}

async function loadPokemon(query, { recordVisit = true } = {}) {
  query = normalizeSearch(query);
  if (!query) {
    setStatus("Digite um nome ou número para começar.", true);
    input.focus();
    return;
  }
  // Normalize numbers such as 00025 while keeping API names (e.g. mr-mime).
  if (/^\d+$/.test(query)) query = String(Number(query));
  lastQuery = query;
  suggestions.close();
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const version = ++requestVersion;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 12000);
  loading = true;
  card.setAttribute("aria-busy", "true");
  retryButton.hidden = true;
  setStatus("Buscando seu próximo favorito…");
  updateControls();
  try {
    let data = cache.get(query);
    if (!data) {
      data = await getResource(
        `pokemon/${encodeURIComponent(query)}`,
        controller.signal,
      );
    }
    if (version !== requestVersion) return;
    cache.set(String(data.id), data);
    cache.set(data.name, data);
    renderDetails(data);
    if (recordVisit) recent.visit(data);
    setStatus(
      `${data.name.replaceAll("-", " ")} encontrado. Explore os detalhes abaixo.`,
    );
    return data;
  } catch (error) {
    if (version !== requestVersion) return;
    if (error.name === "AbortError" && !timedOut) return;
    const message =
      error.code === "preview-missing"
        ? "Este Pokémon não está na coleção offline. Escolha um dos Pokémon do catálogo abaixo."
        : error.code === "offline-missing"
          ? "Este Pokémon ainda não foi guardado para uso offline. Abra um dos Pokémon guardados ou conecte-se para consultar outro."
          : error.status === 404
            ? "Pokémon não encontrado. Confira o nome ou tente outro número."
            : timedOut
              ? "A busca demorou mais que o esperado. Tente novamente."
              : "Não foi possível conectar à PokéAPI. Verifique sua conexão e tente novamente.";
    setStatus(message, true);
    retryButton.hidden = false;
    if (!currentPokemon) {
      select("#pokemon-name").textContent = "Vamos tentar de novo?";
      placeholder.textContent = "Sua aventura já vai começar.";
    }
  } finally {
    clearTimeout(timeout);
    if (version === requestVersion) {
      loading = false;
      card.setAttribute("aria-busy", "false");
      updateControls();
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadPokemon(input.value);
});
previous.addEventListener("click", () => {
  if (currentPokemon && !previous.disabled) loadPokemon(adjacentPokemon(-1));
});
next.addEventListener("click", () => {
  if (currentPokemon && !next.disabled) loadPokemon(adjacentPokemon(1));
});
randomButton.addEventListener("click", () => {
  if (offlineIds) {
    let index = Math.floor(Math.random() * offlineIds.length);
    if (offlineIds[index] === speciesNumber(currentPokemon))
      index = (index + 1) % offlineIds.length;
    loadPokemon(offlineIds[index]);
    return;
  }
  let id = Math.floor(Math.random() * pokemonCount) + 1;
  if (id === speciesNumber(currentPokemon)) id = (id % pokemonCount) + 1;
  loadPokemon(id);
});
shinyButton.addEventListener("click", () => {
  if (shinyButton.disabled) return;
  isShiny = !isShiny;
  scene.setShiny(isShiny);
  showImage();
});
retryButton.addEventListener("click", () => loadPokemon(lastQuery));

for (const button of document.querySelectorAll(".quick-picks [data-query]")) {
  button.addEventListener("click", () => {
    input.value = button.textContent.trim();
    loadPokemon(button.dataset.query);
  });
}

document.addEventListener("keydown", (event) => {
  if (
    event.defaultPrevented ||
    document.querySelector("#section-menu[open]") ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="region"][tabindex="0"]',
    )
  )
    return;
  if (event.key === "/") {
    event.preventDefault();
    input.focus();
    input.select();
  } else if (event.key === "ArrowLeft" && !previous.disabled) {
    event.preventDefault();
    previous.click();
  } else if (event.key === "ArrowRight" && !next.disabled) {
    event.preventDefault();
    next.click();
  }
});

// Catalog metadata is optional: a failure must not block Pokémon searches.
getResource("pokemon-species?limit=1", AbortSignal.timeout(8000))
  .then((data) => {
    if (Number.isInteger(data?.count) && data.count > 0) {
      pokemonCount = data.count;
      updateControls();
    }
  })
  .catch(() => {});
loadPokemon(1, { recordVisit: false });

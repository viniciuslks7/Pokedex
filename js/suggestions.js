import { getResource, pokemonLabel, resourceId } from "./api.js";

export function normalizeSearch(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findSuggestions(entries, value, limit = 7) {
  const query = normalizeSearch(value);
  if (!query) return [];
  const numeric = /^\d+$/.test(query) ? Number(query) : null;
  return entries
    .map((entry) => {
      const name = normalizeSearch(entry.name);
      const rank =
        numeric !== null
          ? entry.id === numeric
            ? 0
            : -1
          : name === query
            ? 0
            : name.startsWith(query)
              ? 1
              : name.includes(`-${query}`)
                ? 2
                : name.includes(query)
                  ? 3
                  : -1;
      return { entry, rank };
    })
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.entry.id - b.entry.id)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function createSearchSuggestions({ onSelect }) {
  const input = document.querySelector("#pokemon-search");
  const panel = document.querySelector("#search-suggestions");
  const list = document.querySelector("#suggestions-list");
  const status = document.querySelector("#suggestions-status");
  let catalog = null,
    pending = null,
    timer = null;
  let version = 0,
    matches = [],
    active = -1,
    composing = false;

  function close() {
    clearTimeout(timer);
    version++;
    matches = [];
    active = -1;
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
  function highlight(index) {
    active = index;
    [...list.children].forEach((item, i) =>
      item.setAttribute("aria-selected", String(i === active)),
    );
    if (active >= 0) {
      input.setAttribute("aria-activedescendant", list.children[active].id);
      list.children[active].scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  function choose(index) {
    const entry = matches[index];
    if (!entry) return;
    input.value = pokemonLabel(entry.name);
    close();
    onSelect(entry.id);
  }
  async function getCatalog() {
    if (catalog) return catalog;
    if (!pending)
      pending = getResource("pokemon?limit=100000", AbortSignal.timeout(8000))
        .then((data) => {
          catalog = data.results
            .map(({ name, url }) => ({ name, id: resourceId(url) }))
            .filter((entry) => entry.id && typeof entry.name === "string");
          return catalog;
        })
        .finally(() => {
          pending = null;
        });
    return pending;
  }
  async function show(request, value) {
    if (request !== version || document.activeElement !== input) return;
    panel.hidden = false;
    list.replaceChildren();
    status.textContent = "Buscando sugestões…";
    try {
      const entries = await getCatalog();
      if (request !== version || document.activeElement !== input) return;
      matches = findSuggestions(entries, value);
      active = -1;
      list.replaceChildren(
        ...matches.map((entry, index) => {
          const option = document.createElement("li");
          option.id = `suggestion-${index}`;
          option.role = "option";
          option.setAttribute("aria-selected", "false");
          const name = document.createElement("span");
          name.textContent = pokemonLabel(entry.name);
          const detail = document.createElement("small");
          detail.textContent =
            entry.id < 10000
              ? `#${String(entry.id).padStart(3, "0")}`
              : "Forma alternativa";
          option.append(name, detail);
          option.addEventListener("pointerdown", (event) =>
            event.preventDefault(),
          );
          option.addEventListener("click", () => choose(index));
          return option;
        }),
      );
      input.setAttribute("aria-expanded", String(Boolean(matches.length)));
      status.textContent = matches.length
        ? `${matches.length} sugestões. Use ↑ ↓ e Enter para escolher.`
        : "Nenhuma sugestão. Você ainda pode buscar pelo nome ou número.";
    } catch {
      if (request !== version || document.activeElement !== input) return;
      status.textContent =
        "Sugestões indisponíveis. A busca por nome ou número continua disponível.";
    }
  }
  function schedule() {
    close();
    if (composing || !normalizeSearch(input.value)) return;
    const request = version,
      value = input.value;
    timer = setTimeout(() => show(request, value), 180);
  }
  input.addEventListener("input", schedule);
  input.addEventListener("focus", schedule);
  input.addEventListener("compositionstart", () => {
    composing = true;
    close();
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    schedule();
  });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (event) => {
    if (event.isComposing || composing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") close();
    else if (matches.length && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      highlight(
        event.key === "ArrowDown"
          ? (active + 1) % matches.length
          : (active <= 0 ? matches.length : active) - 1,
      );
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(active);
    }
  });
  document.querySelector(".search-form").addEventListener("submit", close);
  return { close };
}

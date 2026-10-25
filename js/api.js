const resources = new Map();
const preview = globalThis.__POKEDEX_OFFLINE_PREVIEW__;
export function completedResourcePaths() {
  return [...resources.keys()];
}
function consulted(path) {
  if (typeof document !== "undefined")
    document.dispatchEvent(
      new CustomEvent("pokedex:resource", { detail: { path } }),
    );
}

export function previewPokemonIds() {
  return preview?.version === 1 ? preview.ids : null;
}

// Cache completed public API responses, never rejected or aborted requests.
export async function getResource(path, signal) {
  signal.throwIfAborted();
  if (preview?.version === 1) {
    let data;
    if (path.startsWith("pokemon/")) {
      const query = decodeURIComponent(path.slice("pokemon/".length));
      const id = preview.pokemon[query] ? query : preview.names[query];
      data = preview.pokemon[id];
    } else data = preview.resources[path];
    if (!data) {
      const error = new Error("Not included in offline preview");
      error.code = "preview-missing";
      throw error;
    }
    return data;
  }
  if (resources.has(path)) {
    consulted(path);
    return resources.get(path);
  }
  const response = await fetch(`https://pokeapi.co/api/v2/${path}`, { signal });
  if (!response.ok) {
    const error = new Error(`PokéAPI: ${response.status}`);
    error.status = response.status;
    if (response.headers.get("X-Pokedex-Offline") === "missing")
      error.code = "offline-missing";
    throw error;
  }
  const data = await response.json();
  signal.throwIfAborted();
  resources.set(path, data);
  consulted(path);
  return data;
}

export function resourceId(url) {
  const match = String(url || "").match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

export function pokemonLabel(name) {
  return name.replaceAll("-", " ");
}

export function spriteImage(id) {
  const image = document.createElement("img");
  if (preview?.version === 1) {
    const source = preview.pokemon[id]?.sprites.front_default;
    if (source) image.src = source;
    else image.hidden = true;
  } else
    image.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  image.alt = "";
  image.width = 64;
  image.height = 64;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener(
    "error",
    () => {
      image.hidden = true;
    },
    { once: true },
  );
  return image;
}

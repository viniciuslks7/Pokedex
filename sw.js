/* Public application data only. Personal teams/favorites remain in localStorage. */
importScripts("./offline-assets.js");
const { version, files } = self.POKEDEX_OFFLINE_ASSETS;
const scope = new URL(self.registration.scope);
const prefix = `pokedex-${encodeURIComponent(scope.pathname)}-`;
const SHELL = prefix + "shell-" + version,
  API = prefix + "api-v1",
  MEDIA = prefix + "media-v1";
const API_ROOT = "https://pokeapi.co/api/v2/";
const shellUrls = new Set(files.map((file) => new URL(file, scope).href));
const indexUrl = new URL("index.html", scope).href;
let queue = Promise.resolve();
function serial(action) {
  const next = queue.then(action);
  queue = next.catch(() => {});
  return next;
}
async function boundedPut(name, request, response, limit) {
  const cache = await caches.open(name);
  await cache.delete(request);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - limit)))
    await cache.delete(key);
}
async function announce() {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  clients.forEach((client) =>
    client.postMessage({ type: "POKEDEX_CACHE_UPDATED" }),
  );
}
async function timedFetch(request, timeout = 7000) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeout);
  const abort = () => controller.abort();
  request.signal?.addEventListener("abort", abort, { once: true });
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", abort);
  }
}
function normalizedApiUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.href;
}
async function cacheApi(request, response) {
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    return;
  const url = normalizedApiUrl(request.url),
    pokemon = /\/api\/v2\/pokemon\/[^/?]+$/.test(new URL(url).pathname);
  let data;
  if (pokemon) {
    try {
      data = await response.clone().json();
    } catch {
      return;
    }
  }
  await serial(async () => {
    await boundedPut(API, url, response.clone(), 300);
    if (
      data &&
      Number.isSafeInteger(data.id) &&
      data.id > 0 &&
      /^[a-z0-9-]+$/.test(data.name)
    ) {
      for (const alias of [data.id, data.name])
        await boundedPut(
          API,
          `${API_ROOT}pokemon/${alias}`,
          response.clone(),
          300,
        );
    }
  });
  if (pokemon) await announce();
  return data || null;
}
async function cachePokemonMedia(data) {
  if (!data) return;
  const sprites = data.sprites || {};
  const urls = [
    sprites.front_default,
    sprites.front_shiny,
    sprites.versions?.["generation-v"]?.["black-white"]?.animated
      ?.front_default,
    data.cries?.latest || data.cries?.legacy,
  ];
  await Promise.all(
    [...new Set(urls.filter(Boolean))].map(async (value) => {
      try {
        const url = new URL(value);
        if (
          url.hostname === "raw.githubusercontent.com" &&
          /^\/PokeAPI\/(sprites|cries)\//.test(url.pathname)
        )
          await mediaResponse(
            new Request(url, { mode: "cors", credentials: "omit" }),
          );
      } catch {}
    }),
  );
  await announce();
}
async function apiResponse(request, event) {
  try {
    const response = await timedFetch(request);
    if (response.ok) {
      try {
        const data = await cacheApi(request, response);
        if (data) event.waitUntil(cachePokemonMedia(data));
      } catch {
        /* Browsing still works if storage is full. */
      }
    }
    return response;
  } catch {
    try {
      const saved = await (
        await caches.open(API)
      ).match(normalizedApiUrl(request.url));
      if (saved) return saved;
    } catch {}
    return new Response(JSON.stringify({ error: "offline-missing" }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "X-Pokedex-Offline": "missing",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
async function rangeResponse(response, range) {
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return response;
  const buffer = await response.arrayBuffer(),
    length = buffer.byteLength;
  let start = match[1]
      ? Number(match[1])
      : Math.max(0, length - Number(match[2])),
    end =
      match[2] && match[1]
        ? Math.min(Number(match[2]), length - 1)
        : length - 1;
  if (!Number.isSafeInteger(start) || start > end || start >= length)
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${length}` },
    });
  const headers = new Headers(response.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${length}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Accept-Ranges", "bytes");
  return new Response(buffer.slice(start, end + 1), { status: 206, headers });
}
async function mediaResponse(request) {
  try {
    const saved = await (await caches.open(MEDIA)).match(request.url);
    if (saved) return rangeResponse(saved, request.headers.get("range"));
  } catch {}
  try {
    const response = await timedFetch(
      new Request(request.url, { mode: "cors", credentials: "omit" }),
    );
    if (
      response.ok &&
      /^(image|audio)\//.test(response.headers.get("content-type") || "")
    ) {
      try {
        await serial(() =>
          boundedPut(MEDIA, request.url, response.clone(), 300),
        );
      } catch {}
      return rangeResponse(response, request.headers.get("range"));
    }
    return response;
  } catch {
    try {
      return await fetch(request);
    } catch {
      return Response.error();
    }
  }
}
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      try {
        await cache.addAll([...shellUrls]);
      } catch (error) {
        await caches.delete(SHELL);
        throw error;
      }
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith(prefix + "shell-") && name !== SHELL,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
      await announce();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.href.startsWith(API_ROOT)) {
    event.respondWith(apiResponse(request, event));
    return;
  }
  if (
    url.hostname === "raw.githubusercontent.com" &&
    /^\/PokeAPI\/(sprites|cries)\//.test(url.pathname)
  ) {
    event.respondWith(mediaResponse(request));
    return;
  }
  if (url.origin !== scope.origin) return;
  if (
    request.mode === "navigate" &&
    [scope.pathname, new URL(indexUrl).pathname].includes(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const saved = await (await caches.open(SHELL)).match(indexUrl);
        if (saved) return saved;
        try {
          return await timedFetch(request, 3500);
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }
  const clean = new URL(url);
  clean.search = "";
  clean.hash = "";
  if (shellUrls.has(clean.href))
    event.respondWith(
      (async () =>
        (await (await caches.open(SHELL)).match(clean.href)) ||
        fetch(request))(),
    );
});
async function cachedPokemon() {
  const cache = await caches.open(API),
    keys = await cache.keys(),
    pokemon = [];
  for (const request of keys) {
    if (!/\/api\/v2\/pokemon\/\d+$/.test(new URL(request.url).pathname))
      continue;
    try {
      const data = await (await cache.match(request)).json();
      const species = String(data.species?.url || "").match(/\/(\d+)\/?$/);
      if (Number.isSafeInteger(data.id) && typeof data.name === "string")
        pokemon.push({
          id: data.id,
          name: data.name,
          speciesId: species ? Number(species[1]) : data.id,
        });
    } catch {}
  }
  return pokemon.sort((a, b) => a.id - b.id);
}
self.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type === "POKEDEX_SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (message.type === "POKEDEX_STATUS")
    event.waitUntil(
      (async () => {
        try {
          event.ports[0]?.postMessage({
            ok: true,
            version,
            pokemon: await cachedPokemon(),
          });
        } catch {
          event.ports[0]?.postMessage({ ok: false });
        }
      })(),
    );
  if (message.type === "POKEDEX_CLEAR_DATA")
    event.waitUntil(
      (async () => {
        try {
          await serial(async () => {
            await caches.delete(API);
            await caches.delete(MEDIA);
          });
          event.ports[0]?.postMessage({ ok: true });
          await announce();
        } catch {
          event.ports[0]?.postMessage({ ok: false });
        }
      })(),
    );
  if (message.type === "POKEDEX_WARM")
    event.waitUntil(
      (async () => {
        const paths = [
          ...new Set(Array.isArray(message.paths) ? message.paths : []),
        ]
          .filter(
            (path) =>
              typeof path === "string" &&
              /^(pokemon|pokemon-species|type|generation|evolution-chain)(\/[a-z0-9-]+)?(\?limit=\d+)?$/.test(
                path,
              ),
          )
          .slice(0, 50);
        let index = 0;
        await Promise.all(
          Array.from({ length: Math.min(4, paths.length) }, async () => {
            while (index < paths.length) {
              const path = paths[index++],
                url = API_ROOT + path;
              try {
                if (await (await caches.open(API)).match(normalizedApiUrl(url)))
                  continue;
                const request = new Request(url, {
                  mode: "cors",
                  credentials: "omit",
                });
                const response = await timedFetch(request);
                const data = await cacheApi(request, response);
                await cachePokemonMedia(data);
              } catch {}
            }
          }),
        );
        await announce();
      })(),
    );
});

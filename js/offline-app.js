import { pokemonLabel } from "./api.js";

export function supportsOfflineApp({
  singleFile,
  protocol,
  secure,
  serviceWorker,
}) {
  return (
    !singleFile &&
    ["http:", "https:"].includes(protocol) &&
    secure &&
    serviceWorker
  );
}

export function createOfflineApp({ onSelect, getVisitedPaths }) {
  const select = (id) => document.querySelector(id),
    status = select("#offline-app-status"),
    list = select("#offline-pokemon-list");
  const install = select("#install-app"),
    update = select("#update-app"),
    retry = select("#offline-app-retry"),
    clear = select("#offline-app-clear");
  let registration = null,
    prompt = null,
    worker = null,
    reloading = false,
    started = false,
    refreshVersion = 0,
    timer = null;
  const warmed = new Set();
  const eligible = supportsOfflineApp({
    singleFile: Boolean(globalThis.__POKEDEX_SINGLE_FILE__),
    protocol: location.protocol,
    secure: isSecureContext,
    serviceWorker: "serviceWorker" in navigator,
  });
  function tellWorker(message, target = worker) {
    return new Promise((resolve, reject) => {
      if (!target) {
        reject(Error("Worker unavailable"));
        return;
      }
      const channel = new MessageChannel(),
        timeout = setTimeout(() => {
          channel.port1.close();
          reject(Error("Worker timeout"));
        }, 4000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(event.data);
      };
      try {
        target.postMessage(message, [channel.port2]);
      } catch (error) {
        clearTimeout(timeout);
        channel.port1.close();
        reject(error);
      }
    });
  }
  async function refresh() {
    if (!worker) return;
    const request = ++refreshVersion;
    try {
      const data = await tellWorker({ type: "POKEDEX_STATUS" });
      if (request !== refreshVersion) return;
      if (!data.ok) throw Error("Storage unavailable");
      select("#offline-pokemon-count").textContent = String(
        data.pokemon.length,
      );
      clear.disabled = !data.pokemon.length;
      list.replaceChildren(
        ...data.pokemon.map((pokemon) => {
          const item = document.createElement("li"),
            button = document.createElement("button");
          button.type = "button";
          button.textContent = `#${String(pokemon.speciesId).padStart(3, "0")} · ${pokemonLabel(pokemon.name)}`;
          button.addEventListener("click", () => onSelect(pokemon.id));
          item.append(button);
          return item;
        }),
      );
      status.textContent = navigator.onLine
        ? `Aplicativo pronto para reabrir sem conexão. ${data.pokemon.length} Pokémon consultados guardados neste navegador.`
        : `Sem conexão. ${data.pokemon.length} Pokémon guardados disponíveis; escolha um deles abaixo.`;
      retry.hidden = true;
    } catch {
      if (request === refreshVersion) {
        status.textContent =
          "A navegação continua disponível. Não foi possível conferir os dados offline neste navegador.";
        retry.hidden = false;
      }
    }
  }
  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 100);
  }
  function warm(paths) {
    if (!worker) return;
    const missing = paths.filter((path) => !warmed.has(path));
    if (!missing.length) return;
    missing.forEach((path) => warmed.add(path));
    worker.postMessage({ type: "POKEDEX_WARM", paths: missing });
  }
  function ready(active) {
    worker = navigator.serviceWorker.controller || active;
    clear.hidden = false;
    select("#offline-catalog").hidden = false;
    warm(getVisitedPaths());
    refresh();
  }
  function waiting() {
    if (registration?.waiting && navigator.serviceWorker.controller) {
      update.hidden = false;
      update.textContent = "Atualizar aplicativo";
    }
  }
  async function start() {
    if (started && registration) {
      registration.update().catch(() => {});
      refresh();
      return;
    }
    started = true;
    retry.hidden = true;
    status.textContent = "Preparando o aplicativo para abrir sem conexão…";
    try {
      registration = await navigator.serviceWorker.register(
        new URL("sw.js", document.baseURI),
        {
          scope: new URL("./", document.baseURI).pathname,
          updateViaCache: "none",
        },
      );
      if (registration.active) {
        ready(registration.active);
        registration.update().catch(() => {});
      }
      waiting();
      function watch(worker) {
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") {
            if (navigator.serviceWorker.controller) waiting();
          }
          if (worker.state === "redundant" && !registration.active) {
            started = false;
            status.textContent =
              "Não foi possível preparar o acesso offline. Você pode continuar navegando e tentar novamente.";
            retry.hidden = false;
          }
        });
      }
      watch(registration.installing);
      registration.addEventListener("updatefound", () =>
        watch(registration.installing),
      );
      navigator.serviceWorker.ready
        .then((value) => ready(value.active))
        .catch(() => {});
    } catch {
      started = false;
      status.textContent =
        "O acesso offline não está disponível aqui. A busca e os outros recursos continuam funcionando.";
      retry.hidden = false;
    }
  }
  if (!eligible) {
    status.textContent = globalThis.__POKEDEX_OFFLINE_PREVIEW__
      ? "Esta prévia já contém uma coleção para usar sem Internet. A instalação como aplicativo fica disponível no site aberto em um navegador compatível."
      : globalThis.__POKEDEX_SINGLE_FILE__
        ? "Arquivo de prévia: as consultas usam a Internet. A instalação e o armazenamento offline ficam disponíveis na versão do site."
        : "Para instalar e guardar consultas offline, abra o site em HTTPS em um navegador compatível.";
    return { visit() {} };
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event;
    install.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    install.hidden = true;
    prompt = null;
    select("#app-install-status").textContent = "Aplicativo instalado.";
  });
  install.addEventListener("click", async () => {
    if (!prompt) return;
    const current = prompt;
    prompt = null;
    install.disabled = true;
    try {
      await current.prompt();
      const choice = await current.userChoice;
      select("#app-install-status").textContent =
        choice.outcome === "accepted"
          ? "Instalação solicitada ao navegador."
          : "Você pode continuar usando a Pokédex pelo navegador.";
    } catch {
      select("#app-install-status").textContent =
        "Use o menu do navegador e procure “Instalar aplicativo” ou “Adicionar à tela de início”.";
    } finally {
      install.hidden = true;
      install.disabled = false;
    }
  });
  update.addEventListener("click", () => {
    if (registration?.waiting) {
      reloading = true;
      update.disabled = true;
      registration.waiting.postMessage({ type: "POKEDEX_SKIP_WAITING" });
    }
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) {
      location.reload();
      return;
    }
    ready(navigator.serviceWorker.controller);
  });
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "POKEDEX_CACHE_UPDATED") scheduleRefresh();
  });
  document.addEventListener("pokedex:resource", (event) =>
    warm([event.detail.path]),
  );
  window.addEventListener("online", () => {
    warmed.clear();
    warm(getVisitedPaths());
    refresh();
  });
  window.addEventListener("offline", refresh);
  clear.addEventListener("click", async () => {
    clear.disabled = true;
    try {
      const result = await tellWorker({ type: "POKEDEX_CLEAR_DATA" });
      if (!result.ok) throw Error();
      warmed.clear();
      await refresh();
      select("#offline-action-status").textContent =
        "Pokémon guardados offline removidos. Favoritos e equipes permanecem salvos.";
    } catch {
      select("#offline-action-status").textContent =
        "Não foi possível limpar os dados offline. Tente novamente.";
      clear.disabled = false;
    }
  });
  retry.addEventListener("click", start);
  start();
  return {
    visit(pokemon) {
      warm([`pokemon/${pokemon.id}`]);
    },
  };
}

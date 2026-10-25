import { getResource, pokemonLabel, spriteImage } from "./api.js";
import { motionAllowed } from "./feedback.js";

const PREFIX = "pokedex-team:";

export function teamCode(ids) {
  const code = `v1:${ids.join(",")}`;
  // Use one strict format for links, clipboard codes and imported teams.
  parseSharedTeam(PREFIX + code);
  return PREFIX + code;
}

export function parseSharedTeam(value) {
  value = String(value).trim();
  if (value.length > 2048) throw Error("Invalid team");
  let payload;
  if (value.startsWith(PREFIX)) payload = value.slice(PREFIX.length);
  else {
    let hash;
    if (value.startsWith("#")) hash = value;
    else {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol))
        throw Error("Invalid URL");
      hash = url.hash;
    }
    const parameters = new URLSearchParams(hash.slice(1));
    if (parameters.getAll("team").length !== 1) throw Error("Invalid team");
    payload = parameters.get("team");
  }
  if (!/^v1:[1-9]\d*(?:,[1-9]\d*){0,5}$/.test(payload || ""))
    throw Error("Invalid team");
  const ids = payload.slice(3).split(",").map(Number);
  if (
    ids.some((id) => !Number.isSafeInteger(id)) ||
    new Set(ids).size !== ids.length
  )
    throw Error("Invalid team");
  return ids;
}

export function shareTeamValue(ids, address) {
  const code = teamCode(ids);
  const url = new URL(address);
  const local =
    ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname) ||
    url.hostname.endsWith(".localhost") ||
    /^127\./.test(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || local)
    return { value: code, kind: "code" };
  url.search = "";
  url.hash = `team=${code.slice(PREFIX.length)}`;
  return { value: url.href, kind: "link" };
}

export function createTeamSharing({ getMembers, onImport, onSelect }) {
  const select = (id) => document.querySelector(id);
  const share = select("#team-share");
  const output = select("#team-share-output");
  const field = select("#team-share-value");
  const shareStatus = select("#team-share-status");
  const panel = select("#shared-team-panel");
  const status = select("#shared-team-status");
  const list = select("#shared-team-list");
  const importButton = select("#shared-team-import");
  const retry = select("#shared-team-retry");
  let signature = "",
    controller = null,
    version = 0,
    pending = [],
    lastInput = "";

  function clearFragment() {
    if (!new URLSearchParams(location.hash.slice(1)).has("team")) return;
    try {
      const url = new URL(location.href);
      url.hash = "team-heading";
      history.replaceState(null, "", url.href);
    } catch {
      /* Some viewers deny history access. */
    }
  }
  function dismiss() {
    controller?.abort();
    version++;
    pending = [];
    panel.hidden = true;
    clearFragment();
  }
  async function preview(value) {
    controller?.abort();
    controller = new AbortController();
    const requestController = controller;
    const signal = requestController.signal,
      request = ++version;
    const timeout = setTimeout(() => requestController.abort(), 12000);
    lastInput = value;
    pending = [];
    panel.hidden = false;
    list.replaceChildren();
    importButton.disabled = true;
    retry.hidden = true;
    status.textContent = "Consultando a equipe compartilhada…";
    select("#shared-team-heading").scrollIntoView({
      behavior: motionAllowed() ? "smooth" : "instant",
      block: "start",
    });
    select("#shared-team-heading").focus({ preventScroll: true });
    try {
      let ids;
      try {
        ids = parseSharedTeam(value);
      } catch {
        status.textContent =
          "Link ou código de equipe inválido. Use uma equipe com até seis Pokémon diferentes.";
        return;
      }
      const results = await Promise.allSettled(
        ids.map((id) => getResource(`pokemon/${id}`, signal)),
      );
      if (request !== version) return;
      let failures = 0,
        offlineMissing = false;
      results.forEach((result, index) => {
        const item = document.createElement("li");
        if (result.status === "fulfilled" && result.value.id === ids[index]) {
          const pokemon = result.value;
          pending.push(pokemon);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "shared-team-member";
          const name = document.createElement("span");
          name.textContent = pokemonLabel(pokemon.name);
          button.append(spriteImage(pokemon.id), name);
          button.addEventListener("click", () => onSelect(pokemon.id));
          item.append(button);
        } else {
          failures++;
          offlineMissing ||= result.reason?.code === "preview-missing";
          item.className = "shared-team-unavailable";
          item.textContent = `Pokémon ${ids[index]} · indisponível`;
        }
        list.append(item);
      });
      if (failures) {
        status.textContent = offlineMissing
          ? "Esta equipe contém Pokémon fora da coleção offline. Importe o código na versão online para carregar todos os integrantes."
          : "Não foi possível consultar todos os integrantes. Tente novamente; sua equipe atual continua salva.";
        retry.hidden = offlineMissing;
        pending = [];
      } else {
        status.textContent = `${pending.length} ${pending.length === 1 ? "integrante pronto" : "integrantes prontos"}. Ao carregar, esta equipe substituirá a atual.`;
        importButton.disabled = false;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  share.addEventListener("click", () => {
    const members = getMembers();
    if (!members.length) return;
    const result = shareTeamValue(
      members.map((member) => member.id),
      location.href,
    );
    output.hidden = false;
    field.value = result.value;
    shareStatus.textContent =
      result.kind === "link"
        ? "Copie o link para compartilhar esta equipe. Quem abrir poderá conferir os integrantes antes de carregá-la."
        : "Copie o código e use “Importar equipe” em outra Pokédex. Um link público fica disponível quando o site é hospedado na web.";
    select("#team-share-label").textContent =
      result.kind === "link" ? "Link da equipe" : "Código da equipe";
    field.focus();
    field.select();
  });
  select("#team-copy").addEventListener("click", async () => {
    const value = field.value;
    try {
      await navigator.clipboard.writeText(value);
      if (field.value === value && !output.hidden)
        shareStatus.textContent =
          "Copiado! Você já pode compartilhar a equipe.";
    } catch {
      field.focus();
      field.select();
      shareStatus.textContent =
        "A cópia automática não está disponível aqui. O texto está selecionado: use Copiar ou Ctrl+C.";
    }
  });
  select("#team-import-form").addEventListener("submit", (event) => {
    event.preventDefault();
    preview(select("#team-import-value").value);
  });
  importButton.addEventListener("click", () => {
    if (importButton.disabled || !pending.length) return;
    onImport(pending);
    dismiss();
    select("#team-heading").focus({ preventScroll: true });
  });
  select("#shared-team-cancel").addEventListener("click", dismiss);
  retry.addEventListener("click", () => preview(lastInput));
  function fromLocation() {
    if (new URLSearchParams(location.hash.slice(1)).has("team"))
      preview(location.hash);
  }
  window.addEventListener("hashchange", fromLocation);
  fromLocation();
  return {
    update() {
      const members = getMembers(),
        next = members.map((member) => member.id).join(",");
      share.disabled = !members.length;
      if (next !== signature) {
        signature = next;
        output.hidden = true;
        field.value = "";
        shareStatus.textContent = "";
      }
    },
  };
}

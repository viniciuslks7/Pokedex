import { resourceId, pokemonLabel } from "./api.js";

export const MAX_PROGRESS_ENTRIES = 3000;
const KEY = "pokedex.progress.v1";
export function validateProgress(entries) {
  if (!Array.isArray(entries) || entries.length > MAX_PROGRESS_ENTRIES)
    throw Error("Progresso inválido ou acima do limite de espécies.");
  const ids = new Set();
  return entries.map((entry) => {
    if (
      !entry ||
      !Number.isSafeInteger(entry.id) ||
      entry.id <= 0 ||
      entry.id >= 10000 ||
      !["seen", "caught"].includes(entry.state) ||
      ids.has(entry.id)
    )
      throw Error("Espécie repetida ou registro de progresso inválido.");
    ids.add(entry.id);
    return { id: entry.id, state: entry.state };
  });
}
export function mergeProgress(current, incoming) {
  const entries = new Map(
    validateProgress(current).map((entry) => [entry.id, entry]),
  );
  for (const entry of validateProgress(incoming)) {
    if (entries.get(entry.id)?.state !== "caught") entries.set(entry.id, entry);
  }
  return validateProgress([...entries.values()]);
}
export function matchesProgress(entry, filter, records) {
  const state = records.get(entry.speciesId || entry.id);
  return (
    !filter ||
    (filter === "seen" && Boolean(state)) ||
    (filter === "caught" && state === "caught") ||
    (filter === "unseen" && !state) ||
    (filter === "uncaught" && state !== "caught")
  );
}
export function progressCounts(entries, records) {
  const ids = new Set(entries.map((entry) => entry.speciesId || entry.id));
  let seen = 0,
    caught = 0;
  for (const id of ids) {
    if (records.has(id)) seen++;
    if (records.get(id) === "caught") caught++;
  }
  return { total: ids.size, seen, caught };
}

export function createDexProgress({ onChange }) {
  const select = (id) => document.querySelector(id),
    notice = select("#progress-notice");
  const seenButton = select("#progress-seen"),
    caughtButton = select("#progress-caught");
  const status = select("#progress-action-status");
  let records = new Map(),
    current = null,
    busy = false,
    pool = [];
  function warn(message) {
    notice.hidden = false;
    notice.textContent = message;
  }
  try {
    const text = localStorage.getItem(KEY);
    if (text) {
      if (text.length > 250000) throw Error("Invalid progress");
      const data = JSON.parse(text);
      if (data?.version !== 1) throw Error("Invalid progress");
      records = new Map(
        validateProgress(data.entries).map((entry) => [entry.id, entry.state]),
      );
    }
  } catch {
    warn(
      "Não foi possível recuperar o progresso. Você pode registrar espécies nesta sessão e importar um backup válido.",
    );
  }
  function snapshot() {
    return [...records]
      .map(([id, state]) => ({ id, state }))
      .sort((a, b) => a.id - b.id);
  }
  function persist() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ version: 1, entries: snapshot() }),
      );
      notice.hidden = true;
      return true;
    } catch {
      warn(
        "O progresso funciona nesta sessão. O navegador não permitiu salvá-lo; exporte um backup para guardá-lo.",
      );
      return false;
    }
  }
  function speciesId() {
    return current && (resourceId(current.species?.url) || current.id);
  }
  function render() {
    const id = speciesId(),
      state = records.get(id);
    const seen = Boolean(state),
      caught = state === "caught";
    seenButton.disabled = busy || !id || caught;
    caughtButton.disabled = busy || !id;
    seenButton.setAttribute("aria-pressed", String(seen));
    caughtButton.setAttribute("aria-pressed", String(caught));
    seenButton.textContent = seen ? "✓ Visto" : "Marcar como visto";
    caughtButton.textContent = caught ? "● Capturado" : "Marcar captura";
    seenButton.title = caught
      ? "Remova a captura primeiro para desmarcar como visto."
      : "";
    if (current) {
      const name = pokemonLabel(current.name);
      seenButton.setAttribute(
        "aria-label",
        `${seen ? "Desmarcar" : "Marcar"} ${name} como visto`,
      );
      caughtButton.setAttribute(
        "aria-label",
        `${caught ? "Remover captura de" : "Marcar captura de"} ${name}`,
      );
    }
    const count = progressCounts(pool, records);
    select("#progress-seen-count").textContent = String(count.seen);
    select("#progress-caught-count").textContent = String(count.caught);
    select("#progress-total-count").textContent = String(count.total);
    const meter = select("#progress-meter");
    meter.max = count.total || 1;
    meter.value = count.caught;
    const percentage = count.total ? (count.caught / count.total) * 100 : 0;
    select("#progress-percentage").textContent =
      `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(percentage)}% das espécies desta seleção capturadas`;
    meter.setAttribute(
      "aria-valuetext",
      `${count.caught} espécies capturadas de ${count.total} nesta seleção`,
    );
  }
  function change(caught) {
    const id = speciesId();
    if (busy || !id || id >= 10000) return;
    const state = records.get(id);
    if (!records.has(id) && records.size >= MAX_PROGRESS_ENTRIES) {
      status.textContent =
        "O registro atingiu o limite de espécies. Remova uma marcação antes de adicionar outra.";
      return;
    }
    if (caught) records.set(id, state === "caught" ? "seen" : "caught");
    else if (state === "caught") return;
    else if (state) records.delete(id);
    else records.set(id, "seen");
    persist();
    render();
    status.textContent = caught
      ? state === "caught"
        ? "Captura removida. A espécie continua marcada como vista."
        : "Espécie capturada e vista. A marcação vale para todas as suas formas."
      : state
        ? "Marcação de visto removida."
        : "Espécie marcada como vista. A marcação vale para todas as suas formas.";
    onChange();
  }
  seenButton.addEventListener("click", () => change(false));
  caughtButton.addEventListener("click", () => change(true));
  render();
  return {
    snapshot,
    state(id) {
      return records.get(id) || "";
    },
    matches(entry, filter) {
      return matchesProgress(entry, filter, records);
    },
    setPool(entries) {
      pool = entries;
      render();
    },
    setCurrent(pokemon) {
      current = pokemon;
      status.textContent = "";
      render();
    },
    setBusy(value) {
      busy = value;
      render();
    },
    restore(entries) {
      records = new Map(
        validateProgress(entries).map((entry) => [entry.id, entry.state]),
      );
      const saved = persist();
      render();
      status.textContent = "Progresso atualizado pelo backup.";
      return saved;
    },
  };
}

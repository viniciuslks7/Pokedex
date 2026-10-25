import { pokemonLabel, resourceId } from "./api.js";

export const MAX_NOTES = 100;
export const MAX_NOTE_LENGTH = 500;
const KEY = "pokedex.notes.v1";

export function validateNotes(entries) {
  if (!Array.isArray(entries) || entries.length > MAX_NOTES)
    throw Error("A lista de anotações é inválida ou ultrapassa 100 espécies.");
  const ids = new Set();
  return entries.map((entry) => {
    if (
      !entry ||
      !Number.isSafeInteger(entry.id) ||
      entry.id <= 0 ||
      entry.id >= 10000 ||
      ids.has(entry.id) ||
      typeof entry.name !== "string" ||
      !/^[a-z0-9-]{1,100}$/.test(entry.name) ||
      typeof entry.text !== "string" ||
      !entry.text.trim() ||
      entry.text.length > MAX_NOTE_LENGTH
    )
      throw Error("Anotação inválida, repetida ou acima de 500 caracteres.");
    ids.add(entry.id);
    return { id: entry.id, name: entry.name, text: entry.text };
  });
}

export function mergeNotes(current, incoming) {
  const records = new Map(
    validateNotes(current).map((entry) => [entry.id, entry]),
  );
  const conflicts = [];
  for (const entry of validateNotes(incoming)) {
    const existing = records.get(entry.id);
    if (!existing) records.set(entry.id, entry);
    else if (existing.text !== entry.text) conflicts.push(entry.id);
  }
  return { entries: validateNotes([...records.values()]), conflicts };
}

export function createFieldNotes({ onSelect }) {
  const select = (id) => document.querySelector(id),
    editor = select("#field-note");
  const status = select("#field-note-status"),
    notice = select("#field-notes-notice");
  const list = select("#field-notes-list"),
    filter = select("#field-notes-search");
  const remove = select("#field-note-delete"),
    undo = select("#field-note-undo");
  let records = new Map(),
    current = null,
    busy = false,
    removed = null;
  function warn(message) {
    if (notice.textContent !== message) notice.textContent = message;
    notice.hidden = false;
  }
  function tell(message) {
    if (status.textContent !== message) status.textContent = message;
  }
  try {
    const text = localStorage.getItem(KEY);
    if (text) {
      if (text.length > 350000) throw Error("Invalid notes");
      const saved = JSON.parse(text);
      if (saved?.version !== 1) throw Error("Invalid notes");
      records = new Map(
        validateNotes(saved.entries).map((entry) => [entry.id, entry]),
      );
    }
  } catch {
    warn(
      "Não foi possível recuperar as anotações. Você pode escrever nesta sessão ou importar um backup válido.",
    );
  }
  function snapshot() {
    return [...records.values()]
      .map((entry) => ({ ...entry }))
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
        "As anotações estão disponíveis nesta sessão. O navegador não permitiu salvá-las; exporte um backup para guardá-las.",
      );
      return false;
    }
  }
  function normalize(value) {
    return value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase("pt-BR");
  }
  function render({ syncEditor = true } = {}) {
    const note = records.get(current?.id),
      full = !note && records.size >= MAX_NOTES;
    editor.disabled = busy || !current;
    editor.readOnly = full;
    if (syncEditor && editor.value !== (note?.text || ""))
      editor.value = note?.text || "";
    select("#field-note-context").textContent = current
      ? `Anotações de ${pokemonLabel(current.name)} · #${String(current.id).padStart(3, "0")}`
      : "Selecione um Pokémon para escrever suas anotações.";
    select("#field-note-count").textContent =
      `${editor.value.length} / ${MAX_NOTE_LENGTH} caracteres`;
    select("#field-notes-count").textContent =
      `${records.size} / ${MAX_NOTES} espécies`;
    remove.disabled = busy || !note;
    undo.hidden = !removed;
    select("#field-note-limit").hidden = !full;
    const query = normalize(filter.value.trim());
    const entries = snapshot().filter((entry) =>
      normalize(
        `${entry.id} ${pokemonLabel(entry.name)} ${entry.text}`,
      ).includes(query),
    );
    select("#field-notes-empty").hidden = Boolean(entries.length);
    select("#field-notes-empty").textContent = records.size
      ? "Nenhuma anotação corresponde à busca."
      : "Suas anotações salvas aparecerão aqui.";
    list.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement("li"),
          heading = document.createElement("div"),
          open = document.createElement("button"),
          erase = document.createElement("button"),
          text = document.createElement("p");
        heading.className = "saved-note-heading";
        open.type = "button";
        open.className = "text-button saved-note-open";
        open.dataset.pokemonId = entry.id;
        open.textContent = `#${String(entry.id).padStart(3, "0")} · ${pokemonLabel(entry.name)} →`;
        open.setAttribute(
          "aria-label",
          `Abrir Pokémon ${pokemonLabel(entry.name)}`,
        );
        if (entry.id === current?.id) open.setAttribute("aria-current", "true");
        open.addEventListener("click", () => onSelect(entry.id));
        erase.type = "button";
        erase.className = "text-button saved-note-delete";
        erase.textContent = "Apagar";
        erase.setAttribute(
          "aria-label",
          `Apagar anotação de ${pokemonLabel(entry.name)}`,
        );
        erase.addEventListener("click", () => eraseNote(entry.id));
        text.className = "saved-note-text";
        text.textContent = entry.text;
        heading.append(open, erase);
        item.append(heading, text);
        return item;
      }),
    );
  }
  function eraseNote(id) {
    const note = records.get(id);
    if (!note) return;
    removed = { ...note };
    records.delete(id);
    persist();
    render();
    tell(
      `Anotação de ${pokemonLabel(note.name)} apagada. Você pode desfazer até recarregar a página ou apagar outra nota.`,
    );
    undo.focus();
  }
  editor.addEventListener("input", () => {
    if (busy || !current || editor.readOnly) return;
    try {
      const text = editor.value.replace(/\r\n?/g, "\n");
      if (text.trim()) {
        const entry = validateNotes([{ ...current, text }])[0];
        records.set(current.id, entry);
      } else {
        const previous = records.get(current.id);
        if (previous) removed = { ...previous };
        records.delete(current.id);
      }
      const saved = persist();
      render({ syncEditor: false });
      tell(
        text.trim()
          ? saved
            ? "Anotação salva neste navegador."
            : "Anotação disponível nesta sessão. Exporte um backup para guardá-la."
          : "Sem anotação salva para esta espécie.",
      );
    } catch (error) {
      render();
      tell(error.message);
    }
  });
  remove.addEventListener("click", () => {
    if (!busy && current) eraseNote(current.id);
  });
  undo.addEventListener("click", () => {
    if (!removed) return;
    if (records.has(removed.id)) {
      tell(
        "Já existe uma anotação para essa espécie. A nova versão foi preservada.",
      );
      return;
    }
    if (records.size >= MAX_NOTES) {
      tell(
        "Abra espaço entre as 100 espécies anotadas para restaurar essa nota.",
      );
      return;
    }
    const restored = removed;
    records.set(restored.id, restored);
    removed = null;
    persist();
    render();
    tell(`Anotação de ${pokemonLabel(restored.name)} restaurada.`);
    if (current?.id === restored.id) editor.focus({ preventScroll: true });
  });
  filter.addEventListener("input", () => render({ syncEditor: false }));
  render();
  return {
    snapshot,
    setCurrent(pokemon) {
      const id = resourceId(pokemon.species?.url) || pokemon.id;
      current =
        id > 0 && id < 10000
          ? { id, name: pokemon.species?.name || pokemon.name }
          : null;
      render();
      tell("");
    },
    setBusy(value) {
      busy = value;
      render({ syncEditor: false });
    },
    restore(entries) {
      records = new Map(
        validateNotes(entries).map((entry) => [entry.id, entry]),
      );
      removed = null;
      const saved = persist();
      render();
      tell("Anotações atualizadas pelo backup.");
      return saved;
    },
  };
}

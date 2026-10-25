const STORAGE_KEY = "pokedex.teams.v1";
export const MAX_SAVED_TEAMS = 20;

export function teamName(value) {
  if (typeof value !== "string") throw Error("Invalid team name");
  const name = String(value).normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!name || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name))
    throw Error("Invalid team name");
  return name;
}

export function sameMembers(first, second) {
  return (
    first.length === second.length &&
    first.every((member, index) => member.id === second[index].id)
  );
}

export function readSavedTeams(raw) {
  if (raw === null) return { teams: [], recovered: false };
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.teams))
    throw Error("Invalid saved teams");
  const ids = new Set(),
    names = new Set(),
    teams = [];
  for (const entry of data.teams) {
    try {
      if (
        typeof entry.id !== "string" ||
        !/^[a-z0-9-]{1,80}$/.test(entry.id) ||
        ids.has(entry.id)
      )
        throw Error();
      const name = teamName(entry.name),
        key = name.toLocaleLowerCase("pt-BR");
      if (
        names.has(key) ||
        !Array.isArray(entry.members) ||
        !entry.members.length ||
        entry.members.length > 6
      )
        throw Error();
      const seen = new Set();
      const members = entry.members.map((member) => {
        if (
          !member ||
          !Number.isSafeInteger(member.id) ||
          member.id <= 0 ||
          seen.has(member.id) ||
          typeof member.name !== "string" ||
          !/^[a-z0-9-]+$/.test(member.name)
        )
          throw Error();
        seen.add(member.id);
        return { id: member.id, name: member.name };
      });
      if (teams.length >= MAX_SAVED_TEAMS) continue;
      ids.add(entry.id);
      names.add(key);
      teams.push({ id: entry.id, name, members });
    } catch {
      /* Retain other valid teams when a single entry is damaged. */
    }
  }
  return { teams, recovered: teams.length !== data.teams.length };
}

export function createSavedTeams({ getMembers, onLoad }) {
  const select = (id) => document.querySelector(id);
  const chooser = select("#saved-team-select"),
    notice = select("#saved-teams-notice"),
    status = select("#saved-team-status");
  const newName = select("#new-team-name"),
    rename = select("#saved-team-rename");
  const saveButton = select("#saved-team-save"),
    loadButton = select("#saved-team-load"),
    updateButton = select("#saved-team-update");
  const renameButton = select("#saved-team-rename-button"),
    deleteButton = select("#saved-team-delete");
  const preview = select("#saved-team-preview"),
    dirty = select("#saved-team-dirty"),
    undoPanel = select("#saved-team-undo-panel");
  let teams = [],
    selectedId = "",
    removed = null;
  function warn(message) {
    notice.textContent = message;
    notice.hidden = false;
  }
  try {
    const data = readSavedTeams(localStorage.getItem(STORAGE_KEY));
    teams = data.teams;
    if (data.recovered)
      warn(
        "Algumas equipes salvas tinham dados inválidos. As equipes válidas continuam disponíveis.",
      );
  } catch {
    warn(
      "Não foi possível recuperar as equipes nomeadas. Você pode organizar novas equipes nesta sessão; a equipe atual continua disponível.",
    );
  }
  const current = () => teams.find((team) => team.id === selectedId);
  const copy = (members) => members.map(({ id, name }) => ({ id, name }));
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, teams }));
      notice.hidden = true;
      return true;
    } catch {
      warn(
        "As equipes nomeadas estão disponíveis nesta sessão. O navegador não permitiu salvá-las para a próxima visita.",
      );
      return false;
    }
  }
  function nameTaken(name, exceptId) {
    return teams.some(
      (team) =>
        team.id !== exceptId &&
        team.name.toLocaleLowerCase("pt-BR") ===
          name.toLocaleLowerCase("pt-BR"),
    );
  }
  function readName(input, exceptId) {
    input.setCustomValidity("");
    let name;
    try {
      name = teamName(input.value);
    } catch {
      input.setCustomValidity("Use um nome com 1 a 40 caracteres.");
    }
    if (name && nameTaken(name, exceptId))
      input.setCustomValidity(
        "Já existe uma equipe com esse nome. Escolha outro nome.",
      );
    if (!input.reportValidity()) return null;
    return name;
  }
  function update() {
    const team = current(),
      members = getMembers();
    saveButton.disabled = !members.length || teams.length >= MAX_SAVED_TEAMS;
    loadButton.disabled = !team;
    updateButton.disabled =
      !team || !members.length || sameMembers(team.members, members);
    rename.disabled = renameButton.disabled = deleteButton.disabled = !team;
    dirty.textContent = team
      ? sameMembers(team.members, members)
        ? `A equipe atual corresponde a “${team.name}”.`
        : `A equipe atual difere de “${team.name}”. Use “Atualizar com equipe atual” para gravar a nova seleção nela.`
      : "As equipes nomeadas são cópias. Edite sua equipe atual e salve quando quiser.";
    select("#saved-teams-count").textContent =
      `${teams.length} / ${MAX_SAVED_TEAMS} equipes`;
  }
  function render() {
    newName.setCustomValidity("");
    rename.setCustomValidity("");
    chooser.replaceChildren(
      new Option("Escolha uma equipe salva", ""),
      ...teams.map(
        (team) =>
          new Option(`${team.name} · ${team.members.length} Pokémon`, team.id),
      ),
    );
    chooser.value = selectedId;
    chooser.disabled = !teams.length;
    const team = current();
    rename.value = team?.name || "";
    preview.replaceChildren(
      ...(team?.members || []).map((member) => {
        const item = document.createElement("li");
        item.textContent = member.name.replaceAll("-", " ");
        return item;
      }),
    );
    update();
  }
  for (const input of [newName, rename])
    input.addEventListener("input", () => input.setCustomValidity(""));
  chooser.addEventListener("change", () => {
    selectedId = chooser.value;
    status.textContent = "Selecione “Carregar” para usar a equipe escolhida.";
    render();
  });
  select("#save-team-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!getMembers().length) return;
    if (teams.length >= MAX_SAVED_TEAMS) {
      status.textContent =
        "Você já tem vinte equipes salvas. Exclua uma para abrir espaço.";
      return;
    }
    const name = readName(newName);
    if (!name) return;
    const id =
      globalThis.crypto?.randomUUID?.() ||
      `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    teams.push({ id, name, members: copy(getMembers()) });
    selectedId = id;
    persist();
    render();
    newName.value = "";
    status.textContent = `“${name}” salva como uma nova equipe.`;
  });
  loadButton.addEventListener("click", () => {
    const team = current();
    if (!team) return;
    onLoad(copy(team.members));
    update();
    status.textContent = `“${team.name}” carregada. As outras equipes salvas foram mantidas.`;
  });
  updateButton.addEventListener("click", () => {
    const team = current();
    if (!team || !getMembers().length) return;
    team.members = copy(getMembers());
    persist();
    render();
    status.textContent = `“${team.name}” atualizada com a equipe atual.`;
  });
  select("#rename-team-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const team = current();
    if (!team) return;
    const name = readName(rename, team.id);
    if (!name) return;
    team.name = name;
    persist();
    render();
    status.textContent = `Equipe renomeada para “${name}”.`;
  });
  deleteButton.addEventListener("click", () => {
    const team = current();
    if (!team) return;
    removed = { team, index: teams.indexOf(team) };
    teams = teams.filter((entry) => entry.id !== team.id);
    selectedId = "";
    persist();
    render();
    undoPanel.hidden = false;
    select("#saved-team-undo-status").textContent =
      `“${team.name}” excluída. A equipe atual continua disponível.`;
    select("#saved-team-undo").focus({ preventScroll: true });
    status.textContent = "";
  });
  select("#saved-team-undo").addEventListener("click", () => {
    if (!removed) return;
    if (teams.length >= MAX_SAVED_TEAMS || nameTaken(removed.team.name)) {
      select("#saved-team-undo-status").textContent =
        "Para restaurar, abra espaço e verifique se não há outra equipe com o mesmo nome.";
      return;
    }
    const { team, index } = removed;
    teams.splice(index, 0, team);
    selectedId = team.id;
    removed = null;
    persist();
    render();
    undoPanel.hidden = true;
    status.textContent = `“${team.name}” restaurada.`;
    chooser.focus({ preventScroll: true });
  });
  render();
  return {
    update,
    snapshot() {
      return teams.map((team) => ({
        id: team.id,
        name: team.name,
        members: copy(team.members),
      }));
    },
    replaceAll(entries) {
      teams = entries.map((team) => ({
        id: team.id,
        name: team.name,
        members: copy(team.members),
      }));
      selectedId = "";
      removed = null;
      undoPanel.hidden = true;
      status.textContent = "";
      const saved = persist();
      render();
      return saved;
    },
  };
}

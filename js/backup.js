import { MAX_SAVED_TEAMS, readSavedTeams, sameMembers } from "./saved-teams.js";
import { validateProgress, mergeProgress } from "./dex-progress.js";
import { validateNotes, mergeNotes } from "./field-notes.js";

export const MAX_BACKUP_BYTES = 1024 * 1024;
const copy = (value) => JSON.parse(JSON.stringify(value));

function members(entries, limit, allowEmpty = true, favorites = false) {
  if (
    !Array.isArray(entries) ||
    entries.length > limit ||
    (!allowEmpty && !entries.length)
  )
    throw Error("Lista de Pokémon inválida.");
  const seen = new Set();
  return entries.map((entry) => {
    if (
      !entry ||
      !Number.isSafeInteger(entry.id) ||
      entry.id <= 0 ||
      seen.has(entry.id) ||
      typeof entry.name !== "string" ||
      !/^[a-z0-9-]{1,100}$/.test(entry.name)
    )
      throw Error("Pokémon inválido ou repetido no backup.");
    seen.add(entry.id);
    const result = { id: entry.id, name: entry.name };
    if (favorites) {
      const speciesId = entry.speciesId ?? entry.id;
      if (!Number.isSafeInteger(speciesId) || speciesId <= 0)
        throw Error("Espécie inválida no backup.");
      result.speciesId = speciesId;
    }
    return result;
  });
}

export function validateBackup(data) {
  if (!data || data.format !== "pokedex-backup" || data.version !== 1)
    throw Error("Este arquivo não é um backup compatível da Pokédex.");
  if (
    typeof data.exportedAt !== "string" ||
    data.exportedAt.length > 40 ||
    !Number.isFinite(Date.parse(data.exportedAt))
  )
    throw Error("Data do backup inválida.");
  const team = members(data.team, 6);
  // Reuse the library's validation, but never silently discard imported data.
  let library;
  try {
    library = readSavedTeams(JSON.stringify({ version: 1, teams: data.teams }));
  } catch {
    throw Error("A lista de equipes nomeadas do backup é inválida.");
  }
  if (library.recovered)
    throw Error(
      "Equipes nomeadas inválidas, repetidas ou acima do limite de vinte.",
    );
  library.teams.forEach((entry) => members(entry.members, 6, false));
  return {
    format: "pokedex-backup",
    version: 1,
    exportedAt: data.exportedAt,
    favorites: members(data.favorites, 3000, true, true),
    team,
    teams: library.teams,
    ...(Object.hasOwn(data, "progress")
      ? { progress: validateProgress(data.progress) }
      : {}),
    ...(Object.hasOwn(data, "notes")
      ? { notes: validateNotes(data.notes) }
      : {}),
  };
}

export function parseBackup(text) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES
  )
    throw Error("Use um arquivo de backup de até 1 MB.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error(
      "Não foi possível ler o arquivo. Escolha um backup JSON da Pokédex.",
    );
  }
  return validateBackup(data);
}

export function exportBackup(state, date = new Date()) {
  return validateBackup({
    format: "pokedex-backup",
    version: 1,
    exportedAt: date.toISOString(),
    ...copy(state),
  });
}

export function planBackupImport(current, backup, mode = "merge") {
  const incoming = validateBackup(backup);
  if (!["merge", "replace"].includes(mode))
    throw Error("Modo de importação inválido.");
  const notePlan =
    incoming.notes !== undefined || current.notes !== undefined
      ? mode === "replace" && incoming.notes !== undefined
        ? { entries: copy(incoming.notes), conflicts: [] }
        : mergeNotes(
            current.notes || [],
            mode === "merge" ? incoming.notes || [] : [],
          )
      : null;
  if (mode === "replace")
    return {
      state: {
        favorites: copy(incoming.favorites),
        team: copy(incoming.team),
        teams: copy(incoming.teams),
        ...(incoming.progress !== undefined
          ? { progress: copy(incoming.progress) }
          : current.progress !== undefined
            ? { progress: validateProgress(current.progress) }
            : {}),
        ...(notePlan ? { notes: notePlan.entries } : {}),
      },
      mode,
      teamAction: "replace",
      importedTeamName: null,
      ...(notePlan ? { noteConflicts: notePlan.conflicts } : {}),
    };
  const favorites = new Map(
    current.favorites.map((entry) => [entry.id, { ...entry }]),
  );
  incoming.favorites.forEach((entry) => {
    if (!favorites.has(entry.id)) favorites.set(entry.id, { ...entry });
  });
  if (favorites.size > 3000)
    throw Error(
      "A mesclagem excede o limite de favoritos suportado pelo backup.",
    );
  const teams = copy(current.teams),
    ids = new Set(teams.map((entry) => entry.id));
  const normalized = (name) => name.toLocaleLowerCase("pt-BR");
  function addTeam(entry) {
    let name = entry.name,
      counter = 1;
    let existing;
    while (
      (existing = teams.find(
        (team) => normalized(team.name) === normalized(name),
      ))
    ) {
      if (sameMembers(existing.members, entry.members)) return null;
      const suffix = counter === 1 ? " (importada)" : ` (importada ${counter})`;
      name = entry.name.slice(0, 40 - suffix.length).trim() + suffix;
      counter++;
    }
    if (teams.length >= MAX_SAVED_TEAMS)
      throw Error(
        "Não há espaço para mesclar todas as equipes. Abra espaço entre as vinte equipes ou use a substituição.",
      );
    let id = entry.id;
    counter = 1;
    while (ids.has(id)) id = `imported-${counter++}`;
    ids.add(id);
    teams.push({ id, name, members: copy(entry.members) });
    return name;
  }
  incoming.teams.forEach(addTeam);
  const team = current.team.length ? copy(current.team) : copy(incoming.team);
  let importedTeamName = null;
  if (
    current.team.length &&
    incoming.team.length &&
    !sameMembers(current.team, incoming.team) &&
    !teams.some((entry) => sameMembers(entry.members, incoming.team))
  ) {
    importedTeamName = addTeam({
      id: "backup-active-team",
      name: "Equipe do backup",
      members: incoming.team,
    });
  }
  return {
    state: {
      favorites: [...favorites.values()],
      team,
      teams,
      ...(incoming.progress !== undefined || current.progress !== undefined
        ? {
            progress: mergeProgress(
              current.progress || [],
              incoming.progress || [],
            ),
          }
        : {}),
      ...(notePlan ? { notes: notePlan.entries } : {}),
    },
    mode,
    teamAction: current.team.length ? "keep" : "adopt",
    importedTeamName,
    ...(notePlan ? { noteConflicts: notePlan.conflicts } : {}),
  };
}

export function createBackupManager({ getSnapshot, applySnapshot }) {
  const select = (id) => document.querySelector(id);
  const input = select("#backup-file"),
    status = select("#backup-status"),
    panel = select("#backup-preview");
  const importButton = select("#backup-import"),
    undo = select("#backup-undo"),
    download = select("#backup-download");
  let parsed = null,
    plan = null,
    base = "",
    version = 0,
    objectUrl = null,
    lastImport = null;
  const signature = () => JSON.stringify(getSnapshot());
  function invalidate() {
    parsed = null;
    plan = null;
    panel.hidden = true;
    importButton.disabled = true;
  }
  function preview() {
    if (!parsed) return;
    importButton.disabled = true;
    plan = null;
    panel.hidden = false;
    const list = select("#backup-summary");
    list.replaceChildren();
    try {
      const current = getSnapshot();
      base = JSON.stringify(current);
      const mode = select('input[name="backup-mode"]:checked').value;
      plan = planBackupImport(current, parsed, mode);
      const count = (value, singular, plural) =>
        `${value} ${value === 1 ? singular : plural}`;
      const messages = [
        `Arquivo: ${count(parsed.favorites.length, "favorito", "favoritos")}, ${count(parsed.team.length, "integrante", "integrantes")} na equipe atual e ${count(parsed.teams.length, "equipe nomeada", "equipes nomeadas")}.`,
        `Após importar: ${count(plan.state.favorites.length, "favorito", "favoritos")} e ${count(plan.state.teams.length, "equipe nomeada", "equipes nomeadas")}.`,
        mode === "replace"
          ? "Os favoritos, a equipe atual e as equipes nomeadas serão substituídos pelos dados do arquivo."
          : plan.teamAction === "keep"
            ? "A equipe atual será mantida. Favoritos e equipes nomeadas serão mesclados sem apagar os existentes."
            : "A equipe atual será carregada do backup. Favoritos e equipes nomeadas serão mesclados.",
      ];
      if (parsed.progress !== undefined) {
        const caught = plan.state.progress.filter(
          (entry) => entry.state === "caught",
        ).length;
        messages.push(
          `Progresso após importar: ${plan.state.progress.length} espécies vistas, incluindo ${caught} capturadas. ${mode === "replace" ? "O progresso será substituído pelo arquivo." : "As marcações serão unidas, preservando capturas já registradas."}`,
        );
      } else
        messages.push(
          "Este backup não contém progresso. Suas marcações de vistos e capturados serão mantidas, inclusive no modo de substituição.",
        );
      if (parsed.notes !== undefined) {
        messages.push(
          `Anotações após importar: ${plan.state.notes.length} espécies. ${mode === "replace" ? "As notas serão substituídas pelo arquivo." : "Novas notas serão acrescentadas; versões diferentes já existentes serão preservadas."}`,
        );
        if (plan.noteConflicts.length)
          messages.push(
            `${plan.noteConflicts.length} ${plan.noteConflicts.length === 1 ? "nota diferente foi encontrada e a versão atual será mantida" : "notas diferentes foram encontradas e as versões atuais serão mantidas"}.`,
          );
      } else
        messages.push(
          "Este backup não contém anotações. Suas notas serão mantidas, inclusive no modo de substituição.",
        );
      if (plan.importedTeamName)
        messages.push(
          `A equipe atual do arquivo será guardada como “${plan.importedTeamName}”.`,
        );
      for (const message of messages) {
        const item = document.createElement("li");
        item.textContent = message;
        list.append(item);
      }
      const names = select("#backup-team-names");
      names.replaceChildren(
        ...plan.state.teams.map((team) => {
          const item = document.createElement("li");
          item.textContent = `${team.name} · ${team.members.length} Pokémon`;
          return item;
        }),
      );
      select("#backup-exported-at").textContent = new Intl.DateTimeFormat(
        "pt-BR",
        {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        },
      ).format(new Date(parsed.exportedAt));
      importButton.textContent =
        mode === "replace"
          ? "Substituir pelos dados do arquivo"
          : "Mesclar backup";
      importButton.disabled = false;
      status.textContent =
        "Backup validado. Confira a prévia antes de importar.";
    } catch (error) {
      status.textContent = error.message;
      select("#backup-team-names").replaceChildren();
    }
  }
  select("#backup-export").addEventListener("click", () => {
    try {
      const data = exportBackup(getSnapshot());
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      download.href = objectUrl;
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(data.exportedAt));
      download.download = `pokedex-backup-${date}.json`;
      download.hidden = false;
      status.textContent =
        "Backup preparado. Se o download não iniciar, use “Baixar arquivo”.";
      download.click();
    } catch (error) {
      status.textContent = `Não foi possível preparar o backup. ${error.message}`;
    }
  });
  input.addEventListener("change", async () => {
    const request = ++version;
    invalidate();
    const file = input.files?.[0];
    if (!file) {
      status.textContent = "Escolha um arquivo para conferir o backup.";
      return;
    }
    if (file.size > MAX_BACKUP_BYTES) {
      status.textContent = "Use um arquivo de backup de até 1 MB.";
      return;
    }
    status.textContent = "Lendo o arquivo de backup…";
    try {
      const text = await file.text();
      if (request !== version) return;
      parsed = parseBackup(text);
      preview();
    } catch (error) {
      if (request === version) {
        invalidate();
        status.textContent = error.message;
      }
    }
  });
  document
    .querySelectorAll('input[name="backup-mode"]')
    .forEach((radio) => radio.addEventListener("change", preview));
  importButton.addEventListener("click", () => {
    if (!plan || !parsed || importButton.disabled) return;
    if (signature() !== base) {
      preview();
      status.textContent =
        "Sua coleção mudou. Confira a prévia atualizada e clique em importar novamente.";
      return;
    }
    const before = copy(getSnapshot());
    const saved = applySnapshot(copy(plan.state));
    lastImport = { before, after: signature() };
    undo.hidden = false;
    invalidate();
    input.value = "";
    status.textContent = saved
      ? "Backup importado e salvo neste navegador."
      : "Backup importado nesta sessão. O navegador não permitiu salvar todos os dados para a próxima visita. Você pode exportar outro backup para guardá-los.";
  });
  select("#backup-cancel").addEventListener("click", () => {
    version++;
    invalidate();
    input.value = "";
    status.textContent = "Importação cancelada. Seus dados foram mantidos.";
  });
  undo.addEventListener("click", () => {
    if (!lastImport) return;
    if (signature() !== lastImport.after) {
      status.textContent =
        "Sua coleção mudou depois da importação. Para preservar essas alterações, desfazer não foi aplicado.";
      return;
    }
    const saved = applySnapshot(copy(lastImport.before));
    lastImport = null;
    undo.hidden = true;
    status.textContent = saved
      ? "Importação desfeita. A coleção anterior foi restaurada."
      : "Importação desfeita nesta sessão. O navegador não permitiu salvar todos os dados.";
  });
  window.addEventListener("pagehide", () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
}

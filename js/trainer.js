import {
  getResource,
  pokemonLabel,
  spriteImage,
  previewPokemonIds,
} from "./api.js";
import { calculateDefensiveMatchups } from "./matchups.js";
import { motionAllowed, notify, pop } from "./feedback.js";
import { createTeamSharing } from "./team-sharing.js";
import { createSavedTeams } from "./saved-teams.js";
import { createDetailedComparison } from "./comparison.js";
import { createTeamImageExporter } from "./team-image.js";
import { createTeamAdvisor } from "./team-advisor.js";

const TEAM_KEY = "pokedex.team.v1";
const MAX_TEAM = 6;

export function comparisonStats(first, second, names) {
  const value = (pokemon, name) => {
    const number = pokemon.stats?.find(
      (entry) => entry.stat.name === name,
    )?.base_stat;
    return Number.isFinite(number) ? number : null;
  };
  const rows = names.map((name) => ({
    name,
    left: value(first, name),
    right: value(second, name),
  }));
  const total = (side) =>
    rows.every((row) => row[side] !== null)
      ? rows.reduce((sum, row) => sum + row[side], 0)
      : null;
  return [
    ...rows,
    { name: "total", left: total("left"), right: total("right") },
  ];
}

export function summarizeTeamWeaknesses(pokemon, resources, attackTypes) {
  const counts = attackTypes.map((type) => ({
    type,
    weak: 0,
    resistant: 0,
    immune: 0,
  }));
  for (const member of pokemon) {
    const resourcesForMember = [
      ...new Set(member.types.map(({ type }) => type.name)),
    ].map((name) => resources.get(name));
    const matchups = calculateDefensiveMatchups(
      resourcesForMember,
      attackTypes,
    );
    matchups.forEach(({ multiplier }, index) => {
      if (multiplier > 1) counts[index].weak++;
      else if (multiplier === 0) counts[index].immune++;
      else if (multiplier < 1) counts[index].resistant++;
    });
  }
  return counts
    .filter((entry) => entry.weak >= 2)
    .sort((a, b) => b.weak - a.weak || a.type.localeCompare(b.type));
}

export function createTrainer({ types, statLabels, onSelect }) {
  const select = (selector) => document.querySelector(selector);
  const addTeam = select("#team-add");
  const addCompare = select("#compare-add");
  const teamList = select("#team-list");
  const teamStatus = select("#team-status");
  const teamRetry = select("#team-retry");
  const analysis = select("#team-analysis");
  const detailedComparison = createDetailedComparison({ types });
  const details = new Map();
  let members = [],
    compared = [],
    current = null,
    busy = false;
  let activeTeamRequest = null,
    teamVersion = 0;
  let unavailable = new Set();

  function storageNotice(message) {
    select("#team-storage-notice").textContent = message;
    select("#team-storage-notice").hidden = false;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(TEAM_KEY) || "[]");
    if (!Array.isArray(saved)) throw Error("Invalid team");
    const seen = new Set();
    members = saved
      .filter((entry) => {
        if (
          !entry ||
          !Number.isSafeInteger(entry.id) ||
          entry.id <= 0 ||
          typeof entry.name !== "string" ||
          !/^[a-z0-9-]+$/.test(entry.name) ||
          seen.has(entry.id)
        )
          return false;
        seen.add(entry.id);
        return true;
      })
      .slice(0, MAX_TEAM)
      .map(({ id, name }) => ({ id, name }));
  } catch {
    storageNotice(
      "Não foi possível recuperar a equipe salva. Você ainda pode montar uma equipe nesta sessão.",
    );
  }

  function persistTeam() {
    try {
      localStorage.setItem(TEAM_KEY, JSON.stringify(members));
      select("#team-storage-notice").hidden = true;
      return true;
    } catch {
      storageNotice(
        "A equipe está disponível nesta sessão. O navegador não permitiu salvá-la para a próxima visita.",
      );
      return false;
    }
  }
  function updateControls() {
    sharing.update();
    savedTeams.update();
    teamImage.update();
    const inTeam =
      current && members.some((member) => member.id === current.id);
    const inComparison =
      current && compared.some((member) => member.id === current.id);
    addTeam.disabled = busy || !current;
    addCompare.disabled = busy || !current;
    addTeam.setAttribute("aria-pressed", String(Boolean(inTeam)));
    addCompare.setAttribute("aria-pressed", String(Boolean(inComparison)));
    addTeam.textContent = inTeam ? "✓ Na equipe" : "+ Adicionar à equipe";
    addCompare.textContent = inComparison ? "✓ Em comparação" : "⇄ Comparar";
    if (current) {
      addTeam.setAttribute(
        "aria-label",
        `${inTeam ? "Remover" : "Adicionar"} ${pokemonLabel(current.name)} ${inTeam ? "da" : "à"} equipe`,
      );
      addCompare.setAttribute(
        "aria-label",
        `${inComparison ? "Remover" : "Adicionar"} ${pokemonLabel(current.name)} ${inComparison ? "da" : "à"} comparação`,
      );
    }
    select("#team-count").textContent =
      `${members.length} / ${MAX_TEAM} integrantes`;
  }

  function memberCard(member, kind, remove) {
    const card = document.createElement("div");
    card.className = "trainer-card";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "trainer-open";
    open.dataset.pokemonId = member.id;
    open.setAttribute("aria-label", `Ver ${pokemonLabel(member.name)}`);
    const name = document.createElement("span");
    name.className = "trainer-name";
    name.textContent = pokemonLabel(member.name);
    const typeText = document.createElement("small");
    const data = kind === "team" ? details.get(member.id) : member;
    typeText.textContent = data
      ? data.types
          .map(({ type }) => types[type.name]?.[0] || type.name)
          .join(" · ")
      : unavailable.has(member.id)
        ? "Detalhes indisponíveis"
        : "Consultando…";
    open.append(spriteImage(member.id), name, typeText);
    open.addEventListener("click", () => onSelect(member.id));
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "trainer-remove";
    removeButton.textContent = "×";
    removeButton.setAttribute(
      "aria-label",
      `Remover ${pokemonLabel(member.name)} ${kind === "team" ? "da equipe" : "da comparação"}`,
    );
    removeButton.addEventListener("click", remove);
    card.append(open, removeButton);
    return card;
  }

  const sharing = createTeamSharing({
    getMembers: () => members,
    onSelect,
    onImport(pokemon) {
      members = pokemon.map((member) => ({ id: member.id, name: member.name }));
      pokemon.forEach((member) => details.set(member.id, member));
      persistTeam();
      updateControls();
      refreshTeam();
      notify("Equipe compartilhada carregada!");
    },
  });

  const savedTeams = createSavedTeams({
    getMembers: () => members,
    onLoad(selected) {
      members = selected;
      persistTeam();
      updateControls();
      refreshTeam();
    },
  });
  const teamImage = createTeamImageExporter({
    getMembers: () => members,
    types,
  });
  const advisor = createTeamAdvisor({ types, onSelect });

  function renderTeam() {
    teamList.replaceChildren(
      ...Array.from({ length: MAX_TEAM }, (_, index) => {
        const item = document.createElement("li");
        const member = members[index];
        if (member) {
          item.className = "team-member";
          item.append(
            memberCard(member, "team", () => {
              members = members.filter((entry) => entry.id !== member.id);
              persistTeam();
              updateControls();
              refreshTeam();
              notify(`${pokemonLabel(member.name)} saiu da equipe.`);
              select("#team-heading").focus({ preventScroll: true });
            }),
          );
        } else {
          item.className = "team-empty";
          const number = document.createElement("span");
          number.textContent = String(index + 1).padStart(2, "0");
          const label = document.createElement("small");
          label.textContent = "Vaga na equipe";
          item.append(number, label);
        }
        return item;
      }),
    );
  }

  async function refreshTeam() {
    activeTeamRequest?.abort();
    const controller = new AbortController();
    activeTeamRequest = controller;
    const request = ++teamVersion;
    const selected = members.slice();
    const timeout = setTimeout(() => controller.abort(), 12000);
    teamRetry.hidden = true;
    analysis.hidden = true;
    advisor.update([], new Map(), selected.length);
    unavailable = new Set();
    renderTeam();
    if (!selected.length) {
      clearTimeout(timeout);
      teamStatus.textContent = "Escolha um Pokémon e use “Adicionar à equipe”.";
      return;
    }
    teamStatus.textContent = "Consultando os integrantes e suas afinidades…";
    try {
      const results = await Promise.allSettled(
        selected.map((member) =>
          details.has(member.id)
            ? details.get(member.id)
            : getResource(`pokemon/${member.id}`, controller.signal),
        ),
      );
      if (request !== teamVersion) return;
      const available = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          details.set(selected[index].id, result.value);
          available.push(result.value);
        } else unavailable.add(selected[index].id);
      });
      renderTeam();
      if (!available.length) {
        teamStatus.textContent = previewPokemonIds()
          ? "Os integrantes salvos não estão nesta coleção offline. Você pode removê-los e escolher Pokémon disponíveis."
          : "Não foi possível consultar os integrantes. Sua equipe continua salva.";
        teamRetry.hidden = Boolean(previewPokemonIds());
        return;
      }
      const names = [
        ...new Set(
          available.flatMap((member) =>
            member.types.map(({ type }) => type.name),
          ),
        ),
      ];
      const resources = new Map(
        await Promise.all(
          names.map(async (name) => [
            name,
            await getResource(`type/${name}`, controller.signal),
          ]),
        ),
      );
      if (request !== teamVersion) return;
      const weaknesses = summarizeTeamWeaknesses(
        available,
        resources,
        Object.keys(types),
      );
      select("#team-weaknesses").replaceChildren(
        ...weaknesses.map((entry) => {
          const item = document.createElement("li");
          item.dataset.type = entry.type;
          const name = document.createElement("strong");
          name.textContent = types[entry.type][0];
          const counts = document.createElement("span");
          counts.textContent = `${entry.weak} vulneráveis · ${entry.resistant} resistentes · ${entry.immune} imunes`;
          item.append(name, counts);
          return item;
        }),
      );
      select("#team-analysis-status").textContent = weaknesses.length
        ? `Análise de ${available.length} de ${selected.length} integrantes. Estes tipos causam dano aumentado a pelo menos dois deles.`
        : `Análise de ${available.length} de ${selected.length} integrantes. Nenhum tipo causa dano aumentado a dois integrantes ao mesmo tempo.`;
      analysis.hidden = false;
      advisor.update(available, resources, selected.length);
      teamStatus.textContent = unavailable.size
        ? `${selected.length} integrantes na equipe. ${unavailable.size} com detalhes indisponíveis; a análise considera os demais.`
        : `${selected.length} ${selected.length === 1 ? "integrante na equipe" : "integrantes na equipe"}. Você pode abrir os detalhes ou remover um parceiro.`;
      teamRetry.hidden = !unavailable.size || Boolean(previewPokemonIds());
    } catch {
      if (request !== teamVersion) return;
      teamStatus.textContent =
        "A equipe continua disponível. Não foi possível concluir a análise de tipos; tente novamente.";
      teamRetry.hidden = false;
    } finally {
      clearTimeout(timeout);
    }
  }

  function renderComparison() {
    detailedComparison.show(compared);
    const slots = select("#comparison-slots");
    slots.replaceChildren(
      ...Array.from({ length: 2 }, (_, index) => {
        const member = compared[index];
        if (member)
          return memberCard(member, "comparison", () => {
            compared = compared.filter((entry) => entry.id !== member.id);
            updateControls();
            renderComparison();
            select("#comparison-heading").focus({ preventScroll: true });
          });
        const empty = document.createElement("div");
        empty.className = "comparison-empty";
        const number = document.createElement("span");
        number.textContent = `0${index + 1}`;
        const text = document.createElement("p");
        text.textContent = index
          ? "Escolha o segundo Pokémon."
          : "Escolha um Pokémon e use “Comparar”.";
        empty.append(number, text);
        return empty;
      }),
    );
    const complete = compared.length === 2;
    select("#compare-clear").hidden = !compared.length;
    select("#comparison-results").hidden = !complete;
    select("#comparison-status").textContent = complete
      ? "Compare os atributos, tipos, habilidades e afinidades dos parceiros selecionados."
      : compared.length
        ? "Primeiro parceiro selecionado. Busque outro Pokémon e use “Comparar”."
        : "Selecione dois Pokémon pelo botão “Comparar” nos detalhes.";
    if (!complete) return;
    const table = select("#comparison-table");
    const header = document.createElement("tr");
    for (const label of [
      "Atributo",
      ...compared.map((member) => pokemonLabel(member.name)),
    ]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      header.append(cell);
    }
    table.querySelector("thead").replaceChildren(header);
    table.querySelector("tbody").replaceChildren(
      ...comparisonStats(compared[0], compared[1], Object.keys(statLabels)).map(
        (row) => {
          const element = document.createElement("tr");
          element.dataset.stat = row.name;
          const label = document.createElement("th");
          label.scope = "row";
          label.textContent =
            row.name === "total" ? "Total" : statLabels[row.name];
          element.append(label);
          for (const side of ["left", "right"]) {
            const cell = document.createElement("td");
            cell.textContent = row[side] === null ? "—" : row[side];
            if (
              row.left !== null &&
              row.right !== null &&
              row[side] > row[side === "left" ? "right" : "left"]
            ) {
              cell.className = "stat-better";
              const hint = document.createElement("span");
              hint.className = "sr-only";
              hint.textContent = " (maior valor)";
              cell.append(hint);
            }
            element.append(cell);
          }
          return element;
        },
      ),
    );
  }

  addTeam.addEventListener("click", () => {
    if (!current || busy) return;
    const exists = members.some((member) => member.id === current.id);
    if (!exists && members.length >= MAX_TEAM) {
      notify(
        "Sua equipe já tem seis integrantes. Remova um parceiro antes de adicionar outro.",
      );
      return;
    }
    if (exists) members = members.filter((member) => member.id !== current.id);
    else {
      details.set(current.id, current);
      members.push({ id: current.id, name: current.name });
    }
    persistTeam();
    updateControls();
    renderTeam();
    refreshTeam();
    pop(addTeam);
    notify(
      exists
        ? `${pokemonLabel(current.name)} saiu da equipe.`
        : `${pokemonLabel(current.name)} entrou na equipe! ${members.length} de ${MAX_TEAM} vagas preenchidas.`,
    );
  });
  addCompare.addEventListener("click", () => {
    if (!current || busy) return;
    const exists = compared.some((member) => member.id === current.id);
    if (!exists && compared.length >= 2) {
      notify(
        "A comparação já tem dois Pokémon. Remova um deles ou limpe a comparação.",
      );
      return;
    }
    if (exists)
      compared = compared.filter((member) => member.id !== current.id);
    else compared.push(current);
    updateControls();
    renderComparison();
    pop(addCompare);
    if (compared.length === 2) {
      select("#comparison-heading").scrollIntoView({
        behavior: motionAllowed() ? "smooth" : "instant",
        block: "start",
      });
      select("#comparison-heading").focus({ preventScroll: true });
    } else if (!exists)
      notify(
        `${pokemonLabel(current.name)} selecionado. Escolha o segundo Pokémon.`,
      );
  });
  select("#compare-clear").addEventListener("click", () => {
    compared = [];
    updateControls();
    renderComparison();
  });
  teamRetry.addEventListener("click", refreshTeam);
  renderTeam();
  renderComparison();
  updateControls();
  if (members.length) refreshTeam();
  return {
    snapshot() {
      return {
        team: members.map(({ id, name }) => ({ id, name })),
        teams: savedTeams.snapshot(),
      };
    },
    restoreBackup(data) {
      members = data.team.map(({ id, name }) => ({ id, name }));
      const librarySaved = savedTeams.replaceAll(data.teams),
        teamSaved = persistTeam();
      updateControls();
      refreshTeam();
      return librarySaved && teamSaved;
    },
    setCurrent(pokemon) {
      current = pokemon;
      details.set(pokemon.id, pokemon);
      updateControls();
    },
    setBusy(value) {
      busy = value;
      updateControls();
    },
  };
}

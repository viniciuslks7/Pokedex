import { getResource, pokemonLabel, resourceId, spriteImage } from "./api.js";
import { calculateDefensiveMatchups } from "./matchups.js";
import { teamCandidates } from "./team-candidates.js";

export function teamDefense(members, resources, attackTypes) {
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    values: calculateDefensiveMatchups(
      member.types.map(({ type }) => {
        const resource = resources.get(type.name);
        if (!resource) throw Error("Missing defensive type");
        return resource;
      }),
      attackTypes,
    ),
  }));
}

export function suggestPartners(members, candidates, resources, attackTypes) {
  if (!members.length) return [];
  const defense = teamDefense(members, resources, attackTypes);
  const threats = attackTypes
    .map((type, index) => {
      const values = defense.map((member) => member.values[index].multiplier);
      const weak = values.filter((value) => value > 1).length;
      const covered = values.some((value) => value < 1);
      return { type, weak, weight: weak * (covered ? 1 : 2) };
    })
    .filter((entry) => entry.weak > 0);
  const species = new Set(
    members.map((member) => resourceId(member.species?.url) || member.id),
  );
  const combinations = new Set();
  return candidates
    .filter((candidate) => !species.has(candidate.id))
    .map((candidate) => {
      const values = calculateDefensiveMatchups(
        candidate.types.map((type) => {
          const resource = resources.get(type);
          if (!resource) throw Error("Missing candidate type");
          return resource;
        }),
        attackTypes,
      );
      const helped = [],
        risks = [];
      let score = 0;
      for (const threat of threats) {
        const multiplier = values.find(
          (value) => value.type === threat.type,
        ).multiplier;
        if (multiplier < 1) {
          helped.push({ ...threat, multiplier });
          score += threat.weight * (multiplier === 0 ? 3 : 2);
        } else if (multiplier > 1) {
          risks.push({ ...threat, multiplier });
          score -= threat.weight;
        }
      }
      return { ...candidate, helped, risks, score };
    })
    .filter((candidate) => candidate.helped.length && candidate.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.helped.length - a.helped.length || a.id - b.id,
    )
    .filter((candidate) => {
      const key = [...candidate.types].sort().join("/");
      if (combinations.has(key)) return false;
      combinations.add(key);
      return true;
    })
    .slice(0, 3);
}

export function createTeamAdvisor({ types, onSelect }) {
  const select = (id) => document.querySelector(id);
  const button = select("#team-suggest"),
    status = select("#team-advisor-status"),
    list = select("#team-suggestions");
  const matrix = select("#team-defense"),
    table = select("#team-defense-table");
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  let members = [],
    resources = new Map(),
    complete = false,
    controller = null,
    version = 0;
  function update(
    pokemon = [],
    typeResources = new Map(),
    total = pokemon.length,
  ) {
    controller?.abort();
    ++version;
    members = pokemon;
    resources = typeResources;
    complete = Boolean(members.length && members.length === total);
    list.replaceChildren();
    button.disabled = !complete;
    button.textContent = "Encontrar parceiros";
    status.textContent = !total
      ? "Monte uma equipe para descobrir combinações."
      : !complete
        ? "Aguarde os dados de todos os integrantes para sugerir parceiros."
        : "Descubra parceiros que resistem aos tipos que ameaçam sua equipe.";
    matrix.hidden = !members.length;
    if (!members.length) {
      table.replaceChildren();
      return;
    }
    const defense = teamDefense(members, resources, Object.keys(types));
    const caption = document.createElement("caption");
    caption.textContent = `Dano recebido por tipo · ${members.length} de ${total} integrantes. ×0: imune; abaixo de ×1: resistente; acima de ×1: vulnerável.`;
    const head = document.createElement("thead"),
      row = document.createElement("tr");
    for (const text of [
      "Tipo atacante",
      ...members.map((member) => pokemonLabel(member.name)),
    ]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = text;
      row.append(cell);
    }
    head.append(row);
    const body = document.createElement("tbody");
    Object.keys(types).forEach((type, index) => {
      const line = document.createElement("tr"),
        name = document.createElement("th");
      line.dataset.type = type;
      name.scope = "row";
      name.textContent = types[type][0];
      line.append(name);
      defense.forEach((member) => {
        const cell = document.createElement("td"),
          multiplier = member.values[index].multiplier;
        cell.textContent = `×${number.format(multiplier)}`;
        cell.dataset.multiplier = multiplier;
        cell.className =
          multiplier > 1
            ? "defense-weak"
            : multiplier < 1
              ? "defense-resistant"
              : "";
        line.append(cell);
      });
      body.append(line);
    });
    table.replaceChildren(caption, head, body);
  }
  button.addEventListener("click", async () => {
    if (!complete) return;
    controller?.abort();
    const request = ++version,
      active = new AbortController();
    controller = active;
    const timeout = setTimeout(() => active.abort(), 12000);
    button.disabled = true;
    list.replaceChildren();
    status.textContent = "Comparando as combinações de tipos…";
    try {
      const allResources = new Map(
        await Promise.all(
          Object.keys(types).map(async (type) => [
            type,
            resources.get(type) ||
              (await getResource(`type/${type}`, active.signal)),
          ]),
        ),
      );
      active.signal.throwIfAborted();
      if (request !== version) return;
      const suggestions = suggestPartners(
        members,
        teamCandidates,
        allResources,
        Object.keys(types),
      );
      const names = (entries) =>
        entries
          .map(
            (entry) =>
              `${types[entry.type][0]} (×${number.format(entry.multiplier)})`,
          )
          .join(", ");
      list.replaceChildren(
        ...suggestions.map((candidate) => {
          const card = document.createElement("li");
          card.dataset.pokemonId = candidate.id;
          const open = document.createElement("button");
          open.type = "button";
          open.className = "advisor-open";
          const title = document.createElement("strong");
          title.textContent = pokemonLabel(candidate.name);
          const label = document.createElement("span");
          label.textContent = candidate.types
            .map((type) => types[type][0])
            .join(" · ");
          open.setAttribute(
            "aria-label",
            `Ver sugestão: ${pokemonLabel(candidate.name)}`,
          );
          open.append(spriteImage(candidate.id), title, label);
          open.addEventListener("click", () => onSelect(candidate.id));
          const help = document.createElement("p");
          help.textContent = `Recebe menos dano de ameaças da equipe: ${names(candidate.helped)}.`;
          const risk = document.createElement("p");
          risk.className = "advisor-risk";
          risk.textContent = candidate.risks.length
            ? `Também é vulnerável a: ${names(candidate.risks)}.`
            : "Não acrescenta fraqueza aos tipos que já ameaçam esta equipe.";
          const hint = document.createElement("button");
          hint.type = "button";
          hint.className = "text-button advisor-details";
          hint.textContent = "Abrir detalhes →";
          hint.setAttribute(
            "aria-label",
            `Ver detalhes de ${pokemonLabel(candidate.name)}`,
          );
          hint.addEventListener("click", () => onSelect(candidate.id));
          card.append(open, help, risk, hint);
          return card;
        }),
      );
      status.textContent = suggestions.length
        ? `${suggestions.length} sugestões entre ${teamCandidates.length} Pokémon da coleção. ${members.length === 6 ? "Equipe completa: abra os detalhes para avaliar uma troca." : "Abra os detalhes e use “Adicionar à equipe” se gostar de um parceiro."}`
        : "Nenhum parceiro desta coleção apresentou uma vantagem defensiva pelo critério de tipos.";
      button.textContent = "Recalcular sugestões";
    } catch {
      if (request !== version) return;
      status.textContent =
        "Não foi possível consultar todos os tipos. A equipe está preservada; conecte-se ou tente novamente com os dados guardados.";
      button.textContent = "Tentar sugestões novamente";
    } finally {
      clearTimeout(timeout);
      if (request === version) button.disabled = !complete;
    }
  });
  return { update };
}

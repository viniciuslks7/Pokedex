const items = {
  "fire-stone": "Pedra de Fogo",
  "water-stone": "Pedra de Água",
  "thunder-stone": "Pedra do Trovão",
  "leaf-stone": "Pedra de Folha",
  "moon-stone": "Pedra da Lua",
  "sun-stone": "Pedra Solar",
  "shiny-stone": "Pedra do Brilho",
  "dusk-stone": "Pedra do Crepúsculo",
  "dawn-stone": "Pedra da Alvorada",
  "ice-stone": "Pedra de Gelo",
  "oval-stone": "Pedra Oval",
  "kings-rock": "Pedra do Rei",
  "metal-coat": "Revestimento Metálico",
  "dragon-scale": "Escama de Dragão",
  "up-grade": "Atualização",
  "dubious-disc": "Disco Duvidoso",
  protector: "Protetor",
  electirizer: "Eletrizador",
  magmarizer: "Magmarizador",
  "reaper-cloth": "Tecido Ceifador",
  "razor-claw": "Garra Afiada",
  "razor-fang": "Presa Afiada",
  "prism-scale": "Escama Prisma",
  "whipped-dream": "Doce de Chantilly",
  sachet: "Sachê",
  "deep-sea-tooth": "Dente do Mar Profundo",
  "deep-sea-scale": "Escama do Mar Profundo",
  "sweet-apple": "Maçã Doce",
  "tart-apple": "Maçã Ácida",
  "syrupy-apple": "Maçã de Xarope",
  "cracked-pot": "Bule Rachado",
  "chipped-pot": "Bule Lascado",
  "galarica-cuff": "Bracelete de Galárica",
  "galarica-wreath": "Coroa de Galárica",
  "auspicious-armor": "Armadura Auspiciosa",
  "malicious-armor": "Armadura Maliciosa",
  "peat-block": "Bloco de Turfa",
  "black-augurite": "Augurita Negra",
  "linking-cord": "Cabo de Ligação",
  "unremarkable-teacup": "Xícara Comum",
  "masterpiece-teacup": "Xícara Obra-prima",
};
const games = {
  "red-blue": "Red / Blue",
  yellow: "Yellow",
  "gold-silver": "Gold / Silver",
  crystal: "Crystal",
  "ruby-sapphire": "Ruby / Sapphire",
  emerald: "Emerald",
  "firered-leafgreen": "FireRed / LeafGreen",
  "diamond-pearl": "Diamond / Pearl",
  platinum: "Platinum",
  "heartgold-soulsilver": "HeartGold / SoulSilver",
  "black-white": "Black / White",
  "black-2-white-2": "Black 2 / White 2",
  "x-y": "X / Y",
  "omega-ruby-alpha-sapphire": "Omega Ruby / Alpha Sapphire",
  "sun-moon": "Sun / Moon",
  "ultra-sun-ultra-moon": "Ultra Sun / Ultra Moon",
  "lets-go-pikachu-lets-go-eevee": "Let's Go Pikachu / Eevee",
  "sword-shield": "Sword / Shield",
  "brilliant-diamond-and-shining-pearl": "Brilliant Diamond / Shining Pearl",
  "legends-arceus": "Legends: Arceus",
  "scarlet-violet": "Scarlet / Violet",
};
const title = (name) =>
  String(name)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const itemName = (item) => items[item.name] || title(item.name);
const numeric = (value) => typeof value === "number" && Number.isFinite(value);

export function formatEvolutionCondition(
  detail,
  typeLabels = {},
  { parentName, childName } = {},
) {
  const parts = [];
  const trigger = detail.trigger?.name;
  const triggers = {
    "level-up": "Subir de nível",
    trade: "Trocar com outro treinador",
    "use-item": detail.item
      ? `Usar ${itemName(detail.item)}`
      : "Usar um item não especificado",
    shed: "Subir de nível com espaço na equipe e uma Poké Bola",
    spin: "Girar o personagem",
    "tower-of-darkness": "Concluir a Torre das Trevas",
    "tower-of-waters": "Concluir a Torre das Águas",
    "three-critical-hits": "Acertar três golpes críticos na mesma batalha",
    "take-damage": "Receber dano",
    "agile-style-move": "Usar um movimento no estilo ágil",
    "strong-style-move": "Usar um movimento no estilo forte",
    "recoil-damage": "Acumular dano de recuo",
    other: "Condição especial do jogo",
  };
  if (trigger) parts.push(triggers[trigger] || "Método especial de evolução");
  if (numeric(detail.min_level))
    parts.push(`Nível ${detail.min_level} ou mais`);
  if (detail.item && trigger !== "use-item")
    parts.push(`Usar ${itemName(detail.item)}`);
  if (detail.held_item) parts.push(`Segurando ${itemName(detail.held_item)}`);
  if (numeric(detail.min_happiness))
    parts.push(`Amizade de pelo menos ${detail.min_happiness}`);
  if (numeric(detail.min_affection))
    parts.push(`Afeição de pelo menos ${detail.min_affection}`);
  if (numeric(detail.min_beauty))
    parts.push(`Beleza de pelo menos ${detail.min_beauty}`);
  if (detail.time_of_day)
    parts.push(
      {
        day: "Durante o dia",
        night: "Durante a noite",
        dusk: "Ao entardecer",
        dawn: "Ao amanhecer",
      }[detail.time_of_day] || `Horário: ${title(detail.time_of_day)}`,
    );
  if (detail.gender != null)
    parts.push(
      { 1: "Somente fêmeas", 2: "Somente machos", 3: "Sem gênero" }[
        detail.gender
      ] || "Restrição de gênero",
    );
  if (detail.known_move)
    parts.push(`Conhecer ${title(detail.known_move.name)}`);
  if (detail.known_move_type)
    parts.push(
      `Conhecer um movimento do tipo ${typeLabels[detail.known_move_type.name] || title(detail.known_move_type.name)}`,
    );
  if (detail.used_move)
    parts.push(
      `Usar ${title(detail.used_move.name)}${numeric(detail.min_move_count) ? ` pelo menos ${detail.min_move_count} vezes` : ""}`,
    );
  else if (numeric(detail.min_move_count))
    parts.push(
      `Usar o movimento exigido pelo menos ${detail.min_move_count} vezes`,
    );
  if (detail.location) parts.push(`Local: ${title(detail.location.name)}`);
  if (detail.region) parts.push(`Região: ${title(detail.region.name)}`);
  if (detail.near_special_rock) parts.push("Perto de uma rocha especial");
  if (detail.needs_overworld_rain) parts.push("Com chuva no cenário");
  if (detail.needs_multiplayer) parts.push("No modo multijogador");
  if (detail.party_species)
    parts.push(`Com ${title(detail.party_species.name)} na equipe`);
  if (detail.party_type)
    parts.push(
      `Com um Pokémon do tipo ${typeLabels[detail.party_type.name] || title(detail.party_type.name)} na equipe`,
    );
  if (detail.trade_species)
    parts.push(`Trocar por ${title(detail.trade_species.name)}`);
  if (detail.relative_physical_stats != null)
    parts.push(
      {
        "-1": "Ataque menor que Defesa",
        0: "Ataque igual à Defesa",
        1: "Ataque maior que Defesa",
      }[detail.relative_physical_stats] ||
        "Relação específica entre Ataque e Defesa",
    );
  if (detail.turn_upside_down)
    parts.push("Virar o aparelho de cabeça para baixo");
  if (numeric(detail.min_steps))
    parts.push(`Caminhar pelo menos ${detail.min_steps} passos`);
  if (numeric(detail.min_damage_taken))
    parts.push(
      `Receber pelo menos ${detail.min_damage_taken} pontos de dano${trigger === "recoil-damage" ? " de recuo" : ""}`,
    );
  if (
    detail.required_pokemon_form &&
    detail.required_pokemon_form.name !== parentName
  )
    parts.push(`Forma exigida: ${title(detail.required_pokemon_form.name)}`);
  if (
    detail.evolved_pokemon_form &&
    detail.evolved_pokemon_form.name !== childName
  )
    parts.push(`Forma resultante: ${title(detail.evolved_pokemon_form.name)}`);
  if (detail.allowed_natures?.length)
    parts.push(
      `Natureza: ${detail.allowed_natures.map((nature) => title(nature.name)).join(" ou ")}`,
    );
  if (detail.condition_expression)
    parts.push(
      "Há condições especiais adicionais; consulte as regras desse jogo",
    );
  return parts.join(" + ") || "Condição não informada pela PokéAPI";
}

export function evolutionOptions(details, typeLabels = {}, context = {}) {
  const available = Array.isArray(details)
    ? details.filter((detail) => detail && typeof detail === "object")
    : [];
  if (!available.length)
    return {
      primary: [{ text: "Condição não informada pela PokéAPI", game: null }],
      alternatives: [],
    };
  const hasDefault = available.some((detail) => detail.is_default === true);
  const seen = new Set();
  const primary = [],
    alternatives = [];
  for (const detail of available) {
    const option = {
      text: formatEvolutionCondition(detail, typeLabels, context),
      game: detail.version_group?.name
        ? games[detail.version_group.name] || title(detail.version_group.name)
        : null,
    };
    const key = JSON.stringify([
      option,
      hasDefault && detail.is_default !== true,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    (hasDefault && detail.is_default !== true ? alternatives : primary).push(
      option,
    );
  }
  return { primary, alternatives };
}

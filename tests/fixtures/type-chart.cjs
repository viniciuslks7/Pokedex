// Standard modern type chart, expressed from the defending type's perspective.
const chart = {
  normal: [["fighting"], [], ["ghost"]],
  fire: [
    ["water", "ground", "rock"],
    ["fire", "grass", "ice", "bug", "steel", "fairy"],
    [],
  ],
  water: [["electric", "grass"], ["fire", "water", "ice", "steel"], []],
  electric: [["ground"], ["electric", "flying", "steel"], []],
  grass: [
    ["fire", "ice", "poison", "flying", "bug"],
    ["water", "electric", "grass", "ground"],
    [],
  ],
  ice: [["fire", "fighting", "rock", "steel"], ["ice"], []],
  fighting: [["flying", "psychic", "fairy"], ["bug", "rock", "dark"], []],
  poison: [
    ["ground", "psychic"],
    ["grass", "fighting", "poison", "bug", "fairy"],
    [],
  ],
  ground: [["water", "grass", "ice"], ["poison", "rock"], ["electric"]],
  flying: [
    ["electric", "ice", "rock"],
    ["grass", "fighting", "bug"],
    ["ground"],
  ],
  psychic: [["bug", "ghost", "dark"], ["fighting", "psychic"], []],
  bug: [["fire", "flying", "rock"], ["grass", "fighting", "ground"], []],
  rock: [
    ["water", "grass", "fighting", "ground", "steel"],
    ["normal", "fire", "poison", "flying"],
    [],
  ],
  ghost: [
    ["ghost", "dark"],
    ["poison", "bug"],
    ["normal", "fighting"],
  ],
  dragon: [
    ["ice", "dragon", "fairy"],
    ["fire", "water", "electric", "grass"],
    [],
  ],
  dark: [["fighting", "bug", "fairy"], ["ghost", "dark"], ["psychic"]],
  steel: [
    ["fire", "fighting", "ground"],
    [
      "normal",
      "grass",
      "ice",
      "flying",
      "psychic",
      "bug",
      "rock",
      "dragon",
      "steel",
      "fairy",
    ],
    ["poison"],
  ],
  fairy: [["poison", "steel"], ["fighting", "bug", "dark"], ["dragon"]],
};
function typeResource(name) {
  const [weak, resistant, immune] = chart[name];
  return {
    name,
    damage_relations: {
      double_damage_from: weak.map((name) => ({ name })),
      half_damage_from: resistant.map((name) => ({ name })),
      no_damage_from: immune.map((name) => ({ name })),
    },
  };
}
module.exports = { chart, typeResource };

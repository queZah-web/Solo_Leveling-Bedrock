// System Shop catalogue: what can be bought / sold for System Gold.
import { ITEM_INFO } from "./consumables.js";
import { WEAPON_INFO } from "./weapons.js";

/** @type {{id:string, price:number, amount?:number, info?:string, minLevel?:number}[]} */
export const BUY = [
  { id: "sl:healing_elixir", price: 60, info: ITEM_INFO["sl:healing_elixir"] },
  { id: "sl:mana_potion", price: 60, info: ITEM_INFO["sl:mana_potion"] },
  { id: "sl:fatigue_potion", price: 40, info: ITEM_INFO["sl:fatigue_potion"] },
  { id: "sl:elixir_of_life", price: 600, info: ITEM_INFO["sl:elixir_of_life"], minLevel: 20 },
  { id: "sl:random_box", price: 300, info: ITEM_INFO["sl:random_box"] },
  { id: "sl:dungeon_key", price: 1500, info: ITEM_INFO["sl:dungeon_key"], minLevel: 10 },
  { id: "sl:kasaka_fang", price: 800, info: WEAPON_INFO["sl:kasaka_fang"], minLevel: 5 },
  { id: "sl:knight_killer", price: 1500, info: WEAPON_INFO["sl:knight_killer"], minLevel: 15 },
  { id: "sl:baruka_dagger", price: 3000, info: WEAPON_INFO["sl:baruka_dagger"], minLevel: 25 },
  { id: "sl:demon_king_dagger", price: 8000, info: WEAPON_INFO["sl:demon_king_dagger"], minLevel: 45 },
  { id: "sl:demon_king_longsword", price: 15000, info: WEAPON_INFO["sl:demon_king_longsword"], minLevel: 60 },
  { id: "minecraft:golden_apple", price: 120 },
  { id: "minecraft:ender_pearl", price: 40, amount: 4 },
  { id: "minecraft:experience_bottle", price: 25, amount: 4 },
  { id: "minecraft:iron_ingot", price: 15, amount: 4 },
  { id: "minecraft:diamond", price: 150 },
  { id: "minecraft:totem_of_undying", price: 2500, minLevel: 30 },
];

/** Gold paid per item sold. */
export const SELL = {
  "minecraft:rotten_flesh": 1, "minecraft:bone": 1, "minecraft:string": 1, "minecraft:arrow": 1,
  "minecraft:gunpowder": 2, "minecraft:spider_eye": 2, "minecraft:leather": 2, "minecraft:gold_nugget": 1,
  "minecraft:ender_pearl": 10, "minecraft:blaze_rod": 6, "minecraft:slime_ball": 3, "minecraft:phantom_membrane": 5,
  "minecraft:coal": 1, "minecraft:copper_ingot": 1, "minecraft:iron_ingot": 5, "minecraft:gold_ingot": 8,
  "minecraft:redstone": 1, "minecraft:lapis_lazuli": 2, "minecraft:emerald": 30, "minecraft:diamond": 50,
  "minecraft:amethyst_shard": 2, "minecraft:quartz": 2, "minecraft:netherite_scrap": 300, "minecraft:netherite_ingot": 1300,
  "minecraft:packed_ice": 2, "minecraft:echo_shard": 40, "minecraft:nether_star": 2000, "minecraft:ghast_tear": 15,
};

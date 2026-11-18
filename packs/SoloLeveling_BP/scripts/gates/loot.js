// Dungeon chest loot. Every rank is a little better: higher-tier gear,
// more and stronger enchantments, better resources and System items.
import { EnchantmentTypes, ItemStack } from "@minecraft/server";

const TIERS = ["stone", "iron", "iron", "diamond", "diamond", "netherite"];
const ARMOR_TIERS = ["chainmail", "iron", "iron", "diamond", "diamond", "netherite"];
const WEAPONS = ["sword", "axe"];
const TOOLS = ["pickaxe", "shovel", "axe"];
const ARMOR = ["helmet", "chestplate", "leggings", "boots"];

const ENCH = {
  sword: [["sharpness", 5], ["smite", 5], ["looting", 3], ["fire_aspect", 2], ["unbreaking", 3], ["knockback", 2]],
  axe: [["sharpness", 5], ["efficiency", 5], ["unbreaking", 3]],
  pickaxe: [["efficiency", 5], ["fortune", 3], ["unbreaking", 3]],
  shovel: [["efficiency", 5], ["unbreaking", 3]],
  armor: [["protection", 4], ["unbreaking", 3], ["fire_protection", 4], ["blast_protection", 4], ["projectile_protection", 4]],
  helmet: [["respiration", 3], ["aqua_affinity", 1]],
  boots: [["feather_falling", 4], ["depth_strider", 3]],
  bow: [["power", 5], ["punch", 2], ["flame", 1], ["unbreaking", 3]],
};

/** rank -> [item, min, max, weight] resources and System items */
const GOODS = [
  [["minecraft:iron_ingot", 3, 8, 10], ["minecraft:bread", 3, 6, 8], ["minecraft:arrow", 8, 16, 6], ["sl:healing_elixir", 1, 1, 5],
    ["minecraft:coal", 4, 10, 6], ["sl:goblin_fang", 1, 3, 4], ["minecraft:experience_bottle", 2, 4, 4]],
  [["minecraft:iron_ingot", 5, 10, 9], ["minecraft:gold_ingot", 3, 7, 8], ["minecraft:golden_apple", 1, 1, 4], ["sl:healing_elixir", 1, 2, 6],
    ["sl:mana_potion", 1, 1, 5], ["sl:orc_tusk", 1, 2, 4], ["minecraft:lapis_lazuli", 4, 10, 5], ["minecraft:experience_bottle", 3, 6, 5]],
  [["minecraft:diamond", 1, 3, 7], ["minecraft:gold_ingot", 5, 10, 7], ["minecraft:golden_apple", 1, 2, 5], ["sl:mana_potion", 1, 2, 6],
    ["sl:frost_essence", 1, 3, 5], ["sl:mana_crystal", 1, 2, 4], ["minecraft:emerald", 2, 6, 5], ["minecraft:experience_bottle", 4, 8, 5]],
  [["minecraft:diamond", 2, 5, 8], ["minecraft:emerald", 4, 10, 6], ["sl:mana_crystal", 1, 3, 6], ["sl:demon_horn", 1, 2, 4],
    ["sl:elixir_of_life", 1, 1, 2], ["minecraft:golden_apple", 2, 3, 5], ["minecraft:ender_pearl", 2, 4, 4], ["minecraft:netherite_scrap", 1, 1, 2]],
  [["minecraft:diamond", 4, 8, 8], ["minecraft:netherite_scrap", 1, 2, 5], ["sl:mana_crystal", 2, 4, 6], ["sl:demon_horn", 2, 3, 5],
    ["sl:elixir_of_life", 1, 1, 3], ["minecraft:totem_of_undying", 1, 1, 2], ["minecraft:enchanted_golden_apple", 1, 1, 1], ["sl:random_box", 1, 1, 3]],
  [["minecraft:netherite_scrap", 2, 4, 6], ["minecraft:netherite_ingot", 1, 1, 3], ["sl:mana_crystal", 3, 6, 6], ["sl:demon_horn", 3, 5, 5],
    ["sl:elixir_of_life", 1, 2, 4], ["minecraft:totem_of_undying", 1, 1, 3], ["minecraft:enchanted_golden_apple", 1, 2, 2], ["sl:random_box", 1, 2, 3]],
];

/** Boss vault extras: the Solo Leveling weapons. */
const BOSS_WEAPONS = [[], [], ["sl:kasaka_fang"], ["sl:knight_killer", "sl:kasaka_fang"], ["sl:baruka_dagger", "sl:knight_killer"],
  ["sl:demon_king_dagger", "sl:baruka_dagger"]];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
function weighted(rnd, list) {
  let r = rnd() * list.reduce((s, x) => s + x[3], 0);
  for (const x of list) if ((r -= x[3]) <= 0) return x;
  return list[0];
}

function enchant(rnd, item, kind, rank) {
  const ench = item.getComponent("minecraft:enchantable");
  if (!ench) return;
  const pool = [...(ENCH[kind] ?? []), ...(ARMOR.includes(kind) ? ENCH.armor : [])];
  const count = Math.min(pool.length, Math.floor(rnd() * (1 + rank * 0.6)) + (rank >= 2 ? 1 : 0));
  for (let i = 0; i < count; i++) {
    const [id, max] = pick(rnd, pool);
    const type = EnchantmentTypes.get(id);
    if (!type) continue;
    const level = Math.max(1, Math.min(max, Math.round(1 + rnd() * (max - 1) * ((rank + 1) / 6))));
    const e = { type, level };
    try {
      if (ench.canAddEnchantment(e)) ench.addEnchantment(e);
    } catch {}
  }
}

function gear(rnd, rank) {
  const roll = rnd();
  let id;
  let kind;
  if (roll < 0.35) {
    kind = pick(rnd, WEAPONS);
    id = `minecraft:${TIERS[rank] === "stone" && kind === "axe" ? "stone" : TIERS[rank]}_${kind}`;
  } else if (roll < 0.75) {
    kind = pick(rnd, ARMOR);
    id = `minecraft:${ARMOR_TIERS[rank]}_${kind}`;
  } else if (roll < 0.9) {
    kind = pick(rnd, TOOLS);
    id = `minecraft:${TIERS[rank]}_${kind}`;
  } else {
    kind = "bow";
    id = rank >= 3 && rnd() < 0.4 ? "minecraft:crossbow" : "minecraft:bow";
  }
  const item = new ItemStack(id.replace("minecraft:netherite_shovel", "minecraft:netherite_shovel"), 1);
  if (rnd() < 0.35 + rank * 0.12) enchant(rnd, item, kind, rank);
  return item;
}

/**
 * Items for one chest.
 * @param {number} rank 0..5  @param {"treasure"|"boss"} kind
 */
export function rollLoot(rank, kind, rnd = Math.random) {
  const out = [];
  const gearCount = kind === "boss" ? 3 : 1 + (rnd() < 0.4 ? 1 : 0);
  for (let i = 0; i < gearCount; i++) {
    try {
      out.push(gear(rnd, rank));
    } catch {}
  }
  const goods = kind === "boss" ? 6 : 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < goods; i++) {
    const [id, a, b] = weighted(rnd, GOODS[rank]);
    try {
      out.push(new ItemStack(id, a + Math.floor(rnd() * (b - a + 1))));
    } catch {}
  }
  if (kind === "boss" && BOSS_WEAPONS[rank].length && rnd() < 0.35 + rank * 0.08) {
    try {
      out.push(new ItemStack(pick(rnd, BOSS_WEAPONS[rank]), 1));
    } catch {}
  }
  return out;
}

/** Fills a chest block with loot, scattered over its slots. */
export function fillChest(block, rank, kind) {
  const c = block?.getComponent("minecraft:inventory")?.container;
  if (!c) return false;
  const items = rollLoot(rank, kind);
  const slots = [...Array(c.size).keys()].sort(() => Math.random() - 0.5);
  items.forEach((it, i) => c.setItem(slots[i % c.size], it));
  return true;
}

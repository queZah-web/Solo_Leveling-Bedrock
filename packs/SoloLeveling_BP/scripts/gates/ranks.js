// Gate ranks: dungeon size, monsters, bosses, themes and rewards.

/**
 * light = full light block placed in the ceiling.
 * @typedef {{rank:string, color:string, level:number, rooms:number, mobs:string[], boss:{id:string, name:string},
 *  theme:{floor:string, wall:string, accent:string, light:string}, xp:number, loot:[string, number, number][]}} GateRank
 */
/** @type {GateRank[]} */
export const GATE_RANKS = [
  {
    rank: "E", color: "§7", level: 1, rooms: 2,
    mobs: ["minecraft:zombie", "minecraft:skeleton", "minecraft:spider"],
    boss: { id: "minecraft:zombie", name: "Goblin Chieftain" },
    theme: { floor: "minecraft:stone_bricks", wall: "minecraft:mossy_stone_bricks", accent: "minecraft:cracked_stone_bricks", light: "minecraft:glowstone" },
    xp: 250, loot: [["minecraft:iron_ingot", 4, 10], ["minecraft:bread", 4, 8], ["minecraft:arrow", 8, 16]],
  },
  {
    rank: "D", color: "§e", level: 10, rooms: 3,
    mobs: ["minecraft:husk", "minecraft:zombie", "minecraft:pillager", "minecraft:skeleton"],
    boss: { id: "minecraft:vindicator", name: "Hobgoblin Warlord" },
    theme: { floor: "minecraft:smooth_sandstone", wall: "minecraft:cut_sandstone", accent: "minecraft:chiseled_sandstone", light: "minecraft:glowstone" },
    xp: 700, loot: [["minecraft:gold_ingot", 4, 10], ["minecraft:iron_ingot", 8, 16], ["minecraft:golden_apple", 1, 2]],
  },
  {
    rank: "C", color: "§a", level: 20, rooms: 3,
    mobs: ["minecraft:stray", "minecraft:skeleton", "minecraft:vindicator", "minecraft:witch"],
    boss: { id: "minecraft:stray", name: "Ice Elf Captain" },
    theme: { floor: "minecraft:packed_ice", wall: "minecraft:blue_ice", accent: "minecraft:snow_block", light: "minecraft:sea_lantern" },
    xp: 1800, loot: [["minecraft:diamond", 2, 5], ["minecraft:golden_apple", 2, 4], ["minecraft:experience_bottle", 8, 16]],
  },
  {
    rank: "B", color: "§9", level: 35, rooms: 4,
    mobs: ["minecraft:wither_skeleton", "minecraft:blaze", "minecraft:magma_cube", "minecraft:piglin_brute"],
    boss: { id: "minecraft:ravager", name: "Tank, the Ice Bear" },
    theme: { floor: "minecraft:nether_bricks", wall: "minecraft:red_nether_bricks", accent: "minecraft:chiseled_nether_bricks", light: "minecraft:shroomlight" },
    xp: 4500, loot: [["minecraft:diamond", 4, 8], ["minecraft:emerald", 6, 12], ["minecraft:netherite_scrap", 1, 2]],
  },
  {
    rank: "A", color: "§d", level: 50, rooms: 4,
    mobs: ["minecraft:vindicator", "minecraft:evocation_illager", "minecraft:wither_skeleton", "minecraft:piglin_brute"],
    boss: { id: "minecraft:wither_skeleton", name: "Igris the Bloodred" },
    theme: { floor: "minecraft:deepslate_tiles", wall: "minecraft:polished_blackstone_bricks", accent: "minecraft:gilded_blackstone", light: "minecraft:pearlescent_froglight" },
    xp: 10000, loot: [["minecraft:diamond", 8, 16], ["minecraft:netherite_scrap", 2, 4], ["minecraft:totem_of_undying", 1, 1]],
  },
  {
    rank: "S", color: "§c", level: 70, rooms: 5,
    mobs: ["minecraft:wither_skeleton", "minecraft:ravager", "minecraft:evocation_illager", "minecraft:piglin_brute"],
    boss: { id: "minecraft:warden", name: "Beru, the Ant King" },
    theme: { floor: "minecraft:obsidian", wall: "minecraft:crying_obsidian", accent: "minecraft:purpur_pillar", light: "minecraft:verdant_froglight" },
    xp: 25000, loot: [["minecraft:netherite_ingot", 1, 3], ["minecraft:enchanted_golden_apple", 1, 2], ["minecraft:totem_of_undying", 1, 2]],
  },
];
export const RANK_INDEX = Object.fromEntries(GATE_RANKS.map((r, i) => [r.rank, i]));

export const RED_CHANCE = 0.05;
export const RED_REWARD = 1.5;
export const MAX_GATES = 14;
export const MAX_DUNGEONS = 4; // dungeons running at the same time

/** Gate colour variant per rank (E blue, D pink, C green, B pink, A pink, S red). */
export const RANK_COLOR = [0, 2, 1, 2, 2, 3];
export const RED_GATE_COLOR = 4; // crimson
export const COLOR_NAMES = ["blue", "green", "pink", "red", "crimson"];

/** Minutes a gate stays open before its Dungeon Break. */
export const lifetimeMin = (rank) => (rank >= 4 ? 120 : 30);

/** Where gates appear: this far from the chosen hunter, and never closer than MIN to anyone. */
export const GATE_DIST = { min: 500, max: 2000 };

/**
 * Spawn schedule. "early" = the first 72 real hours after the mod was added.
 * every = minutes between gates of that kind.
 */
export const SCHEDULE = {
  earlyHours: 72,
  early: { any: 30, A: 12 * 60, S: 24 * 60, ranks: [0, 0, 1, 1, 2, 3] },
  late: { any: 15, A: 6 * 60, S: 12 * 60, ranks: [0, 1, 1, 2, 2, 3, 3] },
};

/** Rank for a hunter level (mostly matching, sometimes harder or easier). */
export function rollRank(level) {
  let i = 0;
  GATE_RANKS.forEach((r, k) => {
    if (level >= r.level) i = k;
  });
  const roll = Math.random();
  if (roll < 0.15 && i > 0) i--;
  else if (roll > 0.85 && i < GATE_RANKS.length - 1) i++;
  return i;
}

// Central balance values for the System. Tweak numbers here.

export const GEM_ID = "sl:system_gem";
export const DATA_KEY = "sl:data";
export const DATA_VERSION = 1;

export const MAX_LEVEL = 150;
export const POINTS_PER_LEVEL = 5;
export const BASE_STAT = 10;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/** Hunter rank by level. */
export const RANKS = [
  { min: 90, name: "National Level", color: "§c" },
  { min: 70, name: "S-Rank", color: "§6" },
  { min: 50, name: "A-Rank", color: "§d" },
  { min: 35, name: "B-Rank", color: "§9" },
  { min: 20, name: "C-Rank", color: "§a" },
  { min: 10, name: "D-Rank", color: "§e" },
  { min: 0, name: "E-Rank", color: "§7" },
];

export const STATS = [
  { key: "str", name: "STRENGTH", short: "STR", color: "§c", desc: "+2% melee damage per point" },
  { key: "agi", name: "AGILITY", short: "AGI", color: "§a", desc: "Movement speed tiers" },
  { key: "vit", name: "VITALITY", short: "VIT", color: "§6", desc: "Max HP & damage reduction" },
  { key: "int", name: "INTELLIGENCE", short: "INT", color: "§9", desc: "Max MP & MP regen" },
  { key: "per", name: "PERCEPTION", short: "PER", color: "§d", desc: "Critical chance & ranged damage" },
];

// --- Derived formulas -------------------------------------------------------
export const strDamageMult = (str) => 1 + Math.max(0, str - BASE_STAT) * 0.02;
export const critChance = (per) => Math.min(0.5, 0.05 + Math.max(0, per - BASE_STAT) * 0.004);
export const CRIT_MULT = 1.6;
export const rangedMult = (per) => 1 + Math.max(0, per - BASE_STAT) * 0.015;
/** health_boost amplifier (each level = +4 HP). -1 = none. */
export const vitHealthBoost = (vit) => Math.min(49, Math.floor((vit - BASE_STAT) / 4) - 1);
export const vitReduction = (vit) => Math.min(0.6, Math.max(0, vit - BASE_STAT) * 0.004);
/** speed amplifier. -1 = none. */
export const agiSpeed = (agi) => Math.min(3, Math.floor((agi - BASE_STAT) / 20) - 1);
export const maxMp = (int) => 100 + int * 10;
export const mpRegenPerSec = (int) => 1 + int * 0.1;

// Fatigue (0-100): rises in combat, recovers while resting.
export const FATIGUE_PER_HIT = 0.6;
export const FATIGUE_RECOVER_PER_SEC = 1.5;
export const FATIGUE_HEAVY = 80;

/** XP rewards for special mobs. Others use their max health. */
export const XP_OVERRIDES = {
  "minecraft:ender_dragon": 5000,
  "minecraft:wither": 3000,
  "minecraft:warden": 2500,
  "sl:boss_beru": 3000,
  "sl:boss_igris": 1600,
  "minecraft:elder_guardian": 800,
  "minecraft:ravager": 300,
  "minecraft:evocation_illager": 250,
  "minecraft:piglin_brute": 200,
  "minecraft:player": 0,
};

// Shadow soldier types, grades and skills.

/** Shadow grades from the manhwa, with UI rank letters. */
export const GRADES = [
  { name: "Normal", rank: "F", color: "§7", cost: 10, extract: 0.6 },
  { name: "Elite", rank: "E", color: "§a", cost: 20, extract: 0.45 },
  { name: "Knight", rank: "D", color: "§b", cost: 35, extract: 0.32 },
  { name: "Elite Knight", rank: "C", color: "§9", cost: 50, extract: 0.24 },
  { name: "Commander", rank: "B", color: "§d", cost: 80, extract: 0.15 },
  { name: "Marshal", rank: "A", color: "§6", cost: 120, extract: 0.1 },
  { name: "Grand Marshal", rank: "S", color: "§c", cost: 160, extract: 0.05 },
];

/**
 * Extractable mobs. `grade` = starting grade index.
 * `named` = the first extraction of this mob becomes a named shadow.
 * @type {Record<string, {mob:string, label:string, grade:number, skill:string, skillDesc:string, named?:{name:string, grade:number}}>}
 */
export const SHADOW_TYPES = {
  zombie: { mob: "minecraft:zombie", label: "Shadow Zombie", grade: 0, skill: "GRAVE STRIKE", skillDesc: "Hits slow the target." },
  husk: { mob: "minecraft:husk", label: "Shadow Husk", grade: 0, skill: "PLAGUE TOUCH", skillDesc: "Hits cause hunger and weakness." },
  drowned: { mob: "minecraft:drowned", label: "Shadow Drowned", grade: 0, skill: "TIDE GRIP", skillDesc: "Hits heavily slow the target." },
  skeleton: { mob: "minecraft:skeleton", label: "Shadow Archer", grade: 0, skill: "BONE ARROW", skillDesc: "Ranged attacker. Arrows slow." },
  stray: { mob: "minecraft:stray", label: "Shadow Frost Archer", grade: 1, skill: "FROST ARROW", skillDesc: "Ranged attacker. Arrows freeze." },
  spider: { mob: "minecraft:spider", label: "Shadow Spider", grade: 0, skill: "VENOM BITE", skillDesc: "Hits poison the target." },
  wolf: { mob: "minecraft:wolf", label: "Shadow Wolf", grade: 0, skill: "FERAL BITE", skillDesc: "Fast. Hits deal bonus damage." },
  creeper: { mob: "minecraft:creeper", label: "Shadow Creeper", grade: 0, skill: "SHADOW BLAST", skillDesc: "Explodes on enemies. More blasts with level & rank." },
  wither_skeleton: {
    mob: "minecraft:wither_skeleton", label: "Shadow Knight", grade: 2, skill: "WITHER BLADE", skillDesc: "Hits wither the target.",
    named: { name: "Igris", grade: 4 },
  },
  enderman: { mob: "minecraft:enderman", label: "Shadow Stalker", grade: 1, skill: "VOID STEP", skillDesc: "Hits blind the target." },
  vindicator: { mob: "minecraft:vindicator", label: "Shadow Executioner", grade: 1, skill: "EXECUTION", skillDesc: "Bonus damage on weak targets." },
  iron_golem: {
    mob: "minecraft:iron_golem", label: "Shadow Golem", grade: 2, skill: "TITAN SLAM", skillDesc: "Hits launch the target.",
    named: { name: "Iron", grade: 3 },
  },
  ravager: {
    mob: "minecraft:ravager", label: "Shadow Beast", grade: 2, skill: "RAMPAGE", skillDesc: "Hits knock back and slow.",
    named: { name: "Tank", grade: 3 },
  },
  warden: {
    mob: "minecraft:warden", label: "Shadow Abyss", grade: 4, skill: "SONIC ROAR", skillDesc: "Hits darken and weaken.",
    named: { name: "Beru", grade: 5 },
  },
};

/** vanilla mob id -> shadow type id */
export const MOB_TO_TYPE = Object.fromEntries(Object.entries(SHADOW_TYPES).map(([k, v]) => [v.mob, k]));

export const entityIdOf = (type) => `sl:shadow_${type}`;
export const portraitOf = (type) => `textures/sl/shadows/${type}`;

// ---------------------------------------------------------------- progression
export const SHADOW_MAX_LEVEL = 100;
export const shadowXpToNext = (level) => Math.floor(40 * Math.pow(level, 1.4));
/** Damage dealt multiplier. */
export const shadowAtkMult = (s) => 1 + (s.level - 1) * 0.05 + s.grade * 0.15;
/** Damage taken multiplier (lower = tougher). */
export const shadowDefMult = (s) => 1 / (1 + (s.level - 1) * 0.04 + s.grade * 0.12);
/** Grade promotion every 20 levels (named shadows keep their minimum grade). */
export const gradeForLevel = (base, level) => Math.min(GRADES.length - 1, base + Math.floor((level - 1) / 20));

/** Seconds a fallen shadow needs to regenerate. */
export const reviveSeconds = (s) => 30 + s.grade * 15;

// ---------------------------------------------------------------- army limits
/**
 * Army limits unlocked by hunter rank (same levels as the rank table).
 * army = how many shadows you can own, active = how many can be summoned.
 */
export const RANK_LIMITS = [
  { min: 90, rank: "National Level", army: 100, active: 24 },
  { min: 70, rank: "S-Rank", army: 80, active: 18 },
  { min: 50, rank: "A-Rank", army: 60, active: 14 },
  { min: 35, rank: "B-Rank", army: 45, active: 10 },
  { min: 20, rank: "C-Rank", army: 30, active: 7 },
  { min: 10, rank: "D-Rank", army: 18, active: 5 },
  { min: 0, rank: "E-Rank", army: 10, active: 3 },
];
const limitsFor = (level) => RANK_LIMITS.find((r) => level >= r.min) ?? RANK_LIMITS[RANK_LIMITS.length - 1];
/** The next rank's limits, or undefined at the top rank. */
export const nextRankLimits = (level) => [...RANK_LIMITS].reverse().find((r) => r.min > level);

/** Owned shadows: rank base + 1 per 2 levels inside the rank. */
export const armyCapacity = (level) => {
  const r = limitsFor(level);
  const next = nextRankLimits(level);
  const extra = Math.floor((level - r.min) / 2);
  return Math.min(next ? next.army - 1 : 100, r.army + extra);
};
/** Summoned at once: rank base + 1 per 10 INT above 10 (max 30). */
export const activeLimit = (level, int) => Math.min(30, limitsFor(level).active + Math.floor(Math.max(0, int - 10) / 10));

// ---------------------------------------------------------------- creeper
/** Explosions before the shadow creeper falls (1 at Lv1 Normal). */
export const creeperCharges = (s) => Math.min(10, 1 + Math.floor((s.level - 1) / 10) + s.grade);
/** Explosion radius (weak at first, strong when leveled). */
export const creeperPower = (s) => Math.min(4.5, 1.3 + (s.level - 1) * 0.03 + s.grade * 0.3);

export const FOOD_MAX = 64;

export const ARISE_MP = 10;
export const ARISE_ATTEMPTS = 3;
export const CORPSE_SECONDS = 20;
export const FEED_MP = 20;
export const TRAIN_MP = 50;

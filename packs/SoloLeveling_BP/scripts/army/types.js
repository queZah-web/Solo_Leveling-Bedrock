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
export const armyCapacity = (level) => Math.min(100, 5 + Math.floor(level / 2));
export const activeLimit = (level, int) => Math.min(30, 2 + Math.floor(level / 5) + Math.floor(Math.max(0, int - 10) / 10));

export const ARISE_MP = 10;
export const ARISE_ATTEMPTS = 3;
export const CORPSE_SECONDS = 20;
export const FEED_MP = 20;
export const TRAIN_MP = 50;

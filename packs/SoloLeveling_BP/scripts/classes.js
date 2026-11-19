// Jobs and Titles: definitions and the combined bonus they give a hunter.
// Pure data (no world access), so any module can import it.

/**
 * Every bonus a job or title can give. Multipliers default to 1, adds to 0.
 * @typedef {{dmgMult?:number, takenMult?:number, critAdd?:number, critMult?:number, rangedMult?:number,
 *  mpRegenMult?:number, fatigueMult?:number, skillCd?:number, skillMp?:number,
 *  skillCdById?:Record<string, number>, skillMpById?:Record<string, number>,
 *  armyCap?:number, activeAdd?:number, extractAdd?:number, shadowAtk?:number, shadowDef?:number, summonCost?:number,
 *  dungeonReward?:number, thorns?:number, healAura?:number, lowHpTaken?:number, aloneDmg?:number,
 *  vs?:{families?:string[], ids?:string[], tag?:string, mult:number}[]}} Bonus
 */

/** Job Change Quest: needs this level. */
export const JOB_LEVEL = 40;
/** Necromancers awaken as the Shadow Monarch at this level. */
export const MONARCH_LEVEL = 100;

/** @type {Record<string, {name:string, color:string, stats:Record<string, number>, desc:string[], bonus:Bonus, pick?:boolean}>} */
export const JOBS = {
  necromancer: {
    name: "Necromancer", color: "§5", pick: true, stats: { int: 10, vit: 5 },
    desc: ["Bigger army: +50% shadow slots, +2 active", "+10% extraction chance", "Shadows deal +10% damage", "Awakens as the Shadow Monarch at Lv " + MONARCH_LEVEL],
    bonus: { armyCap: 1.5, activeAdd: 2, extractAdd: 0.1, shadowAtk: 1.1 },
  },
  assassin: {
    name: "Assassin", color: "§c", pick: true, stats: { agi: 10, per: 5 },
    desc: ["+10% critical chance", "Critical hits x2.0 (instead of x1.6)", "Stealth & Dagger Rush: -40% MP, -30% cooldown"],
    bonus: { critAdd: 0.1, critMult: 0.4, skillMpById: { stealth: 0.6, dagger_rush: 0.6 }, skillCdById: { stealth: 0.7, dagger_rush: 0.7 } },
  },
  knight: {
    name: "Knight", color: "§6", pick: true, stats: { vit: 15 },
    desc: ["-12% damage taken", "Reflects 20% of melee damage back", "Bloodlust: -40% MP"],
    bonus: { takenMult: 0.88, thorns: 0.2, skillMpById: { bloodlust: 0.6 } },
  },
  mage: {
    name: "Mage", color: "§9", pick: true, stats: { int: 15 },
    desc: ["+50% MP regeneration", "All skills: -20% cooldown, -15% MP"],
    bonus: { mpRegenMult: 1.5, skillCd: 0.8, skillMp: 0.85 },
  },
  ranger: {
    name: "Ranger", color: "§a", pick: true, stats: { per: 12, agi: 3 },
    desc: ["+30% ranged damage", "+5% critical chance"],
    bonus: { rangedMult: 1.3, critAdd: 0.05 },
  },
  healer: {
    name: "Healer", color: "§d", pick: true, stats: { vit: 8, int: 7 },
    desc: ["Heals nearby hunters and your shadows (2 HP / 4s)", "+20% MP regeneration", "Fatigue builds 30% slower"],
    bonus: { healAura: 2, mpRegenMult: 1.2, fatigueMult: 0.7 },
  },
  shadow_monarch: {
    name: "Shadow Monarch", color: "§5§l", stats: { int: 20, vit: 10, str: 10 },
    desc: ["Double shadow slots, +5 active", "+20% extraction chance", "Shadows: +30% damage, -20% damage taken", "Summoning costs 40% less MP", "+10% damage dealt"],
    bonus: { armyCap: 2, activeAdd: 5, extractAdd: 0.2, shadowAtk: 1.3, shadowDef: 0.8, summonCost: 0.6, dmgMult: 1.1 },
  },
};
export const PICKABLE = Object.keys(JOBS).filter((k) => JOBS[k].pick);

const BEASTS = ["minecraft:wolf", "sl:dg_hound", "sl:dg_ice_bear", "minecraft:polar_bear", "minecraft:ravager", "minecraft:hoglin", "minecraft:zoglin", "sl:boss_tank"];
const DEMONS = ["sl:dg_mage", "minecraft:blaze", "minecraft:wither_skeleton", "minecraft:ghast", "minecraft:magma_cube", "minecraft:piglin",
  "minecraft:zombie_pigman", "minecraft:piglin_brute", "minecraft:evocation_illager", "minecraft:witch", "minecraft:vex", "sl:orc"];
const INSECTS = ["sl:dg_ant", "sl:dg_spider", "minecraft:spider", "minecraft:cave_spider", "minecraft:silverfish", "minecraft:endermite", "minecraft:bee", "sl:boss_beru"];
const KNIGHTS = ["sl:dg_knight", "sl:dg_soldier", "sl:boss_igris", "minecraft:vindicator", "minecraft:pillager", "minecraft:skeleton", "minecraft:stray"];
const BOSSES = ["sl:boss_igris", "sl:boss_beru", "sl:boss_tank", "minecraft:wither", "minecraft:ender_dragon", "minecraft:warden", "minecraft:elder_guardian"];
export const KILL_GROUPS = { beast: BEASTS, demon: DEMONS, insect: INSECTS, knight: KNIGHTS };

/**
 * Titles: unlocked by deeds, one is worn at a time.
 * `need(d)` returns [current, goal] for the progress bar.
 * @type {{id:string, name:string, color:string, how:string, effect:string, need:(d:any)=>[number, number], bonus:Bonus}[]}
 */
export const TITLES = [
  { id: "adversity", name: "The One Who Overcame Adversity", color: "§e", how: "Survive the Penalty Zone", effect: "-25% damage taken while below 30% HP",
    need: (d) => [d.tk?.penalty ?? 0, 1], bonus: { lowHpTaken: 0.75 } },
  { id: "wolf_slayer", name: "Wolf Slayer", color: "§7", how: "Slay 50 beasts (wolves, hounds, bears...)", effect: "+25% damage to beasts",
    need: (d) => [d.tk?.beast ?? 0, 50], bonus: { vs: [{ ids: BEASTS, mult: 1.25 }] } },
  { id: "insect_hunter", name: "Exterminator", color: "§2", how: "Slay 100 insects (ants, spiders...)", effect: "+25% damage to insects",
    need: (d) => [d.tk?.insect ?? 0, 100], bonus: { vs: [{ ids: INSECTS, mult: 1.25 }] } },
  { id: "demon_hunter", name: "Demon Hunter", color: "§4", how: "Slay 100 demons (mages, blazes, wither skeletons...)", effect: "+25% damage to demons",
    need: (d) => [d.tk?.demon ?? 0, 100], bonus: { vs: [{ ids: DEMONS, mult: 1.25 }] } },
  { id: "knight_killer", name: "Knight Killer", color: "§c", how: "Defeat Igris the Bloodred", effect: "+25% damage to knights and soldiers",
    need: (d) => [d.tk?.igris ?? 0, 1], bonus: { vs: [{ ids: KNIGHTS, mult: 1.25 }] } },
  { id: "giant_slayer", name: "Giant Slayer", color: "§6", how: "Defeat 5 bosses", effect: "+20% damage to bosses",
    need: (d) => [d.tk?.boss ?? 0, 5], bonus: { vs: [{ ids: BOSSES, tag: "sl_boss", mult: 1.2 }] } },
  { id: "gate_breaker", name: "Gate Breaker", color: "§b", how: "Clear 10 gates", effect: "+20% XP and gold from cleared dungeons",
    need: (d) => [d.gatesCleared ?? 0, 10], bonus: { dungeonReward: 1.2 } },
  { id: "red_survivor", name: "Survivor of the Red Gate", color: "§4", how: "Clear a Red Gate", effect: "+6% critical chance",
    need: (d) => [d.tk?.red ?? 0, 1], bonus: { critAdd: 0.06 } },
  { id: "lone_hunter", name: "The One Who Hunts Alone", color: "§8", how: "Clear an A or S gate with no other hunter", effect: "+15% damage with no other hunter within 32 blocks",
    need: (d) => [d.tk?.solo ?? 0, 1], bonus: { aloneDmg: 1.15 } },
  { id: "diligent", name: "Diligent", color: "§a", how: "Claim 7 Daily Quest rewards", effect: "+25% MP regen, fatigue builds 25% slower",
    need: (d) => [d.tk?.daily ?? 0, 7], bonus: { mpRegenMult: 1.25, fatigueMult: 0.75 } },
  { id: "commander", name: "Commander of the Dead", color: "§d", how: "Have 50 shadows in your army", effect: "Shadows: +10% damage, -10% damage taken",
    need: (d) => [d.shadows?.length ?? 0, 50], bonus: { shadowAtk: 1.1, shadowDef: 0.9 } },
  { id: "monarch", name: "King of the Dead", color: "§5", how: "Awaken as the Shadow Monarch", effect: "+8% damage dealt, shadows +10% damage",
    need: (d) => [d.job === "Shadow Monarch" ? 1 : 0, 1], bonus: { dmgMult: 1.08, shadowAtk: 1.1 } },
];
export const TITLE_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));

/** Guild perks by guild level (1..5), cumulative. */
/** @type {Bonus[]} */
const GUILD_BONUS = [{}, { dungeonReward: 1.05 }, { activeAdd: 1 }, { dungeonReward: 1.1 / 1.05 }, { dmgMult: 1.05, shadowAtk: 1.05 }];

export const jobOf = (d) => Object.values(JOBS).find((j) => j.name === d.job);
export const titleOf = (d) => (d.titleId ? TITLE_BY_ID[d.titleId] : undefined);

const MULTS = ["dmgMult", "takenMult", "rangedMult", "mpRegenMult", "fatigueMult", "skillCd", "skillMp", "armyCap", "shadowAtk", "shadowDef",
  "summonCost", "dungeonReward", "lowHpTaken", "aloneDmg"];
const ADDS = ["critAdd", "critMult", "activeAdd", "extractAdd", "thorns", "healAura"];

const memo = new Map();
/**
 * The hunter's combined job + title bonus (multipliers multiplied, adds added).
 * @returns {Required<Omit<Bonus, "skillCdById"|"skillMpById"|"vs">> & {skillCdById:Record<string, number>, skillMpById:Record<string, number>, vs:any[]}}
 */
export function bonusOf(d) {
  const key = `${d.job}|${d.titleId ?? ""}|${d.gl ?? 0}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const parts = [jobOf(d)?.bonus, titleOf(d)?.bonus, ...GUILD_BONUS.slice(0, d.gl ?? 0)].filter(Boolean);
  /** @type {any} */
  const b = { skillCdById: {}, skillMpById: {}, vs: [] };
  for (const k of MULTS) b[k] = parts.reduce((m, p) => m * (p[k] ?? 1), 1);
  for (const k of ADDS) b[k] = parts.reduce((m, p) => m + (p[k] ?? 0), 0);
  for (const p of parts) {
    Object.assign(b.skillCdById, p.skillCdById ?? {});
    Object.assign(b.skillMpById, p.skillMpById ?? {});
    b.vs.push(...(p.vs ?? []));
  }
  memo.set(key, b);
  return b;
}

/** Extra damage multiplier against this entity from "vs" bonuses. */
export function vsMult(b, entity) {
  let m = 1;
  for (const v of b.vs) {
    if (v.ids?.includes(entity.typeId) || (v.tag && entity.hasTag?.(v.tag))) m *= v.mult;
  }
  return m;
}

/** Skill MP cost and cooldown after job/title bonuses. */
export const skillCost = (b, sk) => Math.max(1, Math.round(sk.mp * b.skillMp * (b.skillMpById[sk.id] ?? 1)));
export const skillCooldown = (b, sk) => Math.max(1, Math.round(sk.cd * b.skillCd * (b.skillCdById[sk.id] ?? 1)));

// Shadow Army: extraction (ARISE), summoning, leveling, skills.
//
// The army list is saved in the player's data. Summoned shadows are real
// entities linked to their owner only in memory: after a restart, leftover
// shadow entities are removed and the shadows simply return to the army.
import { EntityDamageCause, ItemStack, Player, system, world } from "@minecraft/server";
import { getData, markDirty } from "../data.js";
import { addGold, goldForKill } from "../economy.js";
import { addDamageHook, addXp, flash, xpFor } from "../stats.js";
import { ARCHERS, gearInfo, setGear, GEAR_SLOTS, shadowBow, updateCombatMode } from "./gear.js";
import { deleteShadowSave, placeShadow, placing, saveShadow, shadowTag } from "./persist.js";
import { applyMode, applyOrder, driveTargets, effectiveMode, modeOf, provoking } from "./targeting.js";
import { domainUntil } from "../state.js";
import {
  creeperCharges, creeperPower, healValue,
  activeLimit, ARISE_ATTEMPTS, ARISE_MP, armyCapacity, CORPSE_SECONDS, entityIdOf, FEED_MP, GRADES,
  gradeForLevel, MOB_TO_TYPE, reviveSeconds, SHADOW_MAX_LEVEL, SHADOW_TYPES, shadowAtkMult, shadowDefMult,
  shadowXpToNext, TRAIN_MP,
} from "./types.js";

/** @typedef {import("../data.js").ShadowRecord} ShadowRecord */

const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

/** playerId -> (shadowId -> entity) */
const active = new Map();
/** entity.id -> { playerId, sid } */
const meta = new Map();
/** Shadow creeper entity.id -> explosions left before it falls. */
const charges = new Map();
/** Shadow creeper entity.id -> tick of its last fuse (cooldown). */
const fuses = new Map();

const activeOf = (player) => {
  let m = active.get(player.id);
  if (!m) active.set(player.id, (m = new Map()));
  return m;
};

export const findRecord = (player, sid) => getData(player).shadows.find((s) => s.id === sid);
/** Owner id + shadow id of a summoned shadow entity. */
export const metaOf = (entity) => meta.get(entity.id);
const playerById = (id) => world.getAllPlayers().find((p) => p.id === id);

export function shadowName(s) {
  const g = GRADES[s.grade];
  return `${g.color}[${g.rank}] ${s.name} §7Lv${s.level}`;
}

/** Live entity of a summoned shadow, if any. */
export function entityOf(player, sid) {
  const e = active.get(player.id)?.get(sid);
  return e?.isValid ? e : undefined;
}

/** Summoned = has a live entity, or guards a spot that is currently unloaded. */
export const isSummoned = (player, sid) => !!entityOf(player, sid) || (!!active.get(player.id)?.get(sid) && !!findRecord(player, sid)?.guard);
export const activeCount = (player) => [...activeOf(player).values()].filter((e) => e.isValid).length;
export const regenLeft = (s) => Math.max(0, Math.ceil((s.deadUntil - Date.now()) / 1000));

// ---------------------------------------------------------------- summon / dismiss
function nearOwner(player, spread = 2.5) {
  const a = Math.random() * Math.PI * 2;
  const l = player.location;
  return { x: l.x + Math.cos(a) * spread, y: l.y + 0.2, z: l.z + Math.sin(a) * spread };
}

/** Links a shadow entity to its owner and record. */
function register(player, s, e) {
  e.nameTag = shadowName(s);
  const tame = () => {
    try {
      if (e.isValid && player.isValid) e.getComponent("minecraft:tameable")?.tame(player);
    } catch {}
  };
  tame();
  system.runTimeout(tame, 2); // again once the entity is fully initialised
  activeOf(player).set(s.id, e);
  meta.set(e.id, { playerId: player.id, sid: s.id });
  if (s.type === "creeper") charges.set(e.id, creeperCharges(s));
  delete s.guard; // a (re)summoned shadow comes back to its owner
  applyMode(e, effectiveMode(player, s));
  applyOrder(e, s);
  try {
    e.dimension.spawnParticle("minecraft:soul_particle", { ...e.location, y: e.location.y + 1 });
    e.dimension.spawnParticle("minecraft:large_explosion", e.location);
  } catch {}
  return e;
}

/** A brand new shadow entity (first summon, or a shadow without a save). */
function spawnFresh(player, s, location, dimension = player.dimension) {
  const e = dimension.spawnEntity(entityIdOf(s.type), location);
  e.addTag(shadowTag(s.id));
  if (ARCHERS.has(s.type)) {
    try {
      // Archers always rise holding a (System-made) bow.
      setGear(e, s, GEAR_SLOTS[4], shadowBow(), true);
      markDirty(player);
    } catch {}
    updateCombatMode(e, s);
  }
  return register(player, s, e);
}

/** Shadows currently being summoned (async), to avoid double summons. */
const summoning = new Set();

/**
 * Summons one shadow. Resolves to an error message, or undefined on success.
 * @param {Player} player
 * @param {ShadowRecord} s
 */
export async function summon(player, s, { free = false, location = undefined } = {}) {
  if (summoning.has(s.id)) return "Already being summoned.";
  const d = getData(player);
  if (isSummoned(player, s.id)) return "Already summoned.";
  if (regenLeft(s) > 0) return `${s.name} is regenerating (${regenLeft(s)}s).`;
  if (activeCount(player) + summoning.size >= activeLimit(d.level, d.int)) return "Active shadow limit reached.";
  const cost = GRADES[s.grade].cost;
  if (!free && d.mp < cost) return `Not enough MP (${cost} needed).`;
  summoning.add(s.id);
  try {
    const target = location ?? nearOwner(player);
    // Restore the saved shadow (equipment, health...) right next to the owner.
    // (No teleport after placing: that can leave the entity invisible.)
    const saved = await placeShadow(player, s, target);
    if (!player.isValid) {
      saved?.remove();
      return "Owner left.";
    }
    if (saved) {
      register(player, s, saved);
    } else {
      spawnFresh(player, s, target);
    }
    if (!free) {
      d.mp -= cost;
      markDirty(player);
    }
    return undefined;
  } catch (e) {
    return `Summon failed: ${e}`;
  } finally {
    summoning.delete(s.id);
  }
}

/**
 * Orders: "STAY" (guard the shadow's current spot, kill what comes near) or
 * "FOLLOW" (back to the owner).
 */
export function setOrder(player, sid, order) {
  const s = findRecord(player, sid);
  const e = entityOf(player, sid);
  if (!s || !e) return false;
  if (order === "STAY") s.guard = { x: e.location.x, y: e.location.y, z: e.location.z, dim: e.dimension.id };
  else {
    delete s.guard;
    e.teleport(nearOwner(player), { dimension: player.dimension });
  }
  applyOrder(e, s);
  markDirty(player);
  return true;
}

/** Order for every summoned shadow. Returns how many obeyed. */
export function orderAll(player, order) {
  let n = 0;
  for (const sid of activeOf(player).keys()) if (setOrder(player, sid, order)) n++;
  return n;
}

/** Saves the shadow (equipment included) and returns it to the owner's shadow. */
export async function dismiss(player, sid) {
  const e = activeOf(player).get(sid);
  const s = findRecord(player, sid);
  if (e?.isValid && s) await saveShadow(player, s, e);
  activeOf(player).delete(sid);
  if (e?.isValid) {
    meta.delete(e.id);
    try {
      e.dimension.spawnParticle("minecraft:soul_particle", { ...e.location, y: e.location.y + 1 });
    } catch {}
    e.remove();
  }
}

export async function dismissAll(player) {
  for (const sid of [...activeOf(player).keys()]) await dismiss(player, sid);
}

/** Saves a summoned shadow's current state (after an equipment change). */
export async function saveActive(player, sid) {
  const e = entityOf(player, sid);
  const s = findRecord(player, sid);
  return e && s ? saveShadow(player, s, e) : false;
}

/** Summons the strongest available shadows until MP or the limit runs out. */
export async function summonAll(player) {
  const d = getData(player);
  const list = [...d.shadows].sort((a, b) => b.grade - a.grade || b.level - a.level);
  let n = 0;
  for (const s of list) {
    if (isSummoned(player, s.id) || regenLeft(s) > 0) continue;
    if (d.mp < GRADES[s.grade].cost) continue;
    if ((await summon(player, s)) === undefined) n++;
    if (activeCount(player) >= activeLimit(d.level, d.int)) break;
  }
  return n;
}

/** Teleports every summoned shadow to the owner. */
export function callAll(player) {
  let n = 0;
  for (const [sid, e] of activeOf(player)) {
    if (!e.isValid) continue;
    const rec = findRecord(player, sid);
    if (rec?.guard) {
      delete rec.guard; // CALL also cancels a STAY order
      applyOrder(e, rec);
      markDirty(player);
    }
    e.teleport(nearOwner(player), { dimension: player.dimension });
    n++;
  }
  return n;
}

/** Gear (excluding System constructs) a shadow is wearing per its record. */
export const wornGear = (s) => Object.values(s.gear ?? {}).filter((v) => !v.startsWith("construct:"));

function giveItem(player, item) {
  const left = player.getComponent("minecraft:inventory").container.addItem(item);
  if (left) player.dimension.spawnItem(left, player.location);
}

/**
 * Releases a shadow forever. Its gear, food and totem go back to the owner.
 * A shadow wearing gear must be summoned first (its gear lives on the entity).
 * @returns {string|undefined} error
 */
export function release(player, sid) {
  const rec0 = findRecord(player, sid);
  const e0 = entityOf(player, sid);
  if (rec0 && !e0 && wornGear(rec0).length) return "Summon it first to take its gear back.";
  if (rec0 && e0) {
    for (const gs of GEAR_SLOTS) {
      const g = gearInfo(e0, rec0, gs);
      if (g && !g.construct) giveItem(player, g.item ?? new ItemStack(g.id, 1));
    }
  }
  if (rec0?.food) {
    let n = rec0.food.count;
    const max = new ItemStack(rec0.food.id, 1).maxAmount;
    while (n > 0) {
      giveItem(player, new ItemStack(rec0.food.id, Math.min(max, n)));
      n -= max;
    }
  }
  if ((rec0?.totem ?? 0) > 0) giveItem(player, new ItemStack("minecraft:totem_of_undying", 1));
  const e = activeOf(player).get(sid);
  activeOf(player).delete(sid);
  if (e?.isValid) {
    meta.delete(e.id);
    e.remove();
  }
  const rec = findRecord(player, sid);
  if (rec) deleteShadowSave(player, rec);
  const d = getData(player);
  d.shadows = d.shadows.filter((s) => s.id !== sid);
  markDirty(player);
}

export function rename(player, sid, name) {
  const s = findRecord(player, sid);
  if (!s) return;
  s.name = name.replace(/§./g, "").trim().slice(0, 16) || s.name;
  markDirty(player);
  const e = entityOf(player, sid);
  if (e) e.nameTag = shadowName(s);
}

/** FEED: revive instantly if regenerating, otherwise heal to full. */
export function feed(player, sid) {
  const d = getData(player);
  const s = findRecord(player, sid);
  if (!s) return "Shadow not found.";
  if (d.mp < FEED_MP) return `Not enough MP (${FEED_MP} needed).`;
  if (regenLeft(s) > 0) {
    s.deadUntil = 0;
  } else {
    const e = entityOf(player, sid);
    const h = e?.getComponent("minecraft:health");
    if (!h) return "Summon the shadow first, or feed it while it regenerates.";
    if (h.currentValue >= h.effectiveMax) return `${s.name} is already at full health.`;
    h.setCurrentValue(h.effectiveMax);
  }
  d.mp -= FEED_MP;
  markDirty(player);
  return undefined;
}

/** TRAIN: spend MP for shadow XP. */
export function train(player, sid) {
  const d = getData(player);
  const s = findRecord(player, sid);
  if (!s) return "Shadow not found.";
  if (s.level >= SHADOW_MAX_LEVEL) return `${s.name} is at max level.`;
  if (d.mp < TRAIN_MP) return `Not enough MP (${TRAIN_MP} needed).`;
  d.mp -= TRAIN_MP;
  markDirty(player);
  giveShadowXp(player, s, Math.ceil(shadowXpToNext(s.level) * 0.25));
  return undefined;
}

function giveShadowXp(player, s, amount) {
  if (s.level >= SHADOW_MAX_LEVEL) return;
  s.xp += Math.floor(amount);
  let up = false;
  while (s.level < SHADOW_MAX_LEVEL && s.xp >= shadowXpToNext(s.level)) {
    s.xp -= shadowXpToNext(s.level);
    s.level++;
    up = true;
  }
  if (s.level >= SHADOW_MAX_LEVEL) s.xp = 0;
  if (up) {
    const oldGrade = s.grade;
    s.grade = Math.max(s.grade, gradeForLevel(s.base, s.level));
    player.sendMessage(`§5[Shadow] §f${s.name} §7reached level §e${s.level}`);
    if (s.grade > oldGrade) {
      const g = GRADES[s.grade];
      player.sendMessage(`§5[Shadow] §f${s.name} §dwas promoted to ${g.color}${g.name} §7[Rank ${g.rank}]`);
      player.playSound("random.levelup", { pitch: 0.6 });
    }
    const e = entityOf(player, s.id);
    if (e) e.nameTag = shadowName(s);
  }
  markDirty(player);
}

// ---------------------------------------------------------------- extraction (ARISE)
/** @type {{id:number, type:string, ownerId:string, dim:string, loc:import("@minecraft/server").Vector3, until:number, attempts:number}[]} */
let corpses = [];
let corpseSeq = 0;

export function corpsesNear(player, radius = 10) {
  const now = system.currentTick;
  const l = player.location;
  return corpses.filter(
    (c) => c.ownerId === player.id && c.until > now && c.dim === player.dimension.id &&
      (c.loc.x - l.x) ** 2 + (c.loc.y - l.y) ** 2 + (c.loc.z - l.z) ** 2 <= radius * radius,
  );
}

function newId() {
  return Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

/**
 * Tries to extract a shadow from the nearest fresh corpse.
 * @param {Player} player
 * @returns {boolean} true if a corpse was found (attempt made)
 */
export function arise(player) {
  const near = corpsesNear(player);
  if (near.length === 0) {
    flash(player, "§7No soul to extract nearby.");
    return false;
  }
  const d = getData(player);
  const l = player.location;
  const c = near.sort((a, b) => dist2(a.loc, l) - dist2(b.loc, l))[0];
  const def = SHADOW_TYPES[c.type];
  if (d.shadows.length >= armyCapacity(d.level)) {
    flash(player, `§cYour army is full (${d.shadows.length}/${armyCapacity(d.level)}).`, 60);
    return true;
  }
  if (d.mp < ARISE_MP) {
    flash(player, `§9Not enough MP (${ARISE_MP} needed).`);
    return true;
  }
  d.mp -= ARISE_MP;
  c.attempts++;
  const namedFirst = def.named && !d.namedTaken.includes(c.type);
  const grade = namedFirst ? def.named.grade : def.grade;
  const chance = Math.min(0.95, GRADES[grade].extract + Math.max(0, d.int - 10) * 0.005 + Math.min(0.15, d.level * 0.002));
  const dim = world.getDimension(c.dim);

  if (Math.random() < chance) {
    corpses = corpses.filter((x) => x !== c);
    /** @type {ShadowRecord} */
    const s = {
      id: newId(),
      type: c.type,
      name: namedFirst ? def.named.name : def.label,
      grade,
      base: grade,
      level: 1,
      xp: 0,
      kills: 0,
      deadUntil: 0,
    };
    d.shadows.push(s);
    if (namedFirst) d.namedTaken.push(c.type);
    markDirty(player);
    player.onScreenDisplay.setTitle("§5§lARISE", {
      subtitle: `${GRADES[s.grade].color}${s.name} §7has joined your army`,
      fadeInDuration: 2, stayDuration: 40, fadeOutDuration: 10,
    });
    player.playSound("mob.evocation_illager.cast_spell", { pitch: 0.6 });
    player.playSound("mob.wither.spawn", { volume: 0.4, pitch: 1.4 });
    try {
      for (let i = 0; i < 6; i++) dim.spawnParticle("minecraft:soul_particle", { x: c.loc.x, y: c.loc.y + i * 0.3, z: c.loc.z });
    } catch {}
    // The new shadow rises right away if there is room.
    if (activeCount(player) < activeLimit(d.level, d.int)) spawnFresh(player, s, c.loc, dim);
  } else {
    const left = ARISE_ATTEMPTS - c.attempts;
    markDirty(player);
    if (left <= 0) {
      corpses = corpses.filter((x) => x !== c);
      flash(player, "§8Extraction failed. The soul has faded.", 60);
      player.playSound("mob.zombie.unfect", { pitch: 0.5 });
    } else {
      flash(player, `§7Extraction failed... §f${left} §7attempt${left > 1 ? "s" : ""} left`, 60);
      player.playSound("random.fizz", { pitch: 0.6 });
    }
  }
  return true;
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

// ---------------------------------------------------------------- events
/** Owner and record of a shadow entity. */
function shadowInfo(entity) {
  const m = meta.get(entity.id);
  if (!m) return undefined;
  const owner = playerById(m.playerId);
  const s = owner && findRecord(owner, m.sid);
  return owner && s ? { owner, s } : undefined;
}

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  // A shadow fell: it returns to the army and regenerates.
  const info = meta.has(deadEntity.id) ? shadowInfo(deadEntity) : undefined;
  if (meta.has(deadEntity.id)) {
    const m = meta.get(deadEntity.id);
    meta.delete(deadEntity.id);
    active.get(m.playerId)?.delete(m.sid);
    if (info) {
      info.s.deadUntil = Date.now() + reviveSeconds(info.s) * 1000;
      markDirty(info.owner);
      info.owner.sendMessage(`§5[Shadow] §f${info.s.name} §7has fallen and returns to your shadow. §8(${reviveSeconds(info.s)}s)`);
    }
    return;
  }

  // Who gets the kill: a player, or the owner of the shadow that killed it.
  let owner;
  const killer = damageSource.damagingEntity;
  if (killer instanceof Player) owner = killer;
  else if (killer && meta.has(killer.id)) {
    const k = shadowInfo(killer);
    if (k) {
      owner = k.owner;
      k.s.kills++;
      const xp = xpFor(deadEntity);
      giveShadowXp(owner, k.s, xp);
      addXp(owner, Math.floor(xp * 0.5));
      addGold(owner, Math.floor(goldForKill(deadEntity) * 0.5));
    }
  }
  if (!owner) return;

  const type = MOB_TO_TYPE[deadEntity.typeId];
  if (!type) return;
  let loc;
  try {
    loc = { ...deadEntity.location };
  } catch {
    return;
  }
  corpses.push({
    id: ++corpseSeq,
    type,
    ownerId: owner.id,
    dim: deadEntity.dimension.id,
    loc,
    until: system.currentTick + CORPSE_SECONDS * 20,
    attempts: 0,
  });
  flash(owner, "§5A soul lingers... §7Sneak + use the §5System Gem §7or type §f/arise", 80);
});

// Damage: shadows scale with level/grade, never hurt their owner, and the
// owner can't hurt them.
const SHIELD_BLOCK = 0.5; // chance to block melee/projectiles with a shield
const TOTEM_ID = "minecraft:totem_of_undying";

/** Where the shadow keeps a totem: "offhand", "mainhand", "pouch" or undefined. */
function totemSlot(e, s) {
  if (gearInfo(e, s, GEAR_SLOTS[5])?.id === TOTEM_ID) return "offhand";
  if (gearInfo(e, s, GEAR_SLOTS[4])?.id === TOTEM_ID) return "mainhand";
  return (s.totem ?? 0) > 0 ? "pouch" : undefined;
}

// Damage: shadows scale with level/grade, never hurt their owner or each
// other, block with shields and are saved by totems.
addDamageHook((ev) => {
  if (provoking) return; // the targeting system's tiny "look at me" hit
  const attacker = ev.damageSource.damagingEntity;
  const victim = ev.hurtEntity;
  const a = attacker && meta.get(attacker.id);
  const v = meta.get(victim.id);
  if (a) {
    // Never the owner, never a shadow of the same owner.
    if (victim.id === a.playerId || (v && v.playerId === a.playerId)) {
      ev.cancel = true;
      return;
    }
    const owner = playerById(a.playerId);
    const s = owner && findRecord(owner, a.sid);
    // Other players and their shadows: only when PvP was chosen, by this
    // shadow (or its army) or by the other side (then fighting back is fair).
    if (victim instanceof Player || v) {
      const other = victim instanceof Player ? victim : playerById(v.playerId);
      const otherShadow = v && other ? findRecord(other, v.sid) : undefined;
      const pvp = (owner && s && effectiveMode(owner, s) === "PVP") ||
        (other && (modeOf(other) === "PVP" || (otherShadow && effectiveMode(other, otherShadow) === "PVP")));
      if (!pvp) {
        ev.cancel = true;
        return;
      }
    }
    if (s) {
      // Creeper blasts only hurt monsters (no griefing players, pets or villagers).
      if (s.type === "creeper" && ev.damageSource.cause === EntityDamageCause.entityExplosion) {
        let monster = false;
        try {
          monster = victim.matches({ families: ["monster"] });
        } catch {}
        if (!monster) {
          ev.cancel = true;
          return;
        }
      }
      let mult = shadowAtkMult(s);
      if ((domainUntil.get(a.playerId) ?? 0) > system.currentTick) mult *= 1.5; // Monarch's Domain
      if (s.type === "wolf") mult *= 1.25;
      if (s.type === "vindicator") {
        const h = victim.getComponent("minecraft:health");
        if (h && h.currentValue < h.effectiveMax * 0.3) mult *= 1.5;
      }
      ev.damage *= mult;
    }
  }
  if (v) {
    if (attacker && attacker.id === v.playerId) {
      ev.cancel = true;
      return;
    }
    const owner = playerById(v.playerId);
    const s = owner && findRecord(owner, v.sid);
    if (!s) return;
    ev.damage *= shadowDefMult(s);
    // Shield
    const cause = ev.damageSource.cause;
    if ((cause === EntityDamageCause.entityAttack || cause === EntityDamageCause.projectile) &&
      gearInfo(victim, s, GEAR_SLOTS[5])?.id === "minecraft:shield" && Math.random() < SHIELD_BLOCK) {
      ev.damage *= 0.2;
      system.run(() => {
        try {
          victim.dimension.playSound("item.shield.block", victim.location);
        } catch {}
      });
    }
    // Totem of Undying
    const h = victim.getComponent("minecraft:health");
    const where = h && ev.damage >= h.currentValue ? totemSlot(victim, s) : undefined;
    if (where) {
      ev.cancel = true;
      system.run(() => useTotem(owner, s, victim, where));
    }
  }
});

function useTotem(owner, s, e, where) {
  if (!e.isValid) return;
  if (where === "pouch") s.totem = Math.max(0, (s.totem ?? 1) - 1);
  else setGear(e, s, GEAR_SLOTS[where === "offhand" ? 5 : 4], undefined);
  markDirty(owner);
  const h = e.getComponent("minecraft:health");
  h?.setCurrentValue(h.effectiveMax);
  try {
    e.addEffect("regeneration", 900, { amplifier: 1 });
    e.addEffect("absorption", 100, { amplifier: 1 });
    e.addEffect("fire_resistance", 800, { amplifier: 0 });
    e.dimension.spawnParticle("minecraft:totem_particle", { ...e.location, y: e.location.y + 1 });
    e.dimension.playSound("random.totem", e.location);
  } catch {}
  owner.sendMessage(`§5[Shadow] §e${s.name} §7was saved by a §eTotem of Undying§7!`);
  if (where !== "pouch") saveShadow(owner, s, e);
}


/** On-hit skill effects. */
const SKILL_EFFECTS = {
  zombie: [["slowness", 60, 0]],
  husk: [["hunger", 100, 1], ["weakness", 60, 0]],
  drowned: [["slowness", 60, 1]],
  skeleton: [["slowness", 40, 0]],
  stray: [["slowness", 60, 2]],
  spider: [["poison", 80, 0]],
  wither_skeleton: [["wither", 60, 0]],
  enderman: [["blindness", 60, 0]],
  ravager: [["slowness", 40, 1]],
  warden: [["darkness", 80, 0], ["weakness", 80, 0]],
  goblin: [["weakness", 60, 0]],
  orc: [["slowness", 40, 1], ["mining_fatigue", 60, 0]],
  ice_elf: [["slowness", 60, 2]],
};

world.afterEvents.entityHurt.subscribe(({ damageSource, hurtEntity }) => {
  const attacker = damageSource.damagingEntity;
  if (!attacker || !hurtEntity.isValid) return;
  const m = meta.get(attacker.id);
  if (!m || hurtEntity.id === m.playerId || meta.has(hurtEntity.id)) return;
  const owner = playerById(m.playerId);
  const s = owner && findRecord(owner, m.sid);
  if (!s) return;
  if (s.type === "creeper" && damageSource.cause === EntityDamageCause.entityAttack) creeperFuse(owner, s, attacker);
  try {
    for (const [id, dur, amp] of SKILL_EFFECTS[s.type] ?? []) hurtEntity.addEffect(id, dur, { amplifier: amp });
    if (s.type === "iron_golem") hurtEntity.applyKnockback({ x: 0, z: 0 }, 0.7);
    if (s.type === "ravager" && damageSource.cause === EntityDamageCause.entityAttack) {
      const dx = hurtEntity.location.x - attacker.location.x;
      const dz = hurtEntity.location.z - attacker.location.z;
      const len = Math.hypot(dx, dz) || 1;
      hurtEntity.applyKnockback({ x: (dx / len) * 1.2, z: (dz / len) * 1.2 }, 0.3);
    }
  } catch {}
});

/** Shadow creeper: hiss, then explode. The last charge makes it fall. */
function creeperFuse(owner, s, e) {
  const now = system.currentTick;
  if (now - (fuses.get(e.id) ?? -999) < 60) return; // 3s between blasts
  fuses.set(e.id, now);
  try {
    e.dimension.playSound("random.fuse", e.location);
    e.addEffect("slowness", 30, { amplifier: 3, showParticles: false });
  } catch {}
  system.runTimeout(() => {
    if (!e.isValid) return;
    const left = (charges.get(e.id) ?? 1) - 1;
    charges.set(e.id, left);
    try {
      e.dimension.createExplosion(e.location, creeperPower(s), { breaksBlocks: false, causesFire: false, source: e });
    } catch {}
    if (left <= 0) {
      // Out of blasts: the creeper falls and regenerates like any shadow.
      try {
        e.kill();
      } catch {}
    } else {
      flash(owner, `§5${s.name} §7- §f${left} §7blast${left > 1 ? "s" : ""} left`);
    }
  }, 30);
}

world.beforeEvents.playerLeave.subscribe(({ player }) => {
  const id = player.id;
  const list = [...(active.get(id)?.values() ?? [])];
  active.delete(id);
  system.run(() => {
    for (const e of list) {
      try {
        meta.delete(e.id);
        if (e.isValid) e.remove();
      } catch {}
    }
  });
});

/** Shadows eat from their food pouch when hurt. */
function autoEat(player, sid, e, h) {
  const s = findRecord(player, sid);
  if (!s?.food || s.food.count <= 0) return;
  const heal = healValue(s.type, s.food.id) || 4;
  if (h.currentValue > h.effectiveMax - heal && h.currentValue > h.effectiveMax * 0.6) return;
  h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + heal));
  if (s.food.id === "minecraft:golden_apple") e.addEffect("absorption", 2400, { amplifier: 0 });
  if (s.food.id === "minecraft:enchanted_golden_apple") {
    e.addEffect("absorption", 2400, { amplifier: 3 });
    e.addEffect("regeneration", 400, { amplifier: 1 });
  }
  s.food.count--;
  if (s.food.count <= 0) delete s.food;
  markDirty(player);
  try {
    e.dimension.playSound("random.eat", e.location);
  } catch {}
}

/** [record, entity] pairs of a player's summoned shadows. */
export function summonedList(player) {
  const out = [];
  for (const [sid, e] of active.get(player.id) ?? []) {
    const s = findRecord(player, sid);
    if (s && e.isValid) out.push([s, e]);
  }
  return out;
}

// Script-driven attack modes (animals, specific type, PvP).
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const list = summonedList(player);
    if (list.length) driveTargets(player, list, (x) => meta.get(x.id));
  }
}, 40);

// Follow the owner across distance and dimensions; slow regeneration.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const map = active.get(player.id);
    if (!map) continue;
    for (const [sid, e] of map) {
      const rec = findRecord(player, sid);
      if (!e.isValid) {
        // A guard whose spot is unloaded comes back when the area loads again.
        if (!rec?.guard) map.delete(sid);
        continue;
      }
      try {
        if (rec?.guard) {
          // STAY order: keep near the guarded spot.
          const g = rec.guard;
          if (e.dimension.id === g.dim && dist2(e.location, g) > 10 * 10) e.teleport({ x: g.x, y: g.y, z: g.z });
        } else {
          const far = e.dimension.id !== player.dimension.id || dist2(e.location, player.location) > 24 * 24;
          if (far) e.teleport(nearOwner(player), { dimension: player.dimension });
        }
        const h = e.getComponent("minecraft:health");
        if (h && h.currentValue < h.effectiveMax) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * 0.02));
        if (h) autoEat(player, sid, e, h);
        // Shadow aura: also shows where a shadow is in the dark.
        e.dimension.spawnParticle("minecraft:soul_particle", { x: e.location.x, y: e.location.y + 0.4, z: e.location.z });
      } catch {}
    }
  }
}, 40);

// Corpse particles + expiry; remove shadow entities that belong to nobody.
let sweep = 0;
system.runInterval(() => {
  const now = system.currentTick;
  corpses = corpses.filter((c) => c.until > now);
  for (const c of corpses) {
    try {
      world.getDimension(c.dim).spawnParticle("minecraft:soul_particle", { x: c.loc.x, y: c.loc.y + 0.5, z: c.loc.z });
    } catch {}
  }
  if (++sweep % 10 !== 0) return;
  for (const id of DIMENSIONS) {
    try {
      for (const e of world.getDimension(id).getEntities({ families: ["sl_shadow"] })) {
        if (meta.has(e.id) || e.getTags().some((t) => placing.has(t))) continue;
        e.remove();
      }
    } catch {}
  }
}, 10);


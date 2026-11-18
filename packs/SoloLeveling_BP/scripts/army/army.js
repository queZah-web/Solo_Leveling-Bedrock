// Shadow Army: extraction (ARISE), summoning, leveling, skills.
//
// The army list is saved in the player's data. Summoned shadows are real
// entities linked to their owner only in memory: after a restart, leftover
// shadow entities are removed and the shadows simply return to the army.
import { EntityDamageCause, Player, system, world } from "@minecraft/server";
import { getData, markDirty } from "../data.js";
import { addDamageHook, addXp, flash, xpFor } from "../stats.js";
import {
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

const activeOf = (player) => {
  let m = active.get(player.id);
  if (!m) active.set(player.id, (m = new Map()));
  return m;
};

const findRecord = (player, sid) => getData(player).shadows.find((s) => s.id === sid);
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

export const isSummoned = (player, sid) => !!entityOf(player, sid);
export const activeCount = (player) => [...activeOf(player).values()].filter((e) => e.isValid).length;
export const regenLeft = (s) => Math.max(0, Math.ceil((s.deadUntil - Date.now()) / 1000));

// ---------------------------------------------------------------- summon / dismiss
function nearOwner(player, spread = 2.5) {
  const a = Math.random() * Math.PI * 2;
  const l = player.location;
  return { x: l.x + Math.cos(a) * spread, y: l.y + 0.2, z: l.z + Math.sin(a) * spread };
}

function spawnShadow(player, s, location, dimension = player.dimension) {
  const e = dimension.spawnEntity(entityIdOf(s.type), location);
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
  try {
    dimension.spawnParticle("minecraft:soul_particle", { ...location, y: location.y + 1 });
    dimension.spawnParticle("minecraft:large_explosion", location);
  } catch {}
  return e;
}

/**
 * Summons one shadow. Returns an error message, or undefined on success.
 * @param {Player} player
 * @param {ShadowRecord} s
 */
export function summon(player, s, { free = false, location = undefined } = {}) {
  const d = getData(player);
  if (isSummoned(player, s.id)) return "Already summoned.";
  if (regenLeft(s) > 0) return `${s.name} is regenerating (${regenLeft(s)}s).`;
  if (activeCount(player) >= activeLimit(d.level, d.int)) return "Active shadow limit reached.";
  const cost = GRADES[s.grade].cost;
  if (!free) {
    if (d.mp < cost) return `Not enough MP (${cost} needed).`;
    d.mp -= cost;
    markDirty(player);
  }
  spawnShadow(player, s, location ?? nearOwner(player));
  return undefined;
}

export function dismiss(player, sid) {
  const e = activeOf(player).get(sid);
  activeOf(player).delete(sid);
  if (e?.isValid) {
    meta.delete(e.id);
    try {
      e.dimension.spawnParticle("minecraft:soul_particle", { ...e.location, y: e.location.y + 1 });
    } catch {}
    e.remove();
  }
}

export function dismissAll(player) {
  for (const sid of [...activeOf(player).keys()]) dismiss(player, sid);
}

/** Summons the strongest available shadows until MP or the limit runs out. */
export function summonAll(player) {
  const d = getData(player);
  const list = [...d.shadows].sort((a, b) => b.grade - a.grade || b.level - a.level);
  let n = 0;
  for (const s of list) {
    if (isSummoned(player, s.id) || regenLeft(s) > 0) continue;
    if (summon(player, s) === undefined) n++;
    if (activeCount(player) >= activeLimit(d.level, d.int)) break;
  }
  return n;
}

/** Teleports every summoned shadow to the owner. */
export function callAll(player) {
  let n = 0;
  for (const e of activeOf(player).values()) {
    if (!e.isValid) continue;
    e.teleport(nearOwner(player), { dimension: player.dimension });
    n++;
  }
  return n;
}

export function release(player, sid) {
  dismiss(player, sid);
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
    if (activeCount(player) < activeLimit(d.level, d.int)) spawnShadow(player, s, c.loc, dim);
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
addDamageHook((ev) => {
  const attacker = ev.damageSource.damagingEntity;
  const victim = ev.hurtEntity;
  const a = attacker && meta.get(attacker.id);
  const v = meta.get(victim.id);
  if (a) {
    if (victim.id === a.playerId) {
      ev.cancel = true;
      return;
    }
    const owner = playerById(a.playerId);
    const s = owner && findRecord(owner, a.sid);
    if (s) {
      let mult = shadowAtkMult(s);
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
    if (s) ev.damage *= shadowDefMult(s);
  }
});

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
};

world.afterEvents.entityHurt.subscribe(({ damageSource, hurtEntity }) => {
  const attacker = damageSource.damagingEntity;
  if (!attacker || !hurtEntity.isValid) return;
  const m = meta.get(attacker.id);
  if (!m || hurtEntity.id === m.playerId || meta.has(hurtEntity.id)) return;
  const owner = playerById(m.playerId);
  const s = owner && findRecord(owner, m.sid);
  if (!s) return;
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

// Follow the owner across distance and dimensions; slow regeneration.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const map = active.get(player.id);
    if (!map) continue;
    for (const [sid, e] of map) {
      if (!e.isValid) {
        map.delete(sid);
        continue;
      }
      try {
        const far = e.dimension.id !== player.dimension.id || dist2(e.location, player.location) > 24 * 24;
        if (far) e.teleport(nearOwner(player), { dimension: player.dimension });
        const h = e.getComponent("minecraft:health");
        if (h && h.currentValue < h.effectiveMax) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * 0.02));
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
        if (!meta.has(e.id)) e.remove();
      }
    } catch {}
  }
}, 10);


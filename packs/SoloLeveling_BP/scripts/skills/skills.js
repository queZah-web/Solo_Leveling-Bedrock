// Active skills: unlocked by level, cost MP, have cooldowns.
// Cast from the quick menu (Sneak + use the System Gem), /skill <1-4>, or the SKILLS tab.
import { EntityDamageCause, Player, system } from "@minecraft/server";
import { summonedList } from "../army/army.js";
import { getData, markDirty } from "../data.js";
import { domainUntil, stealthUntil } from "../state.js";
import { addDamageHook, flash } from "../stats.js";

/**
 * @typedef {{id:string, name:string, level:number, mp:number, cd:number, desc:string, color:string}} Skill
 * cd = cooldown in seconds
 */
/** @type {Skill[]} */
export const SKILLS = [
  { id: "sprint", name: "Sprint", level: 1, mp: 15, cd: 20, color: "§a", desc: "Speed III and Jump Boost for 6s." },
  { id: "dagger_rush", name: "Dagger Rush", level: 5, mp: 25, cd: 8, color: "§c", desc: "Dash forward up to 7 blocks, slashing every enemy in your path." },
  { id: "bloodlust", name: "Bloodlust", level: 10, mp: 30, cd: 30, color: "§4", desc: "Your killing intent slows and weakens monsters within 10 blocks." },
  { id: "stealth", name: "Stealth", level: 15, mp: 40, cd: 45, color: "§8", desc: "Invisible for 10s. Your next melee hit deals double damage." },
  { id: "rulers_authority", name: "Ruler's Authority", level: 25, mp: 50, cd: 15, color: "§b", desc: "Telekinesis: hurls enemies in front of you into the air." },
  { id: "shadow_exchange", name: "Shadow Exchange", level: 35, mp: 60, cd: 30, color: "§5", desc: "Swap places with the summoned shadow you are looking toward." },
  { id: "dragons_fear", name: "Dragon's Fear", level: 50, mp: 100, cd: 90, color: "§6", desc: "A terrifying roar: monsters within 16 blocks are crippled and hurt." },
  { id: "monarchs_domain", name: "Monarch's Domain", level: 70, mp: 150, cd: 180, color: "§d", desc: "Your summoned shadows deal +50% damage and resist harm for 30s." },
];
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const skillIcon = (id) => `textures/sl/skills/${id}`;
export const QUICK_SLOTS = 4;

/** playerId -> { skillId: tick when ready } */
const cooldowns = new Map();
export function cooldownLeft(player, id) {
  const t = cooldowns.get(player.id)?.[id] ?? 0;
  return Math.max(0, Math.ceil((t - system.currentTick) / 20));
}

export function quickSlots(player) {
  const d = getData(player);
  if (!Array.isArray(d.skillSlots)) d.skillSlots = ["sprint", null, null, null];
  while (d.skillSlots.length < QUICK_SLOTS) d.skillSlots.push(null);
  return d.skillSlots;
}

export function equipSkill(player, slot, id) {
  const slots = quickSlots(player);
  for (let i = 0; i < slots.length; i++) if (slots[i] === id) slots[i] = null;
  slots[slot] = id;
  markDirty(player);
}

// ---------------------------------------------------------------- helpers
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/** Hostile-to-hit entities near a point (no players, no own shadows, no items). */
function enemiesNear(player, center, radius) {
  const mine = new Set(summonedList(player).map(([, e]) => e.id));
  return player.dimension
    .getEntities({ location: center, maxDistance: radius, excludeTypes: ["minecraft:item", "minecraft:xp_orb", "minecraft:arrow"] })
    .filter((e) => !(e instanceof Player) && !mine.has(e.id) && e.hasComponent("minecraft:health") &&
      !e.matches({ families: ["sl_shadow"] }) && !e.matches({ families: ["inanimate"] }));
}
const isMonster = (e) => {
  try {
    return e.matches({ families: ["monster"] });
  } catch {
    return false;
  }
};

function hit(player, e, dmg) {
  try {
    e.applyDamage(dmg, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
  } catch {}
}

function particles(player, loc, id, n = 1) {
  try {
    for (let i = 0; i < n; i++) player.dimension.spawnParticle(id, loc);
  } catch {}
}

// ---------------------------------------------------------------- effects
const EFFECTS = {
  sprint(player) {
    player.addEffect("speed", 120, { amplifier: 2 });
    player.addEffect("jump_boost", 120, { amplifier: 1 });
    particles(player, player.location, "minecraft:knockback_roar_particle");
  },
  dagger_rush(player, d) {
    const dir = player.getViewDirection();
    const flat = { x: dir.x, y: 0, z: dir.z };
    const len = Math.hypot(flat.x, flat.z) || 1;
    flat.x /= len;
    flat.z /= len;
    let pos = { ...player.location };
    let steps = 0;
    for (let i = 1; i <= 7; i++) {
      const next = add(player.location, flat, i);
      const feet = player.dimension.getBlock(next);
      const head = player.dimension.getBlock({ ...next, y: next.y + 1 });
      if (!feet || !head || !(feet.isAir || feet.isLiquid) || !(head.isAir || head.isLiquid)) break;
      pos = next;
      steps = i;
    }
    const start = { ...player.location };
    const dmg = 4 + d.str * 0.35 + d.agi * 0.15;
    const hitIds = new Set();
    for (let i = 0; i <= steps; i++) {
      const p = add(start, flat, i);
      particles(player, { ...p, y: p.y + 1 }, "minecraft:critical_hit_emitter");
      for (const e of enemiesNear(player, p, 2)) {
        if (hitIds.has(e.id)) continue;
        hitIds.add(e.id);
        hit(player, e, dmg);
      }
    }
    if (steps > 0) player.teleport(pos, { keepVelocity: false, facingLocation: add(pos, flat, 5) });
    player.playSound("item.trident.riptide_1", { pitch: 1.4 });
    return hitIds.size ? `§c${hitIds.size} hit` : undefined;
  },
  bloodlust(player) {
    const list = enemiesNear(player, player.location, 10).filter(isMonster);
    for (const e of list) {
      e.addEffect("slowness", 160, { amplifier: 1 });
      e.addEffect("weakness", 160, { amplifier: 1 });
    }
    particles(player, { ...player.location, y: player.location.y + 1 }, "minecraft:huge_explosion_emitter");
    player.playSound("mob.warden.roar", { pitch: 1.6, volume: 0.6 });
    return `§4${list.length} enemies shaken`;
  },
  stealth(player) {
    player.addEffect("invisibility", 200, { amplifier: 0, showParticles: false });
    stealthUntil.set(player.id, system.currentTick + 200);
    player.playSound("mob.endermen.portal", { pitch: 0.6 });
  },
  rulers_authority(player, d) {
    const dir = player.getViewDirection();
    const eye = player.getHeadLocation();
    const list = enemiesNear(player, add(eye, dir, 5), 5);
    const dmg = 3 + d.int * 0.3;
    for (const e of list) {
      const dx = e.location.x - player.location.x;
      const dz = e.location.z - player.location.z;
      const l = Math.hypot(dx, dz) || 1;
      try {
        e.applyKnockback({ x: (dx / l) * 1.6, z: (dz / l) * 1.6 }, 0.9);
      } catch {}
      hit(player, e, dmg);
      particles(player, { ...e.location, y: e.location.y + 1 }, "minecraft:wind_explosion_emitter");
    }
    player.playSound("mob.breeze.wind_burst", { pitch: 0.8 });
    return `§b${list.length} lifted`;
  },
  shadow_exchange(player) {
    const list = summonedList(player);
    if (!list.length) return "§cNo summoned shadow";
    const dir = player.getViewDirection();
    let best;
    let bestScore = -Infinity;
    for (const [s, e] of list) {
      if (e.dimension.id !== player.dimension.id) continue;
      const v = { x: e.location.x - player.location.x, y: 0, z: e.location.z - player.location.z };
      const l = Math.hypot(v.x, v.z) || 1;
      const score = (v.x * dir.x + v.z * dir.z) / l + l * 0.01; // looking toward it, prefer far ones
      if (score > bestScore) {
        bestScore = score;
        best = [s, e];
      }
    }
    if (!best) return "§cNo shadow in this dimension";
    const [s, e] = best;
    const mine = { ...player.location };
    const theirs = { ...e.location };
    player.teleport(theirs);
    e.teleport(mine);
    particles(player, { ...mine, y: mine.y + 1 }, "minecraft:soul_particle", 3);
    particles(player, { ...theirs, y: theirs.y + 1 }, "minecraft:soul_particle", 3);
    player.playSound("mob.shulker.teleport", { pitch: 0.7 });
    return `§5Exchanged with ${s.name}`;
  },
  dragons_fear(player, d) {
    const list = enemiesNear(player, player.location, 16).filter(isMonster);
    for (const e of list) {
      e.addEffect("slowness", 200, { amplifier: 3 });
      e.addEffect("weakness", 200, { amplifier: 2 });
      e.addEffect("nausea", 200, { amplifier: 0 });
      hit(player, e, 6 + d.level * 0.15);
    }
    player.dimension.playSound("mob.enderdragon.growl", player.location, { volume: 2, pitch: 0.7 });
    particles(player, { ...player.location, y: player.location.y + 1 }, "minecraft:dragon_breath_fire", 6);
    return `§6${list.length} enemies terrified`;
  },
  monarchs_domain(player) {
    domainUntil.set(player.id, system.currentTick + 600);
    for (const [, e] of summonedList(player)) {
      e.addEffect("resistance", 600, { amplifier: 1, showParticles: false });
      particles(player, { ...e.location, y: e.location.y + 1 }, "minecraft:soul_particle", 3);
    }
    player.playSound("mob.wither.spawn", { pitch: 0.5, volume: 0.5 });
  },
};

/**
 * Casts a skill. Returns an error message, or undefined on success.
 * @param {Player} player
 */
export function cast(player, id) {
  const sk = SKILL_BY_ID[id];
  if (!sk) return "Unknown skill.";
  const d = getData(player);
  if (d.level < sk.level) return `${sk.name} unlocks at level ${sk.level}.`;
  const cd = cooldownLeft(player, id);
  if (cd > 0) return `${sk.name} is on cooldown (${cd}s).`;
  if (d.mp < sk.mp) return `Not enough MP (${sk.mp} needed).`;
  let note;
  try {
    note = EFFECTS[id](player, d);
  } catch (e) {
    return `${sk.name} failed: ${e}`;
  }
  d.mp -= sk.mp;
  d.fatigue = Math.min(100, d.fatigue + Math.ceil(sk.mp / 25));
  markDirty(player);
  const map = cooldowns.get(player.id) ?? {};
  map[id] = system.currentTick + sk.cd * 20;
  cooldowns.set(player.id, map);
  flash(player, `${sk.color}§l${sk.name.toUpperCase()}${note ? ` §r§7- ${note}` : ""}`, 40);
  return undefined;
}

// Stealth: the first melee hit out of stealth deals double damage.
addDamageHook((ev) => {
  const a = ev.damageSource.damagingEntity;
  if (!(a instanceof Player) || ev.damageSource.cause !== EntityDamageCause.entityAttack) return;
  const until = stealthUntil.get(a.id);
  if (!until || until < system.currentTick) return;
  stealthUntil.delete(a.id);
  ev.damage *= 2;
  system.run(() => {
    try {
      a.removeEffect("invisibility");
      flash(a, "§8§lSNEAK ATTACK §r§7x2", 30);
    } catch {}
  });
});

// Army attack modes.
//   MONSTERS - hunt monsters (default)       ANIMALS - hunt animals only
//   ALL      - monsters and animals          SPECIFIC - one chosen mob type
//   PVP      - enemy players: their shadows first, then the player. Smart,
//              high-rank shadows may go for the player directly.
//   DEFEND   - only protect the owner
//
// Monster hunting is done by the entity itself (component group
// sl:auto_target). Other modes are driven here: the script "provokes" a
// shadow with a tiny hit from the chosen target, so the shadow's
// hurt_by_target behavior locks onto it.
import { EntityDamageCause, Player, system, world } from "@minecraft/server";
import { allies } from "../social/association.js";
import { getData, markDirty } from "../data.js";
import { SHADOW_TYPES } from "./types.js";

export const MODES = ["MONSTERS", "ANIMALS", "ALL", "SPECIFIC", "PVP", "DEFEND"];
export const MODE_INFO = {
  MONSTERS: "Hunts monsters around you.",
  ANIMALS: "Hunts animals only (not tamed pets).",
  ALL: "Hunts monsters and animals.",
  SPECIFIC: "Hunts only the chosen mob type.",
  PVP: "Attacks enemy players: their shadows first. Smart Knight+ shadows strike the player directly.",
  DEFEND: "Only protects you and attacks what you attack.",
};

export const ANIMALS = new Set([
  "cow", "pig", "sheep", "chicken", "rabbit", "horse", "donkey", "mule", "llama", "trader_llama", "goat", "fox",
  "polar_bear", "panda", "bee", "turtle", "frog", "axolotl", "camel", "sniffer", "armadillo", "ocelot", "cat",
  "parrot", "mooshroom", "squid", "glow_squid", "cod", "salmon", "tropical_fish", "pufferfish", "dolphin",
  "strider", "wolf", "tadpole", "happy_ghast", "nautilus",
].map((x) => "minecraft:" + x));

/** Choices for SPECIFIC mode. */
export const SPECIFIC_TYPES = [
  "zombie", "skeleton", "creeper", "spider", "cave_spider", "enderman", "witch", "slime", "phantom", "drowned",
  "husk", "stray", "bogged", "pillager", "vindicator", "evocation_illager", "ravager", "vex", "blaze", "ghast",
  "magma_cube", "piglin", "piglin_brute", "hoglin", "zoglin", "wither_skeleton", "guardian", "shulker", "breeze",
  "silverfish", "endermite", "warden", "cow", "pig", "sheep", "chicken", "rabbit", "goat", "fox", "polar_bear",
].map((x) => "minecraft:" + x);

const SMART = new Set(["enderman", "vindicator", "wither_skeleton", "warden"]);

/** The army-wide mode. */
export const modeOf = (player) => {
  const m = getData(player).armyMode;
  return MODES.includes(m) ? m : "MONSTERS";
};

/** Mob types hunted by the army in SPECIFIC mode. */
export function armyTargets(player) {
  const d = getData(player);
  if (!Array.isArray(d.armyTargets)) d.armyTargets = d.armyTarget ? [d.armyTarget] : ["minecraft:zombie"];
  return d.armyTargets;
}

/** A shadow's own mode ("ARMY" or unset = follow the army mode). */
export const effectiveMode = (player, s) => (s.mode && s.mode !== "ARMY" && MODES.includes(s.mode) ? s.mode : modeOf(player));
const targetsOf = (player, s) => (s.mode === "SPECIFIC" ? s.targets ?? [] : armyTargets(player));

/** Puts a shadow entity's behavior in line with its mode. */
export function applyMode(e, mode) {
  try {
    e.triggerEvent(mode === "MONSTERS" || mode === "ALL" || mode === "PVP" ? "sl:auto_on" : "sl:auto_off");
    e.triggerEvent(mode === "PVP" ? "sl:pvp_on" : "sl:pvp_off");
  } catch {}
}

/** Follow the owner, or guard a spot (STAY order). */
export function applyOrder(e, s) {
  try {
    e.triggerEvent(s.guard ? "sl:follow_off" : "sl:follow_on");
  } catch {}
}

/**
 * Army-wide mode. Shadows with their own mode keep it.
 * @param {Player} player
 * @param {string} mode
 * @param {[import("../data.js").ShadowRecord, import("@minecraft/server").Entity][]} list summoned shadows
 * @param {string[]} [targets] SPECIFIC mob types
 */
export function setArmyMode(player, mode, list, targets) {
  const d = getData(player);
  d.armyMode = mode;
  if (targets) d.armyTargets = targets;
  markDirty(player);
  for (const [s, e] of list) applyMode(e, effectiveMode(player, s));
  provoked.clear();
}

/** One shadow's own mode ("ARMY" = follow the army). */
export function setShadowMode(player, s, e, mode, targets) {
  s.mode = mode;
  if (targets) s.targets = targets;
  markDirty(player);
  if (e) applyMode(e, effectiveMode(player, s));
  if (e) provoked.delete(e.id);
}

const typeName = (t) => t.replace("minecraft:", "").replace(/_/g, " ").toUpperCase();
/** Short label like "MONSTERS" or "ONLY ZOMBIE +2". */
export function modeText(mode, targets) {
  if (mode !== "SPECIFIC") return mode;
  if (!targets?.length) return "ONLY ?";
  return `ONLY ${typeName(targets[0])}${targets.length > 1 ? ` +${targets.length - 1}` : ""}`;
}
export const shadowModeLabel = (player, s) =>
  !s.mode || s.mode === "ARMY" ? `ARMY (${modeText(modeOf(player), armyTargets(player))})` : modeText(s.mode, s.targets);

/** shadow entity id -> target entity id */
const provoked = new Map();
/** True while a provoke hit is being applied (the damage rules let it through). */
export let provoking = false;

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

function nearest(list, from) {
  let best;
  let bd = Infinity;
  for (const x of list) {
    const d = dist2(x.location, from);
    if (d < bd) {
      bd = d;
      best = x;
    }
  }
  return best;
}

const isTamed = (x) => {
  try {
    return !!x.getComponent("minecraft:tameable")?.isTamed;
  } catch {
    return false;
  }
};

function provoke(shadow, target) {
  provoking = true;
  try {
    shadow.applyDamage(0.1, { cause: EntityDamageCause.entityAttack, damagingEntity: target });
    provoked.set(shadow.id, target.id);
  } catch {}
  provoking = false;
}

/**
 * Picks and assigns targets for script-driven modes.
 * @param {Player} owner
 * @param {[import("../data.js").ShadowRecord, import("@minecraft/server").Entity][]} list
 * @param {(e: import("@minecraft/server").Entity) => ({playerId:string}|undefined)} metaOf
 */
export function driveTargets(owner, list, metaOf) {
  for (const [s, e] of list) {
    if (!e.isValid) continue;
    const mode = effectiveMode(owner, s);
    if (mode === "MONSTERS" || mode === "DEFEND") continue;
    const wanted = targetsOf(owner, s);
    const cur = provoked.get(e.id);
    if (cur) {
      const t = world.getEntity(cur);
      if (t?.isValid && dist2(t.location, e.location) < 24 * 24) continue;
      provoked.delete(e.id);
    }
    const around = e.dimension.getEntities({ location: e.location, maxDistance: 16 });
    let target;
    if (mode === "ANIMALS" || mode === "ALL") {
      target = nearest(around.filter((x) => ANIMALS.has(x.typeId) && !isTamed(x)), e.location);
    } else if (mode === "SPECIFIC") {
      target = nearest(around.filter((x) => wanted.includes(x.typeId) && !isTamed(x)), e.location);
    } else if (mode === "PVP") {
      const enemies = owner.dimension
        .getPlayers({ location: owner.location, maxDistance: 24 })
        .filter((p) => p.id !== owner.id && !allies(owner, p) && p.getGameMode() !== "Creative" && p.getGameMode() !== "Spectator");
      const enemy = nearest(enemies, e.location);
      if (!enemy) continue;
      const enemyShadows = e.dimension
        .getEntities({ families: ["sl_shadow"], location: e.location, maxDistance: 20 })
        .filter((x) => {
          const m = metaOf(x);
          const o = m && world.getAllPlayers().find((p) => p.id === m.playerId);
          return m && m.playerId !== owner.id && !(o && allies(owner, o));
        });
      const def = SHADOW_TYPES[s.type];
      const named = !!def.named && s.name === def.named.name;
      const direct = s.grade >= 2 && (SMART.has(s.type) || named);
      target = enemyShadows.length && !direct ? nearest(enemyShadows, e.location) : enemy;
    }
    if (target) provoke(e, target);
  }
}

export const modeLabel = (player) => modeText(modeOf(player), armyTargets(player));


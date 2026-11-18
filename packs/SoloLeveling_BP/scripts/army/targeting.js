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

export const modeOf = (player) => {
  const m = getData(player).armyMode;
  return MODES.includes(m) ? m : "MONSTERS";
};

/** Puts a shadow entity's behavior in line with its owner's mode. */
export function applyMode(e, mode) {
  try {
    e.triggerEvent(mode === "MONSTERS" || mode === "ALL" || mode === "PVP" ? "sl:auto_on" : "sl:auto_off");
    e.triggerEvent(mode === "PVP" ? "sl:pvp_on" : "sl:pvp_off");
  } catch {}
}

/**
 * @param {Player} player
 * @param {string} mode
 * @param {() => Iterable<import("@minecraft/server").Entity>} shadows
 */
export function setMode(player, mode, shadows, target = undefined) {
  const d = getData(player);
  d.armyMode = mode;
  if (target) d.armyTarget = target;
  markDirty(player);
  for (const e of shadows()) applyMode(e, mode);
  provoked.clear();
}

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
  const mode = modeOf(owner);
  if (mode === "MONSTERS" || mode === "DEFEND") return;
  const d = getData(owner);
  for (const [s, e] of list) {
    if (!e.isValid) continue;
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
      target = nearest(around.filter((x) => x.typeId === d.armyTarget && !isTamed(x)), e.location);
    } else if (mode === "PVP") {
      const enemies = owner.dimension
        .getPlayers({ location: owner.location, maxDistance: 24 })
        .filter((p) => p.id !== owner.id && p.getGameMode() !== "Creative" && p.getGameMode() !== "Spectator");
      const enemy = nearest(enemies, e.location);
      if (!enemy) continue;
      const enemyShadows = e.dimension
        .getEntities({ families: ["sl_shadow"], location: e.location, maxDistance: 20 })
        .filter((x) => {
          const m = metaOf(x);
          return m && m.playerId !== owner.id;
        });
      const def = SHADOW_TYPES[s.type];
      const named = !!def.named && s.name === def.named.name;
      const direct = s.grade >= 2 && (SMART.has(s.type) || named);
      target = enemyShadows.length && !direct ? nearest(enemyShadows, e.location) : enemy;
    }
    if (target) provoke(e, target);
  }
}

export const modeLabel = (player) => {
  const m = modeOf(player);
  if (m !== "SPECIFIC") return m;
  const t = getData(player).armyTarget;
  return `ONLY ${t ? t.replace("minecraft:", "").replace(/_/g, " ").toUpperCase() : "?"}`;
};


// Saves a shadow entity (equipment, health, mode...) into a world structure
// when it is dismissed or its gear changes, and places it back when summoned.
// Two structure slots (_a/_b) alternate so a failed save keeps the old copy.
import { StructureSaveMode, system, world } from "@minecraft/server";
import { markDirty } from "../data.js";
import { vaultKey } from "../vault/storage.js";
import { entityIdOf } from "./types.js";

const nameOf = (key, sid, ptr) => `slshadow:${key}_${sid}_${ptr}`;
export const shadowTag = (sid) => `sls_${sid}`;
/** Tags of shadows being placed right now (the cleanup sweep must skip them). */
export const placing = new Set();

const floorV = (v) => ({ x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) });

const near = (dim, block, r = 3) =>
  dim.getEntities({ location: { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 }, maxDistance: r });

/**
 * Saves the shadow where it stands (no teleport: teleporting can make the
 * entity invisible). Other entities in the same block may be captured too;
 * placeShadow() removes them again.
 * @param {import("@minecraft/server").Player} player
 * @param {import("../data.js").ShadowRecord} s
 * @param {import("@minecraft/server").Entity} e
 */
export async function saveShadow(player, s, e) {
  if (!e.isValid) return false;
  const sm = world.structureManager;
  const key = vaultKey(player);
  const block = floorV(e.location);
  const next = s.ptr === "a" ? "b" : "a";
  try {
    const name = nameOf(key, s.id, next);
    if (sm.get(name)) sm.delete(name);
    sm.createFromWorld(name, e.dimension, block, block, {
      includeBlocks: false,
      includeEntities: true,
      saveMode: StructureSaveMode.World,
    });
    const old = s.ptr;
    s.ptr = next;
    markDirty(player);
    if (old) {
      try {
        sm.delete(nameOf(key, s.id, old));
      } catch {}
    }
    return true;
  } catch (err) {
    console.warn(`[SL] shadow save failed (${s.name}): ${err}`);
    return false;
  }
}

/**
 * Places a saved shadow at `location` and returns the entity, or undefined
 * if the shadow has no save yet.
 */
export async function placeShadow(player, s, location) {
  if (!s.ptr) return undefined;
  const sm = world.structureManager;
  const name = nameOf(vaultKey(player), s.id, s.ptr);
  if (!sm.get(name)) return undefined;
  const dim = player.dimension;
  const block = floorV(location);
  const tag = shadowTag(s.id);
  const before = new Set(near(dim, block).map((x) => x.id));
  placing.add(tag);
  try {
    sm.place(name, dim, block, { includeBlocks: false, includeEntities: true });
    for (let i = 0; i < 10; i++) {
      const fresh = near(dim, block).filter((x) => !before.has(x.id) && x.typeId !== "minecraft:player");
      const mine = fresh.filter((x) => x.typeId === entityIdOf(s.type) && x.hasTag(tag));
      if (mine.length) {
        // Anything else that came out of the structure is a copy: remove it.
        for (const x of fresh) if (x.id !== mine[0].id) x.remove();
        return mine[0];
      }
      await system.waitTicks(1);
    }
    return undefined;
  } finally {
    placing.delete(tag);
  }
}

export function deleteShadowSave(player, s) {
  const sm = world.structureManager;
  const key = vaultKey(player);
  for (const p of ["a", "b"]) {
    try {
      if (sm.get(nameOf(key, s.id, p))) sm.delete(nameOf(key, s.id, p));
    } catch {}
  }
}

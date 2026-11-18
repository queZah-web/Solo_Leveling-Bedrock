// Saves a shadow entity (equipment, health, mode...) into a world structure
// when it is dismissed or its gear changes, and places it back when summoned.
// Two structure slots (_a/_b) alternate so a failed save keeps the old copy.
import { StructureSaveMode, system, world } from "@minecraft/server";
import { markDirty } from "../data.js";
import { pickBlock, vaultKey } from "../vault/storage.js";
import { entityIdOf } from "./types.js";

const nameOf = (key, sid, ptr) => `slshadow:${key}_${sid}_${ptr}`;
export const shadowTag = (sid) => `sls_${sid}`;
/** Tags of shadows being placed right now (the cleanup sweep must skip them). */
export const placing = new Set();

const floorV = (v) => ({ x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) });
const sameBlock = (v, b) => Math.floor(v.x) === b.x && Math.floor(v.y) === b.y && Math.floor(v.z) === b.z;

/** Is anything else (except players) standing in this block? */
function crowded(e, block) {
  return e.dimension
    .getEntities({ location: { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 }, maxDistance: 2 })
    .some((x) => x.id !== e.id && x.typeId !== "minecraft:player" && sameBlock(x.location, block));
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {import("../data.js").ShadowRecord} s
 * @param {import("@minecraft/server").Entity} e
 */
export async function saveShadow(player, s, e) {
  if (!e.isValid) return false;
  const sm = world.structureManager;
  const key = vaultKey(player);
  let block = floorV(e.location);
  let back;
  if (crowded(e, block)) {
    // Move to a private block high above so only this shadow is captured.
    back = { ...e.location };
    block = pickBlock(player, e.dimension);
    e.teleport({ x: block.x + 0.5, y: block.y + 0.3, z: block.z + 0.5 });
    await system.waitTicks(1);
    if (!e.isValid) return false;
    block = floorV(e.location);
  }
  const next = s.ptr === "a" ? "b" : "a";
  let ok = false;
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
    ok = true;
  } catch (err) {
    console.warn(`[SL] shadow save failed (${s.name}): ${err}`);
  }
  if (back && e.isValid) e.teleport(back);
  return ok;
}

/**
 * Places a saved shadow high above the player and returns the entity, or
 * undefined if the shadow has no save yet.
 */
export async function placeShadow(player, s) {
  if (!s.ptr) return undefined;
  const sm = world.structureManager;
  const name = nameOf(vaultKey(player), s.id, s.ptr);
  if (!sm.get(name)) return undefined;
  const dim = player.dimension;
  const block = pickBlock(player, dim);
  const tag = shadowTag(s.id);
  placing.add(tag);
  try {
    sm.place(name, dim, block, { includeBlocks: false, includeEntities: true });
    const center = { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 };
    for (let i = 0; i < 10; i++) {
      const found = dim.getEntities({ type: entityIdOf(s.type), tags: [tag], location: center, maxDistance: 3 });
      if (found.length) {
        for (const extra of found.slice(1)) extra.remove();
        return found[0];
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

// Shadow Vault storage.
//
// Items live in the inventory of a hidden entity (sl:vault_storage). While a
// player has the vault open, that entity is placed high above them (always
// in a loaded chunk). After every change the entity is saved into a world
// structure, so the vault keeps the full item data: enchantments, names,
// durability, shulker contents, etc.
//
// Saves alternate between two structures (_a / _b) and a pointer on the
// player, so a failed save can never wipe the last good copy.
import { ItemLockMode, StructureSaveMode, system, world } from "@minecraft/server";

const ENTITY = "sl:vault_storage";
export const VAULT_SIZE = 225;
export const PAGE_SIZE = 45;
const BASE_CAPACITY = 45;

/** Unlocked vault slots for a hunter level (+9 every 5 levels, max 225). */
export const capacityFor = (level) => Math.min(VAULT_SIZE, BASE_CAPACITY + Math.floor(level / 5) * 9);
/** Level needed to unlock a vault slot index. */
export const unlockLevelFor = (slot) => (slot < BASE_CAPACITY ? 1 : Math.ceil((slot - BASE_CAPACITY + 1) / 9) * 5);

/** @typedef {{entity: import("@minecraft/server").Entity, dim: import("@minecraft/server").Dimension, block: import("@minecraft/server").Vector3, key: string, tag: string}} Session */
/** @type {Map<string, Session>} */
const sessions = new Map();
/** Tags of vault entities that are being opened right now. */
const pending = new Set();

function vaultKey(player) {
  let k = player.getDynamicProperty("sl:vault_key");
  if (typeof k !== "string") {
    k = (Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36)).replace(/[^a-z0-9]/g, "");
    player.setDynamicProperty("sl:vault_key", k);
  }
  return k;
}
const pointerOf = (player) => (player.getDynamicProperty("sl:vault_ptr") === "b" ? "b" : "a");
const structName = (key, ptr) => `slvault:${key}_${ptr}`;
const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const vaultsAt = (dim, block) =>
  dim.getEntities({ type: ENTITY, location: { x: block.x + 0.5, y: block.y, z: block.z + 0.5 }, maxDistance: 1.5 });

/** A block high above the player with no other vault entity in it. */
function pickBlock(player, dim) {
  const x = Math.floor(player.location.x);
  const z = Math.floor(player.location.z);
  const top = dim.heightRange.max - 1;
  for (let y = top; y > top - 16; y--) {
    const block = { x, y, z };
    if (vaultsAt(dim, block).length === 0) return block;
  }
  return { x, y: top - 16, z };
}

function findEntity(dim, block, tag) {
  return dim.getEntities({
    type: ENTITY,
    tags: [tag],
    location: { x: block.x + 0.5, y: block.y, z: block.z + 0.5 },
    maxDistance: 3,
  })[0];
}

/** Removes loaded vault entities with this tag (leftovers from a crash). */
function removeStray(tag) {
  for (const id of DIMENSIONS) {
    try {
      for (const e of world.getDimension(id).getEntities({ type: ENTITY, tags: [tag] })) e.remove();
    } catch {}
  }
}

/**
 * Opens (or reuses) the player's vault session.
 * @param {import("@minecraft/server").Player} player
 * @returns {Promise<import("@minecraft/server").Container>}
 */
export async function openVault(player) {
  const existing = sessions.get(player.id);
  if (existing?.entity.isValid) {
    const c = existing.entity.getComponent("minecraft:inventory")?.container;
    if (c) return c;
  }
  sessions.delete(player.id);

  const key = vaultKey(player);
  const tag = `slv_${key}`;
  const dim = player.dimension;
  const block = pickBlock(player, dim);
  const sm = world.structureManager;
  const name = structName(key, pointerOf(player));

  pending.add(tag);
  try {
    removeStray(tag);
    let entity;
    if (sm.get(name)) {
      sm.place(name, dim, block, { includeBlocks: false, includeEntities: true });
      for (let i = 0; i < 10 && !entity; i++) {
        entity = findEntity(dim, block, tag);
        if (!entity) await system.waitTicks(1);
      }
      // Never create an empty vault over an existing save.
      if (!entity) throw new Error("The vault could not be loaded. Please try again.");
      // Anything else that came with the structure is a stale copy: remove it.
      const keep = new Set([entity.id, ...[...sessions.values()].map((x) => x.entity.id)]);
      for (const e of vaultsAt(dim, block)) if (!keep.has(e.id)) e.remove();
    } else {
      entity = dim.spawnEntity(ENTITY, { x: block.x + 0.5, y: block.y + 0.3, z: block.z + 0.5 });
      entity.addTag(tag);
    }
    sessions.set(player.id, { entity, dim, block, key, tag });
    const c = entity.getComponent("minecraft:inventory")?.container;
    if (!c) throw new Error("Vault container missing.");
    return c;
  } finally {
    pending.delete(tag);
  }
}

/** Saves the open vault into the next structure slot. */
export function saveVault(player) {
  const s = sessions.get(player.id);
  if (!s || !s.entity.isValid) return false;
  const sm = world.structureManager;
  const cur = pointerOf(player);
  const next = cur === "a" ? "b" : "a";
  const nextName = structName(s.key, next);
  try {
    if (sm.get(nextName)) sm.delete(nextName);
    sm.createFromWorld(nextName, s.dim, s.block, s.block, {
      includeBlocks: false,
      includeEntities: true,
      saveMode: StructureSaveMode.World,
    });
    player.setDynamicProperty("sl:vault_ptr", next);
    try {
      sm.delete(structName(s.key, cur));
    } catch {}
    return true;
  } catch (e) {
    console.warn(`[SL] vault save failed for ${player.name}: ${e}`);
    return false;
  }
}

/** Saves and removes the vault entity. */
export function closeVault(player) {
  const s = sessions.get(player.id);
  if (!s) return;
  saveVault(player);
  try {
    s.entity.remove();
  } catch {}
  sessions.delete(player.id);
}

world.beforeEvents.playerLeave.subscribe(({ player }) => {
  const s = sessions.get(player.id);
  if (!s) return;
  sessions.delete(player.id);
  // Everything was saved after the last change; just remove the entity.
  system.run(() => {
    try {
      if (s.entity.isValid) s.entity.remove();
    } catch {}
  });
});

// Remove any vault entity that is not part of an open session.
system.runInterval(() => {
  const active = new Set([...sessions.values()].map((s) => s.tag));
  for (const id of DIMENSIONS) {
    try {
      for (const e of world.getDimension(id).getEntities({ type: ENTITY })) {
        const tag = e.getTags().find((t) => t.startsWith("slv_"));
        if (!tag || (!active.has(tag) && !pending.has(tag))) e.remove();
      }
    } catch {}
  }
}, 200);

// ---------------------------------------------------------------- operations
const isLocked = (item) => item.lockMode !== ItemLockMode.none;

/**
 * Moves (part of) a stack from one container slot into the first `limit`
 * slots of another container, merging with matching stacks first.
 * @returns {{moved:number, locked?:boolean}}
 */
export function moveStack(from, fromSlot, to, limit, amount = Infinity) {
  const item = from.getItem(fromSlot);
  if (!item) return { moved: 0 };
  if (isLocked(item)) return { moved: 0, locked: true };
  const want = Math.min(amount, item.amount);
  let remaining = want;

  if (item.isStackable) {
    for (let i = 0; i < limit && remaining > 0; i++) {
      const slot = to.getSlot(i);
      if (!slot.hasItem() || !slot.isStackableWith(item)) continue;
      const space = slot.maxAmount - slot.amount;
      if (space <= 0) continue;
      const n = Math.min(space, remaining);
      slot.amount += n;
      remaining -= n;
    }
  }
  if (remaining > 0) {
    let empty = -1;
    for (let i = 0; i < limit; i++) {
      if (!to.getItem(i)) {
        empty = i;
        break;
      }
    }
    if (empty >= 0) {
      if (remaining === item.amount) {
        from.moveItem(fromSlot, empty, to); // native move keeps all item data
        return { moved: want };
      }
      const part = item.clone();
      part.amount = remaining;
      to.setItem(empty, part);
      remaining = 0;
    }
  }
  const moved = want - remaining;
  if (moved > 0) {
    const left = item.amount - moved;
    if (left <= 0) from.setItem(fromSlot, undefined);
    else from.getSlot(fromSlot).amount = left;
  }
  return { moved };
}

/** Sorts the first `limit` slots (by category, id, amount). */
export function sortContainer(c, limit, keyOf) {
  const filled = [];
  for (let i = 0; i < limit; i++) {
    const it = c.getItem(i);
    if (it) filled.push({ origin: i, key: keyOf(it) });
  }
  filled.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  // current[slot] = origin index currently in that slot
  const current = new Array(limit).fill(-1);
  for (const f of filled) current[f.origin] = f.origin;
  filled.forEach((f, target) => {
    const at = current.indexOf(f.origin);
    if (at !== target) {
      c.swapItems(target, at, c);
      [current[target], current[at]] = [current[at], current[target]];
    }
  });
}

/** Merges partial stacks of identical items. */
export function stackContainer(c, limit) {
  for (let i = 0; i < limit; i++) {
    const a = c.getSlot(i);
    if (!a.hasItem() || !a.isStackable) continue;
    for (let j = i + 1; j < limit && a.amount < a.maxAmount; j++) {
      const b = c.getSlot(j);
      if (!b.hasItem() || !b.isStackableWith(a.getItem())) continue;
      const n = Math.min(a.maxAmount - a.amount, b.amount);
      a.amount += n;
      if (b.amount - n <= 0) c.setItem(j, undefined);
      else b.amount -= n;
    }
  }
}

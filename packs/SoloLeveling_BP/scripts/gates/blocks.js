// Shared block placing for generated buildings (dungeons, trial arenas):
// resolves block names once (with fallbacks for older names), fills big boxes
// in engine-sized pieces and applies operation lists as a job.
import { BlockPermutation, BlockVolume } from "@minecraft/server";

const FALLBACK = {
  cobweb: "web", short_grass: "tallgrass", fern: "tallgrass", azalea_leaves_flowered: "azalea_leaves", jungle_leaves: "azalea_leaves",
  poppy: "red_flower", blue_orchid: "red_flower", allium: "red_flower", azure_bluet: "red_flower", oxeye_daisy: "red_flower",
  cornflower: "red_flower", lily_of_the_valley: "red_flower", dandelion: "yellow_flower", skeleton_skull: "skull",
  tuff_bricks: "stone_bricks", polished_tuff: "polished_andesite", chiseled_tuff_bricks: "chiseled_stone_bricks",
  jungle_fence: "oak_fence", spruce_fence: "oak_fence", dark_oak_fence: "oak_fence", crimson_fence: "oak_fence",
  cyan_stained_glass: "glass", red_stained_glass: "glass", red_carpet: "carpet", soul_campfire: "campfire", red_wool: "wool", mossy_stone_bricks: "stonebrick", stone_bricks: "stonebrick",
};
/** @type {Map<string, BlockPermutation|null>} */
const perms = new Map();
export function permOf(b) {
  const id = typeof b === "string" ? (b.includes(":") ? b : `minecraft:${b}`) : b.id;
  const states = typeof b === "string" ? undefined : b.states;
  const key = states ? id + JSON.stringify(states) : id;
  if (perms.has(key)) return perms.get(key);
  let perm = null;
  for (const [i, s] of [[id, states], [id, undefined], [`minecraft:${FALLBACK[id.slice(10)] ?? "-"}`, undefined]]) {
    try {
      perm = BlockPermutation.resolve(i, s);
      break;
    } catch {}
  }
  if (!perm) console.warn(`[SL] dungeon: unknown block ${key}`);
  perms.set(key, perm);
  return perm;
}

/** fillBlocks in pieces small enough for the engine. */
export function fillBox(dim, x1, y1, z1, x2, y2, z2, perm) {
  const dy = y2 - y1 + 1;
  const dz = z2 - z1 + 1;
  const step = Math.max(1, Math.floor(30000 / (dy * dz)));
  for (let x = x1; x <= x2; x += step) {
    if (dy * dz > 30000) {
      const zs = Math.max(1, Math.floor(30000 / dy));
      for (let z = z1; z <= z2; z += zs) {
        try {
          dim.fillBlocks(new BlockVolume({ x, y: y1, z }, { x, y: y2, z: Math.min(z + zs - 1, z2) }), perm);
        } catch {}
      }
      continue;
    }
    try {
      dim.fillBlocks(new BlockVolume({ x, y: y1, z: z1 }, { x: Math.min(x + step - 1, x2), y: y2, z: z2 }), perm);
    } catch {}
  }
}

/**
 * Generator: applies [x,y,z,b] / ["F",x1,y1,z1,x2,y2,z2,b] operations,
 * yielding regularly so the server keeps ticking.
 */
export function* applyOps(dim, ops, stop = () => false) {
  let work = 0;
  for (const op of ops) {
    if (stop()) return;
    try {
      if (op[0] === "F") {
        const [, x1, y1, z1, x2, y2, z2, b] = op;
        const perm = permOf(b);
        if (perm) fillBox(dim, x1, y1, z1, x2, y2, z2, perm);
        work += 4;
      } else {
        const perm = permOf(op[3]);
        if (perm) dim.getBlock({ x: op[0], y: op[1], z: op[2] })?.setPermutation(perm);
        work++;
      }
    } catch {}
    if (work >= 220) {
      work = 0;
      yield;
    }
  }
}

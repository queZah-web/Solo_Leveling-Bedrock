// The Penalty Zone: a colosseum built in the sky far from spawn, only while
// someone is being punished. Players are held in place until it is fully
// built; the 3-minute timer starts after that. The arena cannot be broken
// (Adventure mode + cancelled break/interact/explosions) and is removed when
// the last punished hunter leaves it.
import { BlockVolume, GameMode, Player, system, world } from "@minecraft/server";
import { getData, markDirty } from "../data.js";
import { addXp, flash } from "../stats.js";
import { credit } from "../progression.js";

export const PENALTY_SECONDS = 180;
const C = { x: 60000, y: 180, z: 60000 }; // floor level center
const R = 21; // arena radius (inside the wall)
const OUTER = 28; // area that is cleared / protected
const TOP = 26; // barrier ceiling height above the floor
const AREA = "sl_penalty";
const TAG = "sl_penalty";

const ow = () => world.getDimension("overworld");
const inZone = (l, dim) =>
  (dim === undefined || dim === "minecraft:overworld") &&
  Math.abs(l.x - C.x) <= OUTER + 1 && Math.abs(l.z - C.z) <= OUTER + 1 && l.y >= C.y - 4 && l.y <= C.y + TOP + 2;

/** "idle" | "building" | "ready". Read from the world on the first tick:
 * world data can't be read while scripts are still loading. */
let zoneState = "idle";
system.run(() => {
  try {
    if (world.getDynamicProperty("sl:zone_built") === true && zoneState === "idle") zoneState = "ready";
  } catch {}
});
let buildPromise;

// ---------------------------------------------------------------- building
const GATES = [0, 90, 180, 270]; // degrees
const isGateAngle = (deg) => GATES.some((g) => Math.abs(((deg - g + 540) % 360) - 180) <= 7);

/**
 * Blocks of the colosseum, as [dx, dy, dz, blockId].
 * @returns {Generator<[number, number, number, string]>}
 */
function* design() {
  for (let dx = -OUTER; dx <= OUTER; dx++) {
    for (let dz = -OUTER; dz <= OUTER; dz++) {
      const d = Math.hypot(dx, dz);
      const deg = (Math.atan2(dz, dx) * 180) / Math.PI + 180;
      const gate = isGateAngle(deg);
      // Floor
      if (d < R + 0.5) {
        let floor = "minecraft:smooth_sandstone";
        if (d < 2.5) floor = "minecraft:crying_obsidian";
        else if (d < 4) floor = "minecraft:red_nether_bricks";
        else if (d >= 9 && d < 10) floor = "minecraft:chiseled_red_sandstone";
        else if (d >= 15 && d < 16) floor = "minecraft:red_sandstone";
        else if (d > 16 && (dx + dz) % 2 === 0) floor = "minecraft:cut_sandstone";
        if (d >= 12 && d < 13 && Math.abs(dx) % 6 === 0 && Math.abs(dz) % 6 === 0) floor = "minecraft:shroomlight";
        yield [dx, -1, dz, floor];
        yield [dx, -2, dz, "minecraft:sandstone"];
      }
      // Wall ring with a decorated top, open where the gates are
      if (d >= R + 0.5 && d < R + 2.5) {
        yield [dx, -1, dz, "minecraft:smooth_red_sandstone"];
        for (let y = 0; y <= 7; y++) {
          if (gate && y <= 4) continue;
          if (gate && y === 5) yield [dx, y, dz, "minecraft:crying_obsidian"];
          else yield [dx, y, dz, y === 7 ? "minecraft:chiseled_red_sandstone" : "minecraft:smooth_red_sandstone"];
        }
      }
      // Gate chambers behind the openings (waves spawn here)
      if (gate && d >= R + 2.5 && d < OUTER - 1) {
        yield [dx, -1, dz, "minecraft:polished_blackstone"];
        yield [dx, 5, dz, "minecraft:polished_blackstone_bricks"];
      }
      // Invisible enclosure up to the ceiling
      if ((d >= R + 2.5 && d < R + 3.5 && !gate) || (d >= OUTER - 1 && d < OUTER)) {
        for (let y = 0; y <= TOP; y++) yield [dx, y, dz, "minecraft:barrier"];
      }
      if (d < OUTER) yield [dx, TOP, dz, "minecraft:barrier"];
    }
  }
  // Gate frames
  for (const g of GATES) {
    const a = (g * Math.PI) / 180 + Math.PI;
    const fx = Math.round(Math.cos(a) * (R + 0.5));
    const fz = Math.round(Math.sin(a) * (R + 0.5));
    const px = Math.round(-Math.sin(a) * 3);
    const pz = Math.round(Math.cos(a) * 3);
    for (let y = 0; y <= 5; y++) {
      yield [fx + px, y, fz + pz, "minecraft:crying_obsidian"];
      yield [fx - px, y, fz - pz, "minecraft:crying_obsidian"];
    }
  }
  // 12 pillars with soul lanterns
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 + 15) * (Math.PI / 180);
    const px = Math.round(Math.cos(a) * (R - 1));
    const pz = Math.round(Math.sin(a) * (R - 1));
    for (let y = 0; y <= 9; y++) yield [px, y, pz, y === 9 ? "minecraft:chiseled_polished_blackstone" : "minecraft:polished_blackstone_bricks"];
    yield [px, 10, pz, "minecraft:soul_lantern"];
  }
}

function* clearJob(done) {
  const dim = ow();
  for (let y = C.y - 3; y <= C.y + TOP + 1; y += 8) {
    try {
      dim.fillBlocks(
        new BlockVolume({ x: C.x - OUTER, y, z: C.z - OUTER }, { x: C.x + OUTER, y: Math.min(y + 7, C.y + TOP + 1), z: C.z + OUTER }),
        "minecraft:air",
      );
    } catch (e) {
      console.warn(`[SL] penalty clear: ${e}`);
    }
    yield;
  }
  done?.();
}

function* buildJob(resolve) {
  // Make room, then place the design a few hundred blocks per tick.
  let cleared = false;
  const gen = clearJob(() => (cleared = true));
  while (!cleared) {
    gen.next();
    yield;
  }
  const dim = ow();
  let n = 0;
  for (const [dx, dy, dz, id] of design()) {
    try {
      dim.getBlock({ x: C.x + dx, y: C.y + dy, z: C.z + dz })?.setType(id);
    } catch {}
    if (++n % 250 === 0) yield;
  }
  world.setDynamicProperty("sl:zone_built", true);
  zoneState = "ready";
  resolve();
}

const loaded = () => {
  const dim = ow();
  for (const [x, z] of [[-OUTER, -OUTER], [OUTER, -OUTER], [-OUTER, OUTER], [OUTER, OUTER], [0, 0]]) {
    try {
      if (!dim.getBlock({ x: C.x + x, y: C.y, z: C.z + z })) return false;
    } catch {
      return false;
    }
  }
  return true;
};

/** Builds the arena if needed. Resolves when it's ready. */
function ensureZone() {
  if (zoneState === "ready") return Promise.resolve();
  if (buildPromise) return buildPromise;
  zoneState = "building";
  try {
    ow().runCommand(`tickingarea add circle ${C.x} ${C.y} ${C.z} 3 ${AREA} true`);
  } catch {}
  buildPromise = new Promise((resolve) => {
    const wait = system.runInterval(() => {
      if (!loaded()) return;
      system.clearRun(wait);
      system.runJob(buildJob(resolve));
    }, 5);
  }).finally(() => (buildPromise = undefined));
  return buildPromise;
}

function removeZone() {
  zoneState = "idle";
  world.setDynamicProperty("sl:zone_built", false);
  system.runJob(clearJob(() => {
    try {
      ow().runCommand(`tickingarea remove ${AREA}`);
    } catch {}
  }));
}

// ---------------------------------------------------------------- penalty flow
const SPAWN = { x: C.x + 0.5, y: C.y + 0.1, z: C.z + 0.5 };
const HOLD = { x: C.x + 0.5, y: C.y + 4, z: C.z + 0.5 };

export function startPenalty(player) {
  const d = getData(player);
  d.penaltyDue = false;
  d.penalty = {
    until: 0, // set when the arena is ready
    ret: { ...player.location, dim: player.dimension.id },
    mode: player.getGameMode(),
  };
  markDirty(player);
  player.onScreenDisplay.setTitle("§c§lPENALTY QUEST", {
    subtitle: "§fYou failed yesterday's Daily Quest. §cSurvive!",
    fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 10,
  });
  player.sendMessage(`§c[System] §fPenalty Quest: §cSurvive in the Penalty Zone for ${PENALTY_SECONDS / 60} minutes.`);
  enterZone(player);
}

function enterZone(player) {
  try {
    player.setGameMode(GameMode.Adventure);
  } catch {}
  player.teleport(HOLD, { dimension: ow() });
  ensureZone().then(() => {
    if (!player.isValid) return;
    const d = getData(player);
    if (!d.penalty) return;
    player.teleport(SPAWN, { dimension: ow() });
    if (!d.penalty.until) {
      d.penalty.until = Date.now() + PENALTY_SECONDS * 1000;
      markDirty(player);
    }
    player.playSound("mob.wither.spawn", { volume: 0.6, pitch: 0.6 });
    player.onScreenDisplay.setTitle("§4§lSURVIVE", { subtitle: "§7The Penalty Zone", fadeInDuration: 5, stayDuration: 30, fadeOutDuration: 10 });
  });
}

export function endPenalty(player, survived) {
  const d = getData(player);
  const pen = d.penalty;
  d.penalty = null;
  markDirty(player);
  try {
    for (const e of ow().getEntities({ tags: [`${TAG}_${player.id}`] })) e.remove();
  } catch {}
  try {
    player.setGameMode(pen?.mode ?? GameMode.Survival);
  } catch {}
  if (survived) {
    credit(player, "penalty");
    player.onScreenDisplay.setTitle("§aPENALTY CLEARED", {
      subtitle: "§fYou survived the Penalty Zone.", fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10,
    });
    addXp(player, 100 + d.level * 10);
    if (pen?.ret) {
      try {
        player.teleport(pen.ret, { dimension: world.getDimension(pen.ret.dim) });
      } catch {}
    }
  } else {
    player.sendMessage("§c[System] §7You fell in the Penalty Zone.");
  }
}

const MOBS = ["minecraft:silverfish", "minecraft:silverfish", "minecraft:husk", "minecraft:spider", "minecraft:cave_spider"];

/** Monster spawn spots: inside the four gate chambers. */
const gateSpot = (i) => {
  const a = (GATES[i] * Math.PI) / 180 + Math.PI;
  return { x: C.x + 0.5 + Math.cos(a) * (R + 4), y: C.y + 0.1, z: C.z + 0.5 + Math.sin(a) * (R + 4) };
};

let tick = 0;
system.runInterval(() => {
  const now = Date.now();
  const wave = ++tick % 5 === 0;
  let anyone = false;
  for (const p of world.getAllPlayers()) {
    const d = getData(p);
    if (!d.penalty) continue;
    anyone = true;
    if (d.penalty.until && zoneState !== "ready") {
      // The arena was taken down while this hunter was away: rebuild, restart the timer.
      d.penalty.until = 0;
      markDirty(p);
    }
    if (!d.penalty.until) {
      // Still building: hold the hunter in the air at the center.
      if (zoneState !== "ready") {
        p.teleport(HOLD, { dimension: ow() });
        p.addEffect("slow_falling", 40, { amplifier: 0, showParticles: false });
        flash(p, "§cThe Penalty Zone is forming...", 25);
        if (zoneState === "idle") enterZone(p);
      } else enterZone(p);
      continue;
    }
    const left = Math.ceil((d.penalty.until - now) / 1000);
    if (left <= 0) {
      endPenalty(p, true);
      continue;
    }
    flash(p, `§c§lPENALTY ZONE §r§f${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, 25);
    if (!inZone(p.location, p.dimension.id)) {
      p.teleport(SPAWN, { dimension: ow() });
      continue;
    }
    if (p.getGameMode() !== GameMode.Adventure) {
      try {
        p.setGameMode(GameMode.Adventure);
      } catch {}
    }
    if (!wave) continue;
    // A wave from every gate; bigger with level.
    const n = 1 + Math.floor(d.level / 20);
    for (let g = 0; g < 4; g++) {
      for (let i = 0; i < n; i++) {
        try {
          const m = p.dimension.spawnEntity(MOBS[Math.floor(Math.random() * MOBS.length)], gateSpot(g));
          m.addTag(`${TAG}_${p.id}`);
          m.addTag(TAG);
        } catch {}
      }
    }
  }
  // Nobody is being punished: take the arena down and clean up.
  if (!anyone && zoneState === "ready" && tick % 10 === 0) {
    try {
      for (const e of ow().getEntities({ tags: [TAG] })) e.remove();
    } catch {}
    removeZone();
  }
}, 20);

// Dying ends the penalty (failed). Restore the game mode on respawn.
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity instanceof Player && getData(deadEntity).penalty) endPenalty(deadEntity, false);
});

// The arena can't be broken or used.
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (zoneState !== "idle" && inZone(ev.block.location, ev.block.dimension.id)) ev.cancel = true;
});
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (zoneState !== "idle" && inZone(ev.block.location, ev.block.dimension.id)) ev.cancel = true;
});
world.beforeEvents.explosion.subscribe((ev) => {
  if (zoneState === "idle" || ev.dimension.id !== "minecraft:overworld") return;
  const blocks = ev.getImpactedBlocks();
  const keep = blocks.filter((b) => !inZone(b.location));
  if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
});

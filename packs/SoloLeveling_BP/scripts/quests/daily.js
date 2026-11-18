// Daily Quest "Preparation to Become Powerful" and the Penalty Zone.
//
// The day changes at midnight in DAY_TZ_OFFSET (hours from UTC). If a hunter
// was online on a day and did not finish that day's quest, the next time
// they are online they are sent to the Penalty Zone: survive for 3 minutes.
// Server owners can turn the penalty off with /sl:penalty off.
import { BlockVolume, Player, system, world } from "@minecraft/server";
import { maxMp } from "../config.js";
import { getData, markDirty } from "../data.js";
import { addXp, flash } from "../stats.js";

export const DAY_TZ_OFFSET = 3; // UTC+3
export const DAILY_TASKS = [
  { key: "sneak", name: "Push-ups", how: "Sneak", goal: 100 },
  { key: "jump", name: "Sit-ups", how: "Jump", goal: 100 },
  { key: "dist", name: "Running", how: "Walk/run (m)", goal: 2000 },
  { key: "kills", name: "Hunt", how: "Defeat monsters", goal: 20 },
];
export const DAILY_REWARD_POINTS = 3;
const PENALTY_SECONDS = 180;
const ZONE = { x: 60000, y: 200, z: 60000 };
const ZONE_RADIUS = 18;

export const today = () => {
  const d = new Date(Date.now() + DAY_TZ_OFFSET * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};
const yesterday = () => {
  const d = new Date(Date.now() + DAY_TZ_OFFSET * 3600 * 1000 - 86400 * 1000);
  return d.toISOString().slice(0, 10);
};

export const penaltyEnabled = () => world.getDynamicProperty("sl:penalty") !== false;
export const setPenaltyEnabled = (on) => world.setDynamicProperty("sl:penalty", on);

const fresh = () => ({ day: today(), sneak: 0, jump: 0, dist: 0, kills: 0, claimed: false });

/** Today's quest record (rolls over to a new day, scheduling a penalty if needed). */
export function dailyOf(player) {
  const d = getData(player);
  const q = d.daily;
  if (q && q.day === today()) return q;
  if (q && q.day === yesterday() && !q.claimed && !isComplete(q) && penaltyEnabled() && !d.penalty) {
    d.penaltyDue = true;
  }
  d.daily = fresh();
  markDirty(player);
  return d.daily;
}

export const isComplete = (q) => DAILY_TASKS.every((t) => (q[t.key] ?? 0) >= t.goal);

function bump(player, key, n = 1) {
  const q = dailyOf(player);
  if (q.claimed) return;
  const task = DAILY_TASKS.find((t) => t.key === key);
  const before = q[key];
  q[key] = Math.min(task.goal, before + n);
  if (before < task.goal && q[key] >= task.goal) {
    player.sendMessage(`§b[System] §fDaily Quest: §a${task.name} complete!`);
    player.playSound("random.orb", { pitch: 1.2 });
    if (isComplete(q)) player.sendMessage("§b[System] §eAll daily tasks complete! §fClaim your reward in the §bQUESTS §ftab.");
  }
  markDirty(player);
}

/** Claims today's reward. Returns an error message or undefined. */
export function claimDaily(player) {
  const q = dailyOf(player);
  if (q.claimed) return "Today's reward was already claimed.";
  if (!isComplete(q)) return "The daily quest is not complete yet.";
  q.claimed = true;
  const d = getData(player);
  d.points += DAILY_REWARD_POINTS;
  d.fatigue = 0;
  d.mp = maxMp(d.int);
  markDirty(player);
  const h = player.getComponent("minecraft:health");
  h?.setCurrentValue(h.effectiveMax);
  addXp(player, 50 + d.level * 20);
  player.onScreenDisplay.setTitle("§bQUEST COMPLETE", {
    subtitle: `§a+${DAILY_REWARD_POINTS} stat points §7| §fFull recovery`,
    fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10,
  });
  player.playSound("random.levelup", { pitch: 1.2 });
  return undefined;
}

// ---------------------------------------------------------------- tracking
/** playerId -> { sneaking, jumping, last location } */
const track = new Map();

system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const t = track.get(p.id) ?? { sneaking: false, jumping: false, loc: undefined, acc: 0 };
    if (p.isSneaking && !t.sneaking) bump(p, "sneak");
    if (p.isJumping && !t.jumping) bump(p, "jump");
    t.sneaking = p.isSneaking;
    t.jumping = p.isJumping;
    track.set(p.id, t);
  }
}, 2);

system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const t = track.get(p.id);
    if (!t) continue;
    const l = p.location;
    if (t.loc && t.dim === p.dimension.id && !p.getComponent("minecraft:riding")) {
      const step = Math.hypot(l.x - t.loc.x, l.z - t.loc.z);
      if (step < 15) {
        t.acc += step; // ignore teleports
        if (t.acc >= 1) {
          bump(p, "dist", Math.floor(t.acc));
          t.acc -= Math.floor(t.acc);
        }
      }
    }
    t.loc = { ...l };
    t.dim = p.dimension.id;
    // Day roll-over / due penalty
    dailyOf(p);
    const d = getData(p);
    if (d.penaltyDue && !d.penalty) startPenalty(p);
  }
}, 20);

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const k = damageSource.damagingEntity;
  if (!(k instanceof Player)) return;
  try {
    if (!deadEntity.matches({ families: ["monster"] })) return;
  } catch {
    return;
  }
  bump(k, "kills");
});

world.beforeEvents.playerLeave.subscribe(({ player }) => track.delete(player.id));

// ---------------------------------------------------------------- penalty zone
const ZONE_TAG = "sl_penalty";

function buildZone(dim) {
  const { x, y, z } = ZONE;
  const r = ZONE_RADIUS;
  // Sand arena with an invisible wall, open sky.
  dim.fillBlocks(new BlockVolume({ x: x - r, y: y - 1, z: z - r }, { x: x + r, y: y - 1, z: z + r }), "minecraft:sandstone");
  dim.fillBlocks(new BlockVolume({ x: x - r + 1, y, z: z - r + 1 }, { x: x + r - 1, y, z: z + r - 1 }), "minecraft:sand");
  for (const [a, b] of [
    [{ x: x - r, y, z: z - r }, { x: x + r, y: y + 6, z: z - r }],
    [{ x: x - r, y, z: z + r }, { x: x + r, y: y + 6, z: z + r }],
    [{ x: x - r, y, z: z - r }, { x: x - r, y: y + 6, z: z + r }],
    [{ x: x + r, y, z: z - r }, { x: x + r, y: y + 6, z: z + r }],
  ]) dim.fillBlocks(new BlockVolume(a, b), "minecraft:barrier");
}

export function startPenalty(player) {
  const d = getData(player);
  d.penaltyDue = false;
  d.penalty = {
    until: Date.now() + PENALTY_SECONDS * 1000,
    ret: { ...player.location, dim: player.dimension.id },
  };
  markDirty(player);
  const ow = world.getDimension("overworld");
  player.onScreenDisplay.setTitle("§c§lPENALTY QUEST", {
    subtitle: "§fYou failed yesterday's Daily Quest. §cSurvive!",
    fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 10,
  });
  player.sendMessage("§c[System] §fPenalty Quest: §cSurvive in the Penalty Zone for 3 minutes.");
  player.addEffect("slow_falling", 200, { amplifier: 0, showParticles: false });
  player.addEffect("resistance", 100, { amplifier: 4, showParticles: false });
  player.teleport({ x: ZONE.x + 0.5, y: ZONE.y + 3, z: ZONE.z + 0.5 }, { dimension: ow });
  // Build once the chunk is loaded around the player.
  system.runTimeout(() => {
    try {
      buildZone(ow);
    } catch (e) {
      console.warn(`[SL] penalty zone build failed: ${e}`);
    }
  }, 30);
}

function endPenalty(player, survived) {
  const d = getData(player);
  const ret = d.penalty?.ret;
  d.penalty = null;
  markDirty(player);
  // Clear the monsters of this hunter's penalty.
  try {
    for (const e of world.getDimension("overworld").getEntities({ tags: [`${ZONE_TAG}_${player.id}`] })) e.remove();
  } catch {}
  if (survived) {
    if (d.title === "None") d.title = "The One Who Overcame Adversity";
    player.onScreenDisplay.setTitle("§aPENALTY CLEARED", {
      subtitle: "§fYou survived the Penalty Zone.", fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10,
    });
    addXp(player, 100 + d.level * 10);
    if (ret) {
      try {
        player.teleport(ret, { dimension: world.getDimension(ret.dim) });
      } catch {}
    }
  } else {
    player.sendMessage("§c[System] §7You fell in the Penalty Zone.");
  }
}

const PENALTY_MOBS = ["minecraft:silverfish", "minecraft:silverfish", "minecraft:husk", "minecraft:spider"];

let penaltyTick = 0;
system.runInterval(() => {
  const now = Date.now();
  const wave = ++penaltyTick % 5 === 0; // every 5 seconds
  for (const p of world.getAllPlayers()) {
    const d = getData(p);
    if (!d.penalty) continue;
    const left = Math.ceil((d.penalty.until - now) / 1000);
    if (left <= 0) {
      endPenalty(p, true);
      continue;
    }
    flash(p, `§c§lPENALTY ZONE §r§f${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, 25);
    // Keep the hunter inside the zone.
    const l = p.location;
    if (p.dimension.id !== "minecraft:overworld" || Math.abs(l.x - ZONE.x) > ZONE_RADIUS + 4 || Math.abs(l.z - ZONE.z) > ZONE_RADIUS + 4) {
      p.teleport({ x: ZONE.x + 0.5, y: ZONE.y + 1, z: ZONE.z + 0.5 }, { dimension: world.getDimension("overworld") });
      continue;
    }
    if (!wave) continue;
    // Waves: more monsters the higher the level.
    const n = 2 + Math.floor(d.level / 15);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const pos = { x: ZONE.x + 0.5 + Math.cos(a) * (ZONE_RADIUS - 3), y: ZONE.y + 0.5, z: ZONE.z + 0.5 + Math.sin(a) * (ZONE_RADIUS - 3) };
      try {
        const m = p.dimension.spawnEntity(PENALTY_MOBS[Math.floor(Math.random() * PENALTY_MOBS.length)], pos);
        m.addTag(`${ZONE_TAG}_${p.id}`);
      } catch {}
    }
  }
}, 20);

// Dying ends the penalty (failed).
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity instanceof Player && getData(deadEntity).penalty) endPenalty(deadEntity, false);
});

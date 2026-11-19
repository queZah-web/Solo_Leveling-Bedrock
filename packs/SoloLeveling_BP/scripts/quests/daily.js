// Daily Quest "Preparation to Become Powerful" and the Penalty Zone.
//
// The day changes at midnight in DAY_TZ_OFFSET (hours from UTC). If a hunter
// was online on a day and did not finish that day's quest, the next time
// they are online they are sent to the Penalty Zone: survive for 3 minutes.
// Server owners can turn the penalty off with /sl:penalty off.
import { Player, system, world } from "@minecraft/server";
import { maxMp } from "../config.js";
import { getData, markDirty } from "../data.js";
import { credit } from "../progression.js";
import { addXp } from "../stats.js";
import { addGold } from "../economy.js";
import { startPenalty } from "./penalty.js";

export const DAY_TZ_OFFSET = 3; // UTC+3
export const DAILY_TASKS = [
  { key: "sneak", name: "Push-ups", how: "Sneak", goal: 100 },
  { key: "jump", name: "Sit-ups", how: "Jump", goal: 100 },
  { key: "dist", name: "Running", how: "Walk/run (m)", goal: 2000 },
  { key: "kills", name: "Hunt", how: "Defeat monsters", goal: 20 },
];
export const DAILY_REWARD_POINTS = 3;

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
  addGold(player, 100, "daily quest");
  credit(player, "daily");
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

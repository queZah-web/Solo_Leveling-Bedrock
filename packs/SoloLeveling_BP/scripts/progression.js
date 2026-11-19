// Jobs and Titles at runtime: taking a Job, the Shadow Monarch awakening,
// counting deeds, unlocking and wearing titles, the name shown above the
// head and the Healer's aura.
import { Player, system, world } from "@minecraft/server";
import { JOBS, jobOf, KILL_GROUPS, MONARCH_LEVEL, TITLE_BY_ID, TITLES, titleOf } from "./classes.js";
import { getData, markDirty } from "./data.js";
import { applyStatEffects } from "./stats.js";
import { summonedList } from "./army/army.js";
import { setGuildChangeHandler } from "./social/guild.js";

// ---------------------------------------------------------------- jobs
function grantStats(d, stats) {
  let total = 0;
  for (const [k, n] of Object.entries(stats)) {
    d[k] += n;
    total += n;
  }
  d.jobStats = (d.jobStats ?? 0) + total;
}

/** Takes a Job (from the Job Change Quest). */
export function becomeJob(player, key) {
  const j = JOBS[key];
  const d = getData(player);
  if (!j || !d.jobPending) return;
  d.jobPending = false;
  d.job = j.name;
  grantStats(d, j.stats);
  markDirty(player);
  applyStatEffects(player, true);
  refreshTag(player);
  player.onScreenDisplay.setTitle(`${j.color}§l${j.name.toUpperCase()}`, { subtitle: "§fYour Job has changed", fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 10 });
  player.sendMessage(`§6[System] §fJob changed: ${j.color}${j.name}§f. ${j.desc.join(". ")}.`);
  player.playSound("random.totem", { pitch: 0.8 });
  try {
    for (let i = 0; i < 12; i++) player.dimension.spawnParticle("minecraft:totem_particle", { ...player.location, y: player.location.y + 1 + i * 0.1 });
  } catch {}
}

/** Necromancer -> Shadow Monarch. */
function awaken(player, d) {
  const before = JOBS.necromancer.stats;
  const after = JOBS.shadow_monarch.stats;
  const diff = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) diff[k] = (after[k] ?? 0) - (before[k] ?? 0);
  grantStats(d, diff);
  d.job = JOBS.shadow_monarch.name;
  markDirty(player);
  applyStatEffects(player, true);
  refreshTag(player);
  player.onScreenDisplay.setTitle("§5§lSHADOW MONARCH", { subtitle: "§7The King of the Dead has awakened", fadeInDuration: 10, stayDuration: 80, fadeOutDuration: 20 });
  world.sendMessage(`§5[System] §f${player.name} §7has awakened as the §5§lShadow Monarch§r§7.`);
  player.playSound("mob.wither.spawn", { pitch: 0.4 });
  player.playSound("random.totem", { pitch: 0.5 });
  try {
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      player.dimension.spawnParticle("minecraft:soul_particle", { x: player.location.x + Math.cos(a) * 2, y: player.location.y + 0.5, z: player.location.z + Math.sin(a) * 2 });
    }
  } catch {}
}

// ---------------------------------------------------------------- titles
/** Counts a deed (kills by group, bosses, gates...) and checks titles. */
export function credit(player, key, n = 1) {
  const d = getData(player);
  d.tk ??= {};
  d.tk[key] = (d.tk[key] ?? 0) + n;
  markDirty(player);
  checkTitles(player);
}

export function checkTitles(player) {
  const d = getData(player);
  d.titles ??= [];
  for (const t of TITLES) {
    if (d.titles.includes(t.id)) continue;
    const [cur, goal] = t.need(d);
    if (cur < goal) continue;
    d.titles.push(t.id);
    markDirty(player);
    player.onScreenDisplay.setTitle("§e§lTITLE ACQUIRED", { subtitle: `${t.color}${t.name}`, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
    player.sendMessage(`§e[System] §fTitle acquired: ${t.color}${t.name} §7(${t.effect}). §8Wear it from System > QUESTS > TITLES.`);
    player.playSound("random.levelup", { pitch: 1.6 });
    if (!d.titleId) wearTitle(player, t.id);
  }
}

/** Wears a title (or none). */
export function wearTitle(player, id) {
  const d = getData(player);
  if (id && !d.titles?.includes(id)) return false;
  d.titleId = id || undefined;
  d.title = titleOf(d)?.name ?? "None";
  markDirty(player);
  refreshTag(player);
  return true;
}

/** Name above the head: name, then Job and Title. */
export function refreshTag(player) {
  const d = getData(player);
  const j = jobOf(d);
  const t = titleOf(d);
  const parts = [];
  if (j) parts.push(`${j.color}${j.name}`);
  if (t) parts.push(`${t.color}${t.name}`);
  const name = d.gtag ? `§6[${d.gtag}] §f${player.name}` : player.name;
  try {
    player.nameTag = d.showTitle !== false && parts.length ? `${name}\n${parts.join(" §8| ")}` : name;
  } catch {}
}
setGuildChangeHandler(refreshTag);

// Old saves: the penalty title was stored as plain text.
function migrate(player, d) {
  if (d.titles) return;
  d.titles = [];
  d.tk ??= {};
  if (d.title === TITLE_BY_ID.adversity.name) {
    d.tk.penalty = 1;
    d.titles.push("adversity");
    d.titleId = "adversity";
  } else d.title = "None";
  markDirty(player);
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    if (!player.isValid) return;
    migrate(player, getData(player));
    refreshTag(player);
  }, 20);
});

// Kills by the hunter's own hand. Dungeon and trial bosses are credited when
// they are cleared (whoever lands the last hit).
world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (!(killer instanceof Player)) return;
  let id;
  try {
    id = deadEntity.typeId;
    if (deadEntity.hasTag("sl_boss") || deadEntity.hasTag("sl_trial_boss")) return;
  } catch {
    return;
  }
  const d = getData(killer);
  d.tk ??= {};
  let changed = false;
  for (const [g, ids] of Object.entries(KILL_GROUPS)) {
    if (!ids.includes(id)) continue;
    d.tk[g] = (d.tk[g] ?? 0) + 1;
    changed = true;
  }
  if (["minecraft:wither", "minecraft:ender_dragon", "minecraft:warden", "minecraft:elder_guardian", "sl:boss_igris", "sl:boss_beru", "sl:boss_tank"].includes(id)) {
    d.tk.boss = (d.tk.boss ?? 0) + 1;
    if (id === "sl:boss_igris") d.tk.igris = (d.tk.igris ?? 0) + 1;
    changed = true;
  }
  if (changed) {
    markDirty(killer);
    checkTitles(killer);
  }
});

/** Called by the dungeon for every hunter inside when a gate is cleared. */
export function onGateCleared(player, { bossId, red, rank, solo }) {
  credit(player, "boss");
  if (bossId === "sl:boss_igris") credit(player, "igris");
  if (red) credit(player, "red");
  if (solo && rank >= 4) credit(player, "solo");
}

// ---------------------------------------------------------------- periodic
let tick = 0;
system.runInterval(() => {
  tick++;
  for (const player of world.getAllPlayers()) {
    const d = getData(player);
    // Shadow Monarch awakening
    if (d.job === JOBS.necromancer.name && d.level >= MONARCH_LEVEL) awaken(player, d);
    if (tick % 5 === 0) checkTitles(player);
    // Healer aura: hunters nearby and the Healer's shadows
    const heal = jobOf(d)?.bonus.healAura ?? 0;
    if (heal > 0) {
      const mend = (e) => {
        const h = e.getComponent("minecraft:health");
        if (h && h.currentValue < h.effectiveMax) {
          h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + heal));
          e.dimension.spawnParticle("minecraft:heart_particle", { ...e.location, y: e.location.y + 2 });
        }
      };
      try {
        for (const p of player.dimension.getPlayers({ location: player.location, maxDistance: 8 })) mend(p);
        for (const [, e] of summonedList(player)) if (e.dimension.id === player.dimension.id) mend(e);
      } catch {}
    }
  }
}, 80);

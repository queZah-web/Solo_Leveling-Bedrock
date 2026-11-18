// Leveling, stat effects, combat bonuses, MP/fatigue ticking and HUD.
import { EntityDamageCause, Player, system, world } from "@minecraft/server";
import {
  agiSpeed, BASE_STAT, CRIT_MULT, critChance, FATIGUE_HEAVY, FATIGUE_PER_HIT,
  FATIGUE_RECOVER_PER_SEC, MAX_LEVEL, maxMp, mpRegenPerSec, POINTS_PER_LEVEL,
  RANKS, rangedMult, STATS, strDamageMult, vitHealthBoost, vitReduction, XP_OVERRIDES, xpToNext,
} from "./config.js";
import { getData, markDirty } from "./data.js";

export const rankOf = (level) => RANKS.find((r) => level >= r.min) ?? RANKS[RANKS.length - 1];

export function getHealth(player) {
  const h = player.getComponent("minecraft:health");
  return { cur: Math.ceil(h?.currentValue ?? 0), max: Math.round(h?.effectiveMax ?? 20) };
}

/** Clamp and fix values (call after any change). */
function sanitize(d) {
  d.mp = Math.max(0, Math.min(maxMp(d.int), d.mp));
  d.fatigue = Math.max(0, Math.min(100, d.fatigue));
}

// ---------------------------------------------------------------- leveling
/** @param {Player} player */
export function addXp(player, amount) {
  const d = getData(player);
  if (amount <= 0 || d.level >= MAX_LEVEL) return;
  d.xp += Math.floor(amount);
  let gained = 0;
  while (d.level < MAX_LEVEL && d.xp >= xpToNext(d.level)) {
    d.xp -= xpToNext(d.level);
    d.level++;
    gained++;
  }
  if (d.level >= MAX_LEVEL) d.xp = 0;
  if (gained > 0) {
    d.points += gained * POINTS_PER_LEVEL;
    onLevelUp(player, d, gained);
  }
  markDirty(player);
}

export function setLevel(player, level) {
  const d = getData(player);
  level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const spent = STATS.reduce((s, st) => s + (d[st.key] - BASE_STAT), 0);
  d.level = level;
  d.xp = 0;
  d.points = Math.max(0, (level - 1) * POINTS_PER_LEVEL - spent);
  markDirty(player);
  applyStatEffects(player, true);
}

function onLevelUp(player, d, gained) {
  d.mp = maxMp(d.int);
  d.fatigue = 0;
  const rank = rankOf(d.level);
  player.onScreenDisplay.setTitle("§bLEVEL UP!", {
    subtitle: `§fLevel §e${d.level} §7| ${rank.color}${rank.name}`,
    fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10,
  });
  player.sendMessage(`§b[System] §fYou have leveled up! §7(+${gained * POINTS_PER_LEVEL} stat points)`);
  player.playSound("random.levelup", { pitch: 0.8 });
  system.runTimeout(() => {
    if (!player.isValid) return;
    applyStatEffects(player, true);
    // Full recovery like in Solo Leveling.
    system.runTimeout(() => {
      if (!player.isValid) return;
      const h = player.getComponent("minecraft:health");
      h?.setCurrentValue(h.effectiveMax);
    }, 2);
  }, 1);
}

/** Spend points on a stat. */
export function allocate(player, key, amount = 1) {
  const d = getData(player);
  amount = Math.min(amount, d.points);
  if (amount <= 0 || !STATS.some((s) => s.key === key)) return false;
  d[key] += amount;
  d.points -= amount;
  sanitize(d);
  markDirty(player);
  applyStatEffects(player, true);
  return true;
}

// ---------------------------------------------------------------- effects
const LONG = 20000000;

function ensureEffect(player, id, amp) {
  const cur = player.getEffect(id);
  if (amp < 0) {
    if (cur && cur.duration > 1000000) player.removeEffect(id);
    return;
  }
  if (cur && cur.amplifier === amp && cur.duration > 1000000) return;
  if (cur) player.removeEffect(id);
  player.addEffect(id, LONG, { amplifier: amp, showParticles: false });
}

/** Apply passive effects from stats. `force` re-checks even if unchanged. */
export function applyStatEffects(player, force = false) {
  if (!player.isValid) return;
  const d = getData(player);
  try {
    ensureEffect(player, "health_boost", vitHealthBoost(d.vit));
    ensureEffect(player, "speed", agiSpeed(d.agi));
    if (d.fatigue >= FATIGUE_HEAVY) {
      if (!player.getEffect("weakness")) player.addEffect("weakness", 60, { amplifier: 0, showParticles: false });
    }
  } catch (e) {
    if (force) console.warn(`[SL] effects: ${e}`);
  }
}

// ---------------------------------------------------------------- combat
const lastCombat = new Map(); // playerId -> tick
const hudHold = new Map(); // playerId -> tick until which the HUD stays quiet

/** Show a short actionbar message without the HUD overwriting it right away. */
export function flash(player, msg, ticks = 40) {
  try {
    player.onScreenDisplay.setActionBar(msg);
    hudHold.set(player.id, system.currentTick + ticks);
  } catch {}
}

world.beforeEvents.entityHurt.subscribe((ev) => {
  const src = ev.damageSource;
  const attacker = src.damagingEntity;
  let dmg = ev.damage;
  if (attacker instanceof Player) {
    const d = getData(attacker);
    if (src.cause === EntityDamageCause.entityAttack) {
      dmg *= strDamageMult(d.str);
      if (Math.random() < critChance(d.per)) {
        dmg *= CRIT_MULT;
        const target = ev.hurtEntity;
        system.run(() => {
          try {
            flash(attacker, "§c§lCRITICAL!", 20);
            target.dimension.spawnParticle("minecraft:critical_hit_emitter", { ...target.location, y: target.location.y + 1 });
          } catch {}
        });
      }
    } else if (src.cause === EntityDamageCause.projectile) {
      dmg *= rangedMult(d.per);
    }
  }
  const victim = ev.hurtEntity;
  if (victim instanceof Player) {
    dmg *= 1 - vitReduction(getData(victim).vit);
  }
  ev.damage = dmg;
});

world.afterEvents.entityHurt.subscribe(({ damageSource, hurtEntity }) => {
  const now = system.currentTick;
  for (const p of [damageSource.damagingEntity, hurtEntity]) {
    if (p instanceof Player) {
      const d = getData(p);
      d.fatigue += FATIGUE_PER_HIT;
      sanitize(d);
      lastCombat.set(p.id, now);
      markDirty(p);
    }
  }
});

// ---------------------------------------------------------------- XP from kills
function xpFor(entity) {
  if (entity.typeId in XP_OVERRIDES) return XP_OVERRIDES[entity.typeId];
  let maxHp = 10;
  try {
    maxHp = entity.getComponent("minecraft:health")?.effectiveMax ?? 10;
  } catch {}
  let hostile = false;
  try {
    hostile = entity.matches({ families: ["monster"] });
  } catch {}
  const base = Math.max(1, Math.round(maxHp * 1.5));
  return hostile ? base : Math.max(1, Math.round(base * 0.25));
}

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (!(killer instanceof Player) || deadEntity.id === killer.id) return;
  const amount = xpFor(deadEntity);
  const d = getData(killer);
  d.kills++;
  markDirty(killer);
  if (amount > 0) {
    addXp(killer, amount);
    flash(killer, `§e+${amount} XP`);
  }
});

// ---------------------------------------------------------------- ticking
let tickCounter = 0;
system.runInterval(() => {
  tickCounter++;
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const d = getData(player);
    // MP regen
    const mmax = maxMp(d.int);
    if (d.mp < mmax) {
      d.mp = Math.min(mmax, d.mp + mpRegenPerSec(d.int));
      markDirty(player);
    }
    // Fatigue recovery when out of combat for 5s
    if (d.fatigue > 0 && now - (lastCombat.get(player.id) ?? 0) > 100) {
      d.fatigue = Math.max(0, d.fatigue - FATIGUE_RECOVER_PER_SEC * (player.isSneaking ? 2 : 1));
      markDirty(player);
    }
    if (tickCounter % 3 === 0) applyStatEffects(player);
    if (d.hud && now >= (hudHold.get(player.id) ?? 0)) showHud(player, d);
  }
}, 20);

function showHud(player, d) {
  const h = getHealth(player);
  const next = xpToNext(d.level);
  const pct = d.level >= MAX_LEVEL ? 100 : Math.floor((d.xp / next) * 100);
  const fat = d.fatigue >= FATIGUE_HEAVY ? "§c" : "§7";
  player.onScreenDisplay.setActionBar(
    `§cHP ${h.cur}/${h.max}  §9MP ${Math.floor(d.mp)}/${maxMp(d.int)}  §eLV ${d.level} §7(${pct}%)  ${fat}FTG ${Math.floor(d.fatigue)}`,
  );
}

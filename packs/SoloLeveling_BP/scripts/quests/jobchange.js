// Job Change Quest. At JOB_LEVEL the System sends the hunter alone into a
// hall in the sky: three waves of knights, then Igris, the Blood-Red
// Commander, rises from his throne. Win, and the System offers a Job.
//
// The hall is built when a trial starts (one per hunter, up to MAX_TRIALS at
// a time) and removed afterwards. Dying fails the trial; the dropped items
// are brought to the hunter when they respawn.
import { Player, system, world } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { JOB_LEVEL, JOBS, PICKABLE } from "../classes.js";
import { getData, markDirty } from "../data.js";
import { addXp, flash } from "../stats.js";
import { applyOps, fillBox, permOf } from "../gates/blocks.js";
import { showForm } from "../ui/form.js";
import { instanceOf } from "../gates/dungeon.js";
import { becomeJob, credit } from "../progression.js";
import { EXTENT, SPAWNS, START, THRONE, trialDesign } from "./trial_arena.js";

const MAX_TRIALS = 3;
const TIME_LIMIT = 15 * 60; // seconds
const RETRY_MIN = 15; // cooldown after a failed trial
/** @type {[string, number][][]} */
const WAVES = [
  [["sl:dg_knight", 4]],
  [["sl:dg_knight", 5], ["sl:dg_mage", 1]],
  [["sl:dg_knight", 6], ["sl:dg_mage", 2]],
];
const BOSS = { id: "sl:boss_igris", name: "Igris, the Blood-Red Commander" };

const ow = () => world.getDimension("overworld");
const originOf = (slot) => ({ x: 70000 + slot * 200, y: 150, z: 70000 });
const areaName = (slot) => `sl_trial${slot}`;
const tagOf = (slot) => `sl_trial${slot}`;
const box = (o) => ({
  from: { x: o.x - EXTENT.x, y: o.y + EXTENT.yLo, z: o.z - EXTENT.z },
  to: { x: o.x + EXTENT.x, y: o.y + EXTENT.yHi, z: o.z + EXTENT.z },
});
const inBox = (o, l) => {
  const b = box(o);
  return l.x >= b.from.x && l.x <= b.to.x + 1 && l.y >= b.from.y && l.y <= b.to.y + 2 && l.z >= b.from.z && l.z <= b.to.z + 1;
};

/**
 * slot -> running trial (memory only: a restart sends the hunter home).
 * @type {Map<number, {playerId:string, stage:"building"|"fight"|"won"|"dead", wave:number, boss:boolean, until:number, wonAt?:number, ready:boolean, deadAt?:number}>}
 */
const trials = new Map();

export const trialOf = (player) => {
  for (const [slot, t] of trials) if (t.playerId === player.id) return { slot, t };
  return undefined;
};

/** Why the hunter can't start the trial now (undefined = can). */
export function trialBlocker(player) {
  const d = getData(player);
  if (d.job && d.job !== "None") return "You already have a Job.";
  if (d.jobPending) return "Choose your Job first.";
  if (d.level < JOB_LEVEL) return `The Job Change Quest unlocks at level ${JOB_LEVEL}.`;
  if (trialOf(player)) return "You are already in the trial.";
  if (d.penalty || instanceOf(player)) return "Finish what you are doing first.";
  const wait = Math.ceil(((d.trialRetry ?? 0) - Date.now()) / 60000);
  if (wait > 0) return `You can try again in ${wait} min.`;
  if (trials.size >= MAX_TRIALS) return "Other hunters are taking the trial. Try again soon.";
  return undefined;
}

// ---------------------------------------------------------------- building
function loaded(o) {
  const b = box(o);
  const dim = ow();
  for (let x = b.from.x; x <= b.to.x + 15; x += 16) for (let z = b.from.z; z <= b.to.z + 15; z += 16) {
    try {
      if (!dim.getBlock({ x: Math.min(x, b.to.x), y: o.y, z: Math.min(z, b.to.z) })) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function* clearJob(slot) {
  const o = originOf(slot);
  const b = box(o);
  const dim = ow();
  try {
    for (const e of dim.getEntities({ location: b.from, volume: { x: b.to.x - b.from.x + 1, y: b.to.y - b.from.y + 1, z: b.to.z - b.from.z + 1 } })) {
      if (!(e instanceof Player)) e.remove();
    }
  } catch {}
  const air = permOf("air");
  for (let x = b.from.x; x <= b.to.x; x += 8) {
    fillBox(dim, x, b.from.y, b.from.z, Math.min(x + 7, b.to.x), b.to.y, b.to.z, air);
    yield;
  }
}

function* buildJob(slot, t) {
  const o = originOf(slot);
  const until = system.currentTick + 400;
  while (!loaded(o) && system.currentTick < until) yield;
  yield* clearJob(slot);
  yield* applyOps(ow(), trialDesign(o), () => !trials.has(slot));
  t.ready = true;
}

function teardown(slot) {
  trials.delete(slot);
  try {
    for (const e of ow().getEntities({ tags: [tagOf(slot)] })) e.remove();
  } catch {}
  system.runJob(
    (function* () {
      yield* clearJob(slot);
      try {
        ow().runCommand(`tickingarea remove ${areaName(slot)}`);
      } catch {}
    })(),
  );
}

// ---------------------------------------------------------------- flow
export function startTrial(player) {
  const err = trialBlocker(player);
  if (err) return err;
  let slot = 0;
  while (trials.has(slot)) slot++;
  /** @type {{playerId:string, stage:"building"|"fight"|"won"|"dead", wave:number, boss:boolean, until:number, wonAt?:number, ready:boolean, deadAt?:number}} */
  const t = { playerId: player.id, stage: "building", wave: 0, boss: false, until: 0, ready: false };
  trials.set(slot, t);
  const d = getData(player);
  d.trial = { slot, ret: { ...player.location, dim: player.dimension.id } };
  markDirty(player);
  const o = originOf(slot);
  const b = box(o);
  try {
    ow().runCommand(`tickingarea add ${b.from.x} ${b.from.y} ${b.from.z} ${b.to.x} ${b.to.y} ${b.to.z} ${areaName(slot)} true`);
  } catch {}
  system.runJob(buildJob(slot, t));
  player.onScreenDisplay.setTitle("§6§lJOB CHANGE QUEST", {
    subtitle: "§7Prove that you are worthy of a Job", fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 10,
  });
  player.sendMessage("§6[System] §fJob Change Quest: §cdefeat the knights of the hall and their commander§f. You must face it alone.");
  player.playSound("mob.endermen.portal", { pitch: 0.5 });
  return undefined;
}

function sendHome(player) {
  const d = getData(player);
  const ret = d.trial?.ret;
  d.trial = null;
  markDirty(player);
  if (ret && player.isValid) {
    try {
      player.teleport(ret, { dimension: world.getDimension(ret.dim) });
    } catch {}
  }
}

/** Gives up (from the QUESTS tab). */
export function abandonTrial(player) {
  const tr = trialOf(player);
  const d = getData(player);
  d.trialRetry = Date.now() + RETRY_MIN * 60000;
  sendHome(player);
  if (tr) teardown(tr.slot);
  player.sendMessage(`§6[System] §7You left the trial. You can try again in ${RETRY_MIN} minutes.`);
}

function buff(e, health, strength, resistance) {
  try {
    if (health >= 0) e.addEffect("health_boost", 20000000, { amplifier: health, showParticles: false });
    if (strength >= 0) e.addEffect("strength", 20000000, { amplifier: strength, showParticles: false });
    if (resistance >= 0) e.addEffect("resistance", 20000000, { amplifier: resistance, showParticles: false });
    system.runTimeout(() => {
      try {
        const h = e.getComponent("minecraft:health");
        h?.setCurrentValue(h.effectiveMax);
      } catch {}
    }, 2);
  } catch {}
}

function spawnWave(player, slot, t) {
  const o = originOf(slot);
  const spots = [...SPAWNS].sort(() => Math.random() - 0.5);
  let k = 0;
  for (const [id, n] of WAVES[t.wave]) {
    for (let i = 0; i < n; i++) {
      const [sx, sz] = spots[k++ % spots.length];
      try {
        const m = ow().spawnEntity(id, { x: o.x + sx + 0.5, y: o.y + 0.1, z: o.z + sz + 0.5 });
        m.addTag(tagOf(slot));
        buff(m, 2 + t.wave, t.wave >= 2 ? 0 : -1, -1);
        ow().spawnParticle("minecraft:soul_particle", { x: o.x + sx + 0.5, y: o.y + 1, z: o.z + sz + 0.5 });
      } catch {}
    }
  }
  t.wave++;
  player.onScreenDisplay.setTitle(" ", { subtitle: `§cWAVE ${t.wave}/${WAVES.length} §7- the knights awaken`, fadeInDuration: 2, stayDuration: 30, fadeOutDuration: 8 });
  player.playSound("mob.irongolem.hit", { pitch: 0.5 });
}

function spawnBoss(player, slot, t) {
  const o = originOf(slot);
  t.boss = true;
  try {
    const b = ow().spawnEntity(BOSS.id, { x: o.x + THRONE.x + 0.5, y: o.y + THRONE.y + 0.1, z: o.z + THRONE.z + 0.5 });
    b.nameTag = `§4${BOSS.name}`;
    b.addTag(tagOf(slot));
    b.addTag("sl_trial_boss");
    buff(b, 9, 1, 1);
  } catch {}
  player.onScreenDisplay.setTitle("§4§lIGRIS", { subtitle: "§cThe Blood-Red Commander rises from his throne", fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
  player.playSound("mob.wither.spawn", { pitch: 0.6 });
}

function win(player, slot, t) {
  t.stage = "won";
  t.wonAt = Date.now();
  const d = getData(player);
  d.jobPending = true;
  markDirty(player);
  credit(player, "igris");
  credit(player, "boss");
  addXp(player, 2500);
  player.onScreenDisplay.setTitle("§6§lQUEST COMPLETE", { subtitle: "§fYou have earned the right to a Job", fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 10 });
  player.playSound("random.levelup", { pitch: 0.6 });
  player.sendMessage("§6[System] §fThe Job Change Quest is complete. §7(Igris's soul lingers... you may try §5ARISE§7 before you leave.)");
  system.runTimeout(() => player.isValid && chooseJob(player), 60);
}

/** The Job picker (also reachable from the QUESTS tab while a choice is pending). */
export async function chooseJob(player) {
  const d = getData(player);
  if (!d.jobPending) return;
  const form = new ActionFormData()
    .title("§6Choose your Job")
    .body("§7The System offers you a Job. §cThis choice is permanent.§r\n§7Each Job also raises some stats.\n ");
  for (const k of PICKABLE) {
    const j = JOBS[k];
    form.button(`${j.color}§l${j.name}§r\n§8${Object.entries(j.stats).map(([s, n]) => `+${n} ${s.toUpperCase()}`).join(" ")}`);
  }
  const res = await showForm(player, form);
  if (!res || res.canceled || res.selection === undefined) {
    player.sendMessage("§6[System] §7You can choose your Job later: §fSystem > QUESTS > JOB CHANGE§7.");
    return;
  }
  const key = PICKABLE[res.selection];
  const j = JOBS[key];
  const ok = await showForm(
    player,
    new MessageFormData()
      .title(`${j.color}${j.name}`)
      .body([...j.desc.map((l) => `§f- ${l}`), "", `§7Stats: §a${Object.entries(j.stats).map(([s, n]) => `+${n} ${s.toUpperCase()}`).join(", ")}`, "", "§cBecome this for good?"].join("\n"))
      .button1("§aYes")
      .button2("Back"),
  );
  if (!ok || ok.canceled || ok.selection !== 0) return chooseJob(player);
  becomeJob(player, key);
  const tr = trialOf(player);
  if (tr && tr.t.stage === "won") {
    // Give a moment to ARISE, then go home.
    player.sendMessage("§6[System] §7The hall will close in 30 seconds.");
    tr.t.wonAt = Date.now() - 60000;
  }
}

// ---------------------------------------------------------------- loop
system.runInterval(() => {
  for (const [slot, t] of [...trials]) {
    const player = world.getEntity(t.playerId);
    const o = originOf(slot);
    if (!(player instanceof Player) || !player.isValid) {
      // left the game (a dead hunter gets 5 minutes to come back for their items)
      if (t.stage !== "dead" || Date.now() - (t.deadAt ?? 0) > 300000) teardown(slot);
      continue;
    }
    if (t.stage === "dead") continue;
    if (t.stage === "building") {
      if (!t.ready) {
        player.teleport({ x: o.x + START.x + 0.5, y: o.y + 30, z: o.z + 0.5 }, { dimension: ow() });
        player.addEffect("slow_falling", 40, { amplifier: 0, showParticles: false });
        flash(player, "§6The trial hall is forming...", 25);
        continue;
      }
      t.stage = "fight";
      t.until = Date.now() + TIME_LIMIT * 1000;
      player.teleport({ x: o.x + START.x + 0.5, y: o.y + 0.1, z: o.z + START.z + 0.5 }, { dimension: ow(), facingLocation: { x: o.x + THRONE.x, y: o.y + 2, z: o.z } });
      system.runTimeout(() => player.isValid && trials.get(slot) === t && spawnWave(player, slot, t), 60);
      continue;
    }
    if (!inBox(o, player.location) || player.dimension.id !== "minecraft:overworld") {
      if (t.stage === "fight") player.teleport({ x: o.x + START.x + 0.5, y: o.y + 0.1, z: o.z + 0.5 }, { dimension: ow() });
    }
    if (t.stage === "won") {
      if (Date.now() - (t.wonAt ?? 0) > 90000) {
        sendHome(player);
        teardown(slot);
      }
      continue;
    }
    const left = Math.ceil((t.until - Date.now()) / 1000);
    if (left <= 0) {
      const d = getData(player);
      d.trialRetry = Date.now() + RETRY_MIN * 60000;
      player.sendMessage(`§c[System] §7Time is up. The trial is failed. Try again in ${RETRY_MIN} minutes.`);
      sendHome(player);
      teardown(slot);
      continue;
    }
    if (t.wave === 0) continue; // first wave on its way
    let alive = [];
    try {
      alive = ow().getEntities({ tags: [tagOf(slot)] });
    } catch {}
    const timer = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    const boss = alive.find((e) => e.hasTag("sl_trial_boss"));
    const h = boss?.getComponent("minecraft:health");
    flash(player, h ? `§4IGRIS §f${Math.ceil(h.currentValue)}/${Math.round(h.effectiveMax)} §8| §6${timer}` : `§6JOB CHANGE §7wave ${t.wave}/${WAVES.length} §8| §c${alive.length} left §8| §6${timer}`, 25);
    if (alive.length > 0) continue;
    if (t.boss) win(player, slot, t);
    else if (t.wave < WAVES.length) spawnWave(player, slot, t);
    else spawnBoss(player, slot, t);
  }
}, 20);

// Dying fails the trial. Items dropped in the hall come back on respawn.
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (!(deadEntity instanceof Player)) return;
  const tr = trialOf(deadEntity);
  if (!tr || tr.t.stage === "won") return;
  tr.t.stage = "dead";
  tr.t.deadAt = Date.now();
  const d = getData(deadEntity);
  d.trialRetry = Date.now() + RETRY_MIN * 60000;
  markDirty(deadEntity);
  try {
    for (const e of ow().getEntities({ tags: [tagOf(tr.slot)] })) e.remove();
  } catch {}
  deadEntity.sendMessage(`§c[System] §7You fell in the trial. Your items will be returned. Try again in ${RETRY_MIN} minutes.`);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  const tr = trialOf(player);
  if (tr && tr.t.stage === "dead") {
    const o = originOf(tr.slot);
    system.runTimeout(() => {
      if (!player.isValid) return;
      const b = box(o);
      try {
        const loose = ow().getEntities({ location: b.from, volume: { x: b.to.x - b.from.x + 1, y: b.to.y - b.from.y + 1, z: b.to.z - b.from.z + 1 } })
          .filter((e) => e.typeId === "minecraft:item" || e.typeId === "minecraft:xp_orb");
        for (const e of loose) e.teleport(player.location, { dimension: player.dimension });
        if (loose.length) player.sendMessage("§6[System] §7Your belongings were returned to you.");
      } catch {}
      getData(player).trial = null;
      markDirty(player);
      teardown(tr.slot);
    }, 20);
    return;
  }
  // Back after a restart while in a trial: the hall is gone, go home.
  if (initialSpawn) {
    system.runTimeout(() => {
      if (player.isValid && getData(player).trial && !trialOf(player)) {
        sendHome(player);
        player.sendMessage("§6[System] §7The trial was interrupted. You can start it again from the QUESTS tab.");
      }
    }, 40);
  }
});

// The hall can't be broken.
const protectedAt = (l) => [...trials.keys()].some((slot) => inBox(originOf(slot), l));
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (trials.size && ev.block.dimension.id === "minecraft:overworld" && protectedAt(ev.block.location)) ev.cancel = true;
});
world.beforeEvents.explosion.subscribe((ev) => {
  if (!trials.size || ev.dimension.id !== "minecraft:overworld") return;
  const blocks = ev.getImpactedBlocks();
  const keep = blocks.filter((b) => !protectedAt(b.location));
  if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
});

// Tell hunters when the quest becomes available.
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const d = getData(p);
    if (d.level >= JOB_LEVEL && (!d.job || d.job === "None") && !d.jobPending && !d.jobNotified) {
      d.jobNotified = true;
      markDirty(p);
      p.onScreenDisplay.setTitle("§6§lNEW QUEST", { subtitle: "§fJob Change Quest is available", fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
      p.sendMessage("§6[System] §fYou qualify for the §6Job Change Quest§f. Open §bSystem > QUESTS > JOB CHANGE §fwhen you are ready.");
      p.playSound("random.levelup", { pitch: 1.4 });
    }
  }
}, 100);

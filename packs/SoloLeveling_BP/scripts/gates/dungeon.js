// Dungeon instances behind gates.
//
// Each running dungeon gets a slot far away in the sky. Its layout (plan.js)
// is a branching jungle-ruins cavern: many rooms, loops, dead ends with
// different rewards and a boss at the farthest end.
//
// Building: room by room, start first. Each room's area is loaded with a
// temporary ticking area, cleared, then built. Hunters go in as soon as the
// start and its neighbours are ready; the rest keeps building ahead of them.
//
// Rooms: entering a monster room seals its doorways and starts waves of
// monsters; clearing the last wave opens them. Dead ends hold treasure
// (guarded by an elite), armories, libraries and healing shrines. The boss
// gate opens once enough of the dungeon is cleared.
import { ItemStack, Player, system, world } from "@minecraft/server";
import { fillBox, permOf, applyOps } from "./blocks.js";
import { bossSpot, CELL, cellBox, designRoom, exitSpot, isCombat, makePlan, sealOf, vaultBarsOf, Y_HI } from "./plan.js";
import { fillChest } from "./loot.js";
import { getData, markDirty } from "../data.js";
import { addXp, flash } from "../stats.js";
import { addGold } from "../economy.js";
import { bonusOf } from "../classes.js";
import { onGateCleared } from "../progression.js";
import { guildGateCleared } from "../social/guild.js";
import { GATE_RANKS, MAX_DUNGEONS, RED_REWARD } from "./ranks.js";

const DUNGEON_GOLD = [60, 150, 350, 800, 1800, 4000];
/** share of the fight rooms that must be cleared before the boss gate opens */
const BOSS_UNLOCK = 0.6;

const base = (slot) => ({ x: 80000 + slot * 600, y: 100, z: 80000 });
const ow = () => world.getDimension("overworld");

/**
 * @typedef {{st:number, wave:number, waves:number, elite:boolean}} RoomState  st: 0 new, 1 fighting, 2 done
 * @typedef {{gateId:string, slot:number, uid:number, rank:number, red:boolean, members:Set<string>,
 *  state:"building"|"ready"|"cleared", plan:import("./plan.js").Plan, rs:RoomState[], built:boolean[], cleared:boolean[],
 *  done:number, need:number, bossOpen:boolean, bossId?:string, clearedAt?:number, startedAt:number,
 *  dead?:boolean, last:Map<string, number>}} Instance
 */
/** @type {Map<string, Instance>} gateId -> instance */
export const instances = new Map();
/** slots still being torn down */
const busySlots = new Set();
const slotsInUse = () => new Set([...[...instances.values()].map((i) => i.slot), ...busySlots]);

const tagAll = (inst) => `sl_dg${inst.slot}`;
const tagRoom = (inst, i) => `sl_dg${inst.slot}_${inst.uid}_r${i}`;
const areaName = (slot) => `sl_dungeon${slot}`;

/** Instance the player is in (by their saved dungeon record). */
export function instanceOf(player) {
  const g = getData(player).dungeon?.gateId;
  const inst = g && instances.get(g);
  return inst && inst.members.has(player.id) ? inst : undefined;
}

/** Area (3x3 cells) around a room: kept loaded while it is built or cleared. */
function areaAround(plan, r) {
  const b = cellBox(plan, r);
  return {
    from: { x: Math.max(plan.from.x, b.from.x - CELL), y: b.from.y, z: Math.max(plan.from.z, b.from.z - CELL) },
    to: { x: Math.min(plan.to.x, b.to.x + CELL), y: b.to.y, z: Math.min(plan.to.z, b.to.z + CELL) },
  };
}
function loaded(box) {
  const dim = ow();
  for (let x = box.from.x; x <= box.to.x + 15; x += 16) {
    for (let z = box.from.z; z <= box.to.z + 15; z += 16) {
      try {
        if (!dim.getBlock({ x: Math.min(x, box.to.x), y: box.from.y + 1, z: Math.min(z, box.to.z) })) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}
/** Generator: holds a ticking area over the box until it is loaded. */
function* loadBox(slot, box) {
  try {
    ow().runCommand(`tickingarea remove ${areaName(slot)}`);
  } catch {}
  try {
    ow().runCommand(`tickingarea add ${box.from.x} ${box.from.y} ${box.from.z} ${box.to.x} ${box.to.y} ${box.to.z} ${areaName(slot)} true`);
  } catch (e) {
    console.warn(`[SL] dungeon ticking area: ${e}`);
  }
  const until = system.currentTick + 400;
  while (!loaded(box) && system.currentTick < until) yield;
}
function dropArea(slot) {
  try {
    ow().runCommand(`tickingarea remove ${areaName(slot)}`);
  } catch {}
}

/** Empties one cell (blocks and leftover entities). */
function* clearCell(plan, r) {
  const { from, to } = cellBox(plan, r);
  const dim = ow();
  try {
    for (const e of dim.getEntities({ location: from, volume: { x: CELL, y: to.y - from.y + 1, z: CELL } })) {
      if (!(e instanceof Player)) e.remove();
    }
  } catch {}
  const air = permOf("air");
  for (let x = from.x; x <= to.x; x += 9) {
    fillBox(dim, x, from.y, from.z, Math.min(x + 8, to.x), to.y, to.z, air);
    yield;
  }
}

function* buildJob(inst) {
  const { plan } = inst;
  const dim = ow();
  const cleared = plan.rooms.map(() => false);
  for (const id of plan.order) {
    if (inst.dead) return;
    const r = plan.rooms[id];
    yield* loadBox(inst.slot, areaAround(plan, r));
    for (const n of [id, ...r.doors.map((d) => d.to)]) {
      if (cleared[n]) continue;
      cleared[n] = true;
      yield* clearCell(plan, plan.rooms[n]);
    }
    const { ops, chests } = designRoom(plan, r);
    yield* applyOps(dim, ops, () => !!inst.dead);
    if (inst.dead) return;
    for (const c of chests) {
      try {
        const block = dim.getBlock(c);
        block?.setType("minecraft:chest");
        fillChest(dim.getBlock(c), inst.rank, c.kind);
      } catch {}
      yield;
    }
    inst.built[id] = true;
    if (id === 0) spawnExit(inst, exitSpot(r), inst.red);
    // Ready once the start and every room next to it stand.
    if (inst.state === "building" && plan.rooms[0].doors.every((d) => inst.built[d.to])) inst.state = "ready";
  }
  inst.state = inst.state === "building" ? "ready" : inst.state;
  dropArea(inst.slot);
}

/** Exit portal (hidden in red gates until the boss falls). */
function spawnExit(inst, at, hidden) {
  if (hidden) return;
  try {
    const e = ow().spawnEntity("sl:gate", { x: at.x, y: at.y, z: at.z });
    e.triggerEvent("sl:small"); // fits inside a room
    e.nameTag = "§b[ EXIT ]";
    e.addTag("sl_exit");
    e.addTag(tagAll(inst));
  } catch {}
}

// ---------------------------------------------------------------- enter / leave
/**
 * Creates (if needed) the instance of a gate and sends the hunter in.
 * @returns {string|undefined} error
 */
export function enterDungeon(player, gate) {
  let inst = instances.get(gate.id);
  if (!inst) {
    const used = slotsInUse();
    let slot = -1;
    for (let s = 0; s < MAX_DUNGEONS; s++) {
      if (!used.has(s)) {
        slot = s;
        break;
      }
    }
    if (slot < 0) return "All dungeon spaces are busy. Try again soon.";
    const seed = (Math.random() * 2 ** 31) | 0;
    const plan = makePlan(seed, gate.rank, base(slot));
    const fights = plan.rooms.filter((r) => isCombat(r.kind) || ["treasure", "armory", "library"].includes(r.kind)).length;
    inst = {
      gateId: gate.id, slot, uid: seed & 0xffff, rank: gate.rank, red: gate.red, members: new Set(), state: "building",
      plan, rs: plan.rooms.map((r) => ({ st: r.kind === "start" ? 2 : 0, wave: 0, waves: 0, elite: false })),
      built: plan.rooms.map(() => false), cleared: plan.rooms.map(() => false),
      done: 0, need: Math.max(1, Math.ceil(fights * BOSS_UNLOCK)), bossOpen: false, startedAt: Date.now(), last: new Map(),
    };
    instances.set(gate.id, inst);
    system.runJob(buildJob(inst));
  } else if (inst.state === "cleared") {
    return "This dungeon has already been cleared.";
  }
  const d = getData(player);
  d.dungeon = { gateId: gate.id, ret: { ...player.location, dim: player.dimension.id } };
  markDirty(player);
  inst.members.add(player.id);
  const r = GATE_RANKS[inst.rank];
  player.onScreenDisplay.setTitle(`${r.color}${r.rank}-RANK GATE`, {
    subtitle: inst.red ? "§c§lRED GATE §r§7- there is no way back" : "§7Entering the dungeon...",
    fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10,
  });
  player.playSound("mob.endermen.portal", { pitch: 0.6 });
  holdOrPlace(player, inst);
  return undefined;
}

const startRoom = (inst) => inst.plan.rooms[0];
const holdSpot = (inst) => {
  const c = startRoom(inst);
  return { x: c.cx + 0.5, y: inst.plan.base.y + Y_HI + 4, z: c.cz + 0.5 };
};
const centerOf = (r) => ({ x: r.cx + 0.5, y: r.cy + 0.1, z: r.cz + 0.5 });
const startSpot = (inst) => centerOf(startRoom(inst));

function holdOrPlace(player, inst) {
  if (inst.state === "building") {
    player.teleport(holdSpot(inst), { dimension: ow() });
    player.addEffect("slow_falling", 40, { amplifier: 0, showParticles: false });
    const total = inst.plan.rooms.length;
    const n = inst.built.filter(Boolean).length;
    flash(player, `§bThe dungeon is forming... §7${n}/${total}`, 25);
  } else {
    player.teleport(startSpot(inst), { dimension: ow() });
  }
}

/** Sends the hunter back to where they entered the gate. */
export function leaveDungeon(player, reason) {
  const d = getData(player);
  const rec = d.dungeon;
  d.dungeon = null;
  markDirty(player);
  const inst = rec && instances.get(rec.gateId);
  if (inst) inst.members.delete(player.id);
  if (rec?.ret && player.isValid) {
    try {
      player.teleport(rec.ret, { dimension: world.getDimension(rec.ret.dim) });
    } catch {}
  }
  if (reason) player.sendMessage(reason);
  if (inst && inst.members.size === 0) teardown(inst);
}

/** Removes an instance: monsters now, blocks room by room in the background. */
function teardown(inst) {
  instances.delete(inst.gateId);
  inst.dead = true;
  busySlots.add(inst.slot);
  try {
    for (const e of ow().getEntities({ tags: [tagAll(inst)] })) e.remove();
  } catch {}
  const { plan } = inst;
  system.runJob(
    (function* () {
      for (const id of plan.order) {
        if (!inst.built[id]) continue;
        const r = plan.rooms[id];
        yield* loadBox(inst.slot, areaAround(plan, r));
        yield* clearCell(plan, r);
        for (const d of r.doors) yield* clearCell(plan, plan.rooms[d.to]);
      }
      dropArea(inst.slot);
      busySlots.delete(inst.slot);
    })(),
  );
  onTeardown?.(inst);
}

/** Set by gates.js: called when an instance is removed (cleared gates close). */
let onTeardown;
export const setTeardownHandler = (fn) => (onTeardown = fn);

// ---------------------------------------------------------------- monsters
const LONG = 20000000;

function buff(e, healthAmp, strength, resistance) {
  try {
    if (healthAmp >= 0) e.addEffect("health_boost", LONG, { amplifier: healthAmp, showParticles: false });
    if (strength >= 0) e.addEffect("strength", LONG, { amplifier: strength, showParticles: false });
    if (resistance >= 0) e.addEffect("resistance", LONG, { amplifier: resistance, showParticles: false });
    system.runTimeout(() => {
      try {
        const h = e.getComponent("minecraft:health");
        h?.setCurrentValue(h.effectiveMax);
      } catch {}
    }, 2);
  } catch {}
}

const WALK_THROUGH = /:(air|short_grass|tallgrass|tall_grass|fern|.*flower|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|dandelion|moss_carpet|cave_vines.*|azalea|flowering_azalea)$/;
/** A random spot a monster can stand on inside a room. */
function spawnSpot(r) {
  const dim = ow();
  for (let i = 0; i < 25; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 2 + Math.random() * (r.R * 0.75);
    const x = Math.floor(r.cx + Math.cos(a) * d);
    const z = Math.floor(r.cz + Math.sin(a) * d);
    for (let y = r.cy + 3; y >= r.cy - 7; y--) {
      try {
        const b = dim.getBlock({ x, y, z });
        if (!b || !WALK_THROUGH.test(b.typeId)) continue;
        const up = b.above();
        const below = b.below();
        if (!up || !WALK_THROUGH.test(up.typeId) || !below || below.isAir || below.isLiquid || WALK_THROUGH.test(below.typeId)) continue;
        if (/leaves|fence|bars|lava/.test(below.typeId)) break;
        return { x: x + 0.5, y: y + 0.05, z: z + 0.5 };
      } catch {
        break;
      }
    }
  }
  return undefined;
}

const prettyMob = (id) => id.replace(/^sl:(dg_)?/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function spawnWave(inst, i) {
  const gr = GATE_RANKS[inst.rank];
  const r = inst.plan.rooms[i];
  const s = inst.rs[i];
  s.wave++;
  const count = Math.min(12, 3 + inst.rank + (inst.members.size - 1) * 2) + (s.wave - 1);
  for (let k = 0; k < count; k++) {
    const pos = spawnSpot(r);
    if (!pos) continue;
    try {
      const m = ow().spawnEntity(gr.mobs[Math.floor(Math.random() * gr.mobs.length)], pos);
      m.addTag(tagAll(inst));
      m.addTag(tagRoom(inst, i));
      buff(m, inst.rank * 2 - 1, Math.floor(inst.rank / 2) - 1, Math.floor(inst.rank / 3) - 1);
      ow().spawnParticle("minecraft:soul_particle", { x: pos.x, y: pos.y + 0.5, z: pos.z });
    } catch {}
  }
  if (s.elite && s.wave === s.waves) {
    const pos = spawnSpot(r);
    if (pos) {
      try {
        const id = gr.mobs[Math.floor(Math.random() * gr.mobs.length)];
        const m = ow().spawnEntity(id, pos);
        m.nameTag = `§6[Elite] ${prettyMob(id)}`;
        m.addTag(tagAll(inst));
        m.addTag(tagRoom(inst, i));
        buff(m, 3 + inst.rank * 3, Math.floor(inst.rank / 2), Math.min(2, Math.floor(inst.rank / 2)));
      } catch {}
    }
  }
  forMembersNear(inst, r, (p) =>
    p.onScreenDisplay.setTitle(" ", {
      subtitle: s.waves > 1 ? `§cWAVE ${s.wave}/${s.waves}${s.elite && s.wave === s.waves ? " §6- ELITE" : ""}` : "§cAMBUSH!",
      fadeInDuration: 2, stayDuration: 25, fadeOutDuration: 6,
    }),
  );
}

function spawnBoss(inst, i) {
  const gr = GATE_RANKS[inst.rank];
  const r = inst.plan.rooms[i];
  const at = bossSpot(r);
  try {
    const b = ow().spawnEntity(gr.boss.id, at);
    b.nameTag = `§c[BOSS] ${gr.boss.name}`;
    b.addTag(tagAll(inst));
    b.addTag(tagRoom(inst, i));
    b.addTag("sl_boss");
    b.addTag(`sl_rank_${inst.rank}`);
    buff(b, 4 + inst.rank * 4, inst.rank, Math.min(3, Math.floor(inst.rank / 2) + 1));
    inst.bossId = b.id;
    ow().playSound("mob.wither.spawn", at, { volume: 1, pitch: 0.7 });
  } catch {}
  forMembers(inst, (p) =>
    p.onScreenDisplay.setTitle("§c§lBOSS", { subtitle: `§c${gr.boss.name}`, fadeInDuration: 3, stayDuration: 40, fadeOutDuration: 8 }),
  );
}

// ---------------------------------------------------------------- rooms
function setSeals(inst, i, block) {
  const r = inst.plan.rooms[i];
  const dim = ow();
  for (const d of r.doors) {
    for (const p of sealOf(r, d)) {
      try {
        dim.getBlock(p)?.setType(block);
      } catch {}
    }
  }
}

function forMembers(inst, fn) {
  for (const p of world.getAllPlayers()) if (inst.members.has(p.id)) fn(p);
}
function forMembersNear(inst, r, fn) {
  forMembers(inst, (p) => {
    if (Math.hypot(p.location.x - r.cx, p.location.z - r.cz) < r.R + 24) fn(p);
  });
}

const FIGHT_ENDS = ["treasure", "armory", "library"];

/** A hunter stepped into room i for the first time. */
function enterRoom(inst, i, player) {
  const r = inst.plan.rooms[i];
  const s = inst.rs[i];
  if (r.kind === "boss") {
    if (!inst.bossOpen) return;
    s.st = 1;
    setSeals(inst, i, "minecraft:iron_bars");
    spawnBoss(inst, i);
    s.waves = inst.rank >= 2 ? 1 : 0; // guards
    if (s.waves) spawnWave(inst, i);
    return;
  }
  if (r.kind === "shrine") {
    s.st = 2;
    markCleared(inst, i, false);
    forMembersNear(inst, r, (p) => {
      try {
        const h = p.getComponent("minecraft:health");
        h?.setCurrentValue(h.effectiveMax);
        p.addEffect("regeneration", 600, { amplifier: 1 });
        p.addEffect("absorption", 1200, { amplifier: 1 });
      } catch {}
      p.onScreenDisplay.setTitle("§b§lSHRINE", { subtitle: "§7The spring restores your strength", fadeInDuration: 3, stayDuration: 40, fadeOutDuration: 8 });
      p.playSound("beacon.activate", { pitch: 1.2 });
    });
    return;
  }
  s.st = 1;
  s.waves = FIGHT_ENDS.includes(r.kind) ? 1 + (inst.rank >= 3 ? 1 : 0) : 2 + (inst.rank >= 3 ? 1 : 0);
  s.elite = FIGHT_ENDS.includes(r.kind) || i % 3 === 0;
  setSeals(inst, i, "minecraft:iron_bars");
  ow().playSound("random.door_close", { x: r.cx, y: r.cy, z: r.cz }, { volume: 1, pitch: 0.5 });
  spawnWave(inst, i);
  void player;
}

function markCleared(inst, i, fight) {
  if (inst.cleared[i]) return;
  inst.cleared[i] = true;
  if (!fight) return;
  inst.done++;
  const gr = GATE_RANKS[inst.rank];
  const r = inst.plan.rooms[i];
  forMembers(inst, (p) => {
    addXp(p, Math.floor(gr.xp * 0.03));
    flash(p, `§aRoom cleared! §7(${inst.done}/${inst.need} for the boss gate)`, 60);
    p.playSound("random.door_open", { pitch: 0.6 });
  });
  if (!inst.bossOpen && inst.done >= inst.need) {
    inst.bossOpen = true;
    const b = inst.plan.rooms[inst.plan.boss];
    setSeals(inst, inst.plan.boss, "minecraft:air");
    forMembers(inst, (p) => {
      p.onScreenDisplay.setTitle("§c§lTHE BOSS GATE IS OPEN", { subtitle: `§7${gr.boss.name} awaits in the deepest hall`, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
      p.playSound("mob.wither.ambient", { volume: 0.6, pitch: 0.5 });
    });
    void b;
  }
  void r;
}

function clearDungeon(inst) {
  inst.state = "cleared";
  inst.clearedAt = Date.now();
  const r = GATE_RANKS[inst.rank];
  const mult = inst.red ? RED_REWARD : 1;
  const solo = inst.members.size === 1;
  forMembers(inst, (p) => {
    const d = getData(p);
    d.gatesCleared = (d.gatesCleared ?? 0) + 1;
    markDirty(p);
    const pm = mult * bonusOf(d).dungeonReward;
    addXp(p, Math.floor(r.xp * pm));
    addGold(p, Math.floor(DUNGEON_GOLD[inst.rank] * pm), "dungeon cleared");
    onGateCleared(p, { bossId: r.boss.id, red: inst.red, rank: inst.rank, solo });
    guildGateCleared(p, inst.rank);
    const inv = p.getComponent("minecraft:inventory").container;
    const got = [];
    for (const [id, min, max] of r.loot) {
      const n = Math.max(1, Math.floor((min + Math.random() * (max - min + 1)) * mult));
      try {
        const left = inv.addItem(new ItemStack(id, n));
        if (left) p.dimension.spawnItem(left, p.location);
        got.push(`${n}x ${id.replace("minecraft:", "").replace(/_/g, " ")}`);
      } catch {}
    }
    p.onScreenDisplay.setTitle("§b§lDUNGEON CLEARED", {
      subtitle: `§e+${Math.floor(r.xp * pm)} XP`, fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 10,
    });
    p.sendMessage(`§b[System] §fRewards: §e${got.join(", ")}`);
    p.sendMessage("§b[System] §7The gate will close in 3 minutes. Loot the vaults, then use the §bEXIT §7gate or the QUESTS tab.");
    p.sendMessage("§6[System] §fThe treasure vaults beside the throne are open!");
    p.playSound("random.levelup", { pitch: 0.8 });
  });
  const boss = inst.plan.rooms[inst.plan.boss];
  setSeals(inst, inst.plan.boss, "minecraft:air");
  for (const p of vaultBarsOf(boss)) {
    try {
      ow().getBlock(p)?.setType("minecraft:air");
    } catch {}
  }
  spawnExit(inst, centerOf(boss), false);
}

/** Room the location is in (only rooms already built). */
function roomAt(inst, l) {
  for (const r of inst.plan.rooms) {
    if (!inst.built[r.id]) continue;
    const dx = l.x - (r.cx + 0.5);
    const dz = l.z - (r.cz + 0.5);
    const R = r.R - 1.5;
    if (dx * dx + dz * dz <= R * R && l.y >= r.cy - 8 && l.y <= r.cy + r.H) return r.id;
  }
  return -1;
}
/** Room whose cell holds the location (built or not). */
function cellAt(inst, l) {
  const { plan } = inst;
  const gx = Math.floor((l.x - plan.base.x) / CELL);
  const gz = Math.floor((l.z - plan.base.z) / CELL);
  return plan.rooms.find((r) => r.gx === gx && r.gz === gz);
}
const inDungeon = (inst, l) => {
  const { from, to } = inst.plan;
  return l.x >= from.x && l.x <= to.x + 1 && l.z >= from.z && l.z <= to.z + 1 && l.y >= from.y - 1 && l.y <= to.y + 8;
};

/** playerId -> uid of the instance they were placed in */
const placed = new Map();

system.runInterval(() => {
  for (const inst of [...instances.values()]) {
    // Hunters who are offline count as gone.
    const online = world.getAllPlayers().filter((p) => inst.members.has(p.id));
    for (const id of [...inst.members]) if (!online.some((p) => p.id === id)) inst.members.delete(id);
    if (inst.members.size === 0) {
      teardown(inst);
      continue;
    }
    for (const p of online) {
      if (inst.state === "building") {
        holdOrPlace(p, inst);
        continue;
      }
      // First tick after the dungeon is ready: put held hunters on the floor.
      if (placed.get(p.id) !== inst.uid) {
        placed.set(p.id, inst.uid);
        p.teleport(startSpot(inst), { dimension: ow() });
        p.sendMessage("§b[System] §fFind your way through the ruins. Clear rooms to open the §cboss gate§f; dead ends hide treasure.");
        continue;
      }
      // Pulled back if they somehow got out, or ran ahead of the builder.
      if (p.dimension.id !== "minecraft:overworld" || !inDungeon(inst, p.location)) {
        p.teleport(startSpot(inst), { dimension: ow() });
        continue;
      }
      const cell = cellAt(inst, p.location);
      if (cell && !inst.built[cell.id]) {
        const back = inst.plan.rooms[inst.last.get(p.id) ?? 0];
        p.teleport(centerOf(back), { dimension: ow() });
        flash(p, "§7The path ahead is still forming...", 40);
        continue;
      }
      if (inst.state === "cleared") continue;
      const i = roomAt(inst, p.location);
      if (i < 0) continue;
      inst.last.set(p.id, i);
      if (inst.rs[i].st === 0) enterRoom(inst, i, p);
      else if (inst.plan.rooms[i].kind === "boss" && !inst.bossOpen) flash(p, `§cThe boss gate is sealed §7(${inst.done}/${inst.need} rooms)`, 40);
    }
    if (inst.state !== "ready") {
      if (inst.state === "cleared" && Date.now() - (inst.clearedAt ?? 0) > 180000) {
        for (const p of online) leaveDungeon(p, "§b[System] §7The gate has closed.");
      }
      continue;
    }
    // Fights in progress
    inst.rs.forEach((s, i) => {
      if (s.st !== 1) return;
      const r = inst.plan.rooms[i];
      // only judge a room while a hunter is close (its chunks are loaded)
      if (!online.some((p) => Math.hypot(p.location.x - r.cx, p.location.z - r.cz) < r.R + 30)) return;
      const alive = ow().getEntities({ tags: [tagRoom(inst, i)] }).filter((e) => e.isValid);
      const boss = r.kind === "boss";
      if (boss && inst.bossId) {
        const b = world.getEntity(inst.bossId);
        const h = b?.getComponent("minecraft:health");
        if (h) forMembersNear(inst, r, (p) => flash(p, `§c[BOSS] ${GATE_RANKS[inst.rank].boss.name} §f${Math.ceil(h.currentValue)}/${Math.round(h.effectiveMax)}`, 25));
      }
      if (s.wave < s.waves && alive.length <= 1) {
        spawnWave(inst, i);
        return;
      }
      if (alive.length > 0) return;
      s.st = 2;
      if (boss) {
        clearDungeon(inst);
        return;
      }
      setSeals(inst, i, "minecraft:air");
      markCleared(inst, i, true);
      if (FIGHT_ENDS.includes(r.kind)) forMembersNear(inst, r, (p) => flash(p, "§6The guardians fell. §fThe treasure is yours!", 60));
    });
  }
}, 20);

// Dying in a dungeon throws the hunter out.
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (!(deadEntity instanceof Player)) return;
  const d = getData(deadEntity);
  if (!d.dungeon) return;
  const inst = instances.get(d.dungeon.gateId);
  if (inst) inst.members.delete(deadEntity.id);
  d.dungeon = null;
  markDirty(deadEntity);
  deadEntity.sendMessage("§c[System] §7You fell in the dungeon.");
  if (inst && inst.members.size === 0) teardown(inst);
});

// Back from a restart / disconnect with no running instance: return home.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    if (!player.isValid) return;
    const d = getData(player);
    if (!d.dungeon) return;
    const inst = instances.get(d.dungeon.gateId);
    if (inst && inst.state !== "cleared") {
      inst.members.add(player.id);
      holdOrPlace(player, inst);
    } else leaveDungeon(player, "§b[System] §7The dungeon you were in has closed.");
  }, 40);
});

// Dungeons can't be broken (chests can still be opened).
const protectedAt = (loc, dimId) =>
  dimId === "minecraft:overworld" && [...instances.values()].some((inst) => inDungeon(inst, loc));
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (protectedAt(ev.block.location, ev.block.dimension.id)) ev.cancel = true;
});
world.beforeEvents.explosion.subscribe((ev) => {
  if (ev.dimension.id !== "minecraft:overworld" || instances.size === 0) return;
  const blocks = ev.getImpactedBlocks();
  const keep = blocks.filter((b) => !protectedAt(b.location, "minecraft:overworld"));
  if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
});

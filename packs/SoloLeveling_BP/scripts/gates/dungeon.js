// Dungeon instances behind gates.
//
// Each running dungeon gets a slot far away in the sky. It is built when the
// first hunter enters (players are held in place until it's ready) and torn
// down when the last hunter leaves.
//
// Layout (along +x): start room, N monster rooms, boss room. Every room is
// 15x15 inside, rooms are joined by corridors. The exit of a room is sealed
// with barriers until its monsters are dead.
import { BlockPermutation, BlockVolume, ItemStack, Player, system, world } from "@minecraft/server";
import { boundsOf, design, doorsOf, fallenZ, hallHalf, layout, vaultBars } from "./architecture.js";
import { fillChest } from "./loot.js";
import { getData, markDirty } from "../data.js";
import { addXp, flash } from "../stats.js";
import { addGold } from "../economy.js";

const DUNGEON_GOLD = [60, 150, 350, 800, 1800, 4000];
import { GATE_RANKS, MAX_DUNGEONS, RED_REWARD } from "./ranks.js";

const base = (slot) => ({ x: 80000 + slot * 600, y: 100, z: 80000 });
const ow = () => world.getDimension("overworld");

/**
 * @typedef {{gateId:string, slot:number, rank:number, red:boolean, members:Set<string>,
 *  state:"building"|"ready"|"cleared", next:number, fighting:number, bossId?:string, clearedAt?:number,
 *  rooms:number, startedAt:number, n:number}} Instance
 */
/** @type {Map<string, Instance>} gateId -> instance */
export const instances = new Map();
const slotsInUse = () => new Set([...instances.values()].map((i) => i.slot));

export const roomCount = (inst) => GATE_RANKS[inst.rank].rooms + 2; // start + monsters + boss
const roomCenter = (inst, i) => layout(base(inst.slot), inst.n).halls[i];
const tagAll = (inst) => `sl_dg${inst.slot}`;
const tagRoom = (inst, i) => `sl_dg${inst.slot}_r${i}`;
const areaName = (inst) => `sl_dungeon${inst.slot}`;

/** Instance the player is in (by their saved dungeon record). */
export function instanceOf(player) {
  const g = getData(player).dungeon?.gateId;
  const inst = g && instances.get(g);
  return inst && inst.members.has(player.id) ? inst : undefined;
}

// ---------------------------------------------------------------- building
const bounds = (inst) => boundsOf(base(inst.slot), inst.n);

function* clearJob(inst, done) {
  const { from, to } = bounds(inst);
  for (let x = from.x; x <= to.x; x += 20) {
    try {
      ow().fillBlocks(new BlockVolume({ x, y: from.y, z: from.z }, { x: Math.min(x + 19, to.x), y: to.y, z: to.z }), "minecraft:air");
    } catch (e) {
      console.warn(`[SL] dungeon clear: ${e}`);
    }
    yield;
  }
  done?.();
}

function* buildJob(inst, resolve) {
  let cleared = false;
  const gen = clearJob(inst, () => (cleared = true));
  while (!cleared) {
    gen.next();
    yield;
  }
  let n = 0;
  const dim = ow();
  const chests = [];
  const perms = new Map();
  for (const [x, y, z, b] of design(inst, base(inst.slot), chests)) {
    try {
      const block = dim.getBlock({ x, y, z });
      if (typeof b === "string") block?.setType(b);
      else {
        const key = b.id + JSON.stringify(b.states);
        if (!perms.has(key)) perms.set(key, BlockPermutation.resolve(b.id, b.states));
        block?.setPermutation(perms.get(key));
      }
    } catch {}
    if (++n % 300 === 0) yield;
  }
  // Loot chests (treasure rooms and the boss vault)
  for (const c of chests) {
    try {
      const block = dim.getBlock(c);
      block?.setType("minecraft:chest");
      fillChest(dim.getBlock(c), inst.rank, c.kind);
    } catch {}
    yield;
  }
  inst.state = "ready";
  spawnExit(inst, roomCenter(inst, 0), inst.red);
  resolve();
}

function areaLoaded(inst) {
  const { from, to } = bounds(inst);
  const dim = ow();
  for (let x = from.x; x <= to.x; x += 16) {
    for (const z of [from.z, to.z]) {
      try {
        if (!dim.getBlock({ x, y: from.y + 2, z })) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

/** Exit portal in a room (hidden in red gates until the boss falls). */
function spawnExit(inst, center, hidden) {
  if (hidden) return;
  try {
    const e = ow().spawnEntity("sl:gate", { x: center.x - 7 + 0.5, y: center.y, z: center.z + 0.5 });
    e.triggerEvent("sl:small"); // fits inside a room
    e.nameTag = "§b[ EXIT ]";
    e.addTag("sl_exit");
    e.addTag(tagAll(inst));
    e.setRotation({ x: 0, y: 90 });
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
    inst = {
      n: GATE_RANKS[gate.rank].rooms + 2,
      gateId: gate.id, slot, rank: gate.rank, red: gate.red, members: new Set(), state: "building",
      next: 1, fighting: -1, rooms: GATE_RANKS[gate.rank].rooms, startedAt: Date.now(),
    };
    instances.set(gate.id, inst);
    const { from, to } = bounds(inst);
    try {
      ow().runCommand(`tickingarea add ${from.x} ${from.y} ${from.z} ${to.x} ${to.y} ${to.z} ${areaName(inst)} true`);
    } catch {}
    const it = inst;
    const wait = system.runInterval(() => {
      if (!areaLoaded(it)) return;
      system.clearRun(wait);
      system.runJob(buildJob(it, () => {}));
    }, 5);
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

const holdSpot = (inst) => {
  const c = roomCenter(inst, 0);
  return { x: c.x + 0.5, y: c.y + 3, z: c.z + 0.5 };
};
const startSpot = (inst) => {
  const c = roomCenter(inst, 0);
  return { x: c.x + 0.5, y: c.y + 0.1, z: c.z + 0.5 };
};

function holdOrPlace(player, inst) {
  if (inst.state === "building") {
    player.teleport(holdSpot(inst), { dimension: ow() });
    player.addEffect("slow_falling", 40, { amplifier: 0, showParticles: false });
    flash(player, "§bThe dungeon is forming...", 25);
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

/** Removes an instance (blocks, monsters, ticking area). */
function teardown(inst) {
  instances.delete(inst.gateId);
  try {
    for (const e of ow().getEntities({ tags: [tagAll(inst)] })) e.remove();
  } catch {}
  system.runJob(clearJob(inst, () => {
    try {
      ow().runCommand(`tickingarea remove ${areaName(inst)}`);
    } catch {}
  }));
  onTeardown?.(inst);
}

/** Set by gates.js: called when an instance is removed (cleared gates close). */
let onTeardown;
export const setTeardownHandler = (fn) => (onTeardown = fn);

// ---------------------------------------------------------------- rooms & monsters
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

function spawnRoom(inst, i) {
  const r = GATE_RANKS[inst.rank];
  const c = roomCenter(inst, i);
  const boss = i === roomCount(inst) - 1;
  const count = Math.min(14, 3 + inst.rank + (inst.members.size - 1) * 2) - (boss ? 2 : 0);
  for (let k = 0; k < count; k++) {
    let px = Math.random() * 16 - 8;
    let pz = Math.random() * 16 - 8;
    if (Math.abs(Math.abs(px) - 6) < 1.2 && Math.abs(Math.abs(pz) - 6) < 1.2) px *= 0.6; // not inside a pillar
    if (!boss && fallenZ(i) && Math.abs(pz - fallenZ(i)) < 2.2 && px > -7 && px < 4) pz -= Math.sign(fallenZ(i)) * 3; // not in the fallen column
    const pos = { x: c.x + 0.5 + px, y: c.y + 0.1, z: c.z + 0.5 + pz };
    try {
      const m = ow().spawnEntity(r.mobs[Math.floor(Math.random() * r.mobs.length)], pos);
      m.addTag(tagAll(inst));
      m.addTag(tagRoom(inst, i));
      buff(m, inst.rank * 2 - 1, Math.floor(inst.rank / 2) - 1, Math.floor(inst.rank / 3) - 1);
    } catch {}
  }
  if (boss) {
    try {
      const b = ow().spawnEntity(r.boss.id, { x: c.x + 5.5, y: c.y + 0.1, z: c.z + 0.5 });
      b.nameTag = `§c[BOSS] ${r.boss.name}`;
      b.addTag(tagAll(inst));
      b.addTag(tagRoom(inst, i));
      b.addTag("sl_boss");
      b.addTag(`sl_rank_${inst.rank}`);
      buff(b, 4 + inst.rank * 4, inst.rank, Math.min(3, Math.floor(inst.rank / 2) + 1));
      inst.bossId = b.id;
      ow().playSound("mob.wither.spawn", c, { volume: 1, pitch: 0.7 });
    } catch {}
  }
  inst.fighting = i;
  forMembers(inst, (p) =>
    p.onScreenDisplay.setTitle(boss ? "§c§lBOSS" : `§fROOM ${i}`, {
      subtitle: boss ? `§c${r.boss.name}` : "§7Defeat every monster",
      fadeInDuration: 3, stayDuration: 30, fadeOutDuration: 8,
    }),
  );
}

function openDoor(inst, i) {
  const dim = ow();
  for (const p of doorsOf(inst, base(inst.slot), i)) {
    try {
      dim.getBlock(p)?.setType("minecraft:air");
    } catch {}
  }
}

function forMembers(inst, fn) {
  for (const p of world.getAllPlayers()) if (inst.members.has(p.id)) fn(p);
}

function clearDungeon(inst) {
  inst.state = "cleared";
  inst.clearedAt = Date.now();
  const r = GATE_RANKS[inst.rank];
  const mult = inst.red ? RED_REWARD : 1;
  forMembers(inst, (p) => {
    const d = getData(p);
    d.gatesCleared = (d.gatesCleared ?? 0) + 1;
    markDirty(p);
    addXp(p, Math.floor(r.xp * mult));
    addGold(p, Math.floor(DUNGEON_GOLD[inst.rank] * mult), "dungeon cleared");
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
      subtitle: `§e+${Math.floor(r.xp * mult)} XP`, fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 10,
    });
    p.sendMessage(`§b[System] §fRewards: §e${got.join(", ")}`);
    p.sendMessage("§b[System] §7The gate will close in 60 seconds. Use the §bEXIT §7gate or the QUESTS tab to leave.");
    p.playSound("random.levelup", { pitch: 0.8 });
  });
  // Open the boss vault and the exit.
  for (const p of vaultBars(inst, base(inst.slot))) {
    try {
      ow().getBlock(p)?.setType("minecraft:air");
    } catch {}
  }
  forMembers(inst, (p) => p.sendMessage("§6[System] §fThe treasure vault beside the throne is open!"));
  spawnExit(inst, roomCenter(inst, roomCount(inst) - 1), false);
}

const inRoom = (inst, i, l) => {
  const c = roomCenter(inst, i);
  const R = hallHalf(inst, i);
  return Math.abs(l.x - (c.x + 0.5)) <= R + 0.5 && Math.abs(l.z - (c.z + 0.5)) <= R + 0.5 && Math.abs(l.y - c.y) < 8;
};
const inDungeon = (inst, l) => {
  const { from, to } = bounds(inst);
  return l.x >= from.x && l.x <= to.x + 1 && l.z >= from.z && l.z <= to.z + 1 && l.y >= from.y - 1 && l.y <= to.y + 2;
};

/** playerId -> startedAt of the instance they were placed in */
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
      // Pulled back if they somehow got out.
      if (p.dimension.id !== "minecraft:overworld" || !inDungeon(inst, p.location)) p.teleport(startSpot(inst), { dimension: ow() });
      // First tick after the dungeon is ready: put held hunters on the floor.
      if (placed.get(p.id) !== inst.startedAt) {
        placed.set(p.id, inst.startedAt);
        p.teleport(startSpot(inst), { dimension: ow() });
      }
    }
    if (inst.state === "building") continue;
    if (inst.state === "cleared") {
      if (Date.now() - (inst.clearedAt ?? 0) > 60000) {
        for (const p of online) leaveDungeon(p, "§b[System] §7The gate has closed.");
      }
      continue;
    }
    // Room progress
    const n = roomCount(inst);
    if (inst.fighting < 0 && inst.next < n && online.some((p) => inRoom(inst, inst.next, p.location))) spawnRoom(inst, inst.next);
    if (inst.fighting >= 0) {
      const alive = ow().getEntities({ tags: [tagRoom(inst, inst.fighting)] }).filter((e) => e.isValid);
      const boss = inst.fighting === n - 1;
      if (boss && inst.bossId) {
        const b = world.getEntity(inst.bossId);
        const h = b?.getComponent("minecraft:health");
        if (h) forMembers(inst, (p) => flash(p, `§c[BOSS] ${GATE_RANKS[inst.rank].boss.name} §f${Math.ceil(h.currentValue)}/${Math.round(h.effectiveMax)}`, 25));
      }
      if (alive.length === 0) {
        if (boss) clearDungeon(inst);
        else {
          openDoor(inst, inst.fighting);
          forMembers(inst, (p) => {
            flash(p, `§aRoom ${inst.fighting} cleared! §7The way forward is open.`, 60);
            p.playSound("random.door_open", { pitch: 0.6 });
          });
          inst.fighting = -1;
          inst.next++;
        }
      }
    }
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

// Dungeons can't be broken.
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

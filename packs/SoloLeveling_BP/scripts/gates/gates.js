// Gates in the world: schedule, far-away placement, saving, Dungeon Breaks,
// interaction.
//
// Gates open 500-2000 blocks away from hunters (and at least 500 from every
// hunter), so nobody's base is revealed. A gate far away is only a record at
// first; its entity is placed the moment a hunter loads that area.
import { Player, system, world } from "@minecraft/server";
import { getData } from "../data.js";
import { instanceOf, instances, leaveDungeon, setTeardownHandler } from "./dungeon.js";
import {
  GATE_DIST, GATE_RANKS, lifetimeMin, MAX_GATES, RANK_COLOR, RED_CHANCE, RED_GATE_COLOR, SCHEDULE,
} from "./ranks.js";

/** @typedef {{id:string, rank:number, red:boolean, dim:string, loc:{x:number,y:number,z:number}, grounded:boolean, expires:number}} Gate */
/** @type {Map<string, Gate>} */
export const gates = new Map();
let loaded = false;

const KEY = "sl:gates";
function save() {
  try {
    world.setDynamicProperty(KEY, JSON.stringify([...gates.values()]));
  } catch (e) {
    console.warn(`[SL] gates save: ${e}`);
  }
}
function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = world.getDynamicProperty(KEY);
    if (typeof raw === "string") for (const g of JSON.parse(raw)) gates.set(g.id, { grounded: true, ...g });
  } catch {}
  if (typeof world.getDynamicProperty("sl:era_start") !== "number") world.setDynamicProperty("sl:era_start", Date.now());
}
system.run(load);

export const naturalGatesOn = () => world.getDynamicProperty("sl:gates_on") !== false;
export const setNaturalGates = (on) => world.setDynamicProperty("sl:gates_on", on);

const gateTag = (id) => `slgate_${id}`;
export const colorOf = (g) => (g.red ? RED_GATE_COLOR : RANK_COLOR[g.rank]);

export function gateLabel(g) {
  const r = GATE_RANKS[g.rank];
  return `${g.red ? "§4[RED] " : ""}${r.color}[ ${r.rank}-RANK GATE ]`;
}
export const minutesLeft = (g) => Math.max(0, Math.ceil((g.expires - Date.now()) / 60000));

function findEntity(g) {
  try {
    return world.getDimension(g.dim).getEntities({ type: "sl:gate", tags: [gateTag(g.id)] })[0];
  } catch {
    return undefined;
  }
}

/** Opens a gate. `y` may be unknown for far gates (found when the area loads). */
export function createGate(dim, loc, rank, red = Math.random() < RED_CHANCE, grounded = true) {
  load();
  const id = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  /** @type {Gate} */
  const g = {
    id, rank, red, dim: dim.id, loc: { x: loc.x, y: loc.y, z: loc.z }, grounded,
    expires: Date.now() + lifetimeMin(rank) * 60000,
  };
  gates.set(id, g);
  save();
  const r = GATE_RANKS[rank];
  for (const p of world.getAllPlayers()) {
    p.sendMessage(
      `§b[System] §fA ${gateLabel(g)} §fhas opened at §e${Math.floor(loc.x)}, ${Math.floor(loc.z)}§f! ` +
        `§8(Lv ${r.level}+, closes in ${lifetimeMin(rank)} min) §7Type §b/gate §7to track it.`,
    );
    p.playSound("mob.endermen.portal", { pitch: 0.4, volume: 0.6 });
  }
  if (grounded) placeEntity(g);
  return g;
}

function placeEntity(g) {
  if (findEntity(g)) return;
  try {
    const dim = world.getDimension(g.dim);
    const e = dim.spawnEntity("sl:gate", g.loc);
    e.triggerEvent(`sl:color_${colorOf(g)}`);
    e.addTag(gateTag(g.id));
    e.addTag("sl_gate");
    e.nameTag = gateLabel(g);
    // Opening: a deep rumble for hunters nearby.
    for (const p of dim.getPlayers({ location: g.loc, maxDistance: 64 })) {
      p.playSound("mob.wither.spawn", { volume: 0.5, pitch: 0.5 });
      p.onScreenDisplay.setTitle(`${GATE_RANKS[g.rank].color}§lGATE`, { subtitle: gateLabel(g), fadeInDuration: 5, stayDuration: 30, fadeOutDuration: 10 });
    }
  } catch {}
}

export function removeGate(id) {
  const g = gates.get(id);
  if (!g) return;
  gates.delete(id);
  save();
  findEntity(g)?.remove();
}

function gateOfEntity(e) {
  const tag = e.getTags().find((t) => t.startsWith("slgate_"));
  return tag ? gates.get(tag.slice(7)) : undefined;
}

setTeardownHandler((inst) => {
  const g = gates.get(inst.gateId);
  if (g && inst.state === "cleared") removeGate(g.id);
});

// ---------------------------------------------------------------- interaction
let openGateUi = (player, gate) => {};
export const setGateUi = (fn) => (openGateUi = fn);

function onGateTouched(player, entity) {
  if (entity.hasTag("sl_exit")) {
    const inst = instanceOf(player);
    if (!inst) return;
    if (inst.red && inst.state !== "cleared") {
      player.onScreenDisplay.setActionBar("§cA Red Gate can't be left until the boss falls.");
      return;
    }
    leaveDungeon(player, "§b[System] §7You left the dungeon.");
    return;
  }
  const g = gateOfEntity(entity);
  if (g) openGateUi(player, g);
}

const lastTouch = new Map();
function touch(player, entity) {
  const now = system.currentTick;
  if (now - (lastTouch.get(player.id) ?? -99) < 10) return;
  lastTouch.set(player.id, now);
  system.run(() => onGateTouched(player, entity));
}

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.target.typeId !== "sl:gate") return;
  ev.cancel = true;
  touch(ev.player, ev.target);
});
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity instanceof Player && hitEntity.isValid && hitEntity.typeId === "sl:gate") touch(damagingEntity, hitEntity);
});

// ---------------------------------------------------------------- schedule
const hunters = () =>
  world.getAllPlayers().filter((p) => p.dimension.id === "minecraft:overworld" && !getData(p).dungeon && !getData(p).penalty);

/** A spot 500-2000 blocks from a random hunter and >= 500 from all of them. */
function farSpot() {
  const list = hunters();
  if (!list.length) return undefined;
  const all = world.getAllPlayers().filter((p) => p.dimension.id === "minecraft:overworld");
  for (let tries = 0; tries < 20; tries++) {
    const p = list[Math.floor(Math.random() * list.length)];
    const a = Math.random() * Math.PI * 2;
    const r = GATE_DIST.min + Math.random() * (GATE_DIST.max - GATE_DIST.min);
    const x = Math.floor(p.location.x + Math.cos(a) * r) + 0.5;
    const z = Math.floor(p.location.z + Math.sin(a) * r) + 0.5;
    if (all.every((q) => Math.hypot(q.location.x - x, q.location.z - z) >= GATE_DIST.min)) return { x, y: 0, z };
  }
  return undefined;
}

function spawnScheduled(rank) {
  if (gates.size >= MAX_GATES) return false;
  const spot = farSpot();
  if (!spot) return false;
  createGate(world.getDimension("overworld"), spot, rank, rank < 5 && Math.random() < RED_CHANCE, false);
  return true;
}

const timer = (k) => {
  const v = world.getDynamicProperty(`sl:gt_${k}`);
  return typeof v === "number" ? v : Date.now();
};
const setTimer = (k) => world.setDynamicProperty(`sl:gt_${k}`, Date.now());

system.runInterval(() => {
  load();
  if (!naturalGatesOn()) return;
  for (const k of ["any", "A", "S"]) if (typeof world.getDynamicProperty(`sl:gt_${k}`) !== "number") setTimer(k);
  const start = world.getDynamicProperty("sl:era_start");
  const early = Date.now() - (typeof start === "number" ? start : Date.now()) < SCHEDULE.earlyHours * 3600000;
  const s = early ? SCHEDULE.early : SCHEDULE.late;
  const now = Date.now();
  if (now - timer("S") >= s.S * 60000 && spawnScheduled(5)) setTimer("S");
  else if (now - timer("A") >= s.A * 60000 && spawnScheduled(4)) setTimer("A");
  else if (now - timer("any") >= s.any * 60000 && spawnScheduled(s.ranks[Math.floor(Math.random() * s.ranks.length)])) setTimer("any");
}, 1200);

// ---------------------------------------------------------------- upkeep & breaks
function dungeonBreak(g) {
  const dim = world.getDimension(g.dim);
  const r = GATE_RANKS[g.rank];
  let loadedArea = false;
  try {
    loadedArea = !!dim.getBlock(g.loc) && g.grounded;
  } catch {}
  if (loadedArea) {
    const n = 4 + g.rank * 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      try {
        dim.spawnEntity(r.mobs[i % r.mobs.length], { x: g.loc.x + Math.cos(a) * 4, y: g.loc.y + 0.2, z: g.loc.z + Math.sin(a) * 4 });
      } catch {}
    }
  }
  for (const p of world.getAllPlayers()) {
    p.sendMessage(
      loadedArea
        ? `§c[System] §lDUNGEON BREAK! §r§fMonsters poured out of the ${gateLabel(g)} §fat §e${Math.floor(g.loc.x)}, ${Math.floor(g.loc.z)}§f!`
        : `§8[System] The ${gateLabel(g)} §8at ${Math.floor(g.loc.x)}, ${Math.floor(g.loc.z)} has closed.`,
    );
  }
  removeGate(g.id);
}

system.runInterval(() => {
  load();
  const now = Date.now();
  for (const g of [...gates.values()]) {
    if (!instances.has(g.id) && now > g.expires) {
      dungeonBreak(g);
      continue;
    }
    try {
      const dim = world.getDimension(g.dim);
      if (!g.grounded) {
        // Far gate: find the ground once the area is loaded, then place it.
        const top = dim.getTopmostBlock({ x: g.loc.x, z: g.loc.z });
        if (!top) continue;
        g.loc.y = top.location.y + 1;
        g.grounded = true;
        save();
      }
      if (!dim.getBlock(g.loc)) continue; // not loaded
      if (!findEntity(g)) placeEntity(g);
    } catch {}
  }
  try {
    for (const e of world.getDimension("overworld").getEntities({ type: "sl:gate" })) {
      if (e.hasTag("sl_exit")) {
        if (![...instances.values()].some((i) => e.hasTag(`sl_dg${i.slot}`))) e.remove();
        continue;
      }
      if (!gateOfEntity(e)) e.remove();
    }
  } catch {}
}, 40);

/** Gates sorted by distance from a player (same dimension first). */
export function gatesNear(player) {
  load();
  const l = player.location;
  return [...gates.values()]
    .map((g) => ({ g, dist: g.dim === player.dimension.id ? Math.hypot(g.loc.x - l.x, g.loc.z - l.z) : Infinity }))
    .sort((a, b) => a.dist - b.dist);
}

// Gates in the world: natural spawning, saving, Dungeon Breaks, interaction.
import { Player, system, world } from "@minecraft/server";
import { getData } from "../data.js";
import { instanceOf, instances, leaveDungeon, setTeardownHandler } from "./dungeon.js";
import {
  GATE_CHECK_MIN, GATE_LIFETIME_MIN, GATE_RANKS, GATE_SPAWN_CHANCE, MAX_GATES, RED_CHANCE, rollRank,
} from "./ranks.js";

/** @typedef {{id:string, rank:number, red:boolean, dim:string, loc:{x:number,y:number,z:number}, expires:number, cleared?:boolean}} Gate */
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
    if (typeof raw === "string") for (const g of JSON.parse(raw)) gates.set(g.id, g);
  } catch {}
}
system.run(load);

export const naturalGatesOn = () => world.getDynamicProperty("sl:gates_on") !== false;
export const setNaturalGates = (on) => world.setDynamicProperty("sl:gates_on", on);

const gateTag = (id) => `slgate_${id}`;
const entityType = (g) => (g.red ? "sl:gate_red" : "sl:gate_blue");

export function gateLabel(g) {
  const r = GATE_RANKS[g.rank];
  return `${g.red ? "§c[RED] " : ""}${r.color}[ ${r.rank}-RANK GATE ]`;
}

function findEntity(g) {
  try {
    return world.getDimension(g.dim).getEntities({ type: entityType(g), tags: [gateTag(g.id)] })[0];
  } catch {
    return undefined;
  }
}

/** Creates a gate at a location. */
export function createGate(dim, loc, rank, red = Math.random() < RED_CHANCE) {
  load();
  const id = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  /** @type {Gate} */
  const g = { id, rank, red, dim: dim.id, loc: { x: loc.x, y: loc.y, z: loc.z }, expires: Date.now() + GATE_LIFETIME_MIN * 60000 };
  gates.set(id, g);
  save();
  placeEntity(g);
  const r = GATE_RANKS[rank];
  for (const p of dim.getPlayers({ location: loc, maxDistance: 160 })) {
    p.sendMessage(`§b[System] §fA ${gateLabel(g)} §fhas appeared at §7${Math.floor(loc.x)}, ${Math.floor(loc.y)}, ${Math.floor(loc.z)}§f! §8(recommended Lv ${r.level}+)`);
    p.playSound("mob.endermen.portal", { pitch: 0.5 });
  }
  return g;
}

function placeEntity(g) {
  if (findEntity(g)) return;
  try {
    const e = world.getDimension(g.dim).spawnEntity(entityType(g), g.loc);
    e.addTag(gateTag(g.id));
    e.addTag("sl_gate");
    e.nameTag = gateLabel(g);
  } catch {}
}

export function removeGate(id) {
  const g = gates.get(id);
  if (!g) return;
  gates.delete(id);
  save();
  findEntity(g)?.remove();
}

/** Gate by one of its entities (tag slgate_<id>). */
function gateOfEntity(e) {
  const tag = e.getTags().find((t) => t.startsWith("slgate_"));
  return tag ? gates.get(tag.slice(7)) : undefined;
}

// Cleared gates close when their dungeon is torn down.
setTeardownHandler((inst) => {
  const g = gates.get(inst.gateId);
  if (g && inst.state === "cleared") removeGate(g.id);
});

// ---------------------------------------------------------------- interaction
/** Set by the UI: opens the gate window. */
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
  if (!ev.target.matches({ families: ["sl_gate"] })) return;
  ev.cancel = true;
  touch(ev.player, ev.target);
});
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity instanceof Player && hitEntity.isValid && hitEntity.matches({ families: ["sl_gate"] })) touch(damagingEntity, hitEntity);
});

// ---------------------------------------------------------------- spawning & breaks
function trySpawnNatural() {
  if (!naturalGatesOn() || gates.size >= MAX_GATES || Math.random() > GATE_SPAWN_CHANCE) return;
  const ow = world.getDimension("overworld");
  const candidates = world.getAllPlayers().filter((p) => p.dimension.id === "minecraft:overworld" && !getData(p).dungeon && !getData(p).penalty);
  if (!candidates.length) return;
  const p = candidates[Math.floor(Math.random() * candidates.length)];
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 25;
    const x = Math.floor(p.location.x + Math.cos(a) * r);
    const z = Math.floor(p.location.z + Math.sin(a) * r);
    let top;
    try {
      top = ow.getTopmostBlock({ x, z });
    } catch {}
    if (!top || top.isLiquid || top.typeId.includes("leaves")) continue;
    createGate(ow, { x: x + 0.5, y: top.location.y + 1, z: z + 0.5 }, rollRank(getData(p).level));
    return;
  }
}

function dungeonBreak(g) {
  const dim = world.getDimension(g.dim);
  const r = GATE_RANKS[g.rank];
  const n = 4 + g.rank * 2;
  let spawned = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    try {
      dim.spawnEntity(r.mobs[i % r.mobs.length], { x: g.loc.x + Math.cos(a) * 3, y: g.loc.y + 0.2, z: g.loc.z + Math.sin(a) * 3 });
      spawned++;
    } catch {}
  }
  if (spawned) {
    for (const p of dim.getPlayers({ location: g.loc, maxDistance: 200 })) {
      p.sendMessage(`§c[System] §lDUNGEON BREAK! §r§fMonsters poured out of an uncleared ${gateLabel(g)}§f!`);
      p.playSound("mob.wither.spawn", { volume: 0.5, pitch: 0.8 });
    }
  }
  removeGate(g.id);
}

let minutes = 0;
system.runInterval(() => {
  load();
  minutes++;
  if (minutes % GATE_CHECK_MIN === 0) trySpawnNatural();
}, 1200);

system.runInterval(() => {
  load();
  const now = Date.now();
  for (const g of [...gates.values()]) {
    const busy = instances.has(g.id);
    if (!busy && now > g.expires) {
      dungeonBreak(g);
      continue;
    }
    // Keep the entity present (e.g. after a /kill) and its particles going.
    let e;
    try {
      const dim = world.getDimension(g.dim);
      if (!dim.getBlock(g.loc)) continue; // not loaded
      e = findEntity(g);
      if (!e) placeEntity(g);
      dim.spawnParticle(g.red ? "minecraft:basic_flame_particle" : "minecraft:portal_reverse_particle", { ...g.loc, y: g.loc.y + 1.5 });
    } catch {}
  }
  // Remove gate entities whose gate no longer exists (exit gates live in dungeons).
  try {
    for (const e of world.getDimension("overworld").getEntities({ families: ["sl_gate"] })) {
      if (e.hasTag("sl_exit")) {
        if (![...instances.values()].some((i) => e.hasTag(`sl_dg${i.slot}`))) e.remove();
        continue;
      }
      if (!gateOfEntity(e)) e.remove();
    }
  } catch {}
}, 40);

/** Gates sorted by distance from a player (same dimension). */
export function gatesNear(player) {
  load();
  const l = player.location;
  return [...gates.values()]
    .filter((g) => g.dim === player.dimension.id)
    .map((g) => ({ g, dist: Math.hypot(g.loc.x - l.x, g.loc.z - l.z) }))
    .sort((a, b) => a.dist - b.dist);
}

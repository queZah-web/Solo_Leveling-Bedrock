// Hunter Association: a registry of every hunter seen on the server (for the
// rankings, also of hunters who are offline) and who counts as an ally.
import { Player, system, world } from "@minecraft/server";
import { getData } from "../data.js";
import { addDamageHook } from "../stats.js";
import { sameParty } from "./party.js";

const KEY = "sl:hunters";
const MAX_ENTRIES = 150;

/** @typedef {{n:string, l:number, j:string, g:number, k:number, s:number, t:string, seen:number}} HunterEntry */
/** @type {Record<string, HunterEntry>|undefined} */
let registry;
function load() {
  if (registry) return registry;
  try {
    registry = JSON.parse(String(world.getDynamicProperty(KEY) ?? "{}"));
  } catch {
    registry = {};
  }
  return registry;
}

function record(player) {
  const d = getData(player);
  load()[player.id] = {
    n: player.name, l: d.level, j: d.job ?? "None", g: d.gatesCleared ?? 0, k: d.kills ?? 0, s: d.shadows?.length ?? 0,
    t: d.gtag ?? "", seen: Date.now(),
  };
}

function flush() {
  const r = load();
  const ids = Object.keys(r);
  if (ids.length > MAX_ENTRIES) {
    ids.sort((a, b) => r[a].seen - r[b].seen).slice(0, ids.length - MAX_ENTRIES).forEach((id) => delete r[id]);
  }
  try {
    world.setDynamicProperty(KEY, JSON.stringify(r));
  } catch (e) {
    console.warn(`[SL] hunter registry: ${e}`);
  }
}

system.runInterval(() => {
  const players = world.getAllPlayers();
  if (!players.length) return;
  for (const p of players) record(p);
  flush();
}, 1200);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    if (!player.isValid) return;
    record(player);
    flush();
  }, 60);
});

/** Top hunters by a field ("l" level, "g" gates, "k" kills, "s" shadows). */
export function ranking(field, n = 10) {
  for (const p of world.getAllPlayers()) record(p);
  return Object.entries(load())
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => b[field] - a[field] || b.l - a.l)
    .slice(0, n);
}

/** Position of a hunter in a ranking (1-based). */
export function placeOf(player, field) {
  for (const p of world.getAllPlayers()) record(p);
  const list = Object.entries(load()).sort((a, b) => b[1][field] - a[1][field] || b[1].l - a[1].l);
  return list.findIndex(([id]) => id === player.id) + 1;
}

/** Allies never hurt each other: same party, or same guild. */
export function allies(a, b) {
  if (!(a instanceof Player) || !(b instanceof Player) || a.id === b.id) return false;
  if (sameParty(a, b)) return true;
  const ga = getData(a).gid;
  return !!ga && ga === getData(b).gid;
}

// No friendly fire between allied hunters (their shadows are handled by the army).
addDamageHook((ev) => {
  const a = ev.damageSource.damagingEntity;
  if (a instanceof Player && ev.hurtEntity instanceof Player && allies(a, ev.hurtEntity)) ev.cancel = true;
});

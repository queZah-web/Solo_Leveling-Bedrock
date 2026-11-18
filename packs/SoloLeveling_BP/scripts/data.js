// Per-player persistent data, stored as JSON in a player dynamic property.
// Cached in memory and flushed to the player when changed (safe for servers).
import { system, world } from "@minecraft/server";
import { BASE_STAT, DATA_KEY, DATA_VERSION, maxMp } from "./config.js";

/** @typedef {{v:number, level:number, xp:number, points:number,
 *  str:number, agi:number, vit:number, int:number, per:number,
 *  mp:number, fatigue:number, kills:number, job:string, title:string,
 *  customUi:boolean, hud:boolean, shadows:ShadowRecord[], namedTaken:string[]}} HunterData */
/** @typedef {{id:string, type:string, name:string, grade:number, base:number,
 *  level:number, xp:number, kills:number, deadUntil:number, ptr?:string, gear?:Record<string,string>,
 *  food?:{id:string, count:number}, totem?:number}} ShadowRecord */

/** @returns {HunterData} */
export function defaultData() {
  return {
    v: DATA_VERSION,
    level: 1,
    xp: 0,
    points: 0,
    str: BASE_STAT,
    agi: BASE_STAT,
    vit: BASE_STAT,
    int: BASE_STAT,
    per: BASE_STAT,
    mp: maxMp(BASE_STAT),
    fatigue: 0,
    kills: 0,
    job: "None",
    title: "None",
    customUi: true,
    hud: true,
    shadows: [],
    namedTaken: [],
  };
}

/** @type {Map<string, HunterData>} */
const cache = new Map();
/** @type {Set<string>} */
const dirty = new Set();

/** @param {import("@minecraft/server").Player} player */
export function getData(player) {
  let d = cache.get(player.id);
  if (d) return d;
  d = defaultData();
  try {
    const raw = player.getDynamicProperty(DATA_KEY);
    if (typeof raw === "string") Object.assign(d, JSON.parse(raw));
  } catch (e) {
    console.warn(`[SL] corrupt data for ${player.name}, resetting: ${e}`);
  }
  d.v = DATA_VERSION;
  cache.set(player.id, d);
  return d;
}

/** Mark data as changed; it is written on the next flush (every tick batch). */
export function markDirty(player) {
  dirty.add(player.id);
}

export function saveNow(player) {
  const d = cache.get(player.id);
  if (!d) return;
  try {
    player.setDynamicProperty(DATA_KEY, JSON.stringify(d));
  } catch (e) {
    console.warn(`[SL] failed to save ${player.name}: ${e}`);
  }
  dirty.delete(player.id);
}

export function resetData(player) {
  cache.set(player.id, defaultData());
  saveNow(player);
}

export function forget(playerId) {
  cache.delete(playerId);
  dirty.delete(playerId);
}

// Flush changed data every second.
system.runInterval(() => {
  if (dirty.size === 0) return;
  for (const player of world.getAllPlayers()) {
    if (dirty.has(player.id)) saveNow(player);
  }
  dirty.clear();
}, 20);

world.beforeEvents.playerLeave.subscribe(({ player }) => {
  // Before-events run in read-only mode, but dynamic property writes are allowed.
  try {
    if (cache.has(player.id)) player.setDynamicProperty(DATA_KEY, JSON.stringify(cache.get(player.id)));
  } catch {}
  const id = player.id;
  system.run(() => forget(id));
});

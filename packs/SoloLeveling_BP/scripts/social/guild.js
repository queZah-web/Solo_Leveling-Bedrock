// Guilds: permanent hunter groups saved in the world.
// Roles: Master > Officer > Member. Guilds level up from gold deposited in
// the guild bank and gates cleared by members; every level gives a perk.
import { system, world } from "@minecraft/server";
import { getData, markDirty } from "../data.js";

export const GUILD_COST = 3000;
export const GUILD_MIN_LEVEL = 20;
/** Guild XP needed for levels 2..5 */
export const GUILD_LEVELS = [0, 500, 1500, 4000, 10000];
export const GUILD_PERKS = [
  "Guild tag above members' heads, no friendly fire",
  "+5% XP and gold from cleared dungeons",
  "+1 active shadow for every member",
  "+10% XP and gold from cleared dungeons (total)",
  "+5% damage dealt, shadows +5% damage",
];
/** Guild XP for a gate cleared by a member, by rank E..S */
const GATE_XP = [20, 40, 80, 150, 250, 400];
const maxMembers = (lvl) => 10 + lvl * 5;

/**
 * @typedef {{id:string, name:string, tag:string, master:string, created:number, bank:number, xp:number, notice:string,
 *  members:Record<string, {name:string, role:"master"|"officer"|"member", joined:number, contrib:number}>, invites:Record<string, number>}} Guild
 */
/** @type {Map<string, Guild>|undefined} */
let guilds;
const KEY = (id) => `sl:g:${id}`;

function load() {
  if (guilds) return guilds;
  guilds = new Map();
  try {
    const ids = JSON.parse(String(world.getDynamicProperty("sl:gids") ?? "[]"));
    for (const id of ids) {
      try {
        const g = JSON.parse(String(world.getDynamicProperty(KEY(id)) ?? "null"));
        if (g) guilds.set(id, g);
      } catch {}
    }
  } catch {}
  return guilds;
}
function save(g) {
  load();
  if (g) {
    try {
      world.setDynamicProperty(KEY(g.id), JSON.stringify(g));
    } catch (e) {
      console.warn(`[SL] guild save: ${e}`);
    }
  }
  world.setDynamicProperty("sl:gids", JSON.stringify([...guilds.keys()]));
}

export const allGuilds = () => [...load().values()];
export const guildById = (id) => load().get(id ?? "");
export const guildLevel = (g) => GUILD_LEVELS.filter((x) => g.xp >= x).length;
export const guildCap = (g) => maxMembers(guildLevel(g));
export const roleOf = (g, pid) => g?.members[pid]?.role;
const byId = (id) => world.getAllPlayers().find((p) => p.id === id);
const ROLE_RANK = { member: 0, officer: 1, master: 2 };

/** The player's guild (and keeps the cached tag/level on their data in sync). */
export function guildOf(player) {
  const d = getData(player);
  const g = guildById(d.gid);
  if (g && g.members[player.id]) return g;
  if (d.gid) {
    d.gid = undefined;
    d.gl = 0;
    d.gtag = undefined;
    markDirty(player);
    onChange?.(player);
  }
  return undefined;
}

function sync(player, g) {
  const d = getData(player);
  d.gid = g?.id;
  d.gl = g ? guildLevel(g) : 0;
  d.gtag = g?.tag;
  markDirty(player);
  onChange?.(player);
}
/** Set by progression.js to refresh the name above the head. */
let onChange;
export const setGuildChangeHandler = (fn) => (onChange = fn);

function tell(g, msg) {
  for (const id of Object.keys(g.members)) byId(id)?.sendMessage(`§6[${g.tag}] §f${msg}`);
}

// ---------------------------------------------------------------- actions (return an error or undefined)
export function createGuild(player, name, tag) {
  const d = getData(player);
  name = (name ?? "").trim().replace(/§./g, "");
  tag = (tag ?? "").trim().toUpperCase();
  if (guildOf(player)) return "You are already in a guild.";
  if (d.level < GUILD_MIN_LEVEL) return `You need level ${GUILD_MIN_LEVEL} to found a guild.`;
  if ((d.gold ?? 0) < GUILD_COST) return `Founding a guild costs ${GUILD_COST} gold.`;
  if (name.length < 3 || name.length > 20) return "The name must be 3-20 characters.";
  if (!/^[A-Z0-9]{2,4}$/.test(tag)) return "The tag must be 2-4 letters or digits.";
  if (allGuilds().some((g) => g.name.toLowerCase() === name.toLowerCase())) return "That name is taken.";
  if (allGuilds().some((g) => g.tag === tag)) return "That tag is taken.";
  d.gold -= GUILD_COST;
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  /** @type {Guild} */
  const g = {
    id, name, tag, master: player.id, created: Date.now(), bank: 0, xp: 0, notice: "Welcome to the guild!",
    members: { [player.id]: { name: player.name, role: "master", joined: Date.now(), contrib: 0 } }, invites: {},
  };
  load().set(id, g);
  save(g);
  sync(player, g);
  world.sendMessage(`§6[System] §f${player.name} §7founded the guild §6[${tag}] ${name}§7.`);
  player.playSound("random.levelup", { pitch: 1 });
  return undefined;
}

export function inviteGuild(from, target) {
  const g = guildOf(from);
  if (!g) return "You are not in a guild.";
  if (ROLE_RANK[roleOf(g, from.id)] < 1) return "Only officers and the master can invite.";
  if (guildOf(target)) return `${target.name} is already in a guild.`;
  if (Object.keys(g.members).length >= guildCap(g)) return `The guild is full (${guildCap(g)}). Level it up for more room.`;
  g.invites[target.id] = Date.now() + 10 * 60000;
  save(g);
  target.sendMessage(`§6[System] §f${from.name} §7invited you to the guild §6[${g.tag}] ${g.name}§7. Accept in §bSystem > QUESTS > GUILD §7(10 min).`);
  target.playSound("random.orb", { pitch: 1.4 });
  return undefined;
}

export const guildInvitesOf = (player) => allGuilds().filter((g) => (g.invites[player.id] ?? 0) > Date.now());

export function joinGuild(player, gid) {
  const g = guildById(gid);
  if (!g || (g.invites[player.id] ?? 0) < Date.now()) return "The invitation expired.";
  if (guildOf(player)) return "Leave your guild first.";
  if (Object.keys(g.members).length >= guildCap(g)) return "The guild is full.";
  delete g.invites[player.id];
  g.members[player.id] = { name: player.name, role: "member", joined: Date.now(), contrib: 0 };
  save(g);
  sync(player, g);
  tell(g, `${player.name} §7joined the guild!`);
  return undefined;
}

export function declineGuild(player, gid) {
  const g = guildById(gid);
  if (!g) return;
  delete g.invites[player.id];
  save(g);
}

function removeMember(g, pid) {
  delete g.members[pid];
  save(g);
  const p = byId(pid);
  if (p) sync(p, undefined);
}

export function leaveGuild(player) {
  const g = guildOf(player);
  if (!g) return "You are not in a guild.";
  if (g.master === player.id && Object.keys(g.members).length > 1) return "Give the master role to someone first (or disband).";
  if (g.master === player.id) return disbandGuild(player);
  removeMember(g, player.id);
  tell(g, `${player.name} §7left the guild.`);
  player.sendMessage(`§6[System] §7You left §6[${g.tag}] ${g.name}§7.`);
  return undefined;
}

export function kickMember(by, pid) {
  const g = guildOf(by);
  if (!g || !g.members[pid] || pid === by.id) return "Not possible.";
  if (ROLE_RANK[roleOf(g, by.id)] <= ROLE_RANK[roleOf(g, pid)]) return "You can only remove members below your role.";
  const name = g.members[pid].name;
  removeMember(g, pid);
  tell(g, `${name} §7was removed from the guild by ${by.name}.`);
  byId(pid)?.sendMessage(`§6[System] §7You were removed from §6[${g.tag}] ${g.name}§7.`);
  return undefined;
}

export function setRole(by, pid, role) {
  const g = guildOf(by);
  if (!g || g.master !== by.id || !g.members[pid] || pid === by.id) return "Only the master can change roles.";
  if (role === "master") {
    g.members[by.id].role = "officer";
    g.master = pid;
  }
  g.members[pid].role = role;
  save(g);
  tell(g, `${g.members[pid].name} §7is now ${role === "master" ? "§6the Guild Master" : role === "officer" ? "§ban Officer" : "§fa Member"}§7.`);
  return undefined;
}

export function disbandGuild(by) {
  const g = guildOf(by);
  if (!g || g.master !== by.id) return "Only the master can disband the guild.";
  for (const pid of Object.keys(g.members)) {
    const p = byId(pid);
    if (p) sync(p, undefined);
  }
  if ((g.bank ?? 0) > 0) {
    const d = getData(by);
    d.gold = (d.gold ?? 0) + g.bank;
    markDirty(by);
  }
  load().delete(g.id);
  try {
    world.setDynamicProperty(KEY(g.id), undefined);
  } catch {}
  save(undefined);
  world.sendMessage(`§6[System] §7The guild §6[${g.tag}] ${g.name} §7was disbanded.`);
  return undefined;
}

export function deposit(player, amount) {
  const g = guildOf(player);
  const d = getData(player);
  amount = Math.floor(amount);
  if (!g) return "You are not in a guild.";
  if (amount <= 0 || (d.gold ?? 0) < amount) return "Not enough gold.";
  d.gold -= amount;
  markDirty(player);
  g.bank += amount;
  g.members[player.id].contrib += amount;
  addGuildXp(g, Math.floor(amount / 10));
  save(g);
  tell(g, `${player.name} §7deposited §6${amount} gold§7.`);
  return undefined;
}

export function withdraw(player, amount) {
  const g = guildOf(player);
  amount = Math.floor(amount);
  if (!g || g.master !== player.id) return "Only the master can take gold from the bank.";
  if (amount <= 0 || g.bank < amount) return "The bank doesn't have that much.";
  g.bank -= amount;
  const d = getData(player);
  d.gold = (d.gold ?? 0) + amount;
  markDirty(player);
  save(g);
  tell(g, `${player.name} §7withdrew §6${amount} gold§7.`);
  return undefined;
}

export function setNotice(player, text) {
  const g = guildOf(player);
  if (!g || ROLE_RANK[roleOf(g, player.id)] < 1) return "Only officers and the master can write the notice.";
  g.notice = String(text).slice(0, 120);
  save(g);
  return undefined;
}

function addGuildXp(g, n) {
  const before = guildLevel(g);
  g.xp += n;
  const after = guildLevel(g);
  if (after > before) {
    tell(g, `§6§lGUILD LEVEL UP! §r§fLevel ${after}: §a${GUILD_PERKS[after - 1]}`);
    for (const pid of Object.keys(g.members)) {
      const p = byId(pid);
      if (p) sync(p, g);
    }
  }
}

/** Called when a member clears a gate. */
export function guildGateCleared(player, rank) {
  const g = guildOf(player);
  if (!g) return;
  g.members[player.id].contrib += GATE_XP[rank] * 10;
  addGuildXp(g, GATE_XP[rank]);
  save(g);
}

// Keep cached guild info on online players fresh (kicks/level-ups while away).
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const d = getData(p);
    const g = guildOf(p);
    if (g) {
      if (g.members[p.id].name !== p.name) {
        g.members[p.id].name = p.name;
        save(g);
      }
      if (d.gl !== guildLevel(g) || d.gtag !== g.tag) sync(p, g);
    }
  }
}, 200);

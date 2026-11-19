// Parties: up to PARTY_MAX hunters who fight together.
// - members (and their shadows) never hurt each other
// - kills share XP with members nearby
// - the leader can take the party into a gate together
// Parties live in memory: they end on a server restart.
import { Player, system, world } from "@minecraft/server";
import { addXp, flash, xpFor } from "../stats.js";

export const PARTY_MAX = 5;
export const SHARE = 0.5; // XP share for members nearby
const SHARE_RANGE = 48;
const INVITE_MS = 120000;

/** @type {Map<string, {id:string, leader:string, members:string[]}>} */
const parties = new Map();
/** playerId -> partyId */
const memberOf = new Map();
/** target playerId -> invites */
const invites = new Map();
let seq = 0;

const byId = (id) => world.getAllPlayers().find((p) => p.id === id);
export const partyOf = (player) => parties.get(memberOf.get(player.id) ?? "");
export const sameParty = (a, b) => !!memberOf.get(a.id) && memberOf.get(a.id) === memberOf.get(b.id);
/** Online members (including the player). */
export const partyMembers = (player) => {
  const p = partyOf(player);
  return p ? p.members.map(byId).filter(Boolean) : [player];
};
export const invitesOf = (player) => (invites.get(player.id) ?? []).filter((i) => i.until > Date.now() && parties.has(i.partyId));

function tell(party, msg) {
  for (const id of party.members) byId(id)?.sendMessage(`§a[Party] §f${msg}`);
}

/** Invite another hunter (creates the party if needed). Returns an error. */
export function invite(from, target) {
  if (from.id === target.id) return "You can't invite yourself.";
  if (memberOf.has(target.id)) return `${target.name} is already in a party.`;
  let p = partyOf(from);
  if (p && p.leader !== from.id) return "Only the party leader can invite.";
  if (p && p.members.length >= PARTY_MAX) return `The party is full (${PARTY_MAX}).`;
  if (!p) {
    p = { id: `p${++seq}`, leader: from.id, members: [from.id] };
    parties.set(p.id, p);
    memberOf.set(from.id, p.id);
  }
  const list = (invites.get(target.id) ?? []).filter((i) => i.partyId !== p.id && i.until > Date.now());
  list.push({ partyId: p.id, from: from.name, until: Date.now() + INVITE_MS });
  invites.set(target.id, list);
  target.sendMessage(`§a[Party] §f${from.name} §7invited you to a party. Accept in §bSystem > QUESTS > PARTY §7(2 min).`);
  target.playSound("random.orb", { pitch: 1.6 });
  from.sendMessage(`§a[Party] §7Invitation sent to §f${target.name}§7.`);
  return undefined;
}

export function accept(player, partyId) {
  const p = parties.get(partyId);
  invites.set(player.id, (invites.get(player.id) ?? []).filter((i) => i.partyId !== partyId));
  if (!p) return "That party no longer exists.";
  if (memberOf.has(player.id)) return "Leave your party first.";
  if (p.members.length >= PARTY_MAX) return "The party is full.";
  p.members.push(player.id);
  memberOf.set(player.id, p.id);
  tell(p, `${player.name} §7joined the party.`);
  return undefined;
}

export function decline(player, partyId) {
  invites.set(player.id, (invites.get(player.id) ?? []).filter((i) => i.partyId !== partyId));
}

export function leave(player, why = "left the party") {
  const p = partyOf(player);
  if (!p) return;
  p.members = p.members.filter((id) => id !== player.id);
  memberOf.delete(player.id);
  if (p.members.length <= 1) {
    for (const id of p.members) {
      memberOf.delete(id);
      byId(id)?.sendMessage("§a[Party] §7The party was disbanded.");
    }
    parties.delete(p.id);
  } else {
    if (p.leader === player.id) p.leader = p.members[0];
    tell(p, `${player.name} §7${why}. Leader: §f${byId(p.leader)?.name ?? "?"}`);
  }
  player.sendMessage("§a[Party] §7You left the party.");
}

export function kick(leader, targetId) {
  const p = partyOf(leader);
  if (!p || p.leader !== leader.id) return "Only the leader can do that.";
  const t = byId(targetId);
  if (!t || !p.members.includes(targetId)) return "Not in your party.";
  leave(t, "was removed");
  return undefined;
}

export function makeLeader(leader, targetId) {
  const p = partyOf(leader);
  if (!p || p.leader !== leader.id || !p.members.includes(targetId)) return "Only the leader can do that.";
  p.leader = targetId;
  tell(p, `§f${byId(targetId)?.name} §7is now the party leader.`);
  return undefined;
}

/** Members (other than the player) close enough to follow into a gate. */
export function followers(player, range = 24) {
  const p = partyOf(player);
  if (!p || p.leader !== player.id) return [];
  return partyMembers(player).filter((m) => m.id !== player.id && m.dimension.id === player.dimension.id &&
    Math.hypot(m.location.x - player.location.x, m.location.z - player.location.z) <= range);
}

// XP sharing: members near the killer get half of the kill's XP.
world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (!(killer instanceof Player) || !memberOf.has(killer.id) || deadEntity instanceof Player) return;
  let amount = 0;
  try {
    amount = Math.floor(xpFor(deadEntity) * SHARE);
  } catch {
    return;
  }
  if (amount <= 0) return;
  for (const m of partyMembers(killer)) {
    if (m.id === killer.id || m.dimension.id !== killer.dimension.id) continue;
    if (Math.hypot(m.location.x - killer.location.x, m.location.z - killer.location.z) > SHARE_RANGE) continue;
    addXp(m, amount);
    flash(m, `§a+${amount} XP §7(party)`, 30);
  }
});

// Leaving the server leaves the party.
world.afterEvents.playerLeave.subscribe(({ playerId, playerName }) => {
  const p = parties.get(memberOf.get(playerId) ?? "");
  invites.delete(playerId);
  if (!p) return;
  p.members = p.members.filter((id) => id !== playerId);
  memberOf.delete(playerId);
  if (p.members.length <= 1) {
    for (const id of p.members) {
      memberOf.delete(id);
      byId(id)?.sendMessage("§a[Party] §7The party was disbanded.");
    }
    parties.delete(p.id);
    return;
  }
  if (p.leader === playerId) p.leader = p.members[0];
  tell(p, `${playerName} §7left the game.`);
});

// Party HUD hint: members' HP on the action bar every few seconds when someone is hurt.
system.runInterval(() => {
  for (const p of parties.values()) {
    const online = p.members.map(byId).filter(Boolean);
    const hurt = online.filter((m) => {
      const h = m.getComponent("minecraft:health");
      return h && h.currentValue < h.effectiveMax * 0.35;
    });
    for (const m of hurt) {
      for (const o of online) if (o.id !== m.id) flash(o, `§a[Party] §f${m.name} §cis in danger! §f${Math.ceil(m.getComponent("minecraft:health").currentValue)} HP`, 30);
    }
  }
}, 60);

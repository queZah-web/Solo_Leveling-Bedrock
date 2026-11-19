// HUNTER ASSOCIATION, PARTY and GUILD screens (opened from the QUESTS tab).
import { world } from "@minecraft/server";
import { MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { jobOf, titleOf } from "../classes.js";
import { getData } from "../data.js";
import { rankOf } from "../stats.js";
import { placeOf, ranking } from "../social/association.js";
import { accept, decline, invite, invitesOf, kick, leave, makeLeader, PARTY_MAX, partyMembers, partyOf, SHARE } from "../social/party.js";
import {
  createGuild, declineGuild, deposit, disbandGuild, GUILD_COST, GUILD_LEVELS, GUILD_MIN_LEVEL, GUILD_PERKS, guildCap,
  guildInvitesOf, guildLevel, guildOf, inviteGuild, joinGuild, kickMember, leaveGuild, roleOf, setNotice, setRole, withdraw, allGuilds,
} from "../social/guild.js";
import { BLANK, showForm, SystemForm } from "./form.js";
import { frame } from "./frame.js";

const toast = (player, err, ok) => player.onScreenDisplay.setActionBar(err ? `§c${err}` : ok ?? "");

/**
 * Picks an online player (other than the given ones).
 * @param {(p: any) => boolean} [skip]
 */
async function pickPlayer(player, title, skip = (p) => false) {
  const list = world.getAllPlayers().filter((p) => p.id !== player.id && !skip(p));
  if (!list.length) {
    toast(player, "No other hunters online.");
    return undefined;
  }
  const res = await showForm(player, new ModalFormData().title(title).dropdown("Hunter", list.map((p) => `${p.name} §7Lv ${getData(p).level}`)).submitButton("OK"));
  if (!res || res.canceled || !res.formValues) return undefined;
  return list[Number(res.formValues[0])];
}

async function confirm(player, title, body) {
  const r = await showForm(player, new MessageFormData().title(title).body(body).button1("§cYes").button2("No"));
  return !!r && !r.canceled && r.selection === 0;
}

// ---------------------------------------------------------------- association
/** @type {[string, string, (e: any) => string][]} */
const BOARDS = [
  ["l", "LEVEL", (e) => `Lv ${e.l}`],
  ["g", "GATES CLEARED", (e) => `${e.g} gates`],
  ["k", "KILLS", (e) => `${e.k} kills`],
  ["s", "SHADOW ARMY", (e) => `${e.s} shadows`],
];
const boardState = new Map();

export async function associationScreen(player) {
  const d = getData(player);
  const r = rankOf(d.level);
  const g = guildOf(player);
  const field = boardState.get(player.id) ?? "l";
  const board = BOARDS.find((b) => b[0] === field);
  const top = ranking(field, 10);
  const form = new SystemForm("list", "HUNTER ASSOCIATION");
  frame(form, player, "quests");
  form.screenId = "association";
  const medal = (i) => (i === 0 ? "§6" : i === 1 ? "§f" : i === 2 ? "§c" : "§7");
  form.body([
    "§bHUNTER LICENSE",
    `§7Name: §f${player.name}   §7Rank: ${r.color}${r.name}`,
    `§7Job: ${jobOf(d) ? jobOf(d).color + d.job : "§fNone"}   §7Title: ${titleOf(d) ? titleOf(d).color + titleOf(d).name : "§fNone"}`,
    `§7Guild: ${g ? `§6[${g.tag}] ${g.name}` : "§fNone"}`,
    `§7Gates: §f${d.gatesCleared ?? 0}  §7Kills: §f${d.kills}  §7Shadows: §f${d.shadows.length}`,
    "",
    `§bTOP HUNTERS: ${board[1]} §8(you: #${placeOf(player, field)})`,
    ...top.map((e, i) => `${medal(i)}#${i + 1} §f${e.t ? `§6[${e.t}] §f` : ""}${e.n} §8- §7${board[2](e)}${e.id === player.id ? " §a<" : ""}`),
  ].join("\n"));
  for (const [f, label] of BOARDS) {
    form.button(`${f === field ? "§a> " : "§7"}Ranking: ${label}`, BLANK, () => (boardState.set(player.id, f), "association"));
  }
  form.button("§6GUILD RANKING", BLANK, () => "guildrank");
  form.button("§aPARTY", BLANK, () => "party");
  form.button("§6GUILD", BLANK, () => "guild");
  form.button("§bBack to Quests", BLANK, () => "quests");
  return form.show(player);
}

export async function guildRankScreen(player) {
  const list = allGuilds().sort((a, b) => b.xp - a.xp).slice(0, 12);
  const form = new SystemForm("list", "GUILD RANKING");
  frame(form, player, "quests");
  form.screenId = "guildrank";
  form.body(list.length
    ? list.map((g, i) => `§7#${i + 1} §6[${g.tag}] §f${g.name}\n   §7Lv ${guildLevel(g)} §8| §7${Object.keys(g.members).length} members §8| §7${g.xp} guild XP`).join("\n")
    : "§7No guilds yet. Found the first one!");
  form.button("§bBack", BLANK, () => "association");
  return form.show(player);
}

// ---------------------------------------------------------------- party
export async function partyScreen(player) {
  const p = partyOf(player);
  const inv = invitesOf(player);
  const form = new SystemForm("list", "PARTY");
  frame(form, player, "quests");
  form.screenId = "party";
  const lines = [];
  if (p) {
    lines.push(`§aPARTY §7(${p.members.length}/${PARTY_MAX})`, "");
    for (const m of partyMembers(player)) {
      const d = getData(m);
      const h = m.getComponent("minecraft:health");
      const dist = m.dimension.id === player.dimension.id ? `${Math.round(Math.hypot(m.location.x - player.location.x, m.location.z - player.location.z))}m` : "other dimension";
      lines.push(`${m.id === p.leader ? "§6[Leader] " : ""}§f${m.name} §7Lv ${d.level} ${jobOf(d) ? jobOf(d).color + d.job : ""}`);
      lines.push(`  §cHP ${Math.ceil(h?.currentValue ?? 0)}/${Math.round(h?.effectiveMax ?? 20)} §9MP ${Math.floor(d.mp)} §8| §7${m.id === player.id ? "you" : dist}`);
    }
  } else lines.push("§7You are not in a party.", "");
  lines.push(
    "",
    "§bParty rules:",
    "§7- Members and their shadows never hurt each other",
    `§7- Kills give ${Math.round(SHARE * 100)}%% of their XP to members within 48 blocks`,
    "§7- The leader can take nearby members into a gate (ENTER WITH PARTY)",
    "§7- A member in danger is announced to the others",
  );
  form.body(lines.join("\n"));
  for (const i of inv) {
    form.button(`§aJoin ${i.from}'s party`, BLANK, () => (toast(player, accept(player, i.partyId), "§aJoined the party"), "party"));
    form.button(`§7Decline ${i.from}`, BLANK, () => (decline(player, i.partyId), "party"));
  }
  if (!p || p.leader === player.id) {
    form.button("§aINVITE A HUNTER", BLANK, async () => {
      const t = await pickPlayer(player, "Invite to party", (x) => !!partyOf(x));
      if (t) toast(player, invite(player, t), "§aInvitation sent");
      return "party";
    });
  }
  if (p && p.leader === player.id && p.members.length > 1) {
    form.button("§7Remove a member", BLANK, async () => {
      const t = await pickPlayer(player, "Remove from party", (x) => !p.members.includes(x.id));
      if (t) toast(player, kick(player, t.id));
      return "party";
    });
    form.button("§7Give leadership", BLANK, async () => {
      const t = await pickPlayer(player, "New leader", (x) => !p.members.includes(x.id));
      if (t) toast(player, makeLeader(player, t.id));
      return "party";
    });
  }
  if (p) form.button("§cLEAVE PARTY", BLANK, () => (leave(player), "party"));
  form.button("§bBack", BLANK, () => "association");
  return form.show(player);
}

// ---------------------------------------------------------------- guild
export async function guildScreen(player) {
  const d = getData(player);
  const g = guildOf(player);
  const form = new SystemForm("list", "GUILD");
  frame(form, player, "quests");
  form.screenId = "guild";
  if (!g) {
    form.body([
      "§7You are not in a guild.",
      "",
      `§6Found a guild: §fLevel ${GUILD_MIN_LEVEL}+ and §6${GUILD_COST} gold §8(you: Lv ${d.level}, ${d.gold ?? 0} gold)`,
      "§7Guild members never hurt each other, wear the guild tag",
      "§7and share perks as the guild levels up:",
      ...GUILD_PERKS.map((p, i) => `§e Lv ${i + 1}: §7${p}`),
    ].join("\n"));
    for (const gi of guildInvitesOf(player)) {
      form.button(`§aJoin §6[${gi.tag}] ${gi.name}`, BLANK, () => (toast(player, joinGuild(player, gi.id), "§aWelcome to the guild!"), "guild"));
      form.button(`§7Decline [${gi.tag}]`, BLANK, () => (declineGuild(player, gi.id), "guild"));
    }
    form.button("§6FOUND A GUILD", BLANK, async () => {
      const res = await showForm(player, new ModalFormData().title("Found a Guild")
        .textField(`§7Costs §6${GUILD_COST} gold§7.\n\nGuild name (3-20)`, "Ahjin Guild")
        .textField("Tag (2-4 letters/digits)", "AHJ")
        .submitButton("Found"));
      if (res && !res.canceled && res.formValues) toast(player, createGuild(player, String(res.formValues[0]), String(res.formValues[1])), "§6Guild founded!");
      return "guild";
    });
    form.button("§bBack", BLANK, () => "association");
    return form.show(player);
  }
  const lvl = guildLevel(g);
  const role = roleOf(g, player.id);
  const officer = role === "officer" || role === "master";
  const next = GUILD_LEVELS[lvl];
  const members = Object.entries(g.members).sort((a, b) => ({ master: 0, officer: 1, member: 2 })[a[1].role] - ({ master: 0, officer: 1, member: 2 })[b[1].role]);
  const online = new Set(world.getAllPlayers().map((p) => p.id));
  form.body([
    `§6[${g.tag}] §l${g.name}§r  §7Level §e${lvl}`,
    `§7Guild XP: §f${g.xp}${next !== undefined ? `§8/${next}` : " §8(max)"}  §7Bank: §6${g.bank} gold`,
    `§7Members: §f${members.length}/${guildCap(g)}`,
    `§e"${g.notice}"`,
    "",
    "§bPerks:",
    ...GUILD_PERKS.map((p, i) => `${i < lvl ? "§a+" : "§8-"} Lv ${i + 1}: ${p}`),
    "",
    "§bMembers:",
    ...members.map(([id, m]) => `${online.has(id) ? "§a*" : "§8*"} ${m.role === "master" ? "§6[Master] " : m.role === "officer" ? "§b[Officer] " : ""}§f${m.name} §8(${m.contrib} contribution)`),
    "",
    "§8Guild XP: 1 per 10 gold deposited, plus every gate cleared by a member.",
  ].join("\n"));
  form.button("§6DEPOSIT GOLD", BLANK, async () => {
    const have = d.gold ?? 0;
    if (have <= 0) return toast(player, "You have no gold."), "guild";
    const res = await showForm(player, new ModalFormData().title("Deposit gold").slider(`§7You have §6${have} gold`, 1, Math.max(2, have), { defaultValue: Math.min(have, 100), valueStep: 1 }).submitButton("Deposit"));
    if (res && !res.canceled && res.formValues) toast(player, deposit(player, Math.min(have, Number(res.formValues[0]))), "§6Deposited");
    return "guild";
  });
  if (officer) {
    form.button("§aINVITE A HUNTER", BLANK, async () => {
      const t = await pickPlayer(player, "Invite to guild", (x) => !!guildOf(x));
      if (t) toast(player, inviteGuild(player, t), "§aInvitation sent");
      return "guild";
    });
    form.button("§7Write the guild notice", BLANK, async () => {
      const res = await showForm(player, new ModalFormData().title("Guild notice").textField("Notice (120)", g.notice, { defaultValue: g.notice }).submitButton("Save"));
      if (res && !res.canceled && res.formValues) toast(player, setNotice(player, res.formValues[0]), "§aSaved");
      return "guild";
    });
    form.button("§7Remove a member", BLANK, async () => {
      const list = members.filter(([id]) => id !== player.id);
      if (!list.length) return "guild";
      const res = await showForm(player, new ModalFormData().title("Remove member").dropdown("Member", list.map(([, m]) => m.name)).submitButton("Remove"));
      if (res && !res.canceled && res.formValues) {
        const [id, m] = list[Number(res.formValues[0])];
        if (await confirm(player, "Remove member", `Remove §f${m.name}§r from the guild?`)) toast(player, kickMember(player, id), "§7Removed");
      }
      return "guild";
    });
  }
  if (role === "master") {
    form.button("§7Change a member's role", BLANK, async () => {
      const list = members.filter(([id]) => id !== player.id);
      if (!list.length) return "guild";
      const roles = ["member", "officer", "master"];
      const res = await showForm(player, new ModalFormData().title("Roles")
        .dropdown("Member", list.map(([, m]) => `${m.name} (${m.role})`))
        .dropdown("New role", ["Member", "Officer", "Guild Master (you become Officer)"])
        .submitButton("Apply"));
      if (res && !res.canceled && res.formValues) {
        const [id] = list[Number(res.formValues[0])];
        const r = roles[Number(res.formValues[1])];
        if (r !== "master" || (await confirm(player, "Give the guild away", "Make them the Guild Master? You become an Officer."))) toast(player, setRole(player, id, r), "§aDone");
      }
      return "guild";
    });
    if (g.bank > 0) {
      form.button("§7Withdraw gold", BLANK, async () => {
        const res = await showForm(player, new ModalFormData().title("Withdraw").slider(`§7Bank: §6${g.bank}`, 1, Math.max(2, g.bank), { defaultValue: Math.min(100, g.bank), valueStep: 1 }).submitButton("Take"));
        if (res && !res.canceled && res.formValues) toast(player, withdraw(player, Math.min(g.bank, Number(res.formValues[0]))), "§6Taken");
        return "guild";
      });
    }
    form.button("§4Disband the guild", BLANK, async () => {
      if (await confirm(player, "Disband", `Disband §6[${g.tag}] ${g.name}§r for good? The bank gold goes to you.`)) toast(player, disbandGuild(player), "§7Disbanded");
      return "guild";
    });
  } else {
    form.button("§cLEAVE GUILD", BLANK, async () => {
      if (await confirm(player, "Leave guild", `Leave §6[${g.tag}] ${g.name}§r?`)) toast(player, leaveGuild(player), "§7You left");
      return "guild";
    });
  }
  form.button("§bBack", BLANK, () => "association");
  return form.show(player);
}

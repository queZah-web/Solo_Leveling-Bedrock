// Gate window (tap a gate) and the "Nearby Gates" list.
import { getData } from "../data.js";
import { enterDungeon, instances } from "../gates/dungeon.js";
import { colorOf, gateLabel, gates, gatesNear, minutesLeft, setGateUi } from "../gates/gates.js";
import { COLOR_NAMES, GATE_RANKS, lifetimeMin } from "../gates/ranks.js";
import { stopTracking, trackedGate, trackGate } from "../gates/tracking.js";
import { barTex, BLANK, SystemForm } from "./form.js";
import { frame } from "./frame.js";

/** playerId -> gate id shown in the gate window */
export const shownGate = new Map();

const DIRS = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
const dirTo = (from, to) => DIRS[(Math.round(Math.atan2(to.z - from.z, to.x - from.x) / (Math.PI / 4)) + 8) % 8];

export async function gateScreen(player) {
  const g = gates.get(shownGate.get(player.id));
  if (!g) return "gates";
  const r = GATE_RANKS[g.rank];
  const d = getData(player);
  const inst = instances.get(g.id);
  const left = minutesLeft(g);
  const form = new SystemForm("list", "GATE");
  frame(form, player, "quests");
  form.screenId = "gate";
  form.body(
    [
      gateLabel(g),
      "",
      `§7Recommended level: §f${r.level}+ §8(you: ${d.level})`,
      `§7Dungeon: §f${r.rooms} rooms + boss §8(${r.boss.name})`,
      `§7Hunters inside: §f${inst ? inst.members.size : 0}`,
      `§7Dungeon Break in: §c${left} min`,
      "",
      g.red ? "§c§lRED GATE: §r§cno way out until the boss is defeated. Rewards x1.5." : "§7You can leave through the exit gate at the start.",
      d.level < r.level ? "§c(!) This gate is above your level." : "",
    ].join("\n"),
  );
  form.button(inst?.state === "cleared" ? "§8Already cleared" : "§bENTER GATE", BLANK, () => {
    const err = enterDungeon(player, g);
    if (err) {
      player.onScreenDisplay.setActionBar(`§c${err}`);
      return "gate";
    }
    return undefined; // close the window, the dungeon takes over
  });
  form.button("§7All Gates", BLANK, () => "gates");
  return form.show(player);
}

const PER_PAGE = 8;
const listState = new Map(); // playerId -> { page, selected }

export async function gatesScreen(player) {
  const st = listState.get(player.id) ?? { page: 0, selected: undefined };
  listState.set(player.id, st);
  const list = gatesNear(player);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  st.page = Math.min(st.page, pages - 1);
  const sel = list.find((x) => x.g.id === st.selected) ?? list[0];
  const again = () => "gates";
  const toast = (m) => player.onScreenDisplay.setActionBar(m);

  const form = new SystemForm("army", "GATES");
  frame(form, player, "quests");
  form.screenId = "gates";
  const tracked = trackedGate(player);
  form.display(7, `§bOPEN GATES §f${list.length}   ${tracked ? `§aTRACKING ${GATE_RANKS[tracked.rank].rank}` : "§8not tracking"}`);
  form.slot(10, "<", BLANK, () => ((st.page = (st.page - 1 + pages) % pages), again()), "« Previous Page");
  form.display(11, `PAGE ${st.page + 1}/${pages}`);
  form.slot(12, ">", BLANK, () => ((st.page = (st.page + 1) % pages), again()), "Next Page »");
  form.slot(13, "REFRESH", BLANK, again);
  form.slot(14, "STOP", BLANK, () => (stopTracking(player), toast("§7Tracking stopped"), again()), "Stop tracking");
  form.slot(15, "BACK", BLANK, () => "quests", "« Back to Quests");

  list.slice(st.page * PER_PAGE, st.page * PER_PAGE + PER_PAGE).forEach(({ g, dist }, i) => {
    const r = GATE_RANKS[g.rank];
    const here = Number.isFinite(dist);
    form.slot(
      20 + i,
      `${g.red ? "§4RED " : r.color}${r.rank}-RANK\n§7${here ? `${Math.round(dist)}m` : "other dim"}${tracked?.id === g.id ? " §a*" : ""}`,
      `textures/sl/gates/${COLOR_NAMES[colorOf(g)]}`,
      () => ((st.selected = g.id), again()),
      `${gateLabel(g)} §7${here ? `${Math.round(dist)}m ${dirTo(player.location, g.loc)}` : "(other dimension)"}`,
    );
  });
  for (let i = list.slice(st.page * PER_PAGE, st.page * PER_PAGE + PER_PAGE).length; i < PER_PAGE; i++) form.display(20 + i, "", BLANK);

  if (sel) {
    const { g, dist } = sel;
    const r = GATE_RANKS[g.rank];
    const inst = instances.get(g.id);
    const total = lifetimeMin(g.rank);
    const left = minutesLeft(g);
    form.display(9, gateLabel(g));
    form.display(19, "", `textures/sl/gates/${COLOR_NAMES[colorOf(g)]}`);
    form.display(28, `§cCLOSES IN §f${left} min`, barTex("hp", left, total));
    form.display(29, `§bHUNTERS INSIDE §f${inst ? inst.members.size : 0}`, barTex("mp", inst ? inst.members.size : 0, 4));
    form.body(
      [
        `§7Coordinates: §e${Math.floor(g.loc.x)}, ${g.grounded ? Math.floor(g.loc.y) : "?"}, ${Math.floor(g.loc.z)}`,
        Number.isFinite(dist) ? `§7Distance: §f${Math.round(dist)}m §7(${dirTo(player.location, g.loc)})` : "§7In another dimension",
        `§7Boss: §c${r.boss.name}`,
        `§7Recommended: §fLv ${r.level}+ §8(you ${getData(player).level})`,
        g.red ? "§4Red Gate: no way out until the boss falls." : `§7Rooms: §f${r.rooms} + boss`,
      ].join("\n"),
    );
    const isTracked = tracked?.id === g.id;
    form.slot(33, isTracked ? "§aTRACKING" : "§bTRACK THIS GATE", BLANK, () => {
      trackGate(player, g.id);
      toast("§bFollow the glowing arrow on the ground");
      return undefined; // close so the hunter can walk
    }, "§bTrack this gate (arrow on the ground)");
    form.slot(34, "§7STOP", BLANK, () => (stopTracking(player), again()), "Stop tracking");
    form.slot(32, "§8Walk to the gate and tap it to enter", BLANK, again);
  } else {
    form.display(9, "§7No gate is open");
    form.display(19, "", BLANK);
    form.display(28, "", BLANK);
    form.display(29, "", BLANK);
    form.body("§7No gate is open right now.\n\n§8Gates open far from hunters (500-2000 blocks).\n§8Every new gate is announced in the chat.");
    for (const i of [32, 33, 34]) form.display(i, "", BLANK);
  }
  return form.show(player);
}

/** Registered so tapping a gate opens its window. */
export function registerGateUi(openSystem) {
  setGateUi((player, g) => {
    shownGate.set(player.id, g.id);
    openSystem(player, "gate");
  });
}

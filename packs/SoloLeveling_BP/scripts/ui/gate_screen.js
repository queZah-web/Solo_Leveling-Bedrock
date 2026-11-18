// Gate window (tap a gate) and the "Nearby Gates" list.
import { getData } from "../data.js";
import { enterDungeon, instances } from "../gates/dungeon.js";
import { gateLabel, gates, gatesNear, setGateUi } from "../gates/gates.js";
import { GATE_RANKS, GATE_LIFETIME_MIN } from "../gates/ranks.js";
import { BLANK, SystemForm } from "./form.js";
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
  const left = Math.max(0, Math.ceil((g.expires - Date.now()) / 60000));
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
      d.level < r.level ? "§c⚠ This gate is above your level." : "",
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
  form.button("§7Nearby Gates", BLANK, () => "gates");
  return form.show(player);
}

export async function gatesScreen(player) {
  const list = gatesNear(player);
  const form = new SystemForm("list", "NEARBY GATES");
  frame(form, player, "quests");
  form.screenId = "gates";
  form.body(
    list.length
      ? ["§bGates in this dimension:", "", "§7Gates appear near hunters from time to time.", `§7An uncleared gate breaks after ${GATE_LIFETIME_MIN} min.`].join("\n")
      : "§7No gate is open right now.\n\n§8Gates appear near hunters from time to time.",
  );
  for (const { g, dist } of list.slice(0, 8)) {
    form.button(`${gateLabel(g)} §f${Math.round(dist)}m ${dirTo(player.location, g.loc)}`, BLANK, () => {
      shownGate.set(player.id, g.id);
      return "gate";
    });
  }
  form.button("§bBack to Quests", BLANK, () => "quests");
  return form.show(player);
}

/** Registered so tapping a gate opens its window. */
export function registerGateUi(openSystem) {
  setGateUi((player, g) => {
    shownGate.set(player.id, g.id);
    openSystem(player, "gate");
  });
}

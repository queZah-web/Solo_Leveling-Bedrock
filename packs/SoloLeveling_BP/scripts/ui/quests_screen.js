// QUESTS tab: the Daily Quest "Preparation to Become Powerful".
import { getData } from "../data.js";
import { claimDaily, DAILY_REWARD_POINTS, DAILY_TASKS, dailyOf, isComplete, penaltyEnabled } from "../quests/daily.js";
import { instanceOf, leaveDungeon } from "../gates/dungeon.js";
import { BLANK, SystemForm } from "./form.js";
import { frame } from "./frame.js";

function textBar(cur, goal, len = 14) {
  const n = Math.round((Math.min(cur, goal) / goal) * len);
  return `§a${"|".repeat(n)}§8${"|".repeat(len - n)}`;
}

export async function questsScreen(player) {
  const q = dailyOf(player);
  const d = getData(player);
  const form = new SystemForm("list", "QUESTS");
  frame(form, player, "quests");
  const lines = [
    "§eDaily Quest: Preparation to Become Powerful",
    "",
    ...DAILY_TASKS.map((t) => {
      const cur = q[t.key] ?? 0;
      const done = cur >= t.goal;
      return `${done ? "§a[DONE]" : "§7[    ]"} §f${t.name} §8(${t.how})\n  ${textBar(cur, t.goal)} §f${cur}/${t.goal}`;
    }),
    "",
    `§bReward: §f+${DAILY_REWARD_POINTS} stat points, full recovery, XP`,
    penaltyEnabled() ? "§cWarning: failing it sends you to the Penalty Zone." : "§8Penalty Zone is off on this server.",
  ];
  if (d.penalty) lines.unshift("§c§lYOU ARE IN THE PENALTY ZONE", "");
  form.body(lines.join("\n"));
  const complete = isComplete(q);
  form.button(q.claimed ? "§8Reward claimed (come back tomorrow)" : complete ? "§aCLAIM REWARD" : "§8Complete all tasks to claim", BLANK, () => {
    const err = claimDaily(player);
    if (err) player.onScreenDisplay.setActionBar(`§c${err}`);
    return "quests";
  });
  form.button("§9NEARBY GATES", BLANK, () => "gates");
  form.button(d.jobPending ? "§6§lJOB CHANGE §r§6(choose your Job!)" : "§6JOB CHANGE", BLANK, () => "job");
  form.button("§eTITLES", BLANK, () => "titles");
  form.button("§bHUNTER ASSOCIATION §7(rankings)", BLANK, () => "association");
  form.button("§aPARTY", BLANK, () => "party");
  form.button("§6GUILD", BLANK, () => "guild");
  const inst = instanceOf(player);
  if (inst) {
    const canLeave = !inst.red || inst.state === "cleared";
    form.button(canLeave ? "§cLEAVE DUNGEON" : "§8Red Gate: no way out", BLANK, () => {
      if (!canLeave) return player.onScreenDisplay.setActionBar("§cDefeat the boss first."), "quests";
      leaveDungeon(player, "§b[System] §7You left the dungeon.");
      return undefined;
    });
  }
  form.button("§bBack to Status", BLANK, () => "profile");
  return form.show(player);
}

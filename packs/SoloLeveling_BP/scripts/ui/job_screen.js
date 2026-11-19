// JOB CHANGE and TITLES screens (opened from the QUESTS tab).
import { JOB_LEVEL, jobOf, JOBS, MONARCH_LEVEL, PICKABLE, TITLES, titleOf } from "../classes.js";
import { getData, markDirty } from "../data.js";
import { abandonTrial, chooseJob, startTrial, trialBlocker, trialOf } from "../quests/jobchange.js";
import { refreshTag, wearTitle } from "../progression.js";
import { BLANK, SystemForm } from "./form.js";
import { frame } from "./frame.js";

function bar(cur, goal, len = 12) {
  const n = Math.round((Math.min(cur, goal) / goal) * len);
  return `§a${"|".repeat(n)}§8${"|".repeat(len - n)}`;
}

export async function jobScreen(player) {
  const d = getData(player);
  const j = jobOf(d);
  const form = new SystemForm("list", "JOB CHANGE");
  frame(form, player, "quests");
  form.screenId = "job";
  const lines = [];
  if (j) {
    lines.push(`§7Your Job: ${j.color}§l${j.name}`, "", ...j.desc.map((l) => `§f- ${l}`));
    if (j === JOBS.necromancer) lines.push("", `§5Awakening: §7Shadow Monarch at level ${MONARCH_LEVEL} §8(now ${d.level})`);
  } else if (d.jobPending) {
    lines.push("§6§lQUEST COMPLETE", "", "§fThe System offers you a Job. Choose it below.");
  } else {
    lines.push(
      "§6Job Change Quest",
      "",
      `§7Requirement: §fLevel ${JOB_LEVEL} §8(you: ${d.level})`,
      "§7Enter a hall in the sky §falone§7, defeat three waves of knights",
      "§7and their commander, §4Igris§7, within 15 minutes.",
      "§7Dying fails the quest (your items come back to you).",
      "",
      "§6Jobs you can choose:",
      ...PICKABLE.map((k) => `${JOBS[k].color}${JOBS[k].name}§8: §7${JOBS[k].desc[0]}`),
    );
  }
  form.body(lines.join("\n"));
  if (!j && d.jobPending) {
    form.button("§6§lCHOOSE YOUR JOB", BLANK, async () => {
      await chooseJob(player);
      return "job";
    });
  } else if (!j && trialOf(player)) {
    form.button("§cABANDON THE TRIAL", BLANK, () => {
      abandonTrial(player);
      return undefined;
    });
  } else if (!j) {
    const why = trialBlocker(player);
    form.button(why ? `§8${why}` : "§6§lSTART THE JOB CHANGE QUEST", BLANK, () => {
      const err = startTrial(player);
      if (err) {
        player.onScreenDisplay.setActionBar(`§c${err}`);
        return "job";
      }
      return undefined;
    });
  }
  form.button("§eTITLES", BLANK, () => "titles");
  form.button("§bBack to Quests", BLANK, () => "quests");
  return form.show(player);
}

export async function titlesScreen(player) {
  const d = getData(player);
  d.titles ??= [];
  const cur = titleOf(d);
  const form = new SystemForm("list", "TITLES");
  frame(form, player, "quests");
  form.screenId = "titles";
  const lines = [`§7Wearing: ${cur ? `${cur.color}${cur.name}` : "§8nothing"}`, ""];
  for (const t of TITLES) {
    const own = d.titles.includes(t.id);
    const [c, g] = t.need(d);
    lines.push(own ? `${t.color}§l${t.name}` : `§8${t.name}`);
    lines.push(own ? `  §a${t.effect}` : `  §7${t.how} ${g > 1 ? `${bar(c, g)} §f${Math.min(c, g)}/${g}` : ""}`);
  }
  form.body(lines.join("\n"));
  for (const t of TITLES) {
    if (!d.titles.includes(t.id)) continue;
    const on = cur?.id === t.id;
    form.button(`${on ? "§a> " : ""}${t.color}${t.name}`, BLANK, () => {
      wearTitle(player, on ? undefined : t.id);
      player.playSound("random.orb", { pitch: 1.3 });
      return "titles";
    });
  }
  form.button(`§7Show Job & Title above my head: ${d.showTitle !== false ? "§aON" : "§cOFF"}`, BLANK, () => {
    d.showTitle = d.showTitle === false;
    markDirty(player);
    refreshTag(player);
    return "titles";
  });
  form.button("§bBack", BLANK, () => "job");
  return form.show(player);
}

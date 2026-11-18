// Common System frame: 0 close, 1..5 tabs, 6 header (name / level / xp).
import { MAX_LEVEL, xpToNext } from "../config.js";
import { getData } from "../data.js";
import { barTex, BLANK, TEX } from "./form.js";

const TABS = [
  ["profile", "STATUS"],
  ["inventory", "INVENTORY"],
  ["shadows", "SHADOWS"],
  ["quests", "QUESTS"],
  ["settings", "SETTINGS"],
];

/** Common frame: 0 close, 1..5 tabs, 6 header. */
export function frame(form, player, active) {
  const d = getData(player);
  form.screenId = active;
  form.slot(0, "CLOSE [X]", BLANK, () => undefined);
  TABS.forEach(([id, label], i) => {
    form.slot(i + 1, label, id === active ? TEX + "tab_active" : BLANK, () => id);
  });
  const next = xpToNext(d.level);
  const xpText = d.level >= MAX_LEVEL ? "MAX" : `${d.xp}/${next}`;
  form.display(
    6,
    `§bHUNTER: §f${player.name}  §eLV ${d.level} §7(${xpText})`,
    barTex("xp", d.level >= MAX_LEVEL ? 1 : d.xp, d.level >= MAX_LEVEL ? 1 : next),
  );
}

// SHADOWS tab: Army Management. Layout "sl:army|" (index map in tools/gen_ui.py).
// Tapping a shadow card opens its Shadow Profile (ui/shadow_screen.js).
import { activeCount, arise, callAll, corpsesNear, dismissAll, entityOf, regenLeft, summonAll } from "../army/army.js";
import {
  activeLimit, ARISE_MP, armyCapacity, GRADES, nextRankLimits, portraitOf, RANK_LIMITS,
} from "../army/types.js";
import { maxMp } from "../config.js";
import { getData } from "../data.js";
import { barTex, BLANK, SystemForm } from "./form.js";
import { frame } from "./frame.js";

const PER_PAGE = 8;
/** Per-player UI state shared with the Shadow Profile. */
export const armyState = new Map();

export const stateOf = (player) => {
  let st = armyState.get(player.id);
  if (!st) armyState.set(player.id, (st = { page: 0, selected: undefined, confirm: false, bagSel: -1 }));
  return st;
};

function shortName(s) {
  const n = s.name.replace(/^Shadow /, "");
  return n.length > 9 ? n.slice(0, 8) + "." : n;
}

export async function armyScreen(player) {
  const st = stateOf(player);
  const d = getData(player);
  const cap = armyCapacity(d.level);
  const lim = activeLimit(d.level, d.int);
  const list = [...d.shadows].sort((a, b) => b.grade - a.grade || b.level - a.level || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  st.page = Math.min(st.page, pages - 1);
  const again = () => "shadows";
  const toast = (msg) => player.onScreenDisplay.setActionBar(msg);

  const form = new SystemForm("army", "ARMY MANAGEMENT");
  frame(form, player, "shadows");
  const act = activeCount(player);
  form.display(7, `§5ARMY §f${list.length}/${cap}   §bACTIVE §f${act}/${lim}`);

  form.slot(10, "<", BLANK, () => ((st.page = (st.page - 1 + pages) % pages), again()), "« Previous Page");
  form.display(11, `PAGE ${st.page + 1}/${pages}`);
  form.slot(12, ">", BLANK, () => ((st.page = (st.page + 1) % pages), again()), "Next Page »");

  form.slot(13, "SUMMON ALL", BLANK, async () => {
    const n = await summonAll(player);
    toast(n ? `§5${n} shadow${n > 1 ? "s" : ""} answered your call` : "§7No shadow could be summoned (MP / limit)");
    return again();
  });
  form.slot(14, "CALL", BLANK, () => {
    const n = callAll(player);
    toast(n ? `§b${n} shadow${n > 1 ? "s" : ""} returned to you` : "§7No summoned shadows");
    return again();
  }, "Call Shadows (teleport to you)");
  form.slot(15, "DISMISS ALL", BLANK, async () => {
    await dismissAll(player);
    toast("§7All shadows returned to your shadow");
    return again();
  });

  // Right panel: army overview.
  const mmax = maxMp(d.int);
  const next = nextRankLimits(d.level);
  const cur = RANK_LIMITS.find((r) => d.level >= r.min);
  form.display(9, "§5SHADOW MONARCH'S ARMY");
  form.display(19, "", list[0] ? portraitOf(list[0].type) : BLANK);
  form.display(28, `§9MP §f${Math.floor(d.mp)}/${mmax}`, barTex("mp", d.mp, mmax));
  form.display(29, `§5ARMY §f${list.length}/${cap}`, barTex("xp", list.length, cap));
  form.body(
    [
      `§7Rank: §f${cur?.rank ?? "E-Rank"}  §7Active: §b${act}/${lim}`,
      next
        ? `§7Next: §e${next.rank} §7(Lv ${next.min}) §8→ §fArmy ${next.army}, Active ${next.active}`
        : "§6Maximum rank reached.",
      "§8+1 army slot every 2 levels, +1 active per 10 INT.",
      "",
      "§5ARISE§7: kill a monster, then within 20s",
      `§7Sneak + use the Gem or §f/arise §8(${ARISE_MP} MP)`,
      "§7Tap a shadow to open its profile.",
      "§7Sneak + tap a summoned shadow: same.",
    ].join("\n"),
  );
  const souls = corpsesNear(player).length;
  form.slot(32, souls ? `§5ARISE (${souls} soul${souls > 1 ? "s" : ""} nearby)` : "§8ARISE - no soul nearby", BLANK, () => {
    if (souls) arise(player);
    else toast("§7No soul to extract nearby.");
    return again();
  });

  // Cards
  const pageList = list.slice(st.page * PER_PAGE, st.page * PER_PAGE + PER_PAGE);
  for (let i = 0; i < PER_PAGE; i++) {
    const s = pageList[i];
    const idx = 20 + i;
    if (!s) {
      form.display(idx, "", BLANK);
      continue;
    }
    const g = GRADES[s.grade];
    const dot = entityOf(player, s.id) ? "§a" : regenLeft(s) > 0 ? "§c" : "§f";
    form.slot(
      idx,
      `${dot}${shortName(s)}\n${g.color}${g.rank} §7Lv${s.level}`,
      portraitOf(s.type),
      () => {
        st.selected = s.id;
        st.confirm = false;
        st.bagSel = -1;
        return "shadow";
      },
      `${g.color}[${g.rank}] §f${s.name} §7Lv${s.level}`,
    );
  }

  return form.show(player);
}

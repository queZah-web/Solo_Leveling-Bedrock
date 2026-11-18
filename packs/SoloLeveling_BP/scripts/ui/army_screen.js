// SHADOWS tab: Army Management. Layout "sl:army|" (index map in tools/gen_ui.py).
import { ModalFormData } from "@minecraft/server-ui";
import {
  activeCount, arise, callAll, corpsesNear, dismiss, dismissAll, entityOf, feed, regenLeft, release, rename,
  summon, summonAll, train,
} from "../army/army.js";
import {
  activeLimit, ARISE_MP, armyCapacity, FEED_MP, GRADES, portraitOf, SHADOW_MAX_LEVEL, SHADOW_TYPES, shadowAtkMult,
  shadowDefMult, shadowXpToNext, TRAIN_MP,
} from "../army/types.js";
import { getData } from "../data.js";
import { barTex, BLANK, showForm, SystemForm } from "./form.js";
import { frame } from "./frame.js";

const PER_PAGE = 8;
/** @type {Map<string, {page:number, selected:string|undefined, confirm:boolean}>} */
const states = new Map();

const stateOf = (player) => {
  let st = states.get(player.id);
  if (!st) states.set(player.id, (st = { page: 0, selected: undefined, confirm: false }));
  return st;
};

/** Short name for the small cards. */
function shortName(s) {
  const n = s.name.replace(/^Shadow /, "");
  return n.length > 9 ? n.slice(0, 8) + "." : n;
}

export async function armyScreen(player) {
  const st = stateOf(player);
  const d = getData(player);
  const cap = armyCapacity(d.level);
  const lim = activeLimit(d.level, d.int);
  // Strongest first.
  const list = [...d.shadows].sort((a, b) => b.grade - a.grade || b.level - a.level || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  st.page = Math.min(st.page, pages - 1);
  const sel = list.find((s) => s.id === st.selected);
  if (!sel) st.confirm = false;
  const again = () => "shadows";
  const toast = (msg) => player.onScreenDisplay.setActionBar(msg);
  const report = (err, ok) => toast(err ? `§c${err}` : ok);

  const form = new SystemForm("army", "ARMY MANAGEMENT");
  frame(form, player, "shadows");

  form.display(7, `§5ARMY §f${list.length}/${cap}   §bACTIVE §f${activeCount(player)}/${lim}`);

  // pager
  form.slot(10, "<", BLANK, () => ((st.page = (st.page - 1 + pages) % pages), again()), "« Previous Page");
  form.display(11, `PAGE ${st.page + 1}/${pages}`);
  form.slot(12, ">", BLANK, () => ((st.page = (st.page + 1) % pages), again()), "Next Page »");

  // army-wide actions
  form.slot(13, "SUMMON ALL", BLANK, () => {
    const n = summonAll(player);
    toast(n ? `§5${n} shadow${n > 1 ? "s" : ""} answered your call` : "§7No shadow could be summoned (MP / limit)");
    return again();
  });
  form.slot(14, "CALL", BLANK, () => {
    const n = callAll(player);
    toast(n ? `§b${n} shadow${n > 1 ? "s" : ""} returned to you` : "§7No summoned shadows");
    return again();
  }, "Call Shadows (teleport to you)");
  form.slot(15, "DISMISS ALL", BLANK, () => {
    dismissAll(player);
    toast("§7All shadows returned to your shadow");
    return again();
  });

  // selected shadow
  if (sel) {
    const g = GRADES[sel.grade];
    const def = SHADOW_TYPES[sel.type];
    const e = entityOf(player, sel.id);
    const regen = regenLeft(sel);
    const h = e?.getComponent("minecraft:health");
    const hpCur = h ? Math.ceil(h.currentValue) : regen > 0 ? 0 : 1;
    const hpMax = h ? Math.round(h.effectiveMax) : 1;
    const next = shadowXpToNext(sel.level);
    const maxed = sel.level >= SHADOW_MAX_LEVEL;

    form.display(9, `${g.color}${sel.name} §7[Rank ${g.rank}]`);
    form.display(19, "", portraitOf(sel.type));
    form.display(28, h ? `§cHP §f${hpCur}/${hpMax}` : regen > 0 ? `§cREGENERATING §f${regen}s` : "§7HP §fFULL", barTex("hp", hpCur, hpMax));
    form.display(29, maxed ? "§eXP §fMAX" : `§eXP §f${sel.xp}/${next}`, barTex("xp", maxed ? 1 : sel.xp, maxed ? 1 : next));
    const status = e ? "§aSUMMONED" : regen > 0 ? `§cREGENERATING (${regen}s)` : "§7IN SHADOW";
    form.body(
      [
        `§7${def.label} §8| ${g.color}${g.name}`,
        `§7Level §f${sel.level}  §7Kills §f${sel.kills}`,
        `§7ATK §cx${shadowAtkMult(sel).toFixed(2)}  §7DEF §a${Math.round((1 - shadowDefMult(sel)) * 100)}%%`,
        `§7Status: ${status}`,
        `§7Summon cost: §9${g.cost} MP`,
        `§5${def.skill}§7: ${def.skillDesc}`,
      ].join("\n"),
    );

    form.slot(16, e ? "DISMISS" : "SUMMON", BLANK, () => {
      if (e) {
        dismiss(player, sel.id);
        toast(`§7${sel.name} returned to your shadow`);
      } else report(summon(player, sel), `§5${sel.name} §fhas been summoned`);
      return again();
    });
    form.slot(17, `FEED §9${FEED_MP}`, BLANK, () => (report(feed(player, sel.id), `§a${sel.name} is restored`), again()), `Feed (${FEED_MP} MP)`);
    form.slot(18, `TRAIN §9${TRAIN_MP}`, BLANK, () => (report(train(player, sel.id), `§e${sel.name} trained`), again()), `Train (${TRAIN_MP} MP)`);
    form.slot(30, "RENAME", BLANK, async () => {
      const res = await showForm(
        player,
        new ModalFormData().title("Rename Shadow").textField("New name", sel.name, { defaultValue: sel.name }).submitButton("Rename"),
      );
      if (res && !res.canceled && typeof res.formValues?.[0] === "string") rename(player, sel.id, res.formValues[0]);
      return again();
    });
    form.slot(31, st.confirm ? "CONFIRM?" : "RELEASE", BLANK, () => {
      if (!st.confirm) {
        st.confirm = true;
        return again();
      }
      release(player, sel.id);
      toast(`§8${sel.name} has been released`);
      st.selected = undefined;
      st.confirm = false;
      return again();
    }, st.confirm ? "§cConfirm Release" : "§cRelease Shadow");
  } else {
    form.display(9, list.length ? "§7Select a shadow" : "§7Your army is empty");
    form.display(19, "", BLANK);
    form.display(28, "", BLANK);
    form.display(29, "", BLANK);
    form.body(
      [
        "§5Shadow Extraction",
        "§7Defeat a monster, then within 20s:",
        "§fSneak + use the System Gem",
        "§7or type §f/arise §7near it.",
        `§8${ARISE_MP} MP per attempt, 3 attempts.`,
      ].join("\n"),
    );
    for (const i of [16, 17, 18, 30, 31]) form.display(i, "", BLANK);
  }

  const souls = corpsesNear(player).length;
  form.slot(32, souls ? `§5ARISE (${souls})` : "§8ARISE", BLANK, () => {
    if (souls) arise(player);
    else toast("§7No soul to extract nearby.");
    return again();
  }, souls ? `§5ARISE (${souls} soul${souls > 1 ? "s" : ""} nearby)` : undefined);

  // cards
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
      `${s.id === st.selected ? "*" : ""}${dot}${shortName(s)}\n${g.color}${g.rank} §7Lv${s.level}`,
      portraitOf(s.type),
      () => {
        st.selected = st.selected === s.id ? undefined : s.id;
        st.confirm = false;
        return again();
      },
      `${s.id === st.selected ? "§a> " : ""}${g.color}[${g.rank}] §f${s.name} §7Lv${s.level}`,
    );
  }

  return form.show(player);
}

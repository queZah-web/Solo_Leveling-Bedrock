// SKILLS tab (reuses the "sl:army|" layout: 8 cards + detail panel) and the
// quick-cast menu (Sneak + use the System Gem, or /skill).
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { maxMp } from "../config.js";
import { getData, markDirty } from "../data.js";
import { bonusOf, skillCooldown, skillCost } from "../classes.js";
import { cast, cooldownLeft, equipSkill, quickSlots, SKILL_BY_ID, skillIcon, SKILLS } from "../skills/skills.js";
import { barTex, BLANK, showForm, SystemForm } from "./form.js";
import { frame } from "./frame.js";

const selected = new Map(); // playerId -> skill id

export async function skillsScreen(player) {
  const d = getData(player);
  const again = () => "skills";
  const toast = (msg) => player.onScreenDisplay.setActionBar(msg);
  const sel = SKILL_BY_ID[selected.get(player.id)] ?? SKILLS[0];
  const slots = quickSlots(player);
  const mmax = maxMp(d.int);

  const form = new SystemForm("army", "SKILLS");
  frame(form, player, "skills");
  const unlocked = SKILLS.filter((s) => d.level >= s.level).length;
  form.display(7, `§bSKILLS §f${unlocked}/${SKILLS.length}   §9MP §f${Math.floor(d.mp)}/${mmax}`);
  form.display(10, "");
  form.display(11, "§7Tap a skill");
  form.display(12, "");

  form.slot(13, "QUICK MENU", BLANK, async () => {
    await quickMenu(player);
    return again();
  }, "Open the Quick Skill menu");
  form.slot(14, "UNEQUIP", BLANK, () => {
    const i = slots.indexOf(sel.id);
    if (i >= 0) {
      slots[i] = null;
      markDirty(player);
      toast(`§7${sel.name} removed from slot ${i + 1}`);
    } else toast(`§7${sel.name} is not in a quick slot`);
    return again();
  });
  form.display(15, "§8/skill 1-4");

  // Cards
  SKILLS.forEach((s, i) => {
    const locked = d.level < s.level;
    const slot = slots.indexOf(s.id);
    const mark = slot >= 0 ? `§e[${slot + 1}] ` : "";
    form.slot(
      20 + i,
      `${locked ? "§8" : s.color}${s.name.length > 10 ? s.name.slice(0, 9) + "." : s.name}\n${locked ? `§8LOCK Lv${s.level}` : `${mark}§7${skillCost(bonusOf(d), s)} MP`}`,
      skillIcon(s.id),
      () => {
        selected.set(player.id, s.id);
        return again();
      },
      `${locked ? "§8" : s.color}${s.name} §7${locked ? `(Lv ${s.level})` : `${skillCost(bonusOf(d), s)} MP`}${mark ? " " + mark : ""}`,
    );
  });

  // Details
  const locked = d.level < sel.level;
  const cd = cooldownLeft(player, sel.id);
  form.display(9, `${sel.color}${sel.name}`);
  form.display(19, "", skillIcon(sel.id));
  form.display(28, `§9MP §f${Math.floor(d.mp)}/${mmax}`, barTex("mp", d.mp, mmax));
  form.display(29, cd > 0 ? `§6COOLDOWN §f${cd}s` : "§aREADY", barTex("stamina", sel.cd - cd, sel.cd));
  form.body(
    [
      `§f${sel.desc}`,
      "",
      `§9MP: §f${skillCost(bonusOf(d), sel)}   §6Cooldown: §f${skillCooldown(bonusOf(d), sel)}s`,
      locked ? `§cUnlocks at level ${sel.level}` : "§aUnlocked",
      `§7Quick slots: ${slots.map((id, i) => `§e${i + 1}§7:${id ? SKILL_BY_ID[id].name : "-"}`).join(" ")}`,
    ].join("\n"),
  );
  form.slot(33, locked ? "§8EQUIP TO QUICK SLOT" : "EQUIP TO QUICK SLOT", BLANK, async () => {
    if (locked) return toast(`§cUnlocks at level ${sel.level}`), again();
    const res = await showForm(
      player,
      new ModalFormData()
        .title(`Equip ${sel.name}`)
        .dropdown("Quick slot", slots.map((id, i) => `Slot ${i + 1}: ${id ? SKILL_BY_ID[id].name : "empty"}`), {
          defaultValueIndex: Math.max(0, slots.indexOf(null)),
        })
        .submitButton("Equip"),
    );
    if (res && !res.canceled && res.formValues) {
      equipSkill(player, Number(res.formValues[0]), sel.id);
      toast(`§a${sel.name} → slot ${Number(res.formValues[0]) + 1}`);
    }
    return again();
  });
  form.slot(32, locked ? "§8CAST" : cd > 0 ? `§8CAST (${cd}s)` : `${sel.color}CAST ${sel.name.toUpperCase()}`, BLANK, () => {
    const err = cast(player, sel.id);
    if (err) {
      toast(`§c${err}`);
      return again();
    }
    return undefined; // close so the player sees the effect
  });

  return form.show(player);
}

/** Compact quick-cast menu with the 4 equipped skills. */
export async function quickMenu(player) {
  const d = getData(player);
  const slots = quickSlots(player);
  const form = new ActionFormData().title("§5Quick Skills").body(`§9MP ${Math.floor(d.mp)}/${maxMp(d.int)}`);
  const map = [];
  slots.forEach((id, i) => {
    const sk = id && SKILL_BY_ID[id];
    if (!sk) {
      form.button(`§8${i + 1}. empty`);
      map.push(undefined);
      return;
    }
    const cd = cooldownLeft(player, id);
    form.button(`${sk.color}${i + 1}. ${sk.name}\n§r§7${cd > 0 ? `cooldown ${cd}s` : `${skillCost(bonusOf(d), sk)} MP`}`, skillIcon(id));
    map.push(id);
  });
  const res = await showForm(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  const id = map[res.selection];
  if (!id) return player.onScreenDisplay.setActionBar("§7Equip skills in the SKILLS tab");
  const err = cast(player, id);
  if (err) player.onScreenDisplay.setActionBar(`§c${err}`);
}

/** /skill <n> */
export function castSlot(player, n) {
  const id = quickSlots(player)[n - 1];
  if (!id) return player.onScreenDisplay.setActionBar(`§7Quick slot ${n} is empty`);
  const err = cast(player, id);
  if (err) player.onScreenDisplay.setActionBar(`§c${err}`);
}

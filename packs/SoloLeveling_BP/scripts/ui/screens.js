// The System window: STATUS (profile), INVENTORY, SHADOWS, QUESTS, SETTINGS.
// Each screen returns the id of the next screen to open (or undefined = close).
import { ModalFormData } from "@minecraft/server-ui";
import {
  agiSpeed, critChance, FATIGUE_HEAVY, MAX_LEVEL, maxMp, mpRegenPerSec, STATS,
  strDamageMult, vitReduction, xpToNext,
} from "../config.js";
import { getData, markDirty } from "../data.js";
import { allocate, getHealth, rankOf } from "../stats.js";
import { barTex, BLANK, showForm, SystemForm, TEX } from "./form.js";
import { frame } from "./frame.js";
import { armyScreen } from "./army_screen.js";
import { questsScreen } from "./quests_screen.js";
import { gateScreen, gatesScreen, registerGateUi } from "./gate_screen.js";
import { skillsScreen } from "./skills_screen.js";
import { shopScreen } from "./shop_screen.js";
import { shadowScreen } from "./shadow_screen.js";
import { endVault, vaultScreen } from "./vault_screen.js";
import { jobScreen, titlesScreen } from "./job_screen.js";
import { jobOf, titleOf } from "../classes.js";

// ---------------------------------------------------------------- STATUS
async function profileScreen(player) {
  const d = getData(player);
  const rank = rankOf(d.level);
  const hp = getHealth(player);
  const mpMax = maxMp(d.int);
  const pct = (v) => Math.round(v * 100);

  const form = new SystemForm("profile", "HUNTER PROFILE & STATS");
  frame(form, player, "profile");
  form.body(
    [
      `§7Name: §f${player.name}`,
      `§7Rank: ${rank.color}${rank.name}`,
      `§7Job: ${jobOf(d) ? jobOf(d).color + d.job : d.jobPending ? "§6choose one (QUESTS)" : "§fNone"}`,
      `§7Title: ${titleOf(d) ? titleOf(d).color + titleOf(d).name : "§fNone"}`,
      `§7Kills: §f${d.kills}  §6Gold: §f${d.gold ?? 0}`,
      "",
      "§bBONUSES",
      `§7Melee DMG: §c+${pct(strDamageMult(d.str) - 1)}%%`,
      `§7Crit Chance: §d${pct(critChance(d.per))}%%`,
      `§7Damage Taken: §6-${pct(vitReduction(d.vit))}%%`,
      `§7Speed Tier: §a${agiSpeed(d.agi) + 1}`,
      `§7MP Regen: §9${mpRegenPerSec(d.int).toFixed(1)}/s`,
      "",
      d.points > 0 ? `§aAvailable Points: §f${d.points}` : "§7Available Points: 0",
    ].join("\n"),
  );

  STATS.forEach((st, i) => {
    const can = d.points > 0;
    form.slot(7 + i, `${st.color}${st.short}§r  §f${d[st.key]}`, TEX + (can ? "plus" : "plus_off"), () => {
      if (allocate(player, st.key, 1)) player.playSound("random.orb", { pitch: 1.4 });
      else player.sendMessage("§b[System] §7No stat points available.");
      return "profile";
    });
  });

  form.display(12, `§cHP §f${hp.cur} / ${hp.max}`, barTex("hp", hp.cur, hp.max));
  form.display(13, `§9MP §f${Math.floor(d.mp)} / ${mpMax}`, barTex("mp", d.mp, mpMax));
  const fc = d.fatigue >= FATIGUE_HEAVY ? "§c" : "§6";
  form.display(14, `${fc}FATIGUE §f${Math.floor(d.fatigue)}`, barTex("fatigue", d.fatigue, 100));

  form.slot(16, "SETTINGS", BLANK, () => "settings", "Settings");
  form.slot(15, d.points > 0 ? `§aDISTRIBUTE (${d.points})` : "§7NO POINTS", BLANK, async () => {
    if (d.points > 0) await allocateDialog(player);
    return "profile";
  });

  return form.show(player);
}

async function allocateDialog(player) {
  const d = getData(player);
  const form = new ModalFormData()
    .title("Distribute Stat Points")
    .dropdown(`§7Available points: §a${d.points}\n\n§fStat`, STATS.map((s) => `${s.name} (${d[s.key]}) - ${s.desc}`))
    .slider("Points", 0, d.points, { defaultValue: d.points, valueStep: 1 })
    .submitButton("Apply");
  const res = await showForm(player, form);
  if (!res || res.canceled || !res.formValues) return;
  const [statIdx, amount] = /** @type {number[]} */ (res.formValues);
  const st = STATS[statIdx];
  if (st && amount > 0 && allocate(player, st.key, amount)) {
    player.sendMessage(`§b[System] §f${st.name} §a+${amount}`);
    player.playSound("random.orb", { pitch: 1.2 });
  }
}

// ---------------------------------------------------------------- SETTINGS
async function settingsScreen(player) {
  const d = getData(player);
  const form = new SystemForm("list", "SETTINGS");
  frame(form, player, "settings");
  form.screenId = "settings";
  form.body(
    [
      "§bCustom UI§7: the System skin. Turn it off if the window looks broken on your device.",
      "",
      "§bHUD§7: shows HP / MP / Level / Fatigue above the hotbar.",
      "",
      "§7Open the System anytime with §f/system §7or by using the §5System Gem§7.",
    ].join("\n"),
  );
  form.button(`Custom UI: ${d.customUi ? "§aON" : "§cOFF"}`, BLANK, () => {
    d.customUi = !d.customUi;
    markDirty(player);
    return "settings";
  });
  form.button(`HUD: ${d.hud ? "§aON" : "§cOFF"}`, BLANK, () => {
    d.hud = !d.hud;
    markDirty(player);
    if (!d.hud) player.onScreenDisplay.setActionBar(" ");
    return "settings";
  });
  form.button("§bBack to Status", BLANK, () => "profile");
  return form.show(player);
}

const SCREENS = {
  profile: profileScreen,
  inventory: vaultScreen,
  shadows: armyScreen,
  shadow: shadowScreen,
  skills: skillsScreen,
  gate: gateScreen,
  shop: shopScreen,
  gates: gatesScreen,
  quests: questsScreen,
  settings: settingsScreen,
  job: jobScreen,
  titles: titlesScreen,
};

const open = new Set();

/** Opens the System window for a player (ignored if already open). */
export async function openSystem(player, start = "profile") {
  if (open.has(player.id)) return;
  open.add(player.id);
  try {
    let next = start;
    let guard = 0;
    while (next && player.isValid && guard++ < 500) {
      const screen = SCREENS[next];
      if (!screen) break;
      const current = next;
      next = await screen(player);
      if (current === "inventory" && next !== "inventory" && next !== "shop") endVault(player);
    }
  } catch (e) {
    console.warn(`[SL] UI error: ${e}`);
    try {
      player.sendMessage(`§b[System] §c${e?.message ?? e}`);
    } catch {}
  } finally {
    endVault(player);
    open.delete(player.id);
  }
}

registerGateUi(openSystem);

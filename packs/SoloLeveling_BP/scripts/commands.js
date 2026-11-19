// Slash commands. /system works for everyone (no cheats needed).
// Admin commands need operator permission.
import {
  CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, system,
} from "@minecraft/server";
import { BASE_STAT, maxMp, STATS } from "./config.js";
import { getData, markDirty, resetData } from "./data.js";
import { addXp, applyStatEffects, setLevel } from "./stats.js";
import { arise } from "./army/army.js";
import { setPenaltyEnabled } from "./quests/daily.js";
import { createGate, setNaturalGates } from "./gates/gates.js";
import { RANK_INDEX } from "./gates/ranks.js";
import { endPenalty, startPenalty } from "./quests/penalty.js";
import { openSystem } from "./ui/screens.js";
import { castSlot, quickMenu } from "./ui/skills_screen.js";
import { jobOf } from "./classes.js";
import { refreshTag } from "./progression.js";

const ok = (message) => ({ status: CustomCommandStatus.Success, message });
const fail = (message) => ({ status: CustomCommandStatus.Failure, message });

/** Targets from the optional selector, or the command sender. */
function targetsOf(origin, targets) {
  if (targets?.length) return targets;
  const src = origin.sourceEntity ?? origin.initiator;
  return src instanceof Player ? [src] : [];
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry: reg }) => {
  reg.registerCommand(
    {
      name: "sl:system",
      description: "Open the System window",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const p = origin.sourceEntity ?? origin.initiator;
      if (!(p instanceof Player)) return fail("Only players can open the System.");
      system.run(() => openSystem(p));
      return ok();
    },
  );

  reg.registerCommand(
    {
      name: "sl:arise",
      description: "Extract a shadow from a nearby fallen enemy",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const p = origin.sourceEntity ?? origin.initiator;
      if (!(p instanceof Player)) return fail("Only players can use ARISE.");
      system.run(() => arise(p));
      return ok();
    },
  );

  reg.registerCommand(
    {
      name: "sl:skill",
      description: "Cast a quick skill (1-4), or open the Quick Skill menu",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      optionalParameters: [{ name: "slot", type: CustomCommandParamType.Integer }],
    },
    (origin, slot) => {
      const p = origin.sourceEntity ?? origin.initiator;
      if (!(p instanceof Player)) return fail("Only players can cast skills.");
      if (slot !== undefined && (slot < 1 || slot > 4)) return fail("Slot must be 1-4.");
      system.run(() => (slot ? castSlot(p, slot) : quickMenu(p)));
      return ok();
    },
  );

  reg.registerCommand(
    {
      name: "sl:penalty",
      description: "[Admin] Turn the daily quest Penalty Zone on or off",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "enabled", type: CustomCommandParamType.Boolean }],
    },
    (origin, enabled) => {
      system.run(() => setPenaltyEnabled(!!enabled));
      return ok(`Penalty Zone ${enabled ? "enabled" : "disabled"}.`);
    },
  );

  reg.registerCommand(
    {
      name: "sl:gate",
      description: "Open the Gates window (open gates, coordinates, tracking)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const p = origin.sourceEntity ?? origin.initiator;
      if (!(p instanceof Player)) return fail("Only players can view gates.");
      system.run(() => openSystem(p, "gates"));
      return ok();
    },
  );

  reg.registerEnum("sl:gaterank", ["E", "D", "C", "B", "A", "S"]);
  reg.registerCommand(
    {
      name: "sl:spawngate",
      description: "[Admin] Open a gate in front of you",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "sl:gaterank", type: CustomCommandParamType.Enum }],
      optionalParameters: [{ name: "red", type: CustomCommandParamType.Boolean }],
    },
    (origin, rank, red) => {
      const p = origin.sourceEntity ?? origin.initiator;
      if (!(p instanceof Player)) return fail("Run this as a player.");
      system.run(() => {
        const dir = p.getViewDirection();
        const loc = { x: p.location.x + dir.x * 4, y: p.location.y, z: p.location.z + dir.z * 4 };
        createGate(p.dimension, loc, RANK_INDEX[rank] ?? 0, !!red);
      });
      return ok(`Opening a ${rank}-Rank ${red ? "Red " : ""}Gate.`);
    },
  );

  reg.registerCommand(
    {
      name: "sl:gates",
      description: "[Admin] Turn natural gate spawning on or off",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "enabled", type: CustomCommandParamType.Boolean }],
    },
    (origin, enabled) => {
      system.run(() => setNaturalGates(!!enabled));
      return ok(`Natural gates ${enabled ? "enabled" : "disabled"}.`);
    },
  );

  const target = { name: "target", type: CustomCommandParamType.PlayerSelector };

  reg.registerCommand(
    {
      name: "sl:testpenalty",
      description: "[Admin] Send a hunter to the Penalty Zone now (for testing)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [target],
    },
    (origin, targets) => {
      const list = targetsOf(origin, targets);
      system.run(() =>
        list.forEach((p) => {
          if (getData(p).penalty) p.sendMessage("§c[System] §7Already in the Penalty Zone.");
          else startPenalty(p);
        }),
      );
      return ok(`Sent ${list.length} player(s) to the Penalty Zone.`);
    },
  );

  reg.registerCommand(
    {
      name: "sl:endpenalty",
      description: "[Admin] End a hunter's Penalty Zone now (counts as survived)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [target],
    },
    (origin, targets) => {
      const list = targetsOf(origin, targets);
      system.run(() => list.forEach((p) => getData(p).penalty && endPenalty(p, true)));
      return ok(`Ended the Penalty Zone for ${list.length} player(s).`);
    },
  );

  reg.registerCommand(
    {
      name: "sl:setlevel",
      description: "[Admin] Set a hunter's level",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "level", type: CustomCommandParamType.Integer }],
      optionalParameters: [target],
    },
    (origin, level, targets) => {
      const list = targetsOf(origin, targets);
      system.run(() => list.forEach((p) => setLevel(p, level)));
      return ok(`Level set to ${level} for ${list.length} player(s).`);
    },
  );

  reg.registerCommand(
    {
      name: "sl:addxp",
      description: "[Admin] Give System XP",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "amount", type: CustomCommandParamType.Integer }],
      optionalParameters: [target],
    },
    (origin, amount, targets) => {
      const list = targetsOf(origin, targets);
      system.run(() => list.forEach((p) => addXp(p, amount)));
      return ok(`Gave ${amount} XP to ${list.length} player(s).`);
    },
  );

  reg.registerCommand(
    {
      name: "sl:resetstats",
      description: "[Admin] Refund all stat points",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [target],
    },
    (origin, targets) => {
      const list = targetsOf(origin, targets);
      system.run(() =>
        list.forEach((p) => {
          const d = getData(p);
          const keep = jobOf(d)?.stats ?? {};
          for (const st of STATS) {
            const base = BASE_STAT + (keep[st.key] ?? 0);
            d.points += Math.max(0, d[st.key] - base);
            d[st.key] = Math.min(d[st.key], base);
          }
          d.mp = Math.min(d.mp, maxMp(d.int));
          markDirty(p);
          applyStatEffects(p, true);
        }),
      );
      return ok(`Stats refunded for ${list.length} player(s).`);
    },
  );

  reg.registerCommand(
    {
      name: "sl:resetjob",
      description: "[Admin] Remove a hunter's Job (they can take the Job Change Quest again)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [target],
    },
    (origin, targets) => {
      const list = targetsOf(origin, targets);
      system.run(() =>
        list.forEach((p) => {
          const d = getData(p);
          const j = jobOf(d);
          if (j) for (const [k, n] of Object.entries(j.stats)) d[k] = Math.max(BASE_STAT, d[k] - n);
          d.jobStats = 0;
          d.job = "None";
          d.jobPending = false;
          d.jobNotified = false;
          d.trialRetry = 0;
          d.mp = Math.min(d.mp, maxMp(d.int));
          markDirty(p);
          applyStatEffects(p, true);
          refreshTag(p);
          p.sendMessage("§6[System] §7Your Job was reset.");
        }),
      );
      return ok(`Job reset for ${list.length} player(s).`);
    },
  );

  reg.registerCommand(
    {
      name: "sl:passjobquest",
      description: "[Admin] Complete the Job Change Quest for a hunter (they choose a Job)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [target],
    },
    (origin, targets) => {
      const list = targetsOf(origin, targets);
      system.run(() =>
        list.forEach((p) => {
          const d = getData(p);
          if (d.job && d.job !== "None") return p.sendMessage("§6[System] §7You already have a Job.");
          d.jobPending = true;
          markDirty(p);
          p.sendMessage("§6[System] §fJob Change Quest completed. Choose your Job: §bSystem > QUESTS > JOB CHANGE§f.");
        }),
      );
      return ok(`Job Change Quest passed for ${list.length} player(s).`);
    },
  );

  reg.registerCommand(
    {
      name: "sl:resetplayer",
      description: "[Admin] Wipe a hunter's System data",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [target],
    },
    (origin, targets) => {
      const list = targetsOf(origin, targets);
      system.run(() =>
        list.forEach((p) => {
          resetData(p);
          applyStatEffects(p, true);
        }),
      );
      return ok(`Reset ${list.length} player(s).`);
    },
  );
});

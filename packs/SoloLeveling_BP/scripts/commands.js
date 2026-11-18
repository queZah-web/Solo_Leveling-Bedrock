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
import { openSystem } from "./ui/screens.js";
import { castSlot, quickMenu } from "./ui/skills_screen.js";

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

  const target = { name: "target", type: CustomCommandParamType.PlayerSelector };

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
          for (const st of STATS) {
            d.points += d[st.key] - BASE_STAT;
            d[st.key] = BASE_STAT;
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

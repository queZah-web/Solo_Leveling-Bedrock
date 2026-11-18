// System Gold: earned by hunting, dungeons and the daily quest; spent in the shop.
import { Player, world } from "@minecraft/server";
import { getData, markDirty } from "./data.js";

export const goldOf = (player) => getData(player).gold ?? 0;

export function addGold(player, n, reason) {
  if (n <= 0) return;
  const d = getData(player);
  d.gold = (d.gold ?? 0) + Math.floor(n);
  markDirty(player);
  if (reason) player.sendMessage(`§6+${Math.floor(n)} Gold §7(${reason})`);
}

export function spendGold(player, n) {
  const d = getData(player);
  if ((d.gold ?? 0) < n) return false;
  d.gold -= n;
  markDirty(player);
  return true;
}

// Every monster a hunter (or their shadow, see army.js) kills drops some gold.
export function goldForKill(entity) {
  try {
    if (!entity.matches({ families: ["monster"] })) return 0;
    const hp = entity.getComponent("minecraft:health")?.effectiveMax ?? 20;
    return Math.max(1, Math.round(hp / 8));
  } catch {
    return 0;
  }
}

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const k = damageSource.damagingEntity;
  if (k instanceof Player) addGold(k, goldForKill(deadEntity));
});

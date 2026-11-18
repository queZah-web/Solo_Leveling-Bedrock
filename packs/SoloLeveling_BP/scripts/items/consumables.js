// System items: potions (drink), Random Box and Instant Dungeon Key (use).
import { ItemStack, system, world } from "@minecraft/server";
import { maxMp } from "../config.js";
import { getData, markDirty } from "../data.js";
import { createGate } from "../gates/gates.js";
import { rollRank } from "../gates/ranks.js";
import { flash } from "../stats.js";

export const ITEM_INFO = {
  "sl:healing_elixir": "Restores 50% of your HP.",
  "sl:mana_potion": "Restores 50% of your MP.",
  "sl:fatigue_potion": "Removes all fatigue.",
  "sl:elixir_of_life": "Full HP, MP and fatigue recovery.",
  "sl:random_box": "Use it to receive a random reward.",
  "sl:dungeon_key": "Opens a private gate (rank by your level) in front of you.",
};

world.afterEvents.itemCompleteUse.subscribe(({ source: p, itemStack }) => {
  const id = itemStack?.typeId;
  if (!id?.startsWith("sl:")) return;
  const d = getData(p);
  const h = p.getComponent("minecraft:health");
  const mmax = maxMp(d.int);
  if (id === "sl:healing_elixir") {
    h?.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * 0.5));
    flash(p, "§cHP restored");
  } else if (id === "sl:mana_potion") {
    d.mp = Math.min(mmax, d.mp + mmax * 0.5);
    flash(p, "§9MP restored");
  } else if (id === "sl:fatigue_potion") {
    d.fatigue = 0;
    flash(p, "§aFatigue removed");
  } else if (id === "sl:elixir_of_life") {
    h?.setCurrentValue(h.effectiveMax);
    d.mp = mmax;
    d.fatigue = 0;
    flash(p, "§6Fully recovered!");
  } else return;
  markDirty(p);
  p.playSound("random.orb", { pitch: 1.4 });
});

/** @type {[string, number, number][]} */
const BOX_REWARDS = [
  ["minecraft:diamond", 1, 3], ["minecraft:emerald", 2, 6], ["minecraft:golden_apple", 1, 2], ["minecraft:ender_pearl", 2, 4],
  ["minecraft:experience_bottle", 4, 10], ["sl:healing_elixir", 1, 2], ["sl:mana_potion", 1, 2], ["minecraft:iron_ingot", 6, 14],
  ["minecraft:totem_of_undying", 1, 1], ["sl:kasaka_fang", 1, 1],
];
const WEIGHTS = [12, 12, 10, 10, 12, 12, 12, 14, 2, 4];

function consumeOne(p) {
  const inv = p.getComponent("minecraft:inventory").container;
  const slot = p.selectedSlotIndex;
  const it = inv.getItem(slot);
  if (!it) return;
  if (it.amount > 1) inv.getSlot(slot).amount = it.amount - 1;
  else inv.setItem(slot, undefined);
}

world.afterEvents.itemUse.subscribe(({ source: p, itemStack }) => {
  const id = itemStack?.typeId;
  if (id === "sl:random_box") {
    consumeOne(p);
    let r = Math.random() * WEIGHTS.reduce((a, b) => a + b, 0);
    let i = 0;
    while (r > WEIGHTS[i]) r -= WEIGHTS[i++];
    const [item, a, b] = BOX_REWARDS[Math.min(i, BOX_REWARDS.length - 1)];
    const n = a + Math.floor(Math.random() * (b - a + 1));
    const left = p.getComponent("minecraft:inventory").container.addItem(new ItemStack(item, n));
    if (left) p.dimension.spawnItem(left, p.location);
    p.playSound("random.levelup", { pitch: 1.6 });
    flash(p, `§dRandom Box: §f${n}x ${item.replace(/^\w+:/, "").replace(/_/g, " ")}`, 60);
  } else if (id === "sl:dungeon_key") {
    if (p.dimension.id !== "minecraft:overworld") return flash(p, "§cKeys only work in the Overworld.");
    if (getData(p).dungeon) return flash(p, "§cYou are already in a dungeon.");
    consumeOne(p);
    const dir = p.getViewDirection();
    system.run(() => createGate(p.dimension, { x: p.location.x + dir.x * 5, y: p.location.y, z: p.location.z + dir.z * 5 }, rollRank(getData(p).level), false));
  }
});

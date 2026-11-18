// The System Gem: always in the player's inventory, can be moved but not
// dropped, stored in chests, or lost on death.
import { ItemLockMode, ItemStack, system, world } from "@minecraft/server";
import { GEM_ID } from "./config.js";
import { arise, corpsesNear } from "./army/army.js";
import { openSystem } from "./ui/screens.js";
import { quickMenu } from "./ui/skills_screen.js";

function makeGem() {
  const gem = new ItemStack(GEM_ID, 1);
  gem.lockMode = ItemLockMode.inventory;
  gem.keepOnDeath = true;
  gem.setLore(["§7The System has chosen you.", "§8Use it or type §7/system"]);
  return gem;
}

/** Makes sure the player has exactly one locked System Gem. */
export function ensureGem(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  let found = 0;
  try {
    // The gem may be "in hand" while the player is moving it in the inventory screen.
    const cursor = player.getComponent("minecraft:cursor_inventory");
    if (cursor?.item?.typeId === GEM_ID) found++;
  } catch {}
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it?.typeId !== GEM_ID) continue;
    found++;
    if (found > 1) {
      inv.setItem(i, undefined);
    } else if (it.lockMode !== ItemLockMode.inventory || !it.keepOnDeath) {
      inv.setItem(i, makeGem());
    }
  }
  if (found > 0) return;
  const gem = makeGem();
  if (!inv.getItem(8)) inv.setItem(8, gem);
  else if (inv.emptySlotsCount > 0) inv.addItem(gem);
  else return; // inventory full: try again on the next check
  player.sendMessage("§b[System] §fYou have received the §5System Gem§f. Use it or type §b/system§f.");
}

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId !== GEM_ID) return;
  // Sneak + use: ARISE near a fresh kill, otherwise the Quick Skill menu.
  if (source.isSneaking) {
    if (corpsesNear(source).length > 0) arise(source);
    else quickMenu(source);
  } else openSystem(source);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  system.runTimeout(() => {
    if (!player.isValid) return;
    ensureGem(player);
    if (initialSpawn) {
      player.sendMessage("§b[System] §fWelcome, Player. §7Type §b/system §7to open the System window.");
    }
  }, 20);
});

system.runInterval(() => {
  for (const player of world.getAllPlayers()) ensureGem(player);
}, 100);

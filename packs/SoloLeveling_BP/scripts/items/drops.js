// Crafting materials dropped by monsters (killed by a hunter or their shadow).
import { ItemStack, Player, world } from "@minecraft/server";

/** monster id -> [item, chance, min, max][] */
export const DROPS = {
  "sl:goblin": [["sl:goblin_fang", 0.5, 1, 2]],
  "sl:orc": [["sl:orc_tusk", 0.4, 1, 2]],
  "sl:ice_elf": [["sl:frost_essence", 0.35, 1, 2]],
  "minecraft:stray": [["sl:frost_essence", 0.15, 1, 1]],
  "minecraft:spider": [["sl:venom_gland", 0.25, 1, 1]],
  "minecraft:cave_spider": [["sl:venom_gland", 0.25, 1, 1]],
  "minecraft:blaze": [["sl:demon_horn", 0.2, 1, 1]],
  "minecraft:wither_skeleton": [["sl:demon_horn", 0.2, 1, 1]],
  "minecraft:piglin_brute": [["sl:demon_horn", 0.2, 1, 2]],
  "sl:dg_spider": [["sl:venom_gland", 0.3, 1, 1]],
  "sl:dg_hound": [["sl:demon_horn", 0.15, 1, 1]],
  "sl:dg_ice_bear": [["sl:frost_essence", 0.4, 1, 2]],
  "sl:dg_knight": [["sl:demon_horn", 0.2, 1, 1]],
  "sl:dg_mage": [["sl:mana_crystal", 0.15, 1, 1]],
  "sl:dg_ant": [["sl:demon_horn", 0.25, 1, 2]],
  "sl:dg_soldier": [["minecraft:bone", 0.5, 1, 3]],
  "sl:dg_archer": [["minecraft:arrow", 0.6, 2, 5]],
};

function drop(entity, id, n) {
  try {
    entity.dimension.spawnItem(new ItemStack(id, n), { ...entity.location, y: entity.location.y + 0.5 });
  } catch {}
}

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const k = damageSource.damagingEntity;
  if (!k || !(k instanceof Player || k.matches({ families: ["sl_shadow"] }))) return;
  let tags = [];
  try {
    tags = deadEntity.getTags();
  } catch {}
  for (const [id, chance, a, b] of DROPS[deadEntity.typeId] ?? []) {
    if (Math.random() < chance) drop(deadEntity, id, a + Math.floor(Math.random() * (b - a + 1)));
  }
  // Dungeon monsters can carry Mana Crystals; bosses always do.
  if (tags.some((t) => t.startsWith("sl_dg"))) {
    if (tags.includes("sl_boss")) {
      drop(deadEntity, "sl:mana_crystal", 3 + Math.floor(Math.random() * 4));
      const rank = Number(tags.find((t) => t.startsWith("sl_rank_"))?.slice(8) ?? 0);
      if (rank >= 4) drop(deadEntity, "sl:demon_core", 1);
    } else if (Math.random() < 0.12) drop(deadEntity, "sl:mana_crystal", 1);
  }
});

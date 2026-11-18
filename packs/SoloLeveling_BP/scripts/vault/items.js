// Item helpers for the vault: icon, category, description.
import { ICONS } from "./icons.js";

const EXTRA_ICONS = {
  "minecraft:grass_block": "textures/blocks/grass_carried",
  "minecraft:sea_lantern": "textures/blocks/sea_lantern",
  "sl:system_gem": "textures/items/sl/system_gem",
};
export const UNKNOWN_ICON = "textures/sl/ui/unknown";

/** Texture path for an item id (falls back to a "?" icon). */
export function iconOf(typeId) {
  if (EXTRA_ICONS[typeId]) return EXTRA_ICONS[typeId];
  if (typeId.startsWith("minecraft:")) {
    const p = ICONS[typeId.slice(10)];
    if (p) return p;
    if (typeId.endsWith("_spawn_egg")) return "textures/items/egg";
  }
  return UNKNOWN_ICON;
}

export const FILTERS = ["ALL", "BLOCKS", "GEAR", "FOOD", "MATERIALS"];

const GEAR = /(sword|_axe|pickaxe|shovel|_hoe|helmet|chestplate|leggings|boots|bow|crossbow|trident|mace|shield|elytra|fishing_rod|shears|flint_and_steel|spear)$/;

/** @param {import("@minecraft/server").ItemStack} item */
export function categoryOf(item) {
  const id = item.typeId;
  if (GEAR.test(id)) return "GEAR";
  try {
    if (item.hasComponent("minecraft:food")) return "FOOD";
  } catch {}
  const icon = iconOf(id);
  if (icon.startsWith("textures/blocks/")) return "BLOCKS";
  return "MATERIALS";
}

const CATEGORY_ORDER = { GEAR: 0, BLOCKS: 1, MATERIALS: 2, FOOD: 3 };
export function sortKey(item) {
  return `${CATEGORY_ORDER[categoryOf(item)] ?? 9}|${item.typeId}|${String(999 - item.amount).padStart(3, "0")}`;
}

export function prettyId(typeId) {
  return typeId
    .replace(/^[a-z0-9_]+:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/**
 * Text lines describing an item (RawMessage so names are translated).
 * @param {import("@minecraft/server").ItemStack} item
 * @returns {import("@minecraft/server").RawMessage[]}
 */
export function describe(item) {
  /** @type {import("@minecraft/server").RawMessage[]} */
  const out = [];
  out.push(item.nameTag ? { text: `§b§o${item.nameTag}§r\n` } : { rawtext: [{ text: "§b" }, { translate: item.localizationKey }, { text: "§r\n" }] });
  out.push({ text: `§7Amount: §f${item.amount}§7/${item.maxAmount}\n` });
  out.push({ text: `§7Type: §f${categoryOf(item)}\n` });
  try {
    const dur = item.getComponent("minecraft:durability");
    if (dur) out.push({ text: `§7Durability: §a${dur.maxDurability - dur.damage}§7/${dur.maxDurability}\n` });
  } catch {}
  try {
    const ench = item.getComponent("minecraft:enchantable")?.getEnchantments() ?? [];
    for (const e of ench.slice(0, 4)) {
      out.push({ text: `§d${prettyId(e.type.id)} ${ROMAN[e.level] ?? e.level}\n` });
    }
    if (ench.length > 4) out.push({ text: `§d+${ench.length - 4} more\n` });
  } catch {}
  const lore = item.getLore();
  if (lore.length) out.push({ text: `§5§o${lore[0]}\n` });
  return out;
}

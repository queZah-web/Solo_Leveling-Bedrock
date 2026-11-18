// Shadow equipment: armor and weapons on humanoid shadows.
import { EquipmentSlot, ItemStack } from "@minecraft/server";

/** Shadows whose model can show armor and held items. */
const GEAR_TYPES = new Set(["zombie", "husk", "drowned", "skeleton", "stray", "wither_skeleton", "vindicator"]);
export const canWearGear = (type) => GEAR_TYPES.has(type);
/** Archers switch between bow (ranged) and melee depending on the main hand. */
export const ARCHERS = new Set(["skeleton", "stray"]);

export const GEAR_SLOTS = [
  { slot: EquipmentSlot.Head, label: "HELMET", cmd: "slot.armor.head", accepts: (id) => /(_helmet|carved_pumpkin|_head|_skull)$/.test(id) },
  { slot: EquipmentSlot.Chest, label: "CHEST", cmd: "slot.armor.chest", accepts: (id) => /(_chestplate|elytra)$/.test(id) },
  { slot: EquipmentSlot.Legs, label: "LEGS", cmd: "slot.armor.legs", accepts: (id) => /_leggings$/.test(id) },
  { slot: EquipmentSlot.Feet, label: "BOOTS", cmd: "slot.armor.feet", accepts: (id) => /_boots$/.test(id) },
  { slot: EquipmentSlot.Mainhand, label: "WEAPON", cmd: "slot.weapon.mainhand", accepts: () => true },
  { slot: EquipmentSlot.Offhand, label: "OFFHAND", cmd: "slot.weapon.offhand", accepts: () => true },
];

export const CONSTRUCT_LORE = "§8Shadow Construct";
/** Items created by the System for shadows (e.g. the default bow): never given to players. */
export const isConstruct = (item) => item.getLore().includes(CONSTRUCT_LORE);
const isRangedWeapon = (item) => !!item && /(^|:)(bow|crossbow)$/.test(item.typeId);

export function shadowBow() {
  const bow = new ItemStack("minecraft:bow", 1);
  bow.nameTag = "§5Shadow Bow";
  bow.setLore([CONSTRUCT_LORE]);
  return bow;
}

/** @param {import("@minecraft/server").Entity} e */
export function getGear(e, slot) {
  try {
    return e.getComponent("minecraft:equippable")?.getEquipment(slot);
  } catch {
    return undefined;
  }
}

/** Can the System read/write this entity's equipment? */
export const hasEquipment = (e) => {
  try {
    return !!e.getComponent("minecraft:equippable");
  } catch {
    return false;
  }
};

/**
 * Puts an item (or nothing) in a shadow's equipment slot, keeping all item
 * data (enchantments, name, durability...). Returns false if not possible.
 * @param {import("@minecraft/server").Entity} e
 */
export function setGear(e, gearSlot, item) {
  const eq = e.getComponent("minecraft:equippable");
  if (!eq) return false;
  return eq.setEquipment(gearSlot.slot, item);
}

/** Archers: ranged with a bow/crossbow in hand, melee otherwise. */
export function updateCombatMode(e, type) {
  if (!ARCHERS.has(type)) return;
  try {
    e.triggerEvent(isRangedWeapon(getGear(e, EquipmentSlot.Mainhand)) ? "sl:mode_ranged" : "sl:mode_melee");
  } catch {}
}

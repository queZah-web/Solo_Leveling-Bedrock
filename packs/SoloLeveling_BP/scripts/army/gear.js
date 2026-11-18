// Shadow equipment: armor and weapons on humanoid shadows.
//
// Writing equipment on mobs differs between engine versions, so setGear()
// tries several methods and verifies the result:
//   1. equippable.setEquipment()          (keeps all item data)
//   2. equippable.getEquipmentSlot().setItem()
//   3. /replaceitem                        (plain items only: no enchants/name/damage)
// What each shadow wears is also tracked in its record (s.gear), so the UI
// and unequipping work even if the engine can't read mob equipment.
import { EquipmentSlot, ItemStack } from "@minecraft/server";

/** Shadows whose model can show armor and held items. */
const GEAR_TYPES = new Set(["zombie", "husk", "drowned", "skeleton", "stray", "wither_skeleton", "vindicator", "goblin", "orc", "ice_elf"]);
export const canWearGear = (type) => GEAR_TYPES.has(type);
/** Archers switch between bow (ranged) and melee depending on the main hand. */
export const ARCHERS = new Set(["skeleton", "stray", "ice_elf"]);

export const GEAR_SLOTS = [
  { slot: EquipmentSlot.Head, label: "HELMET", cmd: "slot.armor.head", accepts: (id) => /(_helmet|carved_pumpkin|_head|_skull)$/.test(id) },
  { slot: EquipmentSlot.Chest, label: "CHEST", cmd: "slot.armor.chest", accepts: (id) => /(_chestplate|elytra)$/.test(id) },
  { slot: EquipmentSlot.Legs, label: "LEGS", cmd: "slot.armor.legs", accepts: (id) => /_leggings$/.test(id) },
  { slot: EquipmentSlot.Feet, label: "BOOTS", cmd: "slot.armor.feet", accepts: (id) => /_boots$/.test(id) },
  { slot: EquipmentSlot.Mainhand, label: "WEAPON", cmd: "slot.weapon.mainhand", accepts: () => true },
  { slot: EquipmentSlot.Offhand, label: "OFFHAND", cmd: "slot.weapon.offhand", accepts: () => true },
];

export const CONSTRUCT_LORE = "§8Shadow Construct";
const CONSTRUCT_MARK = "construct:";
const isRangedId = (id) => /(^|:)(bow|crossbow)$/.test(id ?? "");

export function shadowBow() {
  const bow = new ItemStack("minecraft:bow", 1);
  bow.nameTag = "§5Shadow Bow";
  bow.setLore([CONSTRUCT_LORE]);
  return bow;
}

const equippable = (e) => {
  try {
    return e.getComponent("minecraft:equippable");
  } catch {
    return undefined;
  }
};

/** Real item on the entity, when the engine lets us read it. */
function readSlot(e, gs) {
  const eq = equippable(e);
  if (!eq) return undefined;
  try {
    return eq.getEquipment(gs.slot) ?? eq.getEquipmentSlot(gs.slot).getItem();
  } catch {
    return undefined;
  }
}

/** Plain = can be recreated from its id alone (no enchant, name, lore, damage). */
export function isPlain(item) {
  if (item.nameTag || item.getLore().length) return false;
  try {
    if ((item.getComponent("minecraft:enchantable")?.getEnchantments().length ?? 0) > 0) return false;
  } catch {}
  try {
    if ((item.getComponent("minecraft:durability")?.damage ?? 0) > 0) return false;
  } catch {}
  return true;
}

/**
 * What a shadow wears in a slot: { id, item?, construct }.
 * @param {import("../data.js").ShadowRecord} s
 */
export function gearInfo(e, s, gs) {
  const tracked = s.gear?.[gs.slot];
  const item = e ? readSlot(e, gs) : undefined;
  if (item) return { id: item.typeId, item, construct: item.getLore().includes(CONSTRUCT_LORE) };
  if (!tracked) return undefined;
  const construct = tracked.startsWith(CONSTRUCT_MARK);
  return { id: construct ? tracked.slice(CONSTRUCT_MARK.length) : tracked, construct };
}

function track(s, gs, item, construct = false) {
  s.gear ??= {};
  if (item) s.gear[gs.slot] = (construct ? CONSTRUCT_MARK : "") + item.typeId;
  else delete s.gear[gs.slot];
}

/**
 * Puts an item (or nothing) in a shadow's slot.
 * @returns {"full"|"plain"|"cleared"|false} how it was done
 */
export function setGear(e, s, gs, item, construct = false) {
  const eq = equippable(e);
  const verify = () => {
    const now = readSlot(e, gs);
    return item ? now?.typeId === item.typeId : !now;
  };
  // 1 + 2: script equipment (all item data kept)
  if (eq) {
    try {
      if (eq.setEquipment(gs.slot, item) && verify()) return track(s, gs, item, construct), item ? "full" : "cleared";
    } catch {}
    try {
      eq.getEquipmentSlot(gs.slot).setItem(item);
      if (verify()) return track(s, gs, item, construct), item ? "full" : "cleared";
    } catch {}
  }
  // 3: command (only for items without extra data)
  if (item && !construct && !isPlain(item)) return false;
  try {
    e.runCommand(`replaceitem entity @s ${gs.cmd} 0 ${item ? `${item.typeId} 1` : "air"}`);
    track(s, gs, item, construct);
    return item ? "plain" : "cleared";
  } catch {
    return false;
  }
}

/** Archers: ranged with a bow/crossbow in hand, melee otherwise. */
export function updateCombatMode(e, s) {
  if (!ARCHERS.has(s.type)) return;
  try {
    e.triggerEvent(isRangedId(gearInfo(e, s, GEAR_SLOTS[4])?.id) ? "sl:mode_ranged" : "sl:mode_melee");
  } catch {}
}

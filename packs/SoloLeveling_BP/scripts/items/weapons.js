// Abilities of the Solo Leveling weapons (custom items sl:*).
import { EntityDamageCause, EquipmentSlot, Player, world } from "@minecraft/server";
import { addDamageHook } from "../stats.js";

export const WEAPON_INFO = {
  "sl:kasaka_fang": "Poison on hit, 15% chance to paralyze.",
  "sl:knight_killer": "x1.6 damage against undead.",
  "sl:baruka_dagger": "Hits slow and weaken.",
  "sl:demon_king_dagger": "Heals you for 15% of the damage. Hits grant speed.",
  "sl:demon_king_longsword": "Cleave: half damage to monsters around the target.",
};

const held = (p) => {
  try {
    return p.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId;
  } catch {
    return undefined;
  }
};

const isUndead = (e) => {
  try {
    return e.matches({ families: ["undead"] });
  } catch {
    return false;
  }
};

/** Cleave hits must not trigger more cleaves. */
let cleaving = false;

addDamageHook((ev) => {
  const p = ev.damageSource.damagingEntity;
  if (!(p instanceof Player) || ev.damageSource.cause !== EntityDamageCause.entityAttack) return;
  if (held(p) === "sl:knight_killer" && isUndead(ev.hurtEntity)) ev.damage *= 1.6;
});

world.afterEvents.entityHurt.subscribe(({ damageSource, hurtEntity, damage }) => {
  const p = damageSource.damagingEntity;
  if (!(p instanceof Player) || damageSource.cause !== EntityDamageCause.entityAttack || !hurtEntity.isValid) return;
  const w = held(p);
  if (!w?.startsWith("sl:")) return;
  try {
    if (w === "sl:kasaka_fang") {
      hurtEntity.addEffect("poison", 80, { amplifier: 1 });
      if (Math.random() < 0.15) hurtEntity.addEffect("slowness", 30, { amplifier: 6 });
    } else if (w === "sl:baruka_dagger") {
      hurtEntity.addEffect("slowness", 60, { amplifier: 1 });
      hurtEntity.addEffect("weakness", 60, { amplifier: 0 });
    } else if (w === "sl:demon_king_dagger") {
      const h = p.getComponent("minecraft:health");
      h?.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + damage * 0.15));
      p.addEffect("speed", 40, { amplifier: 0, showParticles: false });
    } else if (w === "sl:demon_king_longsword" && !cleaving) {
      cleaving = true;
      for (const e of hurtEntity.dimension.getEntities({ location: hurtEntity.location, maxDistance: 3, families: ["monster"] })) {
        if (e.id === hurtEntity.id) continue;
        e.applyDamage(damage * 0.5, { cause: EntityDamageCause.entityAttack, damagingEntity: p });
      }
      cleaving = false;
      hurtEntity.dimension.spawnParticle("minecraft:critical_hit_emitter", { ...hurtEntity.location, y: hurtEntity.location.y + 1 });
    }
  } catch {
    cleaving = false;
  }
});

// Ice Elves' arrows freeze.
world.afterEvents.entityHurt.subscribe(({ damageSource, hurtEntity }) => {
  if (damageSource.damagingEntity?.typeId === "sl:ice_elf" && damageSource.cause === EntityDamageCause.projectile) {
    try {
      hurtEntity.addEffect("slowness", 60, { amplifier: 1 });
    } catch {}
  }
});


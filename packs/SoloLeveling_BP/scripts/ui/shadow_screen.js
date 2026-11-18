// Shadow Profile: one shadow's stats, equipment and actions.
// Layout "sl:shadow|" (index map in tools/gen_ui.py).
import { ItemLockMode, ItemStack } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import {
  dismiss, entityOf, feed, findRecord, regenLeft, release, rename, saveActive, summon, train,
} from "../army/army.js";
import { canWearGear, gearInfo, GEAR_SLOTS, isPlain, setGear, updateCombatMode } from "../army/gear.js";
import {
  creeperCharges, FEED_MP, FOOD_MAX, GRADES, portraitOf, SHADOW_MAX_LEVEL, SHADOW_TYPES, shadowAtkMult, shadowDefMult, shadowXpToNext, TRAIN_MP,
} from "../army/types.js";
import { markDirty } from "../data.js";
import { iconOf, prettyId } from "../vault/items.js";
import { stateOf } from "./army_screen.js";
import { barTex, BLANK, showForm, SystemForm, TEX } from "./form.js";
import { frame } from "./frame.js";

const BAG_ORDER = [...Array.from({ length: 27 }, (_, i) => i + 9), ...Array.from({ length: 9 }, (_, i) => i)];

export async function shadowScreen(player) {
  const st = stateOf(player);
  const s = st.selected && findRecord(player, st.selected);
  if (!s) return "shadows";
  const again = () => "shadow";
  const toast = (msg) => player.onScreenDisplay.setActionBar(msg);
  const report = (err, ok) => toast(err ? `§c${err}` : ok);

  const g = GRADES[s.grade];
  const def = SHADOW_TYPES[s.type];
  const e = entityOf(player, s.id);
  const regen = regenLeft(s);
  const h = e?.getComponent("minecraft:health");
  const hpCur = h ? Math.ceil(h.currentValue) : regen > 0 ? 0 : 1;
  const hpMax = h ? Math.round(h.effectiveMax) : 1;
  const nextXp = shadowXpToNext(s.level);
  const maxed = s.level >= SHADOW_MAX_LEVEL;
  const wears = canWearGear(s.type);
  const bag = player.getComponent("minecraft:inventory").container;
  const selItem = st.bagSel >= 0 ? bag.getItem(st.bagSel) : undefined;
  if (!selItem) st.bagSel = -1;

  const form = new SystemForm("shadow", "SHADOW PROFILE");
  frame(form, player, "shadows");
  form.screenId = "shadow";

  form.display(9, `${g.color}${s.name} §7[Rank ${g.rank}]`);
  form.display(19, "", portraitOf(s.type));
  form.display(28, h ? `§cHP §f${hpCur}/${hpMax}` : regen > 0 ? `§cREGEN §f${regen}s` : "§7HP §fFULL", barTex("hp", hpCur, hpMax));
  form.display(29, maxed ? "§eXP §fMAX" : `§eXP §f${s.xp}/${nextXp}`, barTex("xp", maxed ? 1 : s.xp, maxed ? 1 : nextXp));
  const status = e ? "§aSUMMONED" : regen > 0 ? `§cREGENERATING ${regen}s` : "§7IN SHADOW";
  form.body(
    [
      `§7${def.label}`,
      `${g.color}${g.name} §8| §7Lv §f${s.level} §8| §7Kills §f${s.kills}`,
      `§7ATK §cx${shadowAtkMult(s).toFixed(2)} §7DEF §a${Math.round((1 - shadowDefMult(s)) * 100)}%%`,
      `§7${status} §8| §9${g.cost} MP`,
      `§5${def.skill}§7: ${def.skillDesc}`,
      s.type === "creeper" ? `§7Blasts: §c${creeperCharges(s)} §8(more with level & rank)` : "",
      !wears ? "§8Gear: none §7(food & totem OK)" : !e ? "§8Summon it to change gear." : "",
    ].join("\n"),
  );

  // Actions
  form.slot(16, e ? "DISMISS" : "SUMMON", BLANK, async () => {
    if (e) {
      await dismiss(player, s.id);
      toast(`§7${s.name} returned to your shadow`);
    } else report(await summon(player, s), `§5${s.name} §fhas been summoned`);
    return again();
  });
  const food = selItem?.hasComponent("minecraft:food") ? selItem.getComponent("minecraft:food") : undefined;
  form.slot(17, food && e ? "§aFEED" : `FEED §9${FEED_MP}`, BLANK, () => {
    if (food && e && h) {
      if (h.currentValue >= h.effectiveMax) return toast(`§7${s.name} is already at full health`), again();
      h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + food.nutrition * 2 + 2));
      if (selItem.amount > 1) bag.getSlot(st.bagSel).amount = selItem.amount - 1;
      else bag.setItem(st.bagSel, undefined);
      player.playSound("random.eat");
      toast(`§a${s.name} ate and recovered`);
      return again();
    }
    report(feed(player, s.id), `§a${s.name} is restored`);
    return again();
  }, food && e ? "Feed selected food" : `Feed (${FEED_MP} MP)`);
  form.slot(18, `TRAIN §9${TRAIN_MP}`, BLANK, () => (report(train(player, s.id), `§e${s.name} trained`), again()), `Train (${TRAIN_MP} MP)`);
  form.slot(7, "< ARMY", BLANK, () => "shadows", "« Back to Army");
  form.slot(30, "RENAME", BLANK, async () => {
    const res = await showForm(
      player,
      new ModalFormData().title("Rename Shadow").textField("New name", s.name, { defaultValue: s.name }).submitButton("Rename"),
    );
    if (res && !res.canceled && typeof res.formValues?.[0] === "string") rename(player, s.id, res.formValues[0]);
    return again();
  });
  form.slot(31, st.confirm ? "CONFIRM?" : "RELEASE", BLANK, () => {
    if (!st.confirm) {
      st.confirm = true;
      return again();
    }
    const err = release(player, s.id);
    if (err) {
      st.confirm = false;
      return toast(`§c${err}`), again();
    }
    toast(`§8${s.name} has been released`);
    st.selected = undefined;
    st.confirm = false;
    return "shadows";
  }, st.confirm ? "§cConfirm Release" : "§cRelease Shadow");

  // Gear
  GEAR_SLOTS.forEach((gs, i) => {
    const idx = 33 + i;
    if (!wears || !e) {
      form.slot(idx, "N|", wears ? BLANK : TEX + "lock", () => {
        toast(!wears ? "§7This shadow can't wear gear" : "§7Summon the shadow to change its gear");
        return again();
      });
      return;
    }
    const cur = gearInfo(e, s, gs);
    const curName = cur ? cur.item?.nameTag ?? prettyId(cur.id) : "empty";
    form.slot(idx, "N|", cur ? iconOf(cur.id) : BLANK, async () => {
      const item = st.bagSel >= 0 ? bag.getItem(st.bagSel) : undefined;
      if (item) {
        if (item.lockMode !== ItemLockMode.none) return toast("§cThis item is bound to you"), again();
        if (!gs.accepts(item.typeId)) return toast(`§cThat can't go in the ${gs.label} slot`), again();
        const one = item.clone();
        one.amount = 1;
        const how = setGear(e, s, gs, one);
        if (!how) {
          toast("§cThis server can't put enchanted/named/damaged gear on shadows yet");
          return again();
        }
        // Equipped: take it from the player, give back what was there.
        if (item.amount > 1) bag.getSlot(st.bagSel).amount = item.amount - 1;
        else bag.setItem(st.bagSel, undefined);
        if (cur && !cur.construct) {
          const back = cur.item ?? new ItemStack(cur.id, 1);
          const left = bag.addItem(back);
          if (left) player.dimension.spawnItem(left, player.location);
        }
        st.bagSel = -1;
        markDirty(player);
        toast(`§a${s.name} equipped ${one.nameTag ?? prettyId(one.typeId)}`);
      } else if (cur) {
        if (!cur.construct && bag.emptySlotsCount === 0) return toast("§cYour inventory is full"), again();
        const back = cur.item ?? new ItemStack(cur.id, 1);
        if (!setGear(e, s, gs, undefined)) return toast("§cCould not unequip"), again();
        if (cur.construct) toast("§8The shadow construct dissolved");
        else {
          bag.addItem(back);
          toast(`§7Took ${curName} back`);
        }
        markDirty(player);
      } else {
        return toast("§7Select an item from your inventory first"), again();
      }
      updateCombatMode(e, s);
      await saveActive(player, s.id);
      return again();
    }, `${gs.label}: ${curName}`);
  });

  // Food pouch (all shadow types): up to 64 of one food, eaten when hurt.
  const giveBack = (id, count) => {
    const max = new ItemStack(id, 1).maxAmount;
    while (count > 0) {
      const n = Math.min(max, count);
      const left = bag.addItem(new ItemStack(id, n));
      if (left) player.dimension.spawnItem(left, player.location);
      count -= n;
    }
  };
  form.slot(76, `N|${s.food ? s.food.count : ""}`, s.food ? iconOf(s.food.id) : BLANK, () => {
    const item = st.bagSel >= 0 ? bag.getItem(st.bagSel) : undefined;
    if (item) {
      if (!item.hasComponent("minecraft:food")) return toast("§cThat is not food"), again();
      if (!isPlain(item)) return toast("§cRenamed / special food can't go in the pouch"), again();
      if (s.food && s.food.id !== item.typeId) {
        giveBack(s.food.id, s.food.count);
        delete s.food;
      }
      const have = s.food?.count ?? 0;
      const take = Math.min(FOOD_MAX - have, item.amount);
      if (take <= 0) return toast(`§7The food pouch is full (${FOOD_MAX})`), again();
      s.food = { id: item.typeId, count: have + take };
      if (item.amount > take) bag.getSlot(st.bagSel).amount = item.amount - take;
      else bag.setItem(st.bagSel, undefined);
      st.bagSel = -1;
      toast(`§a${s.name} received ${take} ${prettyId(item.typeId)}`);
    } else if (s.food) {
      giveBack(s.food.id, s.food.count);
      delete s.food;
      toast("§7Took the food back");
    } else {
      return toast("§7Select food from your inventory (up to 64)"), again();
    }
    markDirty(player);
    return again();
  }, `FOOD: ${s.food ? `${prettyId(s.food.id)} x${s.food.count}` : "empty"}`);

  // Totem pouch (all shadow types): saves the shadow once from death.
  form.slot(77, "N|", (s.totem ?? 0) > 0 ? iconOf("minecraft:totem_of_undying") : BLANK, () => {
    const item = st.bagSel >= 0 ? bag.getItem(st.bagSel) : undefined;
    if (item) {
      if (item.typeId !== "minecraft:totem_of_undying") return toast("§cOnly a Totem of Undying goes here"), again();
      if ((s.totem ?? 0) > 0) return toast("§7This shadow already carries a totem"), again();
      if (item.amount > 1) bag.getSlot(st.bagSel).amount = item.amount - 1;
      else bag.setItem(st.bagSel, undefined);
      s.totem = 1;
      st.bagSel = -1;
      toast(`§e${s.name} now carries a Totem of Undying`);
    } else if ((s.totem ?? 0) > 0) {
      giveBack("minecraft:totem_of_undying", 1);
      s.totem = 0;
      toast("§7Took the totem back");
    } else {
      return toast("§7Select a Totem of Undying from your inventory"), again();
    }
    markDirty(player);
    return again();
  }, `TOTEM: ${(s.totem ?? 0) > 0 ? "Totem of Undying" : "empty"}`);

  // Your inventory
  BAG_ORDER.forEach((slot, i) => {
    const item = bag.getItem(slot);
    const idx = 40 + i;
    // "S|" = selected, "N|" = not selected; the rest is the stack count.
    const mark = slot === st.bagSel ? "S|" : "N|";
    if (!item) {
      form.slot(idx, mark, BLANK, () => ((st.bagSel = -1), again()));
      return;
    }
    form.slot(idx, mark + (item.amount > 1 ? String(item.amount) : ""), iconOf(item.typeId), () => {
      st.bagSel = st.bagSel === slot ? -1 : slot;
      return again();
    }, `${slot === st.bagSel ? "§a> " : ""}${item.nameTag ?? prettyId(item.typeId)} §7x${item.amount}`);
  });

  if (selItem) {
    const hint = food
      ? "§aFEED§7 now, or put it in the §aFOOD§7 slot"
      : selItem.typeId === "minecraft:totem_of_undying"
        ? "§7Tap §eTOTEM§7 (or OFFHAND)"
        : GEAR_SLOTS.some((gs) => gs.accepts(selItem.typeId)) ? "§7Tap a gear slot to equip" : "";
    form.display(39, `§b${selItem.nameTag ?? prettyId(selItem.typeId)} §7x${selItem.amount}\n${hint}`);
  } else {
    form.display(39, "§7Select an item, then tap a gear slot.\n§8Tap a gear slot alone to unequip.");
  }

  return form.show(player);
}

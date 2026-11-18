// System Shop (INVENTORY -> SYSTEM SHOP). Reuses the "sl:army|" layout.
import { ItemStack } from "@minecraft/server";
import { getData } from "../data.js";
import { goldOf, addGold, spendGold } from "../economy.js";
import { BUY, SELL } from "../items/shop.js";
import { iconOf, prettyId } from "../vault/items.js";
import { BLANK, SystemForm } from "./form.js";
import { frame } from "./frame.js";

const PER_PAGE = 8;
const states = new Map(); // playerId -> { mode, page, sel }

const ICONS = {
  "sl:kasaka_fang": 1, "sl:knight_killer": 1, "sl:baruka_dagger": 1, "sl:demon_king_dagger": 1, "sl:demon_king_longsword": 1,
  "sl:healing_elixir": 1, "sl:mana_potion": 1, "sl:fatigue_potion": 1, "sl:elixir_of_life": 1, "sl:random_box": 1, "sl:dungeon_key": 1,
};
const icon = (id) => (ICONS[id] ? `textures/items/sl/${id.slice(3)}` : iconOf(id));
const NAMES = {
  "sl:kasaka_fang": "Kasaka's Venom Fang", "sl:knight_killer": "Knight Killer", "sl:baruka_dagger": "Baruka's Dagger",
  "sl:demon_king_dagger": "Demon King's Dagger", "sl:demon_king_longsword": "Demon King's Longsword",
  "sl:healing_elixir": "Healing Elixir", "sl:mana_potion": "Mana Potion", "sl:fatigue_potion": "Fatigue Potion",
  "sl:elixir_of_life": "Elixir of Life", "sl:random_box": "Random Box", "sl:dungeon_key": "Dungeon Key",
};
export const nameOf = (id) => NAMES[id] ?? prettyId(id);

function give(player, id, n) {
  const inv = player.getComponent("minecraft:inventory").container;
  const max = new ItemStack(id, 1).maxAmount;
  while (n > 0) {
    const k = Math.min(max, n);
    const left = inv.addItem(new ItemStack(id, k));
    if (left) player.dimension.spawnItem(left, player.location);
    n -= k;
  }
}

/** Sellable stacks in the player's inventory, grouped by item id. */
function sellables(player) {
  const inv = player.getComponent("minecraft:inventory").container;
  const counts = new Map();
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!it || !SELL[it.typeId] || it.nameTag || it.getLore().length) continue;
    counts.set(it.typeId, (counts.get(it.typeId) ?? 0) + it.amount);
  }
  return [...counts.entries()].map(([id, amount]) => ({ id, amount, price: SELL[id] }));
}

function takeItems(player, id, n) {
  const inv = player.getComponent("minecraft:inventory").container;
  let left = n;
  for (let i = 0; i < inv.size && left > 0; i++) {
    const it = inv.getItem(i);
    if (!it || it.typeId !== id || it.nameTag || it.getLore().length) continue;
    const k = Math.min(left, it.amount);
    if (it.amount > k) inv.getSlot(i).amount = it.amount - k;
    else inv.setItem(i, undefined);
    left -= k;
  }
  return n - left;
}

export async function shopScreen(player) {
  const st = states.get(player.id) ?? { mode: "buy", page: 0, sel: 0 };
  states.set(player.id, st);
  const d = getData(player);
  const again = () => "shop";
  const toast = (m) => player.onScreenDisplay.setActionBar(m);
  /** @type {{id:string, price:number, amount:number, info?:string, minLevel?:number}[]} */
  const list = st.mode === "buy" ? BUY.map((b) => ({ ...b, amount: b.amount ?? 1 })) : sellables(player);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  st.page = Math.min(st.page, pages - 1);
  st.sel = Math.min(st.sel, Math.max(0, list.length - 1));

  const form = new SystemForm("army", st.mode === "buy" ? "SYSTEM SHOP" : "SYSTEM SHOP - SELL");
  frame(form, player, "inventory");
  form.screenId = "shop";
  form.display(7, `§6GOLD §f${goldOf(player)}   §7${st.mode === "buy" ? "BUY" : "SELL"}`);
  form.slot(10, "<", BLANK, () => ((st.page = (st.page - 1 + pages) % pages), again()), "« Previous Page");
  form.display(11, `PAGE ${st.page + 1}/${pages}`);
  form.slot(12, ">", BLANK, () => ((st.page = (st.page + 1) % pages), again()), "Next Page »");
  form.slot(13, st.mode === "buy" ? "§aBUY" : "BUY", BLANK, () => (Object.assign(st, { mode: "buy", page: 0, sel: 0 }), again()), "Buy items");
  form.slot(14, st.mode === "sell" ? "§eSELL" : "SELL", BLANK, () => (Object.assign(st, { mode: "sell", page: 0, sel: 0 }), again()), "Sell items");
  form.slot(15, "< VAULT", BLANK, () => "inventory", "« Back to the Vault");

  const page = list.slice(st.page * PER_PAGE, st.page * PER_PAGE + PER_PAGE);
  page.forEach((x, i) => {
    const idx = st.page * PER_PAGE + i;
    const locked = st.mode === "buy" && x.minLevel && d.level < x.minLevel;
    const price = st.mode === "buy" ? `§6${x.price}G` : `§6${x.price}G §7x${x.amount}`;
    form.slot(
      20 + i,
      `${idx === st.sel ? "§a" : "§f"}${nameOf(x.id).slice(0, 10)}\n${locked ? `§8Lv${x.minLevel}` : price}`,
      icon(x.id),
      () => ((st.sel = idx), again()),
      `${nameOf(x.id)}${x.amount > 1 && st.mode === "buy" ? ` x${x.amount}` : ""} §6${x.price}G${locked ? ` §8(Lv ${x.minLevel})` : ""}`,
    );
  });
  for (let i = page.length; i < PER_PAGE; i++) form.display(20 + i, "", BLANK);

  const x = list[st.sel];
  if (x) {
    form.display(9, `§f${nameOf(x.id)}${st.mode === "buy" && x.amount > 1 ? ` §7x${x.amount}` : ""}`);
    form.display(19, "", icon(x.id));
    form.display(28, "", BLANK);
    form.display(29, "", BLANK);
    if (st.mode === "buy") {
      const locked = x.minLevel && d.level < x.minLevel;
      form.body([`§6Price: §f${x.price} Gold`, `§7Your gold: §f${goldOf(player)}`, "", `§7${x.info ?? "Vanilla item."}`,
        locked ? `§cRequires level ${x.minLevel}` : ""].join("\n"));
      const buy = (times) => () => {
        if (locked) return toast(`§cRequires level ${x.minLevel}`), again();
        if (!spendGold(player, x.price * times)) return toast("§cNot enough gold"), again();
        give(player, x.id, x.amount * times);
        player.playSound("random.orb", { pitch: 1.2 });
        toast(`§aBought ${x.amount * times}x ${nameOf(x.id)}`);
        return again();
      };
      form.slot(33, `§aBUY §6${x.price}G`, BLANK, buy(1), `Buy (${x.price} Gold)`);
      form.slot(34, `§ax5 §6${x.price * 5}G`, BLANK, buy(5), `Buy x5 (${x.price * 5} Gold)`);
      form.display(32, "§8Gold: monsters, dungeons, daily quest");
    } else {
      form.body([`§6${x.price} Gold §7each`, `§7You have: §f${x.amount}`, `§7Sell all: §6${x.price * x.amount} Gold`].join("\n"));
      const sell = (n) => () => {
        const sold = takeItems(player, x.id, n);
        if (sold) {
          addGold(player, sold * x.price);
          player.playSound("random.orb", { pitch: 0.9 });
          toast(`§eSold ${sold}x ${nameOf(x.id)} for §6${sold * x.price} Gold`);
        }
        return again();
      };
      form.slot(33, "§eSELL 1", BLANK, sell(1), "Sell 1");
      form.slot(34, "§eSELL ALL", BLANK, sell(x.amount), `Sell all (${x.amount})`);
      form.display(32, "");
    }
  } else {
    form.display(9, st.mode === "buy" ? "" : "§7Nothing to sell");
    form.display(19, "", BLANK);
    form.display(28, "", BLANK);
    form.display(29, "", BLANK);
    form.body(st.mode === "sell" ? "§7Bring monster drops, ores or gems to sell them for Gold." : "");
    for (const i of [32, 33, 34]) form.display(i, "", BLANK);
  }
  return form.show(player);
}

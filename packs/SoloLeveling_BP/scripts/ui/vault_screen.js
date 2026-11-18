// INVENTORY tab: the Shadow Vault and the player's own inventory ("BAG").
// Layout "sl:vault|" (see tools/gen_ui.py for the index map).
import { ItemLockMode } from "@minecraft/server";
import { getData } from "../data.js";
import { categoryOf, describe, FILTERS, iconOf, prettyId, sortKey } from "../vault/items.js";
import {
  capacityFor, closeVault, moveStack, openVault, PAGE_SIZE, saveVault, sortContainer,
  stackContainer, unlockLevelFor, VAULT_SIZE,
} from "../vault/storage.js";
import { BLANK, SystemForm, TEX } from "./form.js";
import { frame } from "./frame.js";

const GRID_START = 20;
const BAG_ORDER = [...Array.from({ length: 27 }, (_, i) => i + 9), ...Array.from({ length: 9 }, (_, i) => i)];

/** @type {Map<string, {mode:"vault"|"bag", page:number, filter:number, selected:number, confirm:boolean}>} */
const states = new Map();

function stateOf(player) {
  let st = states.get(player.id);
  if (!st) {
    st = { mode: "vault", page: 0, filter: 0, selected: -1, confirm: false };
    states.set(player.id, st);
  }
  return st;
}

/** Called when the player leaves the INVENTORY tab or closes the System. */
export function endVault(player) {
  states.delete(player.id);
  try {
    closeVault(player);
  } catch {}
}

const bagOf = (player) => player.getComponent("minecraft:inventory").container;

/**
 * Cells shown in the grid for the current mode/filter.
 * @returns {{slot:number, locked?:boolean}[]}
 */
function cellsFor(st, container, cap) {
  const filter = FILTERS[st.filter];
  const order = st.mode === "bag" ? BAG_ORDER : Array.from({ length: VAULT_SIZE }, (_, i) => i);
  if (filter === "ALL") return order.map((slot) => ({ slot, locked: st.mode === "vault" && slot >= cap }));
  const out = [];
  for (const slot of order) {
    if (st.mode === "vault" && slot >= cap) continue;
    const it = container.getItem(slot);
    if (it && categoryOf(it) === filter) out.push({ slot });
  }
  return out;
}

export async function vaultScreen(player) {
  const st = stateOf(player);
  const d = getData(player);
  const cap = capacityFor(d.level);
  const vault = await openVault(player);
  const bag = bagOf(player);
  const container = st.mode === "vault" ? vault : bag;
  const limit = st.mode === "vault" ? cap : bag.size;

  const cells = cellsFor(st, container, cap);
  const pages = Math.max(1, Math.ceil(cells.length / PAGE_SIZE));
  st.page = Math.min(st.page, pages - 1);
  const selItem = st.selected >= 0 ? container.getItem(st.selected) : undefined;
  if (!selItem) st.confirm = false;

  const form = new SystemForm("vault", st.mode === "vault" ? "SHADOW VAULT" : "YOUR INVENTORY");
  frame(form, player, "inventory");
  const again = () => "inventory";
  const toast = (msg) => player.onScreenDisplay.setActionBar(msg);

  // 7/8: sub-tabs
  const setMode = (mode) => () => {
    if (st.mode !== mode) Object.assign(st, { mode, page: 0, selected: -1, confirm: false });
    return "inventory";
  };
  form.slot(7, "SHADOW VAULT", st.mode === "vault" ? TEX + "tab_active" : BLANK, setMode("vault"), "§5Shadow Vault");
  form.slot(8, "YOUR BAG", st.mode === "bag" ? TEX + "tab_active" : BLANK, setMode("bag"), "§bYour Inventory");

  // 9: capacity
  let used = 0;
  for (let i = 0; i < limit; i++) if (container.getItem(i)) used++;
  form.display(9, st.mode === "vault" ? `VAULT CAPACITY: §e${used}§f/${cap}` : `INVENTORY: §e${used}§f/${bag.size}`);

  // 10-12: pager
  form.slot(10, "<", BLANK, () => ((st.page = (st.page - 1 + pages) % pages), "inventory"), "« Previous Page");
  form.display(11, `PAGE ${st.page + 1}/${pages}`);
  form.slot(12, ">", BLANK, () => ((st.page = (st.page + 1) % pages), "inventory"), "Next Page »");

  // 13-15: filter, sort, stack
  form.slot(13, `FILTER: ${FILTERS[st.filter]}`, BLANK, () => {
    st.filter = (st.filter + 1) % FILTERS.length;
    st.page = 0;
    return "inventory";
  });
  form.slot(14, "SORT ALL", BLANK, () => {
    sortContainer(vault, cap, sortKey);
    st.selected = -1;
    saveVault(player);
    toast("§bVault sorted");
    return "inventory";
  });
  form.slot(15, "STACK ALL", BLANK, () => {
    stackContainer(vault, cap);
    saveVault(player);
    toast("§bVault stacked");
    return "inventory";
  });

  // 16-18: actions on the selected item
  if (st.mode === "vault") {
    form.slot(16, selItem ? "MOVE TO INVENTORY" : "§8MOVE TO INVENTORY", BLANK, () => {
      if (!selItem) return again();
      const r = moveStack(vault, st.selected, bag, bag.size);
      if (r.moved === 0) toast("§cYour inventory is full");
      else saveVault(player);
      return again();
    });
    form.slot(17, selItem ? "TAKE 1" : "§8TAKE 1", BLANK, () => {
      if (!selItem) return again();
      const r = moveStack(vault, st.selected, bag, bag.size, 1);
      if (r.moved === 0) toast("§cYour inventory is full");
      else saveVault(player);
      return again();
    });
  } else {
    form.slot(16, selItem ? "STORE IN VAULT" : "§8STORE IN VAULT", BLANK, () => {
      if (!selItem) return again();
      const r = moveStack(bag, st.selected, vault, cap);
      if (r.locked) toast("§cThis item is bound to you");
      else if (r.moved === 0) toast("§cThe vault is full");
      else saveVault(player);
      return again();
    });
    form.slot(17, "STORE ALL", BLANK, () => {
      // Everything except the hotbar.
      let moved = 0;
      let full = false;
      for (let i = 9; i < bag.size; i++) {
        if (!bag.getItem(i)) continue;
        const r = moveStack(bag, i, vault, cap);
        moved += r.moved;
        if (!r.locked && bag.getItem(i)) full = true;
      }
      if (moved > 0) saveVault(player);
      toast(full ? "§eStored what fits - the vault is full" : moved ? "§bStored all items (hotbar kept)" : "§7Nothing to store");
      return again();
    }, "Store All (except hotbar)");
  }
  const canDiscard = selItem && selItem.lockMode === ItemLockMode.none;
  form.slot(18, st.confirm ? "CONFIRM?" : canDiscard ? "DISCARD" : "§8DISCARD", BLANK, () => {
    if (!canDiscard) return again();
    if (!st.confirm) {
      st.confirm = true;
      return again();
    }
    container.setItem(st.selected, undefined);
    st.confirm = false;
    if (st.mode === "vault") saveVault(player);
    toast("§cItem discarded");
    return again();
  }, st.confirm ? "§cConfirm Discard" : "§cDiscard");

  // 19: selected icon + body text
  form.display(19, "", selItem ? iconOf(selItem.typeId) : BLANK);
  if (selItem) {
    form.body({ rawtext: describe(selItem) });
  } else {
    form.body(
      st.mode === "vault"
        ? `§7Select an item.\n\n§8+9 slots every 5 levels.\n§8Max ${VAULT_SIZE} slots.`
        : "§7Select an item to store it in the Shadow Vault.",
    );
  }

  // 20..64: grid
  const pageCells = cells.slice(st.page * PAGE_SIZE, st.page * PAGE_SIZE + PAGE_SIZE);
  for (let i = 0; i < PAGE_SIZE; i++) {
    const cell = pageCells[i];
    const idx = GRID_START + i;
    if (!cell) {
      form.display(idx, "N|", BLANK);
      continue;
    }
    if (cell.locked) {
      const lvl = unlockLevelFor(cell.slot);
      form.slot(idx, "N|", TEX + "lock", () => (toast(`§7Unlocks at level §e${lvl}`), again()));
      continue;
    }
    const item = container.getItem(cell.slot);
    // "S|" = selected, "N|" = not selected; the rest is the stack count.
    const sel = cell.slot === st.selected ? "S|" : "N|";
    if (!item) {
      form.slot(idx, sel, BLANK, () => ((st.selected = -1), again()));
      continue;
    }
    const count = item.amount > 1 ? String(item.amount) : "";
    form.slot(
      idx,
      sel + count,
      iconOf(item.typeId),
      () => {
        st.selected = st.selected === cell.slot ? -1 : cell.slot;
        st.confirm = false;
        return again();
      },
      `${cell.slot === st.selected ? "§a> " : ""}${item.nameTag ?? prettyId(item.typeId)} §7x${item.amount}`,
    );
  }

  return form.show(player);
}

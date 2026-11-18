// SystemForm: builds ActionFormData that the resource pack re-skins into the
// System UI. Each layout has fixed button indices (see tools/gen_ui.py).
// If a player turns "Custom UI" off, the same form is shown as a plain list.
import { system } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { getData } from "../data.js";

export const TEX = "textures/sl/ui/";
export const BLANK = TEX + "blank";
const LIST_PREFIX = "sl:l|";

/** Progress bar texture path. kind: xp|hp|mp|fatigue|stamina */
export function barTex(kind, cur, max) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  return `${TEX}bars/${kind}_${Math.round(ratio * 20)}`;
}

/**
 * @typedef {{text:string, icon?:string, onPress?:Function, display?:boolean}} Slot
 */
export class SystemForm {
  /**
   * @param {"profile"|"list"} layout
   * @param {string} title
   */
  constructor(layout, title) {
    this.layout = layout;
    this.title = title;
    this.bodyText = "";
    /** @type {Slot[]} */
    this.slots = [];
    /** @type {Slot[]} */
    this.list = [];
  }

  body(text) {
    this.bodyText = text;
    return this;
  }

  /** Fixed-position element. */
  slot(index, text, icon, onPress) {
    this.slots[index] = { text, icon, onPress };
    return this;
  }

  /** Display-only element (bars, header): never a button in the custom UI. */
  display(index, text, icon) {
    this.slots[index] = { text, icon, display: true };
    return this;
  }

  /** Button in the scrolling list area (list layout). */
  button(text, icon, onPress) {
    this.list.push({ text, icon, onPress });
    return this;
  }

  /**
   * Shows the form and runs the pressed element's handler.
   * Returns the handler's return value (used for navigation), or undefined
   * if the form was closed.
   * @param {import("@minecraft/server").Player} player
   */
  async show(player) {
    const custom = getData(player).customUi;
    const form = new ActionFormData();
    /** @type {(Slot|undefined)[]} */
    const map = [];

    if (custom) {
      form.title(`sl:${this.layout}|${this.title}`);
      form.body(this.bodyText);
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i] ?? { text: "", display: true };
        form.button(s.text, s.icon ?? BLANK);
        map.push(s);
      }
      for (const s of this.list) {
        form.button(LIST_PREFIX + s.text, s.icon ?? BLANK);
        map.push(s);
      }
    } else {
      // Classic fallback: display elements become body lines.
      const extra = this.slots.filter((s) => s?.display && s.text).map((s) => s.text);
      form.title(this.title);
      form.body([...extra, "", this.bodyText].join("\n"));
      for (const s of [...this.slots, ...this.list]) {
        if (!s || s.display || !s.text) continue;
        if (s.icon && s.icon !== BLANK && !s.icon.includes("/sl/ui/")) form.button(s.text, s.icon);
        else form.button(s.text);
        map.push(s);
      }
    }

    const res = await showForm(player, form);
    if (!res || res.canceled || res.selection === undefined) return undefined;
    const picked = map[res.selection];
    return picked?.onPress ? await picked.onPress() : undefined;
  }
}

/** form.show() that waits while the player is busy (e.g. chat still open). */
export async function showForm(player, form) {
  for (let i = 0; i < 60; i++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (res.cancelationReason !== FormCancelationReason.UserBusy) return res;
    await system.waitTicks(5);
  }
  return undefined;
}

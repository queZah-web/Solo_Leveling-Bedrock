// Attack mode picker (army-wide or one shadow). SPECIFIC lets the player
// tick several mob types.
import { ModalFormData } from "@minecraft/server-ui";
import { MODE_INFO, MODES, SPECIFIC_TYPES } from "../army/targeting.js";
import { showForm } from "./form.js";

const pretty = (t) => t.replace("minecraft:", "").replace(/_/g, " ");

/**
 * @param {import("@minecraft/server").Player} player
 * @param {{title:string, allowArmy?:boolean, mode?:string, targets?:string[]}} opts
 * @returns {Promise<{mode:string, targets?:string[]}|undefined>}
 */
export async function pickMode(player, { title, allowArmy = false, mode, targets = [] }) {
  const options = allowArmy ? ["ARMY", ...MODES] : MODES;
  const labels = options.map((m) => (m === "ARMY" ? "ARMY - same as the whole army" : `${m} - ${MODE_INFO[m]}`));
  const res = await showForm(
    player,
    new ModalFormData()
      .title(title)
      .dropdown("Attack priority", labels, { defaultValueIndex: Math.max(0, options.indexOf(mode ?? options[0])) })
      .submitButton("Next"),
  );
  if (!res || res.canceled || !res.formValues) return undefined;
  const chosen = options[Number(res.formValues[0])];
  if (chosen !== "SPECIFIC") return { mode: chosen };

  // Several mob types can be selected.
  const form = new ModalFormData().title("Hunt only these mobs");
  for (const t of SPECIFIC_TYPES) form.toggle(pretty(t), { defaultValue: targets.includes(t) });
  form.submitButton("Hunt");
  const res2 = await showForm(player, form);
  if (!res2 || res2.canceled || !res2.formValues) return undefined;
  const picked = SPECIFIC_TYPES.filter((_, i) => res2.formValues[i] === true);
  if (!picked.length) {
    player.onScreenDisplay.setActionBar("§cSelect at least one mob type");
    return undefined;
  }
  return { mode: "SPECIFIC", targets: picked };
}

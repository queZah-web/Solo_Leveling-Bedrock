// Sneak + interact (or sneak + hit) on your own summoned shadow opens its profile.
import { Player, system, world } from "@minecraft/server";
import { metaOf } from "../army/army.js";
import { stateOf } from "./army_screen.js";
import { openSystem } from "./screens.js";

function openProfile(player, sid) {
  const st = stateOf(player);
  st.selected = sid;
  st.bagSel = -1;
  st.confirm = false;
  openSystem(player, "shadow");
}

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (!ev.player.isSneaking) return;
  const m = metaOf(ev.target);
  if (!m || m.playerId !== ev.player.id) return;
  ev.cancel = true;
  const player = ev.player;
  system.run(() => openProfile(player, m.sid));
});

// Mobile players "tap" = hit. Owner hits on shadows never deal damage.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (!(damagingEntity instanceof Player) || !damagingEntity.isSneaking) return;
  const m = metaOf(hitEntity);
  if (m && m.playerId === damagingEntity.id) openProfile(damagingEntity, m.sid);
});

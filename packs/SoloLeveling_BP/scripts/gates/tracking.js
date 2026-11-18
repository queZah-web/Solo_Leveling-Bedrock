// Wayfinding: a glowing arrow on the ground leads a hunter to the gate they
// track. Particles are sent only to that hunter (player.spawnParticle), so
// other players see nothing and the server load is tiny.
import { system, world } from "@minecraft/server";
import { flash } from "../stats.js";
import { gateLabel, gates } from "./gates.js";

/** playerId -> gate id */
export const tracking = new Map();

export const trackGate = (player, id) => tracking.set(player.id, id);
export const stopTracking = (player) => tracking.delete(player.id);
export const trackedGate = (player) => gates.get(tracking.get(player.id));

const RELATIVE = ["AHEAD", "AHEAD-RIGHT", "RIGHT", "BEHIND-RIGHT", "BEHIND", "BEHIND-LEFT", "LEFT", "AHEAD-LEFT"];

/** Ground height under a point (searching a few blocks up/down from y). */
function groundY(dim, x, y, z) {
  try {
    const hit = dim.getBlockFromRay({ x, y: y + 3, z }, { x: 0, y: -1, z: 0 }, { maxDistance: 8, includePassableBlocks: false });
    if (hit) return hit.block.location.y + 1.1;
  } catch {}
  return y + 0.1;
}

system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const id = tracking.get(p.id);
    if (!id) continue;
    const g = gates.get(id);
    if (!g) {
      tracking.delete(p.id);
      flash(p, "§7The tracked gate has closed.", 60);
      continue;
    }
    if (g.dim !== p.dimension.id) {
      flash(p, `§7${gateLabel(g)} §7is in another dimension.`, 25);
      continue;
    }
    const l = p.location;
    const dx = g.loc.x - l.x;
    const dz = g.loc.z - l.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 6) {
      tracking.delete(p.id);
      flash(p, `§aYou have reached the ${gateLabel(g)}§a!`, 80);
      p.playSound("random.orb", { pitch: 0.8 });
      continue;
    }
    const ux = dx / dist;
    const uz = dz / dist;
    // Arrow shaft: dots along the way, then a chevron head.
    const pts = [];
    for (let i = 2; i <= 11; i += 1.5) pts.push([l.x + ux * i, l.z + uz * i]);
    const hx = l.x + ux * 12;
    const hz = l.z + uz * 12;
    for (const s of [1, 2]) {
      pts.push([hx - ux * s * 0.9 + -uz * s * 0.9, hz - uz * s * 0.9 + ux * s * 0.9]);
      pts.push([hx - ux * s * 0.9 - -uz * s * 0.9, hz - uz * s * 0.9 - ux * s * 0.9]);
    }
    pts.push([hx, hz]);
    const fx = g.red ? "minecraft:basic_flame_particle" : "minecraft:blue_flame_particle";
    for (const [x, z] of pts) {
      try {
        p.spawnParticle(fx, { x, y: groundY(p.dimension, x, l.y, z), z });
      } catch {}
    }
    // Text guide relative to where the hunter looks.
    const view = p.getViewDirection();
    const angle = Math.atan2(uz, ux) - Math.atan2(view.z, view.x);
    const idx = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    flash(p, `${gateLabel(g)} §f${Math.round(dist)}m §b${RELATIVE[idx]}`, 25);
  }
}, 10);

world.beforeEvents.playerLeave.subscribe(({ player }) => tracking.delete(player.id));

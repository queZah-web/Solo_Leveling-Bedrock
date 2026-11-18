// Small shared runtime state (no imports, so any module can use it).

/** playerId -> tick until which Monarch's Domain boosts their shadows. */
export const domainUntil = new Map();
/** playerId -> tick until which Stealth is active (next hit is a sneak attack). */
export const stealthUntil = new Map();

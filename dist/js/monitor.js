// Monitoring level: how loud the preview is in your ears, and nothing else.
//
// Like the reverb and operator on/off, it is listening equipment: it sits at the very end of
// the chain, after the peak meter's reading is taken, so turning it down never hides a patch
// that would clip in SpaceAge or Dexed.

export const MUTE_DB = -48;
export const MAX_DB = 6;
export const DEFAULT_DB = -6;

/** Linear gain for a level in dB; the bottom of the range is silence rather than a whisper. */
export const dbToGain = (db) => (db <= MUTE_DB ? 0 : Math.pow(10, Math.min(MAX_DB, db) / 20));

export const clampDb = (db) => Math.min(MAX_DB, Math.max(MUTE_DB, Math.round(Number(db))));

export function sanitizeVolume(db) {
  if (db == null || db === "") return DEFAULT_DB; // nothing stored yet
  const n = Number(db);
  return Number.isFinite(n) ? clampDb(n) : DEFAULT_DB;
}

/** How the level reads on screen. */
export const volumeText = (db) => (db <= MUTE_DB ? "muted" : `${db > 0 ? "+" : ""}${db} dB`);

/**
 * Hardcoded flight-overlay configuration. No settings system yet — when one
 * lands, these become user-tunable. Until then, edit and recompile.
 *
 * Coordinates match the SITL ArduCopter default starting point (Canberra) so
 * the overlay is sensible against the local mavlink2rest bridge out of the
 * box.
 */
export const homeLocation: [number, number] = [149.165_25, -35.363_26];

/** Max-distance circle radius around home, in meters. Round number — tunable. */
export const maxDistanceMeters = 200;

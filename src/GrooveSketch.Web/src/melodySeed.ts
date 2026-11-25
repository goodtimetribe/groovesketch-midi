import type { MelodicTrackId } from "./hardwareTracks";

// Fixed values preserve reproducibility; Midi1 retains the original sketch seed.
const melodyTrackSeeds: Record<MelodicTrackId, number> = {
  synth1: 1, synth2: 2, midi1: 0, midi2: 3,
};

export function melodySeed(seed: number, track: MelodicTrackId): number {
  if (!Number.isInteger(seed) || seed < -2147483648 || seed > 2147483647)
    throw new RangeError("Melody seed must be a signed 32-bit integer.");
  return seed ^ melodyTrackSeeds[track];
}

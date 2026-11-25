import type { MelodicTrackId } from "./hardwareTracks";

export type HardwarePatch = number | null;
export type HardwarePatches = Record<MelodicTrackId, HardwarePatch>;

export const defaultHardwarePatches: HardwarePatches = {
  synth1: null, synth2: null, midi1: null, midi2: null,
};

export function isHardwarePatch(value: unknown): value is HardwarePatch {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 127);
}

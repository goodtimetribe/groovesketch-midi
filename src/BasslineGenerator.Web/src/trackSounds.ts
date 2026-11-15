import type { MelodicTrackId } from "./hardwareTracks";

export type BrowserSound = {
  label: string;
  oscillator: OscillatorType;
  cutoff: number;
  resonance: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  level: number;
  filterEnd?: number;
};

export const browserSounds = {
  classic: { label: "Classic", oscillator: "sawtooth", cutoff: 700, resonance: 1, attack: 0.01, decay: 0, sustain: 1, release: 0.04, level: 0.22 },
  bass: { label: "Bass", oscillator: "triangle", cutoff: 450, resonance: 1, attack: 0.01, decay: 0.12, sustain: 0.8, release: 0.06, level: 0.27 },
  acidBass: { label: "Acid Bass", oscillator: "sawtooth", cutoff: 2400, filterEnd: 450, resonance: 8, attack: 0.005, decay: 0.14, sustain: 0.65, release: 0.04, level: 0.16 },
  warmPad: { label: "Warm Pad", oscillator: "triangle", cutoff: 900, resonance: 1, attack: 0.25, decay: 0.15, sustain: 0.8, release: 0.3, level: 0.2 },
  dreamPad: { label: "Dream Pad", oscillator: "sine", cutoff: 1300, resonance: 1, attack: 0.4, decay: 0.2, sustain: 0.7, release: 0.4, level: 0.2 },
  sawLead: { label: "Saw Lead", oscillator: "sawtooth", cutoff: 3000, resonance: 1, attack: 0.01, decay: 0.08, sustain: 0.8, release: 0.08, level: 0.16 },
  squareLead: { label: "Square Lead", oscillator: "square", cutoff: 1800, resonance: 1, attack: 0.015, decay: 0.08, sustain: 0.75, release: 0.07, level: 0.12 },
  keys: { label: "Keys", oscillator: "triangle", cutoff: 2200, resonance: 1, attack: 0.005, decay: 0.2, sustain: 0.45, release: 0.12, level: 0.24 },
  pluck: { label: "Pluck", oscillator: "sawtooth", cutoff: 2000, filterEnd: 500, resonance: 2, attack: 0.005, decay: 0.12, sustain: 0.15, release: 0.05, level: 0.18 },
} as const satisfies Record<string, BrowserSound>;

export type BrowserSoundId = keyof typeof browserSounds;
export type TrackSounds = Record<MelodicTrackId, BrowserSoundId>;

export const defaultTrackSounds: TrackSounds = {
  synth1: "classic", synth2: "classic", midi1: "classic", midi2: "classic",
};

export function isBrowserSoundId(value: unknown): value is BrowserSoundId {
  return typeof value === "string" && Object.hasOwn(browserSounds, value);
}

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
  analogPad: { label: "Analog Pad", oscillator: "sawtooth", cutoff: 1100, resonance: 1.5, attack: 0.2, decay: 0.25, sustain: 0.75, release: 0.4, level: 0.14 },
  junoPad: { label: "Juno Pad", oscillator: "sawtooth", cutoff: 2200, resonance: 2, attack: 0.16, decay: 0.2, sustain: 0.8, release: 0.45, level: 0.14 },
  sawLead: { label: "Saw Lead", oscillator: "sawtooth", cutoff: 3000, resonance: 1, attack: 0.01, decay: 0.08, sustain: 0.8, release: 0.08, level: 0.16 },
  squareLead: { label: "Square Lead", oscillator: "square", cutoff: 1800, resonance: 1, attack: 0.015, decay: 0.08, sustain: 0.75, release: 0.07, level: 0.12 },
  supersawLead: { label: "Supersaw Lead", oscillator: "sawtooth", cutoff: 4200, resonance: 2, attack: 0.015, decay: 0.12, sustain: 0.75, release: 0.1, level: 0.13 },
  keys: { label: "Keys", oscillator: "triangle", cutoff: 2200, resonance: 1, attack: 0.005, decay: 0.2, sustain: 0.45, release: 0.12, level: 0.24 },
  fmBell: { label: "FM Bell", oscillator: "sine", cutoff: 7000, resonance: 1, attack: 0.003, decay: 0.55, sustain: 0.08, release: 0.45, level: 0.22 },
  organ: { label: "Organ", oscillator: "square", cutoff: 3600, resonance: 0.8, attack: 0.01, decay: 0, sustain: 1, release: 0.08, level: 0.12 },
  strings: { label: "Strings", oscillator: "sawtooth", cutoff: 1600, resonance: 1.2, attack: 0.3, decay: 0.2, sustain: 0.8, release: 0.35, level: 0.13 },
  pluck: { label: "Pluck", oscillator: "sawtooth", cutoff: 2000, filterEnd: 500, resonance: 2, attack: 0.005, decay: 0.12, sustain: 0.15, release: 0.05, level: 0.18 },
  softPluck: { label: "Soft Pluck", oscillator: "triangle", cutoff: 1200, filterEnd: 350, resonance: 1, attack: 0.008, decay: 0.18, sustain: 0.08, release: 0.08, level: 0.22 },
  brightPluck: { label: "Bright Pluck", oscillator: "square", cutoff: 5200, filterEnd: 800, resonance: 3, attack: 0.002, decay: 0.09, sustain: 0.05, release: 0.04, level: 0.1 },
} as const satisfies Record<string, BrowserSound>;

export type BrowserSoundId = keyof typeof browserSounds;
export type TrackSounds = Record<MelodicTrackId, BrowserSoundId>;

export const defaultTrackSounds: TrackSounds = {
  synth1: "classic", synth2: "classic", midi1: "classic", midi2: "classic",
};

export function isBrowserSoundId(value: unknown): value is BrowserSoundId {
  return typeof value === "string" && Object.hasOwn(browserSounds, value);
}

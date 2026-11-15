export const hardwareTrackIds = [
  "synth1", "synth2", "midi1", "midi2", "drum1", "drum2", "drum3", "drum4",
] as const;

export type HardwareTrackId = typeof hardwareTrackIds[number];
export type DrumTrackId = Extract<HardwareTrackId, `drum${number}`>;
export type MusicalRole =
  | "bass" | "chords" | "lead" | "pad" | "keys" | "strings" | "brass" | "arp"
  | "kick" | "snare" | "hats" | "percussion" | "custom";
export type RgbColor = readonly [red: number, green: number, blue: number];

export const hardwareTracks = {
  synth1: { color: [230, 72, 152], defaultChannel: 0 },
  synth2: { color: [94, 224, 181], defaultChannel: 1 },
  midi1: { color: [73, 158, 255], defaultChannel: 2 },
  midi2: { color: [244, 115, 167], defaultChannel: 3 },
  drum1: { color: [255, 139, 61], defaultChannel: 9 },
  drum2: { color: [255, 210, 66], defaultChannel: 9 },
  drum3: { color: [180, 140, 255], defaultChannel: 9 },
  drum4: { color: [69, 211, 224], defaultChannel: 9 },
} as const satisfies Record<HardwareTrackId, { color: RgbColor; defaultChannel: number }>;

export const defaultRoleAssignments = {
  synth1: "bass", synth2: "chords",
  drum1: "kick", drum2: "snare", drum3: "hats", drum4: "percussion",
} as const satisfies Partial<Record<HardwareTrackId, MusicalRole>>;

export function drumTrackForNote(midiNote: number): DrumTrackId {
  switch (midiNote) {
    case 36: return "drum1";
    case 38: return "drum2";
    case 42: return "drum3";
    default: return "drum4";
  }
}

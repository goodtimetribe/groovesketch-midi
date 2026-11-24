import type { NoteData } from "./types";

export const trackActionTypes = ["rebuild", "apply", "vary"] as const;
export type TrackAction = typeof trackActionTypes[number];

export const actionableRoles = ["bass", "chords", "lead", "pad", "drums", "aux-percussion"] as const;
export type ActionableRole = typeof actionableRoles[number];

export const actionLabel: Record<TrackAction, string> = {
  rebuild: "Rebuild",
  apply: "Apply",
  vary: "Vary",
};

export const actionDescription: Record<TrackAction, string> = {
  rebuild: "Generate new content from the current musical settings.",
  apply: "Apply a pattern, style, sound, or setting without replacing other content.",
  vary: "Create a related variation that preserves the current musical intent.",
};

export const actionsForRole: Record<ActionableRole, readonly TrackAction[]> = {
  bass: ["rebuild", "vary"],
  chords: ["rebuild", "vary"],
  lead: ["rebuild", "vary"],
  pad: ["rebuild", "vary"],
  drums: ["apply", "vary"],
  "aux-percussion": ["apply", "vary"],
};

export const defaultActionForRole: Record<ActionableRole, TrackAction> = {
  bass: "vary",
  chords: "rebuild",
  lead: "rebuild",
  pad: "rebuild",
  drums: "apply",
  "aux-percussion": "apply",
};

export const roleLabel: Record<ActionableRole, string> = {
  bass: "Bass",
  chords: "Chords",
  lead: "Lead",
  pad: "Pad",
  drums: "Drums",
  "aux-percussion": "Aux Percussion",
};

export function legacyMelodyRole(role: string): ActionableRole | null {
  if (role === "melody") return "lead";
  return actionableRoles.includes(role as ActionableRole) ? role as ActionableRole : null;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function varyChordNotes(notes: NoteData[], seed: number): NoteData[] {
  const next = random(seed);
  const bars = new Map<number, NoteData[]>();
  for (const note of notes) {
    const bar = Math.floor(note.startBeat / 4);
    bars.set(bar, [...(bars.get(bar) ?? []), note]);
  }
  return notes.map((note) => {
    const chord = bars.get(Math.floor(note.startBeat / 4)) ?? [];
    if (chord.length !== 3) return { ...note };
    const highest = Math.max(...chord.map((item) => item.midiNote));
    const lowest = Math.min(...chord.map((item) => item.midiNote));
    const moveLowest = note.midiNote === lowest && highest <= 115 && next() < 0.72;
    const moveHighest = note.midiNote === highest && lowest >= 12 && !moveLowest && next() < 0.18;
    const midiNote = note.midiNote + (moveLowest ? 12 : moveHighest ? -12 : 0);
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return { ...note, midiNote, note: `${names[midiNote % 12]}${Math.floor(midiNote / 12) - 1}` };
  });
}

export function varyRhythmNotes(notes: NoteData[], seed: number): NoteData[] {
  const next = random(seed);
  return notes.map((note) => ({
    ...note,
    velocity: Math.max(1, Math.min(127, Math.round(note.velocity + (next() - 0.5) * 22))),
  }));
}

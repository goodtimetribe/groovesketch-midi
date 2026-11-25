import type { NoteData } from "./types";

export const trackActionTypes = ["rebuild", "apply", "vary"] as const;
export type TrackAction = typeof trackActionTypes[number];

export const actionableRoles = ["bass", "chords", "lead", "pad", "drums", "aux-percussion"] as const;
export type ActionableRole = typeof actionableRoles[number];

export const actionLabel: Record<TrackAction, string> = {
  rebuild: "Replace with new content",
  apply: "Use selected pattern",
  vary: "Create a variation",
};

export const actionDescription: Record<TrackAction, string> = {
  rebuild: "Replace this track's existing content with newly generated notes.",
  apply: "Use the selected pattern for this role without changing other tracks.",
  vary: "Create a related version of this role while keeping its musical intent.",
};

export function actionDescriptionForRole(action: TrackAction, role: ActionableRole): string {
  if (action === "vary" && (role === "drums" || role === "aux-percussion"))
    return "Create a rhythmic variation of the selected pattern while keeping its pattern family.";
  return actionDescription[action];
}

export function actionButtonLabel(action: TrackAction, role: ActionableRole): string {
  if (action === "rebuild") return `Replace ${roleLabel[role]}`;
  if (action === "apply") return `Use ${roleLabel[role]} Pattern`;
  return `Create ${roleLabel[role]} Variation`;
}

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
  const varied = notes.map((note) => ({
    ...note,
    velocity: Math.max(1, Math.min(127, Math.round(note.velocity + (next() - 0.5) * 22))),
  }));
  const bars = new Map<number, number[]>();
  varied.forEach((note, index) => {
    const bar = Math.floor(note.startBeat / 4);
    bars.set(bar, [...(bars.get(bar) ?? []), index]);
  });
  for (const [bar, indexes] of bars) {
    const percussion = indexes.filter((index) => ![36, 38].includes(varied[index].midiNote));
    const candidates = percussion.length ? percussion : indexes;
    const first = Math.floor(next() * candidates.length);
    for (let offset = 0; offset < candidates.length; offset++) {
      const index = candidates[(first + offset) % candidates.length];
      const note = varied[index];
      const barStart = bar * 4;
      const shifts = next() < 0.5 ? [0.5, -0.5, 0.25, -0.25] : [-0.5, 0.5, -0.25, 0.25];
      const shift = shifts.find((amount) => {
        const startBeat = note.startBeat + amount;
        return startBeat >= barStart && startBeat + note.durationBeats <= barStart + 4 &&
          !indexes.some((other) => other !== index && varied[other].midiNote === note.midiNote &&
            varied[other].startBeat === startBeat);
      });
      if (shift !== undefined) {
        varied[index] = { ...note, startBeat: note.startBeat + shift };
        break;
      }
    }
  }
  return varied;
}

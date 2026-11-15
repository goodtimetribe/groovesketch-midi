import { api } from "./api";
import { arrangeDrums, type DrumPattern } from "./drumPatterns";
import { melodySeed } from "./melodySeed";
import { readChordNotes, type MelodicContent } from "./trackView";
import type { GenerationPackage, NoteData } from "./types";

export interface Sketch {
  pkg: GenerationPackage;
  tracks: MelodicContent;
  chordNotes: NoteData[];
  drumNotes: NoteData[];
  patternId: string;
}

export function validateMelodyNotes(value: unknown): NoteData[] {
  const isNoteData = (note: unknown): note is NoteData => typeof note === "object" && note !== null &&
    "note" in note && typeof note.note === "string" && note.note.trim().length > 0 &&
    "midiNote" in note && typeof note.midiNote === "number" && Number.isInteger(note.midiNote) && note.midiNote >= 0 && note.midiNote <= 127 &&
    "startBeat" in note && typeof note.startBeat === "number" && Number.isFinite(note.startBeat) && note.startBeat >= 0 &&
    "durationBeats" in note && typeof note.durationBeats === "number" && Number.isFinite(note.durationBeats) && note.durationBeats > 0 &&
    "velocity" in note && typeof note.velocity === "number" && Number.isInteger(note.velocity) && note.velocity >= 1 && note.velocity <= 127;
  if (!Array.isArray(value) || value.length === 0 || !value.every(isNoteData)) throw new Error("The melody response was invalid.");
  return value;
}

export async function createSketch(pkg: GenerationPackage, pattern: DrumPattern): Promise<Sketch> {
  if (!Array.isArray(pkg.notes) || !pkg.notes.length) throw new Error("The generated bass notes were missing.");
  const [chordBlob, melodyResponse] = await Promise.all([
    api.combinedMidi(pkg),
    api.melody({
      rootNote: pkg.effectiveConfiguration.rootNote,
      scaleType: pkg.effectiveConfiguration.scaleType,
      progressionId: pkg.effectiveConfiguration.progressionId,
      sections: pkg.effectiveConfiguration.sections.map(({ bars }) => ({ bars })),
      seed: melodySeed(pkg.seed, "midi1"),
    }),
  ]);
  const chordNotes = readChordNotes(await chordBlob.arrayBuffer());
  if (!chordNotes.length) throw new Error("The generated chord notes were missing.");
  const melody = validateMelodyNotes(melodyResponse);
  const drumNotes = arrangeDrums(pattern, pkg.effectiveConfiguration.sections);
  if (!drumNotes.length) throw new Error("The selected drum pattern produced no notes.");
  return {
    pkg, chordNotes, drumNotes, patternId: pattern.id,
    tracks: {
      synth1: { role: "bass", notes: pkg.notes },
      synth2: { role: "chords", notes: chordNotes },
      midi1: { role: "lead", notes: melody },
      midi2: { role: null, notes: [] },
    },
  };
}

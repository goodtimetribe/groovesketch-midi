import type { MelodicTrackId } from "./hardwareTracks";
import { melodySeed } from "./melodySeed";
import type { NoteData } from "./types";

const lowestPadPitch = 85;
const highestPadPitch = 107;
const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function generatePad(chordNotes: NoteData[], bars: number, seed: number, track: MelodicTrackId): NoteData[] {
  if (!Number.isInteger(bars) || bars < 1) throw new RangeError("Pad arrangement must contain at least one bar.");
  const choiceSeed = (melodySeed(seed, track) ^ 0x504144) >>> 0;
  const chords = new Map<number, number[]>();
  for (const note of chordNotes) {
    if (!Number.isInteger(note.midiNote) || note.midiNote < 0 || note.midiNote > 127 ||
      !Number.isInteger(note.startBeat) || note.startBeat < 0 || note.startBeat % 4 !== 0 ||
      note.startBeat >= bars * 4 || note.durationBeats !== 4)
      throw new Error("Pad generation requires one sustained chord per bar.");
    const pitches = chords.get(note.startBeat) ?? [];
    pitches.push(note.midiNote % 12);
    chords.set(note.startBeat, pitches);
  }

  const result: NoteData[] = [];
  let previous: number[] | null = null;
  let active = new Map<number, NoteData>();
  for (let bar = 0; bar < bars; bar++) {
    const pitchClasses = chords.get(bar * 4);
    if (!pitchClasses || pitchClasses.length !== 3 || new Set(pitchClasses).size !== 3)
      throw new Error("Pad generation requires a triad in every bar.");
    const choices = pitchClasses.map((pitchClass) =>
      Array.from({ length: highestPadPitch - lowestPadPitch + 1 }, (_, index) => lowestPadPitch + index)
        .filter((pitch) => pitch % 12 === pitchClass));
    const candidates: number[][] = [];
    for (const first of choices[0]) for (const second of choices[1]) for (const third of choices[2]) {
      const voicing = [first, second, third].sort((a, b) => a - b);
      if (voicing[2] - voicing[0] >= 12) candidates.push(voicing);
    }
    if (!candidates.length) throw new Error("The chord cannot be voiced in the pad register.");
    const prior: number[] | null = previous;
    const distance = (voicing: number[]): number => prior
      ? voicing.reduce((sum, pitch, index) => sum + Math.abs(pitch - prior[index]), 0)
      : 0;
    const minimum = Math.min(...candidates.map(distance));
    const best = candidates.filter((voicing) => distance(voicing) === minimum);
    const voicing = best[choiceSeed % best.length];
    const next = new Map<number, NoteData>();
    for (const pitch of voicing) {
      const sustained = active.get(pitch);
      if (sustained) {
        sustained.durationBeats += 4;
        next.set(pitch, sustained);
      } else {
        const note = { note: `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`, midiNote: pitch,
          startBeat: bar * 4, durationBeats: 4, velocity: 65 };
        result.push(note);
        next.set(pitch, note);
      }
    }
    previous = voicing;
    active = next;
  }
  return result;
}

import type { NoteData, Section } from "./types";

export interface DrumPattern {
  id: string;
  name: string;
  bars: number;
  notes: NoteData[];
}

export const drumPatterns: DrumPattern[] = [
  {
    id: "four-on-the-floor", name: "Four on the floor", bars: 1,
    notes: [
      { note: "C2", midiNote: 36, startBeat: 0, durationBeats: 0.25, velocity: 110 },
      { note: "C2", midiNote: 36, startBeat: 1, durationBeats: 0.25, velocity: 110 },
      { note: "C2", midiNote: 36, startBeat: 2, durationBeats: 0.25, velocity: 110 },
      { note: "C2", midiNote: 36, startBeat: 3, durationBeats: 0.25, velocity: 110 },
      { note: "D2", midiNote: 38, startBeat: 1, durationBeats: 0.25, velocity: 100 },
      { note: "D2", midiNote: 38, startBeat: 3, durationBeats: 0.25, velocity: 100 },
      { note: "F#2", midiNote: 42, startBeat: 0.5, durationBeats: 0.25, velocity: 75 },
      { note: "F#2", midiNote: 42, startBeat: 1.5, durationBeats: 0.25, velocity: 75 },
      { note: "F#2", midiNote: 42, startBeat: 2.5, durationBeats: 0.25, velocity: 75 },
      { note: "F#2", midiNote: 42, startBeat: 3.5, durationBeats: 0.25, velocity: 75 },
    ],
  },
  {
    id: "half-time", name: "Half time", bars: 2,
    notes: [
      { note: "C2", midiNote: 36, startBeat: 0, durationBeats: 0.25, velocity: 110 },
      { note: "D2", midiNote: 38, startBeat: 2, durationBeats: 0.25, velocity: 100 },
      { note: "C2", midiNote: 36, startBeat: 4, durationBeats: 0.25, velocity: 110 },
      { note: "C2", midiNote: 36, startBeat: 5.5, durationBeats: 0.25, velocity: 90 },
      { note: "D2", midiNote: 38, startBeat: 6, durationBeats: 0.25, velocity: 100 },
    ],
  },
];

export function arrangeDrums(pattern: DrumPattern, sections: Section[]): NoteData[] {
  const notes: NoteData[] = [];
  let sectionStart = 0;
  const loopBeats = pattern.bars * 4;
  for (const section of sections) {
    const sectionEnd = sectionStart + section.bars * 4;
    for (let loop = sectionStart; loop < sectionEnd; loop += loopBeats) {
      for (const note of pattern.notes) {
        const startBeat = loop + note.startBeat;
        if (startBeat >= sectionEnd) continue;
        notes.push({ ...note, startBeat, durationBeats: Math.min(note.durationBeats, sectionEnd - startBeat) });
      }
    }
    sectionStart = sectionEnd;
  }
  return notes;
}

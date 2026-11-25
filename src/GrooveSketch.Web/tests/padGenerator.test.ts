import { expect, it } from "vitest";
import { generatePad } from "../src/padGenerator";
import type { NoteData } from "../src/types";

const chord = (pitches: number[], bar: number): NoteData[] => pitches.map((midiNote) => ({
  note: "chord", midiNote, startBeat: bar * 4, durationBeats: 4, velocity: 90,
}));

it("generates reproducible open triads with sustained common tones and smooth voice leading", () => {
  const chords = [
    ...chord([60, 64, 67], 0), ...chord([60, 64, 67], 1),
    ...chord([57, 60, 64], 2), ...chord([57, 60, 64], 3),
  ];
  const original = structuredClone(chords);
  const notes = generatePad(chords, 4, 17, "midi2");
  expect(generatePad(chords, 4, 17, "midi2")).toEqual(notes);
  expect(chords).toEqual(original);
  expect(notes.every((note) => note.midiNote >= 85 && note.midiNote <= 107 &&
    note.durationBeats >= 4 && note.durationBeats % 4 === 0)).toBe(true);

  const voicings = [0, 1, 2, 3].map((bar) => notes
    .filter((note) => note.startBeat <= bar * 4 && note.startBeat + note.durationBeats > bar * 4)
    .map((note) => note.midiNote).sort((a, b) => a - b));
  for (const [bar, voicing] of voicings.entries()) {
    expect(voicing).toHaveLength(3);
    expect(voicing[2] - voicing[0]).toBeGreaterThanOrEqual(12);
    expect(voicing.map((pitch) => pitch % 12).sort((a, b) => a - b))
      .toEqual((bar < 2 ? [0, 4, 7] : [0, 4, 9]));
  }
  expect(voicings[0]).toEqual(voicings[1]);
  expect(voicings[2]).toEqual(voicings[3]);
  expect(voicings[0].reduce((sum, pitch, index) => sum + Math.abs(pitch - voicings[2][index]), 0)).toBeLessThanOrEqual(2);
  expect(notes.some((note) => note.durationBeats === 16)).toBe(true);
});

it("voices major and minor triads in every key without copying the chord voicing", () => {
  for (let root = 0; root < 12; root++) for (const third of [3, 4]) {
    const source = chord([48 + root, 48 + root + third, 55 + root], 0);
    const notes = generatePad(source, 1, -8, "synth1");
    const pitches = notes.map((note) => note.midiNote).sort((a, b) => a - b);
    expect(pitches[0]).toBeGreaterThanOrEqual(85);
    expect(pitches[2]).toBeLessThanOrEqual(107);
    expect(pitches[2] - pitches[0]).toBeGreaterThanOrEqual(12);
    expect(pitches.map((pitch) => pitch % 12).sort((a, b) => a - b))
      .toEqual(source.map((note) => note.midiNote % 12).sort((a, b) => a - b));
  }
});

it("rejects incomplete or malformed chord timelines rather than replacing a track with invalid notes", () => {
  expect(() => generatePad([], 1, 1, "midi1")).toThrow(/triad/);
  expect(() => generatePad(chord([60, 64, 67], 0), 2, 1, "midi1")).toThrow(/triad/);
  expect(() => generatePad(chord([60, 64, 72], 0), 1, 1, "midi1")).toThrow(/triad/);
  expect(() => generatePad(chord([60, 64, 67], 0).map((note) => ({ ...note, durationBeats: 1 })), 1, 1, "midi1"))
    .toThrow(/sustained chord/);
  expect(() => generatePad(chord([60, 64, 67], 0), 1, NaN, "midi1")).toThrow(/seed/);
});

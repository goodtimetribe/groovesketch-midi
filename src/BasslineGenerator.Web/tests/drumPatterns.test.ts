import { describe, expect, it } from "vitest";
import { arrangeDrums, drumPatterns, type DrumPattern } from "../src/drumPatterns";
import type { Section } from "../src/types";

const section = (bars: number): Section => ({
  name: "Section", style: "Acid", bars,
  behavior: { movement: 0, groove: 0, mutation: 0, tension: 0, repetition: 0 },
});

describe("drum patterns", () => {
  it("restarts loops at each section and truncates notes at section boundaries", () => {
    const pattern: DrumPattern = {
      id: "test", name: "Test", description: "Test pattern", bars: 2,
      notes: [
        { note: "C2", midiNote: 36, startBeat: 0, durationBeats: 1, velocity: 100 },
        { note: "D2", midiNote: 38, startBeat: 3.5, durationBeats: 1, velocity: 90 },
      ],
    };
    const notes = arrangeDrums(pattern, [section(3), section(1)]);
    expect(notes.map(({ startBeat, durationBeats }) => [startBeat, durationBeats]))
      .toEqual([[0, 1], [3.5, 1], [8, 1], [11.5, 0.5], [12, 1], [15.5, 0.5]]);
    expect(pattern.notes[1].durationBeats).toBe(1);
  });

  it("ships selectable patterns with notes confined to their loop", () => {
    expect(drumPatterns.length).toBeGreaterThan(0);
    expect(new Set(drumPatterns.map(({ id }) => id)).size).toBe(drumPatterns.length);
    for (const pattern of drumPatterns) {
      expect(pattern.name.trim()).not.toBe("");
      expect(pattern.description.trim()).not.toBe("");
      expect(pattern.notes.length).toBeGreaterThan(0);
      expect(Number.isInteger(pattern.bars) && pattern.bars > 0).toBe(true);
      for (const note of pattern.notes) {
        expect(note.startBeat).toBeGreaterThanOrEqual(0);
        expect(note.durationBeats).toBeGreaterThan(0);
        expect(note.startBeat + note.durationBeats).toBeLessThanOrEqual(pattern.bars * 4);
        expect(Number.isInteger(note.velocity) && note.velocity > 0 && note.velocity <= 127).toBe(true);
      }
    }
  });

  it.each([
    ["rock-backbeat", 54],
    ["rock-half-time", 56],
    ["jazz-swing", 70],
    ["jazz-shuffle", 75],
    ["reggae-one-drop", 63],
    ["reggae-steppers", 60],
    ["funk-pocket", 56],
    ["blues-shuffle", 75],
    ["house-shaker", 70],
    ["techno-cowbell", 56],
    ["trance-tambourine", 54],
    ["electro-claves", 75],
    ["breakbeat-bongo", 60],
    ["synthwave-conga", 63],
  ])("arranges %s with its percussion voice and repeats from each section", (id, percussion) => {
    const pattern = drumPatterns.find((item) => item.id === id);
    expect(pattern).toBeDefined();
    expect(pattern!.description).toContain("Drum 4");
    const original = structuredClone(pattern!.notes);
    expect(new Set(pattern!.notes.map(({ midiNote }) => midiNote))).toEqual(new Set([36, 38, 42, percussion]));
    const arranged = arrangeDrums(pattern!, [section(pattern!.bars * 2), section(1)]);
    const loopBeats = pattern!.bars * 4;
    expect(arranged.filter(({ startBeat }) => startBeat >= loopBeats && startBeat < 2 * loopBeats))
      .toEqual(original.map((note) => ({ ...note, startBeat: note.startBeat + loopBeats })));
    expect(arranged.filter(({ startBeat }) => startBeat >= 2 * loopBeats))
      .toEqual(original.filter(({ startBeat }) => startBeat < 4)
        .map((note) => ({ ...note, startBeat: note.startBeat + 2 * loopBeats })));
    expect(pattern!.notes).toEqual(original);
  });
});

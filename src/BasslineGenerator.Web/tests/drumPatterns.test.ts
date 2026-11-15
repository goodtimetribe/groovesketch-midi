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
      id: "test", name: "Test", bars: 2,
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
    for (const pattern of drumPatterns) {
      expect(pattern.notes.length).toBeGreaterThan(0);
      expect(pattern.bars).toBeGreaterThan(0);
      for (const note of pattern.notes) {
        expect(note.startBeat).toBeGreaterThanOrEqual(0);
        expect(note.startBeat + note.durationBeats).toBeLessThanOrEqual(pattern.bars * 4);
      }
    }
  });
});

import { expect, it } from "vitest";
import {
  actionButtonLabel, actionDescription, actionDescriptionForRole, actionLabel, actionableRoles, actionsForRole, defaultActionForRole, legacyMelodyRole,
  trackActionTypes, varyChordNotes, varyRhythmNotes,
} from "../src/trackActions";

it("uses one documented action model across logical musical roles", () => {
  expect(trackActionTypes).toEqual(["rebuild", "apply", "vary"]);
  expect(Object.keys(actionDescription)).toEqual(trackActionTypes);
  expect(actionLabel).toEqual({
    rebuild: "Replace with new content",
    apply: "Use selected pattern",
    vary: "Create a variation",
  });
  expect(actionButtonLabel("rebuild", "bass")).toBe("Replace Bass");
  expect(actionButtonLabel("apply", "drums")).toBe("Use Drums Pattern");
  expect(actionButtonLabel("vary", "lead")).toBe("Create Lead Variation");
  expect(actionDescriptionForRole("apply", "drums")).toBe(actionDescription.apply);
  expect(actionDescriptionForRole("vary", "drums")).toContain("selected pattern");
  expect(actionDescriptionForRole("vary", "drums")).toContain("pattern family");
  expect(actionableRoles).toEqual(["bass", "chords", "lead", "pad", "drums", "aux-percussion"]);
  expect(defaultActionForRole).toEqual({
    bass: "vary", chords: "rebuild", lead: "rebuild", pad: "rebuild", drums: "apply", "aux-percussion": "apply",
  });
  for (const role of actionableRoles) expect(actionsForRole[role]).toContain(defaultActionForRole[role]);
  expect(legacyMelodyRole("melody")).toBe("lead");
});

it("creates deterministic musical variations with a noticeable drum rhythm change", () => {
  const chord = [
    { note: "C4", midiNote: 60, startBeat: 0, durationBeats: 4, velocity: 90 },
    { note: "E4", midiNote: 64, startBeat: 0, durationBeats: 4, velocity: 90 },
    { note: "G4", midiNote: 67, startBeat: 0, durationBeats: 4, velocity: 90 },
  ];
  const chordVariation = varyChordNotes(chord, 4);
  expect(chordVariation).toEqual(varyChordNotes(chord, 4));
  expect(chordVariation.map((note) => note.midiNote % 12)).toEqual([0, 4, 7]);
  expect(chordVariation.every((note, index) => note.note === chord[index].note
    || Math.abs(note.midiNote - chord[index].midiNote) === 12)).toBe(true);

  const rhythmVariation = varyRhythmNotes(chord, 4);
  expect(rhythmVariation).toEqual(varyRhythmNotes(chord, 4));
  expect(rhythmVariation.map((note) => note.durationBeats)).toEqual(chord.map((note) => note.durationBeats));
  expect(rhythmVariation.some((note, index) => note.velocity !== chord[index].velocity)).toBe(true);

  const drums = [
    { note: "C2", midiNote: 36, startBeat: 0, durationBeats: 0.25, velocity: 110 },
    { note: "D2", midiNote: 38, startBeat: 1, durationBeats: 0.25, velocity: 100 },
    ...[0.5, 1.5, 2.5, 3.5].map((startBeat) =>
      ({ note: "F#2", midiNote: 42, startBeat, durationBeats: 0.25, velocity: 75 })),
  ];
  const drumVariation = varyRhythmNotes(drums, 4);
  expect(drumVariation).toEqual(varyRhythmNotes(drums, 4));
  expect(drumVariation).toHaveLength(drums.length);
  expect(drumVariation.some((note, index) => note.startBeat !== drums[index].startBeat)).toBe(true);
  expect(drumVariation.every((note) => note.startBeat >= 0 && note.startBeat + note.durationBeats <= 4)).toBe(true);
});

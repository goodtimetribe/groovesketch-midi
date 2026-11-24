import { expect, it } from "vitest";
import {
  actionButtonLabel, actionDescription, actionLabel, actionableRoles, actionsForRole, defaultActionForRole, legacyMelodyRole,
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
  expect(actionableRoles).toEqual(["bass", "chords", "lead", "pad", "drums", "aux-percussion"]);
  expect(defaultActionForRole).toEqual({
    bass: "vary", chords: "rebuild", lead: "rebuild", pad: "rebuild", drums: "apply", "aux-percussion": "apply",
  });
  for (const role of actionableRoles) expect(actionsForRole[role]).toContain(defaultActionForRole[role]);
  expect(legacyMelodyRole("melody")).toBe("lead");
});

it("creates deterministic related variations without changing chord or rhythm intent", () => {
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
  expect(rhythmVariation.map((note) => [note.startBeat, note.durationBeats])).toEqual(
    chord.map((note) => [note.startBeat, note.durationBeats]));
  expect(rhythmVariation.some((note, index) => note.velocity !== chord[index].velocity)).toBe(true);
});

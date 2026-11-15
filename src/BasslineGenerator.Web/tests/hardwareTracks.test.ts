import { describe, expect, it } from "vitest";
import { defaultRoleAssignments, drumTrackForNote, hardwareTrackIds, hardwareTracks, type HardwareTrackId, type MusicalRole } from "../src/hardwareTracks";
import { defaultRoutingProfiles } from "../src/routingProfiles";

describe("hardware tracks", () => {
  it("defines hardware identities independently of their default roles", () => {
    expect(hardwareTrackIds).toEqual(["synth1", "synth2", "midi1", "midi2", "drum1", "drum2", "drum3", "drum4"]);
    expect(defaultRoleAssignments).toEqual({
      synth1: "bass", synth2: "chords", drum1: "kick", drum2: "snare", drum3: "hats", drum4: "percussion",
    });
    const assignments: Partial<Record<HardwareTrackId, MusicalRole>> = {
      synth1: "lead", synth2: "pad", midi1: "strings", midi2: "brass",
    };
    expect(assignments.synth1).toBe("lead");
    expect(hardwareTracks.synth1.color).toEqual([230, 72, 152]);
  });

  it("uses hardware-owned defaults for current routing and maps drum notes to lanes", () => {
    const profile = defaultRoutingProfiles().profiles[0];
    expect([profile.routing.channel, profile.chordRouting.channel, profile.drumRouting.channel]).toEqual([
      hardwareTracks.synth1.defaultChannel, hardwareTracks.synth2.defaultChannel, hardwareTracks.drum1.defaultChannel,
    ]);
    expect([36, 38, 42, 54, 75].map(drumTrackForNote)).toEqual(["drum1", "drum2", "drum3", "drum4", "drum4"]);
  });
});

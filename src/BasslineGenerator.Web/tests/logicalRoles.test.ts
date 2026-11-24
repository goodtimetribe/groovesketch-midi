import { describe, expect, it } from "vitest";
import {
  legacyRoleRouting, logicalRoleForLegacyRole, routeForRole, validateRoleRouting,
  type RoleRouting,
} from "../src/logicalRoles";

describe("logical role routing", () => {
  it("keeps musical roles independent of hardware and preserves legacy defaults", () => {
    expect(legacyRoleRouting).toMatchObject({
      bass: { channel: 0 }, chords: { channel: 1 }, lead: { channel: 2 },
      pad: { channel: 3 }, drums: { channel: 9 }, "aux-percussion": { channel: 7 },
    });
    expect(Object.values(legacyRoleRouting).every((route) => route.outputId === null)).toBe(true);
  });

  it("allows auxiliary percussion and drums to use different outputs and channels", () => {
    const routing: RoleRouting = {
      drums: { outputId: "rc-500", channel: 9 },
      "aux-percussion": { outputId: "rd-9", channel: 7 },
    };

    expect(routeForRole(routing, "drums")).toEqual({ outputId: "rc-500", channel: 9 });
    expect(routeForRole(routing, "aux-percussion")).toEqual({ outputId: "rd-9", channel: 7 });
  });

  it("maps the legacy Drum 4 role without tying the model to a Circuit Tracks lane", () => {
    expect(logicalRoleForLegacyRole("kick")).toBe("drums");
    expect(logicalRoleForLegacyRole("snare")).toBe("drums");
    expect(logicalRoleForLegacyRole("hats")).toBe("drums");
    expect(logicalRoleForLegacyRole("percussion")).toBe("aux-percussion");
    expect(logicalRoleForLegacyRole("unknown-device")).toBeNull();
  });

  it("rejects routes outside the Standard MIDI channel range", () => {
    expect(() => validateRoleRouting({ bass: { outputId: "daw", channel: 16 } }))
      .toThrow(/bass route is invalid/);
  });
});

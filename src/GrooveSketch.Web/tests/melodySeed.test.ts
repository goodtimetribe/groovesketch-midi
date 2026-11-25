import { describe, expect, it } from "vitest";
import { melodicTrackIds } from "../src/hardwareTracks";
import { melodySeed } from "../src/melodySeed";

describe("track melody seeds", () => {
  it.each([-2147483648, -123, 0, 123, 2147483647])("keeps track seeds distinct and repeatable for %i", (seed) => {
    const seeds = melodicTrackIds.map((track) => melodySeed(seed, track));
    expect(new Set(seeds).size).toBe(4);
    expect(melodicTrackIds.map((track) => melodySeed(seed, track))).toEqual(seeds);
    expect(seeds.every((value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647)).toBe(true);
    expect(melodySeed(seed, "midi1")).toBe(seed);
  });

  it.each([-2147483649, 2147483648, 1.5, NaN])("rejects invalid seed %s instead of wrapping it", (seed) => {
    expect(() => melodySeed(seed, "midi2")).toThrow("signed 32-bit integer");
  });
});

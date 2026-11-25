import { expect, it } from "vitest";
import { randomInitialRequest, roots, scales } from "../src/domain";
import type { Progression } from "../src/types";

const progressions: Progression[] = ["one", "two", "three"].map((id) => ({
  id, name: id, description: "", chordSequence: ["i"], mood: "", suggestedUse: "",
}));

it("derives a varied starting configuration deterministically from the seed and catalogs", () => {
  const styles = ["Acid", "Dreamy", "Pop", "Rave"];
  const first = randomInitialRequest(-42, styles, progressions);
  expect(randomInitialRequest(-42, styles, progressions)).toEqual(first);
  expect(first.seed).toBe(-42);
  expect(roots).toContain(first.rootNote);
  expect(scales).toContain(first.scaleType);
  expect(styles).toContain(first.style);
  expect(progressions.map((item) => item.id)).toContain(first.progression);
  const requests = Array.from({ length: 64 }, (_, seed) => randomInitialRequest(seed, styles, progressions));
  for (const key of ["rootNote", "scaleType", "style", "progression", "bpm"] as const)
    expect(new Set(requests.map((request) => request[key])).size).toBeGreaterThan(1);
});

it.each([
  ["Acid", 130, 150], ["Techno", 125, 145], ["Trance", 135, 150],
  ["Dreamy", 75, 105], ["Synthwave", 90, 120], ["Pop", 100, 125], ["Rave", 140, 165],
  ["Other", 110, 130],
])("selects a seeded tempo in the %s range", (style, min, max) => {
  const tempos = Array.from({ length: 64 }, (_, seed) => randomInitialRequest(seed, [style], progressions).bpm);
  expect(Math.min(...tempos)).toBeGreaterThanOrEqual(min);
  expect(Math.max(...tempos)).toBeLessThanOrEqual(max);
  expect(new Set(tempos).size).toBeGreaterThan(1);
});

it("rejects empty starting catalogs", () => {
  expect(() => randomInitialRequest(1, [], progressions)).toThrow();
  expect(() => randomInitialRequest(1, ["Acid"], [])).toThrow();
});

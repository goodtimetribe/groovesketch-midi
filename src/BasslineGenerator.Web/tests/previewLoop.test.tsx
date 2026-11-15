// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { initialRequest } from "../src/domain";
import Preview from "../src/Preview";
import type { GenerationPackage } from "../src/types";

vi.mock("../src/PianoRoll", () => ({ default: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

it("toggles visible playback-only loop state without changing the package", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const pkg: GenerationPackage = {
    version: 1, seed: 1, statistics: null, notes: [],
    effectiveConfiguration: {
      ...initialRequest, seed: 1, requestedProgression: null,
      progressionId: "x", progressionName: "X", chordSequence: [],
      sections: [{ name: "Section", style: "Acid", bars: 1,
        behavior: { movement: 0, groove: 0, mutation: 0, tension: 0, repetition: 0 } }],
    },
  };
  const snapshot = structuredClone(pkg);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Loop")!;
  expect(button.getAttribute("aria-pressed")).toBe("false");
  await act(async () => button.click());
  expect(button.textContent).toBe("Loop Enabled");
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(pkg).toEqual(snapshot);
  await act(async () => button.click());
  expect(button.textContent).toBe("Loop");
  expect(button.getAttribute("aria-pressed")).toBe("false");
  await act(async () => root.unmount());
  container.remove();
});

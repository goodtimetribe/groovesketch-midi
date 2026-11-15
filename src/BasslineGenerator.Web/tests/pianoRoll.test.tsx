// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialRequest } from "../src/domain";
import PianoRoll from "../src/PianoRoll";
import { PlaybackTransport } from "../src/playback";
import { createTracks, readChordNotes, tracksForRendering, type TrackViewModel } from "../src/trackView";
import type { GenerationPackage, NoteData } from "../src/types";

const bass: NoteData = { note: "C2", midiNote: 36, startBeat: 0, durationBeats: 1, velocity: 127 };
const chord: NoteData = { note: "C4", midiNote: 60, startBeat: 0, durationBeats: 4, velocity: 90 };
const pkg: GenerationPackage = {
  version: 1, seed: 7, notes: [bass], statistics: null,
  effectiveConfiguration: {
    ...initialRequest, seed: 7, requestedProgression: null,
    progressionId: "x", progressionName: "X", chordSequence: ["i"],
    sections: [{ name: "Section", style: "Acid", bars: 16,
      behavior: { movement: 10, groove: 20, mutation: 30, tension: 40, repetition: 50 } }],
  },
};

function midi(chordEvents: number[] = [0, 0x91, 60, 90, 0x83, 0x60, 0x81, 60, 0]) {
  const chunk = (id: string, data: number[]) =>
    [...Array.from(id, (c) => c.charCodeAt(0)), 0, 0, 0, data.length, ...data];
  return new Uint8Array([
    ...chunk("MThd", [0, 1, 0, 3, 0, 120]),
    ...chunk("MTrk", [0, 0xff, 0x2f, 0]),
    ...chunk("MTrk", [0, 0xff, 0x2f, 0]),
    ...chunk("MTrk", [...chordEvents, 0, 0xff, 0x2f, 0]),
  ]).buffer;
}

describe("track view", () => {
  it("creates presentation tracks and handles arbitrary roles, visibility, and focus", () => {
    const tracks = createTracks(pkg, [chord], {});
    expect(tracks.map(({ id, role, visible }) => ({ id, role, visible }))).toEqual([
      { id: "bass", role: "bass", visible: true }, { id: "chords", role: "chords", visible: true },
    ]);
    const future: TrackViewModel = { id: "lead", name: "Lead", role: "lead", visible: true, notes: [bass] };
    expect(tracksForRendering([...tracks, future], "chords").map(({ track, ghost }) => [track.id, ghost]))
      .toEqual([["bass", true], ["lead", true], ["chords", false]]);
    expect(tracksForRendering(createTracks(pkg, [chord], { chords: false }), "bass").map(({ track, ghost }) => [track.id, ghost]))
      .toEqual([["bass", false]]);
    expect(pkg.notes).toEqual([bass]);
  });

  it("reads actual chord pitches, timing, velocity and running status from combined MIDI", () => {
    expect(readChordNotes(midi())).toEqual([chord]);
    expect(readChordNotes(midi([0, 0x91, 60, 90, 0, 64, 80, 120, 0x91, 60, 0, 0, 64, 0])))
      .toEqual([
        { ...chord, durationBeats: 1 },
        { note: "E4", midiNote: 64, startBeat: 0, durationBeats: 1, velocity: 80 },
      ]);
    expect(() => readChordNotes(midi([0, 0x91, 60, 90]))).toThrow();
    expect(() => readChordNotes(new Uint8Array([0, 1]).buffer)).toThrow();
  });
});

describe("piano roll", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fills: string[];
  let transport: PlaybackTransport;

  function button(text: string) {
    const found = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
    if (!found) throw new Error(`Missing button: ${text}`);
    return found;
  }
  function checkbox(name: string) {
    const label = [...container.querySelectorAll("label")].find((item) => item.textContent?.trim() === name);
    if (!label) throw new Error(`Missing checkbox: ${name}`);
    return label.querySelector("input")!;
  }
  async function changeSelect(label: string, value: string) {
    const select = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label))!.querySelector("select")!;
    await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    fills = [];
    const ctx = {
      fillStyle: "", strokeStyle: "", font: "", scale() {}, fillRect() { fills.push(this.fillStyle); },
      fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<PianoRoll pkg={pkg} transport={transport} playbackState="stopped" chordNotes={[chord]} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    transport.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders ghost tracks behind focus, switches focus, and hides tracks without changing the package or transport", async () => {
    const before = JSON.stringify(pkg);
    const load = vi.spyOn(transport, "load");
    expect(container.textContent).toContain("Visible notes (2)");
    expect(fills).toContain(`rgba(82, 222, 181, ${(0.35 + 90 / 127 * 0.65) * 0.35})`);
    expect(fills.at(-1)).toBe("rgba(82, 222, 181, 1)");
    fills.length = 0;
    await changeSelect("Focus", "chords");
    expect(fills).toContain("rgba(82, 222, 181, 0.35)");
    expect(fills.at(-1)).toBe(`rgba(82, 222, 181, ${0.35 + 90 / 127 * 0.65})`);
    await act(async () => checkbox("Bass").click());
    expect(container.textContent).toContain("Visible notes (1)");
    expect(container.textContent).not.toContain("C2 (36)");
    await act(async () => checkbox("Chords").click());
    expect(container.textContent).toContain("Visible notes (0)");
    await act(async () => checkbox("Bass").click());
    expect(container.textContent).toContain("C2 (36)");
    expect(JSON.stringify(pkg)).toBe(before);
    expect(load).not.toHaveBeenCalled();
  });

  it("preserves zoom, paging, note inspection, and selection", async () => {
    await act(async () => button("C2 (36)").click());
    expect(container.textContent).toContain("Selected: C2, beat 0, length 1, velocity 127.");
    await changeSelect("Bars shown", "4");
    expect(container.textContent).toContain("Bars 1–4 of 16");
    await act(async () => button("Next").click());
    expect(container.textContent).toContain("Bars 5–8 of 16");
    expect(container.textContent).toContain("Visible notes (0)");
    expect(container.textContent).toContain("Selected: C2");
    await act(async () => button("Previous").click());
    expect(container.textContent).toContain("Visible notes (2)");
  });

  it("shows drum notes as a focusable ghost track", async () => {
    const drum = { note: "D2", midiNote: 38, startBeat: 0.5, durationBeats: 0.25, velocity: 100 };
    await act(async () => root.render(<PianoRoll pkg={pkg} transport={transport} playbackState="stopped" chordNotes={[chord]} drumNotes={[drum]} />));
    expect(container.textContent).toContain("Visible notes (3)");
    expect(container.textContent).toContain("D2 (38)");
    await changeSelect("Focus", "drums");
    expect(fills.at(-1)).toBe(`rgba(82, 222, 181, ${0.35 + 100 / 127 * 0.65})`);
    await act(async () => checkbox("Drums").click());
    expect(container.textContent).not.toContain("D2 (38)");
  });

});

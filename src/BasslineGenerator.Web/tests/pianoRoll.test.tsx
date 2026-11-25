// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialRequest } from "../src/domain";
import PianoRoll from "../src/PianoRoll";
import { PlaybackTransport } from "../src/playback";
import { createTracks, readChordNotes, trackNoteColor, tracksForRendering, type MelodicContent, type TrackViewModel } from "../src/trackView";
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
    expect(tracks.map((track) => track.name)).toEqual(["Synth1 • Bass", "Synth2 • Chords"]);
    expect(tracks.map((track) => ({ id: track.id, role: track.kind === "track" ? track.role : null, visible: track.visible }))).toEqual([
      { id: "bass", role: "bass", visible: true }, { id: "chords", role: "chords", visible: true },
    ]);
    const future: TrackViewModel = { id: "lead", name: "Lead", kind: "track", hardwareTrackId: "midi1", role: "lead", visible: true, notes: [bass], indicator: "rgb(73, 158, 255)" };
    expect(trackNoteColor(future, bass)).toEqual([73, 158, 255]);
    expect(trackNoteColor({ ...future, role: "strings" }, bass)).toEqual([73, 158, 255]);
    expect(trackNoteColor({ ...future, hardwareTrackId: "synth1" }, bass)).toEqual([230, 72, 152]);
    expect(tracksForRendering([...tracks, future], "chords").map(({ track, ghost }) => [track.id, ghost]))
      .toEqual([["bass", true], ["lead", true], ["chords", false]]);
    expect(tracksForRendering(createTracks(pkg, [chord], { chords: false }), "bass").map(({ track, ghost }) => [track.id, ghost]))
      .toEqual([["bass", false]]);
    expect(pkg.notes).toEqual([bass]);
  });

  it("shows every hardware track's current state in its header", () => {
    const content: MelodicContent = {
      synth1: { role: "bass", notes: [bass] },
      synth2: { role: "chords", notes: [chord] },
      midi1: { role: "lead", notes: [bass] },
      midi2: { role: "pad", notes: [chord] },
    };
    expect(createTracks(pkg, [chord], {}, [], content).map((track) => track.name)).toEqual([
      "Synth1 • Bass", "Synth2 • Chords", "Midi1 • Lead", "Midi2 • Pad", "Drums • Pattern",
    ]);
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

  it("renders ghost tracks and toggles visibility and playback without changing the package", async () => {
    const before = JSON.stringify(pkg);
    const load = vi.spyOn(transport, "load");
    const enabled = vi.spyOn(transport, "setTrackEnabled");
    expect(container.textContent).toContain("Visible notes (2)");
    expect(fills).toContain(`rgba(94, 224, 181, ${(0.35 + 90 / 127 * 0.65) * 0.35})`);
    expect(fills.at(-1)).toBe("rgba(230, 72, 152, 1)");
    fills.length = 0;
    await changeSelect("Focus", "chords");
    expect(fills).toContain("rgba(230, 72, 152, 0.35)");
    expect(fills.at(-1)).toBe(`rgba(94, 224, 181, ${0.35 + 90 / 127 * 0.65})`);
    await act(async () => checkbox("Synth1 • Bass").click());
    expect(enabled).toHaveBeenLastCalledWith("synth1", false);
    expect(container.textContent).toContain("Visible notes (1)");
    expect(container.textContent).not.toContain("C2 (36)");
    await act(async () => checkbox("Synth2 • Chords").click());
    expect(enabled).toHaveBeenLastCalledWith("synth2", false);
    expect(container.textContent).toContain("Visible notes (0)");
    await act(async () => checkbox("Synth1 • Bass").click());
    expect(enabled).toHaveBeenLastCalledWith("synth1", true);
    expect(container.textContent).toContain("C2 (36)");
    expect(JSON.stringify(pkg)).toBe(before);
    expect(load).not.toHaveBeenCalled();
  });

  it("preserves zoom, paging, note inspection, and selection", async () => {
    const visibility = container.querySelector(".roll-visibility")!;
    expect(visibility.querySelector("summary")?.textContent).toBe("Tracks & actions");
    expect(visibility.querySelector("legend")?.textContent).toBe("Track controls");
    expect(visibility.querySelector(":scope > label")?.textContent).toContain("Bars shown");
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

  it("renders the piano roll before arrangement and track controls", () => {
    const roll = container.querySelector('section[aria-label="Note View"]')!;
    expect(roll.classList.contains("card")).toBe(true);
    const canvas = roll.querySelector(".roll-canvas")!;
    const sections = roll.querySelector('[aria-label="Arrangement sections"]')!;
    const focus = [...roll.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Focus"))!;
    const tracks = roll.querySelector(".roll-visibility")!;
    expect(canvas.compareDocumentPosition(sections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sections.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(canvas.compareDocumentPosition(tracks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(canvas.querySelector("canvas")).not.toBeNull();
  });

  it("starts advanced controls collapsed while keeping tracks and the piano roll available", async () => {
    const options = container.querySelector<HTMLDetailsElement>(".roll-options")!;
    const summary = options.querySelector("summary")!;
    const trackOptions = container.querySelector<HTMLDetailsElement>(".track-actions-options")!;
    expect(options.open).toBe(false);
    expect(trackOptions.open).toBe(false);
    await changeSelect("Focus", "chords");
    await act(async () => summary.click());
    expect(options.open).toBe(true);
    expect(options.querySelector('[aria-label="Arrangement sections"]')).not.toBeNull();
    expect(container.querySelector(".roll-visibility")?.closest("details")).toBeNull();
    expect(container.querySelector("canvas")?.closest("details")).toBeNull();
    await act(async () => summary.click());
    expect(options.open).toBe(false);
    expect([...options.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Focus"))?.querySelector("select")?.value).toBe("chords");
  });

  it("shows drum notes as a focusable track with Circuit Tracks lane colors", async () => {
    const enabled = vi.spyOn(transport, "setTrackEnabled");
    const drum = { note: "D2", midiNote: 38, startBeat: 0.5, durationBeats: 0.25, velocity: 100 };
    await act(async () => root.render(<PianoRoll pkg={pkg} transport={transport} playbackState="stopped" chordNotes={[chord]} drumNotes={[drum]} />));
    expect(container.textContent).toContain("Visible notes (3)");
    expect(container.textContent).toContain("D2 (38)");
    expect(fills).toContain(`rgba(255, 210, 66, ${(0.35 + 100 / 127 * 0.65) * 0.35})`);
    await changeSelect("Focus", "drums");
    expect(fills.at(-1)).toBe(`rgba(255, 210, 66, ${0.35 + 100 / 127 * 0.65})`);
    expect(trackNoteColor(createTracks(pkg, [chord], {}, [drum])[2], { ...drum, midiNote: 36 })).toEqual([255, 139, 61]);
    expect(trackNoteColor(createTracks(pkg, [chord], {}, [drum])[2], drum)).toEqual([255, 210, 66]);
    expect(trackNoteColor(createTracks(pkg, [chord], {}, [drum])[2], { ...drum, midiNote: 42 })).toEqual([180, 140, 255]);
    expect(trackNoteColor(createTracks(pkg, [chord], {}, [drum])[2], { ...drum, midiNote: 54 })).toEqual([69, 211, 224]);
    await act(async () => checkbox("Drums • Pattern").click());
    expect(enabled).toHaveBeenLastCalledWith("drums", false);
    expect(container.textContent).not.toContain("D2 (38)");
  });

  it("offers compact role shortcuts beside navigation and dispatches the selected actions", async () => {
    const generate = vi.fn();
    const workflow = {
      content: {
        synth1: { role: "bass" as const, notes: [bass] },
        synth2: { role: "chords" as const, notes: [chord] },
        midi1: { role: "pad" as const, notes: [] },
        midi2: { role: "lead" as const, notes: [] },
      },
      busy: false, disabled: false, patternSelected: true, generate,
    };
    const drum = { note: "D2", midiNote: 38, startBeat: 0, durationBeats: 0.25, velocity: 100 };
    const aux = { note: "A#2", midiNote: 46, startBeat: 0, durationBeats: 0.25, velocity: 100 };
    await act(async () => root.render(<PianoRoll pkg={pkg} transport={transport} playbackState="stopped"
      chordNotes={[chord]} drumNotes={[drum, aux]} workflow={workflow} />));

    const quickActions = container.querySelector(".roll-nav")!;
    expect(quickActions.querySelectorAll(".quick-role-actions")).toHaveLength(6);
    const focusLead = quickActions.querySelector<HTMLButtonElement>('[aria-label="Focus Lead track"]')!;
    expect(focusLead.getAttribute("aria-pressed")).toBe("false");
    await act(async () => focusLead.click());
    expect(focusLead.getAttribute("aria-pressed")).toBe("true");
    expect(focusLead.closest(".quick-role-actions")?.classList.contains("is-focused")).toBe(true);
    expect([...container.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Focus"))?.querySelector("select")?.value)
      .toBe("midi2");
    expect(quickActions.querySelector('[aria-label="Replace Bass"]')?.textContent).toBe("↻");
    expect(quickActions.querySelector('[aria-label="Create Bass Variation"]')?.textContent).toBe("✨");
    expect(quickActions.querySelector('[aria-label="Use Drums Pattern"]')?.textContent).toBe("♪");
    expect(quickActions.querySelector('[aria-label="Use Aux Percussion Pattern"]')).not.toBeNull();
    expect(quickActions.querySelector('[aria-label="Replace Lead"]')?.getAttribute("title")).toContain("new content");

    const replaceLead = quickActions.querySelector<HTMLButtonElement>('[aria-label="Replace Lead"]')!;
    await act(async () => replaceLead.click());
    expect(generate).not.toHaveBeenCalled();
    await act(async () => quickActions.querySelector<HTMLButtonElement>('[aria-label="Confirm Replace Lead"]')!.click());
    expect(generate).toHaveBeenLastCalledWith("midi2", "lead", "rebuild");
    await act(async () => quickActions.querySelector<HTMLButtonElement>('[aria-label="Create Bass Variation"]')!.click());
    expect(generate).toHaveBeenLastCalledWith("synth1", "bass", "vary");
    await act(async () => quickActions.querySelector<HTMLButtonElement>('[aria-label="Use Aux Percussion Pattern"]')!.click());
    expect(generate).toHaveBeenLastCalledWith("drums", "aux-percussion", "apply");

    await act(async () => root.render(<PianoRoll pkg={pkg} transport={transport} playbackState="stopped"
      chordNotes={[chord]} drumNotes={[drum]} workflow={{ ...workflow, patternSelected: false }} />));
    expect(container.querySelector('[aria-label="Use Aux Percussion Pattern"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Use Drums Pattern"]')?.disabled).toBe(true);
  });

});

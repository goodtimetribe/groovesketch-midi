// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";
import * as allTracksMidi from "../src/allTracksMidi";
import * as apiModule from "../src/api";
import { api } from "../src/api";
import { initialRequest } from "../src/domain";
import { PlaybackTransport } from "../src/playback";
import { generatePad } from "../src/padGenerator";
import type { GenerateRequest, GenerationPackage, NoteData } from "../src/types";

const bass: NoteData = { note: "A1", midiNote: 33, startBeat: 0, durationBeats: 1, velocity: 64 };
const melody: NoteData = { note: "E5", midiNote: 76, startBeat: 0, durationBeats: 1, velocity: 88 };

function packageFor(request: GenerateRequest): GenerationPackage {
  const seed = request.seed!;
  return {
    version: 1, seed, notes: [bass], statistics: null,
    effectiveConfiguration: {
      ...request, seed, requestedProgression: request.progression, progressionId: "x", progressionName: "X", chordSequence: ["i"],
      sections: [{ name: "Section", style: request.style, bars: request.bars,
        behavior: { movement: 10, groove: 20, mutation: 30, tension: 40, repetition: 50 } }],
    },
  };
}

function midi(bars: number, pitches = [60, 64, 67]) {
  const chunk = (id: string, data: number[]) =>
    [...Array.from(id, (c) => c.charCodeAt(0)), (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255, ...data];
  const events: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    for (const pitch of pitches) events.push(0, 0x91, pitch, 90);
    pitches.forEach((pitch, index) => events.push(...(index === 0 ? [0x83, 0x60] : [0]), 0x81, pitch, 0));
  }
  events.push(0, 0xff, 0x2f, 0);
  return new Uint8Array([
    ...chunk("MThd", [0, 1, 0, 3, 0, 120]),
    ...chunk("MTrk", [0, 0xff, 0x2f, 0]),
    ...chunk("MTrk", [0, 0xff, 0x2f, 0]),
    ...chunk("MTrk", events),
  ]).buffer;
}

let container: HTMLDivElement;
let root: Root;

function button(name: string) {
  if (name === "Apply Pattern") name = "Apply Drums";
  else if (name.startsWith("Regenerate ")) {
    const hardware = name.slice("Regenerate ".length);
    const role = container.querySelector<HTMLSelectElement>(`select[aria-label="${hardware} role"]`)?.value;
    name = role ? `${role === "bass" ? "Vary" : "Rebuild"} ${role === "lead" ? "Lead" : role === "pad" ? "Pad" : role === "chords" ? "Chords" : "Bass"} on ${hardware}`
      : `Choose a role for ${hardware}`;
  } else if (/^Generate (Bass|Chords|Melody|Pad)$/.test(name)) {
    const focus = selectElement("Focus").value;
    const hardware = focus === "synth1" ? "Synth1" : focus === "synth2" ? "Synth2" : focus === "midi1" ? "Midi1" : "Midi2";
    const role = container.querySelector<HTMLSelectElement>(`select[aria-label="${hardware} role"]`)?.value;
    name = `${role === "bass" ? "Vary" : "Rebuild"} ${role === "lead" ? "Lead" : role === "pad" ? "Pad" : role === "chords" ? "Chords" : "Bass"} on ${hardware}`;
  }
  if (name === "Apply Drums") name = "Apply Drums on Drums";
  const action = container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (action) return action;
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent === name);
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
}

function selectElement(label: string): HTMLSelectElement {
  if (label === "Generator") {
    const focus = selectElement("Focus").value;
    const name = focus === "synth1" ? "Synth1" : focus === "synth2" ? "Synth2" : focus === "midi1" ? "Midi1" : focus === "midi2" ? "Midi2" : "Drums";
    const role = container.querySelector<HTMLSelectElement>(`select[aria-label="${name} role"]`);
    if (role) return role;
  }
  const found = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label))?.querySelector("select");
  if (!found) throw new Error(`Missing select: ${label}`);
  return found;
}

async function select(label: string, value: string) {
  const input = selectElement(label);
  if (label === "Generator" && value === "melody") value = "lead";
  await act(async () => { input.value = value; input.dispatchEvent(new Event("change", { bubbles: true })); });
}

async function number(label: string, value: number) {
  const input = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label))!.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function visibleNotes() {
  return [...container.querySelectorAll(".note-list tbody tr")].map((row) => row.textContent).sort();
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    scale() {}, fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(api, "presets").mockResolvedValue(["Acid", "Pop"]);
  vi.spyOn(api, "progressions").mockResolvedValue([{ id: "x", name: "X", description: "", chordSequence: ["i"], mood: "", suggestedUse: "" }]);
  vi.spyOn(api, "generate").mockImplementation(async (request) => packageFor(request));
  vi.spyOn(api, "replay").mockImplementation(async (pkg) => ({ ...pkg, notes: [bass] }));
  vi.spyOn(api, "combinedMidi").mockImplementation(async (pkg) => ({
    arrayBuffer: async () => midi(pkg.effectiveConfiguration.sections.reduce((sum, section) => sum + section.bars, 0)),
  } as Blob));
  vi.spyOn(api, "melody").mockResolvedValue([melody]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.history.replaceState(null, "", window.location.pathname);
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("generates and plays a complete sketch immediately on first load", async () => {
  const load = vi.spyOn(PlaybackTransport.prototype, "load");
  const play = vi.spyOn(PlaybackTransport.prototype, "play").mockResolvedValue();
  const exportMidi = vi.spyOn(allTracksMidi, "createAllTracksMidi");
  vi.spyOn(apiModule, "download").mockImplementation(() => {});
  expect(selectElement("Drum pattern").value).toBe("four-on-the-floor");
  expect(button("Generate Sketch").disabled).toBe(false);
  const rootNote = selectElement("Root note").value;
  const scaleType = selectElement("Scale").value;
  const style = selectElement("Style").value;
  const progression = selectElement("Progression").value;
  const seed = Number([...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith("Seed"))!.querySelector("input")!.value);
  await act(async () => button("Generate Sketch").click());
  expect(vi.mocked(api.generate)).toHaveBeenCalledWith(expect.objectContaining({ rootNote, scaleType, style, progression, seed }));
  expect(vi.mocked(api.melody).mock.calls[0][0]).not.toHaveProperty("style");
  const latestLoad = load.mock.calls.at(-1)!;
  expect(latestLoad[2]!.length).toBeGreaterThan(0);
  expect(latestLoad[3]!.synth1).toEqual([bass]);
  expect(latestLoad[3]!.synth2.length).toBeGreaterThan(0);
  expect(latestLoad[3]!.midi1).toEqual([melody]);
  expect(latestLoad[3]!.midi2).toEqual(generatePad(latestLoad[3]!.synth2, initialRequest.bars, seed, "midi2"));
  expect(latestLoad[3]!.midi2.length).toBeGreaterThan(0);
  expect(button("Play").disabled).toBe(false);
  await act(async () => button("Play").click());
  expect(play).toHaveBeenCalledOnce();
  await act(async () => button("Download All Tracks MIDI (Circuit Tracks)").click());
  expect(exportMidi.mock.calls[0][0].midi2).toEqual({ role: "pad", notes: latestLoad[3]!.midi2 });
});

it("auditions the generated Midi2 pad through the browser synth", async () => {
  const oscillators: { frequency: { value: number }; start: ReturnType<typeof vi.fn> }[] = [];
  class AudioNodeMock {
    gain = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} };
    frequency = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} };
    Q = { value: 0 };
    type = "";
    start = vi.fn();
    stop = vi.fn();
    connect() { return this; }
    disconnect() {}
  }
  vi.stubGlobal("AudioContext", class {
    currentTime = 0;
    destination = new AudioNodeMock();
    createGain() { return new AudioNodeMock(); }
    createBiquadFilter() { return new AudioNodeMock(); }
    createOscillator() { const oscillator = new AudioNodeMock(); oscillators.push(oscillator); return oscillator; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  });
  const load = vi.spyOn(PlaybackTransport.prototype, "load");
  await act(async () => button("Generate Sketch").click());
  const pad = load.mock.calls.at(-1)![3]!.midi2;
  await act(async () => button("Play").click());
  for (const note of pad.filter((item) => item.startBeat === 0)) {
    expect(oscillators.some((oscillator) => oscillator.start.mock.calls.length > 0 &&
      oscillator.frequency.value === 440 * 2 ** ((note.midiNote - 69) / 12))).toBe(true);
  }
});

it("requires a pattern if the default is cleared", async () => {
  await select("Drum pattern", "");
  expect(button("Generate Sketch").disabled).toBe(true);
  await select("Drum pattern", "half-time");
  expect(button("Generate Sketch").disabled).toBe(false);
});

it("shows and clears sketch settings changes beside Generate Sketch without regenerating", async () => {
  const status = container.querySelector<HTMLElement>(".sketch-settings-status")!;
  const creative = container.querySelector('[aria-label="Creative actions"]')!;
  expect(creative.contains(status)).toBe(true);
  expect(status.textContent).toBe("");
  await number("Seed", 123);
  await number("Bars", 1);
  await act(async () => button("Generate Sketch").click());
  const notes = visibleNotes();
  const calls = vi.mocked(api.generate).mock.calls.length;
  const checkSelect = async (label: string, value: string) => {
    const initial = selectElement(label).value;
    await select(label, value);
    expect(status.textContent).toContain("Settings Changed");
    await select(label, initial);
    expect(status.textContent).toBe("");
  };
  await checkSelect("Root note", selectElement("Root note").value === "C" ? "D" : "C");
  await checkSelect("Scale", selectElement("Scale").value === "Major" ? "Minor" : "Major");
  await checkSelect("Style", selectElement("Style").value === "Acid" ? "Pop" : "Acid");
  await checkSelect("Mode", "custom");
  await checkSelect("Drum pattern", "half-time");
  const tempo = Number([...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith("Tempo"))!.querySelector("input")!.value);
  await number("Tempo", tempo === 140 ? 141 : 140);
  expect(status.textContent).toContain("Settings Changed");
  await number("Bars", 2);
  await number("Tempo", tempo);
  expect(status.textContent).toContain("Settings Changed");
  await number("Bars", 1);
  expect(status.textContent).toBe("");
  await number("Seed", 124);
  expect(status.textContent).toContain("Settings Changed");
  await number("Seed", 123);
  expect(status.textContent).toBe("");
  vi.spyOn(crypto, "getRandomValues").mockImplementationOnce((array) => {
    if (!(array instanceof Int32Array)) throw new Error("Expected an Int32Array.");
    array[0] = 456;
    return array;
  });
  await act(async () => button("New seed").click());
  expect(status.textContent).toContain("Settings Changed");
  await number("Seed", 123);
  expect(status.textContent).toBe("");
  expect(visibleNotes()).toEqual(notes);
  expect(vi.mocked(api.generate)).toHaveBeenCalledTimes(calls);
  expect(api.replay).not.toHaveBeenCalled();
});

it("detects and clears custom section edits against the generated arrangement", async () => {
  vi.mocked(api.generate).mockImplementationOnce(async (request) => {
    const pkg = packageFor(request);
    return { ...pkg, effectiveConfiguration: { ...pkg.effectiveConfiguration, mode: "custom",
      sections: request.sections!.map((section) => ({ ...section,
        behavior: { movement: 10, groove: 20, mutation: 30, tension: 40, repetition: 50 } })) } };
  });
  await number("Seed", 123);
  await number("Bars", 1);
  await select("Mode", "custom");
  await act(async () => button("Generate Sketch").click());
  const status = container.querySelector<HTMLElement>(".sketch-settings-status")!;
  expect(status.textContent).toBe("");
  const name = container.querySelector<HTMLInputElement>(".section-editor input")!;
  const original = name.value;
  const setName = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, value);
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  await setName("New section");
  expect(status.textContent).toContain("Settings Changed");
  await setName(original);
  expect(status.textContent).toBe("");
  await act(async () => button("Add section").click());
  expect(status.textContent).toContain("Settings Changed");
  const remove = [...container.querySelectorAll<HTMLButtonElement>(".section-editor button")]
    .filter((element) => element.textContent === "Remove").at(-1)!;
  await act(async () => remove.click());
  expect(status.textContent).toBe("");
});

it("tracks character and section behavior edits and clears them when reverted", async () => {
  await number("Seed", 123);
  await number("Bars", 1);
  await act(async () => button("Generate Sketch").click());
  const status = container.querySelector<HTMLElement>(".sketch-settings-status")!;
  const setRange = async (input: HTMLInputElement, value: number) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const sectionMovement = container.querySelector<HTMLInputElement>(".dimension input")!;
  const original = Number(sectionMovement.value);
  await setRange(sectionMovement, original === 66 ? 67 : 66);
  expect(status.textContent).toContain("Settings Changed");
  await setRange(sectionMovement, original);
  expect(status.textContent).toBe("");
  const movement = container.querySelector<HTMLInputElement>('#character-movement')!;
  await setRange(movement, 65);
  expect(status.textContent).toContain("Settings Changed");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Use style default for movement"]')!.click());
  expect(status.textContent).toBe("");
});

it("keeps the indicator until sketch generation succeeds, independently of track generation", async () => {
  await number("Seed", 123);
  await number("Bars", 1);
  await act(async () => button("Generate Sketch").click());
  const status = container.querySelector<HTMLElement>(".sketch-settings-status")!;
  const root = selectElement("Root note").value;
  await select("Root note", root === "C" ? "D" : "C");
  await act(async () => button("Regenerate Midi1").click());
  expect(status.textContent).toContain("Settings Changed");
  expect(vi.mocked(api.melody).mock.calls.at(-1)![0].rootNote).toBe(root);
  vi.mocked(api.melody).mockRejectedValueOnce(new Error("Melody generation failed."));
  await act(async () => button("Generate Sketch").click());
  expect(status.textContent).toContain("Settings Changed");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Melody generation failed.");
  await act(async () => button("Generate Sketch").click());
  expect(status.textContent).toBe("");
});

it("does not overwrite a shared package when catalogs finish loading later", async () => {
  await act(async () => root.unmount());
  window.history.replaceState(null, "", "#share=example");
  let resolveProgressions!: (value: Awaited<ReturnType<typeof api.progressions>>) => void;
  vi.mocked(api.progressions).mockImplementationOnce(() => new Promise((resolve) => { resolveProgressions = resolve; }));
  vi.spyOn(api, "decode").mockResolvedValue(packageFor({ ...initialRequest, rootNote: "F", seed: 22 }));
  root = createRoot(container);
  await act(async () => root.render(<App />));
  expect(container.textContent).toContain("Shared bassline loaded.");
  expect(container.querySelector(".result-summary")?.textContent).toContain("F Minor");
  await act(async () => resolveProgressions([{ id: "x", name: "X", description: "", chordSequence: ["i"], mood: "", suggestedUse: "" }]));
  expect(selectElement("Root note").value).toBe("F");
  expect([...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith("Seed"))!.querySelector("input")!.value).toBe("22");
});

it("uses the selected pattern and generates every track using the same settings and seed", async () => {
  expect(button("Generate Sketch").disabled).toBe(false);
  const arrangement = container.querySelector("#arrangement-heading")!.closest("section")!;
  const drums = container.querySelector("#drums-heading")!.closest("section")!;
  expect(arrangement.nextElementSibling).toBe(drums);
  expect(drums.querySelector("details")).toBeNull();
  expect(drums.contains(selectElement("Drum pattern"))).toBe(true);
  await number("Seed", 123);
  await number("Bars", 1);
  await number("Tempo", 145);
  await select("Drum pattern", "four-on-the-floor");
  await act(async () => button("Generate Sketch").click());
  expect(vi.mocked(api.generate)).toHaveBeenCalledWith(expect.objectContaining({ seed: 123, bars: 1, bpm: 145, progression: "x" }));
  expect(vi.mocked(api.melody)).toHaveBeenCalledWith(expect.objectContaining({ seed: 123, progressionId: "x", sections: [{ bars: 1 }] }));
  expect(container.textContent).toContain("Generated sketch:");
  expect(container.textContent).toContain("Seed 123");
  expect(container.textContent).toContain("Synth1 • Bass");
  expect(container.textContent).toContain("Synth2 • Chords");
  expect(container.textContent).toContain("Midi1 • Lead");
  expect(container.textContent).toContain("Midi2 • Pad");
  expect(container.querySelector<HTMLSelectElement>('select[aria-label="Synth1 role"]')?.value).toBe("bass");
  expect(container.querySelector<HTMLSelectElement>('select[aria-label="Synth2 role"]')?.value).toBe("chords");
  expect(container.querySelector<HTMLSelectElement>('select[aria-label="Midi1 role"]')?.value).toBe("lead");
  expect(container.querySelector<HTMLSelectElement>('select[aria-label="Midi2 role"]')?.value).toBe("pad");
  expect(container.querySelector<HTMLSelectElement>('select[aria-label="Drums role"]')?.value).toBe("drums");
  expect(container.textContent).toContain("Applied pattern: Four on the floor");
  expect(drums.contains(button("Clear Drums"))).toBe(true);
  expect(container.querySelector("nav")!.contains(button("Download Circuit Tracks Drum MIDI"))).toBe(true);
  expect(drums.contains(button("Download Circuit Tracks Drum MIDI"))).toBe(false);
  expect(container.querySelector('[aria-label="Note View"]')!.contains(selectElement("Drum pattern"))).toBe(false);
  expect(container.textContent).toContain("Visible notes (18)");
  expect(selectElement("Drum pattern").value).toBe("four-on-the-floor");
  expect(container.textContent).toContain("Use All Tracks MIDI to export the current sketch");
  await select("Focus", "midi1");
  await act(async () => button("Generate Melody").click());
  expect(vi.mocked(api.melody).mock.calls.map(([request]) => request.seed)).toEqual([123, 123]);
});

it("downloads the applied drum pattern from the header and disables it after clearing", async () => {
  expect(button("Download Circuit Tracks Drum MIDI").disabled).toBe(true);
  await number("Seed", 123);
  await number("Bars", 1);
  await select("Drum pattern", "four-on-the-floor");
  await act(async () => button("Generate Sketch").click());
  const toggle = container.querySelector<HTMLButtonElement>('[aria-label="More MIDI downloads"]')!;
  const download = vi.spyOn(apiModule, "download").mockImplementation(() => {});
  await act(async () => toggle.click());
  expect(button("Download Circuit Tracks Drum MIDI").disabled).toBe(false);
  await act(async () => button("Download Circuit Tracks Drum MIDI").click());
  expect(download).toHaveBeenCalledWith(expect.any(Blob), "circuit-tracks-drums.mid");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await act(async () => button("Clear Drums").click());
  expect(button("Download Circuit Tracks Drum MIDI").disabled).toBe(true);
});

it("exports current hardware-track content and the applied drums from the download menu", async () => {
  const action = "Download All Tracks MIDI (Circuit Tracks)";
  expect(button(action).disabled).toBe(true);
  await number("Seed", 123);
  await number("Bars", 1);
  await act(async () => button("Generate Sketch").click());
  await select("Focus", "midi2");
  await select("Generator", "chords");
  await act(async () => button("Generate Chords").click());
  await select("Focus", "synth1");
  await select("Generator", "melody");
  await act(async () => button("Generate Melody").click());
  await select("Drum pattern", "half-time");
  const synth1Visibility = [...container.querySelectorAll(".roll-visibility label")]
    .find((label) => label.textContent?.includes("Synth1"))!.querySelector("input")!;
  await act(async () => synth1Visibility.click());
  const create = vi.spyOn(allTracksMidi, "createAllTracksMidi");
  const download = vi.spyOn(apiModule, "download").mockImplementation(() => {});
  const toggle = container.querySelector<HTMLButtonElement>('[aria-label="More MIDI downloads"]')!;
  await act(async () => toggle.click());
  expect(button(action).disabled).toBe(false);
  await act(async () => button(action).click());
  const [tracks, drums, bpm, bars] = create.mock.calls[0];
  expect(tracks.synth1).toEqual({ role: "lead", notes: [melody] });
  expect(tracks.synth2.role).toBe("chords");
  expect(tracks.midi1).toEqual({ role: "lead", notes: [melody] });
  expect(tracks.midi2.role).toBe("chords");
  expect(drums).toHaveLength(10);
  expect(bpm).toBeGreaterThan(0);
  expect(bars).toBe(1);
  expect(download).toHaveBeenCalledWith(expect.any(Blob), "circuit-tracks-sketch.mid");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
});

it("reports an all-tracks export failure without downloading", async () => {
  await number("Seed", 123);
  await act(async () => button("Generate Sketch").click());
  vi.spyOn(allTracksMidi, "createAllTracksMidi").mockImplementation(() => { throw new Error("Invalid track notes."); });
  const download = vi.spyOn(apiModule, "download").mockImplementation(() => {});
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="More MIDI downloads"]')!.click());
  await act(async () => button("Download All Tracks MIDI (Circuit Tracks)").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Invalid track notes.");
  expect(download).not.toHaveBeenCalled();
});

it("replaces edited tracks and reproduces the sketch from its seed", async () => {
  await number("Seed", 123);
  await number("Bars", 1);
  await select("Drum pattern", "four-on-the-floor");
  await act(async () => button("Generate Sketch").click());
  const originalNotes = visibleNotes();
  await select("Focus", "synth1");
  await select("Generator", "melody");
  await act(async () => button("Generate Melody").click());
  expect(container.textContent).toContain("Synth1 • Lead");
  await select("Focus", "midi2");
  await select("Generator", "chords");
  await act(async () => button("Generate Chords").click());
  expect(container.textContent).toContain("Midi2 • Chords");
  await select("Drum pattern", "half-time");
  await select("Focus", "drums");
  await act(async () => button("Apply Pattern").click());
  expect(container.textContent).toContain("Applied pattern: Half time");
  await select("Focus", "synth2");
  await select("Generator", "pad");
  await select("Drum pattern", "four-on-the-floor");
  await act(async () => button("Generate Sketch").click());
  expect(container.textContent).toContain("Synth1 • Bass");
  expect(container.textContent).toContain("Applied pattern: Four on the floor");
  expect(container.textContent).not.toContain("Midi2 • Chords");
  expect(container.textContent).toContain("Midi2 • Pad");
  expect(container.querySelector<HTMLSelectElement>('select[aria-label="Synth2 role"]')?.value).toBe("chords");
  expect(visibleNotes()).toEqual(originalNotes);
  expect(vi.mocked(api.replay)).toHaveBeenCalledWith(expect.objectContaining({ seed: 123 }));
  expect(vi.mocked(api.melody).mock.calls.map(([request]) => request.seed)).toEqual([123, 122, 123]);
});

it("chooses one seed when blank and reuses it for regeneration", async () => {
  const seedInput = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith("Seed"))!.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(seedInput, "");
    seedInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await number("Bars", 1);
  await select("Drum pattern", "four-on-the-floor");
  await act(async () => button("Generate Sketch").click());
  const seed = vi.mocked(api.generate).mock.calls[0][0].seed;
  expect(typeof seed).toBe("number");
  expect(vi.mocked(api.melody).mock.calls[0][0].seed).toBe(seed);
  expect([...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith("Seed"))?.querySelector("input")?.value).toBe(String(seed));
  await act(async () => button("Generate Sketch").click());
  expect(vi.mocked(api.replay).mock.calls[0][0].seed).toBe(seed);
  expect(vi.mocked(api.melody).mock.calls[1][0].seed).toBe(seed);
});

it("rejects incomplete generated bass instead of creating a partial sketch", async () => {
  await number("Seed", 123);
  await select("Drum pattern", "four-on-the-floor");
  vi.mocked(api.generate).mockResolvedValueOnce({ ...packageFor({ ...initialRequest, seed: 123 }), notes: [] });
  await act(async () => button("Generate Sketch").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("bass notes were missing");
  expect(container.querySelector('[aria-label="Note View"]')).toBeNull();
  expect(vi.mocked(api.melody)).not.toHaveBeenCalled();
});

it("waits for focused generation before allowing a sketch replacement", async () => {
  await number("Seed", 123);
  await select("Drum pattern", "four-on-the-floor");
  await act(async () => button("Generate Sketch").click());
  let resolve!: (notes: NoteData[]) => void;
  vi.mocked(api.melody).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await select("Focus", "midi2");
  await select("Generator", "melody");
  await act(async () => button("Generate Melody").click());
  expect(button("Generate Sketch").disabled).toBe(true);
  expect(button("Download All Tracks MIDI (Circuit Tracks)").disabled).toBe(true);
  await act(async () => resolve([melody]));
  expect(button("Generate Sketch").disabled).toBe(false);
  expect(button("Download All Tracks MIDI (Circuit Tracks)").disabled).toBe(false);
  expect(container.textContent).toContain("Midi2 • Lead");
});

it("keeps creative controls available with Settings and piano-roll options collapsed", async () => {
  await number("Seed", 123);
  await select("Drum pattern", "four-on-the-floor");
  await act(async () => button("Generate Sketch").click());
  const settings = container.querySelector<HTMLDetailsElement>(".settings-panel")!;
  const roll = container.querySelector<HTMLDetailsElement>(".roll-options")!;
  await select("Focus", "midi2");
  await act(async () => settings.querySelector("summary")!.click());
  await act(async () => roll.querySelector("summary")!.click());
  const creative = container.querySelector('[aria-label="Creative actions"]')!;
  expect(settings.open).toBe(false);
  expect(roll.open).toBe(false);
  expect(creative.contains(selectElement("Generator"))).toBe(false);
  expect(selectElement("Generator").closest(".roll-visibility")).not.toBeNull();
  await select("Generator", "melody");
  await act(async () => button("Generate Melody").click());
  expect(container.textContent).toContain("Midi2 • Lead");
});

it("opens collapsed settings when sketch generation finds invalid inputs", async () => {
  await select("Drum pattern", "four-on-the-floor");
  await number("Tempo", 10);
  const settings = container.querySelector<HTMLDetailsElement>(".settings-panel")!;
  await act(async () => settings.querySelector("summary")!.click());
  await act(async () => button("Generate Sketch").click());
  expect(settings.open).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Check the generation settings");
  expect(vi.mocked(api.generate)).not.toHaveBeenCalled();
});

it("submits bassline generation from the toolbar when Settings is collapsed", async () => {
  await number("Seed", 123);
  const settings = container.querySelector<HTMLDetailsElement>(".settings-panel")!;
  await act(async () => settings.querySelector("summary")!.click());
  await act(async () => button("Generate Bass Package").click());
  expect(vi.mocked(api.generate)).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Generated bassline:");
});

it("keeps the previous sketch intact while generating and when a track fails", async () => {
  await number("Seed", 123);
  await number("Bars", 1);
  await select("Drum pattern", "four-on-the-floor");
  await act(async () => button("Generate Sketch").click());
  const before = container.querySelector(".note-list")!.textContent;
  const stop = vi.spyOn(PlaybackTransport.prototype, "stop");
  let reject!: (error: Error) => void;
  vi.mocked(api.melody).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await select("Drum pattern", "half-time");
  await act(async () => button("Generate Sketch").click());
  expect(button("Generate Sketch").disabled).toBe(true);
  expect(button("Clear Drums").disabled).toBe(true);
  expect(selectElement("Drum pattern").disabled).toBe(true);
  expect(container.querySelector(".note-list")!.textContent).toBe(before);
  expect(container.textContent).toContain("Applied pattern: Four on the floor");
  await act(async () => reject(new Error("Melody generation failed.")));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Melody generation failed.");
  expect(container.querySelector(".note-list")!.textContent).toBe(before);
  expect(container.textContent).toContain("Applied pattern: Four on the floor");
  expect(button("Generate Sketch").disabled).toBe(false);
  expect(stop).not.toHaveBeenCalled();
});

it("keeps the previous sketch intact when pad generation fails", async () => {
  await number("Seed", 123);
  await number("Bars", 1);
  await act(async () => button("Generate Sketch").click());
  const before = visibleNotes();
  vi.mocked(api.combinedMidi).mockResolvedValueOnce({ arrayBuffer: async () => midi(1, [60, 64]) } as Blob);
  await act(async () => button("Generate Sketch").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Pad generation requires a triad in every bar.");
  expect(container.textContent).toContain("Midi2 • Pad");
  expect(visibleNotes()).toEqual(before);
});

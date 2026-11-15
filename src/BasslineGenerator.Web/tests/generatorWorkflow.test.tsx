// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../src/api";
import * as apiModule from "../src/api";
import * as allTracksMidi from "../src/allTracksMidi";
import { initialRequest } from "../src/domain";
import Preview from "../src/Preview";
import type { GenerationPackage, NoteData } from "../src/types";

const bass: NoteData = { note: "A1", midiNote: 33, startBeat: 0, durationBeats: 1, velocity: 64 };
const generatedBass: NoteData = { note: "C3", midiNote: 48, startBeat: 0, durationBeats: 1, velocity: 80 };
const generatedMelody: NoteData = { note: "E5", midiNote: 76, startBeat: 0, durationBeats: 1, velocity: 88 };
const pkg: GenerationPackage = {
  version: 1, seed: 1, statistics: null, notes: [bass],
  effectiveConfiguration: {
    ...initialRequest, seed: 1, requestedProgression: null,
    progressionId: "synthwave", progressionName: "Synthwave", chordSequence: ["i"],
    sections: [{ name: "Section", style: "Acid", bars: 1,
      behavior: { movement: 0, groove: 0, mutation: 0, tension: 0, repetition: 0 } }],
  },
};

function midi() {
  const chunk = (id: string, data: number[]) =>
    [...Array.from(id, (c) => c.charCodeAt(0)), 0, 0, 0, data.length, ...data];
  return new Uint8Array([
    ...chunk("MThd", [0, 1, 0, 3, 0, 120]),
    ...chunk("MTrk", [0, 0xff, 0x2f, 0]),
    ...chunk("MTrk", [0, 0xff, 0x2f, 0]),
    ...chunk("MTrk", [0, 0x91, 60, 90, 120, 0x81, 60, 0, 0, 0xff, 0x2f, 0]),
  ]).buffer;
}

let container: HTMLDivElement;
let root: Root;
let output: { id: string; name: string; state: string; send: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> };

function button(name: string) {
  const result = [...container.querySelectorAll("button")].find((item) => item.textContent === name);
  if (!result) throw new Error(`Missing button: ${name}`);
  return result;
}

function selectElement(label: string) {
  const result = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label))?.querySelector("select");
  if (!result) throw new Error(`Missing select: ${label}`);
  return result;
}

async function select(label: string, value: string) {
  const control = selectElement(label);
  await act(async () => { control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("AudioContext", class {
    currentTime = 0;
    destination = {};
    createGain() { return { gain: { value: 0, setValueAtTime() {} }, connect() {} }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    scale() {}, fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  } as unknown as CanvasRenderingContext2D);
  output = { id: "circuit", name: "Circuit Tracks", state: "connected", send: vi.fn(), clear: vi.fn() };
  Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: vi.fn(async () => ({
    outputs: new Map([[output.id, output]]), addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) });
  vi.spyOn(api, "combinedMidi").mockResolvedValue({ arrayBuffer: async () => midi() } as Blob);
  vi.spyOn(api, "replay").mockImplementation(async (request) => ({ ...request, notes: [generatedBass] }));
  vi.spyOn(api, "melody").mockResolvedValue([generatedMelody]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  sessionStorage.clear();
  Reflect.deleteProperty(navigator, "requestMIDIAccess");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("generates into the focused destination, preserving other tracks and routing playback by track", async () => {
  const original = JSON.stringify(pkg);
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  const melody = [...selectElement("Generator").options].find((option) => option.text === "Melody");
  expect(melody?.disabled).toBe(false);
  await select("Generator", "melody");
  expect(selectElement("Generator").value).toBe("melody");

  await select("Focus", "midi1");
  await select("Generator", "chords");
  expect(selectElement("Generator").querySelector<HTMLOptionElement>('option[value="drums"]')?.disabled).toBe(true);
  await act(async () => button("Generate Chords").click());
  expect(container.textContent).toContain("Midi1 · Chords");
  expect(container.textContent).toContain("Synth1 · Bass");
  expect(container.textContent).toContain("Synth2 · Chords");
  expect(container.textContent).toContain("Visible notes (3)");

  await select("Focus", "synth2");
  await select("Generator", "bass");
  await act(async () => button("Generate Bass").click());
  expect(container.textContent).toContain("Synth2 · Bass");
  expect(container.textContent).toContain("Midi1 · Chords");
  expect(container.textContent).toContain("A1 (33)");
  expect(container.textContent).toContain("C3 (48)");
  expect(container.textContent).toContain("C4 (60)");
  expect(vi.mocked(api.replay).mock.calls[0][0].effectiveConfiguration.requestedProgression).toBe("synthwave");
  expect(JSON.stringify(pkg)).toBe(original);

  await act(async () => button("Refresh Devices").click());
  await select("Bass Output", "circuit");
  await select("Chords Output", "circuit");
  await select("Midi1 Output", "circuit");
  await act(async () => button("Play").click());
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x90, 33, 64]);
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x91, 48, 80]);
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x92, 60, 90]);
});

it("auditions track checkboxes during playback without removing tracks from export", async () => {
  const exportMidi = vi.spyOn(allTracksMidi, "createAllTracksMidi");
  vi.spyOn(apiModule, "download").mockImplementation(() => {});
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await select("Focus", "midi1");
  await select("Generator", "melody");
  await act(async () => button("Generate Melody").click());
  await select("Focus", "drums");
  await select("Drum pattern", "four-on-the-floor");
  await act(async () => button("Apply Pattern").click());
  await act(async () => button("Refresh Devices").click());
  for (const track of ["Bass", "Chords", "Midi1", "Drums"]) await select(`${track} Output`, "circuit");
  await act(async () => button("Play").click());
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x92, 76, 88]);
  expect(output.send.mock.calls.some((call) => call[0][0] === 0x99)).toBe(true);

  const checkbox = (name: string) => [...container.querySelectorAll("label")]
    .find((label) => label.textContent?.trim() === name)!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  output.send.mockClear();
  await act(async () => checkbox("Midi1 · Lead").click());
  expect(container.textContent).not.toContain("E5 (76)");
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x82, 76, 0]);
  expect(output.send.mock.calls.some((call) => call[0][0] === 0x92)).toBe(false);
  expect(output.send.mock.calls.some((call) => call[0][0] === 0x99)).toBe(true);
  output.send.mockClear();
  await act(async () => checkbox("Drums").click());
  expect(output.send.mock.calls.some((call) => call[0][0] === 0x89)).toBe(true);
  expect(output.send.mock.calls.some((call) => call[0][0] === 0x99)).toBe(false);
  expect(output.send.mock.calls.some((call) => call[0][0] === 0x90)).toBe(true);
  expect(output.send.mock.calls.some((call) => call[0][0] === 0x91)).toBe(true);

  await act(async () => button("Download All Tracks MIDI (Circuit Tracks)").click());
  expect(exportMidi).toHaveBeenCalledOnce();
  expect(exportMidi.mock.calls[0][0].midi1.notes).toEqual([generatedMelody]);
  expect(exportMidi.mock.calls[0][1].length).toBeGreaterThan(0);
});

it("keeps the relocated generator synchronized with piano-roll focus", async () => {
  const generatorPane = document.createElement("div");
  document.body.appendChild(generatorPane);
  try {
    await act(async () => root.render(<Preview pkg={pkg} disabled={false} generatorPane={generatorPane} />));
    const generator = generatorPane.querySelector("select")!;
    expect(container.querySelector('label select') === generator).toBe(false);
    await select("Focus", "midi1");
    await act(async () => {
      generator.value = "melody";
      generator.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const generate = [...generatorPane.querySelectorAll("button")].find((item) => item.textContent === "Generate Melody")!;
    await act(async () => generate.click());
    expect(container.textContent).toContain("Midi1 · Lead");
    await select("Focus", "drums");
    expect(generator.value).toBe("drums");
    expect(generatorPane.querySelector("button")?.textContent).toBe("Apply Pattern");
  } finally {
    generatorPane.remove();
  }
});

it("routes Midi1 and Midi2 independently, rejects collisions, and keeps profile format compatible", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await select("Focus", "midi1");
  await select("Generator", "chords");
  await act(async () => button("Generate Chords").click());
  await select("Focus", "midi2");
  await act(async () => button("Generate Bass").click());

  await act(async () => button("Refresh Devices").click());
  await select("Bass Output", "circuit");
  await select("Chords Output", "circuit");
  await select("Midi1 Output", "circuit");
  await select("Midi2 Output", "circuit");
  await select("Midi2 MIDI Channel", "2");
  expect(button("Play").disabled).toBe(true);
  expect(container.textContent).toContain("Tracks must use different channels");
  await select("Midi2 MIDI Channel", "3");
  expect(button("Play").disabled).toBe(false);

  await act(async () => button("Update Profile").click());
  const saved = JSON.parse(localStorage.getItem("bassline-routing-profiles")!);
  expect(saved.version).toBe(3);
  expect(saved.profiles[0]).not.toHaveProperty("midi1Routing");
  expect(saved.profiles[0]).not.toHaveProperty("midi2Routing");

  await act(async () => button("Play").click());
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x92, 60, 90]);
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x93, 48, 80]);
  await act(async () => button("Pause").click());
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x82, 60, 0]);
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x83, 48, 0]);
});

it("applies the selected pattern only on action and preserves melodic tracks", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await select("Focus", "drums");
  expect(selectElement("Generator").value).toBe("drums");
  expect(selectElement("Generator").querySelector<HTMLOptionElement>('option[value="bass"]')?.disabled).toBe(true);
  expect(selectElement("Generator").querySelector<HTMLOptionElement>('option[value="melody"]')?.disabled).toBe(true);
  expect(button("Apply Pattern").disabled).toBe(true);
  await select("Drum pattern", "four-on-the-floor");
  expect(container.textContent).toContain("Visible notes (2)");
  await act(async () => button("Apply Pattern").click());
  expect(container.textContent).toContain("Visible notes (12)");
  expect(container.textContent).toContain("A1 (33)");
  expect(container.textContent).toContain("C4 (60)");
  await select("Drum pattern", "half-time");
  expect(container.textContent).toContain("Visible notes (12)");
  await act(async () => button("Apply Pattern").click());
  expect(container.textContent).toContain("Visible notes (4)");
  await select("Drum pattern", "");
  expect(container.textContent).toContain("Visible notes (4)");
  await act(async () => button("Clear Drums").click());
  expect(container.textContent).toContain("Visible notes (2)");
});

it("keeps the original target when focus changes while generation is running", async () => {
  let resolve!: (value: GenerationPackage) => void;
  vi.mocked(api.replay).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await select("Focus", "midi1");
  await act(async () => button("Generate Bass").click());
  await select("Focus", "midi2");
  await act(async () => resolve({ ...pkg, notes: [generatedBass] }));
  expect(container.textContent).toContain("Midi1 · Bass");
  expect(container.textContent).not.toContain("Midi2 · Bass");
  expect(container.textContent).toContain("A1 (33)");
  expect(container.textContent).toContain("C3 (48)");
});

it("keeps the original melody target when focus changes during generation", async () => {
  let resolve!: (value: NoteData[]) => void;
  vi.mocked(api.melody).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await select("Focus", "midi1");
  await select("Generator", "melody");
  await act(async () => button("Generate Melody").click());
  await select("Focus", "midi2");
  await act(async () => resolve([generatedMelody]));
  expect(container.textContent).toContain("Midi1 · Lead");
  expect(container.textContent).not.toContain("Midi2 · Lead");
  expect(container.textContent).toContain("A1 (33)");
  expect(container.textContent).toContain("E5 (76)");
});

it("rejects malformed melody responses without replacing the focused track", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await select("Focus", "synth2");
  await select("Generator", "melody");
  await act(async () => button("Generate Melody").click());
  expect(container.textContent).toContain("Synth2 · Lead");
  expect(container.textContent).toContain("E5 (76)");

  vi.mocked(api.melody)
    .mockResolvedValueOnce({} as unknown as NoteData[])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{
      ...generatedMelody, startBeat: Number.NaN,
    }]);
  await act(async () => button("Generate Melody").click());
  expect(container.textContent).toContain("The melody response was invalid.");
  expect(container.textContent).toContain("Synth2 · Lead");
  expect(container.textContent).toContain("E5 (76)");

  await act(async () => button("Generate Melody").click());
  expect(container.textContent).toContain("The melody response was invalid.");
  expect(container.textContent).toContain("E5 (76)");

  await act(async () => button("Generate Melody").click());
  expect(container.textContent).toContain("The melody response was invalid.");
  expect(container.textContent).toContain("E5 (76)");
});

it("retains the destination and other tracks when generation fails", async () => {
  vi.mocked(api.replay).mockRejectedValueOnce(new Error("Generation failed."));
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await select("Focus", "synth2");
  await select("Generator", "bass");
  await act(async () => button("Generate Bass").click());
  expect(container.textContent).toContain("Generation failed.");
  expect(container.textContent).toContain("Synth2 · Chords");
  expect(container.textContent).toContain("Visible notes (2)");
});

it("generates deterministic melody content only on each focused melodic track", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  for (const track of ["synth1", "synth2", "midi1", "midi2"]) {
    await select("Focus", track);
    await select("Generator", "melody");
    await act(async () => button("Generate Melody").click());
  }

  expect(container.textContent).toContain("Synth1 · Lead");
  expect(container.textContent).toContain("Synth2 · Lead");
  expect(container.textContent).toContain("Midi1 · Lead");
  expect(container.textContent).toContain("Midi2 · Lead");
  expect(container.textContent).toContain("Visible notes (4)");
  expect(vi.mocked(api.melody).mock.calls).toEqual([0, 3, 1, 2].map((seed) => [{
    rootNote: pkg.effectiveConfiguration.rootNote,
    scaleType: pkg.effectiveConfiguration.scaleType,
    progressionId: pkg.effectiveConfiguration.progressionId,
    sections: pkg.effectiveConfiguration.sections.map(({ bars }) => ({ bars })),
    seed,
  }]));

  await act(async () => button("Refresh Devices").click());
  await select("Bass Output", "circuit");
  await select("Chords Output", "circuit");
  await select("Midi1 Output", "circuit");
  await select("Midi2 Output", "circuit");
  await act(async () => {
    await vi.waitFor(() => expect(button("Play").disabled).toBe(false));
  });
  await act(async () => {
    button("Play").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x93, generatedMelody.midiNote, generatedMelody.velocity]);
});

it("repeats each track's melody seed without replacing the other track", async () => {
  vi.mocked(api.melody).mockImplementation(async (request) => [{
    ...generatedMelody,
    note: request.seed === 1 ? "E5" : "F5",
    midiNote: request.seed === 1 ? 76 : 77,
  }]);
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  for (const track of ["midi1", "midi2", "midi1", "midi2"]) {
    await select("Focus", track);
    await select("Generator", "melody");
    await act(async () => button("Generate Melody").click());
  }
  expect(vi.mocked(api.melody).mock.calls.map(([request]) => request.seed)).toEqual([1, 2, 1, 2]);
  const rows = [...container.querySelectorAll(".note-list tbody tr")].map((row) => row.textContent);
  expect(rows.some((row) => row?.includes("Midi1 · Lead") && row.includes("E5 (76)"))).toBe(true);
  expect(rows.some((row) => row?.includes("Midi2 · Lead") && row.includes("F5 (77)"))).toBe(true);
});

it("reselecting a lead track selects the melody generator and melody failures preserve its content", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await select("Focus", "midi1");
  await select("Generator", "melody");
  await act(async () => button("Generate Melody").click());
  await select("Generator", "bass");
  await select("Focus", "midi2");
  await select("Focus", "midi1");
  expect(selectElement("Generator").value).toBe("melody");

  vi.mocked(api.melody).mockRejectedValueOnce(new Error("Melody generation failed."));
  await act(async () => button("Generate Melody").click());
  expect(container.textContent).toContain("Melody generation failed.");
  expect(container.textContent).toContain("Midi1 · Lead");
  expect(container.textContent).toContain("E5 (76)");
});

it("keeps track generation disabled until initial chord loading completes", async () => {
  let resolveChords!: (blob: Blob) => void;
  vi.mocked(api.combinedMidi).mockImplementationOnce(() => new Promise((resolve) => { resolveChords = resolve; }));
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await select("Focus", "synth2");
  await select("Generator", "melody");
  expect(button("Generate Melody").disabled).toBe(true);
  expect(api.melody).not.toHaveBeenCalled();

  await act(async () => resolveChords({ arrayBuffer: async () => midi() } as Blob));
  expect(button("Generate Melody").disabled).toBe(false);
  await act(async () => button("Generate Melody").click());
  expect(container.textContent).toContain("Synth2 · Lead");
  expect(container.textContent).toContain("E5 (76)");
});

it("keeps track generation disabled while a failed chord load is retried", async () => {
  let resolveChords!: (blob: Blob) => void;
  vi.mocked(api.combinedMidi)
    .mockRejectedValueOnce(new Error("Chord service unavailable."))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveChords = resolve; }));
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await act(async () => {
    await vi.waitFor(() => expect(container.textContent).toContain("Chord notes could not be loaded"));
  });
  await select("Focus", "synth2");
  await select("Generator", "melody");
  expect(button("Generate Melody").disabled).toBe(true);
  await act(async () => button("Retry").click());
  expect(button("Generate Melody").disabled).toBe(true);
  expect(api.melody).not.toHaveBeenCalled();

  await act(async () => resolveChords({ arrayBuffer: async () => midi() } as Blob));
  expect(button("Generate Melody").disabled).toBe(false);
  await act(async () => button("Generate Melody").click());

  expect(container.textContent).toContain("Synth2 · Lead");
  expect(container.textContent).toContain("E5 (76)");
});

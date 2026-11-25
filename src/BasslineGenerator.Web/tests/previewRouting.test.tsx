// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../src/api";
import * as apiModule from "../src/api";
import * as allTracksMidi from "../src/allTracksMidi";
import { initialRequest } from "../src/domain";
import { PlaybackTransport } from "../src/playback";
import Preview from "../src/Preview";
import type { GenerationPackage } from "../src/types";

vi.mock("../src/PianoRoll", () => ({
  default: ({ chordNotes, drumNotes, workflow }: { chordNotes: unknown[]; drumNotes: unknown[]; workflow: {
    generate: (track: "drums", role: "drums", action: "apply") => void } }) =>
    <><div data-testid="chord-count">{chordNotes.length}</div><div data-testid="drum-count">{drumNotes.length}</div>
      <button type="button" onClick={() => workflow.generate("drums", "drums", "apply")}>Apply Pattern</button></>,
}));

const pkg: GenerationPackage = {
  version: 1, seed: 1, statistics: null,
  notes: [{ note: "A1", midiNote: 33, startBeat: 0, durationBeats: 1, velocity: 64 }],
  effectiveConfiguration: {
    ...initialRequest, seed: 1, requestedProgression: null,
    progressionId: "x", progressionName: "X", chordSequence: [],
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
let stateChange: () => void;

function button(name: string) {
  const result = [...container.querySelectorAll("button")].find((item) => item.textContent === name);
  if (!result) throw new Error(`Missing button: ${name}`);
  return result;
}

async function select(label: string, value: string) {
  const control = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label))?.querySelector("select");
  if (!control) throw new Error(`Missing select: ${label}`);
  await act(async () => { control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  output = { id: "circuit", name: "Circuit Tracks", state: "connected", send: vi.fn(), clear: vi.fn() };
  Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: vi.fn(async () => ({
    outputs: new Map([[output.id, output]]),
    addEventListener: (_name: string, callback: () => void) => { stateChange = callback; },
    removeEventListener: vi.fn(),
  })) });
  vi.spyOn(api, "combinedMidi").mockResolvedValue({ arrayBuffer: async () => midi() } as Blob);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

it("plays a selected drum pattern on channel 10, updates it during playback, and checks routing collisions", async () => {
  vi.stubGlobal("AudioContext", class {
    currentTime = 0;
    destination = {};
    createGain() { return { gain: { value: 0, setValueAtTime() {} }, connect() {} }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  });
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await act(async () => button("Refresh Devices").click());
  await select("Bass Output", "circuit");
  await select("Chords Output", "circuit");
  await select("Drums Output", "circuit");
  await select("Drum pattern", "four-on-the-floor");
  expect(container.querySelector('[data-testid="drum-count"]')?.textContent).toBe("0");
  await act(async () => button("Apply Pattern").click());
  expect(container.querySelector('[data-testid="drum-count"]')?.textContent).toBe("10");
  await act(async () => button("Play").click());
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x99, 60, 110]);
  await select("Drum pattern", "half-time");
  expect(container.querySelector('[data-testid="drum-count"]')?.textContent).toBe("10");
  await act(async () => button("Apply Pattern").click());
  expect(container.querySelector('[data-testid="drum-count"]')?.textContent).toBe("2");
  expect(output.clear).toHaveBeenCalled();
  expect(output.send.mock.calls.filter((call) => call[0][0] === 0x99 && call[0][1] === 60)).toHaveLength(2);
  await act(async () => button("Pause").click());
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x89, 60, 0]);
  await select("Drums MIDI Channel", "0");
  expect(button("Play").disabled).toBe(true);
  expect(container.textContent).toContain("must use different channels");
});

it("shows the selected pattern's description and Drum 4 sample guidance", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await select("Drum pattern", "house-shaker");
  expect(container.textContent).toContain("syncopated shaker on Drum 4");
  expect(container.textContent).toContain("Load the suggested percussion sample on Drum 4");
  await select("Drum pattern", "techno-cowbell");
  expect(container.textContent).toContain("sparse cowbell accents on Drum 4");
  expect(container.textContent).not.toContain("syncopated shaker on Drum 4");
  await select("Drum pattern", "");
  expect(container.textContent).not.toContain("sparse cowbell accents on Drum 4");
});

it("offers the new songwriting foundations in the drum pattern selector", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  const control = [...container.querySelectorAll("label")]
    .find((item) => item.textContent?.startsWith("Drum pattern"))
    ?.querySelector("select");
  const options = new Map([...control!.options].map(({ value, text }) => [value, text]));

  expect(options.get("pop-modern-backbeat")).toBe("Pop - Modern Backbeat (1 bar)");
  expect(options.get("punk-driving-eighths")).toBe("Punk - Driving Eighths (1 bar)");
  expect(options.get("metal-gallop")).toBe("Metal - Gallop (2 bars)");
  expect(options.get("disco-open-hat-drive")).toBe("Disco - Open Hat Drive (1 bar)");
  expect(options.get("rock-texas-shuffle")).toBe("Rock - Texas Shuffle (2 bars)");
  expect(options.get("latin-pop-conga-pulse")).toBe("Latin Pop - Conga Pulse (2 bars)");
});

it("shows volume when at least one track uses Browser Synth", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  expect(container.querySelector('[aria-label="Master volume"]')).not.toBeNull();
  await act(async () => button("Refresh Devices").click());
  for (const track of ["Bass", "Chords", "Midi1", "Midi2", "Drums"]) await select(`${track} Output`, "circuit");
  expect(container.querySelector('[aria-label="Master volume"]')).toBeNull();
  await select("Midi2 Output", "");
  expect(container.querySelector('[aria-label="Master volume"]')).not.toBeNull();
});

it("shows and remembers per-track browser sounds in the playback sidebar", async () => {
  const assign = vi.spyOn(PlaybackTransport.prototype, "setTrackSound");
  const sidebar = document.createElement("aside");
  document.body.appendChild(sidebar);
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} playbackPane={sidebar} />));
  const sounds = sidebar.querySelector<HTMLDetailsElement>(".track-sounds")!;
  expect(sounds.open).toBe(false);
  expect(sounds.querySelector("summary")?.textContent).toContain("Synth1: Classic");
  expect(sounds.querySelector("summary")?.textContent).toContain("Midi2: Classic");
  expect(sounds.querySelectorAll("select")).toHaveLength(8);
  expect(assign).toHaveBeenCalledWith("synth1", "classic");
  expect(assign).toHaveBeenCalledWith("midi2", "classic");
  await act(async () => sounds.querySelector("summary")!.click());
  const sound = sounds.querySelector<HTMLSelectElement>('[aria-label="Synth2 browser sound"]')!;
  expect([...sound.options].map((option) => option.textContent)).toEqual([
    "Classic", "Bass", "Acid Bass", "Warm Pad", "Dream Pad", "Analog Pad", "Juno Pad",
    "Saw Lead", "Square Lead", "Supersaw Lead", "Keys", "FM Bell", "Organ", "Strings",
    "Pluck", "Soft Pluck", "Bright Pluck",
  ]);
  await act(async () => { sound.value = "warmPad"; sound.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(assign).toHaveBeenCalledWith("synth2", "warmPad");
  expect(JSON.parse(sessionStorage.getItem("bassline-preview-track-sounds")!)).toEqual({
    synth1: "classic", synth2: "warmPad", midi1: "classic", midi2: "classic",
  });
  await act(async () => sounds.querySelector("summary")!.click());
  expect(sounds.querySelector("summary")?.textContent).toContain("Synth2: Warm Pad");
  await act(async () => root.render(<Preview pkg={{ ...pkg }} disabled={false} playbackPane={sidebar} />));
  expect(sidebar.querySelector<HTMLSelectElement>('[aria-label="Synth2 browser sound"]')?.value).toBe("warmPad");
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} playbackPane={sidebar} />));
  expect(sidebar.querySelector<HTMLSelectElement>('[aria-label="Synth2 browser sound"]')?.value).toBe("warmPad");
  sidebar.remove();
});

it("edits and restores independent 1-based hardware patches without changing browser sounds", async () => {
  const assign = vi.spyOn(PlaybackTransport.prototype, "setTrackPatch");
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  const selectPatch = async (name: string, value: string) => {
    const control = container.querySelector<HTMLSelectElement>(`[aria-label="${name} hardware patch"]`)!;
    await act(async () => { control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); });
  };
  const synth = container.querySelector<HTMLSelectElement>('[aria-label="Synth1 hardware patch"]')!;
  expect(synth.options).toHaveLength(129);
  expect(synth.options[0].textContent).toBe("Off");
  expect(synth.options[1].value).toBe("1");
  expect(synth.options[128].value).toBe("128");
  expect(synth.value).toBe("");
  await selectPatch("Synth1", "1");
  await selectPatch("Midi2", "128");
  expect(assign).toHaveBeenCalledWith("synth1", 0);
  expect(assign).toHaveBeenCalledWith("midi2", 127);
  expect(container.querySelector<HTMLSelectElement>('[aria-label="Synth1 browser sound"]')?.value).toBe("classic");
  expect(JSON.parse(sessionStorage.getItem("bassline-preview-hardware-patches")!)).toEqual({
    synth1: 0, synth2: null, midi1: null, midi2: 127,
  });
  expect(container.querySelector(".track-sounds summary")?.textContent).toContain("Midi2: Classic · Patch 128");
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  expect(container.querySelector<HTMLSelectElement>('[aria-label="Synth1 hardware patch"]')?.value).toBe("1");
  expect(container.querySelector<HTMLSelectElement>('[aria-label="Midi2 hardware patch"]')?.value).toBe("128");
  await selectPatch("Synth1", "");
  expect(assign).toHaveBeenLastCalledWith("midi2", 127);
  expect(JSON.parse(sessionStorage.getItem("bassline-preview-hardware-patches")!).synth1).toBeNull();
});

it("reports invalid stored hardware patches", async () => {
  sessionStorage.setItem("bassline-preview-hardware-patches", '{"synth1":128}');
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  expect(container.textContent).toContain("Hardware Patches could not be loaded or saved");
  expect(container.querySelector<HTMLSelectElement>('[aria-label="Synth1 hardware patch"]')?.value).toBe("");
});

it("sends selected hardware patches on playback and passes them to all-tracks export", async () => {
  vi.stubGlobal("AudioContext", class {
    currentTime = 0;
    destination = {};
    createGain() { return { gain: { value: 0, setValueAtTime() {} }, connect() {} }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  });
  const create = vi.spyOn(allTracksMidi, "createAllTracksMidi");
  vi.spyOn(apiModule, "download").mockImplementation(() => {});
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  for (const [name, value] of [["Synth1", "17"], ["Synth2", "128"]]) {
    const control = container.querySelector<HTMLSelectElement>(`[aria-label="${name} hardware patch"]`)!;
    await act(async () => { control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); });
  }
  await act(async () => button("Refresh Devices").click());
  await select("Bass Output", "circuit");
  await select("Chords Output", "circuit");
  output.send.mockClear();
  await act(async () => button("Play").click());
  const messages = output.send.mock.calls.map((call) => call[0]);
  expect(messages).toContainEqual([0xc0, 16]);
  expect(messages).toContainEqual([0xc1, 127]);
  expect(messages.findIndex((message) => message[0] === 0xc0)).toBeLessThan(messages.findIndex((message) => message[0] === 0x90));
  await act(async () => button("Download All Tracks MIDI (Circuit Tracks)").click());
  expect(create.mock.calls[0][4]).toEqual({ synth1: 16, synth2: 127, midi1: null, midi2: null });
});

it("reports invalid stored track sounds instead of silently restoring them", async () => {
  sessionStorage.setItem("bassline-preview-track-sounds", '{"synth1":"not-a-sound"}');
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  expect(container.textContent).toContain("Track Sounds could not be loaded or saved");
  expect(container.querySelector<HTMLSelectElement>('[aria-label="Synth1 browser sound"]')?.value).toBe("classic");
});

it("keeps sound edits usable and reports a session storage failure", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
  const sound = container.querySelector<HTMLSelectElement>('[aria-label="Midi1 browser sound"]')!;
  await act(async () => { sound.value = "pluck"; sound.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(sound.value).toBe("pluck");
  expect(container.textContent).toContain("Track Sounds could not be loaded or saved");
});

it("shows and switches the selected profile without expanding hardware routing", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  const routing = container.querySelector<HTMLDetailsElement>(".hardware-routing")!;
  const profile = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith("Profile"))!.querySelector("select")!;
  expect(routing.open).toBe(false);
  expect(profile.closest("details")).toBeNull();
  expect(profile.selectedOptions[0].textContent).toBe("Browser Preview");
  await select("Profile", "circuit-1");
  expect(profile.selectedOptions[0].textContent).toBe("Circuit Tracks Synth 1");
  expect(routing.open).toBe(false);
  expect(container.querySelector<HTMLInputElement>('.routing-profiles input')?.value).toBe("Circuit Tracks Synth 1");
});

it("places transport in its dock and playback settings in the supplied sidebar", async () => {
  const sidebar = document.createElement("aside");
  const dock = document.createElement("div");
  document.body.appendChild(sidebar);
  document.body.appendChild(dock);
  try {
    await act(async () => root.render(<Preview pkg={pkg} disabled={false} playbackPane={sidebar} transportPane={dock} />));
    const refresh = [...sidebar.querySelectorAll("button")].find((item) => item.textContent === "Refresh Devices")!;
    const transport = dock.querySelector('[aria-label="Playback controls"]');
    expect(transport?.classList.contains("transport-dock")).toBe(true);
    expect([...transport!.querySelectorAll("button")].map((item) => item.textContent)).toEqual([
      "Play", "Pause", "Stop", "Restart", "Loop Enabled",
    ]);
    expect(transport!.querySelector('[role="status"]')?.textContent).toBe("Stopped");
    expect(transport!.contains(sidebar.querySelector('[aria-label="Master volume"]'))).toBe(false);
    expect(sidebar.querySelector('[aria-label="Playback controls"]')).toBeNull();
    expect(container.querySelector('[aria-label="Playback controls"]')).toBeNull();
    const loop = [...transport!.querySelectorAll("button")].find((item) => item.textContent === "Loop Enabled")!;
    await act(async () => loop.click());
    expect(loop.getAttribute("aria-pressed")).toBe("false");
    expect(loop.textContent).toBe("Loop");
    await act(async () => refresh.click());
    expect(sidebar.textContent).toContain("Circuit Tracks");
    expect(container.querySelector('[data-testid="chord-count"]')).not.toBeNull();
  } finally {
    sidebar.remove();
    dock.remove();
  }
});

it("renders transport and playback settings inline without portal targets", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  expect(container.querySelector('[aria-label="Playback controls"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Master volume"]')).not.toBeNull();
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

it("configures and saves independent device channels, blocking collisions", async () => {
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  const profiles = container.querySelector('[aria-label="Routing profiles"]')!;
  const bass = container.querySelector('[aria-label="Bass output"]')!;
  expect(profiles.compareDocumentPosition(bass) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelector('[data-testid="chord-count"]')?.textContent).toBe("1");
  await act(async () => button("Refresh Devices").click());
  await select("Bass Output", "circuit");
  await select("Chords Output", "circuit");
  expect(container.textContent).not.toContain("must use different channels");
  expect(button("Play").disabled).toBe(false);
  await select("Chords MIDI Channel", "0");
  expect(container.textContent).toContain("must use different channels");
  expect(button("Play").disabled).toBe(true);
  await select("Chords MIDI Channel", "1");
  await act(async () => button("Update Profile").click());
  const saved = JSON.parse(localStorage.getItem("bassline-routing-profiles")!);
  expect(saved.profiles[0].routing.channel).toBe(0);
  expect(saved.profiles[0].chordRouting.channel).toBe(1);
  expect(saved.profiles[0].chordRouting.destination.deviceId).toBe("circuit");
});

it("plays both tracks through selected channels and pauses when the shared device disconnects", async () => {
  let audio!: { currentTime: number };
  vi.stubGlobal("AudioContext", class {
    currentTime = 0;
    destination = {};
    constructor() { audio = this; }
    createGain() { return { gain: { value: 0, setValueAtTime() {} }, connect() {} }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  });
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await act(async () => button("Refresh Devices").click());
  await select("Bass Output", "circuit");
  await select("Chords Output", "circuit");
  await act(async () => button("Play").click());
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x90, 33, 64]);
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x91, 60, 90]);
  audio.currentTime = 0.1;
  output.state = "disconnected";
  await act(async () => stateChange());
  expect(container.textContent).toContain("Paused");
  expect(container.textContent).toContain("MIDI output unavailable or ambiguous");
  expect(button("Play").disabled).toBe(true);
  expect(output.clear).toHaveBeenCalledOnce();
  output.state = "connected";
  await act(async () => stateChange());
  audio.currentTime = 1;
  await act(async () => button("Play").click());
  expect(container.textContent).toContain("Playing");
  expect(output.send.mock.calls.filter((call) => call[0][0] === 0x90)).toHaveLength(2);
  expect(output.send.mock.calls.filter((call) => call[0][0] === 0x91)).toHaveLength(2);
});

it("blocks playback on chord load failure and allows retry", async () => {
  vi.mocked(api.combinedMidi).mockRejectedValueOnce(new Error("Too many requests."));
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  expect(container.textContent).toContain("Too many requests.");
  expect(button("Play").disabled).toBe(true);
  await act(async () => button("Retry").click());
  expect(container.querySelector('[data-testid="chord-count"]')?.textContent).toBe("1");
  expect(button("Play").disabled).toBe(false);
});

it("ignores delayed chord data from an earlier package", async () => {
  let resolve!: (blob: Blob) => void;
  vi.mocked(api.combinedMidi).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  await act(async () => root.render(<Preview pkg={pkg} disabled={false} />));
  await act(async () => root.render(<Preview pkg={{ ...pkg, seed: 2 }} disabled={false} />));
  expect(container.querySelector('[data-testid="chord-count"]')?.textContent).toBe("1");
  await act(async () => resolve({ arrayBuffer: async () => new ArrayBuffer(0) } as Blob));
  expect(container.querySelector('[data-testid="chord-count"]')?.textContent).toBe("1");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

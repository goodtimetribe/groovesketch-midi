// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../src/api";
import { initialRequest } from "../src/domain";
import Preview from "../src/Preview";
import type { GenerationPackage } from "../src/types";

vi.mock("../src/PianoRoll", () => ({
  default: ({ chordNotes, drumNotes }: { chordNotes: unknown[]; drumNotes: unknown[] }) =>
    <><div data-testid="chord-count">{chordNotes.length}</div><div data-testid="drum-count">{drumNotes.length}</div></>,
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
  expect(container.querySelector('[data-testid="drum-count"]')?.textContent).toBe("10");
  await act(async () => button("Play").click());
  expect(output.send.mock.calls.map((call) => call[0])).toContainEqual([0x99, 60, 110]);
  await select("Drum pattern", "half-time");
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialRequest } from "../src/domain";
import { PlaybackTransport } from "../src/playback";
import { defaultRoutingProfiles, resolveOutput } from "../src/routingProfiles";
import type { GenerationPackage } from "../src/types";

class Parameter {
  value = 0;
  setValueAtTime = vi.fn((value: number, _time: number) => { this.value = value; });
  linearRampToValueAtTime = vi.fn();
}

class Node {
  connect = vi.fn((node: Node) => node);
  disconnect = vi.fn();
}

class Oscillator extends Node {
  type = "";
  frequency = new Parameter();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class Gain extends Node { gain = new Parameter(); }
class Filter extends Node { type = ""; frequency = new Parameter(); Q = new Parameter(); }

class AudioContextMock {
  static instance: AudioContextMock;
  currentTime = 0;
  destination = new Node();
  oscillators: Oscillator[] = [];
  gains: Gain[] = [];
  filters: Filter[] = [];
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
  constructor() { AudioContextMock.instance = this; }
  createGain() { const gain = new Gain(); this.gains.push(gain); return gain; }
  createBiquadFilter() { const filter = new Filter(); this.filters.push(filter); return filter; }
  createOscillator() { const oscillator = new Oscillator(); this.oscillators.push(oscillator); return oscillator; }
}

class MidiOutputMock {
  id = "device";
  name = "Circuit Tracks";
  state: MIDIPortDeviceState = "connected";
  send = vi.fn();
  clear = vi.fn();
}

const pkg: GenerationPackage = {
  version: 1, seed: 1, statistics: null,
  effectiveConfiguration: {
    ...initialRequest, seed: 1, bpm: 120, requestedProgression: null,
    progressionId: "x", progressionName: "X", chordSequence: [],
    sections: [
      { name: "First", style: "Acid", bars: 1, behavior: { movement: 0, groove: 0, mutation: 0, tension: 0, repetition: 0 } },
      { name: "Second", style: "Acid", bars: 1, behavior: { movement: 0, groove: 0, mutation: 0, tension: 0, repetition: 0 } },
    ],
  },
  notes: [
    { note: "C2", midiNote: 36, startBeat: 4, durationBeats: 1, velocity: 127 },
    { note: "A1", midiNote: 33, startBeat: 0, durationBeats: 2, velocity: 64 },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("AudioContext", AudioContextMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("preview transport", () => {
  it("sends per-track programs before MIDI notes, on resume and route changes, but not on loops", async () => {
    const output = new MidiOutputMock();
    const device = output as unknown as MIDIOutput;
    const transport = new PlaybackTransport(() => {});
    const note = { note: "C4", midiNote: 60, startBeat: 0, durationBeats: 2, velocity: 100 };
    transport.load(pkg, [], [], { synth1: [note], synth2: [note], midi1: [note], midi2: [note] });
    transport.setTrackPatch("synth1", 0);
    transport.setTrackPatch("midi1", 16);
    transport.setTrackPatch("midi2", 127);
    transport.setTrackRoutings({
      synth1: { output: device, channel: 0 }, synth2: { output: device, channel: 1 },
      midi1: { output: device, channel: 2 }, midi2: { output: device, channel: 3 },
    });
    expect(output.send.mock.calls.map((call) => call[0])).toEqual([[0xc0, 0], [0xc2, 16], [0xc3, 127]]);
    output.send.mockClear();
    transport.setLoop(true);
    await transport.play();
    const messages = () => output.send.mock.calls.map((call) => call[0]);
    for (const [program, noteOn] of [[[0xc0, 0], [0x90, 60, 100]], [[0xc2, 16], [0x92, 60, 100]], [[0xc3, 127], [0x93, 60, 100]]]) {
      expect(messages().findIndex((message) => message[0] === program[0])).toBeLessThan(messages().findIndex((message) => message[0] === noteOn[0]));
      expect(messages()).toContainEqual(program);
    }
    expect(messages().some((message) => message[0] === 0xc1 || message[0] === 0xc9)).toBe(false);
    AudioContextMock.instance.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    expect(messages().filter((message) => (message[0] & 0xf0) === 0xc0)).toHaveLength(3);

    transport.setTrackPatch("midi1", 41);
    expect(messages()).toContainEqual([0xc2, 41]);
    const count = messages().length;
    transport.setTrackPatch("midi1", null);
    expect(messages()).toHaveLength(count);
    transport.pause();
    output.send.mockClear();
    await transport.play();
    expect(messages()).toContainEqual([0xc0, 0]);
    expect(messages()).toContainEqual([0xc3, 127]);
    expect(messages().some((message) => message[0] === 0xc2)).toBe(false);

    const newOutput = new MidiOutputMock();
    output.send.mockClear();
    transport.setTrackRoutings({
      synth1: { output: device, channel: 0 }, synth2: { output: device, channel: 1 },
      midi1: { output: device, channel: 2 }, midi2: { output: newOutput as unknown as MIDIOutput, channel: 5 },
    });
    expect(newOutput.send.mock.calls[0][0]).toEqual([0xc5, 127]);
    expect(newOutput.send.mock.calls.some((call) => call[0][0] === 0x95)).toBe(true);
    transport.dispose();
  });

  it("reports program errors and leaves browser sound selection independent", async () => {
    const output = new MidiOutputMock();
    const error = vi.fn();
    const transport = new PlaybackTransport(() => {}, error);
    transport.load(pkg);
    transport.setTrackSound("synth1", "squareLead");
    transport.setTrackPatch("synth1", 16);
    await transport.play();
    expect(AudioContextMock.instance.oscillators[0].type).toBe("square");
    transport.pause();
    output.send.mockImplementation(() => { throw new Error("device error"); });
    transport.setTrackRoutings({
      synth1: { output: output as unknown as MIDIOutput, channel: 0 }, synth2: { output: null, channel: 1 },
    });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("program change failed"));
    await expect(transport.play()).rejects.toThrow("device error");
    expect(transport.state).toBe("stopped");
    transport.dispose();
  });

  it("uses each melodic track's browser sound while leaving drums on the classic voice", async () => {
    const transport = new PlaybackTransport(() => {});
    const note = { note: "C4", midiNote: 60, startBeat: 0, durationBeats: 2, velocity: 100 };
    const tracks = { synth1: [note], synth2: [note], midi1: [note], midi2: [note] };
    transport.load(pkg, [], [{ ...note, midiNote: 36 }], tracks);
    transport.setTrackSound("synth1", "acidBass");
    transport.setTrackSound("synth2", "warmPad");
    transport.setTrackSound("midi1", "sawLead");
    transport.setTrackSound("midi2", "keys");
    await transport.play();
    const context = AudioContextMock.instance;
    expect(context.oscillators.map((oscillator) => oscillator.type))
      .toEqual(["sawtooth", "triangle", "sawtooth", "triangle", "sawtooth"]);
    expect(context.filters.map((filter) => filter.frequency.value)).toEqual([2400, 900, 3000, 2200, 700]);
    expect(context.filters[0].Q.value).toBe(8);
    expect(context.filters[0].frequency.linearRampToValueAtTime).toHaveBeenCalledWith(450, 0.18);
    expect(context.gains[2].gain.linearRampToValueAtTime).toHaveBeenCalledWith(100 / 127 * 0.2, 0.25);
    transport.dispose();
  });

  it("changes future browser notes without interrupting playback or affecting MIDI", async () => {
    const output = new MidiOutputMock();
    const device = output as unknown as MIDIOutput;
    const transport = new PlaybackTransport(() => {});
    const note = { note: "C4", midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 100 };
    transport.load(pkg, [], [], {
      synth1: [note, { ...note, startBeat: 1 }], synth2: [note], midi1: [], midi2: [],
    });
    transport.setTrackRoutings({ synth1: { output: null, channel: 0 }, synth2: { output: device, channel: 1 } });
    await transport.play();
    const context = AudioContextMock.instance;
    expect(context.oscillators[0].type).toBe("sawtooth");
    context.currentTime = 0.2;
    const sent = output.send.mock.calls.length;
    transport.setTrackSound("synth1", "squareLead");
    transport.setTrackSound("synth2", "dreamPad");
    expect(transport.state).toBe("playing");
    expect(transport.beat).toBeCloseTo(0.4);
    expect(output.clear).not.toHaveBeenCalled();
    expect(output.send).toHaveBeenCalledTimes(sent);
    expect(context.gains[1].disconnect).not.toHaveBeenCalled();
    context.currentTime = 0.4;
    vi.advanceTimersByTime(25);
    expect(context.oscillators[1].type).toBe("square");
    expect(context.oscillators[1].start).toHaveBeenCalledWith(0.5);
    transport.pause();
    await transport.play();
    expect(context.oscillators.at(-1)!.type).toBe("square");
    transport.dispose();
  });

  it("mutes queued melody and all drum lanes on a shared MIDI output across a loop boundary", async () => {
    const output = new MidiOutputMock();
    output.name = "Generic MIDI";
    const device = output as unknown as MIDIOutput;
    const transport = new PlaybackTransport(() => {});
    const drums = [36, 38, 42, 54].map((midiNote) =>
      ({ note: "drum", midiNote, startBeat: 0, durationBeats: 0.25, velocity: 100 }));
    const melody = { note: "E5", midiNote: 76, startBeat: 0, durationBeats: 2, velocity: 90 };
    const tracks = { synth1: pkg.notes!, synth2: [], midi1: [melody], midi2: [] };
    transport.load(pkg, [], drums, tracks);
    transport.setTrackRoutings({
      synth1: { output: device, channel: 0 }, synth2: { output: device, channel: 1 },
      midi1: { output: device, channel: 2 }, drum1: { output: device, channel: 9 },
    });
    transport.setLoop(true);
    await transport.play();
    const context = AudioContextMock.instance;
    context.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    expect(output.send.mock.calls.some((call) => call[0][0] === 0x92 && call[1] > 0)).toBe(true);

    output.send.mockClear();
    transport.setTrackEnabled("midi1", false);
    expect(transport.beat).toBeCloseTo(7.8);
    expect(transport.state).toBe("playing");
    expect(output.clear).toHaveBeenCalledOnce();
    expect(output.send).toHaveBeenCalledWith([0x82, 76, 0]);
    expect(output.send.mock.calls.some((call) => call[0][0] === 0x92)).toBe(false);
    expect(output.send.mock.calls.some((call) => call[0][0] === 0x90)).toBe(true);

    output.send.mockClear();
    transport.setTrackEnabled("drums", false);
    expect(output.clear).toHaveBeenCalledTimes(2);
    for (const pitch of [36, 38, 42, 54]) expect(output.send).toHaveBeenCalledWith([0x89, pitch, 0]);
    expect(output.send.mock.calls.some((call) => call[0][0] === 0x99)).toBe(false);

    output.send.mockClear();
    transport.setTrackEnabled("midi1", true);
    expect(output.send.mock.calls.some((call) => call[0][0] === 0x92)).toBe(true);
    expect(output.send.mock.calls.some((call) => call[0][0] === 0x99)).toBe(false);
    context.currentTime = 4.25;
    transport.setTrackEnabled("drums", true);
    expect(transport.beat).toBeCloseTo(0.5);
    transport.dispose();
  });

  it("silences browser voices immediately and resumes sustained notes on unmute", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg, [{ note: "C4", midiNote: 60, startBeat: 0, durationBeats: 4, velocity: 90 }]);
    await transport.play();
    const context = AudioContextMock.instance;
    context.currentTime = 0.25;
    transport.setTrackEnabled("synth2", false);
    expect(context.gains.slice(1, 3).every((gain) => gain.disconnect.mock.calls.length > 0)).toBe(true);
    expect(context.oscillators).toHaveLength(3);
    expect(context.oscillators.at(-1)!.frequency.value).toBeCloseTo(55);
    expect(transport.beat).toBeCloseTo(0.5);
    transport.setTrackEnabled("synth2", true);
    expect(context.oscillators.at(-1)!.frequency.value).toBeCloseTo(261.6256);
    expect(context.oscillators.at(-1)!.start).toHaveBeenCalledWith(0.25);
    transport.dispose();
  });

  it("retains muted tracks through pause, content reload, and drum pattern changes", async () => {
    const output = new MidiOutputMock();
    output.name = "Generic MIDI";
    const device = output as unknown as MIDIOutput;
    const transport = new PlaybackTransport(() => {});
    const drums = [{ note: "C2", midiNote: 36, startBeat: 0, durationBeats: 1, velocity: 100 }];
    transport.setTrackRoutings({
      synth1: { output: device, channel: 0 }, synth2: { output: device, channel: 1 },
      drum1: { output: device, channel: 9 },
    });
    transport.setTrackEnabled("synth1", false);
    transport.setTrackEnabled("drums", false);
    transport.load(pkg, [], drums);
    await transport.play();
    expect(output.send.mock.calls.some((call) => call[0][0] === 0x90 || call[0][0] === 0x99)).toBe(false);
    transport.pause();
    transport.setDrumNotes(drums);
    await transport.play();
    expect(output.send.mock.calls.some((call) => call[0][0] === 0x90 || call[0][0] === 0x99)).toBe(false);
    transport.setTrackEnabled("synth1", true);
    transport.setTrackEnabled("drums", true);
    expect(output.send.mock.calls.some((call) => call[0][0] === 0x90)).toBe(true);
    expect(output.send.mock.calls.some((call) => call[0][0] === 0x99)).toBe(true);
    transport.dispose();
  });

  it("loops drums on channel 10 with the other tracks and silences them on pause", async () => {
    const output = new MidiOutputMock();
    const device = output as unknown as MIDIOutput;
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg, [], [{ note: "C2", midiNote: 36, startBeat: 0, durationBeats: 0.25, velocity: 110 }]);
    transport.setTrackRoutings({
      synth1: { output: device, channel: 0 }, synth2: { output: device, channel: 1 }, drum1: { output: device, channel: 9 },
    });
    transport.setLoop(true);
    await transport.play();
    expect(output.send).toHaveBeenCalledWith([0x99, 60, 110], 0);
    AudioContextMock.instance.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    expect(output.send.mock.calls.filter((call) => call[0][0] === 0x99)).toHaveLength(2);
    transport.pause();
    expect(output.clear).toHaveBeenCalledOnce();
    expect(output.send).toHaveBeenCalledWith([0x89, 60, 0]);
    transport.dispose();
  });

  it("keeps source drum notes unchanged for non-Circuit Tracks MIDI outputs", async () => {
    const output = new MidiOutputMock();
    output.name = "Generic MIDI";
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg, [], [{ note: "C2", midiNote: 36, startBeat: 0, durationBeats: 0.25, velocity: 110 }]);
    transport.setTrackRoutings({
      synth1: { output: null, channel: 0 }, synth2: { output: null, channel: 1 },
      drum1: { output: output as unknown as MIDIOutput, channel: 9 },
    });
    await transport.play();
    expect(output.send).toHaveBeenCalledWith([0x99, 36, 110], 0);
    transport.dispose();
  });

  it("routes all four hardware drum lanes through the existing shared drum route", async () => {
    const output = new MidiOutputMock();
    output.name = "Generic MIDI";
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg, [], [36, 38, 42, 54].map((midiNote) =>
      ({ note: "drum", midiNote, startBeat: 0, durationBeats: 0.25, velocity: 100 })));
    transport.setTrackRoutings({
      synth1: { output: null, channel: 0 }, synth2: { output: null, channel: 1 },
      drum1: { output: output as unknown as MIDIOutput, channel: 7 },
    });
    await transport.play();
    for (const pitch of [36, 38, 42, 54]) expect(output.send).toHaveBeenCalledWith([0x97, pitch, 100], 0);
    transport.pause();
    for (const pitch of [36, 38, 42, 54]) expect(output.send).toHaveBeenCalledWith([0x87, pitch, 0]);
    expect(output.clear).toHaveBeenCalledOnce();
    transport.dispose();
  });

  it("schedules both tracks on separate channels of one MIDI output and clears its queue once", async () => {
    const output = new MidiOutputMock();
    const device = output as unknown as MIDIOutput;
    const transport = new PlaybackTransport(() => {});
    const chord = { note: "C4", midiNote: 60, startBeat: 0, durationBeats: 4, velocity: 90 };
    transport.load(pkg, [chord]);
    transport.setTrackRoutings({ synth1: { output: device, channel: 0 }, synth2: { output: device, channel: 1 } });
    transport.setLoop(true);
    await transport.play();
    expect(output.send).toHaveBeenCalledWith([0x90, 33, 64], 0);
    expect(output.send).toHaveBeenCalledWith([0x91, 60, 90], 0);
    const context = AudioContextMock.instance;
    context.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    const noteOns = output.send.mock.calls.filter((call) => call[0][0] === 0x90 || call[0][0] === 0x91);
    expect(noteOns.slice(-2).map((call) => call[0])).toEqual([[0x90, 33, 64], [0x91, 60, 90]]);
    expect(noteOns.at(-1)![1]).toBeCloseTo(125);
    context.currentTime = 4.25;
    expect(transport.beat).toBeCloseTo(0.5);
    transport.pause();
    expect(output.clear).toHaveBeenCalledTimes(1);
    expect(output.send).toHaveBeenCalledWith([0x80, 33, 0]);
    expect(output.send).toHaveBeenCalledWith([0x81, 60, 0]);
    context.currentTime = 10;
    await transport.play();
    expect(output.send).toHaveBeenCalledWith([0x90, 33, 64], 25);
    expect(output.send).toHaveBeenCalledWith([0x91, 60, 90], 25);
    transport.stop();
    expect(output.clear).toHaveBeenCalledTimes(2);
    transport.dispose();
  });

  it("routes tracks independently and reschedules both at the same position after a route change", async () => {
    const bass = new MidiOutputMock();
    const chords = new MidiOutputMock();
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg, [{ note: "C4", midiNote: 60, startBeat: 0, durationBeats: 4, velocity: 90 }]);
    transport.setTrackRoutings({
      synth1: { output: bass as unknown as MIDIOutput, channel: 2 },
      synth2: { output: chords as unknown as MIDIOutput, channel: 5 },
    });
    await transport.play();
    expect(bass.send).toHaveBeenCalledWith([0x92, 33, 64], 0);
    expect(chords.send).toHaveBeenCalledWith([0x95, 60, 90], 0);
    AudioContextMock.instance.currentTime = 0.25;
    transport.setTrackRoutings({
      synth1: { output: null, channel: 2 },
      synth2: { output: chords as unknown as MIDIOutput, channel: 5 },
    });
    expect(transport.beat).toBeCloseTo(0.5);
    expect(transport.state).toBe("playing");
    expect(bass.clear).toHaveBeenCalledOnce();
    expect(chords.clear).toHaveBeenCalledOnce();
    expect(chords.send).toHaveBeenCalledWith([0x95, 60, 90], 0);
    expect(AudioContextMock.instance.oscillators.at(-1)!.start).toHaveBeenCalledWith(0.25);
    expect(() => transport.setTrackRoutings({
      synth1: { output: chords as unknown as MIDIOutput, channel: 5 },
      synth2: { output: chords as unknown as MIDIOutput, channel: 5 },
    })).toThrow("different channels");
    expect(transport.state).toBe("playing");
    transport.dispose();
  });

  it("plays simultaneous chord voices through the browser synth", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg, [
      { note: "C4", midiNote: 60, startBeat: 0, durationBeats: 4, velocity: 90 },
      { note: "E4", midiNote: 64, startBeat: 0, durationBeats: 4, velocity: 90 },
    ]);
    await transport.play();
    expect(AudioContextMock.instance.oscillators).toHaveLength(3);
    expect(AudioContextMock.instance.oscillators.map((oscillator) => oscillator.start.mock.calls[0][0])).toEqual([0, 0, 0]);
    transport.pause();
    expect(AudioContextMock.instance.gains.slice(1).every((gain) => gain.disconnect.mock.calls.length > 0)).toBe(true);
    transport.dispose();
  });

  it("schedules sorted notes against the audio clock and finishes after all sections", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    await transport.play();
    const context = AudioContextMock.instance;
    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0].frequency.value).toBeCloseTo(55);
    expect(context.oscillators[0].start).toHaveBeenCalledWith(0);
    expect(context.oscillators[0].stop).toHaveBeenCalledWith(1);
    expect(context.gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(64 / 127 * 0.22, 0.01);
    context.currentTime = 1.9;
    vi.advanceTimersByTime(25);
    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators[1].start).toHaveBeenCalledWith(2);
    context.currentTime = 3;
    vi.advanceTimersByTime(25);
    expect(transport.state).toBe("playing");
    context.currentTime = 4;
    vi.advanceTimersByTime(25);
    expect(transport.state).toBe("stopped");
    expect(transport.beat).toBe(0);
    transport.dispose();
  });

  it("schedules repeated loops ahead of the boundary and wraps the playhead on the audio clock", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    transport.setLoop(true);
    await transport.play();
    const context = AudioContextMock.instance;
    context.currentTime = 1.9;
    vi.advanceTimersByTime(25);
    context.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    expect(context.oscillators).toHaveLength(3);
    expect(context.oscillators[2].start).toHaveBeenCalledWith(4);
    context.currentTime = 4;
    expect(transport.beat).toBe(0);
    vi.advanceTimersByTime(25);
    expect(context.oscillators).toHaveLength(3);
    context.currentTime = 7.9;
    vi.advanceTimersByTime(25);
    expect(context.oscillators.at(-1)!.start).toHaveBeenCalledWith(8);
    context.currentTime = 8.25;
    vi.advanceTimersByTime(25);
    expect(transport.state).toBe("playing");
    expect(transport.beat).toBeCloseTo(0.5);
    expect(context.oscillators.filter((oscillator) => oscillator.frequency.value === 55)).toHaveLength(3);
    transport.stop();
    expect(transport.state).toBe("stopped");
    expect(transport.beat).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    context.currentTime = 12;
    vi.advanceTimersByTime(100);
    expect(context.oscillators.filter((oscillator) => oscillator.frequency.value === 55)).toHaveLength(3);
    transport.dispose();
  });

  it("pauses and resumes within a loop without losing position or duplicating the next cycle", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    transport.setLoop(true);
    await transport.play();
    const context = AudioContextMock.instance;
    context.currentTime = 4.25;
    vi.advanceTimersByTime(25);
    expect(transport.beat).toBeCloseTo(0.5);
    transport.pause();
    expect(transport.state).toBe("paused");
    expect(transport.beat).toBeCloseTo(0.5);
    context.currentTime = 10;
    await transport.play();
    expect(context.oscillators.at(-1)!.start).toHaveBeenCalledWith(10);
    expect(context.oscillators.at(-1)!.stop).toHaveBeenCalledWith(10.75);
    context.currentTime = 13.65;
    vi.advanceTimersByTime(25);
    expect(context.oscillators.at(-1)!.start).toHaveBeenCalledWith(13.75);
    context.currentTime = 13.75;
    vi.advanceTimersByTime(25);
    expect(transport.beat).toBe(0);
    expect(transport.state).toBe("playing");
    expect(context.oscillators.filter((oscillator) => oscillator.start.mock.calls[0][0] === 13.75)).toHaveLength(1);
    transport.dispose();
  });

  it("cancels the queued next loop when loop is disabled near the boundary", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    transport.setLoop(true);
    await transport.play();
    const context = AudioContextMock.instance;
    context.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    const queued = context.oscillators.at(-1)!;
    expect(queued.start).toHaveBeenCalledWith(4);
    transport.setLoop(false);
    expect(queued.stop).toHaveBeenLastCalledWith();
    context.currentTime = 4;
    vi.advanceTimersByTime(25);
    expect(transport.state).toBe("stopped");
    expect(transport.beat).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    transport.dispose();
  });

  it("loops MIDI using the same clock, cancels queued messages on pause and stop, and resumes", async () => {
    const output = new MidiOutputMock();
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    transport.setDestination(output as unknown as MIDIOutput);
    transport.setLoop(true);
    await transport.play();
    const context = AudioContextMock.instance;
    context.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    expect(output.send.mock.calls[2][0]).toEqual([0x90, 33, 64]);
    expect(output.send.mock.calls[2][1]).toBeCloseTo(125);
    context.currentTime = 4.25;
    transport.pause();
    expect(output.clear).toHaveBeenCalledTimes(1);
    expect(output.send).toHaveBeenCalledWith([0x80, 33, 0]);
    expect(transport.beat).toBeCloseTo(0.5);
    context.currentTime = 10;
    await transport.play();
    expect(output.send).toHaveBeenLastCalledWith([0x80, 33, 0], 775);
    context.currentTime = 13.65;
    vi.advanceTimersByTime(25);
    const nextNote = [...output.send.mock.calls].reverse().find((call) => call[0][0] === 0x90);
    expect(nextNote?.[0]).toEqual([0x90, 33, 64]);
    expect(nextNote?.[1]).toBeCloseTo(150);
    transport.stop();
    expect(output.clear).toHaveBeenCalledTimes(2);
    expect(output.send).toHaveBeenLastCalledWith([0x80, 33, 0]);
    expect(vi.getTimerCount()).toBe(0);
    transport.dispose();
  });

  it("can enable looping during playback and catch up after a delayed scheduler tick", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    await transport.play();
    const context = AudioContextMock.instance;
    context.currentTime = 3.9;
    transport.setLoop(true);
    expect(context.oscillators.at(-1)!.start).toHaveBeenCalledWith(4);
    context.currentTime = 12.25;
    vi.advanceTimersByTime(25);
    expect(transport.beat).toBeCloseTo(0.5);
    expect(context.oscillators.at(-1)!.start).toHaveBeenCalledWith(12.25);
    expect(context.oscillators.at(-1)!.stop).toHaveBeenCalledWith(13);
    expect(transport.state).toBe("playing");
    transport.dispose();
  });

  it("queues MIDI note-off before the next cycle's note-on and clears both when looping is disabled", async () => {
    const output = new MidiOutputMock();
    const transport = new PlaybackTransport(() => {});
    transport.load({
      ...pkg,
      notes: [
        { note: "A1", midiNote: 33, startBeat: 0, durationBeats: 1, velocity: 64 },
        { note: "A1", midiNote: 33, startBeat: 7, durationBeats: 1, velocity: 64 },
      ],
    });
    transport.setDestination(output as unknown as MIDIOutput);
    transport.setLoop(true);
    await transport.play();
    const context = AudioContextMock.instance;
    context.currentTime = 3.4;
    vi.advanceTimersByTime(25);
    context.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    expect(output.send.mock.calls.slice(2).map((call) => call[0])).toEqual([
      [0x90, 33, 64], [0x80, 33, 0], [0x90, 33, 64], [0x80, 33, 0],
    ]);
    transport.setLoop(false);
    expect(output.clear).toHaveBeenCalledOnce();
    expect(output.send.mock.calls.slice(-3).map((call) => call[0])).toEqual([
      [0x80, 33, 0], [0x90, 33, 64], [0x80, 33, 0],
    ]);
    context.currentTime = 4;
    vi.advanceTimersByTime(25);
    expect(transport.state).toBe("stopped");
    transport.dispose();
  });

  it("pauses and resumes sustained notes, adjusts volume, and resets on restart and load", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    transport.setVolume(75);
    await transport.play();
    const context = AudioContextMock.instance;
    transport.setVolume(30);
    expect(context.gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0.3, 0);
    context.currentTime = 0.25;
    transport.pause();
    expect(transport.beat).toBe(0.5);
    expect(context.oscillators[0].disconnect).not.toHaveBeenCalled();
    expect(context.gains[1].disconnect).toHaveBeenCalled();
    context.currentTime = 1;
    await transport.play();
    expect(context.oscillators[1].start).toHaveBeenCalledWith(1);
    expect(context.oscillators[1].stop).toHaveBeenCalledWith(1.75);
    context.currentTime = 1.5;
    await transport.restart();
    expect(transport.beat).toBe(0);
    expect(context.oscillators[2].start).toHaveBeenCalledWith(1.5);
    transport.load(pkg);
    expect(transport.state).toBe("stopped");
    expect(transport.beat).toBe(0);
    transport.dispose();
  });

  it("does not start after a pending audio resume is stopped", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    const first = transport.play();
    await first;
    transport.stop();
    const context = AudioContextMock.instance;
    let resume!: () => void;
    context.resume.mockImplementationOnce(() => new Promise<void>((resolve) => { resume = resolve; }));
    const pending = transport.play();
    transport.stop();
    resume();
    await pending;
    expect(transport.state).toBe("stopped");
    expect(context.oscillators).toHaveLength(1);
    transport.dispose();
  });

  it("only schedules the look-ahead window and silences future scheduled notes on stop", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load({
      ...pkg,
      notes: Array.from({ length: 10000 }, (_, i) => ({
        note: "A1", midiNote: 33, startBeat: i / 4, durationBeats: 0.2, velocity: 100,
      })),
    });
    await transport.play();
    const context = AudioContextMock.instance;
    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators[1].start).toHaveBeenCalledWith(0.125);
    transport.stop();
    expect(context.gains[2].disconnect).toHaveBeenCalled();
    expect(context.oscillators[1].stop).toHaveBeenLastCalledWith();
    transport.dispose();
  });

  it("routes notes and velocity to MIDI, and cancels and resumes sustained notes at the transport position", async () => {
    const output = new MidiOutputMock();
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    transport.setDestination(output as unknown as MIDIOutput);
    await transport.play();
    const context = AudioContextMock.instance;
    expect(context.oscillators).toHaveLength(0);
    expect(output.send).toHaveBeenNthCalledWith(1, [0x90, 33, 64], 0);
    expect(output.send).toHaveBeenNthCalledWith(2, [0x80, 33, 0], 1000);
    context.currentTime = 0.25;
    transport.pause();
    expect(transport.beat).toBe(0.5);
    expect(output.clear).toHaveBeenCalledTimes(1);
    expect(output.send).toHaveBeenLastCalledWith([0x80, 33, 0]);
    context.currentTime = 1;
    await transport.play();
    expect(output.send).toHaveBeenLastCalledWith([0x80, 33, 0], 750);
    context.currentTime = 2.65;
    vi.advanceTimersByTime(25);
    expect(output.send.mock.calls[5][0]).toEqual([0x90, 36, 127]);
    expect(output.send.mock.calls[5][1]).toBeCloseTo(125);
    expect(output.send.mock.calls[6][0]).toEqual([0x80, 36, 0]);
    expect(output.send.mock.calls[6][1]).toBeCloseTo(625);
    transport.stop();
    expect(output.clear).toHaveBeenCalledTimes(2);
    expect(transport.beat).toBe(0);
    await transport.restart();
    expect(output.send).toHaveBeenCalledWith([0x90, 33, 64], 25);
    transport.dispose();
  });

  it("switches MIDI channels without restarting and silences notes on their original channels", async () => {
    const output = new MidiOutputMock();
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    transport.setDestination(output as unknown as MIDIOutput);
    await transport.play();
    expect(output.send).toHaveBeenNthCalledWith(1, [0x90, 33, 64], 0);
    expect(output.send).toHaveBeenNthCalledWith(2, [0x80, 33, 0], 1000);

    transport.setMidiChannel(1);
    expect(transport.state).toBe("playing");
    AudioContextMock.instance.currentTime = 1.9;
    vi.advanceTimersByTime(25);
    expect(output.send.mock.calls[2][0]).toEqual([0x91, 36, 127]);
    expect(output.send.mock.calls[3][0]).toEqual([0x81, 36, 0]);

    transport.stop();
    expect(output.send).toHaveBeenCalledWith([0x80, 33, 0]);
    expect(output.send).toHaveBeenCalledWith([0x81, 36, 0]);
    await transport.play();
    expect(output.send).toHaveBeenCalledWith([0x91, 33, 64], 25);
    expect(output.send).toHaveBeenCalledWith([0x81, 33, 0], 1025);
    transport.dispose();
  });

  it("encodes channel 16 and leaves browser synth playback unaffected", async () => {
    const output = new MidiOutputMock();
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    transport.setMidiChannel(15);
    await transport.play();
    const context = AudioContextMock.instance;
    expect(context.oscillators).toHaveLength(1);
    expect(output.send).not.toHaveBeenCalled();
    transport.setMidiChannel(1);
    expect(transport.state).toBe("playing");
    expect(context.gains[1].disconnect).not.toHaveBeenCalled();
    transport.setRouting(output as unknown as MIDIOutput, 15);
    await transport.play();
    expect(output.send).toHaveBeenCalledWith([0x9f, 33, 64], 0);
    expect(output.send).toHaveBeenCalledWith([0x8f, 33, 0], 1000);
    expect(() => transport.setMidiChannel(16)).toThrow(RangeError);
    expect(() => transport.setMidiChannel(-1)).toThrow(RangeError);
    expect(() => transport.setMidiChannel(1.5)).toThrow(RangeError);
    transport.dispose();
  });

  it("applies profile routing without changing position and silences the previous output", async () => {
    const output = new MidiOutputMock();
    const midiOutput = output as unknown as MIDIOutput;
    const transport = new PlaybackTransport(() => {});
    const snapshot = structuredClone(pkg);
    transport.load(pkg);
    await transport.play();
    const context = AudioContextMock.instance;
    context.currentTime = 0.25;
    const profile = defaultRoutingProfiles().profiles[2];
    transport.setRouting(resolveOutput(profile.routing.destination, [midiOutput]), profile.routing.channel);
    expect(transport.state).toBe("playing");
    expect(transport.beat).toBe(0.5);
    expect(context.gains[1].disconnect).toHaveBeenCalled();
    expect(output.send).toHaveBeenCalledWith([0x91, 33, 64], 0);
    transport.setDestination(null);
    expect(output.clear).toHaveBeenCalled();
    expect(output.send).toHaveBeenLastCalledWith([0x81, 33, 0]);
    expect(transport.state).toBe("playing");
    expect(transport.beat).toBe(0.5);
    expect(context.oscillators).toHaveLength(2);
    expect(pkg).toEqual(snapshot);
    transport.dispose();
  });

  it("preserves a paused position when changing routing", async () => {
    const transport = new PlaybackTransport(() => {});
    transport.load(pkg);
    await transport.play();
    AudioContextMock.instance.currentTime = 0.25;
    transport.pause();
    const output = new MidiOutputMock();
    transport.setRouting(output as unknown as MIDIOutput, 2);
    expect(transport.state).toBe("paused");
    expect(transport.beat).toBe(0.5);
    await transport.play();
    expect(output.send).toHaveBeenCalledWith([0x92, 33, 64], 0);
    transport.dispose();
  });

  it("pauses and reports MIDI failures without losing position or leaving a running timer", async () => {
    const output = new MidiOutputMock();
    const errors = vi.fn();
    const transport = new PlaybackTransport(() => {}, errors);
    transport.load(pkg);
    transport.setDestination(output as unknown as MIDIOutput);
    await transport.play();
    output.state = "disconnected";
    AudioContextMock.instance.currentTime = 1.9;
    vi.advanceTimersByTime(25);
    expect(transport.state).toBe("paused");
    expect(transport.beat).toBe(3.8);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("MIDI playback failed"));
    expect(vi.getTimerCount()).toBe(0);
    await expect(transport.play()).rejects.toThrow("disconnected");
    transport.dispose();
  });
});

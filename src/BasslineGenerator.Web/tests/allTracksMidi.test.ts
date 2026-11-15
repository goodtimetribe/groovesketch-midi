import { expect, it } from "vitest";
import { createAllTracksMidi } from "../src/allTracksMidi";
import type { MelodicContent } from "../src/trackView";
import type { NoteData } from "../src/types";

const note = (midiNote: number, startBeat = 0, durationBeats = 1, velocity = 100): NoteData =>
  ({ note: "test", midiNote, startBeat, durationBeats, velocity });

function readMidi(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("MThd");
  expect(view.getUint32(4)).toBe(6);
  const format = view.getUint16(8), count = view.getUint16(10), division = view.getUint16(12);
  let offset = 14;
  const tracks = [];
  for (let i = 0; i < count; i++) {
    expect(new TextDecoder().decode(bytes.slice(offset, offset + 4))).toBe("MTrk");
    const end = offset + 8 + view.getUint32(offset + 4);
    offset += 8;
    let tick = 0;
    let name = "";
    const notes: { tick: number; status: number; pitch: number; velocity: number }[] = [];
    const meta: { type: number; data: number[] }[] = [];
    const variable = () => {
      let value = 0;
      let byte: number;
      do { byte = bytes[offset++]; value = value * 128 + (byte & 127); } while (byte & 128);
      return value;
    };
    while (offset < end) {
      tick += variable();
      const status = bytes[offset++];
      if (status === 0xff) {
        const type = bytes[offset++];
        const length = variable();
        const data = [...bytes.slice(offset, offset + length)];
        offset += length;
        if (type === 3) name = new TextDecoder().decode(new Uint8Array(data));
        meta.push({ type, data });
      } else {
        notes.push({ tick, status, pitch: bytes[offset++], velocity: bytes[offset++] });
      }
    }
    expect(offset).toBe(end);
    tracks.push({ name, notes, meta, endTick: tick });
  }
  expect(offset).toBe(bytes.length);
  return { format, division, tracks };
}

it("exports current hardware tracks on Circuit Tracks channels with tempo, timing, and mapped drums", async () => {
  const content: MelodicContent = {
    synth1: { role: "lead", notes: [note(76, 0.5, 0.25, 88)] },
    synth2: { role: "bass", notes: [note(36), note(36, 1, 0.5, 75)] },
    midi1: { role: "chords", notes: [note(60), note(64)] },
    midi2: { role: null, notes: [note(48, 1.5)] },
  };
  const drums = [36, 38, 42, 54, 56, 60, 63, 70, 75, 80].map((pitch) => note(pitch, 2, 0.25));
  const original = structuredClone({ content, drums });
  const file = createAllTracksMidi(content, drums, 120, 2);
  expect(file.type).toBe("audio/midi");
  const result = readMidi(new Uint8Array(await file.arrayBuffer()));
  expect(result.format).toBe(1);
  expect(result.division).toBe(480);
  expect(result.tracks.map((track) => track.name)).toEqual(["", "Synth1", "Synth2", "Midi1", "Midi2", "Drums"]);
  expect(result.tracks[0].meta).toContainEqual({ type: 0x51, data: [0x07, 0xa1, 0x20] });
  expect(result.tracks[0].meta).toContainEqual({ type: 0x58, data: [4, 2, 24, 8] });
  expect(result.tracks[1].notes).toEqual([
    { tick: 240, status: 0x90, pitch: 76, velocity: 88 },
    { tick: 360, status: 0x80, pitch: 76, velocity: 0 },
  ]);
  expect(result.tracks[2].notes).toEqual([
    { tick: 0, status: 0x91, pitch: 36, velocity: 100 },
    { tick: 480, status: 0x81, pitch: 36, velocity: 0 },
    { tick: 480, status: 0x91, pitch: 36, velocity: 75 },
    { tick: 720, status: 0x81, pitch: 36, velocity: 0 },
  ]);
  expect(result.tracks[3].notes.filter((event) => event.status === 0x92).map((event) => event.pitch)).toEqual([60, 64]);
  expect(result.tracks[4].notes[0]).toMatchObject({ tick: 720, status: 0x93, pitch: 48 });
  expect(result.tracks[5].notes.filter((event) => event.status === 0x99).map((event) => event.pitch))
    .toEqual([60, 62, 64, 65, 65, 65, 65, 65, 65, 80]);
  expect(result.tracks.slice(1).map((track) => track.endTick)).toEqual([3840, 3840, 3840, 3840, 3840]);
  expect({ content, drums }).toEqual(original);
});

it("keeps empty tracks and rejects notes that cannot be represented in MIDI", async () => {
  const empty: MelodicContent = {
    synth1: { role: null, notes: [] }, synth2: { role: null, notes: [] },
    midi1: { role: null, notes: [] }, midi2: { role: null, notes: [] },
  };
  const result = readMidi(new Uint8Array(await createAllTracksMidi(empty, [], 140, 1).arrayBuffer()));
  expect(result.tracks).toHaveLength(6);
  expect(result.tracks.slice(1).every((track) => track.notes.length === 0 && track.endTick === 1920)).toBe(true);
  expect(() => createAllTracksMidi(empty, [note(36, 0, 0.00001)], 140, 1)).toThrow(/note time/);
  expect(() => createAllTracksMidi(empty, [note(36, 0, 1, 0)], 140, 1)).toThrow(/invalid MIDI note/);
  expect(() => createAllTracksMidi(empty, [], 0, 1)).toThrow(/tempo/);
});

import { describe, expect, it } from "vitest";
import { createCircuitTracksDrumMidi, mapCircuitTracksDrumNote } from "../src/circuitTracksDrums";
import { drumPatterns } from "../src/drumPatterns";
import type { NoteData } from "../src/types";

function readTrackNotes(bytes: Uint8Array): { status: number; pitch: number }[] {
  let offset = 14;
  const trackLength = new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset);
  offset += 8;
  const end = offset + trackLength;
  let runningStatus = 0;
  const notes: { status: number; pitch: number }[] = [];
  while (offset < end) {
    let byte: number;
    do { byte = bytes[offset++]; } while (byte & 0x80);
    const status = bytes[offset] < 0x80 ? runningStatus : bytes[offset++];
    if (status < 0xf0) runningStatus = status;
    if (status === 0xff) {
      const type = bytes[offset++];
      let length = bytes[offset++];
      while (length-- > 0) offset++;
      if (type === 0x2f) break;
    } else if (status === 0x99 || status === 0x89) {
      const pitch = bytes[offset++];
      offset++;
      if (status === 0x99) notes.push({ status, pitch });
    } else {
      throw new Error(`Unexpected MIDI status: ${status}`);
    }
  }
  return notes;
}

describe("Circuit Tracks drum mapping", () => {
  it("maps only the three supported voices for Circuit Tracks playback without mutating source notes", () => {
    const notes: NoteData[] = [36, 38, 42].map((midiNote) => ({
      note: "source", midiNote, startBeat: 0, durationBeats: 0.25, velocity: 100,
    }));
    const original = structuredClone(notes);
    expect(notes.map((note) => mapCircuitTracksDrumNote(note, "Circuit Tracks MIDI").midiNote)).toEqual([60, 62, 64]);
    expect(mapCircuitTracksDrumNote(notes[0], "Other MIDI")).toBe(notes[0]);
    expect(notes).toEqual(original);
  });

  it("exports the selected source pattern as Circuit Tracks notes on channel 10", async () => {
    const pattern = drumPatterns.find(({ id }) => id === "four-on-the-floor")!;
    const original = structuredClone(pattern.notes);
    const blob = createCircuitTracksDrumMidi(pattern.notes, 120, 1);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd");
    expect(bytes[11]).toBe(1);
    expect(readTrackNotes(bytes)).toEqual(expect.arrayContaining([
      { status: 0x99, pitch: 60 },
      { status: 0x99, pitch: 62 },
      { status: 0x99, pitch: 64 },
    ]));
    expect(pattern.notes).toEqual(original);
  });
});

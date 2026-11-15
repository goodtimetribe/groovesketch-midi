import { mapCircuitTracksDrumNote } from "./circuitTracksDrums";
import { hardwareTracks } from "./hardwareTracks";
import { chunk, variableLength } from "./midiFile";
import type { MelodicContent } from "./trackView";
import type { NoteData } from "./types";

const ticksPerQuarter = 480;
const maxMidiTime = 0x0fffffff;

export function createAllTracksMidi(tracks: MelodicContent, drums: NoteData[], bpm: number, bars: number): Blob {
  if (!Number.isInteger(bpm) || bpm < 1 || !Number.isInteger(bars) || bars < 1)
    throw new RangeError("The tempo and arrangement length must be positive integers.");
  const tempo = Math.round(60_000_000 / bpm);
  const endTick = bars * 4 * ticksPerQuarter;
  if (tempo < 1 || tempo > 0xffffff || !Number.isSafeInteger(endTick) || endTick > maxMidiTime)
    throw new RangeError("The tempo or arrangement length is outside the Standard MIDI File range.");

  const makeTrack = (name: string, notes: NoteData[], channel: number) => {
    const nameBytes = Array.from(new TextEncoder().encode(name));
    const data = [0, 0xff, 0x03, ...variableLength(nameBytes.length), ...nameBytes];
    const events: { tick: number; order: number; bytes: number[] }[] = [];
    let finalTick = endTick;
    for (const note of notes) {
      if (!Number.isInteger(note.midiNote) || note.midiNote < 0 || note.midiNote > 127
        || !Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127
        || !Number.isFinite(note.startBeat) || note.startBeat < 0
        || !Number.isFinite(note.durationBeats) || note.durationBeats <= 0)
        throw new RangeError(`The ${name} track contains an invalid MIDI note.`);
      const start = Math.round(note.startBeat * ticksPerQuarter);
      const end = Math.round((note.startBeat + note.durationBeats) * ticksPerQuarter);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || end > maxMidiTime)
        throw new RangeError(`The ${name} track contains an invalid MIDI note time.`);
      events.push({ tick: start, order: 1, bytes: [0x90 | channel, note.midiNote, note.velocity] });
      events.push({ tick: end, order: 0, bytes: [0x80 | channel, note.midiNote, 0] });
      finalTick = Math.max(finalTick, end);
    }
    events.push({ tick: finalTick, order: 2, bytes: [0xff, 0x2f, 0] });
    events.sort((left, right) => left.tick - right.tick || left.order - right.order);
    let previous = 0;
    for (const event of events) {
      data.push(...variableLength(event.tick - previous), ...event.bytes);
      previous = event.tick;
    }
    return chunk("MTrk", data);
  };

  const conductor = chunk("MTrk", [
    0, 0xff, 0x51, 3, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff,
    0, 0xff, 0x58, 4, 4, 2, 24, 8,
    0, 0xff, 0x2f, 0,
  ]);
  const drumNotes = drums.map((note) => mapCircuitTracksDrumNote(note, "Circuit Tracks"));
  const file = [
    ...chunk("MThd", [0, 1, 0, 6, 1, 224]), ...conductor,
    ...makeTrack("Synth1", tracks.synth1.notes, hardwareTracks.synth1.defaultChannel),
    ...makeTrack("Synth2", tracks.synth2.notes, hardwareTracks.synth2.defaultChannel),
    ...makeTrack("Midi1", tracks.midi1.notes, hardwareTracks.midi1.defaultChannel),
    ...makeTrack("Midi2", tracks.midi2.notes, hardwareTracks.midi2.defaultChannel),
    ...makeTrack("Drums", drumNotes, hardwareTracks.drum1.defaultChannel),
  ];
  return new Blob([new Uint8Array(file).buffer], { type: "audio/midi" });
}

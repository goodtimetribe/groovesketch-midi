import type { NoteData } from "./types";

const circuitTracksDrumNotes: Record<number, number> = {
  36: 60,
  38: 62,
  42: 64,
  54: 65,
  56: 65,
  60: 65,
  63: 65,
  70: 65,
  75: 65,
};

export function mapCircuitTracksDrumNote(note: NoteData, outputName: string | null | undefined): NoteData {
  if (!outputName?.toLowerCase().includes("circuit tracks")) return note;
  const midiNote = circuitTracksDrumNotes[note.midiNote];
  return midiNote === undefined ? note : { ...note, midiNote };
}

export function createCircuitTracksDrumMidi(notes: NoteData[], bpm: number, bars: number): Blob {
  if (!Number.isInteger(bpm) || bpm < 1 || bpm > 0xffffff)
    throw new RangeError("Tempo must be a positive MIDI-compatible BPM value.");
  if (!Number.isInteger(bars) || bars < 1)
    throw new RangeError("The arrangement must contain at least one bar.");

  const ticksPerQuarter = 480;
  const events: { tick: number; order: number; data: number[] }[] = [];
  let finalTick = bars * 4 * ticksPerQuarter;
  for (const note of notes) {
    if (!Number.isInteger(note.midiNote) || note.midiNote < 0 || note.midiNote > 127
      || !Number.isInteger(note.velocity) || note.velocity < 0 || note.velocity > 127
      || !Number.isFinite(note.startBeat) || note.startBeat < 0
      || !Number.isFinite(note.durationBeats) || note.durationBeats <= 0)
      throw new RangeError("The drum pattern contains an invalid MIDI note.");
    const start = Math.round(note.startBeat * ticksPerQuarter);
    const end = Math.round((note.startBeat + note.durationBeats) * ticksPerQuarter);
    if (end <= start) throw new RangeError("The drum pattern contains a note shorter than one MIDI tick.");
    const mappedNote = circuitTracksDrumNotes[note.midiNote] ?? note.midiNote;
    events.push({ tick: start, order: 1, data: [0x99, mappedNote, note.velocity] });
    events.push({ tick: end, order: 0, data: [0x89, mappedNote, 0] });
    finalTick = Math.max(finalTick, end);
  }

  events.push({ tick: finalTick, order: 2, data: [0xff, 0x2f, 0] });
  events.sort((left, right) => left.tick - right.tick || left.order - right.order);

  const tempo = Math.round(60_000_000 / bpm);
  if (tempo < 1 || tempo > 0xffffff)
    throw new RangeError("Tempo is outside the Standard MIDI File range.");
  const track = [
    0, 0xff, 0x51, 3, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff,
    0, 0xff, 0x58, 4, 4, 2, 24, 8,
  ];
  let previousTick = 0;
  for (const event of events) {
    track.push(...variableLength(event.tick - previousTick), ...event.data);
    previousTick = event.tick;
  }

  const file = [
    ...chunk("MThd", [0, 0, 0, 1, 1, 224]),
    ...chunk("MTrk", track),
  ];
  const buffer = new Uint8Array(file).buffer;
  return new Blob([buffer], { type: "audio/midi" });
}

function variableLength(value: number): number[] {
  let remaining = Math.floor(value);
  const bytes = [remaining & 0x7f];
  while ((remaining >>= 7) > 0) bytes.unshift((remaining & 0x7f) | 0x80);
  return bytes;
}

function chunk(id: string, data: number[]): number[] {
  const length = data.length;
  return [
    ...Array.from(id, (character) => character.charCodeAt(0)),
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...data,
  ];
}

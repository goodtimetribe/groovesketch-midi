import type { GenerationPackage, NoteData } from "./types";

type RgbColor = readonly [red: number, green: number, blue: number];

export const circuitTracksColors = {
  synth1: [230, 72, 152],
  synth2: [94, 224, 181],
  midi1: [73, 158, 255],
  midi2: [244, 115, 167],
  drum1: [255, 139, 61],
  drum2: [255, 210, 66],
  drum3: [180, 140, 255],
  drum4: [69, 211, 224],
} as const satisfies Record<string, RgbColor>;

export interface TrackViewModel {
  id: string;
  name: string;
  role: string;
  visible: boolean;
  notes: NoteData[];
  color: RgbColor;
  indicator: string;
}

export function createTracks(pkg: GenerationPackage, chordNotes: NoteData[], visibility: Record<string, boolean>, drumNotes?: NoteData[]): TrackViewModel[] {
  return [
    { id: "bass", name: "Bass", role: "bass", visible: visibility.bass ?? true, notes: pkg.notes ?? [], color: circuitTracksColors.synth1, indicator: "rgb(230, 72, 152)" },
    { id: "chords", name: "Chords", role: "chords", visible: visibility.chords ?? true, notes: chordNotes, color: circuitTracksColors.synth2, indicator: "rgb(94, 224, 181)" },
    ...(drumNotes ? [{
      id: "drums", name: "Drums", role: "drums", visible: visibility.drums ?? true, notes: drumNotes,
      color: circuitTracksColors.drum1,
      indicator: "linear-gradient(to bottom, rgb(255, 139, 61) 0 25%, rgb(255, 210, 66) 25% 50%, rgb(180, 140, 255) 50% 75%, rgb(69, 211, 224) 75% 100%)",
    }] : []),
  ];
}

export function trackNoteColor(track: TrackViewModel, note: NoteData): RgbColor {
  if (track.role !== "drums") return track.color;
  switch (note.midiNote) {
    case 36: return circuitTracksColors.drum1;
    case 38: return circuitTracksColors.drum2;
    case 42: return circuitTracksColors.drum3;
    default: return circuitTracksColors.drum4;
  }
}

export function rgba(color: RgbColor, opacity: number): string {
  return `rgba(${color.join(", ")}, ${opacity})`;
}

export function tracksForRendering(tracks: TrackViewModel[], focus: string) {
  return tracks.filter((track) => track.visible)
    .map((track) => ({ track, ghost: track.id !== focus }))
    .sort((a, b) => Number(b.ghost) - Number(a.ghost));
}

// The combined export contains a conductor, bass track, and chord track, in that order.
export function readChordNotes(buffer: ArrayBuffer): NoteData[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let pos = 0;
  const fail = (): never => { throw new Error("The chord MIDI could not be read."); };
  const requireBytes = (count: number, end = bytes.length) => {
    if (count < 0 || pos + count > end || pos + count > bytes.length) fail();
  };
  const byte = (end = bytes.length) => { requireBytes(1, end); return bytes[pos++]; };
  const uint32 = () => { requireBytes(4); const value = view.getUint32(pos); pos += 4; return value; };
  const chunk = (id: string) => {
    requireBytes(4);
    for (const char of id) if (byte() !== char.charCodeAt(0)) fail();
    const length = uint32();
    requireBytes(length);
    return pos + length;
  };
  const headerEnd = chunk("MThd");
  if (headerEnd - pos < 6) fail();
  const format = view.getUint16(pos);
  const trackCount = view.getUint16(pos + 2);
  const division = view.getUint16(pos + 4);
  if (format !== 1 || trackCount < 3 || division === 0 || division >= 0x8000) fail();
  pos = headerEnd;
  for (let i = 0; i < 2; i++) pos = chunk("MTrk");
  const end = chunk("MTrk");
  const variable = () => {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const part = byte(end);
      value = value * 128 + (part & 0x7f);
      if (!(part & 0x80)) return value;
    }
    return fail();
  };
  const active = new Map<number, { start: number; velocity: number }[]>();
  const notes: NoteData[] = [];
  let time = 0;
  let running = 0;
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  while (pos < end) {
    time += variable();
    let status = byte(end);
    if (status < 0x80) {
      if (!running) fail();
      pos--;
      status = running;
    } else if (status < 0xf0) running = status;
    else running = 0;
    if (status === 0xff || status === 0xf0 || status === 0xf7) {
      if (status === 0xff) byte(end);
      const length = variable();
      requireBytes(length, end);
      pos += length;
      continue;
    }
    if (status < 0x80 || status >= 0xf0) fail();
    const kind = status & 0xf0;
    const first = byte(end);
    const second = kind === 0xc0 || kind === 0xd0 ? 0 : byte(end);
    if (first >= 128 || second >= 128) fail();
    if (kind !== 0x80 && kind !== 0x90) continue;
    const key = (status & 0x0f) * 128 + first;
    if (kind === 0x90 && second !== 0) {
      const queue = active.get(key) ?? [];
      queue.push({ start: time, velocity: second });
      active.set(key, queue);
    } else {
      const queue = active.get(key);
      const start = queue?.shift();
      if (!start) throw new Error("The chord MIDI could not be read.");
      notes.push({
        note: `${names[first % 12]}${Math.floor(first / 12) - 1}`, midiNote: first,
        startBeat: start.start / division, durationBeats: (time - start.start) / division, velocity: start.velocity,
      });
      if (!queue?.length) active.delete(key);
    }
  }
  if (active.size) fail();
  return notes;
}

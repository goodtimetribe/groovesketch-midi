import type { GenerationPackage, NoteData } from "./types";
import { defaultRoleAssignments, drumTrackForNote, hardwareTracks, melodicTrackIds, type HardwareTrackId, type MelodicTrackId, type MusicalRole, type RgbColor } from "./hardwareTracks";

export type TrackContent = { role: "bass" | "chords" | "lead" | "pad" | null; notes: NoteData[] };
export type MelodicContent = Record<MelodicTrackId, TrackContent>;

export type TrackViewModel = {
  id: string;
  name: string;
  visible: boolean;
  notes: NoteData[];
  indicator: string;
} & ({ kind: "track"; hardwareTrackId: HardwareTrackId; role: MusicalRole }
  | { kind: "drumGroup" });

const drumIndicator = `linear-gradient(to bottom, rgb(${hardwareTracks.drum1.color.join(", ")}) 0 25%, rgb(${hardwareTracks.drum2.color.join(", ")}) 25% 50%, rgb(${hardwareTracks.drum3.color.join(", ")}) 50% 75%, rgb(${hardwareTracks.drum4.color.join(", ")}) 75% 100%)`;

const trackName = (id: MelodicTrackId) =>
  id === "synth1" ? "Synth1" : id === "synth2" ? "Synth2" : id === "midi1" ? "Midi1" : "Midi2";
const roleName = (role: MusicalRole) =>
  role === "lead" ? "Lead" : role === "bass" ? "Bass" : role === "chords" ? "Chords" : role === "pad" ? "Pad" : role;

export function createTracks(pkg: GenerationPackage, chordNotes: NoteData[], visibility: Record<string, boolean>, drumNotes?: NoteData[], content?: MelodicContent): TrackViewModel[] {
  if (content) return [
    ...melodicTrackIds.map((id): TrackViewModel => ({
      id, name: `${trackName(id)}${content[id].role ? ` • ${roleName(content[id].role)}` : ""}`,
      kind: "track", hardwareTrackId: id, role: content[id].role ?? "custom",
      visible: visibility[id] ?? true, notes: content[id].notes, indicator: `rgb(${hardwareTracks[id].color.join(", ")})`,
    })),
    { id: "drums", name: "Drums • Pattern", kind: "drumGroup", visible: visibility.drums ?? true,
      notes: drumNotes ?? [], indicator: drumIndicator },
  ];
  return [
    { id: "bass", name: "Synth1 • Bass", kind: "track", hardwareTrackId: "synth1", role: defaultRoleAssignments.synth1, visible: visibility.bass ?? true, notes: pkg.notes ?? [], indicator: `rgb(${hardwareTracks.synth1.color.join(", ")})` },
    { id: "chords", name: "Synth2 • Chords", kind: "track", hardwareTrackId: "synth2", role: defaultRoleAssignments.synth2, visible: visibility.chords ?? true, notes: chordNotes, indicator: `rgb(${hardwareTracks.synth2.color.join(", ")})` },
    ...(drumNotes ? [{
      id: "drums", name: "Drums • Pattern", kind: "drumGroup" as const, visible: visibility.drums ?? true, notes: drumNotes,
      indicator: drumIndicator,
    }] : []),
  ];
}

export function trackNoteColor(track: TrackViewModel, note: NoteData): RgbColor {
  const id = track.kind === "drumGroup" ? drumTrackForNote(note.midiNote) : track.hardwareTrackId;
  return hardwareTracks[id].color;
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

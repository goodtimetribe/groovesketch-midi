import type { NoteData, Section } from "./types";

export interface DrumPattern {
  id: string;
  name: string;
  description: string;
  bars: number;
  notes: NoteData[];
}

function hits(note: string, midiNote: number, steps: [number, number][]): NoteData[] {
  return steps.map(([startBeat, velocity]) => ({ note, midiNote, startBeat, durationBeats: 0.25, velocity }));
}

export const drumPatterns: DrumPattern[] = [
  {
    id: "four-on-the-floor", name: "Four on the floor", bars: 1,
    description: "Straight kick, backbeat snare, and offbeat closed hats.",
    notes: [
      { note: "C2", midiNote: 36, startBeat: 0, durationBeats: 0.25, velocity: 110 },
      { note: "C2", midiNote: 36, startBeat: 1, durationBeats: 0.25, velocity: 110 },
      { note: "C2", midiNote: 36, startBeat: 2, durationBeats: 0.25, velocity: 110 },
      { note: "C2", midiNote: 36, startBeat: 3, durationBeats: 0.25, velocity: 110 },
      { note: "D2", midiNote: 38, startBeat: 1, durationBeats: 0.25, velocity: 100 },
      { note: "D2", midiNote: 38, startBeat: 3, durationBeats: 0.25, velocity: 100 },
      { note: "F#2", midiNote: 42, startBeat: 0.5, durationBeats: 0.25, velocity: 75 },
      { note: "F#2", midiNote: 42, startBeat: 1.5, durationBeats: 0.25, velocity: 75 },
      { note: "F#2", midiNote: 42, startBeat: 2.5, durationBeats: 0.25, velocity: 75 },
      { note: "F#2", midiNote: 42, startBeat: 3.5, durationBeats: 0.25, velocity: 75 },
    ],
  },
  {
    id: "half-time", name: "Half time", bars: 2,
    description: "A spacious half-time kick and snare groove.",
    notes: [
      { note: "C2", midiNote: 36, startBeat: 0, durationBeats: 0.25, velocity: 110 },
      { note: "D2", midiNote: 38, startBeat: 2, durationBeats: 0.25, velocity: 100 },
      { note: "C2", midiNote: 36, startBeat: 4, durationBeats: 0.25, velocity: 110 },
      { note: "C2", midiNote: 36, startBeat: 5.5, durationBeats: 0.25, velocity: 90 },
      { note: "D2", midiNote: 38, startBeat: 6, durationBeats: 0.25, velocity: 100 },
    ],
  },
  {
    id: "rock-backbeat", name: "Rock - Straight Backbeat", bars: 1,
    description: "Driving rock backbeat with eighth-note hats and tambourine accents on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 116], [2, 110], [2.5, 94], [3.75, 88]]),
      ...hits("D2", 38, [[1, 112], [3, 116]]),
      ...hits("F#2", 42, [[0, 68], [0.5, 74], [1, 68], [1.5, 76], [2, 68], [2.5, 78], [3, 70], [3.5, 80]]),
      ...hits("F#3", 54, [[0, 62], [1, 76], [2, 62], [3, 80]]),
    ],
  },
  {
    id: "rock-half-time", name: "Rock - Heavy Half Time", bars: 2,
    description: "Heavy two-bar rock groove with a half-time snare and cowbell hits on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 120], [1.75, 92], [4, 120], [5.5, 96], [7.5, 90]]),
      ...hits("D2", 38, [[2, 118], [6, 122]]),
      ...hits("F#2", 42, [[0, 64], [1, 72], [2, 64], [3, 76], [4, 64], [5, 72], [6, 64], [7, 78]]),
      ...hits("G#3", 56, [[1.5, 72], [3.5, 66], [5.75, 78]]),
    ],
  },
  {
    id: "jazz-swing", name: "Jazz - Swing Ride", bars: 2,
    description: "Swinging ride-like hats and syncopated kick and snare, with shaker brush accents on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 82], [2.75, 70], [4, 84], [6.5, 72]]),
      ...hits("D2", 38, [[1, 66], [3, 76], [5, 68], [7, 78]]),
      ...hits("F#2", 42, [[0, 70], [0.75, 58], [1, 68], [1.75, 60], [2, 70], [2.75, 58], [3, 68], [3.75, 62], [4, 70], [4.75, 58], [5, 68], [5.75, 60], [6, 70], [6.75, 58], [7, 68], [7.75, 62]]),
      ...hits("A#4", 70, [[1.25, 46], [3.25, 52], [5.25, 46], [7.25, 54]]),
    ],
  },
  {
    id: "jazz-shuffle", name: "Jazz - Shuffle Brushes", bars: 1,
    description: "Loose shuffle hats, soft backbeats, and brushed clave textures on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 84], [2.5, 68], [3.75, 62]]),
      ...hits("D2", 38, [[1, 72], [3, 80]]),
      ...hits("F#2", 42, [[0, 60], [0.75, 50], [1, 62], [1.75, 54], [2, 60], [2.75, 50], [3, 64], [3.75, 56]]),
      ...hits("D#5", 75, [[0.25, 42], [1.5, 48], [2.25, 42], [3.5, 50]]),
    ],
  },
  {
    id: "reggae-one-drop", name: "Reggae - One Drop", bars: 1,
    description: "A one-drop backbeat with offbeat hats and warm conga accents on Drum 4.",
    notes: [
      ...hits("C2", 36, [[2, 112], [3.75, 70]]),
      ...hits("D2", 38, [[2, 108]]),
      ...hits("F#2", 42, [[0.5, 72], [1.5, 78], [2.5, 72], [3.5, 82]]),
      ...hits("D#4", 63, [[0.75, 62], [1.75, 74], [2.75, 64], [3.25, 78]]),
    ],
  },
  {
    id: "reggae-steppers", name: "Reggae - Steppers", bars: 1,
    description: "Steady quarter-note kicks, skanking hats, and offbeat bongo accents on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 110], [1, 106], [2, 110], [3, 106]]),
      ...hits("D2", 38, [[1, 92], [3, 96]]),
      ...hits("F#2", 42, [[0.5, 78], [1.5, 82], [2.5, 78], [3.5, 84]]),
      ...hits("C4", 60, [[0.75, 66], [1.75, 78], [2.75, 66], [3.75, 80]]),
    ],
  },
  {
    id: "funk-pocket", name: "Funk - Syncopated Pocket", bars: 2,
    description: "A syncopated funk pocket with crisp hats and cowbell answers on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 114], [1.5, 90], [2.75, 102], [4, 114], [5.75, 94], [6.5, 104]]),
      ...hits("D2", 38, [[1, 104], [3, 110], [5, 104], [7, 112]]),
      ...hits("F#2", 42, [[0, 62], [0.5, 72], [1, 64], [1.5, 76], [2, 62], [2.5, 72], [3, 64], [3.5, 78], [4, 62], [4.5, 72], [5, 64], [5.5, 76], [6, 62], [6.5, 72], [7, 64], [7.5, 78]]),
      ...hits("G#3", 56, [[0.75, 64], [2.5, 78], [4.75, 64], [7.25, 82]]),
    ],
  },
  {
    id: "blues-shuffle", name: "Blues - Slow Shuffle", bars: 1,
    description: "A laid-back blues shuffle with a strong backbeat and claves on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 108], [2, 102], [3.75, 72]]),
      ...hits("D2", 38, [[1, 98], [3, 104]]),
      ...hits("F#2", 42, [[0, 62], [0.75, 70], [1, 62], [1.75, 72], [2, 62], [2.75, 70], [3, 64], [3.75, 74]]),
      ...hits("D#5", 75, [[1.5, 58], [3.5, 68]]),
    ],
  },
  {
    id: "house-shaker", name: "House - Shaker Groove", bars: 1,
    description: "Four-on-the-floor with offbeat hats and a syncopated shaker on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 112], [1, 108], [2, 112], [3, 108]]),
      ...hits("D2", 38, [[1, 100], [3, 104]]),
      ...hits("F#2", 42, [[0.5, 78], [1.5, 82], [2.5, 78], [3.5, 84]]),
      ...hits("A#4", 70, [[0.25, 55], [0.75, 70], [1.25, 58], [1.75, 74], [2.25, 55], [2.75, 70], [3.25, 58], [3.75, 78]]),
    ],
  },
  {
    id: "techno-cowbell", name: "Techno - Warehouse Cowbell", bars: 1,
    description: "Driving kicks and offbeat hats with sparse cowbell accents on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 118], [1, 115], [2, 118], [3, 115]]),
      ...hits("D2", 38, [[1, 94], [3, 98]]),
      ...hits("F#2", 42, [[0.5, 72], [1.5, 80], [2.5, 72], [3.5, 84]]),
      ...hits("G#3", 56, [[0.75, 78], [2.25, 88], [3.75, 78]]),
    ],
  },
  {
    id: "trance-tambourine", name: "Trance - Uplift Tambourine", bars: 1,
    description: "Steady kicks, offbeat hats, and bright tambourine accents on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 114], [1, 110], [2, 114], [3, 110]]),
      ...hits("D2", 38, [[1, 102], [3, 106]]),
      ...hits("F#2", 42, [[0.5, 82], [1.5, 86], [2.5, 82], [3.5, 86]]),
      ...hits("F#3", 54, [[0.75, 64], [1.75, 72], [2.75, 64], [3.75, 76]]),
    ],
  },
  {
    id: "electro-claves", name: "Electro - Clave Syncopation", bars: 2,
    description: "Syncopated electro kicks and backbeats with a clave rhythm on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 114], [1.75, 95], [2.5, 108], [4, 114], [5.5, 98], [6.75, 108]]),
      ...hits("D2", 38, [[1, 104], [3, 108], [5, 104], [7, 108]]),
      ...hits("F#2", 42, [[0.5, 73], [1.5, 80], [2.5, 73], [3.5, 82], [4.5, 73], [5.5, 80], [6.5, 73], [7.5, 82]]),
      ...hits("D#5", 75, [[0, 82], [1.5, 72], [2.75, 78], [5, 82], [6, 74]]),
    ],
  },
  {
    id: "breakbeat-bongo", name: "Breakbeat - Bongo Break", bars: 2,
    description: "Broken kicks and snares with closed hats and bongo accents on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 112], [1.5, 92], [2.75, 102], [4, 112], [5.75, 94], [6.5, 105]]),
      ...hits("D2", 38, [[1, 104], [3, 110], [5, 104], [7, 110], [7.75, 65]]),
      ...hits("F#2", 42, [[0.5, 76], [1.5, 80], [2.5, 76], [3.5, 82], [4.5, 76], [5.5, 80], [6.5, 76], [7.5, 82]]),
      ...hits("C4", 60, [[0.75, 70], [2.25, 82], [4.75, 70], [6.25, 82]]),
    ],
  },
  {
    id: "synthwave-conga", name: "Synthwave - Neon Conga", bars: 2,
    description: "A retro backbeat with restrained hats and conga accents on Drum 4.",
    notes: [
      ...hits("C2", 36, [[0, 110], [2, 105], [2.75, 88], [4, 110], [6, 105], [7.5, 90]]),
      ...hits("D2", 38, [[1, 108], [3, 112], [5, 108], [7, 112]]),
      ...hits("F#2", 42, [[0.5, 68], [1.5, 72], [2.5, 68], [3.5, 74], [4.5, 68], [5.5, 72], [6.5, 68], [7.5, 74]]),
      ...hits("D#4", 63, [[1.75, 70], [3.5, 78], [5.75, 70], [7.25, 80]]),
    ],
  },
];

export function arrangeDrums(pattern: DrumPattern, sections: Section[]): NoteData[] {
  const notes: NoteData[] = [];
  let sectionStart = 0;
  const loopBeats = pattern.bars * 4;
  for (const section of sections) {
    const sectionEnd = sectionStart + section.bars * 4;
    for (let loop = sectionStart; loop < sectionEnd; loop += loopBeats) {
      for (const note of pattern.notes) {
        const startBeat = loop + note.startBeat;
        if (startBeat >= sectionEnd) continue;
        notes.push({ ...note, startBeat, durationBeats: Math.min(note.durationBeats, sectionEnd - startBeat) });
      }
    }
    sectionStart = sectionEnd;
  }
  return notes;
}

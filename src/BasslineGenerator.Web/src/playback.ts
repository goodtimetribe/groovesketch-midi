import type { GenerationPackage, NoteData } from "./types";
import { MidiInstrument } from "./midi";
import { mapCircuitTracksDrumNote } from "./circuitTracksDrums";
import { drumTrackForNote, hardwareTrackIds, hardwareTracks, type DrumTrackId, type HardwareTrackId } from "./hardwareTracks";

export type PlaybackState = "stopped" | "playing" | "paused";
type TrackId = HardwareTrackId;
const drumTrackIds: DrumTrackId[] = ["drum1", "drum2", "drum3", "drum4"];
const routingIds = ["synth1", "synth2", "drum1"] as const;
export interface TrackRouting { output: MIDIOutput | null; channel: number }

// The transport owns timing; the instrument only needs a note and an audio time.
export interface PreviewInstrument {
  play(note: NoteData, start: number, duration: number): void;
  silence(): void;
}

class BassInstrument implements PreviewInstrument {
  private voices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();

  constructor(private context: AudioContext, private output: AudioNode) {}

  play(note: NoteData, start: number, duration: number) {
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const voice = { oscillator, gain };
    const attack = Math.min(0.01, duration / 3);
    const release = Math.min(0.04, duration / 3);
    const level = note.velocity / 127 * 0.22;
    oscillator.type = "sawtooth";
    oscillator.frequency.value = 440 * Math.pow(2, (note.midiNote - 69) / 12);
    filter.type = "lowpass";
    filter.frequency.value = 700;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + attack);
    gain.gain.setValueAtTime(level, start + duration - release);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(filter).connect(gain).connect(this.output);
    this.voices.add(voice);
    oscillator.onended = () => {
      oscillator.disconnect(); filter.disconnect(); gain.disconnect();
      this.voices.delete(voice);
    };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  silence() {
    for (const { oscillator, gain } of this.voices) {
      gain.disconnect();
      oscillator.stop();
    }
    this.voices.clear();
  }
}

export class PlaybackTransport {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private instruments: Partial<Record<TrackId, PreviewInstrument>> = {};
  private notes: { track: TrackId; note: NoteData }[] = [];
  private secondsPerBeat = 0;
  private duration = 0;
  private offset = 0;
  private startedAt = 0;
  private nextNote = 0;
  private nextCycle = 0;
  private looping = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private revision = 0;
  private volume = 75;
  private routes: Record<TrackId, TrackRouting> = {
    synth1: { output: null, channel: hardwareTracks.synth1.defaultChannel },
    synth2: { output: null, channel: hardwareTracks.synth2.defaultChannel },
    midi1: { output: null, channel: hardwareTracks.midi1.defaultChannel },
    midi2: { output: null, channel: hardwareTracks.midi2.defaultChannel },
    drum1: { output: null, channel: hardwareTracks.drum1.defaultChannel },
    drum2: { output: null, channel: hardwareTracks.drum2.defaultChannel },
    drum3: { output: null, channel: hardwareTracks.drum3.defaultChannel },
    drum4: { output: null, channel: hardwareTracks.drum4.defaultChannel },
  };
  state: PlaybackState = "stopped";

  constructor(private onStateChange: (state: PlaybackState) => void, private onError: (message: string) => void = () => {}) {}

  setDestination(output: MIDIOutput | null) {
    this.setRouting(output, this.routes.synth1.channel);
  }

  setRouting(output: MIDIOutput | null, channel: number) {
    this.setTrackRoutings({ ...this.routes, synth1: { output, channel } });
  }

  setTrackRoutings(routes: Record<"synth1" | "synth2", TrackRouting> & { drum1?: TrackRouting }) {
    const next = { synth1: routes.synth1, synth2: routes.synth2, drum1: routes.drum1 ?? this.routes.drum1 };
    for (const route of Object.values(next)) {
      if (!Number.isInteger(route.channel) || route.channel < 0 || route.channel > 15)
        throw new RangeError("MIDI channel must be between 0 and 15.");
    }
    if (routingIds.some((id, i) => routingIds.slice(i + 1).some((other) =>
      next[id].output && next[id].output === next[other].output && next[id].channel === next[other].channel)))
      throw new Error("Tracks must use different channels on the same MIDI output.");
    if (routingIds.every((id) =>
      this.routes[id].output === next[id].output && this.routes[id].channel === next[id].channel)) return;
    const playing = this.state === "playing";
    if (playing) this.offset = this.position();
    this.clearScheduled();
    this.routes = {
      ...this.routes,
      synth1: { ...next.synth1 }, synth2: { ...next.synth2 },
      drum1: { ...next.drum1 }, drum2: { ...next.drum1 }, drum3: { ...next.drum1 }, drum4: { ...next.drum1 },
    };
    this.instruments = {};
    if (playing && this.context) {
      try {
        this.beginPlayback();
      } catch {
        this.clearScheduled();
        this.setState("paused");
        this.onError("Playback failed. Check the output devices and browser audio settings.");
      }
    }
  }

  setMidiChannel(channel: number) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) throw new RangeError("MIDI channel must be between 0 and 15.");
    if ((["synth2", "drum1"] as const).some((id) => {
      const route = this.routes[id];
      return this.routes.synth1.output && this.routes.synth1.output === route.output && channel === route.channel;
    })) throw new Error("Tracks must use different channels on the same MIDI output.");
    this.routes.synth1.channel = channel;
    const instrument = this.instruments.synth1;
    if (instrument instanceof MidiInstrument) instrument.setChannel(channel);
  }

  load(pkg: GenerationPackage, chordNotes: NoteData[] = [], drumNotes: NoteData[] = []) {
    this.stop();
    this.notes = [
      ...(pkg.notes ?? []).map((note) => ({ track: "synth1" as const, note })),
      ...chordNotes.map((note) => ({ track: "synth2" as const, note })),
      ...drumNotes.map((note) => ({ track: drumTrackForNote(note.midiNote), note })),
    ].sort((a, b) => a.note.startBeat - b.note.startBeat);
    this.secondsPerBeat = 60 / pkg.effectiveConfiguration.bpm;
    const bars = pkg.effectiveConfiguration.sections.reduce((sum, section) => sum + section.bars, 0);
    const lastNote = this.notes.reduce((end, { note }) => Math.max(end, note.startBeat + note.durationBeats), 0);
    this.duration = Math.max(bars * 4, lastNote) * this.secondsPerBeat;
  }

  setDrumNotes(drumNotes: NoteData[]) {
    const playing = this.state === "playing";
    if (playing) this.offset = this.position();
    this.clearScheduled();
    this.notes = [
      ...this.notes.filter(({ track }) => !drumTrackIds.some((id) => id === track)),
      ...drumNotes.map((note) => ({ track: drumTrackForNote(note.midiNote), note })),
    ].sort((a, b) => a.note.startBeat - b.note.startBeat);
    if (playing && this.context) {
      try {
        this.beginPlayback();
      } catch {
        this.clearScheduled();
        this.setState("paused");
        this.onError("Playback failed. Check the output devices and browser audio settings.");
      }
    }
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.output && this.context) this.output.gain.setValueAtTime(volume / 100, this.context.currentTime);
  }

  setLoop(enabled: boolean) {
    if (this.looping === enabled) return;
    if (!enabled && this.state === "playing") {
      this.offset = this.position();
      this.clearScheduled();
      this.looping = false;
      try {
        this.beginPlayback();
      } catch {
        this.clearScheduled();
        this.setState("paused");
        this.onError("Playback failed. Check the output devices and browser audio settings.");
      }
      return;
    }
    this.looping = enabled;
    if (enabled && this.state === "playing") this.schedule();
  }

  get beat() {
    if (!this.secondsPerBeat) return 0;
    return this.position() / this.secondsPerBeat;
  }

  private position() {
    if (this.state !== "playing" || !this.context) return this.offset;
    const elapsed = this.offset + this.context.currentTime - this.startedAt;
    return this.looping && this.duration ? elapsed % this.duration : Math.min(this.duration, elapsed);
  }

  async play() {
    if (this.state === "playing" || !this.duration) return;
    const revision = ++this.revision;
    if (!this.context) {
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.gain.value = this.volume / 100;
      this.output.connect(this.context.destination);
    }
    await this.context.resume();
    if (revision !== this.revision) return;
    if (Object.values(this.routes).some(({ output }) => output && output.state !== "connected")) {
      throw new Error("MIDI output disconnected.");
    }
    try {
      this.beginPlayback();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  private beginPlayback() {
    if (!this.context || !this.output) throw new Error("Audio context is unavailable.");
    if (Object.values(this.routes).some(({ output }) => output && output.state !== "connected"))
      throw new Error("MIDI output disconnected.");
    this.instruments = {};
    const activeTracks = new Set<HardwareTrackId>([
      ...routingIds,
      ...this.notes.map(({ track }) => track).filter((track) => !drumTrackIds.some((id) => id === track)),
    ]);
    for (const id of activeTracks) {
      const { output, channel } = this.routes[id];
      this.instruments[id] = output
        ? new MidiInstrument(output, this.context, channel)
        : new BassInstrument(this.context, this.output);
    }
    for (const id of drumTrackIds) this.instruments[id] = this.instruments.drum1;
    this.startedAt = this.context.currentTime;
    this.nextNote = 0;
    this.nextCycle = 0;
    while (this.nextNote < this.notes.length && this.notes[this.nextNote].note.startBeat * this.secondsPerBeat < this.offset) {
      const { track, note } = this.notes[this.nextNote++];
      const remaining = (note.startBeat + note.durationBeats) * this.secondsPerBeat - this.offset;
      if (remaining > 0) this.instruments[track]!.play(this.playbackNote(track, note), this.startedAt, remaining);
    }
    this.setState("playing");
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  pause() {
    if (this.state !== "playing") {
      ++this.revision;
      return;
    }
    this.offset = this.position();
    this.clearScheduled();
    this.setState("paused");
  }

  stop() {
    this.clearScheduled();
    this.offset = 0;
    this.setState("stopped");
  }

  async restart() {
    this.stop();
    await this.play();
  }

  dispose() {
    this.stop();
    if (this.context) void this.context.close();
    this.context = null;
  }

  private clearScheduled() {
    ++this.revision;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const outputs = new Set(hardwareTrackIds
      .filter((id) => this.instruments[id] instanceof MidiInstrument)
      .map((id) => this.routes[id].output)
      .filter((output): output is MIDIOutput => output !== null));
    for (const output of outputs) {
      try { output.clear(); }
      catch { this.onError("MIDI output could not be cleared. Check the device connection."); }
    }
    for (const instrument of new Set(Object.values(this.instruments))) {
      try {
        if (instrument instanceof MidiInstrument) instrument.silence(false);
        else instrument.silence();
      } catch {
        this.onError(instrument instanceof MidiInstrument
          ? "MIDI output could not be silenced. Check the device connection."
          : "Audio preview could not be silenced.");
      }
    }
    this.instruments = {};
  }

  private setState(state: PlaybackState) {
    this.state = state;
    this.onStateChange(state);
  }

  private schedule() {
    if (!this.context || this.state !== "playing") return;
    try {
      this.scheduleNotes();
    } catch {
      this.pause();
      this.onError(Object.values(this.routes).some(({ output }) => output)
        ? "MIDI playback failed. Check the output device and try again."
        : "Audio preview failed. Check your browser audio settings and try again.");
    }
  }

  private scheduleNotes() {
    if (!this.context) return;
    const elapsed = this.offset + this.context.currentTime - this.startedAt;
    if (!this.looping && elapsed >= this.duration) {
      this.stop();
      return;
    }
    if (!this.notes.length) return;
    if (this.looping && this.nextCycle < Math.floor(elapsed / this.duration)) {
      this.nextCycle = Math.floor(elapsed / this.duration);
      this.nextNote = 0;
    }
    const horizon = elapsed + 0.15;
    while (true) {
      if (this.nextNote >= this.notes.length) {
        if (!this.looping || (this.nextCycle + 1) * this.duration >= horizon) return;
        this.nextCycle++;
        this.nextNote = 0;
      }
      const noteStart = this.nextCycle * this.duration + this.notes[this.nextNote].note.startBeat * this.secondsPerBeat;
      if (noteStart >= horizon) return;
      const { track, note } = this.notes[this.nextNote++];
      const remaining = noteStart + note.durationBeats * this.secondsPerBeat - Math.max(elapsed, noteStart);
      if (remaining > 0) this.instruments[track]!.play(this.playbackNote(track, note),
        this.context.currentTime + Math.max(0, noteStart - elapsed), remaining);
    }
  }

  private playbackNote(track: TrackId, note: NoteData): NoteData {
    return drumTrackIds.some((id) => id === track) ? mapCircuitTracksDrumNote(note, this.routes[track].output?.name) : note;
  }
}

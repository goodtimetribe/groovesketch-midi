import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createAllTracksMidi } from "./allTracksMidi";
import PianoRoll, { type FocusTrack, type GeneratorType } from "./PianoRoll";
import { api, download } from "./api";
import { createCircuitTracksDrumMidi } from "./circuitTracksDrums";
import { arrangeDrums, drumPatterns } from "./drumPatterns";
import { hardwareTracks, melodicTrackIds, type MelodicTrackId } from "./hardwareTracks";
import { defaultHardwarePatches, isHardwarePatch, type HardwarePatch, type HardwarePatches } from "./hardwarePatches";
import { MidiDevices } from "./midi";
import { melodySeed } from "./melodySeed";
import { PlaybackTransport, type PlaybackState } from "./playback";
import { validateMelodyNotes, type Sketch } from "./sketch";
import { readChordNotes, type MelodicContent } from "./trackView";
import { browserSounds, defaultTrackSounds, isBrowserSoundId, type BrowserSoundId, type TrackSounds } from "./trackSounds";
import {
  defaultRoutingProfiles, deleteProfile, loadRoutingProfiles, putProfile, resolveOutput, saveRoutingProfiles,
  routingProfilesKey, type Routing, type RoutingProfiles,
} from "./routingProfiles";
import type { GenerationPackage, NoteData } from "./types";

export interface PreviewHandle { stop(): void }

const volumeKey = "bassline-preview-volume";
const channelKey = "bassline-preview-midi-channel";
const soundsKey = "bassline-preview-track-sounds";
const patchesKey = "bassline-preview-hardware-patches";
const soundTrackNames: Record<MelodicTrackId, string> = { synth1: "Synth1", synth2: "Synth2", midi1: "Midi1", midi2: "Midi2" };

function initialTrackSounds(): { sounds: TrackSounds; error: boolean } {
  try {
    const saved = sessionStorage.getItem(soundsKey);
    if (saved === null) return { sounds: { ...defaultTrackSounds }, error: false };
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid track sounds.");
    if (!("synth1" in value && "synth2" in value && "midi1" in value && "midi2" in value) ||
      !isBrowserSoundId(value.synth1) || !isBrowserSoundId(value.synth2) ||
      !isBrowserSoundId(value.midi1) || !isBrowserSoundId(value.midi2)) throw new Error("Invalid track sounds.");
    return { sounds: { synth1: value.synth1, synth2: value.synth2, midi1: value.midi1, midi2: value.midi2 }, error: false };
  } catch {
    return { sounds: { ...defaultTrackSounds }, error: true };
  }
}

function initialHardwarePatches(): { patches: HardwarePatches; error: boolean } {
  try {
    const saved = sessionStorage.getItem(patchesKey);
    if (saved === null) return { patches: { ...defaultHardwarePatches }, error: false };
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      !("synth1" in value && "synth2" in value && "midi1" in value && "midi2" in value) ||
      !isHardwarePatch(value.synth1) || !isHardwarePatch(value.synth2) ||
      !isHardwarePatch(value.midi1) || !isHardwarePatch(value.midi2)) throw new Error("Invalid hardware patches.");
    return { patches: { synth1: value.synth1, synth2: value.synth2, midi1: value.midi1, midi2: value.midi2 }, error: false };
  } catch {
    return { patches: { ...defaultHardwarePatches }, error: true };
  }
}

function initialContent(pkg: GenerationPackage): MelodicContent {
  return {
    synth1: { role: "bass", notes: pkg.notes ?? [] },
    synth2: { role: "chords", notes: [] },
    midi1: { role: null, notes: [] },
    midi2: { role: null, notes: [] },
  };
}

function initialProfiles() {
  try {
    const data = loadRoutingProfiles(localStorage);
    let channelError = false;
    if (localStorage.getItem(routingProfilesKey) === null) {
      try {
        const saved = sessionStorage.getItem(channelKey);
        const channel = saved === null ? hardwareTracks.synth1.defaultChannel : Number(saved);
        if (saved !== "" && Number.isInteger(channel) && channel >= 0 && channel <= 15)
          data.profiles[0].routing.channel = channel;
      } catch { channelError = true; }
    }
    return { data, error: "", channelError };
  }
  catch { return { data: defaultRoutingProfiles(), error: "Routing profiles could not be loaded. Saved profiles have not been changed.", channelError: false }; }
}

const Preview = forwardRef<PreviewHandle, {
  pkg: GenerationPackage; disabled: boolean; playbackPane?: HTMLElement | null; generatorPane?: HTMLElement | null;
  patternPane?: HTMLElement | null; drumDownloadPane?: HTMLElement | null; allDownloadPane?: HTMLElement | null;
  onPreviewDownload?: () => void;
  sketch?: Sketch | null; sketchBusy?: boolean;
  patternSelection?: { id: string; onChange: (id: string) => void };
  onGeneratingChange?: (generating: boolean) => void;
}>(function Preview({ pkg, disabled, playbackPane, generatorPane, patternPane, drumDownloadPane, allDownloadPane, onPreviewDownload, sketch, sketchBusy, patternSelection, onGeneratingChange }, ref) {
  const [initial] = useState(initialProfiles);
  const [profiles, setProfiles] = useState(initial.data);
  const initialProfile = initial.data.profiles.find((p) => p.id === initial.data.activeId);
  const [routing, setRouting] = useState<Routing>(() => initialProfile?.routing ?? defaultRoutingProfiles().profiles[0].routing);
  const [chordRouting, setChordRouting] = useState<Routing>(() => initialProfile?.chordRouting ?? defaultRoutingProfiles().profiles[0].chordRouting);
  const [drumRouting, setDrumRouting] = useState<Routing>(() => initialProfile?.drumRouting ?? defaultRoutingProfiles().profiles[0].drumRouting);
  const [midi1Routing, setMidi1Routing] = useState<Routing>(() => ({ destination: { kind: "browser" }, channel: hardwareTracks.midi1.defaultChannel, instrument: "bass" }));
  const [midi2Routing, setMidi2Routing] = useState<Routing>(() => ({ destination: { kind: "browser" }, channel: hardwareTracks.midi2.defaultChannel, instrument: "bass" }));
  const [localPatternId, setLocalPatternId] = useState("");
  const patternId = patternSelection?.id ?? localPatternId;
  const setPatternId = patternSelection?.onChange ?? setLocalPatternId;
  const [appliedPattern, setAppliedPattern] = useState(() => ({ pkg, id: sketch?.pkg === pkg ? sketch.patternId : "" }));
  const appliedPatternId = appliedPattern.pkg === pkg ? appliedPattern.id : sketch?.pkg === pkg ? sketch.patternId : appliedPattern.id;
  const setAppliedPatternId = (id: string) => setAppliedPattern({ pkg, id });
  const [content, setContent] = useState(() => ({ pkg, tracks: sketch?.pkg === pkg ? sketch.tracks : initialContent(pkg) }));
  const tracks = useMemo(() => content.pkg === pkg ? content.tracks : sketch?.pkg === pkg ? sketch.tracks : initialContent(pkg), [content, pkg, sketch]);
  const [generating, setGenerating] = useState(false);
  const generationRevision = useRef(0);
  const selectedPattern = drumPatterns.find((item) => item.id === patternId);
  const drumNotes = useMemo(() => {
    if (sketch?.pkg === pkg && sketch.patternId === appliedPatternId) return sketch.drumNotes;
    const pattern = drumPatterns.find((item) => item.id === appliedPatternId);
    return pattern ? arrangeDrums(pattern, pkg.effectiveConfiguration.sections) : [];
  }, [appliedPatternId, pkg, sketch]);
  const drumNotesRef = useRef(drumNotes);
  drumNotesRef.current = drumNotes;
  const [profileName, setProfileName] = useState(initialProfile?.name ?? "");
  const [profileError, setProfileError] = useState(initial.error);
  const [state, setState] = useState<PlaybackState>("stopped");
  const [looping, setLooping] = useState(true);
  const [chords, setChords] = useState<{ pkg: GenerationPackage; notes: NoteData[]; error: string } | null>(
    () => sketch?.pkg === pkg ? { pkg, notes: sketch.chordNotes, error: "" } : null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [initialSounds] = useState(initialTrackSounds);
  const [sounds, setSounds] = useState(initialSounds.sounds);
  const [soundStorageError, setSoundStorageError] = useState(initialSounds.error);
  const [initialPatches] = useState(initialHardwarePatches);
  const [patches, setPatches] = useState(initialPatches.patches);
  const [patchStorageError, setPatchStorageError] = useState(initialPatches.error);
  const [outputs, setOutputs] = useState<MIDIOutput[]>([]);
  const [discovered, setDiscovered] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const devices = useRef<MidiDevices | null>(null);
  const refreshPending = useRef<MidiDevices | null>(null);
  const [volume, setVolume] = useState(() => {
    try {
      const saved = sessionStorage.getItem(volumeKey);
      const value = saved === null ? 75 : Number(saved);
      return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 75;
    } catch { return 75; }
  });
  const [transport] = useState(() => {
    const instance = new PlaybackTransport(setState, setError);
    instance.setLoop(true);
    return instance;
  });
  const output = resolveOutput(routing.destination, outputs);
  const unavailable = routing.destination.kind === "midi" && !output;
  const chordOutput = resolveOutput(chordRouting.destination, outputs);
  const chordUnavailable = chordRouting.destination.kind === "midi" && !chordOutput;
  const drumOutput = resolveOutput(drumRouting.destination, outputs);
  const drumUnavailable = drumRouting.destination.kind === "midi" && !drumOutput;
  const midi1Output = resolveOutput(midi1Routing.destination, outputs);
  const midi1Unavailable = midi1Routing.destination.kind === "midi" && !midi1Output;
  const midi2Output = resolveOutput(midi2Routing.destination, outputs);
  const midi2Unavailable = midi2Routing.destination.kind === "midi" && !midi2Output;
  const routes = [{ output, channel: routing.channel }, { output: chordOutput, channel: chordRouting.channel },
    { output: drumOutput, channel: drumRouting.channel }, { output: midi1Output, channel: midi1Routing.channel },
    { output: midi2Output, channel: midi2Routing.channel }];
  const collision = routes.some((route, index) => routes.slice(index + 1).some((other) =>
    route.output && route.output === other.output && route.channel === other.channel));
  const readyChords = chords?.pkg === pkg ? chords : sketch?.pkg === pkg ? { pkg, notes: sketch.chordNotes, error: "" } : null;

  useImperativeHandle(ref, () => ({ stop: () => transport.stop() }), [transport]);
  useEffect(() => {
    setContent({ pkg, tracks: sketch?.pkg === pkg ? sketch.tracks : initialContent(pkg) });
    setAppliedPattern((current) => current.pkg === pkg ? current : { pkg, id: sketch?.pkg === pkg ? sketch.patternId : current.id });
    setGenerating(false);
    return () => { generationRevision.current++; };
  }, [pkg, sketch]);
  useEffect(() => { onGeneratingChange?.(generating); }, [generating, onGeneratingChange]);
  useEffect(() => {
    if (sketch?.pkg === pkg) {
      setChords({ pkg, notes: sketch.chordNotes, error: "" });
      return;
    }
    let cancelled = false;
    setChords(null);
    void api.combinedMidi(pkg).then((blob) => blob.arrayBuffer()).then(readChordNotes).then(
      (notes) => {
        if (cancelled) return;
        setContent((current) => current.pkg === pkg
          ? { ...current, tracks: { ...current.tracks, synth2: { role: "chords", notes } } }
          : current);
        setChords({ pkg, notes, error: "" });
      },
      (error: unknown) => {
        if (!cancelled) setChords({ pkg, notes: [], error: error instanceof Error ? error.message : "Chord notes could not be loaded." });
      },
    );
    return () => { cancelled = true; };
  }, [transport, pkg, retry, sketch]);
  useEffect(() => {
    transport.load(pkg, [], drumNotesRef.current, {
      synth1: tracks.synth1.notes, synth2: tracks.synth2.notes,
      midi1: tracks.midi1.notes, midi2: tracks.midi2.notes,
    });
  }, [transport, pkg, tracks]);
  useEffect(() => { transport.setDrumNotes(drumNotes); }, [transport, drumNotes]);
  useEffect(() => () => transport.dispose(), [transport]);
  useEffect(() => { transport.setVolume(volume); }, [transport, volume]);
  useEffect(() => {
    for (const id of melodicTrackIds) transport.setTrackSound(id, sounds[id]);
  }, [transport, sounds]);
  useEffect(() => {
    for (const id of melodicTrackIds) transport.setTrackPatch(id, patches[id]);
  }, [transport, patches]);
  useEffect(() => {
    const manager = new MidiDevices((available) => {
      setOutputs(available);
      setDiscovered(true);
    });
    devices.current = manager;
    return () => { manager.dispose(); devices.current = null; };
  }, []);

  const refreshDevices = useCallback(async () => {
    const manager = devices.current;
    if (!manager || refreshPending.current === manager) return;
    refreshPending.current = manager;
    setRefreshing(true);
    try {
      await manager.refresh();
    } catch (e) {
      if (devices.current === manager)
        setError(e instanceof Error ? e.message : "MIDI devices could not be refreshed.");
    } finally {
      if (refreshPending.current === manager) {
        refreshPending.current = null;
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if ([routing, chordRouting, drumRouting, midi1Routing, midi2Routing].some((route) => route.destination.kind === "midi")) void refreshDevices();
  }, [routing.destination, chordRouting.destination, drumRouting.destination, midi1Routing.destination, midi2Routing.destination, refreshDevices]);
  useEffect(() => {
    if (unavailable || chordUnavailable || drumUnavailable || midi1Unavailable || midi2Unavailable || collision) {
      transport.pause();
      return;
    }
    transport.setTrackRoutings({
      synth1: { output, channel: routing.channel },
      synth2: { output: chordOutput, channel: chordRouting.channel },
      midi1: { output: midi1Output, channel: midi1Routing.channel },
      midi2: { output: midi2Output, channel: midi2Routing.channel },
      drum1: { output: drumOutput, channel: drumRouting.channel },
    });
  }, [transport, output, chordOutput, drumOutput, midi1Output, midi2Output, routing.channel, chordRouting.channel, drumRouting.channel, midi1Routing.channel, midi2Routing.channel, unavailable, chordUnavailable, drumUnavailable, midi1Unavailable, midi2Unavailable, collision]);

  const persist = (next: RoutingProfiles) => {
    setProfiles(next);
    try {
      saveRoutingProfiles(localStorage, next);
      setProfileError("");
    } catch {
      setProfileError("Routing profiles could not be saved in this browser.");
    }
  };
  const selectProfile = (id: string) => {
    const profile = profiles.profiles.find((p) => p.id === id);
    if (!profile) return;
    setRouting(profile.routing);
    setChordRouting(profile.chordRouting);
    setDrumRouting(profile.drumRouting);
    setProfileName(profile.name);
    setError("");
    persist({ ...profiles, activeId: id });
  };
  const saveProfile = (update: boolean) => {
    try {
      const id = update ? profiles.activeId : crypto.randomUUID();
      if (!id) throw new Error("Select a profile to update.");
      const next = putProfile(profiles, { id, name: profileName, routing, chordRouting, drumRouting });
      persist(next);
      setProfileName(next.profiles.find((p) => p.id === id)!.name);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "The profile could not be saved.");
    }
  };
  const removeProfile = () => {
    if (!profiles.activeId) return;
    const next = deleteProfile(profiles, profiles.activeId);
    const selected = next.profiles.find((p) => p.id === next.activeId);
    setRouting(selected?.routing ?? defaultRoutingProfiles().profiles[0].routing);
    setChordRouting(selected?.chordRouting ?? defaultRoutingProfiles().profiles[0].chordRouting);
    setDrumRouting(selected?.drumRouting ?? defaultRoutingProfiles().profiles[0].drumRouting);
    setProfileName(selected?.name ?? "");
    setError("");
    persist(next);
  };
  const changeDestination = (id: string, setTrackRouting: typeof setRouting) => {
    const device = outputs.find((item) => item.id === id);
    if (id && !device) return;
    setTrackRouting((old) => ({ ...old, destination: device
      ? { kind: "midi", deviceId: device.id, deviceName: device.name || null }
      : { kind: "browser" } }));
    setError("");
  };
  const changeVolume = (value: number) => {
    setVolume(value);
    transport.setVolume(value);
    try { sessionStorage.setItem(volumeKey, String(value)); setStorageError(false); }
    catch { setStorageError(true); }
  };
  const downloadCircuitTracksDrums = () => {
    try {
      const bars = pkg.effectiveConfiguration.sections.reduce((sum, section) => sum + section.bars, 0);
      download(createCircuitTracksDrumMidi(drumNotes, pkg.effectiveConfiguration.bpm, bars), "circuit-tracks-drums.mid");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Circuit Tracks drum MIDI could not be created.");
    }
  };
  const downloadAllTracks = () => {
    try {
      const bars = pkg.effectiveConfiguration.sections.reduce((sum, section) => sum + section.bars, 0);
      download(createAllTracksMidi(tracks, drumNotes, pkg.effectiveConfiguration.bpm, bars, patches), "circuit-tracks-sketch.mid");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The all-tracks MIDI file could not be created.");
    }
  };
  const generateTrack = (track: FocusTrack, generator: GeneratorType) => {
    if (generator === "drums") {
      if (track === "drums" && selectedPattern) setAppliedPatternId(selectedPattern.id);
      return;
    }
    if (track === "drums" || generating) return;
    const revision = ++generationRevision.current;
    setGenerating(true);
    setError("");
    const generate = async () => {
      if (generator === "chords") return readChordNotes(await (await api.combinedMidi(pkg)).arrayBuffer());
      if (generator === "melody") return validateMelodyNotes(await api.melody({
        rootNote: pkg.effectiveConfiguration.rootNote,
        scaleType: pkg.effectiveConfiguration.scaleType,
        progressionId: pkg.effectiveConfiguration.progressionId,
        sections: pkg.effectiveConfiguration.sections.map(({ bars }) => ({ bars })),
        seed: melodySeed(pkg.seed, track),
      }));
      const seed = crypto.getRandomValues(new Int32Array(1))[0];
      const generated = await api.replay({
        ...pkg, seed, notes: null, statistics: null,
        effectiveConfiguration: { ...pkg.effectiveConfiguration, seed, requestedProgression: pkg.effectiveConfiguration.progressionId },
      });
      if (!generated.notes) throw new Error("The generated bass notes were missing.");
      return generated.notes;
    };
    void generate().then((notes) => {
      if (generationRevision.current !== revision) return;
      setContent((current) => current.pkg === pkg
        ? { ...current, tracks: { ...current.tracks, [track]: { role: generator === "melody" ? "lead" : generator, notes } } }
        : current);
    }).catch((e: unknown) => {
      if (generationRevision.current === revision)
        setError(e instanceof Error ? e.message : "Track generation failed.");
    }).finally(() => {
      if (generationRevision.current === revision) setGenerating(false);
    });
  };
  const start = (restart: boolean) => {
    if (unavailable || chordUnavailable || drumUnavailable || midi1Unavailable || midi2Unavailable || collision || !readyChords || readyChords.error) {
      setError("Playback is not ready. Check chord loading and track routing.");
      return;
    }
    setError("");
    void (restart ? transport.restart() : transport.play()).catch(() => {
      setError(output || chordOutput || drumOutput || midi1Output || midi2Output
        ? "MIDI playback could not start. Check the output device and browser permissions."
        : "Audio preview could not start. Check your browser audio settings and try again.");
    });
  };

  const changeSound = (track: MelodicTrackId, sound: BrowserSoundId) => {
    const next = { ...sounds, [track]: sound };
    setSounds(next);
    try {
      sessionStorage.setItem(soundsKey, JSON.stringify(next));
      setSoundStorageError(false);
    } catch { setSoundStorageError(true); }
  };

  const changePatch = (track: MelodicTrackId, patch: HardwarePatch) => {
    const next = { ...patches, [track]: patch };
    setPatches(next);
    try {
      sessionStorage.setItem(patchesKey, JSON.stringify(next));
      setPatchStorageError(false);
    } catch { setPatchStorageError(true); }
  };

  const patternControls = <div className="pattern-controls">
    {!patternSelection && <><label>Drum pattern
      <select value={patternId} disabled={sketchBusy} onChange={(event) => setPatternId(event.target.value)}>
        <option value="">None</option>
        {drumPatterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name} ({pattern.bars} {pattern.bars === 1 ? "bar" : "bars"})</option>)}
      </select>
    </label>
    {selectedPattern && <p className="hint">{selectedPattern.description}</p>}</>}
    <p className="hint">Select Drums in Focus and choose Apply Pattern to update the drum content.</p>
    <p className="hint">Applied pattern: {drumPatterns.find((pattern) => pattern.id === appliedPatternId)?.name ?? "None"}</p>
    <button type="button" disabled={sketchBusy || !appliedPatternId} onClick={() => setAppliedPatternId("")}>Clear Drums</button>
    <p className="hint">Exports the applied drum pattern only, mapped to Circuit Tracks Drum 1–4. Load the suggested percussion sample on Drum 4.</p>
  </div>;
  const drumDownload = <button type="button" disabled={!drumNotes.length} onClick={() => { onPreviewDownload?.(); downloadCircuitTracksDrums(); }}>Download Circuit Tracks Drum MIDI</button>;
  const allDownload = <button type="button" disabled={disabled || generating || !readyChords || !!readyChords.error}
    onClick={() => { onPreviewDownload?.(); downloadAllTracks(); }}>Download All Tracks MIDI (Circuit Tracks)</button>;
  const playbackControls = <div className="preview" aria-label="Bassline preview">
    <div className="transport" role="group" aria-label="Playback controls">
      <div><p className="eyebrow">PREVIEW TRANSPORT</p><h2>Listen</h2></div>
      <div className="transport-buttons">
        <button type="button" className="primary" onClick={() => start(false)} disabled={disabled || unavailable || chordUnavailable || drumUnavailable || midi1Unavailable || midi2Unavailable || collision || !readyChords || !!readyChords.error || state === "playing" || (!Object.values(tracks).some((track) => track.notes.length) && !drumNotes.length)}>Play</button>
        <button type="button" onClick={() => transport.pause()} disabled={disabled || state !== "playing"}>Pause</button>
        <button type="button" onClick={() => transport.stop()}>Stop</button>
        <button type="button" onClick={() => start(true)} disabled={disabled || unavailable || chordUnavailable || drumUnavailable || midi1Unavailable || midi2Unavailable || collision || !readyChords || !!readyChords.error || (!Object.values(tracks).some((track) => track.notes.length) && !drumNotes.length)}>Restart</button>
        <button type="button" aria-pressed={looping} onClick={() => {
          transport.setLoop(!looping);
          setLooping(!looping);
        }}>{looping ? "Loop Enabled" : "Loop"}</button>
      </div>
      <p className="transport-state" role="status">{state === "playing" ? "Playing" : state === "paused" ? "Paused" : "Stopped"}</p>
      {[routing, chordRouting, midi1Routing, midi2Routing, drumRouting].some((route) => route.destination.kind === "browser") &&
        <label className="volume">Volume <span>{volume}%</span>
          <input type="range" min="0" max="100" value={volume} aria-label="Master volume" aria-valuetext={`${volume}%`}
            disabled={routing.destination.kind === "midi" && chordRouting.destination.kind === "midi" && (!tracks.midi1.notes.length || midi1Routing.destination.kind === "midi") && (!tracks.midi2.notes.length || midi2Routing.destination.kind === "midi") && (!drumNotes.length || drumRouting.destination.kind === "midi")} onChange={(event) => changeVolume(Number(event.target.value))} />
        </label>}
      <button type="button" onClick={() => void refreshDevices()} disabled={refreshing}>
        {refreshing ? "Refreshing..." : "Refresh Devices"}
      </button>
    </div>
    <details className="track-sounds"><summary>Track Sounds
      <span className="track-sounds-summary">
        {melodicTrackIds.map((id) => <span key={id}><span className="track-indicator"
          style={{ background: `rgb(${hardwareTracks[id].color.join(", ")})` }} aria-hidden="true" /> {soundTrackNames[id]}: {browserSounds[sounds[id]].label} · Patch {patches[id] === null ? "Off" : patches[id] + 1}</span>)}
      </span>
    </summary>
      {melodicTrackIds.map((id) => <fieldset className="track-sound-row" key={id}>
        <legend><span className="track-indicator" style={{ background: `rgb(${hardwareTracks[id].color.join(", ")})` }} aria-hidden="true" /> {soundTrackNames[id]}</legend>
        <label>Browser Sound
          <select aria-label={`${soundTrackNames[id]} browser sound`} value={sounds[id]} onChange={(event) => {
            if (isBrowserSoundId(event.target.value)) changeSound(id, event.target.value);
          }}>
            {Object.entries(browserSounds).map(([key, sound]) => <option key={key} value={key}>{sound.label}</option>)}
          </select>
        </label>
        <label>Hardware Patch
          <select aria-label={`${soundTrackNames[id]} hardware patch`} value={patches[id] === null ? "" : String(patches[id] + 1)} onChange={(event) => {
            const value = event.target.value === "" ? null : Number(event.target.value) - 1;
            if (isHardwarePatch(value)) changePatch(id, value);
          }}>
            <option value="">Off</option>
            {Array.from({ length: 128 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
          </select>
        </label>
      </fieldset>)}
      <p className="hint">Browser sounds affect newly scheduled browser notes. Hardware patches send MIDI Program Change and are included in All Tracks MIDI; device support may vary.</p>
    </details>
    <label>Profile
      <select value={profiles.activeId ?? ""} onChange={(event) => selectProfile(event.target.value)}>
        {!profiles.activeId && <option value="">No profile selected</option>}
        {profiles.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
      </select>
    </label>
    <details className="hardware-routing"><summary>Hardware &amp; routing</summary>
    <div className="routing-profiles" role="group" aria-label="Routing profiles">
      <label>Profile name
        <input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={100} />
      </label>
      <div className="transport-buttons">
        <button type="button" onClick={() => saveProfile(false)}>Save Profile</button>
        <button type="button" onClick={() => saveProfile(true)} disabled={!profiles.activeId}>Update Profile</button>
        <button type="button" onClick={removeProfile} disabled={!profiles.activeId}>Delete Profile</button>
      </div>
      <p className="hint">Routing edits apply immediately; update the profile to keep them.</p>
    </div>
    <div className="routing">
      {([
        { name: "Bass", routing, output, unavailable, setRouting },
        { name: "Chords", routing: chordRouting, output: chordOutput, unavailable: chordUnavailable, setRouting: setChordRouting },
        { name: "Midi1", routing: midi1Routing, output: midi1Output, unavailable: midi1Unavailable, setRouting: setMidi1Routing },
        { name: "Midi2", routing: midi2Routing, output: midi2Output, unavailable: midi2Unavailable, setRouting: setMidi2Routing },
        { name: "Drums", routing: drumRouting, output: drumOutput, unavailable: drumUnavailable, setRouting: setDrumRouting },
      ] as const).map((track) => <fieldset key={track.name}>
        <legend>{track.name} routing</legend>
        <label>{track.name} Output
          <select value={track.unavailable ? "__unavailable__" : track.output?.id ?? ""}
            onChange={(event) => changeDestination(event.target.value, track.setRouting)} aria-label={`${track.name} output`}>
            <option value="">Browser Synth</option>
            {track.unavailable && <option value="__unavailable__" disabled>MIDI output unavailable - select a device</option>}
            {outputs.map((device) => <option key={device.id} value={device.id}>{device.name || "Unnamed MIDI output"}</option>)}
          </select>
        </label>
        {track.routing.destination.kind === "midi" && <label>{track.name} MIDI Channel
          <select value={track.routing.channel} onChange={(event) => track.setRouting((old) => ({ ...old, channel: Number(event.target.value) }))}>
            {Array.from({ length: 16 }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}
          </select>
        </label>}
      </fieldset>)}
    </div>
    <p className="hint">Bass and Chords routing control Synth1 and Synth2 respectively. Midi1 and Midi2 routing is temporary and is not saved in profiles.</p>
    </details>
    {unavailable && <p className="warning" role="status">Bass MIDI output unavailable or ambiguous. Connect the device and refresh, or select an output.</p>}
    {chordUnavailable && <p className="warning" role="status">Chords MIDI output unavailable or ambiguous. Connect the device and refresh, or select an output.</p>}
    {drumUnavailable && <p className="warning" role="status">Drums MIDI output unavailable or ambiguous. Connect the device and refresh, or select an output.</p>}
    {midi1Unavailable && <p className="warning" role="status">Midi1 MIDI output unavailable or ambiguous. Connect the device and refresh, or select an output.</p>}
    {midi2Unavailable && <p className="warning" role="status">Midi2 MIDI output unavailable or ambiguous. Connect the device and refresh, or select an output.</p>}
    {collision && <p className="warning" role="status">Tracks must use different channels on the same MIDI output.</p>}
    {!readyChords && <p className="hint" role="status">Loading chord notes…</p>}
    {readyChords?.error && <p className="error" role="alert">Chord notes could not be loaded: {readyChords.error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
    {error && <p className="error" role="alert">{error}</p>}
    {profileError && <p className="warning" role="alert">{profileError}</p>}
    {discovered && outputs.length === 0 && <p className="hint" role="status">No MIDI outputs found. Connect a device or virtual port and refresh.</p>}
    {storageError && <p className="warning" role="alert">Volume could not be saved for this browser session.</p>}
    {soundStorageError && <p className="warning" role="alert">Track Sounds could not be loaded or saved for this browser session.</p>}
    {patchStorageError && <p className="warning" role="alert">Hardware Patches could not be loaded or saved for this browser session.</p>}
    {initial.channelError && <p className="warning" role="alert">The previous MIDI channel could not be loaded from this browser session.</p>}
  </div>;
  return <>
    {playbackPane ? createPortal(playbackControls, playbackPane) : playbackControls}
    {patternPane ? createPortal(patternControls, patternPane) : patternControls}
    {drumDownloadPane ? createPortal(drumDownload, drumDownloadPane) : drumDownload}
    {allDownloadPane ? createPortal(allDownload, allDownloadPane) : allDownload}
    <PianoRoll pkg={pkg} transport={transport} playbackState={state} chordNotes={readyChords?.notes ?? []} drumNotes={drumNotes}
      generatorPane={generatorPane}
      workflow={{ content: tracks, busy: generating, disabled: disabled || !readyChords || !!readyChords.error,
        patternSelected: !!selectedPattern, generate: generateTrack }} />
  </>;
});

export default Preview;

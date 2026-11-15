import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import PianoRoll from "./PianoRoll";
import { api, download } from "./api";
import { createCircuitTracksDrumMidi } from "./circuitTracksDrums";
import { arrangeDrums, drumPatterns } from "./drumPatterns";
import { MidiDevices } from "./midi";
import { PlaybackTransport, type PlaybackState } from "./playback";
import { readChordNotes } from "./trackView";
import {
  defaultRoutingProfiles, deleteProfile, loadRoutingProfiles, putProfile, resolveOutput, saveRoutingProfiles,
  routingProfilesKey, type Routing, type RoutingProfiles,
} from "./routingProfiles";
import type { GenerationPackage, NoteData } from "./types";

export interface PreviewHandle { stop(): void }

const volumeKey = "bassline-preview-volume";
const channelKey = "bassline-preview-midi-channel";

function initialProfiles() {
  try {
    const data = loadRoutingProfiles(localStorage);
    let channelError = false;
    if (localStorage.getItem(routingProfilesKey) === null) {
      try {
        const saved = sessionStorage.getItem(channelKey);
        const channel = saved === null ? 0 : Number(saved);
        if (saved !== "" && Number.isInteger(channel) && channel >= 0 && channel <= 15)
          data.profiles[0].routing.channel = channel;
      } catch { channelError = true; }
    }
    return { data, error: "", channelError };
  }
  catch { return { data: defaultRoutingProfiles(), error: "Routing profiles could not be loaded. Saved profiles have not been changed.", channelError: false }; }
}

const Preview = forwardRef<PreviewHandle, { pkg: GenerationPackage; disabled: boolean }>(function Preview({ pkg, disabled }, ref) {
  const [initial] = useState(initialProfiles);
  const [profiles, setProfiles] = useState(initial.data);
  const initialProfile = initial.data.profiles.find((p) => p.id === initial.data.activeId);
  const [routing, setRouting] = useState<Routing>(() => initialProfile?.routing ?? defaultRoutingProfiles().profiles[0].routing);
  const [chordRouting, setChordRouting] = useState<Routing>(() => initialProfile?.chordRouting ?? defaultRoutingProfiles().profiles[0].chordRouting);
  const [drumRouting, setDrumRouting] = useState<Routing>(() => initialProfile?.drumRouting ?? defaultRoutingProfiles().profiles[0].drumRouting);
  const [patternId, setPatternId] = useState("");
  const selectedPattern = drumPatterns.find((item) => item.id === patternId);
  const drumNotes = useMemo(() => {
    const pattern = drumPatterns.find((item) => item.id === patternId);
    return pattern ? arrangeDrums(pattern, pkg.effectiveConfiguration.sections) : [];
  }, [patternId, pkg]);
  const drumNotesRef = useRef(drumNotes);
  drumNotesRef.current = drumNotes;
  const [profileName, setProfileName] = useState(initialProfile?.name ?? "");
  const [profileError, setProfileError] = useState(initial.error);
  const [state, setState] = useState<PlaybackState>("stopped");
  const [looping, setLooping] = useState(false);
  const [chords, setChords] = useState<{ pkg: GenerationPackage; notes: NoteData[]; error: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
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
  const [transport] = useState(() => new PlaybackTransport(setState, setError));
  const output = resolveOutput(routing.destination, outputs);
  const unavailable = routing.destination.kind === "midi" && !output;
  const chordOutput = resolveOutput(chordRouting.destination, outputs);
  const chordUnavailable = chordRouting.destination.kind === "midi" && !chordOutput;
  const drumOutput = resolveOutput(drumRouting.destination, outputs);
  const drumUnavailable = drumRouting.destination.kind === "midi" && !drumOutput;
  const routes = [{ output, channel: routing.channel }, { output: chordOutput, channel: chordRouting.channel },
    { output: drumOutput, channel: drumRouting.channel }];
  const collision = routes.some((route, index) => routes.slice(index + 1).some((other) =>
    route.output && route.output === other.output && route.channel === other.channel));
  const readyChords = chords?.pkg === pkg ? chords : null;

  useImperativeHandle(ref, () => ({ stop: () => transport.stop() }), [transport]);
  useEffect(() => {
    let cancelled = false;
    transport.load(pkg, [], drumNotesRef.current);
    setChords(null);
    void api.combinedMidi(pkg).then((blob) => blob.arrayBuffer()).then(readChordNotes).then(
      (notes) => {
        if (cancelled) return;
        transport.load(pkg, notes, drumNotesRef.current);
        setChords({ pkg, notes, error: "" });
      },
      (error: unknown) => {
        if (!cancelled) setChords({ pkg, notes: [], error: error instanceof Error ? error.message : "Chord notes could not be loaded." });
      },
    );
    return () => { cancelled = true; };
  }, [transport, pkg, retry]);
  useEffect(() => { transport.setDrumNotes(drumNotes); }, [transport, drumNotes]);
  useEffect(() => () => transport.dispose(), [transport]);
  useEffect(() => { transport.setVolume(volume); }, [transport, volume]);
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
    if (routing.destination.kind === "midi" || chordRouting.destination.kind === "midi" || drumRouting.destination.kind === "midi") void refreshDevices();
  }, [routing.destination, chordRouting.destination, drumRouting.destination, refreshDevices]);
  useEffect(() => {
    if (unavailable || chordUnavailable || drumUnavailable || collision) {
      transport.pause();
      return;
    }
    transport.setTrackRoutings({
      bass: { output, channel: routing.channel },
      chords: { output: chordOutput, channel: chordRouting.channel },
      drums: { output: drumOutput, channel: drumRouting.channel },
    });
  }, [transport, output, chordOutput, drumOutput, routing.channel, chordRouting.channel, drumRouting.channel, unavailable, chordUnavailable, drumUnavailable, collision]);

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
  const start = (restart: boolean) => {
    if (unavailable || chordUnavailable || drumUnavailable || collision || !readyChords || readyChords.error) {
      setError("Playback is not ready. Check chord loading and track routing.");
      return;
    }
    setError("");
    void (restart ? transport.restart() : transport.play()).catch(() => {
      setError(output || chordOutput || drumOutput
        ? "MIDI playback could not start. Check the output device and browser permissions."
        : "Audio preview could not start. Check your browser audio settings and try again.");
    });
  };

  return <section className="card preview" aria-label="Bassline preview">
    <p className="hint">Preview plays bass, chords, and an optional drum pattern; each track can use its own output and MIDI channel.</p>
    <label>Drum pattern
      <select value={patternId} onChange={(event) => setPatternId(event.target.value)}>
        <option value="">None</option>
        {drumPatterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name} ({pattern.bars} {pattern.bars === 1 ? "bar" : "bars"})</option>)}
      </select>
    </label>
    {selectedPattern && <p className="hint">{selectedPattern.description}</p>}
    <button type="button" disabled={!drumNotes.length} onClick={downloadCircuitTracksDrums}>Download Circuit Tracks Drum MIDI</button>
    <p className="hint">Exports the selected drum pattern only, mapped to Circuit Tracks Drum 1–4. Load the suggested percussion sample on Drum 4.</p>
    <div className="routing-profiles" role="group" aria-label="Routing profiles">
      <label>Profile
        <select value={profiles.activeId ?? ""} onChange={(event) => selectProfile(event.target.value)}>
          {!profiles.activeId && <option value="">No profile selected</option>}
          {profiles.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
      </label>
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
    <div className="transport" role="group" aria-label="Playback controls">
      <div><p className="eyebrow">PREVIEW TRANSPORT</p><h2>Listen</h2></div>
      <div className="transport-buttons">
        <button type="button" className="primary" onClick={() => start(false)} disabled={disabled || unavailable || chordUnavailable || drumUnavailable || collision || !readyChords || !!readyChords.error || state === "playing" || (!pkg.notes?.length && !drumNotes.length)}>Play</button>
        <button type="button" onClick={() => transport.pause()} disabled={disabled || state !== "playing"}>Pause</button>
        <button type="button" onClick={() => transport.stop()}>Stop</button>
        <button type="button" onClick={() => start(true)} disabled={disabled || unavailable || chordUnavailable || drumUnavailable || collision || !readyChords || !!readyChords.error || (!pkg.notes?.length && !drumNotes.length)}>Restart</button>
        <button type="button" aria-pressed={looping} onClick={() => {
          transport.setLoop(!looping);
          setLooping(!looping);
        }}>{looping ? "Loop Enabled" : "Loop"}</button>
      </div>
      {([
        { name: "Bass", routing, output, unavailable, setRouting },
        { name: "Chords", routing: chordRouting, output: chordOutput, unavailable: chordUnavailable, setRouting: setChordRouting },
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
      <button type="button" onClick={() => void refreshDevices()} disabled={refreshing}>
        {refreshing ? "Refreshing..." : "Refresh Devices"}
      </button>
      <label className="volume">Volume <span>{volume}%</span>
        <input type="range" min="0" max="100" value={volume} aria-label="Master volume" aria-valuetext={`${volume}%`}
          disabled={routing.destination.kind === "midi" && chordRouting.destination.kind === "midi" && (!drumNotes.length || drumRouting.destination.kind === "midi")} onChange={(event) => changeVolume(Number(event.target.value))} />
      </label>
      <p className="transport-state" role="status">{state === "playing" ? "Playing" : state === "paused" ? "Paused" : "Stopped"}</p>
    </div>
    {unavailable && <p className="warning" role="status">Bass MIDI output unavailable or ambiguous. Connect the device and refresh, or select an output.</p>}
    {chordUnavailable && <p className="warning" role="status">Chords MIDI output unavailable or ambiguous. Connect the device and refresh, or select an output.</p>}
    {drumUnavailable && <p className="warning" role="status">Drums MIDI output unavailable or ambiguous. Connect the device and refresh, or select an output.</p>}
    {collision && <p className="warning" role="status">Tracks must use different channels on the same MIDI output.</p>}
    {!readyChords && <p className="hint" role="status">Loading chord notes…</p>}
    {readyChords?.error && <p className="error" role="alert">Chord notes could not be loaded: {readyChords.error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
    {error && <p className="error" role="alert">{error}</p>}
    {profileError && <p className="warning" role="alert">{profileError}</p>}
    {discovered && outputs.length === 0 && <p className="hint" role="status">No MIDI outputs found. Connect a device or virtual port and refresh.</p>}
    {storageError && <p className="warning" role="alert">Volume could not be saved for this browser session.</p>}
    {initial.channelError && <p className="warning" role="alert">The previous MIDI channel could not be loaded from this browser session.</p>}
    <PianoRoll pkg={pkg} transport={transport} playbackState={state} chordNotes={readyChords?.notes ?? []} drumNotes={drumNotes} />
  </section>;
});

export default Preview;

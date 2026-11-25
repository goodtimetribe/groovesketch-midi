import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PlaybackState, PlaybackTransport } from "./playback";
import { createTracks, rgba, trackNoteColor, tracksForRendering, type MelodicContent } from "./trackView";
import { hardwareTracks, melodicTrackIds, type MelodicTrackId } from "./hardwareTracks";
import { actionDescriptionForRole, actionLabel, actionsForRole, roleLabel, actionButtonLabel,
  type ActionableRole, type TrackAction } from "./trackActions";
import type { GenerationPackage, NoteData } from "./types";

export type FocusTrack = MelodicTrackId | "drums";
type Workflow = { content: MelodicContent; busy: boolean; disabled: boolean; patternSelected: boolean;
  generate: (track: FocusTrack, role: ActionableRole, action: TrackAction) => void };
interface Props {
  pkg: GenerationPackage; transport: PlaybackTransport; playbackState: PlaybackState; chordNotes: NoteData[]; drumNotes?: NoteData[];
  workflow?: Workflow;
}

export default function PianoRoll({ pkg, transport, playbackState, chordNotes, drumNotes, workflow }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const [startBar, setStartBar] = useState(0);
  const [barsVisible, setBarsVisible] = useState(8);
  const [selected, setSelected] = useState<{ trackId: string; note: NoteData } | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [quickConfirmation, setQuickConfirmation] = useState<string | null>(null);
  const [focus, setFocus] = useState(workflow ? "synth1" : "bass");
  const tracks = useMemo(() => createTracks(pkg, chordNotes, visibility, drumNotes, workflow?.content), [pkg, chordNotes, visibility, drumNotes, workflow?.content]);
  const rendering = useMemo(() => tracksForRendering(tracks, focus), [tracks, focus]);
  const notes = useMemo(() => rendering.flatMap(({ track }) => track.notes), [rendering]);
  const sections = pkg.effectiveConfiguration.sections;
  const totalBars = sections.reduce((total, section) => total + section.bars, 0);
  const maxStart = Math.max(0, totalBars - barsVisible);
  const start = Math.min(startBar, maxStart);
  const low = notes.length ? Math.max(0, notes.reduce((a, n) => Math.min(a, n.midiNote), 127) - 1) : 35;
  const high = notes.length ? Math.min(127, notes.reduce((a, n) => Math.max(a, n.midiNote), 0) + 1) : 48;

  useEffect(() => { setStartBar(0); setSelected(null); setQuickConfirmation(null); }, [pkg]);
  useEffect(() => {
    if (playbackState === "stopped") setStartBar(0);
  }, [playbackState]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const beat = transport.beat;
      const relative = (beat - start * 4) / (barsVisible * 4);
      if (playhead.current) {
        playhead.current.style.display = relative >= 0 && relative <= 1 ? "block" : "none";
        playhead.current.style.left = `calc(52px + ${relative * 100}% - ${relative * 52}px)`;
      }
      if (playbackState === "playing") {
        if (relative >= 1 || relative < 0) setStartBar(Math.floor(beat / (barsVisible * 4)) * barsVisible);
        frame = requestAnimationFrame(update);
      }
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [transport, playbackState, start, barsVisible]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const width = Math.max(320, element.clientWidth);
      const height = Math.max(260, Math.min(600, (high - low + 1) * 20));
      const ratio = window.devicePixelRatio || 1;
      element.width = width * ratio;
      element.height = height * ratio;
      element.style.height = `${height}px`;
      const ctx = element.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.fillStyle = "#141a29";
      ctx.fillRect(0, 0, width, height);
      const axis = 52, top = 26;
      const gridWidth = width - axis, rowHeight = (height - top) / (high - low + 1);
      ctx.font = "11px system-ui";
      for (let pitch = low; pitch <= high; pitch++) {
        const y = top + (high - pitch) * rowHeight;
        ctx.fillStyle = pitch % 12 === 0 ? "#202b40" : pitch % 2 ? "#192233" : "#1c2638";
        ctx.fillRect(axis, y, gridWidth, rowHeight);
        ctx.fillStyle = "#abb7c9";
        if (rowHeight >= 13 || pitch % 12 === 0) ctx.fillText(`${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][pitch % 12]}${Math.floor(pitch / 12) - 1}`, 5, y + Math.min(rowHeight - 2, 13));
      }
      for (let bar = 0; bar <= barsVisible; bar++) {
        const x = axis + bar * gridWidth / barsVisible;
        ctx.strokeStyle = "#41516b";
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, height); ctx.stroke();
        ctx.fillStyle = "#c0cad8";
        if (start + bar < totalBars) ctx.fillText(`${start + bar + 1}`, x + 3, 17);
      }
      for (const { track, ghost } of rendering) for (const note of track.notes) {
        const beat = note.startBeat - start * 4;
        if (beat + note.durationBeats <= 0 || beat >= barsVisible * 4) continue;
        const x = axis + Math.max(0, beat) / (barsVisible * 4) * gridWidth;
        const end = axis + Math.min(barsVisible * 4, beat + note.durationBeats) / (barsVisible * 4) * gridWidth;
        const y = top + (high - note.midiNote) * rowHeight;
        ctx.fillStyle = rgba(trackNoteColor(track, note), (0.35 + note.velocity / 127 * 0.65) * (ghost ? 0.35 : 1));
        ctx.fillRect(x, y + 1, Math.max(1, end - x), Math.max(1, rowHeight - 2));
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    draw();
    return () => observer.disconnect();
  }, [rendering, low, high, start, barsVisible, totalBars]);

  const visibleNotes = rendering.flatMap(({ track }) => track.notes
    .filter((n) => n.startBeat + n.durationBeats > start * 4 && n.startBeat < (start + barsVisible) * 4)
    .map((note) => ({ track, note })));
  const selectedVisible = selected && tracks.some((track) => track.id === selected.trackId && track.visible && track.notes.includes(selected.note));
  const quickTrackForRole = (role: Exclude<ActionableRole, "drums" | "aux-percussion">): MelodicTrackId => {
    const assigned = melodicTrackIds.find((id) => workflow?.content[id].role === role);
    const defaultTrack: Record<typeof role, MelodicTrackId> = {
      bass: "synth1", chords: "synth2", lead: "midi1", pad: "midi2",
    };
    return assigned ?? defaultTrack[role];
  };
  const quickRoles: { role: ActionableRole; actions: readonly TrackAction[]; color: string }[] = workflow ? [
    ...(["bass", "chords", "lead", "pad"] as const).map((role) => {
      const track = quickTrackForRole(role);
      return { role, actions: actionsForRole[role], color: `rgb(${hardwareTracks[track].color.join(", ")})` };
    }),
    { role: "drums", actions: actionsForRole.drums, color: `rgb(${hardwareTracks.drum1.color.join(", ")})` },
    ...(drumNotes?.some((note) => ![36, 38, 42].includes(note.midiNote)) ? [{
      role: "aux-percussion" as const, actions: actionsForRole["aux-percussion"],
      color: `rgb(${hardwareTracks.drum4.color.join(", ")})`,
    }] : []),
  ] : [];
  const focusedRole = focus === "drums" ? "drums" : workflow?.content[focus as MelodicTrackId]?.role;
  const performQuickAction = (role: ActionableRole, action: TrackAction) => {
    const key = `${focus}:${role}:${action}`;
    if (action === "rebuild" && quickConfirmation !== key) {
      setQuickConfirmation(key);
      return;
    }
    const target = role === "drums" || role === "aux-percussion"
      ? "drums" : focus === "drums" ? quickTrackForRole(role) : focus as FocusTrack;
    workflow?.generate(target, role, action);
    setQuickConfirmation(null);
  };
  return <section className="roll card" aria-label="Note View">
    <div className="section-title"><div><p className="eyebrow">NOTE VIEW</p><h2>Piano roll</h2></div></div>
    <div className="roll-canvas">
      <canvas ref={canvas} aria-hidden="true" />
      <div ref={playhead} className="playhead" aria-hidden="true" />
    </div>
    <div className="roll-nav">
      <button type="button" onClick={() => setStartBar(Math.max(0, start - barsVisible))} disabled={start === 0}>Previous</button>
      <label>Start bar <input type="number" min={1} max={maxStart + 1} value={start + 1}
        onChange={(e) => setStartBar(Math.max(0, Math.min(maxStart, Number(e.target.value) - 1)))} /></label>
      <span>Bars {start + 1}–{Math.min(totalBars, start + barsVisible)} of {totalBars}</span>
      <button type="button" onClick={() => setStartBar(Math.min(maxStart, start + barsVisible))} disabled={start >= maxStart}>Next</button>
      <label>Bars shown <select value={barsVisible} onChange={(e) => setBarsVisible(Number(e.target.value))}>
        {[4, 8, 16, 32, 64].map((n) => <option key={n}>{n}</option>)}
      </select></label>
      <div className="roll-track-selectors" role="group" aria-label="Track selection and mute">
        {tracks.map((track) => <div className="roll-track-selector" key={track.id}>
          <label className="roll-track-toggle" title={`Toggle ${track.name} playback`}>
            <input type="checkbox" aria-label={`Enable ${track.name}`} checked={track.visible} onChange={(event) => {
              const enabled = event.target.checked;
              transport.setTrackEnabled(track.kind === "drumGroup" ? "drums" : track.hardwareTrackId, enabled);
              setVisibility((old) => ({ ...old, [track.id]: enabled }));
            }} />
            <span className="track-indicator" style={{ background: track.indicator }} aria-hidden="true" />
          </label>
          <button type="button" className="roll-track-focus" aria-label={`Focus ${track.name} track`}
            aria-pressed={focus === track.id} onClick={() => setFocus(track.id)}>{track.name}</button>
        </div>)}
      </div>
      {quickRoles.map(({ role, actions, color }) => <div
        className={`quick-role-actions${focusedRole === role ? " is-focused" : ""}`} key={role}
        style={{ "--role-color": color } as CSSProperties}>
        <span className="quick-role-label">{roleLabel[role]}</span>
        {actions.map((action) => {
          const key = `${focus}:${role}:${action}`;
          const confirming = quickConfirmation === key;
          const icon = action === "rebuild" ? "↻" : action === "apply" ? "♪" : "✨";
          return <button key={action} className="quick-action" type="button"
            aria-label={confirming ? `Confirm ${actionButtonLabel(action, role)}` : actionButtonLabel(action, role)}
            title={`${confirming ? "Confirm " : ""}${actionLabel[action]} — ${roleLabel[role]}: ${actionDescriptionForRole(action, role)}`}
            disabled={workflow!.busy || workflow!.disabled || ((role === "drums" || role === "aux-percussion") && !workflow!.patternSelected)}
            onClick={() => performQuickAction(role, action)}>
            {confirming ? "✓" : icon}
          </button>;
        })}
      </div>)}
    </div>
    <details className="roll-options">
    <summary>Arrangement</summary>
    <div className="arrangement-controls">
      <div className="section-selection">
        <h3 className="sections-heading">Sections</h3>
        <div className="sections" aria-label="Arrangement sections">
          {sections.map((section, index) => {
            const bar = sections.slice(0, index).reduce((sum, s) => sum + s.bars, 0);
            return <button key={index} type="button" onClick={() => setStartBar(bar)} title={`Go to bar ${bar + 1}`}>
              {section.name} <span>{section.bars} bars</span>
            </button>;
          })}
        </div>
      </div>
    </div>
    </details>
    <p className="hint">Notes are read-only. Unfocused tracks are ghosted; brighter notes have higher velocity. Track checkboxes control visibility and playback, not export. The preview instrument may sound different from your DAW.</p>
    <details><summary>Visible notes ({visibleNotes.length})</summary>
      <div className="note-list"><table><thead><tr><th>Track</th><th>Note</th><th>Start beat</th><th>Length</th><th>Velocity</th></tr></thead>
        <tbody>{visibleNotes.map(({ track, note }, i) => <tr key={`${track.id}-${i}`} onClick={() => setSelected({ trackId: track.id, note })}>
          <td>{track.name}</td>
          <td><button className="text-button" type="button" onClick={() => setSelected({ trackId: track.id, note })}>{note.note} ({note.midiNote})</button></td>
          <td>{note.startBeat.toFixed(2)}</td><td>{note.durationBeats.toFixed(2)}</td><td>{note.velocity}</td>
        </tr>)}</tbody></table></div>
      {selectedVisible && selected && <p>Selected: {selected.note.note}, beat {selected.note.startBeat}, length {selected.note.durationBeats}, velocity {selected.note.velocity}.</p>}
    </details>
  </section>;
}

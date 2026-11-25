import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PlaybackState, PlaybackTransport } from "./playback";
import { createTracks, rgba, trackNoteColor, tracksForRendering, type MelodicContent, type TrackViewModel } from "./trackView";
import { hardwareTracks, melodicTrackIds, type MelodicTrackId } from "./hardwareTracks";
import { actionDescriptionForRole, actionLabel, actionsForRole, defaultActionForRole, legacyMelodyRole, roleLabel,
  actionButtonLabel, type ActionableRole, type TrackAction } from "./trackActions";
import type { GenerationPackage, NoteData } from "./types";

export type FocusTrack = MelodicTrackId | "drums";
type Workflow = { content: MelodicContent; busy: boolean; disabled: boolean; patternSelected: boolean;
  generate: (track: FocusTrack, role: ActionableRole, action: TrackAction) => void };
interface Props {
  pkg: GenerationPackage; transport: PlaybackTransport; playbackState: PlaybackState; chordNotes: NoteData[]; drumNotes?: NoteData[];
  workflow?: Workflow;
}

function TrackRow({ track, pkg, workflow, onVisibility }: { track: TrackViewModel; pkg: GenerationPackage;
  workflow?: Workflow; onVisibility: (enabled: boolean) => void }) {
  const id = melodicTrackIds.find((item) => item === track.id);
  const assignedRole = track.kind === "track" ? legacyMelodyRole(track.role) : "drums";
  const [role, setRole] = useState<ActionableRole | "">(assignedRole ?? "");
  const [action, setAction] = useState<TrackAction>(() => assignedRole ? defaultActionForRole[assignedRole] : "rebuild");
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  useEffect(() => {
    setRole(assignedRole ?? "");
    if (assignedRole) setAction(defaultActionForRole[assignedRole]);
    setConfirmReplacement(false);
  }, [pkg, assignedRole]);
  const trackName = id === "synth1" ? "Synth1" : id === "synth2" ? "Synth2" : id === "midi1" ? "Midi1" : id === "midi2" ? "Midi2" : "Drums";
  const performAction = (target: FocusTrack) => {
    if (!role) return;
    if (action === "rebuild" && !confirmReplacement) {
      setConfirmReplacement(true);
      return;
    }
    workflow?.generate(target, role, action);
    setConfirmReplacement(false);
  };
  const buttonLabel = role
    ? confirmReplacement ? `Confirm ${actionButtonLabel(action, role)}` : actionButtonLabel(action, role)
    : "Choose Role";
  const actionHintId = `track-action-hint-${track.id}`;
  return <div className="track-row">
    <label className="check">
      <input type="checkbox" checked={track.visible} onChange={(event) => onVisibility(event.target.checked)} />
      <span className="track-indicator" style={{ background: track.indicator }} aria-hidden="true" /> {track.name}
    </label>
    {workflow && id && <>
      <select aria-label={`${trackName} role`} value={role} disabled={workflow.busy || workflow.disabled} onChange={(event) => {
        const value = event.target.value;
        const next = legacyMelodyRole(value);
        if (next && next !== "drums" && next !== "aux-percussion") {
          setRole(next);
          setAction(defaultActionForRole[next]);
          setConfirmReplacement(false);
        }
      }}>
        <option value="" disabled>Choose role</option>
        <option value="bass">Bass</option><option value="chords">Chords</option>
        <option value="lead">Lead</option><option value="pad">Pad</option>
      </select>
      {role && <select aria-label={`${roleLabel[role]} action`} value={action} disabled={workflow.busy || workflow.disabled}
        aria-describedby={actionHintId}
        onChange={(event) => {
          setAction(event.target.value as TrackAction);
          setConfirmReplacement(false);
        }}>
        {actionsForRole[role].map((item) => <option key={item} value={item}>{actionLabel[item]}</option>)}
      </select>}
      <button type="button" aria-label={role ? `${buttonLabel} on ${trackName}` : `Choose a role for ${trackName}`}
        disabled={workflow.busy || workflow.disabled || !role}
        onClick={() => performAction(id)}>
        {buttonLabel}
      </button>
      {role && <span id={actionHintId} className="hint track-action-hint" aria-live="polite">
        {confirmReplacement ? "This replaces the current notes. Select the button again to confirm." : actionDescriptionForRole(action, role)}
      </span>}
    </>}
    {workflow && track.kind === "drumGroup" && <>
      <select aria-label="Drums role" value={role} disabled={workflow.busy || workflow.disabled} onChange={(event) => {
        const next = legacyMelodyRole(event.target.value);
        if (next === "drums" || next === "aux-percussion") {
          setRole(next);
          setAction(defaultActionForRole[next]);
          setConfirmReplacement(false);
        }
      }}>
        <option value="drums">Drums</option><option value="aux-percussion">Aux Percussion</option>
      </select>
      <select aria-label={role === "aux-percussion" ? "Aux Percussion action" : "Drums action"} value={action}
        disabled={workflow.busy || workflow.disabled} aria-describedby={actionHintId}
        onChange={(event) => {
          setAction(event.target.value as TrackAction);
          setConfirmReplacement(false);
        }}>
        {actionsForRole[role as "drums" | "aux-percussion"].map((item) =>
          <option key={item} value={item}>{actionLabel[item]}</option>)}
      </select>
      <button type="button" aria-label={`${buttonLabel} on Drums`}
        disabled={workflow.busy || workflow.disabled || !workflow.patternSelected}
        onClick={() => performAction("drums")}>
        {buttonLabel}
      </button>
      <span id={actionHintId} className="hint track-action-hint">
        {workflow.patternSelected ? actionDescriptionForRole(action, role as "drums" | "aux-percussion") : "Select a drum pattern to use or vary percussion."}
      </span>
    </>}
  </div>;
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
  const quickRoles: { role: ActionableRole; track: FocusTrack; actions: readonly TrackAction[]; color: string }[] = workflow ? [
    ...(["bass", "chords", "lead", "pad"] as const).map((role) => {
      const track = quickTrackForRole(role);
      return { role, track, actions: actionsForRole[role], color: `rgb(${hardwareTracks[track].color.join(", ")})` };
    }),
    { role: "drums", track: "drums", actions: actionsForRole.drums, color: `rgb(${hardwareTracks.drum1.color.join(", ")})` },
    ...(drumNotes?.some((note) => ![36, 38, 42].includes(note.midiNote)) ? [{
      role: "aux-percussion" as const, track: "drums" as const, actions: actionsForRole["aux-percussion"],
      color: `rgb(${hardwareTracks.drum4.color.join(", ")})`,
    }] : []),
  ] : [];
  const performQuickAction = (track: FocusTrack, role: ActionableRole, action: TrackAction) => {
    const key = `${track}:${role}:${action}`;
    if (action === "rebuild" && quickConfirmation !== key) {
      setQuickConfirmation(key);
      return;
    }
    workflow?.generate(track, role, action);
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
      {quickRoles.map(({ role, track, actions, color }) => <div
        className={`quick-role-actions${focus === track ? " is-focused" : ""}`} key={role}
        style={{ "--role-color": color } as CSSProperties}>
        <button className="quick-role-name" type="button" aria-label={`Focus ${roleLabel[role]} track`}
          aria-pressed={focus === track} title={`Focus ${roleLabel[role]} track`}
          onClick={() => setFocus(track)}>{roleLabel[role]}</button>
        {actions.map((action) => {
          const key = `${track}:${role}:${action}`;
          const confirming = quickConfirmation === key;
          const icon = action === "rebuild" ? "↻" : action === "apply" ? "♪" : "✨";
          return <button key={action} className="quick-action" type="button"
            aria-label={confirming ? `Confirm ${actionButtonLabel(action, role)}` : actionButtonLabel(action, role)}
            title={`${confirming ? "Confirm " : ""}${actionLabel[action]} — ${roleLabel[role]}: ${actionDescriptionForRole(action, role)}`}
            disabled={workflow!.busy || workflow!.disabled || ((role === "drums" || role === "aux-percussion") && !workflow!.patternSelected)}
            onClick={() => performQuickAction(track, role, action)}>
            {confirming ? "✓" : icon}
          </button>;
        })}
      </div>)}
    </div>
    <details className="roll-options">
    <summary>Arrangement &amp; focus</summary>
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
        <div className="track-controls">
          <label>Focus <select value={focus} onChange={(event) => setFocus(event.target.value)}>
            {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
          </select></label>
        </div>
      </div>
    </div>
    </details>
    <div className="track-controls roll-visibility">
      <details className="track-actions-options">
        <summary>Tracks &amp; actions</summary>
      <fieldset><legend>Track controls</legend>
        <p className="hint track-actions-guide">Choose a role, choose an outcome, then apply it to that track. Other tracks stay unchanged.</p>
        {tracks.map((track) => <TrackRow key={track.id} track={track} pkg={pkg} workflow={workflow}
          onVisibility={(enabled) => {
            transport.setTrackEnabled(track.kind === "drumGroup" ? "drums" : track.hardwareTrackId, enabled);
            setVisibility((old) => ({ ...old, [track.id]: enabled }));
          }} />)}
      </fieldset>
      </details>
      <label>Bars shown <select value={barsVisible} onChange={(e) => setBarsVisible(Number(e.target.value))}>
        {[4, 8, 16, 32, 64].map((n) => <option key={n}>{n}</option>)}
      </select></label>
    </div>
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

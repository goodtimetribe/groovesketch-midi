import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, download } from "./api";
import { initialRequest, isPackage, needsRebuild, randomInitialRequest, replayWithRequest, requestFromPackage, roots, scales } from "./domain";
import { drumPatterns } from "./drumPatterns";
import Preview, { type PreviewHandle } from "./Preview";
import Modal from "./Modal";
import { createSketch, type Sketch } from "./sketch";
import { dimensions, type Behavior, type Dimension, type GenerateRequest, type GenerationPackage, type Progression } from "./types";

type Catalogs = { presets: string[]; progressions: Progression[]; roots: string[]; scales: string[] };
type Mode = "single" | "arrangement" | "custom";
const chordExportChannel = 1; // Zero-based MIDI channel 2, matching the API.
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";
const settingKeys = ["rootNote", "scaleType", "style", "bpm", "bars", "mode", "progression", "seed",
  "channel", "velocity", "velocityVariation", "timingVariation", "swing", "accentDownbeats", ...dimensions] as const;

function sameSketchSettings(current: GenerateRequest, applied: GenerateRequest): boolean {
  if (settingKeys.some((key) => !Object.is(current[key], applied[key]))) return false;
  const sections = applied.sections;
  if (!current.sections || !sections) return current.sections === sections;
  return current.sections.length === sections.length && current.sections.every((section, index) => {
    const other = sections[index];
    return section.name === other.name && section.style === other.style && section.bars === other.bars;
  });
}

export default function App() {
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [request, setRequest] = useState<GenerateRequest>(initialRequest);
  const [result, setResult] = useState<GenerationPackage | null>(null);
  const [draftPackage, setDraftPackage] = useState<GenerationPackage | null>(null);
  const [settingsBehaviors, setSettingsBehaviors] = useState<Behavior[]>([]);
  const [dirty, setDirty] = useState(false);
  const [resetDefaults, setResetDefaults] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [code, setCode] = useState("");
  const [sharedCode, setSharedCode] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [playbackPane, setPlaybackPane] = useState<HTMLElement | null>(null);
  const [transportPane, setTransportPane] = useState<HTMLElement | null>(null);
  const [patternPane, setPatternPane] = useState<HTMLElement | null>(null);
  const [drumDownloadPane, setDrumDownloadPane] = useState<HTMLElement | null>(null);
  const [allDownloadPane, setAllDownloadPane] = useState<HTMLElement | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [patternId, setPatternId] = useState("four-on-the-floor");
  const [sketch, setSketch] = useState<Sketch | null>(null);
  const [trackBusy, setTrackBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const settingsForm = useRef<HTMLFormElement>(null);
  const preview = useRef<PreviewHandle>(null);
  const downloads = useRef<HTMLDivElement>(null);
  const downloadsToggle = useRef<HTMLButtonElement>(null);
  const initialFragmentHandled = useRef(false);
  const initialConfigurationSet = useRef(false);
  const busyRef = useRef(false);

  const loadCatalogs = useCallback(async () => {
    setCatalogError("");
    try {
      const [presets, progressions] = await Promise.all([api.presets(), api.progressions()]);
      if (!presets.length || !progressions.length) throw new Error("No styles or progressions are available.");
      if (!initialConfigurationSet.current) {
        const seed = crypto.getRandomValues(new Int32Array(1))[0];
        setRequest(randomInitialRequest(seed, presets, progressions));
        initialConfigurationSet.current = true;
      }
      setCatalogs({ presets, progressions, roots, scales });
    } catch (e) { setCatalogError(message(e)); }
  }, []);

  useEffect(() => { void loadCatalogs(); }, [loadCatalogs]);
  useEffect(() => {
    if (!downloadsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !downloads.current?.contains(event.target)) setDownloadsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDownloadsOpen(false); downloadsToggle.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [downloadsOpen]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || (result && !saved)) { event.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, result, saved]);

  const accept = useCallback((pkg: GenerationPackage, source: string, prepared?: Sketch) => {
    if (!isPackage(pkg)) throw new Error("The API returned an invalid package.");
    initialConfigurationSet.current = true;
    preview.current?.stop();
    setSketch(prepared ?? null);
    setResult(pkg); setDraftPackage(structuredClone(pkg)); setRequest(requestFromPackage(pkg));
    setSettingsBehaviors(pkg.effectiveConfiguration.sections.map((section) => ({ ...section.behavior })));
    setDirty(false); setResetDefaults(false); setSaved(false); setSectionIndex(0); setSharedCode("");
    setStatus(source); setError("");
  }, []);

  const run = useCallback(async (label: string, operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label); setError(""); setStatus("");
    try { await operation(); } catch (e) { setError(message(e)); }
    finally { busyRef.current = false; setBusy(""); }
  }, []);

  useEffect(() => {
    if (initialFragmentHandled.current) return;
    initialFragmentHandled.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const shareCode = params.get("share");
    if (shareCode) {
      setCode(shareCode);
      void run("Loading shared bassline", async () => {
        accept(await api.decode(shareCode), "Shared bassline loaded.");
      });
    }
  }, [accept, run]);

  const update = <K extends keyof GenerateRequest>(key: K, value: GenerateRequest[K]) => {
    setRequest((old) => ({ ...old, [key]: value }));
    setDirty(true);
  };
  const updateDimension = (dimension: Dimension, value: number | null) => {
    update(dimension, value);
    setSettingsBehaviors((old) => {
      if (!result) return old;
      return old.map((behavior, index) => ({
        ...behavior, [dimension]: value ?? result.effectiveConfiguration.sections[index].behavior[dimension],
      }));
    });
    if (result && value === null) setResetDefaults(true);
    if (value !== null) setDraftPackage((old) => old && ({
      ...old, effectiveConfiguration: { ...old.effectiveConfiguration,
        sections: old.effectiveConfiguration.sections.map((s) => ({ ...s, behavior: { ...s.behavior, [dimension]: value } })),
      },
    }));
  };
  const updateSectionBehavior = (dimension: Dimension, value: number) => {
    setSettingsBehaviors((old) => old.map((behavior, index) => index === sectionIndex
      ? { ...behavior, [dimension]: value } : behavior));
    setDraftPackage((old) => old && ({
      ...old, effectiveConfiguration: { ...old.effectiveConfiguration,
        sections: old.effectiveConfiguration.sections.map((section, index) => index === sectionIndex
          ? { ...section, behavior: { ...section.behavior, [dimension]: value } } : section),
      },
    }));
    setDirty(true);
  };
  const confirmReplacement = () => (!result && !dirty) || (!!result && saved && !dirty) ||
    window.confirm("Replace your current work? Save the current package first if needed. Unapplied settings are not included in the saved package.");

  const generate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!catalogs || busyRef.current) return;
    if (request.sections && request.sections.reduce((sum, section) => sum + section.bars, 0) > 4096) {
      setError("Custom sections cannot exceed 4096 bars in total.");
      return;
    }
    const rebuild = result && (resetDefaults || needsRebuild(result, request));
    if (rebuild && !window.confirm("This change rebuilds the arrangement using style defaults and may discard per-section behavior edits. Continue?")) return;
    if (result && !saved && !window.confirm("This replaces your unsaved result. Save it first if you want to keep it. Continue?")) return;
    preview.current?.stop();
    void run("Generating bassline", async () => {
      const submitted = result && request.seed === null
        ? { ...request, seed: crypto.getRandomValues(new Int32Array(1))[0] }
        : request;
      const pkg = result && draftPackage && !rebuild
        ? await api.replay(replayWithRequest(draftPackage, submitted))
        : await api.generate(submitted);
      accept(pkg, "");
    });
  };

  const generateSketch = () => {
    if (!catalogs || busyRef.current || trackBusy) return;
    const pattern = drumPatterns.find((item) => item.id === patternId);
    if (!pattern) { setError("Select a drum pattern before generating a sketch."); return; }
    if (!settingsForm.current?.reportValidity()) { setError("Check the generation settings before generating a sketch."); return; }
    if (request.sections && request.sections.reduce((sum, section) => sum + section.bars, 0) > 4096) {
      setError("Custom sections cannot exceed 4096 bars in total.");
      return;
    }
    const rebuild = result && (resetDefaults || needsRebuild(result, request));
    if (rebuild && !window.confirm("This change rebuilds the arrangement using style defaults and may discard per-section behavior edits. Continue?")) return;
    if (result && !window.confirm("Generate Sketch replaces the current bassline and all preview tracks. Preview track edits cannot be saved in the package. Continue?")) return;
    const seed = request.seed ?? crypto.getRandomValues(new Int32Array(1))[0];
    const submitted = { ...request, seed };
    void run("Generating sketch", async () => {
      const pkg = result && draftPackage && !rebuild
        ? await api.replay(replayWithRequest(draftPackage, submitted))
        : await api.generate(submitted);
      if (!isPackage(pkg) || pkg.seed !== seed || pkg.effectiveConfiguration.seed !== seed)
        throw new Error("The API returned an invalid sketch package.");
      const prepared = await createSketch(pkg, pattern);
      accept(pkg, "", prepared);
    });
  };

  const mode: Mode = request.sections ? "custom" : request.mode;
  const changeMode = (value: Mode) => {
    setRequest((old) => {
      if (value === "custom") {
        return { ...old, mode: "single", sections: old.sections ?? [{ name: "Section 1", style: old.style, bars: old.bars }] };
      }
      const { sections: _sections, ...rest } = old;
      return { ...rest, mode: value };
    });
    setDirty(true);
  };
  const updateCustom = (index: number, patch: Partial<NonNullable<GenerateRequest["sections"]>[number]>) => {
    setRequest((old) => ({ ...old, sections: old.sections?.map((s, i) => i === index ? { ...s, ...patch } : s) }));
    setDirty(true);
  };
  const moveCustom = (index: number, direction: number) => {
    const sections = [...(request.sections ?? [])];
    const destination = index + direction;
    if (destination < 0 || destination >= sections.length) return;
    [sections[index], sections[destination]] = [sections[destination], sections[index]];
    update("sections", sections);
    setResetDefaults(true);
  };
  const save = () => {
    if (!result) return;
    try {
      download(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }), "bassline-package.json");
      setSaved(true); setStatus("Package download started. Keep the file to reload it later.");
    } catch (e) { setError(message(e)); }
  };
  const loadFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !confirmReplacement()) return;
    void run("Loading package", async () => {
      if (file.size > 50 * 1024 * 1024) throw new Error("Package file exceeds the 50 MB import limit.");
      let parsed: unknown;
      try { parsed = JSON.parse(await file.text()) as unknown; }
      catch { throw new Error("The selected file is not valid JSON."); }
      if (!isPackage(parsed)) throw new Error("The selected file is not a valid generation package.");
      accept(await api.replay(parsed), "Package loaded and replayed.");
    });
  };
  const decode = () => {
    if (!code.trim() || !confirmReplacement()) return;
    void run("Loading share code", async () => {
      accept(await api.decode(code.trim()), "Shared bassline loaded.");
      setLoadOpen(false);
    });
  };
  const share = () => {
    if (!result) return;
    setShareOpen(true);
    setSharedCode("");
    void run("Creating share code", async () => setSharedCode((await api.share(result)).shareCode));
  };
  const copy = (value: string) => void run("Copying", async () => {
    await navigator.clipboard.writeText(value);
    setStatus("Copied to clipboard.");
  });
  const renderMidi = (combined: boolean) => {
    if (!result) return;
    void run("Rendering MIDI", async () => {
      const midi = combined ? await api.combinedMidi(result) : await api.midi(result);
      download(midi, combined ? "bassline-and-chords.mid" : "bassline.mid");
      setStatus("MIDI download started. Open it in your DAW to audition.");
    });
  };
  const closeDownloads = () => {
    setDownloadsOpen(false);
    downloadsToggle.current?.focus();
  };

  const activeSection = draftPackage?.effectiveConfiguration.sections[sectionIndex];
  const sketchSettingsChanged = !!sketch && sketch.pkg === result && (
    !sameSketchSettings(request, requestFromPackage(sketch.pkg)) || patternId !== sketch.patternId ||
    settingsBehaviors.length !== sketch.pkg.effectiveConfiguration.sections.length ||
    settingsBehaviors.some((behavior, index) => dimensions.some((dimension) =>
      behavior[dimension] !== sketch.pkg.effectiveConfiguration.sections[index].behavior[dimension]))
  );
  const showSettingsWarning = sketch && sketch.pkg === result ? sketchSettingsChanged : dirty;
  const selectedPattern = drumPatterns.find((pattern) => pattern.id === patternId);
  const selectedProgression = catalogs?.progressions.find((p) => p.id === request.progression || p.name === request.progression);
  const progressionSummary = selectedProgression?.name ?? (request.progression
    ? request.progression === result?.effectiveConfiguration.requestedProgression || request.progression === result?.effectiveConfiguration.progressionId
      ? result.effectiveConfiguration.progressionName : request.progression
    : "Random for scale");
  return <div className="app">
    <div className="app-content">
    <header className="topbar"><div><p className="eyebrow">GOOD TIME TRIBE</p><h1>Bassline Generator</h1></div>
      <nav aria-label="Package actions">
        <button type="button" disabled={!result || !!busy} onClick={save}>Save package</button>
        <button type="button" disabled={!result || !!busy} onClick={share}>Share</button>
        <div className="download-split" ref={downloads}>
          <button type="button" className="primary" disabled={!result || !!busy} onClick={() => { setDownloadsOpen(false); renderMidi(true); }}>Download Bass + Chords MIDI</button>
          <button type="button" className="primary download-toggle" ref={downloadsToggle} aria-label="More MIDI downloads"
            aria-expanded={downloadsOpen} aria-controls="download-options" onClick={() => setDownloadsOpen((open) => !open)}>
            <span aria-hidden="true">▾</span>
          </button>
          <div id="download-options" className="download-options" hidden={!downloadsOpen}>
            <button type="button" disabled={!result || !!busy} onClick={() => { closeDownloads(); renderMidi(false); }}>Download Bass MIDI</button>
            <div ref={setAllDownloadPane}>{!result && <button type="button" disabled>Download All Tracks MIDI (Circuit Tracks)</button>}</div>
            <div ref={setDrumDownloadPane}>{!result && <button type="button" disabled>Download Circuit Tracks Drum MIDI</button>}</div>
          </div>
        </div>
        <button type="button" disabled={!!busy} onClick={() => fileInput.current?.click()}>Load package</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={loadFile} />
        <button type="button" disabled={!!busy} onClick={() => setLoadOpen(true)}>Load code</button>
      </nav>
    </header>
    <div className="creative-bar" role="group" aria-label="Creative actions">
      <button type="button" className="primary" disabled={!!busy || !catalogs || trackBusy || !patternId} onClick={generateSketch}>Generate Sketch</button>
      <span className="sketch-settings-status" role="status" aria-live="polite">
        {sketchSettingsChanged && <><span aria-hidden="true">●</span> Settings Changed</>}
      </span>
      <button className="generate" type="submit" form="generation-form" disabled={!!busy || !catalogs}>{result ? "Regenerate Bass Package" : "Generate Bass Package"}</button>
    </div>
    <div className="announcements" aria-live="polite">
      {busy && <p className="notice">{busy}…</p>}
      {status && <p className="notice">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {catalogError && <p className="error" role="alert">Could not load choices: {catalogError} <button type="button" onClick={() => void loadCatalogs()}>Retry</button></p>}
    </div>
    <main className="workspace">
      <aside className="settings card" aria-label="Playback and hardware controls">
        <div ref={setPlaybackPane}>
        {!result && <><p className="eyebrow">PREVIEW TRANSPORT</p><h2>Listen</h2><p className="hint">Generate a sketch, then press Play to hear it.</p></>}
        </div>
        <div aria-live="polite">
          {result && <p className="result-summary"><strong>{sketch?.pkg === result ? "Generated sketch:" : "Generated bassline:"}</strong>{" "}
            {result.effectiveConfiguration.rootNote} {result.effectiveConfiguration.scaleType} · {result.effectiveConfiguration.bpm} BPM · {result.statistics?.arrangementBars ?? "—"} bars · {result.effectiveConfiguration.progressionName}
            {result.effectiveConfiguration.chordSequence.length > 0 && ` (${result.effectiveConfiguration.chordSequence.join(" · ")})`} · Seed {result.seed} · Engine {result.engineVersion ?? "legacy 1.0.0"}
          </p>}
          {sketch?.pkg === result && <p className="hint">Melody, pad, drums, and track edits are not included in packages, share codes, or bass and chords exports. Use All Tracks MIDI to export the current sketch.</p>}
        </div>
      </aside>
      <div className="result">
      <div className="sound-settings card">
      <p className="eyebrow">SHAPE YOUR SOUND</p>
      <form id="generation-form" ref={settingsForm} onSubmit={generate} onInvalidCapture={(event) => {
        let element = event.target instanceof HTMLElement ? event.target.parentElement : null;
        while (element && element !== event.currentTarget) {
          if (element instanceof HTMLDetailsElement) element.open = true;
          element = element.parentElement;
        }
      }}>
        <fieldset disabled={!!busy || !catalogs}>
      <details className="settings-panel" open>
      <summary><h2>Settings</h2>
        <div className="settings-snapshot">
          <p><strong>Music</strong> {request.rootNote} · {request.scaleType} · {request.style} · {progressionSummary}</p>
          <p><strong>Arrangement</strong> {request.bpm} BPM · {mode === "custom" ? "Custom sections" : mode === "arrangement" ? "Arrangement" : "Single section"} · {mode === "custom"
            ? request.sections?.map((section) => `${section.name}: ${section.style}, ${section.bars} bars`).join(" · ")
            : `${request.bars} bars${mode === "arrangement" ? " per section" : ""}`}</p>
          <p><strong>Drum pattern</strong> {selectedPattern?.name ?? "None"}</p>
          {activeSection && <p><strong>Section behavior · {activeSection.name}</strong> {dimensions.map((dimension) => `${dimension}: ${activeSection.behavior[dimension]}`).join(" · ")}</p>}
          <p><strong>MIDI &amp; humanization</strong> Bass channel {request.channel + 1} · Velocity {request.velocity} · Variation {request.velocityVariation} · Timing {request.timingVariation} ticks · Swing {request.swing} · Accent downbeats {request.accentDownbeats ? "on" : "off"}</p>
          <p><strong>Seed</strong> {request.seed ?? "Random"}</p>
          {showSettingsWarning && <p className="snapshot-dirty">Unapplied settings</p>}
        </div>
      </summary>
          <div className="sound-modules">
          <section className="sound-module" aria-labelledby="music-heading">
          <h3 id="music-heading">Music</h3>
          <div className="parameter-grid">
            <label>Root note<select value={request.rootNote} onChange={(e) => update("rootNote", e.target.value)}>{catalogs?.roots.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Scale<select value={request.scaleType} onChange={(e) => update("scaleType", e.target.value)}>{catalogs?.scales.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Style<select value={request.style} onChange={(e) => update("style", e.target.value)}>{catalogs?.presets.map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          <label>Progression<select value={request.progression ?? ""} onChange={(e) => update("progression", e.target.value || null)}>
            <option value="">Random for scale</option>
            {request.progression && !catalogs?.progressions.some((p) => p.id === request.progression) &&
              <option value={request.progression}>Loaded: {result?.effectiveConfiguration.progressionName ?? request.progression}</option>}
            {catalogs?.progressions.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}
          </select></label>
          {selectedProgression && <p className="hint">{selectedProgression.chordSequence.join(" · ")} — {selectedProgression.description}</p>}
          </section>
          <section className="sound-module" aria-labelledby="arrangement-heading">
          <h3 id="arrangement-heading">Arrangement</h3>
          <div className="parameter-grid">
            <label>Tempo (BPM)<input type="number" min="30" max="300" required value={request.bpm} onChange={(e) => update("bpm", e.target.valueAsNumber)} /></label>
            <label>Mode<select value={mode} onChange={(e) => changeMode(e.target.value as Mode)}><option value="single">Single section</option><option value="arrangement">Arrangement</option><option value="custom">Custom sections</option></select></label>
            {mode !== "custom" && <label>{mode === "arrangement" ? "Bars (per section)" : "Bars"}<input type="number" min="1" max="512" required value={request.bars} onChange={(e) => update("bars", e.target.valueAsNumber)} /></label>}
          </div>
          {mode === "custom" && <div className="custom-sections"><h3>Sections</h3>
            {request.sections?.map((section, index) => <div className="section-editor" key={index}>
              <label>Name<input required value={section.name} onChange={(e) => updateCustom(index, { name: e.target.value })} /></label>
              <label>Style<select value={section.style} onChange={(e) => updateCustom(index, { style: e.target.value })}>{catalogs?.presets.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Bars<input type="number" min="1" max="512" required value={section.bars} onChange={(e) => updateCustom(index, { bars: e.target.valueAsNumber })} /></label>
              <button type="button" disabled={index === 0} onClick={() => moveCustom(index, -1)} aria-label={`Move ${section.name} up`}>↑</button>{" "}
              <button type="button" disabled={index === request.sections!.length - 1} onClick={() => moveCustom(index, 1)} aria-label={`Move ${section.name} down`}>↓</button>{" "}
              <button type="button" disabled={request.sections!.length === 1} onClick={() => { update("sections", request.sections!.filter((_, i) => i !== index)); }}>Remove</button>
            </div>)}
            <button type="button" onClick={() => update("sections", [...(request.sections ?? []), { name: `Section ${(request.sections?.length ?? 0) + 1}`, style: request.style, bars: 4 }])}>Add section</button>
            <p className="hint">{request.sections?.reduce((sum, s) => sum + s.bars, 0)} bars total (maximum 4096).</p>
          </div>}
          </section>
          <section className="sound-module" aria-labelledby="drums-heading">
            <h3 id="drums-heading">Drum pattern</h3>
            <label>Drum pattern
              <select value={patternId} disabled={!!busy} onChange={(event) => setPatternId(event.target.value)}>
                <option value="">None</option>
                {drumPatterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name} ({pattern.bars} {pattern.bars === 1 ? "bar" : "bars"})</option>)}
              </select>
            </label>
            {selectedPattern && <p className="hint">{selectedPattern.description}</p>}
            <div ref={setPatternPane} />
            <p className="hint">Generate Sketch replaces all preview tracks. Melody, pad, drums, and track edits are not included in packages, share codes, or bass and chords exports. Use All Tracks MIDI to export the current sketch.</p>
          </section>
          </div>
          <div className="settings-details">
          {activeSection && <details><summary>Section behavior
            <span className="detail-values">{activeSection.name} · {dimensions.map((dimension) => `${dimension} ${activeSection.behavior[dimension]}`).join(" · ")}</span>
          </summary>
            <label>Section<select value={sectionIndex} onChange={(e) => setSectionIndex(Number(e.target.value))}>
              {draftPackage?.effectiveConfiguration.sections.map((s, i) => <option key={i} value={i}>{s.name} · {s.style}</option>)}
            </select></label>
            {dimensions.map((dimension) => <label className="dimension" key={dimension}>
              <span>{dimension} · {activeSection.behavior[dimension]}</span>
              <input type="range" min="0" max="100" value={activeSection.behavior[dimension]} onChange={(e) => updateSectionBehavior(dimension, Number(e.target.value))} />
            </label>)}
            <p className="hint">Changes apply to this section when replaying. Changing style or mode rebuilds defaults.</p>
          </details>}
          <details><summary>MIDI &amp; humanization
            <span className="detail-values">Bass ch {request.channel + 1} · Velocity {request.velocity} ± {request.velocityVariation} · Timing {request.timingVariation} · Swing {request.swing} · Accents {request.accentDownbeats ? "on" : "off"}</span>
          </summary>
            <div className="grid-two">
              {([
                ["channel", "Bass export MIDI channel (1–16)", 1, 16, 1],
                ["velocity", "Velocity", 1, 127, 0],
                ["velocityVariation", "Velocity variation", 0, 127, 0],
                ["timingVariation", "Timing variation (ticks)", 0, 30, 0],
                ["swing", "Swing", 0, 0.5, 0],
              ] as const).map(([key, label, min, max, offset]) => <label key={key}>{label}<input type="number" required min={min} max={max} step={key === "swing" ? "0.01" : "1"} value={request[key] + offset} onChange={(e) => update(key, e.target.valueAsNumber - offset)} /></label>)}
            </div>
            <label className="check"><input type="checkbox" checked={request.accentDownbeats} onChange={(e) => update("accentDownbeats", e.target.checked)} /> Accent downbeats</label>
          </details>
          <details><summary>Seed &amp; variation <span className="detail-values">{request.seed ?? "Random"}</span></summary>
            <label>Seed <span className="hint">blank = random on new generation</span><input type="number" min="-2147483648" max="2147483647" value={request.seed ?? ""} onChange={(e) => update("seed", e.target.value === "" ? null : e.target.valueAsNumber)} /></label>
            <button type="button" onClick={() => update("seed", crypto.getRandomValues(new Int32Array(1))[0])}>New seed</button>
            <p className="hint">Keep the seed to compare settings. Reproduction requires a compatible engine.</p>
          </details>
          </div>
      </details>
          <details className="character-module">
            <summary><span id="character-heading">Character</span>
              <span className="detail-values">{dimensions.map((dimension) => `${dimension}: ${request[dimension] ?? "style default"}`).join(" · ")}</span>
            </summary>
            <div className="character-heading"><p className="eyebrow">PERFORMANCE CONTROLS</p>
              <p className="hint">Adjust all sections or use the style default.</p></div>
            <div className="character-strip">
              {dimensions.map((dimension) => <div key={dimension} className="character-channel" data-default={request[dimension] === null}>
                <label htmlFor={`character-${dimension}`} className="character-label">{dimension}</label>
                <span className="character-value">{request[dimension] === null ? "Style default" : request[dimension]}</span>
                <input id={`character-${dimension}`} aria-label={dimension} aria-valuetext={request[dimension] === null ? "Style default" : String(request[dimension])}
                  type="range" min="0" max="100" value={request[dimension] ?? 50} onChange={(e) => updateDimension(dimension, Number(e.target.value))} />
                <button type="button" aria-label={`Use style default for ${dimension}`} onClick={() => updateDimension(dimension, null)}>Default</button>
              </div>)}
            </div>
            <p className="hint">A muted fader shows a style default, not its resolved value. Move it to set an override.</p>
          </details>
        </fieldset>
      </form>
      </div>
        {!result ? <section className="empty card"><p className="eyebrow">YOUR NEXT IDEA STARTS HERE</p><h2>Make room for your next idea.</h2><p>Generate a sketch and press Play, or adjust the settings to shape your sound first.</p></section> : <>
          {showSettingsWarning && <p className="warning">Settings changed. The visualization, save, share, and MIDI actions use the previous result. Regenerate to apply changes.</p>}
          {result.effectiveConfiguration.channel === chordExportChannel && <p className="warning" role="status">
            Bass and chords both use MIDI channel 2 in the Bass + Chords export. They may play on the same instrument when routed to the same MIDI destination. Export is still available; change the bass channel and regenerate, or route the tracks separately in your DAW.
          </p>}
          <Preview ref={preview} pkg={result} disabled={busy === "Generating bassline" || busy === "Generating sketch"}
            playbackPane={playbackPane} transportPane={transportPane} patternPane={patternPane} drumDownloadPane={drumDownloadPane}
            allDownloadPane={allDownloadPane} onPreviewDownload={closeDownloads} sketch={sketch} sketchBusy={busy === "Generating sketch"}
            patternSelection={{ id: patternId, onChange: setPatternId }} onGeneratingChange={setTrackBusy} />
          <section className="card"><p className="eyebrow">THE DETAILS</p><h2>Package overview</h2>
            <div className="stats"><div><strong>{result.statistics?.noteCount ?? "—"}</strong><span>Notes</span></div><div><strong>{result.statistics?.uniqueNotes ?? "—"}</strong><span>Unique pitches</span></div><div><strong>{result.statistics?.lowestNote ?? "—"}–{result.statistics?.highestNote ?? "—"}</strong><span>Range</span></div><div><strong>{result.statistics?.averageVelocity ?? "—"}</strong><span>Avg. velocity</span></div><div><strong>{result.statistics?.averageNoteLengthBeats ?? "—"}</strong><span>Avg. beats</span></div></div>
            <details><summary>Effective sections &amp; package</summary><p>Format {result.version} · MIDI channel {result.effectiveConfiguration.channel + 1}</p>
              {result.effectiveConfiguration.sections.map((s, i) => <p key={i}><strong>{s.name}</strong> · {s.style} · {s.bars} bars · {dimensions.map((d) => `${d} ${s.behavior[d]}`).join(" · ")}</p>)}
            </details>
          </section>
        </>}
      </div>
    </main>
    </div>
    <div className="dock-region" ref={setTransportPane} hidden={!result} />
    {shareOpen && <Modal titleId="share-title" onClose={() => setShareOpen(false)}>
      <h2 id="share-title">Share this bassline</h2><p>Anyone with this code can recreate the settings. Codes do not include the note snapshot.</p>
      {sketch?.pkg === result && <p>Share codes do not include the sketch's melody, drums, or preview track edits.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {sharedCode && <><label>Share code<textarea readOnly value={sharedCode} rows={4} /></label>
        <div className="actions"><button type="button" disabled={!!busy} onClick={() => copy(sharedCode)}>Copy code</button><button type="button" disabled={!!busy} onClick={() => copy(`${window.location.origin}${window.location.pathname}#share=${sharedCode}`)}>Copy link</button></div>
        <p className="hint">Long links may not work everywhere. Use the code or save a package instead.</p></>}
      <button type="button" onClick={() => setShareOpen(false)}>Close</button>
    </Modal>}
    {loadOpen && <Modal titleId="load-title" onClose={() => setLoadOpen(false)}>
      <h2 id="load-title">Load a share code</h2><label>Share code<textarea value={code} onChange={(e) => setCode(e.target.value)} rows={5} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button type="button" className="primary" disabled={!!busy || !code.trim()} onClick={decode}>Load bassline</button><button type="button" onClick={() => setLoadOpen(false)}>Cancel</button></div>
    </Modal>}
  </div>;
}

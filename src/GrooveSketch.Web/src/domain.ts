import { dimensions, type GenerateRequest, type GenerationPackage, type Progression } from "./types";

// Kept in sync with GenerateRequest's OpenAPI x-suggested-values.
export const roots = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];
export const scales = ["Major", "Minor", "Dorian", "Mixolydian", "Lydian", "Phrygian", "Harmonic Minor", "Melodic Minor", "Major Pentatonic", "Minor Pentatonic", "Blues", "Natural Minor"];

export const initialRequest: GenerateRequest = {
  rootNote: "A", scaleType: "Minor", style: "Acid", bpm: 140, bars: 8,
  mode: "single", progression: null, seed: null, channel: 0, velocity: 100,
  velocityVariation: 0, timingVariation: 0, swing: 0, accentDownbeats: false,
  movement: null, groove: null, mutation: null, tension: null, repetition: null,
};

const tempoRanges: Record<string, readonly [number, number]> = {
  acid: [130, 150], techno: [125, 145], trance: [135, 150], dreamy: [75, 105],
  synthwave: [90, 120], pop: [100, 125], rave: [140, 165],
};

export function randomInitialRequest(seed: number, presets: string[], progressions: Progression[]): GenerateRequest {
  if (!presets.length || !progressions.length) throw new Error("Styles and progressions must be available to create a starting configuration.");
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
  const rootNote = pick(roots);
  const scaleType = pick(scales);
  const style = pick(presets);
  const progression = pick(progressions).id;
  const [min, max] = tempoRanges[style.toLowerCase()] ?? [110, 130];
  const bpm = min + Math.floor(next() * (max - min + 1));
  return { ...initialRequest, rootNote, scaleType, style, progression, seed, bpm };
}

export function requestFromPackage(pkg: GenerationPackage): GenerateRequest {
  const c = pkg.effectiveConfiguration;
  return {
    rootNote: c.rootNote, scaleType: c.scaleType, style: c.style, bpm: c.bpm,
    bars: c.bars, mode: c.mode === "arrangement" ? "arrangement" : "single",
    ...(c.mode === "custom" ? { sections: c.sections.map(({ name, style, bars }) => ({ name, style, bars })) } : {}),
    progression: c.requestedProgression, seed: pkg.seed, channel: c.channel,
    velocity: c.velocity, velocityVariation: c.velocityVariation,
    timingVariation: c.timingVariation, swing: c.swing, accentDownbeats: c.accentDownbeats,
    movement: c.movement, groove: c.groove, mutation: c.mutation,
    tension: c.tension, repetition: c.repetition,
  };
}

export function replayWithRequest(pkg: GenerationPackage, request: GenerateRequest): GenerationPackage {
  if (request.seed === null) throw new Error("A seed is required for replay.");
  const config = pkg.effectiveConfiguration;
  const sections = config.sections.map((section) => ({ ...section, behavior: { ...section.behavior } }));
  if (config.mode === "single") sections[0].bars = request.bars;
  if (config.mode === "arrangement" && request.bars !== config.bars) {
    sections.forEach((section) => { section.bars = request.bars; });
  }
  if (config.mode === "custom" && request.sections) {
    sections.forEach((section, index) => {
      section.name = request.sections![index].name;
      section.bars = request.sections![index].bars;
    });
  }
  return {
    ...pkg, seed: request.seed, notes: null, statistics: null,
    effectiveConfiguration: {
      ...config, rootNote: request.rootNote, scaleType: request.scaleType,
      style: request.style, bpm: request.bpm, bars: request.bars, seed: request.seed,
      channel: request.channel, velocity: request.velocity,
      velocityVariation: request.velocityVariation, timingVariation: request.timingVariation,
      swing: request.swing, accentDownbeats: request.accentDownbeats,
      movement: request.movement, groove: request.groove, mutation: request.mutation,
      tension: request.tension, repetition: request.repetition,
      requestedProgression: request.progression, sections,
    },
  };
}

export function needsRebuild(pkg: GenerationPackage, request: GenerateRequest): boolean {
  const c = pkg.effectiveConfiguration;
  const mode = request.sections ? "custom" : request.mode;
  if (c.mode !== mode || (mode === "single" && request.style !== c.style)) return true;
  if (dimensions.some((key) => request[key] === null && c[key] !== null)) return true;
  if (mode === "custom" && request.sections) {
    return request.sections.length !== c.sections.length ||
      request.sections.some((section, i) => section.style !== c.sections[i].style);
  }
  return false;
}

export function isPackage(value: unknown): value is GenerationPackage {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<GenerationPackage>;
  return Number.isInteger(p.version) && Number.isInteger(p.seed) &&
    !!p.effectiveConfiguration && typeof p.effectiveConfiguration === "object" &&
    Array.isArray(p.effectiveConfiguration.sections);
}

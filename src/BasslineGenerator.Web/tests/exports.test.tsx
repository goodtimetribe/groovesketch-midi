// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { initialRequest } from "../src/domain";
import type { GenerationPackage } from "../src/types";

vi.mock("../src/Preview", () => ({ default: () => null }));

const pkg: GenerationPackage = {
  version: 1, engineVersion: "1.0.0", seed: 7, notes: [], statistics: null,
  effectiveConfiguration: {
    ...initialRequest, seed: 7, requestedProgression: null,
    progressionId: "x", progressionName: "X", chordSequence: ["i"],
    sections: [{ name: "Section", style: "Acid", bars: 8,
      behavior: { movement: 10, groove: 20, mutation: 30, tension: 40, repetition: 50 } }],
  },
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent === name);
  if (!found) throw new Error(`Button not found: ${name}`);
  return found;
}

async function generate() {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function setBassChannel(channel: number) {
  const input = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Bass export MIDI channel (1–16)"))!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(channel));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function setRange(input: HTMLInputElement, value: number) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn((path: string) => {
    if (path === "/api/presets") return Promise.resolve(json(["Acid"]));
    if (path === "/api/progressions") return Promise.resolve(json([{ id: "x", name: "X", description: "", chordSequence: ["i"], mood: "", suggestedUse: "" }]));
    if (path === "/api/generate/package") return Promise.resolve(json(pkg));
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MIDI export actions", () => {
  it("shows character overrides and defaults in the collapsed settings and generated request", async () => {
    const character = container.querySelector<HTMLDetailsElement>(".character-module")!;
    expect(character.open).toBe(false);
    await act(async () => character.querySelector("summary")!.click());
    const movement = container.querySelector<HTMLInputElement>('#character-movement')!;
    const groove = container.querySelector<HTMLInputElement>('#character-groove')!;
    expect(movement.getAttribute("aria-valuetext")).toBe("Style default");
    await setRange(movement, 73);
    await setRange(groove, 42);
    expect(movement.getAttribute("aria-valuetext")).toBe("73");
    const humanization = [...container.querySelectorAll("summary")].find((item) => item.textContent?.startsWith("MIDI & humanization"))!;
    expect(humanization.textContent).toContain("Velocity 100");
    expect(humanization.closest("details")?.open).toBe(false);
    const panel = container.querySelector<HTMLDetailsElement>(".settings-panel")!;
    await act(async () => panel.querySelector("summary")!.click());
    const snapshot = panel.querySelector(".settings-snapshot")!;
    expect(character.querySelector("summary")?.textContent).toContain("movement: 73");
    expect(character.querySelector("summary")?.textContent).toContain("groove: 42");
    expect(character.querySelector("summary")?.textContent).toContain("mutation: style default");
    expect(snapshot.textContent).toContain("Unapplied settings");
    await act(async () => panel.querySelector("summary")!.click());
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Use style default for movement"]')!.click());
    expect(movement.getAttribute("aria-valuetext")).toBe("Style default");
    await generate();
    const request = JSON.parse(fetchMock.mock.calls.find(([path]) => path === "/api/generate/package")![1].body);
    expect(request.movement).toBeNull();
    expect(request.groove).toBe(42);
  });

  it("preserves per-section behavior edits alongside global character overrides", async () => {
    await generate();
    const section = [...container.querySelectorAll("details")].find((item) => item.querySelector("summary")?.textContent?.startsWith("Section behavior"))!;
    await setRange(section.querySelector<HTMLInputElement>('input[type="range"]')!, 31);
    await setRange(container.querySelector<HTMLInputElement>('#character-groove')!, 77);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(json(pkg));
    await generate();
    const request = JSON.parse(fetchMock.mock.calls.find(([path]) => path === "/api/package/regenerate")![1].body);
    expect(request.effectiveConfiguration.groove).toBe(77);
    expect(request.effectiveConfiguration.sections[0].behavior).toMatchObject({ movement: 31, groove: 77 });
  });

  it("collapses settings without losing edits", async () => {
    const panel = container.querySelector<HTMLDetailsElement>(".settings-panel")!;
    const summary = panel.querySelector("summary")!;
    const tempo = [...panel.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Tempo"))!.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(tempo, "145");
      tempo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(panel.open).toBe(true);
    await act(async () => summary.click());
    expect(panel.open).toBe(false);
    await act(async () => summary.click());
    expect(panel.open).toBe(true);
    expect(tempo.value).toBe("145");
  });

  it("collapses Character independently of Settings and retains its values", async () => {
    const settings = container.querySelector<HTMLDetailsElement>(".settings-panel")!;
    const character = container.querySelector<HTMLDetailsElement>(".character-module")!;
    expect(settings.contains(character)).toBe(false);
    expect(character.open).toBe(false);
    await act(async () => character.querySelector("summary")!.click());
    await setRange(character.querySelector<HTMLInputElement>("#character-movement")!, 63);
    await act(async () => settings.querySelector("summary")!.click());
    expect(settings.open).toBe(false);
    expect(character.open).toBe(true);
    await act(async () => character.querySelector("summary")!.click());
    expect(character.querySelector("summary")?.textContent).toContain("movement: 63");
    await act(async () => settings.querySelector("summary")!.click());
    expect(character.open).toBe(false);
    await act(async () => character.querySelector("summary")!.click());
    expect(character.querySelector<HTMLInputElement>("#character-movement")!.value).toBe("63");
  });

  it("keeps tempo and arrangement bar units in their labels", async () => {
    const labels = () => [...container.querySelectorAll(".sound-settings label")];
    expect(labels().find((label) => label.textContent?.startsWith("Tempo"))?.firstChild?.textContent).toBe("Tempo (BPM)");
    const mode = labels().find((label) => label.textContent?.startsWith("Mode"))!.querySelector("select")!;
    await act(async () => { mode.value = "arrangement"; mode.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(labels().find((label) => label.textContent?.startsWith("Bars"))?.firstChild?.textContent).toBe("Bars (per section)");
  });

  it("groups document actions and shows the generated summary in the playback sidebar", async () => {
    const nav = container.querySelector("nav")!;
    expect([...nav.querySelectorAll("button")].map((item) => item.textContent)).toEqual([
      "Save package", "Share", "Download Bass + Chords MIDI", "▾", "Download Bass MIDI", "Download All Tracks MIDI (Circuit Tracks)", "Download Circuit Tracks Drum MIDI", "Load package", "Load code",
    ]);
    expect(button("Save package").disabled).toBe(true);
    await generate();
    expect(button("Save package").disabled).toBe(false);
    expect(button("Share").disabled).toBe(false);
    const settings = container.querySelector(".sound-settings")!;
    const summary = container.querySelector("aside .result-summary")!;
    expect(settings.querySelector(".result-summary")).toBeNull();
    expect(summary.closest("details")).toBeNull();
    expect(summary.closest('[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelector(".announcements")?.textContent).not.toContain("Bassline generated.");
    expect(summary.textContent).toContain("Generated bassline:");
    expect(settings.textContent).toContain("SHAPE YOUR SOUND");
    expect(summary.textContent).toContain("X (i) · Seed 7 · Engine 1.0.0");
    const before = summary.textContent;
    await setBassChannel(2);
    expect(summary.textContent).toBe(before);
    expect(container.textContent).toContain("Settings changed.");
    expect(button("Regenerate Bass Package").form).toBe(container.querySelector("form"));
    const creative = container.querySelector('[aria-label="Creative actions"]')!;
    expect(creative.contains(button("Generate Sketch"))).toBe(true);
    expect(creative.contains(button("Regenerate Bass Package"))).toBe(true);
    expect(settings.contains(creative)).toBe(false);
  });

  it("opens and dismisses the extra download options", async () => {
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="More MIDI downloads"]')!;
    const options = container.querySelector<HTMLElement>("#download-options")!;
    expect(options.hidden).toBe(true);
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(options.hidden).toBe(false);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(options.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
    await act(async () => toggle.click());
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(options.hidden).toBe(true);
  });

  it("disables both exports until a package is generated", async () => {
    expect(button("Download Bass MIDI").disabled).toBe(true);
    expect(button("Download Bass + Chords MIDI").disabled).toBe(true);
    await generate();
    expect(button("Download Bass MIDI").disabled).toBe(false);
    expect(button("Download Bass + Chords MIDI").disabled).toBe(false);
  });

  it("warns based on the exported channel, not an unapplied channel change", async () => {
    await generate();
    expect(container.textContent).not.toContain("Bass and chords both use MIDI channel 2");
    await setBassChannel(2);
    expect(container.textContent).not.toContain("Bass and chords both use MIDI channel 2");

    const collision = { ...pkg, effectiveConfiguration: { ...pkg.effectiveConfiguration, channel: 1 } };
    fetchMock.mockResolvedValueOnce(json(collision));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await generate();
    expect(container.querySelector(".warning[role='status']")?.textContent).toContain("Bass and chords both use MIDI channel 2");
    expect(button("Download Bass + Chords MIDI").disabled).toBe(false);
    await setBassChannel(1);
    expect(container.textContent).toContain("Bass and chords both use MIDI channel 2");

    fetchMock.mockResolvedValueOnce(new Response("midi", { headers: { "content-type": "audio/midi" } }));
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: vi.fn().mockReturnValue("blob:test") }));
    vi.spyOn(window, "setTimeout").mockImplementation(() => 1);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await act(async () => button("Download Bass + Chords MIDI").click());
    expect(fetchMock).toHaveBeenLastCalledWith("/api/package/combined-midi", expect.objectContaining({ body: JSON.stringify(collision) }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("downloads combined MIDI and disables exports while rendering", async () => {
    await generate();
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const createUrl = vi.fn().mockReturnValue("blob:test");
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: createUrl }));
    vi.spyOn(window, "setTimeout").mockImplementation(() => 1);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("bassline-and-chords.mid");
      expect(this.href).toBe("blob:test");
    });

    await act(async () => button("Download Bass + Chords MIDI").click());
    expect(button("Download Bass MIDI").disabled).toBe(true);
    expect(button("Download Bass + Chords MIDI").disabled).toBe(true);
    expect(container.textContent).toContain("Rendering MIDI");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/package/combined-midi", expect.objectContaining({
      method: "POST", body: JSON.stringify(pkg),
    }));
    await act(async () => resolveResponse(new Response("midi", { headers: { "content-type": "audio/midi" } })));
    expect(createUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("MIDI download started");
    expect(button("Download Bass + Chords MIDI").disabled).toBe(false);
  });

  it("keeps the bass-only download separate", async () => {
    await generate();
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="More MIDI downloads"]')!;
    await act(async () => toggle.click());
    fetchMock.mockResolvedValueOnce(new Response("bass", { headers: { "content-type": "audio/midi" } }));
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: vi.fn().mockReturnValue("blob:bass") }));
    vi.spyOn(window, "setTimeout").mockImplementation(() => 1);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("bassline.mid");
    });
    await act(async () => button("Download Bass MIDI").click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/package/midi", expect.objectContaining({ body: JSON.stringify(pkg) }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("shows a combined export failure without downloading", async () => {
    await generate();
    fetchMock.mockResolvedValueOnce(json({ error: "Package is invalid." }, 400));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await act(async () => button("Download Bass + Chords MIDI").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Package is invalid.");
    expect(click).not.toHaveBeenCalled();
    expect(button("Download Bass + Chords MIDI").disabled).toBe(false);
  });
});

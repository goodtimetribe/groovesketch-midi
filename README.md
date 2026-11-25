# GrooveSketch MIDI — User Guide

[![CI](https://github.com/goodtimetribe/groovesketch-midi/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/goodtimetribe/groovesketch-midi/actions/workflows/ci.yml)

GrooveSketch MIDI is a browser-based workspace for creating, shaping, and
playing multi-track MIDI sketches. Generate bass, chords, melody, pads, and
drums; audition ideas with browser sounds or route them to MIDI devices; then
export a sketch for a DAW or compatible hardware.

## What you can do

- Start with a generated musical idea and shape it with track actions,
  patterns, and variations.
- Work with sections, keys, scales, styles, progressions, and reproducible
  seeds.
- Preview parts together, change playback routing, and export MIDI.
- Save and reload generation packages or share a sketch with a share code.

## Quick start

Run the app locally. You will need the .NET 10 SDK, Node.js with npm, and a
modern browser.

1. In a terminal at the repository root, start the API:

   ```sh
   dotnet run --project src/GrooveSketch.Api
   ```

2. In a second terminal, install the Web app dependencies and start it:

   ```sh
   cd src/GrooveSketch.Web
   npm ci
   npm run dev
   ```

3. Open the local URL printed by Vite (usually `http://127.0.0.1:5173`).
   Choose a key, scale, style, tempo, and progression if you want to change
   the initial settings. Select a drum pattern, choose **Generate Sketch**, and
   press **Play** to hear the result.

For example, try **Pop** with **Major**, or **Acid** with **Minor**. The app
starts with a randomized configuration and seed; keep the seed and settings to
recreate an idea. A selected drum pattern is needed for **Generate Sketch**.

## Shape, route, and export

Use the piano roll to inspect the tracks and the creative controls to replace
content, apply a pattern, or create a variation. Choose a logical role before
an action; changing a track's playback destination does not change its role or
the generated notes.

To audition with external gear or a virtual MIDI port, connect the device,
refresh the available devices, grant MIDI permission, and select an output and
channel for each track. Device routing controls playback only. Routing profiles
can save your local output and channel choices in the browser.

Choose the export that fits your workflow:

- **Download Bass MIDI** for bass alone.
- **Download Bass + Chords MIDI** for those two parts in one file.
- **Circuit Tracks Drum MIDI** for the selected drum pattern.
- **Download All Tracks MIDI (Circuit Tracks)** for the current preview tracks
  in one multitrack file.

MIDI exports contain notes and channel assignments, not a physical device
selection. The All Tracks export uses Circuit Tracks track/channel conventions;
see the [routing and MIDI design](docs/midi-routing-design.md) for details.

## Developer documentation

- [Programmer's Guide](docs/programmers-guide.md) — architecture, project
  structure, build and test instructions, generation domains, API, and extension
  guidance.
- [MIDI routing design](docs/midi-routing-design.md) — logical roles, routing,
  compatibility, and export behavior.

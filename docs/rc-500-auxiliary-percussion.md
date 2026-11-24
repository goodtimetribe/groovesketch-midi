# RC-500 auxiliary percussion investigation

## Conclusion

An additional percussion track **can target the RC-500 on a dedicated MIDI
channel**, but it should be treated as a future device-specific export rather
than as another generic melodic track.

The RC-500 receives MIDI Note messages and uses them to play its internal drum
sounds. Its `RX NOTE CH` setting is independent from `RX CTL CH`, so note
traffic can use a dedicated channel while control and memory changes use a
different one. `RX NOTE CH` accepts channels 1-16 and defaults to 10.

This makes the existing drum channel (10) compatible with the RC-500 defaults,
or allows an exported percussion track to use another configured channel. MIDI
channel selection alone does not choose a drum sound: the note number selects
the sound/part.

## Device limitations

- The RC-500 has a Rhythm engine and 2 phrase tracks. MIDI Note input plays the
  Rhythm engine's internal drum sounds; it does not add a third phrase track or
  a general-purpose sampler.
- Rhythm kits expose four individually enabled parts (`PART1`-`PART4`).
  GrooveSketch drum patterns already have four logical roles, but the RC-500's
  relationship between incoming notes and those parts must not be inferred from
  the Circuit Tracks mapping.
- Externally triggered drum sounds can be sent to a phrase track for recording
  with the Rhythm `OUTPUT=LOOP` setting. Otherwise configure the normal Rhythm
  output for live monitoring.
- A note sequence cannot select or upload a custom percussion sample. Kit and
  part availability are controlled by the RC-500 memory/rhythm settings.
- MIDI synchronization requires MIDI Clock/Start/Stop separately from Note
  data. The GrooveSketch Type 1 files currently describe note events and tempo;
  they do not configure the RC-500's rhythm kit, parts, or routing.

## MIDI mapping

The public RC-500 parameter guide documents the receive channel but does not
publish a complete incoming drum note-to-sound table. Before enabling an
RC-500 export preset, verify the required notes against a physical RC-500 for
the intended firmware and kit. In particular:

- record and compare General MIDI-style kick, snare, and hat notes;
- identify which notes address each of `PART1`-`PART4`;
- check how Note On velocity, Note Off, and overlapping notes affect each part;
- confirm behavior for both direct Rhythm output and `OUTPUT=LOOP`.

Until that verification is complete, the safe export boundary is "send the
existing source drum-note numbers on the configured channel." Do not reuse
Circuit Tracks note remapping for the RC-500: that mapping rewrites kick 36 to
60, snare 38 to 62, hats 42/46 to 64, and percussion to 65 for Circuit Tracks
Drum 1-4.

## Export implications

The current All Tracks export writes one `Drums` track on channel 10. It
combines kick, snare, hats, and auxiliary percussion, which is useful for a
single drum receiver but prevents routing only the auxiliary part to RC-500.
The current Circuit Tracks drum export is device-specific and must remain
unchanged.

A later RC-500 option should:

1. add an export-only split for the existing `drum4`/auxiliary percussion role;
2. preserve the source MIDI notes until an RC-500 note map is verified;
3. allow a dedicated output MIDI channel (default 10);
4. emit that split as a separately named Type 1 MIDI track so DAW users can
   route it independently;
5. keep kick, snare, and hats on the existing drum export unless the user
   explicitly chooses the RC-500 split;
6. document that the RC-500 itself must be configured for the matching
   `RX NOTE CH`, rhythm kit, enabled parts, output, and clock mode.

This split is feasible without changing Core generation or the API contract:
all required content already exists in the frontend drum pattern data. Playback
and export can be implemented independently so this research does not require
mixing RC-500 behavior into the Core model.

## Sources

- [BOSS RC-500 Parameter Guide](https://static.roland.com/assets/media/pdf/RC-500_Parameter_eng01_W.pdf):
  `RX NOTE CH`, rhythm `PART1`-`PART4`, and Rhythm output including `LOOP`.
- [BOSS RC-500 Owner's Manual](https://static.roland.com/assets/media/pdf/RC-500_eng01_W.pdf):
  MIDI receive/transmit, synchronization, and Rhythm operation.
- `src/BasslineGenerator.Web/src/hardwareTracks.ts`: current drum-role and
  channel definitions.
- `src/BasslineGenerator.Web/src/allTracksMidi.ts`: current combined Type 1
  drum-track export.
- `src/BasslineGenerator.Web/src/circuitTracksDrums.ts`: existing
  Circuit Tracks-specific note rewriting.

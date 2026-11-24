# MIDI routing design

## Boundary

GrooveSketch generation should own **logical musical roles**, while routing owns the
transport destination:

```text
logical role -> MIDI channel and output -> receiving device
```

A role describes musical intent (`bass`, `chords`, `lead`, `pad`, `drums`, or
`aux-percussion`). It does not name an instrument, a browser track, a DAW track,
or a hardware lane. Each logical track has a user-assignable display name, plus a
route containing a channel and an opaque output identifier. The display name is
independent of the role: for example, the `bass` role may be named “Moog Bass.”
Resolution of an output identifier to a Web MIDI output is a front-end concern.
Standard MIDI files contain channel assignments but cannot select a physical
output or carry the route's display name.

`src/BasslineGenerator.Web/src/logicalRoles.ts` is the minimal proof of this
boundary. It defines device-independent roles, a `RoleRouting` model, validation,
legacy-role normalization, user-assignable track names, and reference
assignments. In particular, drums may use channel 10 while auxiliary percussion
independently uses channel 8.
The mapping also applies whether the destination is represented by a DAW port,
a sampler, or hardware; none of those device names belong in the role model.

## Track actions

Actions target these logical roles, not the output used to audition them:

| Action | Meaning |
| --- | --- |
| **Rebuild** | Generate new content from the current musical context. |
| **Apply** | Apply a pattern, style, sound, or setting while preserving unrelated content. |
| **Vary** | Produce a related variation that keeps the role's musical intent. |

Current defaults preserve the workflow that predates this vocabulary: Bass
uses **Vary**, Chords/Lead/Pad use deterministic **Rebuild**, and Drums/Aux
Percussion use **Apply**. A user can explicitly choose another action supported
by that role. Physical track IDs remain an adapter for playback, routing, and
Circuit Tracks compatibility only.

## Migration

Migration can be incremental and does not change generation:

1. Keep current package data, generated notes, `MelodicContent` hardware keys,
   and playback transport unchanged.
2. Normalize existing track roles at the boundary: `kick`, `snare`, and `hats`
   map to `drums`; the legacy Drum 4 `percussion` role maps to
   `aux-percussion`. Existing musical role values are already valid.
3. Introduce an optional role route alongside each existing playback route.
   During transition, resolve missing role routes through the hardware track's
   existing route, so saved profiles continue to work.
4. Split Drum 4 notes into the `aux-percussion` playback lane only when an
   independent route is configured. Until then, they continue to share the
   existing drum route.
5. Migrate profile storage as a versioned operation, preserving bass, chord,
   and drum names, destinations, and channels. Add lead, pad, and
   auxiliary-percussion defaults only when absent; existing unnamed entries use
   the role's default display name. Never reinterpret a saved physical-device ID.
6. In a later UI increment, display the user-editable track name beside its role
   and route, and use the stable
   hardware IDs only for legacy views, colors, and Circuit Tracks compatibility.

The action terminology migrates independently of storage. Existing saved
packages, share codes, route profiles, and device IDs remain valid; users do not
need to rename tracks or recreate profiles. “Regenerate” corresponds to the
existing default shown above for each role.

This avoids a generation rewrite and allows one route implementation to support
future roles.

## Export compatibility

The current bass, bass-and-chords, Circuit Tracks drum, and All Tracks MIDI
exports are compatibility surfaces:

- Existing factory overloads and track order remain unchanged.
- Bass-only and bass-and-chords exports retain their request/package channels.
- The All Tracks export continues to emit `Synth1`, `Synth2`, `Midi1`, `Midi2`,
  and `Drums` on the documented Circuit Tracks channels.
- The Circuit Tracks drum mapping, including Drum 4 sample notes, is preserved.
- Saved packages and share codes do not acquire routing state, and existing
  files do not need conversion.
- Role-routed playback or export is opt-in in a future increment. A role route
  does not silently alter today's exports.

Routing output IDs are intentionally not serialized into Standard MIDI or the
stateless API's generation package. A future user-exported routing preset can be
stored separately from musical generation data.

## Auxiliary percussion

`aux-percussion` is distinct from `drums`. A profile can therefore assign:

```text
drums           -> output RD-8, channel 10
aux-percussion  -> output RC-500, channel 8
```

Both rows may be renamed by the user without changing their roles or output
assignments.

When scheduling, notes classified as kick/snare/hats use the drums route, while
Drum 4-style notes use the auxiliary route. If that route is absent, migration
falls back to the existing drum route for compatibility. Circuit Tracks
playback may still apply its note mapping before output, but mapping is an
adapter and is not part of the role definition.

## New devices and outputs

RC-500, RD-8, RD-9, DAWs, virtual ports, and hardware synthesizers require no new
musical-role values. They are output destinations discovered and selected by
the playback layer. A preset can recognize a device by stable ID or unique
name, but the role-routing model stores only the opaque output ID and channel.
For example, `lead -> channel 3` can target a DAW input today and a hardware
synth tomorrow without changing the generated lead.

Device-specific behavior, such as Circuit Tracks drum-note translation or
Program Change support, remains behind an output adapter. Unsupported
capabilities should be reported or ignored by that adapter rather than encoded
into `LogicalRole`.

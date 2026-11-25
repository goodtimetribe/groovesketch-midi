# GrooveSketch MIDI project-structure alignment audit

## Scope and summary

This is a discovery and planning document only. No project names, paths, public
contracts, user-facing text, or application behavior are changed by this audit.

The product is already branded **GrooveSketch MIDI** in the Web application and
has frontend modules for sketches, logical roles, routing profiles, playback,
hardware tracks, patterns, and track actions. Its repository, .NET projects,
namespaces, several primary types, documentation, and some UI/API labels still
reflect the earlier bassline-generator scope. The best fit is a staged migration:
clarify product terminology first, then reorganize and rename internals while
preserving bass as a valid musical role and protecting existing integrations.

## Findings

### Directory and project names

| Current name | Alignment concern | Candidate direction |
| --- | --- | --- |
| `/home/runner/work/groovesketch-midi/groovesketch-midi/BasslineGenerator.sln` | Solution identity is still bassline-specific. | `GrooveSketch.sln` or `GrooveSketchMidi.sln`. |
| `/home/runner/work/groovesketch-midi/groovesketch-midi/src/BasslineGenerator.Core` | Reusable generation and MIDI logic is broader than bassline generation. | `GrooveSketch.Core`, keeping it independent of the front ends. |
| `/home/runner/work/groovesketch-midi/groovesketch-midi/src/BasslineGenerator.Api` | The project prefix is stale, though API remains an accurate boundary. | `GrooveSketch.Api`. |
| `/home/runner/work/groovesketch-midi/groovesketch-midi/src/BasslineGenerator.Cli` | The project prefix is stale, though CLI remains an accurate boundary. | `GrooveSketch.Cli`. |
| `/home/runner/work/groovesketch-midi/groovesketch-midi/src/BasslineGenerator.Web` | The app name is stale; its contents are already organized around current product concerns. | `GrooveSketch.Web`; consider subdirectories by domain only if it improves navigation. |
| `/home/runner/work/groovesketch-midi/groovesketch-midi/tests/BasslineGenerator.Tests` | Test project name follows the old product name. | `GrooveSketch.Tests` or `GrooveSketch.Core.Tests`, depending on the test boundary. |

The Core directory already separates `Generation`, `Models`, `Interfaces`,
`MusicTheory`, `Packaging`, `Presets`, and `Export`. The Web source is flatter,
but already has distinct modules such as `sketch.ts`, `logicalRoles.ts`,
`routingProfiles.ts`, `playback.ts`, `hardwareTracks.ts`, `drumPatterns.ts`,
and `trackActions.ts`. This is a reason to migrate names incrementally rather
than introduce a new architecture wholesale.

### Types, files, and namespaces

| Current name | Why it merits review | Suggested direction |
| --- | --- | --- |
| `BasslineGenerator.Generation.BasslineGenerator` in `/home/runner/work/groovesketch-midi/groovesketch-midi/src/BasslineGenerator.Core/Generation/BasslineGenerator.cs` | The main generator is consumed by package and API workflows that are no longer limited to a bassline. | A neutral generation or sketch-generation service name; keep bass-note generation explicit in its specialized collaborators. |
| `IBassGenerator` in `/home/runner/work/groovesketch-midi/groovesketch-midi/src/BasslineGenerator.Core/Interfaces/IBassGenerator.cs` | The abstraction name narrows the generator/package boundary to bass. | A neutral generation-service interface, with compatibility handling for public consumers. |
| `BasslineController` in `/home/runner/work/groovesketch-midi/groovesketch-midi/src/BasslineGenerator.Api/Controllers/BasslineController.cs` | It handles package, generation, replay, MIDI, and share-code operations, not only bassline endpoints. | A generation, sketch, or package controller name; keep route changes separate. |
| Namespace `BasslineGenerator.*` across Core, API, and CLI | Namespace branding does not match the product and is a broad source/API rename. | `GrooveSketch.*` or `GrooveSketchMidi.*`, applied after a compatibility decision. |
| `BassMovementGenerator`, `IBassGenerator`, and `BassNote` | These names explicitly describe bass-domain behavior, but bass remains one of the application's logical roles. | Retain these when the implementation is specifically bass-related; rename only abstractions that have become multi-role. |
| `BasslineGenerator.Tests` and `BasslineGenerator.sln` | Project and solution names repeat the outdated identity. | Rename with project references, CI commands, and developer documentation updated together. |

The Web layer's `Sketch`, role, routing, playback, hardware, and pattern
modules already align well with the current vocabulary. They are useful
boundaries to preserve and potential models for organizing future work.

### User-facing terminology

The app header in `/home/runner/work/groovesketch-midi/groovesketch-midi/src/BasslineGenerator.Web/src/App.tsx`
already says “GrooveSketch MIDI” and offers “Generate Sketch.” Some surrounding
copy and supporting docs still tell a bassline-generator story:

- The README title, introduction, architecture diagram, and setup text describe
  a bassline library/application. Its programmatic-use section also teaches
  callers to instantiate `BasslineGenerator`.
- The Web workspace still uses “Generating bassline,” “Shared bassline,”
  “Load bassline,” and “Generated bassline” for workflows that may produce and
  replay a sketch with multiple tracks.
- “Generate Bass Package,” the bass-only and bass-plus-chords export labels,
  bass channel controls, and bass role labels are accurate when they refer to
  those specific functions; they should not all be mechanically changed.
- The API controller and response documentation describe bassline generation,
  and default MIDI filenames include `bassline`. API paths and response
  filenames may already be used by external clients.
- The CLI's output filename and README examples still use `bassline`; these
  are discoverable user-facing names and may be depended on by scripts.
- The README and CI/deployment configuration retain old repository, artifact,
  checkout, publish-directory, and system-service identifiers. Those names are
  operational identifiers rather than merely displayed text.
- Browser persistence keys such as `bassline-routing-profiles` and
  `bassline-preview-*` in the Web app are internal, but changing them without
  reading/migrating existing values could discard user preferences.

Use **sketch** for the editable multi-track creative result and workflow,
**role** for musical intent, **routing** for output/channel assignment,
**playback** for the transport and audition path, and **pattern/variation**
for reusable rhythmic material and its transformations. Keep **bass** for the
bass role, bass-specific generation, and bass-only exports.

## Organization opportunities

1. **Name boundaries by responsibility.** Use product-level names for solution,
   project, and broad generation/package abstractions; reserve `Bass*` names
   for types whose behavior is genuinely specific to the bass role.
2. **Make the sketch workflow explicit.** The existing frontend sketch
   composition is a useful domain boundary. If the backend grows to own
   multi-track sketch generation, give that orchestration a clear boundary
   rather than expanding the bassline generator class indefinitely.
3. **Keep roles separate from destinations.** Preserve the existing separation
   between logical roles and hardware tracks/output routing. A device, channel,
   or physical track should not become a musical role.
4. **Group by cohesive domain when it earns its cost.** Potential domains are
   sketches/packages, musical roles and track content, patterns/variations,
   routing/hardware, and playback/transport. Current frontend modules already
   cover much of this; avoid empty placeholder folders or splitting small,
   cohesive files solely for symmetry.
5. **Treat contracts and operational identity separately.** Internal project
   names, public API routes, package formats, browser keys, deployment service
   names, and output filenames have different compatibility requirements and
   should not be renamed as one operation.

## Recommended renaming plan

1. Adopt a naming glossary and classify each `Bass*` occurrence as either
   product-wide legacy terminology or valid bass-role terminology. Record
   current external contracts and persistent identifiers before editing.
2. Align README and non-contract user-facing language with GrooveSketch MIDI
   and sketches. Keep bass-only export labels and genuinely bass-specific
   controls precise. Update examples and diagrams to show sketches, roles,
   routing, and playback where appropriate.
3. Rename internal solution/project/folder names and broad namespaces/types in
   a dedicated change. Update references, tests, CI paths, and developer
   documentation atomically. Preserve compatibility for consumers of public
   .NET types where required.
4. Reorganize backend code only around proven cohesive responsibilities. Keep
   Core independent of API, CLI, and Web; avoid introducing frontend or device
   dependencies into Core.
5. Handle external and persisted identifiers in separate, versioned steps.
   Introduce any replacement routes or files alongside the old forms, provide
   migrations or aliases for saved/browser data where appropriate, and
   deprecate old forms only with an explicit compatibility policy.
6. Remove compatibility aliases and old names only after usage, migration, and
   release policy are understood and documented.

## Risk assessment

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Breaking API routes, response content types, generated filenames, or serialized fields | High for API clients and scripts. | Preserve routes and formats initially; add versioned alternatives and contract tests before deprecation. |
| Breaking public .NET namespaces, assembly/project references, CLI flags, or output names | High for downstream consumers and automation. | Provide a transition package/namespace or compatibility wrappers where practical; document and version breaking changes. |
| Losing browser preferences when local-storage keys change | Medium for users with saved routing, patch, sound, or volume settings. | Read old keys during migration, validate values, write the new format, and test migration/failure behavior. |
| Renaming deployment paths, artifacts, systemd services, or repository URLs | High operational risk despite no musical behavior change. | Coordinate workflow, README, VPS setup, service configuration, and rollback; keep operational renames separate. |
| Renaming all `Bass*` terms indiscriminately | Medium to high semantic risk. | Retain names that correctly describe the bass role and bass-only operations. |
| Broad path and namespace churn in one pull request | Medium risk of missed project references, CI paths, links, or test fixtures. | Use small phases, repository-wide searches, and full build/test/publish checks at each contract boundary. |

## Suggested implementation phases

1. **Discovery and policy (low risk):** agree on a glossary and target names;
   inventory public API, .NET, CLI, browser-storage, file, and deployment
   compatibility surfaces. This report belongs to this phase.
2. **Documentation and compatible wording (low risk):** update product
   description, architecture diagrams, and broad workflow labels while
   retaining accurate bass-specific labels and existing contracts.
3. **Internal project and type renames (moderate risk):** rename the solution,
   project directories, namespaces, and broad generator/controller
   abstractions; update references and run frontend plus .NET build/test and
   API publish checks.
4. **Domain organization (moderate risk):** group code only where sketches,
   roles, patterns/variations, routing/hardware, and playback have stable
   ownership boundaries. Preserve the Core/front-end separation.
5. **Versioned compatibility changes (high risk):** only if still valuable,
   migrate API routes, persistent keys, CLI/file names, or deployment identity
   with aliases/migrations, explicit release notes, and rollback coverage.
6. **Deprecation and cleanup (high risk):** remove legacy forms after the
   compatibility window and migration evidence support doing so.

namespace BasslineGenerator.MusicTheory;

public enum MelodyStyle
{
    Balanced,
    Dreamy,
    Pop,
    Acid,
    Rave,
    Rock,
    Funk,
    Jazz,
    Reggae,
    HipHop
}

public enum MelodyRhythmArchetype
{
    Steady,
    Syncopated,
    Sparse,
    Offbeat,
    Running,
    CallAndResponse
}

public sealed record MelodyRhythmTemplate(string Id, MelodyRhythmArchetype Archetype, int[][] Bars);

public sealed record MelodyStylePreset(string Id, string Name, string Description, MelodyStyle Style,
    MelodyRhythmArchetype[] Archetypes, int Velocity, int NoteLength, int[] Movements);

public static class MelodyRhythmLibrary
{
    private static readonly MelodyRhythmTemplate[] Templates =
    [
        New("balanced-1", MelodyRhythmArchetype.Syncopated, [0, 3, 6, 10], [0, 4, 7, 11]),
        New("balanced-2", MelodyRhythmArchetype.Syncopated, [0, 4, 7, 11], [0, 3, 6, 10]),
        New("balanced-3", MelodyRhythmArchetype.Syncopated, [0, 2, 7, 12], [0, 3, 8, 11]),
        New("balanced-4", MelodyRhythmArchetype.Syncopated, [0, 3, 8, 11], [0, 2, 7, 12]),
        New("balanced-5", MelodyRhythmArchetype.Syncopated, [0, 5, 8, 11], [0, 3, 7, 12]),
        New("balanced-6", MelodyRhythmArchetype.Syncopated, [0, 3, 7, 12], [0, 5, 8, 11]),
        New("balanced-7", MelodyRhythmArchetype.Steady, [0, 2, 6, 11], [0, 4, 9, 12]),
        New("balanced-8", MelodyRhythmArchetype.Steady, [0, 4, 9, 12], [0, 2, 6, 11]),
        New("steady", MelodyRhythmArchetype.Steady, [0, 4, 8, 12], [0, 4, 8, 12]),
        New("sparse", MelodyRhythmArchetype.Sparse, [0, 8], [0, 10]),
        New("sparse-offbeat", MelodyRhythmArchetype.Sparse, [0, 6], [2, 10]),
        New("offbeat", MelodyRhythmArchetype.Offbeat, [2, 6, 10, 14], [2, 6, 10, 14]),
        New("syncopated", MelodyRhythmArchetype.Syncopated, [0, 3, 8, 11], [0, 4, 9, 14]),
        New("running", MelodyRhythmArchetype.Running, [0, 2, 4, 6, 8, 10, 12, 14], [0, 2, 4, 6, 8, 10, 12, 14]),
        New("call-response", MelodyRhythmArchetype.CallAndResponse, [0, 3, 6], [8, 11, 14]),
        New("rock-drive", MelodyRhythmArchetype.Steady, [0, 4, 8, 14], [0, 3, 8, 12]),
        New("funk-cuts", MelodyRhythmArchetype.Offbeat, [0, 3, 6, 10, 14], [1, 4, 8, 11, 15]),
        New("jazz-bounce", MelodyRhythmArchetype.Syncopated, [0, 3, 6, 11, 14], [0, 5, 8, 13]),
        New("reggae-skank", MelodyRhythmArchetype.Offbeat, [2, 6, 10, 14], [2, 7, 10, 14]),
        New("hip-hop-pause", MelodyRhythmArchetype.CallAndResponse, [0, 6, 10], [0, 12, 14])
    ];

    public static IReadOnlyList<MelodyStylePreset> All { get; } =
    [
        Preset("balanced", "Balanced", "Mixed syncopated motifs matching the original melody behavior.",
            MelodyStyle.Balanced, [MelodyRhythmArchetype.Steady, MelodyRhythmArchetype.Syncopated], 88, 2, [-2, -1, -1, 0, 1, 1, 2]),
        Preset("dreamy", "Dreamy", "Airy, sparse phrases with long spaces and restrained motion.",
            MelodyStyle.Dreamy, [MelodyRhythmArchetype.Sparse, MelodyRhythmArchetype.CallAndResponse], 78, 4, [-1, -1, 0, 0, 1, 1, 2]),
        Preset("pop", "Pop", "Clear quarter-note hooks with occasional pickups.",
            MelodyStyle.Pop, [MelodyRhythmArchetype.Steady, MelodyRhythmArchetype.Syncopated], 90, 2, [-2, -1, 0, 1, 1, 2, 2]),
        Preset("acid", "Acid", "Tense syncopation and rapid sixteenth-note runs.",
            MelodyStyle.Acid, [MelodyRhythmArchetype.Syncopated, MelodyRhythmArchetype.Running], 98, 2, [-2, -1, -1, 1, 1, 2, 3]),
        Preset("rave", "Rave", "Driving eighth-note runs and repetitive offbeats.",
            MelodyStyle.Rave, [MelodyRhythmArchetype.Running, MelodyRhythmArchetype.Offbeat], 96, 2, [-2, -1, 0, 1, 1, 2]),
        Preset("rock", "Rock", "Forward backbeat phrases with compact pickups.",
            MelodyStyle.Rock, [MelodyRhythmArchetype.Steady, MelodyRhythmArchetype.Syncopated], 96, 2, [-2, -1, 0, 0, 1, 1, 2]),
        Preset("funk", "Funk", "Offbeat cuts, rests, and syncopated sixteen-note phrases.",
            MelodyStyle.Funk, [MelodyRhythmArchetype.Offbeat, MelodyRhythmArchetype.Syncopated], 92, 1, [-2, -1, 0, 1, 2, 2]),
        Preset("jazz", "Jazz", "Bouncy, syncopated phrasing with room for melodic turns.",
            MelodyStyle.Jazz, [MelodyRhythmArchetype.Syncopated, MelodyRhythmArchetype.CallAndResponse], 82, 2, [-2, -1, -1, 0, 1, 2, 2]),
        Preset("reggae", "Reggae", "Laid-back offbeat skanks and sparse syncopation.",
            MelodyStyle.Reggae, [MelodyRhythmArchetype.Offbeat, MelodyRhythmArchetype.Sparse], 84, 2, [-1, -1, 0, 0, 1, 1, 2]),
        Preset("hip-hop", "Hip-Hop", "Short call-and-response phrases with deliberate pauses.",
            MelodyStyle.HipHop, [MelodyRhythmArchetype.CallAndResponse, MelodyRhythmArchetype.Sparse], 88, 2, [-2, -1, 0, 0, 1, 1, 2])
    ];

    public static IReadOnlyList<MelodyRhythmTemplate> RhythmTemplates { get; } = Templates;

    public static MelodyStylePreset Find(MelodyStyle style) =>
        All.First(preset => preset.Style == style);

    public static MelodyStylePreset? Find(string? id)
    {
        if (id is null) return Find(MelodyStyle.Balanced);
        return All.FirstOrDefault(preset => preset.Id.Equals(id, StringComparison.OrdinalIgnoreCase)
            || preset.Name.Equals(id, StringComparison.OrdinalIgnoreCase)
            || preset.Style.ToString().Equals(id, StringComparison.OrdinalIgnoreCase));
    }

    public static IReadOnlyList<MelodyRhythmTemplate> TemplatesFor(MelodyStyle style)
    {
        if (style == MelodyStyle.Balanced) return Templates.Take(8).ToArray();
        var preset = Find(style);
        var matches = Templates.Where(template => preset.Archetypes.Contains(template.Archetype)).ToArray();
        return matches.Length == 0 ? throw new InvalidOperationException($"No rhythm templates are available for {style}.") : matches;
    }

    private static MelodyStylePreset Preset(string id, string name, string description, MelodyStyle style,
        MelodyRhythmArchetype[] archetypes, int velocity, int noteLength, int[] movements) =>
        new(id, name, description, style, archetypes, velocity, noteLength, movements);

    private static MelodyRhythmTemplate New(string id, MelodyRhythmArchetype archetype, int[] first, int[] second) =>
        new(id, archetype, [first, second]);
}

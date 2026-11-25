namespace BasslineGenerator.MusicTheory;

public enum MelodyStyle
{
    Balanced,
    DrivingEighths,
    PopPulse,
    FourOnTheFloorMelody,
    FunkStabs,
    OffbeatHits,
    BrokenGroove,
    Ambient,
    Cinematic,
    DroneSupport,
    Arpeggiated,
    SixteenthPulse,
    SequenceStyle,
    JazzSwing,
    Shuffle,
    TripletGroove
}

public enum MelodyRhythmArchetype
{
    Straight,
    Syncopated,
    Sparse,
    FastMotion,
    Swing
}

public sealed record MelodyRhythmTemplate(string Id, MelodyRhythmArchetype Archetype, int[][] Bars);

public sealed record MelodyStylePreset(string Id, string Name, string Description, MelodyStyle Style,
    MelodyRhythmArchetype Archetype, int Velocity, int NoteLength);

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
        New("balanced-7", MelodyRhythmArchetype.Straight, [0, 2, 6, 11], [0, 4, 9, 12]),
        New("balanced-8", MelodyRhythmArchetype.Straight, [0, 4, 9, 12], [0, 2, 6, 11]),

        New("driving-eighths", MelodyRhythmArchetype.Straight, [0, 2, 8, 10], [0, 2, 8, 10]),
        New("pop-pulse", MelodyRhythmArchetype.Straight, [0, 4, 8, 12], [0, 4, 10, 12]),
        New("four-on-the-floor-melody", MelodyRhythmArchetype.Straight, [0, 4, 8, 12], [0, 4, 8, 12]),

        New("funk-stabs", MelodyRhythmArchetype.Syncopated, [0, 3, 6, 11], [1, 4, 9, 14]),
        New("offbeat-hits", MelodyRhythmArchetype.Syncopated, [2, 5, 10, 13], [3, 6, 11, 14]),
        New("broken-groove", MelodyRhythmArchetype.Syncopated, [0, 3, 8, 14], [2, 7, 9, 13]),

        New("ambient", MelodyRhythmArchetype.Sparse, [0, 5, 9, 14], [0, 6, 10, 15]),
        New("cinematic", MelodyRhythmArchetype.Sparse, [0, 7, 10, 15], [0, 4, 11, 14]),
        New("drone-support", MelodyRhythmArchetype.Sparse, [0, 6, 8, 14], [0, 5, 8, 13]),

        New("arpeggiated", MelodyRhythmArchetype.FastMotion, [0, 2, 4, 7], [8, 10, 12, 15]),
        New("sixteenth-pulse", MelodyRhythmArchetype.FastMotion, [0, 2, 3, 5], [8, 10, 11, 13]),
        New("sequence-style", MelodyRhythmArchetype.FastMotion, [0, 2, 5, 7], [8, 10, 13, 15]),

        New("jazz-swing", MelodyRhythmArchetype.Swing, [0, 3, 6, 10], [0, 3, 6, 11]),
        New("shuffle", MelodyRhythmArchetype.Swing, [0, 3, 8, 11], [0, 3, 8, 11]),
        New("triplet-groove", MelodyRhythmArchetype.Swing, [0, 3, 5, 8], [0, 3, 5, 11])
    ];

    public static IReadOnlyList<MelodyStylePreset> All { get; } =
    [
        Preset("balanced", "Balanced", "Mixed motifs matching the original melody behavior.",
            MelodyStyle.Balanced, MelodyRhythmArchetype.Straight, 88, 2),

        Preset("driving-eighths", "Driving Eighths", "Forward eighth-note pulses with a held backbeat shape.",
            MelodyStyle.DrivingEighths, MelodyRhythmArchetype.Straight, 94, 2),
        Preset("pop-pulse", "Pop Pulse", "Clear, even beats with a small second-bar pickup.",
            MelodyStyle.PopPulse, MelodyRhythmArchetype.Straight, 90, 3),
        Preset("four-on-the-floor-melody", "Four-on-the-Floor Melody", "Melody attacks aligned to every quarter-note beat.",
            MelodyStyle.FourOnTheFloorMelody, MelodyRhythmArchetype.Straight, 96, 4),

        Preset("funk-stabs", "Funk Stabs", "Short offbeat stabs with syncopated phrase accents.",
            MelodyStyle.FunkStabs, MelodyRhythmArchetype.Syncopated, 94, 1),
        Preset("offbeat-hits", "Offbeat Hits", "Attacks concentrated between the main beats.",
            MelodyStyle.OffbeatHits, MelodyRhythmArchetype.Syncopated, 90, 1),
        Preset("broken-groove", "Broken Groove", "Irregular stabs separated by asymmetric rests.",
            MelodyStyle.BrokenGroove, MelodyRhythmArchetype.Syncopated, 92, 2),

        Preset("ambient", "Ambient", "Widely spaced, sustained events with a floating pulse.",
            MelodyStyle.Ambient, MelodyRhythmArchetype.Sparse, 76, 8),
        Preset("cinematic", "Cinematic", "Long phrases with purposeful late-bar attacks.",
            MelodyStyle.Cinematic, MelodyRhythmArchetype.Sparse, 80, 6),
        Preset("drone-support", "Drone Support", "Restrained attacks intended to sit over sustained harmony.",
            MelodyStyle.DroneSupport, MelodyRhythmArchetype.Sparse, 72, 8),

        Preset("arpeggiated", "Arpeggiated", "Fast clustered motion that resolves into the next beat.",
            MelodyStyle.Arpeggiated, MelodyRhythmArchetype.FastMotion, 92, 2),
        Preset("sixteenth-pulse", "Sixteenth Pulse", "Tight sixteenth-note bursts with clipped gaps.",
            MelodyStyle.SixteenthPulse, MelodyRhythmArchetype.FastMotion, 96, 1),
        Preset("sequence-style", "Sequence Style", "Repeated fast cells with a sequence-like accent pattern.",
            MelodyStyle.SequenceStyle, MelodyRhythmArchetype.FastMotion, 90, 2),

        Preset("jazz-swing", "Jazz Swing", "Long-short phrasing approximating a swung sixteenth grid.",
            MelodyStyle.JazzSwing, MelodyRhythmArchetype.Swing, 82, 2),
        Preset("shuffle", "Shuffle", "A compact shuffled pulse with consistent backbeat delay.",
            MelodyStyle.Shuffle, MelodyRhythmArchetype.Swing, 86, 2),
        Preset("triplet-groove", "Triplet Groove", "Three-step groupings that imply a triplet subdivision.",
            MelodyStyle.TripletGroove, MelodyRhythmArchetype.Swing, 84, 2)
    ];

    public static IReadOnlyList<MelodyRhythmTemplate> RhythmTemplates { get; } = Templates;

    public static MelodyStylePreset Find(MelodyStyle style) =>
        All.First(preset => preset.Style == style);

    public static MelodyStylePreset? Find(string? id)
    {
        if (id is null) return Find(MelodyStyle.Balanced);
        var normalized = Normalize(id);
        var alias = normalized switch
        {
            "dreamy" => "ambient",
            "pop" => "pop-pulse",
            "acid" => "broken-groove",
            "rave" => "sixteenth-pulse",
            _ => normalized
        };
        return All.FirstOrDefault(preset => Normalize(preset.Id) == alias
            || Normalize(preset.Name) == alias
            || Normalize(preset.Style.ToString()) == alias);
    }

    public static IReadOnlyList<MelodyRhythmTemplate> TemplatesFor(MelodyStyle style)
    {
        if (style == MelodyStyle.Balanced) return Templates.Take(8).ToArray();
        var preset = Find(style);
        var template = Templates.Single(item => item.Id == preset.Id);
        return [template];
    }

    private static MelodyStylePreset Preset(string id, string name, string description, MelodyStyle style,
        MelodyRhythmArchetype archetype, int velocity, int noteLength) =>
        new(id, name, description, style, archetype, velocity, noteLength);

    private static MelodyRhythmTemplate New(string id, MelodyRhythmArchetype archetype, int[] first, int[] second) =>
        new(id, archetype, [first, second]);

    private static string Normalize(string value) =>
        new(value.Where(character => char.IsLetterOrDigit(character)).Select(char.ToLowerInvariant).ToArray());
}

using BasslineGenerator.Models;
using BasslineGenerator.MusicTheory;

namespace BasslineGenerator.Generation;

/// <summary>Generates sustained triads with deterministic, register-bounded voice leading.</summary>
public sealed class ChordGenerator
{
    public const int DefaultVelocity = 90;

    private const int ChordRootBase = 48;
    private const int HighestPitch = 71;

    public IReadOnlyList<BassNote> Generate(string rootNote, ChordProgression progression,
        IReadOnlyList<SongSection> sections, int velocity = DefaultVelocity)
    {
        ArgumentNullException.ThrowIfNull(progression);
        ArgumentNullException.ThrowIfNull(sections);
        if (progression.Chords.Count == 0) throw new ArgumentException("Progression must contain at least one chord.", nameof(progression));
        if (sections.Count == 0 || sections.Any(section => section is null || section.Bars < 1))
            throw new ArgumentException("Sections must contain at least one bar each.", nameof(sections));
        if (velocity is < 1 or > 127) throw new ArgumentOutOfRangeException(nameof(velocity));

        var tonic = NoteUtilities.PitchClass(rootNote);
        var notes = new List<BassNote>();
        var firstBar = 0;
        int[]? previousVoicing = null;
        foreach (var section in sections)
        {
            for (var bar = 0; bar < section.Bars; bar++)
            {
                var chord = progression.Chords[(firstBar + bar) % progression.Chords.Count];
                var root = ChordRootBase + tonic + chord.RootOffset;
                var voicing = SelectVoicing(root, chord.Third, previousVoicing);
                var start = (long)(firstBar + bar) * MusicConstants.TicksPerBar;
                foreach (var pitch in voicing)
                    notes.Add(new BassNote(pitch, start, MusicConstants.TicksPerBar, velocity));
                previousVoicing = voicing;
            }
            firstBar += section.Bars;
        }
        return notes;
    }

    private static int[] SelectVoicing(int root, int third, int[]? previous)
    {
        int[][] inversions =
        [
            [root, root + third, root + 7],
            [root + third, root + 7, root + 12],
            [root + 7, root + 12, root + third + 12]
        ];
        int[]? best = null;
        var bestDistance = int.MaxValue;
        // Ordered enumeration and strict improvement break ties by inversion, then lower placement.
        foreach (var inversion in inversions.Take(previous is null ? 1 : 3))
        {
            for (var low = ChordRootBase + inversion[0] % 12; low <= HighestPitch; low += 12)
            {
                var middle = low + inversion[1] - inversion[0];
                var high = low + inversion[2] - inversion[0];
                if (high > HighestPitch) continue;
                var distance = previous is null
                    ? Math.Abs(low - root)
                    : Math.Abs(low - previous[0]) + Math.Abs(middle - previous[1]) + Math.Abs(high - previous[2]);
                if (distance >= bestDistance) continue;
                best = [low, middle, high];
                bestDistance = distance;
            }
        }
        return best ?? throw new InvalidOperationException("Chord has no voicing in the supported register.");
    }
}

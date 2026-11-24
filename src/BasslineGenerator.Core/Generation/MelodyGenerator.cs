using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using BasslineGenerator.Models;
using BasslineGenerator.MusicTheory;

namespace BasslineGenerator.Generation;

/// <summary>Creates a repeating, chord-aware two-bar lead motif.</summary>
public sealed class MelodyGenerator
{
    private const int LowestPitch = 72;
    private const int HighestPitch = 84;
    private static readonly int[] PitchMovements = [-2, -1, -1, 0, 1, 1, 2];

    /// <summary>Generates notes in absolute ticks; section boundaries do not reset the motif.</summary>
    public IReadOnlyList<BassNote> Generate(string rootNote, string scaleType, ChordProgression progression,
        IReadOnlyList<SongSection> sections, int seed, MelodyStyle style = MelodyStyle.Balanced)
    {
        ArgumentNullException.ThrowIfNull(progression);
        ArgumentNullException.ThrowIfNull(sections);
        if (progression.Chords.Count == 0) throw new ArgumentException("Progression must contain chords.", nameof(progression));
        if (sections.Count == 0 || sections.Any(section => section is null || section.Bars is < 1 or > 512)
            || sections.Sum(section => (long)section.Bars) > 4096)
            throw new ArgumentException("Sections must contain 1–512 bars each and at most 4096 bars total.", nameof(sections));

        var tonic = NoteUtilities.PitchClass(rootNote);
        var scale = ScaleLibrary.GetScale(rootNote, scaleType);
        var scalePitches = Enumerable.Range(LowestPitch, HighestPitch - LowestPitch + 1)
            .Where(pitch => scale.Contains(pitch % 12)).ToArray();
        var preset = MelodyRhythmLibrary.Find(style);
        var rhythms = MelodyRhythmLibrary.TemplatesFor(style);
        var rhythmDomain = style == MelodyStyle.Balanced ? "melody-rhythm-v1" : $"melody-rhythm-v1:{style}";
        var rhythm = rhythms[CreateRandom(seed, rhythmDomain).Next(rhythms.Count)];
        var random = CreateRandom(seed, "melody-pitch-v1");
        var index = Array.IndexOf(scalePitches, scalePitches.OrderBy(pitch => Math.Abs(pitch - 78)).ThenBy(pitch => pitch).First());
        index = Math.Clamp(index + random.Next(-1, 2), 0, scalePitches.Length - 1);
        var targets = new int[rhythm.Bars.Sum(bar => bar.Length)];
        for (var i = 0; i < targets.Length; i++)
        {
            if (i > 0) index = Math.Clamp(index + PitchMovements[random.Next(PitchMovements.Length)], 0, scalePitches.Length - 1);
            targets[i] = scalePitches[index];
        }

        var motif = new int[targets.Length];
        int? previous = null;
        var targetIndex = 0;
        for (var bar = 0; bar < rhythm.Bars.Length; bar++)
        {
            foreach (var step in rhythm.Bars[bar])
            {
                var pitchStep = style == MelodyStyle.Balanced ? step : targetIndex % 4 * 4;
                motif[targetIndex] = SelectPitch(targets[targetIndex], previous, pitchStep,
                    tonic, progression.Chords[bar % progression.Chords.Count], scale);
                previous = motif[targetIndex++];
            }
        }

        var notes = new List<BassNote>();
        previous = null;
        var bars = sections.Sum(section => section.Bars);
        for (var bar = 0; bar < bars; bar++)
        {
            var phraseBar = bar % 2;
            var chord = progression.Chords[bar % progression.Chords.Count];
            var motifOffset = rhythm.Bars.Take(phraseBar).Sum(onsets => onsets.Length);
            var onsets = rhythm.Bars[phraseBar];
            for (var i = 0; i < onsets.Length; i++)
            {
                var step = onsets[i];
                var pitchStep = style == MelodyStyle.Balanced ? step : (i + phraseBar * 4) % 4 * 4;
                var pitch = SelectPitch(motif[motifOffset + i], previous, pitchStep, tonic, chord, scale);
                var start = (long)bar * MusicConstants.TicksPerBar + step * MusicConstants.Sixteenth;
                var nextStep = i + 1 < onsets.Length ? onsets[i + 1] : 16;
                var length = Math.Max(1, Math.Min(preset.NoteLength, nextStep - step)) * MusicConstants.Sixteenth;
                notes.Add(new BassNote(pitch, start, length, preset.Velocity));
                previous = pitch;
            }
        }
        return notes;
    }

    private static int SelectPitch(int target, int? previous, int step, int tonic, Chord chord, IReadOnlyList<int> scale)
    {
        var root = (tonic + chord.RootOffset) % 12;
        int[] chordTones = [root, (root + chord.Third) % 12, (root + 7) % 12];
        bool IsChordTone(int pitch) => chordTones.Contains(pitch % 12);
        bool SafeScaleTone(int pitch) => scale.Contains(pitch % 12) && chordTones.All(tone =>
            (pitch % 12 - tone + 12) % 12 is not (1 or 11));

        var candidates = Enumerable.Range(LowestPitch, HighestPitch - LowestPitch + 1)
            .Where(pitch => (previous is null || Math.Abs(pitch - previous.Value) <= 7)
                && (IsChordTone(pitch) || (step % 4 != 0 && SafeScaleTone(pitch))))
            .OrderBy(pitch => Math.Abs(pitch - target))
            .ThenBy(pitch => previous is null ? 0 : Math.Abs(pitch - previous.Value))
            .ThenBy(pitch => pitch);
        var chosen = candidates.FirstOrDefault(-1);
        return chosen >= 0 ? chosen : throw new InvalidOperationException("No suitable melody pitch is available.");
    }

    private static Random CreateRandom(int seed, string domain)
    {
        var prefix = Encoding.ASCII.GetBytes(domain);
        var input = new byte[prefix.Length + sizeof(int)];
        prefix.CopyTo(input, 0);
        BinaryPrimitives.WriteInt32LittleEndian(input.AsSpan(prefix.Length), seed);
        var hash = SHA256.HashData(input);
        return new Random(BinaryPrimitives.ReadInt32LittleEndian(hash));
    }
}

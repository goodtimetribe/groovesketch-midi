using BasslineGenerator.Generation;
using BasslineGenerator.Models;
using BasslineGenerator.MusicTheory;

namespace BasslineGenerator.Tests;

public class ChordGeneratorTests
{
    [Fact]
    public void GeneratesRootPositionTriadsWithDefaultVelocity()
    {
        var notes = new ChordGenerator().Generate("A",
            ChordProgressionLibrary.Find("i - V - VI - IV")!,
            [new SongSection("Section", SongWorld.Dreamy, 1)]);

        Assert.Equal(
        [
            new BassNote(57, 0, MusicConstants.TicksPerBar, 90),
            new BassNote(60, 0, MusicConstants.TicksPerBar, 90),
            new BassNote(64, 0, MusicConstants.TicksPerBar, 90)
        ], notes);
        Assert.All(notes, note => Assert.Equal(ChordGenerator.DefaultVelocity, note.Velocity));
    }

    [Fact]
    public void PreservesWrittenMajorAndMinorThirdsWithoutScaleNormalization()
    {
        var notes = new ChordGenerator().Generate("A",
            ChordProgressionLibrary.Find("i - V - VI - IV")!,
            [new SongSection("Section", SongWorld.Dreamy, 2)]);

        var minor = notes.Where(note => note.Start == 0).Select(note => note.Pitch).ToArray();
        var majorDominant = notes.Where(note => note.Start == MusicConstants.TicksPerBar).Select(note => note.Pitch).ToArray();

        Assert.Equal([57, 60, 64], minor);
        Assert.Equal([56, 59, 64], majorDominant);
        Assert.DoesNotContain(68 % 12, ScaleLibrary.GetScale("A", "Minor"));
    }

    [Fact]
    public void UsesAbsoluteBarIndexesAcrossSections()
    {
        var notes = new ChordGenerator().Generate("A",
            ChordProgressionLibrary.Find("Synthwave")!,
            [
                new SongSection("Intro", SongWorld.Dreamy, 3),
                new SongSection("Drop", SongWorld.Acid, 2)
            ]);

        Assert.Equal([57, 60, 64, 57, 60, 65, 55, 60, 64, 55, 59, 62, 57, 60, 64],
            notes.Select(note => note.Pitch).ToArray());
        Assert.Equal(15, notes.Count);
        for (var bar = 0; bar < 5; bar++)
        {
            var chord = notes.Where(note => note.Start == bar * MusicConstants.TicksPerBar).ToArray();
            Assert.Equal(3, chord.Length);
            Assert.All(chord, note => Assert.Equal(MusicConstants.TicksPerBar, note.Length));
        }
    }

    [Fact]
    public void KeepsCommonPitchesForMinorToRelativeMajorTransition()
    {
        var notes = new ChordGenerator().Generate("A", ChordProgressionLibrary.Find("Synthwave")!,
            [new SongSection("Section", SongWorld.Dreamy, 2)]);

        Assert.Equal([57, 60, 64, 57, 60, 65], notes.Select(note => note.Pitch).ToArray());
    }

    [Theory]
    [InlineData(2, 3, 0, 3, 48, 51, 55)]
    [InlineData(2, 4, 8, 4, 48, 51, 56)]
    public void BreaksEqualMovementTiesByInversionOrder(int firstRoot, int firstThird,
        int nextRoot, int nextThird, int low, int middle, int high)
    {
        var progression = new ChordProgression("Tie", [new Chord(firstRoot, firstThird), new Chord(nextRoot, nextThird)]);
        var notes = new ChordGenerator().Generate("C", progression,
            [new SongSection("Section", SongWorld.Dreamy, 2)]);

        Assert.Equal([low, middle, high], notes.Skip(3).Select(note => note.Pitch).ToArray());
    }

    [Theory]
    [InlineData("C", 0, 48, 52, 55)]
    [InlineData("C", 12, 60, 64, 67)]
    [InlineData("B", 10, 57, 61, 64)]
    public void StartsInRootPositionNearestOriginalRootWithinRegister(string tonic, int rootOffset,
        int low, int middle, int high)
    {
        var notes = new ChordGenerator().Generate(tonic,
            new ChordProgression("Start", [new Chord(rootOffset, 4)]),
            [new SongSection("Section", SongWorld.Dreamy, 1)]);

        Assert.Equal([low, middle, high], notes.Select(note => note.Pitch).ToArray());
    }

    [Fact]
    public void RepeatedChordsRetainTheirVoicingAndRetriggerEveryBar()
    {
        var progression = new ChordProgression("Repeat", [new Chord(0, 3), new Chord(8, 4), new Chord(8, 4)]);
        var notes = new ChordGenerator().Generate("A", progression,
            [new SongSection("Section", SongWorld.Dreamy, 3)], 127);

        Assert.Equal(notes.Skip(3).Take(3).Select(note => note.Pitch), notes.Skip(6).Select(note => note.Pitch));
        Assert.All(notes, note => Assert.Equal(127, note.Velocity));
        Assert.All(notes.Skip(6), note => Assert.Equal(2L * MusicConstants.TicksPerBar, note.Start));
        Assert.All(notes, note => Assert.Equal(MusicConstants.TicksPerBar, note.Length));
    }

    [Fact]
    public void SectionSplittingDoesNotResetVoiceLeadingOrProgression()
    {
        var generator = new ChordGenerator();
        var progression = ChordProgressionLibrary.Find("Synthwave")!;
        var uninterrupted = generator.Generate("C", progression,
            [new SongSection("Section", SongWorld.Dreamy, 9)]);
        var split = generator.Generate("C", progression,
        [
            new SongSection("Intro", SongWorld.Dreamy, 3),
            new SongSection("Drop", SongWorld.Acid, 2),
            new SongSection("Outro", SongWorld.Pop, 4)
        ]);

        Assert.Equal(uninterrupted, split);
    }

    [Fact]
    public void OptimizesForwardWithoutChangingFirstChordToCloseTheLoop()
    {
        var generator = new ChordGenerator();
        var progression = ChordProgressionLibrary.Find("Synthwave")!;
        var single = generator.Generate("C", progression, [new SongSection("Section", SongWorld.Dreamy, 1)]);
        var repeated = generator.Generate("C", progression, [new SongSection("Section", SongWorld.Dreamy, 5)]);

        Assert.Equal(single, repeated.Take(3));
        Assert.Equal([48, 51, 55], single.Select(note => note.Pitch).ToArray());
        Assert.Equal([51, 55, 60], repeated.Skip(12).Select(note => note.Pitch).ToArray());
    }

    [Theory]
    [InlineData("C")]
    [InlineData("C#")]
    [InlineData("D")]
    [InlineData("D#")]
    [InlineData("E")]
    [InlineData("F")]
    [InlineData("F#")]
    [InlineData("G")]
    [InlineData("G#")]
    [InlineData("A")]
    [InlineData("A#")]
    [InlineData("B")]
    public void AllProgressionsPreserveHarmonyAndChooseDeterministicMinimumMovement(string tonic)
    {
        var generator = new ChordGenerator();
        foreach (var progression in ChordProgressionLibrary.All)
        {
            var bars = progression.Chords.Count * 2;
            SongSection[] sections = [new SongSection("Section", SongWorld.Dreamy, bars)];
            var notes = generator.Generate(tonic, progression, sections);
            Assert.Equal(notes, generator.Generate(tonic, progression, sections));
            Assert.Equal(bars * 3, notes.Count);
            int[]? previous = null;
            for (var bar = 0; bar < bars; bar++)
            {
                var chord = progression.Chords[bar % progression.Chords.Count];
                var root = 48 + NoteUtilities.PitchClass(tonic) + chord.RootOffset;
                int[] pitchClasses = [root % 12, (root + chord.Third) % 12, (root + 7) % 12];
                var currentNotes = notes.Skip(bar * 3).Take(3).ToArray();
                var current = currentNotes.Select(note => note.Pitch).ToArray();
                Assert.Equal(pitchClasses.Order(), current.Select(pitch => pitch % 12).Order());
                Assert.All(current, pitch => Assert.InRange(pitch, 48, 71));
                Assert.True(current[0] < current[1] && current[1] < current[2]);
                Assert.True(current[2] - current[0] < 12);
                Assert.All(currentNotes, note =>
                {
                    Assert.Equal((long)bar * MusicConstants.TicksPerBar, note.Start);
                    Assert.Equal(MusicConstants.TicksPerBar, note.Length);
                    Assert.Equal(90, note.Velocity);
                });

                // Independently enumerate all compact pitch triples rather than building inversions.
                var candidates = (from low in Enumerable.Range(48, 24)
                                  from middle in Enumerable.Range(low + 1, 71 - low)
                                  from high in Enumerable.Range(middle + 1, 71 - middle)
                                  where high - low < 12
                                  let pitches = new[] { low, middle, high }
                                  where pitchClasses.Order().SequenceEqual(pitches.Select(pitch => pitch % 12).Order())
                                  select pitches).ToArray();
                var expected = previous is null
                    ? candidates.Where(pitches => pitches[0] % 12 == root % 12)
                        .OrderBy(pitches => Math.Abs(pitches[0] - root)).ThenBy(pitches => pitches[0]).First()
                    : candidates.OrderBy(pitches => pitches.Zip(previous, (a, b) => Math.Abs(a - b)).Sum())
                        .ThenBy(pitches => Array.IndexOf(pitchClasses, pitches[0] % 12))
                        .ThenBy(pitches => pitches[0]).First();
                Assert.Equal(expected, current);
                previous = current;
            }
        }
    }
}

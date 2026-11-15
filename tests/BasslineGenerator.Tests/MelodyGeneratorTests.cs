using BasslineGenerator.Generation;
using BasslineGenerator.Models;
using BasslineGenerator.MusicTheory;

namespace BasslineGenerator.Tests;

public class MelodyGeneratorTests
{
    private static readonly SongSection[] FourBars = [new("Section", SongWorld.Dreamy, 4)];

    [Fact]
    public void SameSeedIsDeterministicAndDoesNotChangeBassOrChords()
    {
        var bass = new BasslineGenerator.Generation.BasslineGenerator();
        var settings = new GeneratorSettings { RootNote = "A", ScaleType = "Minor", Style = SongWorld.Acid, Bars = 4, Seed = 12345 };
        var progression = ChordProgressionLibrary.Find("minor-dramatic")!;
        var chords = new ChordGenerator();
        var bassBefore = bass.Generate(settings).Notes;
        var chordsBefore = chords.Generate("A", progression, FourBars);
        var generator = new MelodyGenerator();

        var first = generator.Generate("A", "Minor", progression, FourBars, 12345);
        Assert.Equal(first, generator.Generate("A", "Minor", progression, FourBars, 12345));
        Assert.Equal(bassBefore, bass.Generate(settings).Notes);
        Assert.Equal(chordsBefore, chords.Generate("A", progression, FourBars));
    }

    [Fact]
    public void TrackDerivedSeedsCanProduceDistinctRepeatableMelodies()
    {
        var generator = new MelodyGenerator();
        var progression = ChordProgressionLibrary.Find("synthwave")!;
        var midi1 = generator.Generate("A", "Minor", progression, FourBars, 123);
        var midi2 = generator.Generate("A", "Minor", progression, FourBars, 120);

        Assert.Equal(midi1, generator.Generate("A", "Minor", progression, FourBars, 123));
        Assert.Equal(midi2, generator.Generate("A", "Minor", progression, FourBars, 120));
        Assert.NotEqual(midi1, midi2);
    }

    [Fact]
    public void EightRhythmsRepeatAndAreIndependentOfHarmony()
    {
        var generator = new MelodyGenerator();
        var rhythms = new HashSet<string>();
        for (var seed = 0; seed < 100; seed++)
        {
            var notes = generator.Generate("C", "Major", ChordProgressionLibrary.Find("pop-anthem")!, FourBars, seed);
            var otherHarmony = generator.Generate("A", "Minor", ChordProgressionLibrary.Find("ancient-ruins")!, FourBars, seed);
            Assert.Equal(notes.Select(note => (note.Start, note.Length)), otherHarmony.Select(note => (note.Start, note.Length)));
            var firstPhrase = notes.Take(8).Select(note => note.Start).ToArray();
            Assert.Equal(firstPhrase, notes.Skip(8).Select(note => note.Start - 2L * MusicConstants.TicksPerBar));
            rhythms.Add(string.Join(",", firstPhrase));
            foreach (var bar in Enumerable.Range(0, 4))
            {
                var barNotes = notes.Skip(bar * 4).Take(4).ToArray();
                Assert.Equal(4, barNotes.Length);
                Assert.Contains(barNotes, note => note.Start % MusicConstants.Ppq != 0);
                Assert.True(barNotes.Sum(note => note.Length) < MusicConstants.TicksPerBar);
                Assert.All(barNotes, note => Assert.True(note.Start + note.Length <= (bar + 1L) * MusicConstants.TicksPerBar));
            }
        }
        Assert.Equal(8, rhythms.Count);
    }

    [Fact]
    public void AllSupportedHarmoniesEnforceChordTonesScaleAndMotion()
    {
        var generator = new MelodyGenerator();
        string[] roots = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        foreach (var root in roots)
        foreach (var progression in ChordProgressionLibrary.All)
        foreach (var scaleDefinition in ScaleLibrary.All)
        foreach (var seed in new[] { -1, 0, 12345 })
        {
            var scale = ScaleLibrary.GetScale(root, scaleDefinition.Name);
            var notes = generator.Generate(root, scaleDefinition.Name, progression, FourBars, seed);
            Assert.Equal(16, notes.Count);
            for (var i = 0; i < notes.Count; i++)
            {
                var note = notes[i];
                var bar = (int)(note.Start / MusicConstants.TicksPerBar);
                var step = (int)(note.Start % MusicConstants.TicksPerBar / MusicConstants.Sixteenth);
                var chord = progression.Chords[bar % progression.Chords.Count];
                var chordRoot = (NoteUtilities.PitchClass(root) + chord.RootOffset) % 12;
                int[] tones = [chordRoot, (chordRoot + chord.Third) % 12, (chordRoot + 7) % 12];
                var isChordTone = tones.Contains(note.Pitch % 12);
                Assert.InRange(note.Pitch, 72, 84);
                Assert.Equal(88, note.Velocity);
                if (step % 4 == 0) Assert.True(isChordTone);
                else if (!isChordTone)
                {
                    Assert.Contains(note.Pitch % 12, scale);
                    Assert.All(tones, tone => Assert.DoesNotContain((note.Pitch % 12 - tone + 12) % 12, new[] { 1, 11 }));
                }
                if (i > 0)
                {
                    Assert.InRange(Math.Abs(note.Pitch - notes[i - 1].Pitch), 0, 7);
                    Assert.True(notes[i - 1].Start + notes[i - 1].Length <= note.Start);
                }
            }
        }
    }

    [Fact]
    public void ChangesPitchForNewHarmonyWithoutChangingRhythm()
    {
        var generator = new MelodyGenerator();
        var staticHarmony = new ChordProgression("Static", [new Chord(0, 4), new Chord(0, 4)]);
        var changedHarmony = new ChordProgression("Changed", [new Chord(0, 4), new Chord(1, 4)]);
        var original = generator.Generate("C", "Major", staticHarmony, FourBars, 42);
        var adapted = generator.Generate("C", "Major", changedHarmony, FourBars, 42);
        Assert.Equal(original.Select(note => (note.Start, note.Length)), adapted.Select(note => (note.Start, note.Length)));
        Assert.Equal(original.Take(4), adapted.Take(4));
        Assert.NotEqual(original[4].Pitch, adapted[4].Pitch);
        Assert.Contains(adapted[4].Pitch % 12, new[] { 1, 5, 8 });
    }

    [Fact]
    public void AllowsActualNonDiatonicChordTones()
    {
        var generator = new MelodyGenerator();
        var progression = ChordProgressionLibrary.Find("minor-dramatic")!;
        var scale = ScaleLibrary.GetScale("A", "Minor");
        Assert.DoesNotContain(8, scale); // G-sharp is the third of E major.
        Assert.Contains(Enumerable.Range(0, 200), seed =>
            generator.Generate("A", "Minor", progression, FourBars, seed)
                .Any(note => note.Start / MusicConstants.TicksPerBar == 1 && note.Pitch % 12 == 8));
    }

    [Fact]
    public void SectionSplitsDoNotResetMotifOrProgression()
    {
        var generator = new MelodyGenerator();
        var progression = ChordProgressionLibrary.Find("synthwave")!;
        var uninterrupted = generator.Generate("A", "Minor", progression,
            [new SongSection("All", SongWorld.Dreamy, 7)], 999);
        var split = generator.Generate("A", "Minor", progression,
            [new SongSection("Intro", SongWorld.Dreamy, 3), new SongSection("Drop", SongWorld.Acid, 4)], 999);
        Assert.Equal(uninterrupted, split);
        Assert.Equal(uninterrupted.Take(4), generator.Generate("A", "Minor", progression,
            [new SongSection("Short", SongWorld.Dreamy, 1)], 999));
    }

    [Fact]
    public void RejectsInvalidSectionLengthsAndEmptyProgressions()
    {
        var generator = new MelodyGenerator();
        var progression = ChordProgressionLibrary.Find("synthwave")!;
        Assert.Throws<ArgumentException>(() => generator.Generate("A", "Minor", progression, [], 1));
        Assert.Throws<ArgumentException>(() => generator.Generate("A", "Minor", progression,
            [new SongSection("Too long", SongWorld.Dreamy, 513)], 1));
        Assert.Throws<ArgumentException>(() => generator.Generate("A", "Minor", progression,
            Enumerable.Repeat(new SongSection("Section", SongWorld.Dreamy, 512), 9).ToArray(), 1));
        Assert.Throws<ArgumentException>(() => generator.Generate("A", "Minor",
            new ChordProgression("Empty", []), FourBars, 1));
    }
}

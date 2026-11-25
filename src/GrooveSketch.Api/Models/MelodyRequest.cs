using System.ComponentModel.DataAnnotations;
using BasslineGenerator.MusicTheory;

namespace BasslineGenerator.Api.Models;

/// <summary>Inputs for a deterministic, preview-only melody.</summary>
public sealed class MelodyRequest
{
    /// <summary>Tonic note name.</summary>
    /// <example>C</example>
    [Required, RootNote]
    public string? RootNote { get; set; }

    /// <summary>Scale name, including Natural Minor as an alias for Minor.</summary>
    /// <example>Major</example>
    [Required, ScaleType]
    public string? ScaleType { get; set; }

    /// <summary>Resolved, case-sensitive progression ID from the progressions endpoint.</summary>
    /// <example>pop-anthem</example>
    [Required, MelodyProgression]
    public string? ProgressionId { get; set; }

    /// <summary>Ordered section lengths, 1–512 bars each and at most 4096 bars total.</summary>
    [Required, MelodySections]
    public List<MelodySectionRequest?>? Sections { get; set; }

    /// <summary>Signed 32-bit melody seed.</summary>
    /// <example>12345</example>
    [Required]
    public int? Seed { get; set; }

    /// <summary>Optional melody rhythm preset ID. Defaults to Balanced.</summary>
    /// <example>pop</example>
    [MelodyStyle]
    public string? Style { get; set; }
}

public sealed class MelodySectionRequest
{
    /// <summary>Section length in bars, 1–512.</summary>
    /// <example>4</example>
    [Required, Range(1, 512)]
    public int? Bars { get; set; }
}

public sealed class MelodyProgressionAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) => value is null || value is string id
        && ChordProgressionLibrary.All.Any(progression => progression.Id == id);
}

public sealed class MelodyStyleAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) =>
        value is null || value is string id && MelodyRhythmLibrary.Find(id) is not null;
}

public sealed class MelodySectionsAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) => value is null
        || value is List<MelodySectionRequest?> sections && sections.Count > 0
        && sections.All(section => section is not null && section.Bars is >= 1 and <= 512)
        && sections.Sum(section => (long)section!.Bars!.Value) <= 4096;
}

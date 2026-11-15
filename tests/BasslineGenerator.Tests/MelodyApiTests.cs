using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BasslineGenerator.Api.Models;
using BasslineGenerator.Packaging;
using Microsoft.AspNetCore.Mvc.Testing;

namespace BasslineGenerator.Tests;

public class MelodyApiTests
{
    [Fact]
    public async Task GeneratesReproducibleNotesWithoutChangingBassReplay()
    {
        await using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();
        var bassRequest = new { rootNote = "C", scaleType = "Major", style = "Pop", bpm = 120, bars = 4, seed = 12345 };
        var melodyRequest = new { rootNote = "C", scaleType = "Major", progressionId = "pop-anthem", sections = new[] { new { bars = 4 } }, seed = 12345 };
        using var before = await client.PostAsJsonAsync("/api/generate/package", bassRequest);
        using var response = await client.PostAsJsonAsync("/api/melody", melodyRequest);
        using var repeated = await client.PostAsJsonAsync("/api/melody", melodyRequest);
        using var after = await client.PostAsJsonAsync("/api/generate/package", bassRequest);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        var notes = await response.Content.ReadFromJsonAsync<NoteData[]>();
        Assert.NotNull(notes);
        Assert.Equal(16, notes.Length);
        Assert.Equal(notes, await repeated.Content.ReadFromJsonAsync<NoteData[]>());
        var beforePackage = await before.Content.ReadFromJsonAsync<GenerationPackage>();
        var afterPackage = await after.Content.ReadFromJsonAsync<GenerationPackage>();
        Assert.Equal(beforePackage!.Notes, afterPackage!.Notes);
    }

    [Theory]
    [InlineData("""{"rootNote":"secret-invalid","scaleType":"Major","progressionId":"pop-anthem","sections":[{"bars":4}],"seed":1}""")]
    [InlineData("""{"rootNote":"C","scaleType":"Major","progressionId":"unknown","sections":[{"bars":4}],"seed":1}""")]
    [InlineData("""{"rootNote":"C","scaleType":"Major","progressionId":"pop-anthem","sections":[],"seed":1}""")]
    [InlineData("""{"rootNote":"C","scaleType":"Major","progressionId":"pop-anthem","sections":[null],"seed":1}""")]
    [InlineData("""{"rootNote":"C","scaleType":"Major","progressionId":"pop-anthem","sections":[{"bars":513}],"seed":1}""")]
    [InlineData("""{"rootNote":"C","scaleType":"Major","progressionId":"pop-anthem","sections":[{"bars":4}]}""")]
    public async Task RejectsInvalidRequestsWithoutEchoingInput(string json)
    {
        await using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();
        using var response = await client.PostAsync("/api/melody", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.NotNull(error);
        Assert.DoesNotContain("secret-invalid", error.Error);
    }

    [Fact]
    public async Task SwaggerIncludesMelodyRequestExample()
    {
        await using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();
        using var document = JsonDocument.Parse(await client.GetStringAsync("/swagger/v1/swagger.json"));
        var operation = document.RootElement.GetProperty("paths").GetProperty("/api/melody").GetProperty("post");
        var example = operation.GetProperty("requestBody").GetProperty("content").GetProperty("application/json").GetProperty("example");
        Assert.Equal("pop-anthem", example.GetProperty("progressionId").GetString());
    }
}

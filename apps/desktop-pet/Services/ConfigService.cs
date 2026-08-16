using System.IO;
using System.Text.Json;
using PlaygroundDesktopPet.Models;

namespace PlaygroundDesktopPet.Services;

public sealed class ConfigService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public string DataDirectory { get; }
    public string AssetsDirectory { get; }
    public string ConfigPath { get; }

    public ConfigService()
    {
        DataDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "PlaygroundDesktopPet");
        AssetsDirectory = Path.Combine(DataDirectory, "assets");
        ConfigPath = Path.Combine(DataDirectory, "pet.config.json");

        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(AssetsDirectory);
    }

    public PetConfig Load()
    {
        if (!File.Exists(ConfigPath))
        {
            var seeded = CreateExampleConfig();
            Save(seeded);
            return seeded;
        }

        try
        {
            var json = File.ReadAllText(ConfigPath);
            return JsonSerializer.Deserialize<PetConfig>(json, JsonOptions) ?? CreateExampleConfig();
        }
        catch
        {
            return CreateExampleConfig();
        }
    }

    public void Save(PetConfig config)
    {
        File.WriteAllText(ConfigPath, JsonSerializer.Serialize(config, JsonOptions));
    }

    public string ResolveAsset(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return "";
        if (Path.IsPathRooted(path)) return path;
        return Path.Combine(AssetsDirectory, path);
    }

    private static PetConfig CreateExampleConfig()
    {
        return new PetConfig
        {
            PetName = "Luna",
            RandomActionMinSeconds = 5,
            RandomActionMaxSeconds = 12,
            Behaviors =
            {
                new() { Id = "idle", DisplayName = "기본", AssetPath = "idle.png", Weight = 8, DurationMs = 1800 },
                new() { Id = "blank", DisplayName = "멍", AssetPath = "blank.png", Weight = 3, DurationMs = 2600 },
                new() { Id = "tired", DisplayName = "피곤", AssetPath = "tired.png", Weight = 2, DurationMs = 2200 },
                new() { Id = "sleep", DisplayName = "잠자기", AssetPath = "sleep.png", Weight = 1, DurationMs = 5000 },
                new() { Id = "surprised", DisplayName = "놀람", AssetPath = "surprised.png", Weight = 0, DurationMs = 900, RandomEnabled = false },
                new() { Id = "focus", DisplayName = "집중", AssetPath = "focus.png", Weight = 0, DurationMs = 1600, RandomEnabled = false },
                new() { Id = "happy", DisplayName = "기쁨", AssetPath = "happy.png", Weight = 0, DurationMs = 1500, RandomEnabled = false },
                new() { Id = "drag", DisplayName = "끌려가기", AssetPath = "drag.png", Weight = 0, DurationMs = 400, RandomEnabled = false },
            },
            Commands =
            {
                new()
                {
                    Trigger = "/hello",
                    Description = "캐릭터가 인사합니다",
                    Actions =
                    {
                        new() { Type = "behavior", Value = "happy" },
                        new() { Type = "message", Value = "안녕! 오늘도 잘 부탁해." }
                    }
                },
                new()
                {
                    Trigger = "/code",
                    Description = "VS Code 실행",
                    Actions =
                    {
                        new() { Type = "message", Value = "VS Code를 실행할게." },
                        new() { Type = "app", Value = "code" }
                    }
                },
                new()
                {
                    Trigger = "/playground",
                    Description = "Playground 열기",
                    Actions =
                    {
                        new() { Type = "url", Value = "https://harufit.https.gsmsv.site" }
                    }
                },
                new()
                {
                    Trigger = "/sleep",
                    Description = "잠자기",
                    Actions =
                    {
                        new() { Type = "behavior", Value = "sleep" },
                        new() { Type = "message", Value = "조금만 잘게..." }
                    }
                }
            }
        };
    }
}

namespace PlaygroundDesktopPet.Models;

public sealed class PetConfig
{
    public string PetName { get; set; } = "Luna";
    public int RandomActionMinSeconds { get; set; } = 5;
    public int RandomActionMaxSeconds { get; set; } = 12;
    public List<PetBehavior> Behaviors { get; set; } = new();
    public List<PetCommand> Commands { get; set; } = new();
}

public sealed class PetBehavior
{
    public string Id { get; set; } = "idle";
    public string DisplayName { get; set; } = "기본";
    public string AssetPath { get; set; } = "";
    public int Weight { get; set; } = 1;
    public int DurationMs { get; set; } = 1800;
    public bool RandomEnabled { get; set; } = true;
}

public sealed class PetCommand
{
    public string Trigger { get; set; } = "/hello";
    public string Description { get; set; } = "인사하기";
    public List<CommandAction> Actions { get; set; } = new();
}

public sealed class CommandAction
{
    public string Type { get; set; } = "message";
    public string Value { get; set; } = "안녕!";
}

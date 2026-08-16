using System.IO;
using System.Diagnostics;
using System.Windows.Media;
using PlaygroundDesktopPet.Models;

namespace PlaygroundDesktopPet.Services;

public sealed class CommandExecutor
{
    private readonly Action<string> _showMessage;
    private readonly Func<string, Task> _setBehavior;
    private readonly ConfigService _configService;
    private readonly List<MediaPlayer> _players = new();

    public CommandExecutor(ConfigService configService, Action<string> showMessage, Func<string, Task> setBehavior)
    {
        _configService = configService;
        _showMessage = showMessage;
        _setBehavior = setBehavior;
    }

    public async Task ExecuteAsync(PetCommand command)
    {
        foreach (var action in command.Actions)
        {
            switch (action.Type.Trim().ToLowerInvariant())
            {
                case "message":
                    _showMessage(action.Value);
                    break;
                case "behavior":
                    await _setBehavior(action.Value);
                    break;
                case "url":
                    StartShell(action.Value);
                    break;
                case "app":
                    StartShell(action.Value);
                    break;
                case "sound":
                    PlaySound(action.Value);
                    break;
            }
        }
    }

    private static void StartShell(string target)
    {
        if (string.IsNullOrWhiteSpace(target)) return;
        Process.Start(new ProcessStartInfo
        {
            FileName = target,
            UseShellExecute = true
        });
    }

    private void PlaySound(string path)
    {
        var resolved = _configService.ResolveAsset(path);
        if (!File.Exists(resolved)) return;

        var player = new MediaPlayer();
        player.MediaEnded += (_, _) =>
        {
            player.Close();
            _players.Remove(player);
        };
        _players.Add(player);
        player.Open(new Uri(resolved));
        player.Play();
    }
}

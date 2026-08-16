using System.IO;
using System.Diagnostics;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using PlaygroundDesktopPet.Models;
using PlaygroundDesktopPet.Services;

namespace PlaygroundDesktopPet;

public partial class MainWindow : Window
{
    private readonly ConfigService _configService = new();
    private readonly Random _random = new();
    private readonly CancellationTokenSource _lifetime = new();
    private readonly GlobalKeyboardHook _keyboardHook = new();
    private readonly CommandExecutor _commandExecutor;

    private PetConfig _config;
    private Point _dragStart;
    private bool _dragging;
    private CancellationTokenSource? _behaviorToken;
    private CancellationTokenSource? _bubbleToken;

    public MainWindow()
    {
        InitializeComponent();
        _config = _configService.Load();
        _commandExecutor = new CommandExecutor(_configService, ShowMessage, SetBehaviorAsync);

        FallbackLabel.Text = _config.PetName;
        Loaded += MainWindow_Loaded;
        Closed += MainWindow_Closed;

        _keyboardHook.SlashPressed += () => Dispatcher.Invoke(OpenCommandPalette);
        _keyboardHook.Start();
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        Left = Math.Max(0, SystemParameters.WorkArea.Width - Width - 30);
        Top = Math.Max(0, SystemParameters.WorkArea.Height - Height - 20);
        await SetBehaviorAsync("idle");
        _ = RandomBehaviorLoopAsync(_lifetime.Token);
    }

    private void MainWindow_Closed(object? sender, EventArgs e)
    {
        _lifetime.Cancel();
        _keyboardHook.Dispose();
        _behaviorToken?.Cancel();
        _bubbleToken?.Cancel();
    }

    private async Task RandomBehaviorLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            var min = Math.Max(2, _config.RandomActionMinSeconds);
            var max = Math.Max(min + 1, _config.RandomActionMaxSeconds + 1);
            await Task.Delay(TimeSpan.FromSeconds(_random.Next(min, max)), token);
            if (_dragging || CommandPanel.Visibility == Visibility.Visible) continue;

            var candidates = _config.Behaviors
                .Where(x => x.RandomEnabled && x.Weight > 0)
                .ToList();
            if (candidates.Count == 0) continue;

            var totalWeight = candidates.Sum(x => x.Weight);
            var pick = _random.Next(1, totalWeight + 1);
            PetBehavior? selected = null;
            foreach (var behavior in candidates)
            {
                pick -= behavior.Weight;
                if (pick <= 0)
                {
                    selected = behavior;
                    break;
                }
            }

            if (selected is not null)
                await SetBehaviorAsync(selected.Id);
        }
    }

    private async Task SetBehaviorAsync(string id)
    {
        var behavior = _config.Behaviors.FirstOrDefault(x => x.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
        if (behavior is null) return;

        _behaviorToken?.Cancel();
        _behaviorToken = new CancellationTokenSource();
        var token = _behaviorToken.Token;

        ApplyBehaviorVisual(behavior);

        if (behavior.DurationMs > 0 && !id.Equals("idle", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                await Task.Delay(behavior.DurationMs, token);
                if (!token.IsCancellationRequested && !_dragging)
                    ApplyBehaviorVisual(_config.Behaviors.FirstOrDefault(x => x.Id == "idle") ?? behavior);
            }
            catch (TaskCanceledException)
            {
            }
        }
    }

    private void ApplyBehaviorVisual(PetBehavior behavior)
    {
        var resolved = _configService.ResolveAsset(behavior.AssetPath);
        if (File.Exists(resolved))
        {
            try
            {
                PetImage.Source = LoadBitmapUnlocked(resolved);
                PetImage.Visibility = Visibility.Visible;
                FallbackPet.Visibility = Visibility.Collapsed;
                return;
            }
            catch
            {
            }
        }

        PetImage.Visibility = Visibility.Collapsed;
        FallbackPet.Visibility = Visibility.Visible;
        FallbackFace.Text = behavior.Id switch
        {
            "sleep" => "－ᴗ－ zZ",
            "tired" => "´-ω-`",
            "surprised" => "°口°",
            "focus" => "•̀ᴗ•́",
            "happy" => ">ᴗ<",
            "drag" => ">口<",
            "blank" => "•_•",
            _ => "•ᴗ•"
        };
    }

    private static BitmapImage LoadBitmapUnlocked(string path)
    {
        var bitmap = new BitmapImage();
        using var stream = File.OpenRead(path);
        bitmap.BeginInit();
        bitmap.CacheOption = BitmapCacheOption.OnLoad;
        bitmap.StreamSource = stream;
        bitmap.EndInit();
        bitmap.Freeze();
        return bitmap;
    }

private async void Pet_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    if (CommandPanel.Visibility == Visibility.Visible) return;
    if (e.ChangedButton != MouseButton.Left) return;

    _dragging = true;

    // 기다리지 않고 드래그 포즈만 즉시 적용
    var dragBehavior = _config.Behaviors
        .FirstOrDefault(x => x.Id.Equals("drag", StringComparison.OrdinalIgnoreCase));

    if (dragBehavior is not null)
        ApplyBehaviorVisual(dragBehavior);

    try
    {
        DragMove();
    }
    catch (InvalidOperationException)
    {
    }
    finally
    {
        _dragging = false;

        EnsurePetVisible();
        Topmost = true;

        await SetBehaviorAsync("surprised");
    }
}
private void Pet_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
{
    // DragMove() 종료 후 MouseLeftButtonDown의 finally에서 처리함.
}

    private void Pet_MouseMove(object sender, MouseEventArgs e)
{
    // DragMove()가 창 이동을 담당함.
}

    private void Pet_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        var menu = new System.Windows.Controls.ContextMenu();

        var commands = new System.Windows.Controls.MenuItem { Header = "명령어 열기" };
        commands.Click += (_, _) => OpenCommandPalette();
        menu.Items.Add(commands);

        var config = new System.Windows.Controls.MenuItem { Header = "설정 파일 열기" };
        config.Click += (_, _) => OpenConfigFile();
        menu.Items.Add(config);

        var folder = new System.Windows.Controls.MenuItem { Header = "캐릭터 이미지 폴더 열기" };
        folder.Click += (_, _) => Process.Start(new ProcessStartInfo(_configService.AssetsDirectory) { UseShellExecute = true });
        menu.Items.Add(folder);

        var reload = new System.Windows.Controls.MenuItem { Header = "설정 다시 불러오기" };
        reload.Click += (_, _) => ReloadConfig();
        menu.Items.Add(reload);

        menu.Items.Add(new System.Windows.Controls.Separator());
        var exit = new System.Windows.Controls.MenuItem { Header = "종료" };
        exit.Click += (_, _) => Close();
        menu.Items.Add(exit);

        menu.IsOpen = true;
    }

private void OpenCommandPalette()
{
    if (!IsLoaded) return;

    EnsurePetVisible();
    Topmost = true;

    CommandPanel.Visibility = Visibility.Visible;
    _ = SetBehaviorAsync("focus");
    CommandInput.Text = "/";
    CommandInput.CaretIndex = CommandInput.Text.Length;
    RefreshCommandList();

    Activate();
    CommandInput.Focus();
}

    private void CloseCommandPalette()
    {
        CommandPanel.Visibility = Visibility.Collapsed;
        CommandInput.Clear();
        _ = SetBehaviorAsync("idle");
    }

    private void CommandInput_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
    {
        RefreshCommandList();
    }

    private void RefreshCommandList()
    {
        var query = CommandInput.Text.Trim();
        var matches = _config.Commands
            .Where(x => string.IsNullOrWhiteSpace(query) || x.Trigger.Contains(query, StringComparison.OrdinalIgnoreCase) || x.Description.Contains(query, StringComparison.OrdinalIgnoreCase))
            .Take(8)
            .ToList();

        CommandList.ItemsSource = matches.Select(x => $"▶ {x.Trigger}   {x.Description}").ToList();
        if (CommandList.Items.Count > 0) CommandList.SelectedIndex = 0;
    }

    private async void CommandInput_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            CloseCommandPalette();
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Down && CommandList.Items.Count > 0)
        {
            CommandList.SelectedIndex = Math.Min(CommandList.Items.Count - 1, CommandList.SelectedIndex + 1);
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Up && CommandList.Items.Count > 0)
        {
            CommandList.SelectedIndex = Math.Max(0, CommandList.SelectedIndex - 1);
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Enter)
        {
            await ExecuteSelectedCommandAsync();
            e.Handled = true;
        }
    }

    private async void CommandList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        await ExecuteSelectedCommandAsync();
    }

    private async Task ExecuteSelectedCommandAsync()
    {
        PetCommand? command = null;
        var exact = CommandInput.Text.Trim();
        if (!string.IsNullOrWhiteSpace(exact))
            command = _config.Commands.FirstOrDefault(x => x.Trigger.Equals(exact, StringComparison.OrdinalIgnoreCase));

        if (command is null && CommandList.SelectedIndex >= 0)
        {
            var query = CommandInput.Text.Trim();
            command = _config.Commands
                .Where(x => string.IsNullOrWhiteSpace(query) || x.Trigger.Contains(query, StringComparison.OrdinalIgnoreCase) || x.Description.Contains(query, StringComparison.OrdinalIgnoreCase))
                .Skip(CommandList.SelectedIndex)
                .FirstOrDefault();
        }

        if (command is null)
        {
            ShowMessage("명령어를 찾지 못했어.");
            return;
        }

        CloseCommandPalette();
        try
        {
            await _commandExecutor.ExecuteAsync(command);
        }
        catch (Exception ex)
        {
            ShowMessage($"실행 실패: {ex.Message}");
        }
    }

    private void ShowMessage(string message)
    {
        _bubbleToken?.Cancel();
        _bubbleToken = new CancellationTokenSource();
        var token = _bubbleToken.Token;

        SpeechText.Text = message;
        SpeechBubble.Visibility = Visibility.Visible;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(3500, token);
                if (!token.IsCancellationRequested)
                    await Dispatcher.InvokeAsync(() => SpeechBubble.Visibility = Visibility.Collapsed);
            }
            catch (TaskCanceledException)
            {
            }
        });
    }

    private void OpenConfigFile()
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = _configService.ConfigPath,
            UseShellExecute = true
        });
    }

    private void ReloadConfig()
    {
        _config = _configService.Load();
        FallbackLabel.Text = _config.PetName;
        ShowMessage("설정을 다시 불러왔어.");
        _ = SetBehaviorAsync("idle");
    }
private void EnsurePetVisible()
{
    var workArea = SystemParameters.WorkArea;

    var width = ActualWidth > 0 ? ActualWidth : Width;
    var height = ActualHeight > 0 ? ActualHeight : Height;

    Left = Math.Clamp(
        Left,
        workArea.Left,
        Math.Max(workArea.Left, workArea.Right - width)
    );

    Top = Math.Clamp(
        Top,
        workArea.Top,
        Math.Max(workArea.Top, workArea.Bottom - height)
    );

    if (!Topmost)
        Topmost = true;
}
}

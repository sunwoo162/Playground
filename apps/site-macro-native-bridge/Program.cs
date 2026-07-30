using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

static class Program
{
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out CursorPoint point);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);

    private const int Restore = 9;
    private const uint LeftDown = 0x0002;
    private const uint LeftUp = 0x0004;
    private const uint KeyDown = 0x0100;
    private const uint KeyUp = 0x0101;
    private const uint Char = 0x0102;
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [STAThread]
    static void Main()
    {
        try
        {
            var request = ReadMessage();
            var result = Run(request);
            WriteMessage(new { ok = true, message = result });
        }
        catch (Exception ex)
        {
            WriteMessage(new { ok = false, message = ex.Message });
        }
    }

    static JsonElement ReadMessage()
    {
        var input = Console.OpenStandardInput();
        Span<byte> lengthBytes = stackalloc byte[4];
        if (input.Read(lengthBytes) != 4) throw new InvalidOperationException("메시지 길이를 읽지 못했습니다.");
        var length = BitConverter.ToInt32(lengthBytes);
        if (length <= 0 || length > 1024 * 1024) throw new InvalidOperationException("메시지 길이가 올바르지 않습니다.");
        var buffer = new byte[length];
        var read = 0;
        while (read < length)
        {
            var chunk = input.Read(buffer, read, length - read);
            if (chunk <= 0) throw new InvalidOperationException("메시지 본문을 읽지 못했습니다.");
            read += chunk;
        }
        return JsonDocument.Parse(buffer).RootElement.Clone();
    }

    static void WriteMessage(object value)
    {
        var json = JsonSerializer.Serialize(value);
        var bytes = Encoding.UTF8.GetBytes(json);
        var output = Console.OpenStandardOutput();
        output.Write(BitConverter.GetBytes(bytes.Length));
        output.Write(bytes);
        output.Flush();
    }

    static string Run(JsonElement request)
    {
        if (GetString(request, "type") == "listWindows")
        {
            var windows = GetWindows();
            WriteMessage(new { ok = true, windows, message = $"{windows.Count}개 창 조회 완료" });
            Environment.Exit(0);
        }

        if (GetString(request, "type") == "previewWindow")
        {
            var previewProcessName = GetString(request, "process");
            var previewWindowTitle = GetString(request, "windowTitle");
            var previewHandle = FindWindow(previewProcessName, previewWindowTitle);
            if (previewHandle == IntPtr.Zero) throw new InvalidOperationException("대상 Windows 앱 창을 찾지 못했습니다.");
            var preview = CaptureWindowDataUrl(previewHandle);
            WriteMessage(new { ok = true, preview, message = "창 미리보기 캡처 완료" });
            Environment.Exit(0);
        }

        if (GetString(request, "type") == "focusWindow")
        {
            var focusProcessName = GetString(request, "process");
            var focusWindowTitle = GetString(request, "windowTitle");
            var focusHandle = FindWindow(focusProcessName, focusWindowTitle);
            if (focusHandle == IntPtr.Zero) throw new InvalidOperationException("대상 Windows 앱 창을 찾지 못했습니다.");
            ShowWindow(focusHandle, Restore);
            SetForegroundWindow(focusHandle);
            WriteMessage(new { ok = true, message = "창을 앞으로 가져왔습니다." });
            Environment.Exit(0);
        }

        if (GetString(request, "type") == "getCursorPosition")
        {
            if (!GetCursorPos(out var point)) throw new InvalidOperationException("마우스 위치를 읽지 못했습니다.");
            WriteMessage(new { ok = true, point = new { x = point.X, y = point.Y }, message = "마우스 위치 조회 완료" });
            Environment.Exit(0);
        }

        var processName = GetString(request, "process");
        var windowTitle = GetString(request, "windowTitle");
        var handle = FindWindow(processName, windowTitle);
        if (handle == IntPtr.Zero) throw new InvalidOperationException("대상 Windows 앱 창을 찾지 못했습니다.");

        var count = 0;
        if (request.TryGetProperty("actions", out var actions) && actions.ValueKind == JsonValueKind.Array)
        {
            foreach (var action in actions.EnumerateArray().Take(20))
            {
                RunAction(action, handle);
                count++;
            }
        }
        return $"{count}개 Windows 앱 액션 실행 완료";
    }

    static List<object> GetWindows() =>
        Process.GetProcesses()
            .Where(p => p.MainWindowHandle != IntPtr.Zero && !string.IsNullOrWhiteSpace(p.MainWindowTitle))
            .OrderBy(p => p.ProcessName)
            .Select(p => new
            {
                process = p.ProcessName,
                title = p.MainWindowTitle,
                id = p.Id,
                icon = GetIconDataUrl(p)
            })
            .Cast<object>()
            .ToList();

    static IntPtr FindWindow(string processName, string windowTitle)
    {
        var candidates = Process.GetProcesses()
            .Where(p => string.IsNullOrWhiteSpace(processName) || p.ProcessName.Contains(processName, StringComparison.OrdinalIgnoreCase))
            .Where(p => p.MainWindowHandle != IntPtr.Zero);

        if (!string.IsNullOrWhiteSpace(windowTitle))
        {
            candidates = candidates.Where(p => p.MainWindowTitle.Contains(windowTitle, StringComparison.OrdinalIgnoreCase));
        }

        return candidates.FirstOrDefault()?.MainWindowHandle ?? IntPtr.Zero;
    }

    static void RunAction(JsonElement action, IntPtr handle)
    {
        var type = GetString(action, "type");
        if (type == "wait")
        {
            Thread.Sleep(Math.Clamp(GetInt(action, "ms", 1000), 0, 30000));
            return;
        }
        if (type == "key")
        {
            PostKey(handle, GetString(action, "value", "Enter"));
            Thread.Sleep(80);
            return;
        }
        if (type == "type")
        {
            FocusWindow(handle);
            SendKeys.SendWait(EscapeSendKeys(GetString(action, "value")));
            Thread.Sleep(80);
            return;
        }
        if (type == "nativeClick")
        {
            var x = GetInt(action, "x", 0);
            var y = GetInt(action, "y", 0);
            FocusWindow(handle);
            SetCursorPos(x, y);
            mouse_event(LeftDown, 0, 0, 0, UIntPtr.Zero);
            mouse_event(LeftUp, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(80);
        }
    }

    static void FocusWindow(IntPtr handle)
    {
        ShowWindow(handle, Restore);
        SetForegroundWindow(handle);
        Thread.Sleep(180);
    }

    static void PostKey(IntPtr handle, string value)
    {
        var key = ToVirtualKey(value);
        if (key == 0) return;
        foreach (var target in GetMessageTargets(handle))
        {
            var scanCode = ToScanCode(key);
            var keyDownParam = (IntPtr)(1 | (scanCode << 16));
            var keyUpParam = (IntPtr)(1 | (scanCode << 16) | unchecked((int)0xC0000000));
            PostMessage(target, KeyDown, (IntPtr)key, keyDownParam);
            if (key == 0x0D) PostMessage(target, Char, (IntPtr)'\r', keyDownParam);
            PostMessage(target, KeyUp, (IntPtr)key, keyUpParam);
        }
    }

    static IEnumerable<IntPtr> GetMessageTargets(IntPtr handle)
    {
        var targets = new List<IntPtr> { handle };
        EnumChildWindows(handle, (child, _) =>
        {
            if (!IsWindowVisible(child)) return true;
            targets.Add(child);
            return true;
        }, IntPtr.Zero);
        targets.Reverse();
        return targets;
    }

    static int ToScanCode(int virtualKey) => virtualKey switch
    {
        0x0D => 0x1C,
        0x1B => 0x01,
        0x09 => 0x0F,
        0x20 => 0x39,
        0x08 => 0x0E,
        0x2E => 0x53,
        _ => 0
    };

    static int ToVirtualKey(string value) => value.Trim().ToLowerInvariant() switch
    {
        "enter" or "return" => 0x0D,
        "esc" or "escape" => 0x1B,
        "tab" => 0x09,
        "space" => 0x20,
        "backspace" => 0x08,
        "delete" => 0x2E,
        _ => 0
    };

    static string ToSendKeys(string value) => value.Trim().ToLowerInvariant() switch
    {
        "enter" => "{ENTER}",
        "esc" or "escape" => "{ESC}",
        "tab" => "{TAB}",
        "space" => " ",
        "backspace" => "{BACKSPACE}",
        "delete" => "{DELETE}",
        _ => EscapeSendKeys(value)
    };

    static string EscapeSendKeys(string value) =>
        value.Replace("+", "{+}").Replace("^", "{^}").Replace("%", "{%}").Replace("~", "{~}")
             .Replace("(", "{(}").Replace(")", "{)}").Replace("[", "{[}").Replace("]", "{]}");

    static string GetString(JsonElement obj, string name, string fallback = "") =>
        obj.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? fallback : fallback;

    static int GetInt(JsonElement obj, string name, int fallback) =>
        obj.TryGetProperty(name, out var value) && value.TryGetInt32(out var result) ? result : fallback;

    static string GetIconDataUrl(Process process)
    {
        try
        {
            var path = process.MainModule?.FileName;
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return "";
            using var icon = Icon.ExtractAssociatedIcon(path);
            if (icon == null) return "";
            using var bitmap = icon.ToBitmap();
            using var stream = new MemoryStream();
            bitmap.Save(stream, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
        }
        catch
        {
            return "";
        }
    }

    static string CaptureWindowDataUrl(IntPtr handle)
    {
        ShowWindow(handle, Restore);
        SetForegroundWindow(handle);
        Thread.Sleep(220);
        if (!GetWindowRect(handle, out var rect)) throw new InvalidOperationException("창 위치를 읽지 못했습니다.");
        var width = rect.Right - rect.Left;
        var height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) throw new InvalidOperationException("창 크기가 올바르지 않습니다.");

        using var bitmap = new Bitmap(width, height);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));
        }
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Jpeg);
        return "data:image/jpeg;base64," + Convert.ToBase64String(stream.ToArray());
    }

    [StructLayout(LayoutKind.Sequential)]
    struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct CursorPoint
    {
        public int X;
        public int Y;
    }
}

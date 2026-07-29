using System.Diagnostics;
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

    private const int Restore = 9;
    private const uint LeftDown = 0x0002;
    private const uint LeftUp = 0x0004;

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
        var processName = GetString(request, "process");
        var windowTitle = GetString(request, "windowTitle");
        var handle = FindWindow(processName, windowTitle);
        if (handle == IntPtr.Zero) throw new InvalidOperationException("대상 Windows 앱 창을 찾지 못했습니다.");

        ShowWindow(handle, Restore);
        SetForegroundWindow(handle);
        Thread.Sleep(180);

        var count = 0;
        if (request.TryGetProperty("actions", out var actions) && actions.ValueKind == JsonValueKind.Array)
        {
            foreach (var action in actions.EnumerateArray().Take(20))
            {
                RunAction(action);
                count++;
            }
        }
        return $"{count}개 Windows 앱 액션 실행 완료";
    }

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

    static void RunAction(JsonElement action)
    {
        var type = GetString(action, "type");
        if (type == "wait")
        {
            Thread.Sleep(Math.Clamp(GetInt(action, "ms", 1000), 0, 30000));
            return;
        }
        if (type == "key")
        {
            SendKeys.SendWait(ToSendKeys(GetString(action, "value", "Enter")));
            Thread.Sleep(80);
            return;
        }
        if (type == "type")
        {
            SendKeys.SendWait(EscapeSendKeys(GetString(action, "value")));
            Thread.Sleep(80);
            return;
        }
        if (type == "nativeClick")
        {
            var x = GetInt(action, "x", 0);
            var y = GetInt(action, "y", 0);
            SetCursorPos(x, y);
            mouse_event(LeftDown, 0, 0, 0, UIntPtr.Zero);
            mouse_event(LeftUp, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(80);
        }
    }

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
}

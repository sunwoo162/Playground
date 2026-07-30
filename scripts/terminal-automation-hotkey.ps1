$ErrorActionPreference = 'Continue'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class TerminalHotkeyWindow : Form
{
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    const int HotkeyId = 9107;
    const int WmHotkey = 0x0312;
    const uint ModAlt = 0x0001;
    const uint ModShift = 0x0004;
    const uint VkU = 0x55;
    const uint WmKeyDown = 0x0100;
    const uint WmKeyUp = 0x0101;
    const uint WmChar = 0x0102;

    Timer timer;
    NotifyIcon notify;
    string targetTitle = "";

    public TerminalHotkeyWindow()
    {
        ShowInTaskbar = false;
        WindowState = FormWindowState.Minimized;
        Opacity = 0;
        notify = new NotifyIcon();
        notify.Icon = System.Drawing.SystemIcons.Information;
        notify.Visible = true;
        notify.Text = "Terminal automation hotkey";
        if (!RegisterHotKey(Handle, HotkeyId, ModAlt | ModShift, VkU))
        {
            notify.ShowBalloonTip(5000, "Terminal automation", "Alt+Shift+U is already used by another app", ToolTipIcon.Error);
            throw new InvalidOperationException("Alt+Shift+U hotkey registration failed.");
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmHotkey && m.WParam.ToInt32() == HotkeyId) Toggle();
        base.WndProc(ref m);
    }

    protected override void Dispose(bool disposing)
    {
        UnregisterHotKey(Handle, HotkeyId);
        if (timer != null) timer.Dispose();
        if (notify != null) notify.Dispose();
        base.Dispose(disposing);
    }

    void Toggle()
    {
        if (timer != null)
        {
            timer.Stop();
            timer.Dispose();
            timer = null;
            notify.ShowBalloonTip(1800, "Terminal automation", "Stopped", ToolTipIcon.Info);
            return;
        }

        var handle = FindCodeWindow();
        if (handle == IntPtr.Zero)
        {
            notify.ShowBalloonTip(2500, "Terminal automation", "VS Code window not found", ToolTipIcon.Warning);
            return;
        }

        timer = new Timer();
        timer.Interval = 2000;
        timer.Tick += (_, __) => SendEnter(FindCodeWindow());
        timer.Start();
        SendEnter(handle);
        notify.ShowBalloonTip(1800, "Terminal automation", "Started", ToolTipIcon.Info);
    }

    IntPtr FindCodeWindow()
    {
        var candidates = Process.GetProcesses()
            .Where(p => p.ProcessName.IndexOf("Code", StringComparison.OrdinalIgnoreCase) >= 0)
            .Where(p => p.MainWindowHandle != IntPtr.Zero)
            .Where(p => !String.IsNullOrWhiteSpace(p.MainWindowTitle));

        if (!String.IsNullOrWhiteSpace(targetTitle))
        {
            candidates = candidates.Where(p => p.MainWindowTitle.IndexOf(targetTitle, StringComparison.OrdinalIgnoreCase) >= 0);
        }

        var process = candidates.OrderByDescending(p => p.StartTime).FirstOrDefault();
        return process == null ? IntPtr.Zero : process.MainWindowHandle;
    }

    void SendEnter(IntPtr handle)
    {
        if (handle == IntPtr.Zero) return;
        int key = 0x0D;
        int scanCode = 0x1C;
        IntPtr down = (IntPtr)(1 | (scanCode << 16));
        IntPtr up = (IntPtr)(1 | (scanCode << 16) | unchecked((int)0xC0000000));
        foreach (var target in GetTargets(handle))
        {
            PostMessage(target, WmKeyDown, (IntPtr)key, down);
            PostMessage(target, WmChar, (IntPtr)'\r', down);
            PostMessage(target, WmKeyUp, (IntPtr)key, up);
        }
    }

    IEnumerable<IntPtr> GetTargets(IntPtr handle)
    {
        var targets = new List<IntPtr> { handle };
        EnumChildWindows(handle, (child, _) => {
            if (IsWindowVisible(child)) targets.Add(child);
            return true;
        }, IntPtr.Zero);
        targets.Reverse();
        return targets;
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms,System.Drawing
[System.Windows.Forms.Application]::Run((New-Object TerminalHotkeyWindow))

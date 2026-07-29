// FocusTime Tracker - Windows 트레이 앱
// 전경 창(앱) 사용 시간 추적 + 로컬 HTTP 서버로 FocusTime 대시보드에 데이터 제공
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace FocusTimeTracker
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            // 다중 실행 방지 — 같은 PC에서 두 번째 인스턴스는 바로 종료
            bool created;
            using (var mutex = new Mutex(true, @"Global\FocusTimeTrackerSingleInstance", out created))
            {
                if (!created) return;
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (var app = new TrackerApp())
                {
                    app.Start();
                    Application.Run();
                }
                GC.KeepAlive(mutex);
            }
        }
    }

    internal sealed class TrackerApp : IDisposable
    {
        // ---------- P/Invoke ----------
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        [DllImport("user32.dll")]
        private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
        [DllImport("kernel32.dll")]
        private static extern ulong GetTickCount64();

        [StructLayout(LayoutKind.Sequential)]
        private struct LASTINPUTINFO
        {
            public uint cbSize;
            public uint dwTime;
        }

        // ---------- 상태 ----------
        private const int Port = 7421;
        private const int IdleThreshold = 60000;

        private NotifyIcon tray;
        private System.Windows.Forms.Timer timer;
        private TcpListener server;
        private Thread serverThread;
        private volatile bool running = true;
        private volatile bool tracking = true;

        private readonly object sync = new object();
        private readonly Dictionary<string, Dictionary<string, long>> allDays =
            new Dictionary<string, Dictionary<string, long>>();
        private string currentDate;

        private string activeProc = null;
        private string activeTitle = "";
        private DateTime lastTick;
        private DateTime lastSave;
        private readonly Dictionary<uint, string> pidCache = new Dictionary<uint, string>();

        // 앱 목록/아이콘/한도
        private sealed class AppInfo { public string name; public string display; public string exePath; public bool running; }
        private Dictionary<string, AppInfo> appIndex;
        private DateTime appIndexBuiltAt;
        private readonly Dictionary<string, byte[]> iconCache = new Dictionary<string, byte[]>();
        private readonly Dictionary<string, int> appLimits = new Dictionary<string, int>(); // name -> 분
        private readonly HashSet<string> notifiedApps = new HashSet<string>();
        private readonly object appBuildLock = new object();

        private readonly string dataDir;
        private readonly string dataFile;

        public TrackerApp()
        {
            dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "FocusTime");
            Directory.CreateDirectory(dataDir);
            dataFile = Path.Combine(dataDir, "app-usage.json");
            currentDate = DateTime.Now.ToString("yyyy-MM-dd");
            lock (sync) { allDays[currentDate] = new Dictionary<string, long>(); }
            LoadData();
            LoadAppLimits();
            LoadAppIndexCache();
        }

        // ---------- 시작/종료 ----------
        public void Start()
        {
            tray = new NotifyIcon();
            tray.Icon = MakeIcon();
            tray.Visible = true;
            tray.Text = "FocusTime 트래커";
            tray.ContextMenuStrip = BuildMenu();
            tray.DoubleClick += (s, e) => OpenStatus();

            timer = new System.Windows.Forms.Timer { Interval = 1000 };
            timer.Tick += OnTick;
            lastTick = DateTime.Now;
            lastSave = lastTick;
            timer.Start();

            serverThread = new Thread(Serve) { IsBackground = true };
            serverThread.Start();

            // 앱 목록 주기적 빌드(백그라운드)
            new Thread(() => {
                while (running)
                {
                    try { BuildAppIndexInternal(); } catch { }
                    Thread.Sleep(180000);
                }
            }) { IsBackground = true }.Start();

            UpdateTrayStatus();
        }

        public void Dispose()
        {
            running = false;
            try { if (timer != null) timer.Stop(); } catch { }
            try { SaveData(); } catch { }
            try { if (server != null) server.Stop(); } catch { }
            if (tray != null) { tray.Visible = false; tray.Dispose(); }
        }

        // ---------- 트레이 메뉴 ----------
        private ContextMenuStrip BuildMenu()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("FocusTime 트래커 v1.0").Enabled = false;
            menu.Items.Add(new ToolStripSeparator());
            var status = menu.Items.Add("상태: ..."); status.Name = "status"; status.Enabled = false;
            var today = menu.Items.Add("오늘: 0m"); today.Name = "today"; today.Enabled = false;
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("대시보드 열기", null, (s, e) => OpenStatus());
            var toggle = menu.Items.Add("일시정지", null, (s, e) => ToggleTracking()); toggle.Name = "toggle";
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("종료", null, (s, e) => { SaveData(); Application.Exit(); });
            return menu;
        }

        private void UpdateTrayStatus()
        {
            long total = 0;
            lock (sync) { foreach (var v in allDays[currentDate].Values) total += v; }
            string status = tracking ? ("추적 중: " + (activeProc ?? "대기")) : "일시정지";
            if (tray != null)
            {
                tray.Text = ("FocusTime · " + status).Substring(0, Math.Min(63, ("FocusTime · " + status).Length));
                var m = tray.ContextMenuStrip;
                if (m != null)
                {
                    ((ToolStripItem)m.Items["status"]).Text = "상태: " + status;
                    ((ToolStripItem)m.Items["today"]).Text = "오늘: " + FmtShort(total);
                    ((ToolStripItem)m.Items["toggle"]).Text = tracking ? "일시정지" : "추적 재개";
                }
            }
        }

        private void ToggleTracking()
        {
            tracking = !tracking;
            if (!tracking) { activeProc = null; activeTitle = "(일시정지)"; }
            UpdateTrayStatus();
        }

        private void OpenStatus()
        {
            try { Process.Start("http://localhost:" + Port + "/"); } catch { }
        }

        // ---------- 틱(1초) ----------
        private void OnTick(object sender, EventArgs e)
        {
          try
          {
            var now = DateTime.Now;
            string today = now.ToString("yyyy-MM-dd");
            if (today != currentDate)
            {
                SaveData();
                lock (sync)
                {
                    currentDate = today;
                    if (!allDays.ContainsKey(currentDate)) allDays[currentDate] = new Dictionary<string, long>();
                }
                notifiedApps.Clear();
            }

            double elapsedMs = (now - lastTick).TotalMilliseconds;
            lastTick = now;

            // 이전 구간의 활성 앱에 시간 누적
            if (tracking && activeProc != null)
            {
                long add = (long)Math.Min(elapsedMs, 5000);
                if (add > 0)
                {
                    lock (sync)
                    {
                        var t = allDays[currentDate];
                        if (!t.ContainsKey(activeProc)) t[activeProc] = 0;
                        t[activeProc] += add;
                    }
                }
            }

            // 새 활성 앱 결정
            if (!tracking)
            {
                activeProc = null;
                activeTitle = "(일시정지)";
            }
            else if (IsIdle())
            {
                activeProc = null;
                activeTitle = "(유휴)";
            }
            else
            {
                IntPtr hwnd = GetForegroundWindow();
                string proc = null, title = "";
                if (hwnd != IntPtr.Zero)
                {
                    uint pid;
                    GetWindowThreadProcessId(hwnd, out pid);
                    proc = GetProcessName(pid);
                    var sb = new StringBuilder(256);
                    if (GetWindowText(hwnd, sb, 256) > 0) title = sb.ToString();
                }
                activeProc = proc;
                activeTitle = title;
            }

            EnforceAppLimits();
            if (now - lastSave > TimeSpan.FromSeconds(10)) { SaveData(); lastSave = now; }
            UpdateTrayStatus();
          }
          catch { /* 예외로 인한 크래시/비정상 누적 방지 */ }
        }

        private bool IsIdle()
        {
            var lii = new LASTINPUTINFO();
            lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
            if (GetLastInputInfo(ref lii))
            {
                ulong nowTick = GetTickCount64();
                return (nowTick - lii.dwTime) > (ulong)IdleThreshold;
            }
            return false;
        }

        private string GetProcessName(uint pid)
        {
            if (pid == 0) return null;
            string name;
            if (pidCache.TryGetValue(pid, out name)) return name;
            try
            {
                var p = Process.GetProcessById((int)pid);
                name = p.ProcessName;
                pidCache[pid] = name;
                return name;
            }
            catch
            {
                return null;
            }
        }

        // ---------- 저장/로드 ----------
        private void LoadData()
        {
            if (!File.Exists(dataFile)) return;
            try
            {
                var ser = new JavaScriptSerializer();
                var parsed = ser.Deserialize<Dictionary<string, Dictionary<string, long>>>(File.ReadAllText(dataFile));
                if (parsed != null)
                {
                    lock (sync)
                    {
                        allDays.Clear();
                        foreach (var kv in parsed)
                            allDays[kv.Key] = kv.Value ?? new Dictionary<string, long>();
                        if (!allDays.ContainsKey(currentDate)) allDays[currentDate] = new Dictionary<string, long>();
                    }
                }
            }
            catch { }
        }

        private void SaveData()
        {
            try
            {
                var ser = new JavaScriptSerializer();
                string text;
                lock (sync) { text = ser.Serialize(allDays); }
                File.WriteAllText(dataFile, text);
            }
            catch { }
        }

        // ---------- 앱 목록 / 아이콘 / 한도 ----------
        private void LoadAppLimits()
        {
            try
            {
                string f = Path.Combine(dataDir, "app-limits.json");
                if (!File.Exists(f)) return;
                var ser = new JavaScriptSerializer();
                var parsed = ser.Deserialize<Dictionary<string, int>>(File.ReadAllText(f));
                if (parsed != null)
                {
                    appLimits.Clear();
                    foreach (var kv in parsed) if (kv.Value > 0) appLimits[kv.Key] = kv.Value;
                }
            }
            catch { }
        }

        private void SaveAppLimits()
        {
            try
            {
                var ser = new JavaScriptSerializer();
                File.WriteAllText(Path.Combine(dataDir, "app-limits.json"), ser.Serialize(appLimits));
            }
            catch { }
        }

        private void EnforceAppLimits()
        {
            if (appLimits.Count == 0 || tray == null) return;
            Dictionary<string, long> today;
            lock (sync) { today = allDays[currentDate]; }
            foreach (var kv in appLimits)
            {
                long limitMs = kv.Value * 60000L;
                long used = today.ContainsKey(kv.Key) ? today[kv.Key] : 0;
                if (used >= limitMs && !notifiedApps.Contains(kv.Key))
                {
                    notifiedApps.Add(kv.Key);
                    try
                    {
                        tray.ShowBalloonTip(5000, "FocusTime 한도 초과",
                            kv.Key + " 의 오늘 한도(" + kv.Value + "분)를 초과했습니다.", ToolTipIcon.Warning);
                    }
                    catch { }
                }
            }
        }

        private void EnsureAppIndex()
        {
            if (appIndex != null) return;
            BuildAppIndexInternal();
        }

        private void BuildAppIndexInternal()
        {
            lock (appBuildLock)
            {
                if (appIndex != null && (DateTime.Now - appIndexBuiltAt).TotalSeconds < 30) return;
                var index = new Dictionary<string, AppInfo>(StringComparer.OrdinalIgnoreCase);
            var runningNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                foreach (var p in Process.GetProcesses())
                {
                    try { runningNames.Add(p.ProcessName); } catch { }
                }
            }
            catch { }

            // 시작 메뉴 바로가기 → 설치된 앱
            var dirs = new[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), "Programs"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs")
            };
            foreach (var dir in dirs)
            {
                if (!Directory.Exists(dir)) continue;
                string[] files;
                try { files = Directory.GetFiles(dir, "*.lnk", SearchOption.AllDirectories); }
                catch { continue; }
                foreach (var lnk in files)
                {
                    string target = ResolveShortcut(lnk);
                    if (string.IsNullOrEmpty(target) || !File.Exists(target)) continue;
                    string name = Path.GetFileNameWithoutExtension(target);
                    if (string.IsNullOrEmpty(name)) continue;
                    if (!index.ContainsKey(name))
                    {
                        index[name] = new AppInfo
                        {
                            name = name,
                            display = Path.GetFileNameWithoutExtension(lnk),
                            exePath = target,
                            running = runningNames.Contains(name)
                        };
                    }
                }
            }
            // 실행 중이지만 시작메뉴에 없는 프로세스도 추가
            foreach (var rn in runningNames)
            {
                if (index.ContainsKey(rn)) { index[rn].running = true; continue; }
                string exePath = null;
                try
                {
                    var procs = Process.GetProcessesByName(rn);
                    if (procs.Length > 0) { try { exePath = procs[0].MainModule.FileName; } catch { } }
                }
                catch { }
                index[rn] = new AppInfo { name = rn, display = rn, exePath = exePath, running = true };
            }

                appIndex = index;
                appIndexBuiltAt = DateTime.Now;
                SaveAppIndexCache();
            }
        }

        private void SaveAppIndexCache()
        {
            try
            {
                var ser = new JavaScriptSerializer();
                var list = new List<object>();
                if (appIndex != null)
                {
                    foreach (var kv in appIndex)
                        list.Add(new Dictionary<string, object> {
                            { "name", kv.Value.name }, { "display", kv.Value.display }, { "exePath", kv.Value.exePath ?? "" } });
                }
                File.WriteAllText(Path.Combine(dataDir, "app-index.json"), ser.Serialize(list));
            }
            catch { }
        }

        private void LoadAppIndexCache()
        {
            try
            {
                string f = Path.Combine(dataDir, "app-index.json");
                if (!File.Exists(f)) return;
                var ser = new JavaScriptSerializer();
                var list = ser.Deserialize<List<Dictionary<string, object>>>(File.ReadAllText(f));
                if (list == null) return;
                var index = new Dictionary<string, AppInfo>(StringComparer.OrdinalIgnoreCase);
                foreach (var d in list)
                {
                    string name = d.ContainsKey("name") ? (string)d["name"] : null;
                    if (string.IsNullOrEmpty(name)) continue;
                    index[name] = new AppInfo
                    {
                        name = name,
                        display = d.ContainsKey("display") ? (string)d["display"] : name,
                        exePath = d.ContainsKey("exePath") ? (string)d["exePath"] : null,
                        running = false
                    };
                }
                appIndex = index;
                appIndexBuiltAt = DateTime.MinValue; // 백그라운드에서 곧 갱신
            }
            catch { }
        }

        private static string ResolveShortcut(string lnk)
        {
            try
            {
                Type t = Type.GetTypeFromProgID("WScript.Shell");
                if (t == null) return null;
                object wsh = Activator.CreateInstance(t);
                object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, wsh, new object[] { lnk });
                object tp = sc.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, sc, null);
                return tp as string;
            }
            catch { return null; }
        }

        private byte[] GetAppIconPng(string name)
        {
            if (iconCache.ContainsKey(name)) return iconCache[name];
            EnsureAppIndex();
            AppInfo info;
            if (appIndex == null || !appIndex.TryGetValue(name, out info) ||
                string.IsNullOrEmpty(info.exePath) || !File.Exists(info.exePath))
            {
                return null;
            }
            try
            {
                using (var ico = Icon.ExtractAssociatedIcon(info.exePath))
                {
                    if (ico == null) return null;
                    using (var bmp = ico.ToBitmap())
                    using (var ms = new MemoryStream())
                    {
                        bmp.Save(ms, ImageFormat.Png);
                        var bytes = ms.ToArray();
                        iconCache[name] = bytes;
                        return bytes;
                    }
                }
            }
            catch { return null; }
        }

        // ---------- HTTP 서버 ----------
        private void Serve()
        {
            try
            {
                server = new TcpListener(IPAddress.Loopback, Port);
                server.Start();
            }
            catch
            {
                server = null;
                return;
            }
            while (running)
            {
                TcpClient client;
                try { client = server.AcceptTcpClient(); }
                catch { break; }
                try { HandleClient(client); }
                catch { }
                try { client.Close(); } catch { }
            }
        }

        private void HandleClient(TcpClient client)
        {
            client.ReceiveTimeout = 2000;
            using (var stream = client.GetStream())
            {
                var sr = new StreamReader(stream, Encoding.UTF8);
                string line = sr.ReadLine();
                if (string.IsNullOrEmpty(line)) { WriteText(stream, 400, "bad request", ""); return; }
                // 헤더 소비
                string h; int guard = 0;
                while ((h = sr.ReadLine()) != null && h.Length > 0 && guard++ < 50) { }

                var parts = line.Split(' ');
                if (parts.Length < 3) { WriteText(stream, 400, "bad", ""); return; }
                string method = parts[0];
                string rawUrl = parts[1];

                if (method == "OPTIONS")
                {
                    WriteText(stream, 200, "ok", "", "text/plain", true);
                    return;
                }

                string path = rawUrl, queryStr = "";
                int qi = rawUrl.IndexOf('?');
                if (qi >= 0) { path = rawUrl.Substring(0, qi); queryStr = rawUrl.Substring(qi); }
                var q = ParseQuery(queryStr);

                var ser = new JavaScriptSerializer();

                if (path == "/" || path == "/index.html")
                {
                    WriteText(stream, 200, "ok", StatusPage(ser), "text/html; charset=utf-8");
                    return;
                }
                if (path == "/ping")
                {
                    WriteText(stream, 200, "ok", "{\"ok\":true}", "application/json");
                    return;
                }
                if (path == "/app-usage")
                {
                    var resp = new Dictionary<string, object>();
                    if (q.ContainsKey("date"))
                    {
                        string d = q["date"];
                        Dictionary<string, long> apps;
                        lock (sync) { apps = allDays.ContainsKey(d) ? allDays[d] : new Dictionary<string, long>(); }
                        long t = 0; foreach (var v in apps.Values) t += v;
                        resp["date"] = d;
                        resp["apps"] = apps;
                        resp["total"] = t;
                    }
                    else
                    {
                        int days = 7;
                        if (q.ContainsKey("days")) int.TryParse(q["days"], out days);
                        if (days < 1) days = 1; if (days > 90) days = 90;
                        var dayDict = new Dictionary<string, object>();
                        for (int i = days - 1; i >= 0; i--)
                        {
                            string d = DateTime.Now.AddDays(-i).ToString("yyyy-MM-dd");
                            Dictionary<string, long> apps;
                            lock (sync) { apps = allDays.ContainsKey(d) ? allDays[d] : new Dictionary<string, long>(); }
                            dayDict[d] = apps;
                        }
                        long total = 0;
                        lock (sync) { foreach (var v in allDays[currentDate].Values) total += v; }
                        resp["days"] = dayDict;
                        resp["today"] = currentDate;
                        resp["todayTotal"] = total;
                        resp["tracking"] = tracking;
                        resp["current"] = activeProc ?? "";
                        resp["title"] = activeTitle ?? "";
                        resp["updated"] = DateTimeOffset.Now.ToUnixTimeSeconds();
                    }
                    WriteText(stream, 200, "ok", ser.Serialize(resp), "application/json");
                    return;
                }
                if (path == "/apps")
                {
                    EnsureAppIndex();
                    var list = new List<object>();
                    if (appIndex != null)
                    {
                        foreach (var kv in appIndex)
                        {
                            list.Add(new Dictionary<string, object> {
                                { "name", kv.Value.name },
                                { "display", kv.Value.display },
                                { "running", kv.Value.running },
                                { "hasIcon", !string.IsNullOrEmpty(kv.Value.exePath) }
                            });
                        }
                    }
                    list.Sort((a, b) => {
                        var da = (string)((Dictionary<string, object>)a)["display"];
                        var db = (string)((Dictionary<string, object>)b)["display"];
                        return string.Compare(da, db, StringComparison.OrdinalIgnoreCase);
                    });
                    var resp = new Dictionary<string, object> { { "apps", list } };
                    WriteText(stream, 200, "ok", ser.Serialize(resp), "application/json");
                    return;
                }
                if (path == "/app-icon")
                {
                    string name = q.ContainsKey("name") ? q["name"] : "";
                    var png = GetAppIconPng(name);
                    if (png == null) { WriteText(stream, 404, "no icon", "", "text/plain"); return; }
                    WriteBytes(stream, 200, "ok", png, "image/png");
                    return;
                }
                if (path == "/app-limits")
                {
                    var resp = new Dictionary<string, object>();
                    var lim = new Dictionary<string, int>();
                    foreach (var kv in appLimits) lim[kv.Key] = kv.Value;
                    resp["limits"] = lim;
                    resp["tracking"] = tracking;
                    WriteText(stream, 200, "ok", ser.Serialize(resp), "application/json");
                    return;
                }
                if (path == "/set-app-limit")
                {
                    string name = q.ContainsKey("name") ? q["name"] : "";
                    int minutes = 0;
                    if (q.ContainsKey("minutes")) int.TryParse(q["minutes"], out minutes);
                    if (!string.IsNullOrEmpty(name))
                    {
                        if (minutes > 0) appLimits[name] = minutes;
                        else { appLimits.Remove(name); notifiedApps.Remove(name); }
                        SaveAppLimits();
                    }
                    WriteText(stream, 200, "ok", "{\"ok\":true}", "application/json");
                    return;
                }
                WriteText(stream, 404, "not found", "{\"error\":\"not found\"}", "application/json");
            }
        }

        private string StatusPage(JavaScriptSerializer ser)
        {
            long total = 0;
            List<KeyValuePair<string, long>> list;
            lock (sync)
            {
                var t = allDays[currentDate];
                list = new List<KeyValuePair<string, long>>(t);
                foreach (var v in t.Values) total += v;
            }
            list.Sort((a, b) => b.Value.CompareTo(a.Value));
            var sb = new StringBuilder();
            sb.Append("<!doctype html><html lang='ko'><head><meta charset='utf-8'>");
            sb.Append("<title>FocusTime 트래커</title><style>");
            sb.Append("body{font-family:sans-serif;background:#0f1115;color:#e6e9ef;max-width:640px;margin:40px auto;padding:0 16px}");
            sb.Append("h1{font-size:22px}table{width:100%;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid #2a2f3a}");
            sb.Append(".m{color:#8b93a5}.bar{height:6px;background:#1e222b;border-radius:4px;overflow:hidden}.fill{height:100%;background:#5b8cff}");
            sb.Append("</style></head><body>");
            sb.Append("<h1>⏱ FocusTime 트래커</h1>");
            sb.Append("<p class='m'>상태: " + (tracking ? "추적 중" : "일시정지") + " · 현재: " + EscapeHtml(activeProc ?? "-") + "</p>");
            sb.Append("<p>오늘 총 앱 사용시간: <b>" + FmtShort(total) + "</b></p>");
            sb.Append("<table>");
            long max = list.Count > 0 ? list[0].Value : 1; if (max < 1) max = 1;
            foreach (var kv in list)
            {
                sb.Append("<tr><td>" + EscapeHtml(kv.Key) + "</td>");
                sb.Append("<td style='width:120px'><div class='bar'><div class='fill' style='width:" + (kv.Value * 100 / max) + "%'></div></div></td>");
                sb.Append("<td style='text-align:right;width:90px'>" + Fmt(kv.Value) + "</td></tr>");
            }
            sb.Append("</table><p class='m'>데이터 위치: " + EscapeHtml(dataFile) + "</p>");
            sb.Append("</body></html>");
            return sb.ToString();
        }

        private static void WriteText(Stream stream, int code, string status, string body, string contentType = "text/plain", bool corsOnly = false)
        {
            var bytes = Encoding.UTF8.GetBytes(body);
            var sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(code).Append(' ').Append(status).Append("\r\n");
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: GET, OPTIONS\r\n");
            sb.Append("Access-Control-Allow-Headers: *\r\n");
            if (corsOnly)
            {
                sb.Append("Content-Length: 0\r\n\r\n");
            }
            else
            {
                sb.Append("Content-Type: ").Append(contentType).Append("\r\n");
                sb.Append("Content-Length: ").Append(bytes.Length).Append("\r\n");
                sb.Append("Connection: close\r\n\r\n");
            }
            var hb = Encoding.UTF8.GetBytes(sb.ToString());
            stream.Write(hb, 0, hb.Length);
            if (!corsOnly) stream.Write(bytes, 0, bytes.Length);
        }

        private static void WriteBytes(Stream stream, int code, string status, byte[] body, string contentType)
        {
            var sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(code).Append(' ').Append(status).Append("\r\n");
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: GET, OPTIONS\r\n");
            sb.Append("Access-Control-Allow-Headers: *\r\n");
            sb.Append("Content-Type: ").Append(contentType).Append("\r\n");
            sb.Append("Content-Length: ").Append(body.Length).Append("\r\n");
            sb.Append("Cache-Control: no-store\r\n");
            sb.Append("Connection: close\r\n\r\n");
            var hb = Encoding.UTF8.GetBytes(sb.ToString());
            stream.Write(hb, 0, hb.Length);
            stream.Write(body, 0, body.Length);
        }

        private static Dictionary<string, string> ParseQuery(string q)
        {
            var d = new Dictionary<string, string>();
            if (q.StartsWith("?")) q = q.Substring(1);
            if (string.IsNullOrEmpty(q)) return d;
            foreach (var pair in q.Split('&'))
            {
                var eq = pair.Split(new[] { '=' }, 2);
                if (eq.Length == 2) d[Uri.UnescapeDataString(eq[0])] = Uri.UnescapeDataString(eq[1]);
                else if (eq.Length == 1 && eq[0] != "") d[Uri.UnescapeDataString(eq[0])] = "";
            }
            return d;
        }

        // ---------- 포맷/유틸 ----------
        private static string Fmt(long ms)
        {
            long s = ms / 1000;
            long h = s / 3600;
            long m = (s % 3600) / 60;
            long sec = s % 60;
            var parts = new List<string>();
            if (h > 0) parts.Add(h + "시간");
            if (m > 0) parts.Add(m + "분");
            parts.Add(sec + "초");
            return string.Join(" ", parts);
        }

        private static string FmtShort(long ms)
        {
            long totalMin = ms / 60000;
            long h = totalMin / 60;
            long m = totalMin % 60;
            if (h > 0 && m > 0) return h + "시간 " + m + "분";
            if (h > 0) return h + "시간";
            if (m > 0) return m + "분";
            return (ms / 1000) + "초";
        }

        private static string EscapeHtml(string s)
        {
            if (s == null) return "";
            return s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
        }

        private static Icon MakeIcon()
        {
            var bmp = new Bitmap(16, 16);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);
                using (var b = new SolidBrush(Color.FromArgb(91, 140, 255)))
                    g.FillEllipse(b, 0, 0, 16, 16);
                using (var pen = new Pen(Color.White, 1.6f))
                {
                    g.DrawLine(pen, 8, 8, 8, 4);
                    g.DrawLine(pen, 8, 8, 11, 9);
                }
            }
            IntPtr h = bmp.GetHicon();
            return Icon.FromHandle(h);
        }
    }
}

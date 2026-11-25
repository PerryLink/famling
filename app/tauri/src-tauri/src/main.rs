#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

mod secret;
mod voice;

// ---------------------------------------------------------------------------
// Native lifecycle: crash export, Windows single instance + recall, tray.
// ---------------------------------------------------------------------------

/// Maximum characters of a panic message stored in a crash report.
const CRASH_MESSAGE_LIMIT: usize = 4096;

/// Window title configured for the installed pet window (tauri.conf.json).
#[cfg(windows)]
const PET_WINDOW_TITLE: &str = "Famling · 汀岚";

/// Named kernel mutex that marks "one Famling instance is running".
#[cfg(windows)]
const SINGLE_INSTANCE_MUTEX: &str = "Local\\Famling.SingleInstance.v1";

/// Set while the crash hook runs; prevents a panic inside the hook from
/// re-entering it (the hook must never recurse).
static CRASH_HOOK_RUNNING: AtomicBool = AtomicBool::new(false);

/// Folder for local crash reports: %APPDATA%\\Famling\\crashes on Windows.
fn crash_report_dir() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        let base = std::env::var_os("APPDATA")?;
        Some(std::path::PathBuf::from(base).join("Famling").join("crashes"))
    }
    #[cfg(not(windows))]
    {
        Some(std::env::temp_dir().join("Famling").join("crashes"))
    }
}

/// Allocation-only bounded copy for crash reports; never panics.
fn bounded_text(value: &str, max_chars: usize) -> String {
    let mut out = String::new();
    let mut chars = value.chars();
    for _ in 0..max_chars {
        match chars.next() {
            Some(ch) => out.push(ch),
            None => return out,
        }
    }
    if chars.next().is_some() {
        out.push_str("…[truncated]");
    }
    out
}

/// Replace user-specific directory prefixes so a crash report never stores a
/// user path. Environment variables themselves are never recorded.
fn redact_user_paths(value: &str) -> String {
    let mut out = value.to_string();
    for key in ["USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOME"] {
        if let Some(path) = std::env::var_os(key) {
            let Some(path) = path.to_str() else { continue };
            if path.len() < 3 {
                continue;
            }
            out = out.replace(path, "<redacted>");
            let forward = path.replace('\\', "/");
            if forward != path {
                out = out.replace(forward.as_str(), "<redacted>");
            }
        }
    }
    out
}

/// Write exactly one JSON crash report (crash-<epoch>.json). Returns the
/// path when the file was written; every failure is swallowed.
fn write_crash_report(message: &str, thread: &str, location: &str) -> Option<std::path::PathBuf> {
    let dir = crash_report_dir()?;
    fs::create_dir_all(&dir).ok()?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    let report = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": timestamp,
        "thread": redact_user_paths(&bounded_text(thread, 128)),
        "message": redact_user_paths(&bounded_text(message, CRASH_MESSAGE_LIMIT)),
        "location": redact_user_paths(&bounded_text(location, 512)),
    });
    let path = dir.join(format!("crash-{timestamp}.json"));
    fs::write(&path, report.to_string()).ok()?;
    Some(path)
}

/// Install the crash-export panic hook. Must run before the Tauri builder so a
/// startup or host panic still leaves one local JSON report; the previous hook
/// keeps printing the usual stderr message. No env vars, CLI args or user
/// paths are collected.
fn install_crash_hook() {
    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if !CRASH_HOOK_RUNNING.swap(true, Ordering::SeqCst) {
            // The hook itself must never unwind into the panic machinery.
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let payload = info.payload();
                let message = if let Some(text) = payload.downcast_ref::<&str>() {
                    (*text).to_string()
                } else if let Some(text) = payload.downcast_ref::<String>() {
                    text.clone()
                } else {
                    "<non-string panic payload>".to_string()
                };
                let location = info
                    .location()
                    .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column()))
                    .unwrap_or_else(|| "<unknown>".to_string());
                let thread = std::thread::current()
                    .name()
                    .map(str::to_string)
                    .unwrap_or_else(|| "<unnamed>".to_string());
                if let Some(path) = write_crash_report(&message, &thread, &location) {
                    eprintln!("[famling] crash report: {}", path.display());
                }
            }));
            CRASH_HOOK_RUNNING.store(false, Ordering::SeqCst);
        }
        previous_hook(info);
    }));
}

/// Windows single instance: a named kernel mutex marks the running app. A
/// second launch recalls the existing pet window (show + foreground) and
/// exits 0. Fails open: a mutex problem never blocks startup.
#[cfg(windows)]
fn ensure_single_instance() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{GetLastError, SetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowW, SetForegroundWindow, ShowWindow, SW_SHOW,
    };

    let mutex_name: Vec<u16> = OsStr::new(SINGLE_INSTANCE_MUTEX)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe { SetLastError(0) };
    // The handle is deliberately never closed: keeping the mutex alive for the
    // whole process lifetime is what marks this process as the first instance.
    let mutex = unsafe { CreateMutexW(std::ptr::null(), 0, mutex_name.as_ptr()) };
    if mutex.is_null() {
        eprintln!("[famling] single-instance mutex unavailable; continuing without it");
        return;
    }
    if unsafe { GetLastError() } != ERROR_ALREADY_EXISTS {
        return;
    }

    // Another instance owns the mutex: bring its configured pet window back.
    let title: Vec<u16> = PET_WINDOW_TITLE
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let window = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };
    if !window.is_null() {
        unsafe {
            ShowWindow(window, SW_SHOW);
            SetForegroundWindow(window);
        }
    }
    eprintln!("[famling] already running; recalled existing window, exiting");
    std::process::exit(0);
}

#[cfg(not(windows))]
fn ensure_single_instance() {}

/// Build the tray icon and menu; the caller turns errors into a log line.
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    let show_item = MenuItem::with_id(app, "show", "显示/召回", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("Famling · 汀岚")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => recall_pet_window(app),
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Best-effort system tray: any failure is logged to stderr and startup
/// continues without a tray icon (no fatal error, no new permissions).
fn setup_tray(app: &tauri::AppHandle) {
    if let Err(error) = build_tray(app) {
        eprintln!("[famling] system tray unavailable: {error}");
    }
}

/// Show and focus the pet window (main label for installed builds, pet label
/// for the --game=pet route; otherwise the first live window).
fn recall_pet_window(app: &tauri::AppHandle) {
    let window = app
        .get_webview_window("main")
        .or_else(|| app.get_webview_window("pet"))
        .or_else(|| app.webview_windows().into_values().next());
    if let Some(window) = window {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Interactive rectangles (CSS px, viewport-relative) reported by the pet page.
struct HitRegions {
    regions: Mutex<Vec<[f64; 4]>>,
    ready: AtomicBool,
}

/// Replace the interactive rectangles used by the click-through poller.
#[tauri::command]
fn set_pet_hit_regions(regions: Vec<[f64; 4]>, state: tauri::State<'_, HitRegions>) {
    if let Ok(mut guard) = state.regions.lock() {
        *guard = regions;
    }
    state.ready.store(true, Ordering::Relaxed);
}

/// Poll the cursor and let clicks fall through the transparent pet window
/// everywhere except the reported interactive rectangles.
#[cfg(windows)]
fn start_pet_hit_test_loop(app: tauri::AppHandle) {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    std::thread::spawn(move || {
        let mut last: Option<bool> = None;
        loop {
            std::thread::sleep(Duration::from_millis(60));
            let Some(window) = app.get_webview_window("main") else { continue };
            let state = app.state::<HitRegions>();
            if !state.ready.load(Ordering::Relaxed) {
                continue;
            }
            let mut point = POINT { x: 0, y: 0 };
            if unsafe { GetCursorPos(&mut point) } == 0 {
                continue;
            }
            let Ok(inner) = window.inner_position() else { continue };
            let Ok(scale) = window.scale_factor() else { continue };
            if scale <= 0.0 {
                continue;
            }
            let x = (point.x as f64 - inner.x as f64) / scale;
            let y = (point.y as f64 - inner.y as f64) / scale;
            let inside = match state.regions.lock() {
                Ok(regions) => regions.iter().any(|r| x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3]),
                Err(_) => false,
            };
            if last != Some(inside) {
                let _ = window.set_ignore_cursor_events(!inside);
                last = Some(inside);
            }
        }
    });
}

#[cfg(not(windows))]
fn start_pet_hit_test_loop(_app: tauri::AppHandle) {}

fn safe_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && !value.contains("..")
}

/// Fetch a public DeepSeek web share conversation by share id.
///
/// The web share page calls this fixed public endpoint; fetching it in Rust
/// avoids browser CORS. The URL is hard-coded to chat.deepseek.com and the id
/// is strictly validated (no arbitrary URL/SSRF).
#[tauri::command]
async fn fetch_deepseek_share(share_id: String) -> Result<serde_json::Value, String> {
    let valid = !share_id.is_empty()
        && share_id.len() <= 128
        && share_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err("invalid DeepSeek share id".into());
    }
    let url = format!("https://chat.deepseek.com/api/v0/share/content?share_id={share_id}");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148 Safari/537.36")
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let response = client
        .get(&url)
        .header("Accept", "application/json")
        .header("Referer", "https://chat.deepseek.com/")
        .send()
        .await
        .map_err(|e| format!("DeepSeek share request failed: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("DeepSeek share endpoint returned HTTP {status}"));
    }
    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("DeepSeek share response is not JSON: {e}"))?;
    if payload.get("code").and_then(|v| v.as_i64()) != Some(0) {
        return Err(format!("DeepSeek share API error: code={:?} msg={:?}", payload.get("code"), payload.get("msg")));
    }
    Ok(payload)
}


/// Read the optional Advisers Pet Brief from the fixed local path.
///
/// Path precedence: `ADVISERS_HOME` (directory), else `%USERPROFILE%\.advisers`,
/// else `$HOME/.advisers`. Only `pet-brief.json` is read; max 128 KiB; no writes.
/// The frontend still validates schema/TTL/redaction before using it.
#[tauri::command]
fn read_advisers_brief() -> Result<Option<serde_json::Value>, String> {
    let base = if let Some(home) = std::env::var_os("ADVISERS_HOME") {
        std::path::PathBuf::from(home)
    } else if let Some(profile) = std::env::var_os("USERPROFILE") {
        std::path::PathBuf::from(profile).join(".advisers")
    } else if let Some(home) = std::env::var_os("HOME") {
        std::path::PathBuf::from(home).join(".advisers")
    } else {
        return Err("cannot resolve user home for Advisers brief".into());
    };
    let path = base.join("pet-brief.json");
    let metadata = match std::fs::metadata(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("read {}: {error}", path.display())),
    };
    if metadata.len() > 128 * 1024 {
        return Err("Advisers pet-brief.json is larger than 128 KiB".into());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("parse {}: {e}", path.display()))?;
    Ok(Some(value))
}

/// Persist a save slot under the app data dir. The write is tmp+rename;
/// Steam Auto-Cloud points at this directory.
#[tauri::command]
fn write_save(app: tauri::AppHandle, slot: String, text: String, backup: Option<bool>) -> Result<String, String> {
    if !safe_slug(&slot) {
        return Err("invalid save slot".into());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?
        .join("saves");
    fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let final_path = dir.join(format!("{slot}.json"));
    let tmp_path = dir.join(format!("{slot}.json.tmp"));
    let backup_path = dir.join(format!("{slot}.json.bak"));
    // Preserve the previous primary only when the frontend parsed it successfully.
    if backup.unwrap_or(true) && final_path.exists() {
        fs::copy(&final_path, &backup_path)
            .map_err(|e| format!("{}: {e}", backup_path.display()))?;
    }
    {
        use std::io::Write;
        let mut file = fs::File::create(&tmp_path).map_err(|e| format!("{}: {e}", tmp_path.display()))?;
        file.write_all(text.as_bytes())
            .map_err(|e| format!("{}: {e}", tmp_path.display()))?;
        file.sync_all()
            .map_err(|e| format!("{}: {e}", tmp_path.display()))?;
    }
    replace_file(&tmp_path, &final_path).map_err(|e| format!("{}: {e}", final_path.display()))?;
    Ok(final_path.display().to_string())
}

#[tauri::command]
#[cfg(windows)]
fn replace_file(from: &Path, to: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    let ok = unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::rename(from, to)
}

#[tauri::command]
fn delete_save(app: tauri::AppHandle, slot: String) -> Result<(), String> {
    use tauri::Manager;
    if !safe_slug(&slot) {
        return Err("invalid save slot".into());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?
        .join("saves");
    for name in [format!("{slot}.json"), format!("{slot}.json.bak"), format!("{slot}.json.tmp")] {
        let path = dir.join(name);
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn read_save(app: tauri::AppHandle, slot: String, backup: Option<bool>) -> Result<String, String> {
    if !safe_slug(&slot) {
        return Err("invalid save slot".into());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?
        .join("saves");
    let primary = dir.join(format!("{slot}.json"));
    let fallback = dir.join(format!("{slot}.json.bak"));
    let path = if backup == Some(true) {
        fallback
    } else if primary.exists() {
        primary
    } else {
        fallback
    };
    fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
}


#[tauri::command]
fn is_fullscreen() -> bool {
    if std::env::var("P0_FORCE_FULLSCREEN").ok().as_deref() == Some("1") {
        return true;
    }
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::{
            SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
        };
        let mut state = 0;
        let hr = unsafe { SHQueryUserNotificationState(&mut state) };
        return hr == 0
            && (state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE);
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
fn report_bench(fps: f64) -> Result<(), String> {
    let dir = std::env::current_dir().map_err(|e| e.to_string())?.join("artifacts");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(
        dir.join("tauri-bench.json"),
        serde_json::json!({ "fps": fps }).to_string(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn steam_status(app_id: u32) -> serde_json::Value {
    serde_json::json!({
        "appId": app_id,
        "steamRunning": false,
        "bound": false,
        "note": "scaffold: bind steamworks-rs here"
    })
}

fn game_route(id: &str) -> Option<(&'static str, &'static str, f64, f64)> {
    match id {
        "aquarium" => Some(("Aquarium", "aquarium.html", 480.0, 160.0)),
        "town" => Some(("Desk Town", "town.html", 960.0, 320.0)),
        "stall" => Some(("Late Night Stall", "stall.html", 960.0, 320.0)),
        "pet" => Some(("Pagefold", "pet.html", 480.0, 336.0)),
        "farm" => Some(("Desktop Games", "index.html", 1280.0, 160.0)),
        _ => None,
    }
}

fn parse_size_value(spec: &str) -> Option<(f64, f64)> {
    let mut parts = spec.split('x');
    let w = parts.next()?.parse::<f64>().ok()?;
    let h = parts.next()?.parse::<f64>().ok()?;
    if w <= 0.0 || h <= 0.0 { return None; }
    Some((w, h))
}

/// Support both `--flag=WxH` and `--flag WxH`.
fn parse_size_flag(args: &[String], flag: &str) -> Option<(f64, f64)> {
    let prefix = format!("{flag}=");
    if let Some(spec) = args.iter().find_map(|arg| arg.strip_prefix(&prefix)) {
        return parse_size_value(spec);
    }
    let position = args.iter().position(|arg| arg == flag)?;
    args.get(position + 1).and_then(|value| parse_size_value(value))
}

/// `--size=WxH` is used by the CDP QA scripts to override any routed page window.
fn parse_size_arg(args: &[String]) -> Option<(f64, f64)> {
    parse_size_flag(args, "--size")
}

/// `--pet-size=WxH` (or `--pet-size WxH`) is a QA override for the pet window;
/// the default (and the installed pet window) is 480x336 and `--size` still wins
/// for QA/CDP scripts.
fn parse_pet_size_arg(args: &[String]) -> Option<(f64, f64)> {
    parse_size_flag(args, "--pet-size")
}

fn place_bottom_right(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let area = monitor.size();
    let origin = monitor.position();
    let x = origin.x + area.width as i32 - size.width as i32 - 12;
    let y = origin.y + area.height as i32 - size.height as i32 - 12;
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
}

fn place_bottom(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let area = monitor.size();
    let origin = monitor.position();
    let x = origin.x + (area.width as i32 - size.width as i32) / 2;
    let y = origin.y + area.height as i32 - size.height as i32 - 8;
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
}

fn main() {
    // Local crash export and the Windows single-instance guard must be in
    // place before any Tauri setup runs.
    install_crash_hook();
    ensure_single_instance();
    tauri::Builder::default()
        .on_permission_request(|webview, kind| {
            // PTT is only used by the pet window; keep every other webview on default.
            if webview.label() == "pet" && matches!(kind, tauri::webview::PermissionKind::Microphone) {
                tauri::webview::PermissionResponse::Allow
            } else {
                tauri::webview::PermissionResponse::Default
            }
        })
        .setup(|app| {
            app.manage(HitRegions {
                regions: Mutex::new(Vec::new()),
                ready: AtomicBool::new(false),
            });
            start_pet_hit_test_loop(app.handle().clone());
            // Optional, fail-soft: tray icon + "显示/召回" / "退出" menu.
            setup_tray(app.handle());
            // Optional --size=WxH / --bench for W1 window experiments.
            let args: Vec<String> = std::env::args().collect();
            let hidden = args.iter().any(|arg| arg == "--hidden");
            if args.iter().any(|arg| arg == "--reset-saves") {
                if let Ok(dir) = app.path().app_data_dir() {
                    if let Ok(entries) = std::fs::read_dir(dir.join("saves")) {
                        for entry in entries.flatten() {
                            let _ = std::fs::remove_file(entry.path());
                        }
                    }
                }
            }
            let requested_game = args
                .iter()
                .find_map(|arg| arg.strip_prefix("--game="))
                .or_else(|| args.iter().find_map(|arg| arg.strip_prefix("--page=")));
            let demo = args.iter().any(|arg| arg == "--demo");
            let pet_size = parse_pet_size_arg(&args);
            if let Some(id) = requested_game {
                if let Some((title, entry, width, height)) = game_route(id) {
                    let mut builder = tauri::WebviewWindowBuilder::new(
                        app,
                        id,
                        tauri::WebviewUrl::App(entry.into()),
                    )
                    .title(title)
                    .inner_size(width, height)
                    .decorations(false)
                    .skip_taskbar(true)
                    .focused(false);
                    // Demo builds start the stall in a 3-night slice (frontend reads this flag).
                    if demo {
                        builder = builder.initialization_script("window.__STALL_DEMO__ = true;");
                    }
                    if id == "pet" {
                        // Product lock (docs/DESKTOP-PET-UX-2026-11-16.md,
                        // D-2026-11-16): borderless transparent always-on-top
                        // pet window that cannot be resized. The config default
                        // window in tauri.conf.json carries the same flags for
                        // the no-arg (installed) path; keep both in sync.
                        builder = builder
                            .transparent(true)
                            .shadow(false)
                            .resizable(false)
                            .maximizable(false)
                            .minimizable(false)
                            .always_on_top(true);
                        if let Some((pet_width, pet_height)) = pet_size {
                            builder = builder.inner_size(pet_width, pet_height);
                        }
                    }
                    let window = builder.build()?;
                    if let Some((w, h)) = parse_size_arg(&args) {
                        let _ = window.set_size(tauri::LogicalSize::new(w, h));
                    }
                    if id == "pet" {
                        place_bottom_right(&window);
                    } else {
                        place_bottom(&window);
                    }
                    if hidden {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                    }
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.close();
                    }
                }
            }

            if let Some(main) = app.get_webview_window("main") {
                // The default config window is the pet window now (pet.html,
                // 480x336): park it bottom-right like the `--game=pet` route.
                // Other routes close it above and place their own window.
                if requested_game.is_none() {
                    place_bottom_right(&main);
                }
            }
            if hidden {
                for window in app.webview_windows().values() {
                    let _ = window.hide();
                }
            }

            if args.iter().any(|arg| arg == "--bench") {
                let bench = tauri::WebviewWindowBuilder::new(
                    app,
                    "bench",
                    tauri::WebviewUrl::App("index.html".into()),
                )
                .title("Desktop Games Bench")
                .inner_size(480.0, 160.0)
                .initialization_script("window.__P0_BENCH__ = true;")
                .build()?;
                let _ = bench.show();
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.close();
                }
            }
            if let Some((w, h)) = parse_size_arg(&args) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_size(tauri::LogicalSize::new(w, h));
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secret::protect_text,
            secret::unprotect_text,
            secret::clear_save_backup,
            voice::voice_status,
            voice::voice_synthesize,
            voice::voice_cache_clear,
            voice::voice_asr,
            fetch_deepseek_share,
            read_advisers_brief,
            write_save,
            read_save,
            delete_save,
            is_fullscreen,
            report_bench,
            steam_status,
            set_pet_hit_regions
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Tauri host");
}

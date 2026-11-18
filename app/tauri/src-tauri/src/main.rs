#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

mod secret;
mod voice;

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

//! Native per-pixel-alpha pet window (Windows only).
//!
//! Architecture A: the pet is drawn by a raw Win32 layered window via
//! UpdateLayeredWindow, not by WebView2. The Tauri host stays responsible for
//! tray/single-instance/settings; this module owns one native window thread.

#![cfg(windows)]

use std::ffi::c_void;
use std::io::Cursor;
use std::ptr::{null, null_mut};

use tauri::{AppHandle, Manager};
use windows_sys::Win32::Foundation::{
    GetLastError, BOOL, HANDLE, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM,
};
use windows_sys::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, BLENDFUNCTION, HBITMAP, HDC, HGDIOBJ,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::HiDpi::GetDpiForWindow;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, GetWindowRect,
    GetWindowLongPtrW, LoadCursorW, PostQuitMessage, RegisterClassExW, ReleaseCapture,
    SendMessageW, SetTimer, SetWindowLongPtrW, ShowWindow, SystemParametersInfoW,
    TranslateMessage, UpdateLayeredWindow, GWLP_USERDATA, HTCAPTION,
    IDC_ARROW, MA_NOACTIVATE, MSG, SPI_GETWORKAREA, SW_SHOWNOACTIVATE, ULW_ALPHA, WM_DESTROY,
    WM_LBUTTONDOWN, WM_MOUSEACTIVATE, WM_NCLBUTTONDOWN, WM_RBUTTONUP, WM_TIMER, WNDCLASSEXW,
    WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

include!(concat!(env!("OUT_DIR"), "/pet_assets.rs"));

const CLASS_NAME: &str = "FamlingNativePetWindow";
const WINDOW_TITLE: &str = "Famling · 汀岚";
const TIMER_ID: usize = 1;
const ART: i32 = 96;
const FRAME_MS: u32 = 125;

struct Surface {
    hdc: HDC,
    hbitmap: HBITMAP,
    old: HGDIOBJ,
    bits: *mut u8,
    width: i32,
    height: i32,
}

impl Surface {
    unsafe fn new(width: i32, height: i32) -> Result<Self, String> {
        let screen = GetDC(null_mut());
        if screen.is_null() {
            return Err(format!("GetDC failed: {}", GetLastError()));
        }
        let hdc = CreateCompatibleDC(screen);
        ReleaseDC(null_mut(), screen);
        if hdc.is_null() {
            return Err(format!("CreateCompatibleDC failed: {}", GetLastError()));
        }
        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width;
        bmi.bmiHeader.biHeight = -height; // top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;
        let mut bits: *mut c_void = null_mut();
        let hbitmap = CreateDIBSection(hdc, &bmi, DIB_RGB_COLORS, &mut bits, null_mut() as HANDLE, 0);
        if hbitmap.is_null() || bits.is_null() {
            DeleteDC(hdc);
            return Err(format!("CreateDIBSection failed: {}", GetLastError()));
        }
        let old = SelectObject(hdc, hbitmap as HGDIOBJ);
        std::ptr::write_bytes(bits as *mut u8, 0, (width * height * 4) as usize);
        Ok(Self {
            hdc,
            hbitmap,
            old,
            bits: bits as *mut u8,
            width,
            height,
        })
    }
}

impl Drop for Surface {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.hdc, self.old);
            DeleteObject(self.hbitmap as HGDIOBJ);
            DeleteDC(self.hdc);
        }
    }
}

struct Pet {
    hwnd: HWND,
    app: AppHandle,
    frames: Vec<Vec<u8>>,
    frame: usize,
    surface: Surface,
    scale: i32,
}

impl Pet {
    unsafe fn present(&mut self) {
        let mut rect: RECT = std::mem::zeroed();
        GetWindowRect(self.hwnd, &mut rect);
        let dst = POINT { x: rect.left, y: rect.top };
        let size = SIZE { cx: self.surface.width, cy: self.surface.height };
        let src = POINT { x: 0, y: 0 };
        let blend = BLENDFUNCTION {
            BlendOp: 0,
            BlendFlags: 0,
            SourceConstantAlpha: 255,
            AlphaFormat: 1,
        };
        UpdateLayeredWindow(
            self.hwnd,
            null_mut(),
            &dst,
            &size,
            self.surface.hdc,
            &src,
            0,
            &blend,
            ULW_ALPHA,
        );
    }

    unsafe fn compose(&mut self) {
        let pixels = self.frames[self.frame].as_slice();
        let s = self.scale.max(1);
        let w = self.surface.width;
        std::ptr::write_bytes(
            self.surface.bits,
            0,
            (self.surface.width * self.surface.height * 4) as usize,
        );
        for y in 0..ART {
            for x in 0..ART {
                let i = ((y * ART + x) * 4) as usize;
                let a = pixels[i + 3];
                if a == 0 {
                    continue;
                }
                let b = pixels[i];
                let g = pixels[i + 1];
                let r = pixels[i + 2];
                for dy in 0..s {
                    let py = y * s + dy;
                    if py < 0 || py >= self.surface.height {
                        continue;
                    }
                    for dx in 0..s {
                        let px = x * s + dx;
                        if px < 0 || px >= w {
                            continue;
                        }
                        let o = ((py * w + px) * 4) as usize;
                        let dst = self.surface.bits.add(o);
                        *dst = b;
                        *dst.add(1) = g;
                        *dst.add(2) = r;
                        *dst.add(3) = a;
                    }
                }
            }
        }
    }

    unsafe fn advance(&mut self) {
        if self.frames.is_empty() {
            return;
        }
        self.frame = (self.frame + 1) % self.frames.len();
        self.compose();
        self.present();
    }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    let raw = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut Pet;
    match msg {
        WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,
        WM_LBUTTONDOWN => {
            // System modal drag; keeps animation timer independent.
            ReleaseCapture();
            SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION as WPARAM, 0);
            0
        }
        WM_RBUTTONUP => {
            if !raw.is_null() {
                let app = (*raw).app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                });
            }
            0
        }
        WM_TIMER => {
            if !raw.is_null() {
                (*raw).advance();
            }
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wp, lp),
    }
}

pub fn spawn(app: AppHandle, character: &str) -> Result<(), String> {
    let frames = load_idle_frames(character)?;
    std::thread::Builder::new()
        .name("native-pet".into())
        .spawn(move || {
            if let Err(error) = unsafe { run_window(app, frames) } {
                eprintln!("[famling] native pet window failed: {error}");
            }
        })
        .map(|_| ())
        .map_err(|error| format!("spawn native pet thread: {error}"))
}

unsafe fn run_window(app: AppHandle, frames: Vec<Vec<u8>>) -> Result<(), String> {
    let hinstance = GetModuleHandleW(null());
    let class = wide(CLASS_NAME);
    let title = wide(WINDOW_TITLE);
    let cursor = LoadCursorW(null_mut(), IDC_ARROW);
    let wndclass = WNDCLASSEXW {
        cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
        style: 0,
        lpfnWndProc: Some(wndproc),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: hinstance,
        hIcon: null_mut(),
        hCursor: cursor,
        hbrBackground: null_mut(),
        lpszMenuName: null(),
        lpszClassName: class.as_ptr(),
        hIconSm: null_mut(),
    };
    if RegisterClassExW(&wndclass) == 0 {
        return Err(format!("RegisterClassExW failed: {}", GetLastError()));
    }

    let ex_style = WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
    let mut work: RECT = std::mem::zeroed();
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut work as *mut RECT as *mut c_void, 0);

    let hwnd = CreateWindowExW(
        ex_style,
        class.as_ptr(),
        title.as_ptr(),
        WS_POPUP,
        0,
        0,
        192,
        192,
        null_mut(),
        null_mut(),
        hinstance,
        null_mut(),
    );
    if hwnd.is_null() {
        return Err(format!("CreateWindowExW failed: {}", GetLastError()));
    }

    let dpi = GetDpiForWindow(hwnd).max(96);
    let scale = ((dpi as f64 * 2.0 / 96.0).round() as i32).clamp(2, 6);
    let size = ART * scale;
    let x = work.right - size - 12;
    let y = work.bottom - size - 12;
    SetWindowPosNoResize(hwnd, x, y, size);
    let surface = Surface::new(size, size)?;

    let pet = Box::new(Pet {
        hwnd,
        app,
        frames,
        frame: 0,
        surface,
        scale,
    });
    let pet_ptr = Box::into_raw(pet);
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, pet_ptr as isize);
    ShowWindow(hwnd, SW_SHOWNOACTIVATE as i32);
    SetTimer(hwnd, TIMER_ID, FRAME_MS, None);
    (*pet_ptr).compose();
    (*pet_ptr).present();

    let mut message: MSG = std::mem::zeroed();
    while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    drop(Box::from_raw(pet_ptr));
    Ok(())
}

unsafe fn SetWindowPosNoResize(hwnd: HWND, x: i32, y: i32, size: i32) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
    };
    SetWindowPos(hwnd, null_mut(), x, y, size, size, SWP_NOACTIVATE | SWP_NOZORDER);
}

fn load_idle_frames(character: &str) -> Result<Vec<Vec<u8>>, String> {
    let candidates: [&str; 3] = [character, "dog", "human"];
    for candidate in candidates {
        let prefix = format!("{candidate}/idle/");
        let mut entries: Vec<(&str, &[u8])> = PET_PNGS
            .iter()
            .filter(|(path, _)| path.starts_with(&prefix))
            .copied()
            .collect();
        if entries.is_empty() {
            continue;
        }
        entries.sort_by(|a, b| a.0.cmp(b.0));
        let mut frames = Vec::with_capacity(entries.len());
        for (path, bytes) in entries {
            frames.push(decode_premultiplied(path, bytes)?);
        }
        return Ok(frames);
    }
    Err(format!("no idle frames for character {character:?}"))
}

fn decode_premultiplied(path: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder
        .read_info()
        .map_err(|error| format!("{path}: png header: {error}"))?;
    let mut buffer = vec![0; reader.output_buffer_size()];
    let info = reader
        .next_frame(&mut buffer)
        .map_err(|error| format!("{path}: png frame: {error}"))?;
    if info.width != ART as u32 || info.height != ART as u32 {
        return Err(format!(
            "{path}: expected {}x{}, got {}x{}",
            ART, ART, info.width, info.height
        ));
    }
    let data = &buffer[..info.buffer_size()];
    let mut out = vec![0u8; (ART * ART * 4) as usize];
    match info.color_type {
        png::ColorType::Rgba => {
            for i in 0..(ART * ART) as usize {
                let s = i * 4;
                let a = data[s + 3];
                out[s] = premultiply(data[s + 2], a);
                out[s + 1] = premultiply(data[s + 1], a);
                out[s + 2] = premultiply(data[s], a);
                out[s + 3] = a;
            }
        }
        png::ColorType::Rgb => {
            for i in 0..(ART * ART) as usize {
                let s = i * 3;
                let o = i * 4;
                out[o] = data[s + 2];
                out[o + 1] = data[s + 1];
                out[o + 2] = data[s];
                out[o + 3] = 255;
            }
        }
        other => return Err(format!("{path}: unsupported color type {other:?}")),
    }
    Ok(out)
}

fn premultiply(channel: u8, alpha: u8) -> u8 {
    if alpha == 0 {
        0
    } else {
        ((channel as u16 * alpha as u16 + 127) / 255) as u8
    }
}

// Keep destroy available for future close handling without warnings.
#[allow(dead_code)]
unsafe fn destroy(hwnd: HWND) {
    DestroyWindow(hwnd);
}

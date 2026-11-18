use base64::Engine;

#[cfg(windows)]
fn blob(bytes: &mut [u8]) -> windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
    windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_mut_ptr(),
    }
}

#[cfg(windows)]
fn free_blob(blob: &windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB) {
    if !blob.pbData.is_null() {
        unsafe {
            windows_sys::Win32::Foundation::LocalFree(blob.pbData as *mut core::ffi::c_void);
        }
    }
}

#[cfg(windows)]
#[tauri::command]
pub fn protect_text(text: String) -> Result<String, String> {
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN,
    };
    let mut input = text.into_bytes();
    let in_blob = blob(&mut input);
    let mut out = windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            &in_blob,
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out,
        )
    };
    if ok == 0 || out.pbData.is_null() {
        return Err("dpapi-protect-failed".to_string());
    }
    let bytes = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) };
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    free_blob(&out);
    Ok(encoded)
}

#[cfg(windows)]
#[tauri::command]
pub fn unprotect_text(encoded: String) -> Result<String, String> {
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN,
    };
    let mut input = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "bad-base64".to_string())?;
    let in_blob = blob(&mut input);
    let mut out = windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &in_blob,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out,
        )
    };
    if ok == 0 || out.pbData.is_null() {
        return Err("dpapi-unprotect-failed".to_string());
    }
    let bytes = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) };
    let result = String::from_utf8(bytes.to_vec()).map_err(|_| "not-utf8".to_string());
    free_blob(&out);
    result
}

#[cfg(not(windows))]
#[tauri::command]
pub fn protect_text(_text: String) -> Result<String, String> {
    Err("dpapi-unavailable".to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn unprotect_text(_encoded: String) -> Result<String, String> {
    Err("dpapi-unavailable".to_string())
}

#[tauri::command]
pub fn clear_save_backup(app: tauri::AppHandle, slot: String) -> Result<(), String> {
    use tauri::Manager;
    if !slot.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')) || slot.contains("..") {
        return Err("invalid save slot".to_string());
    }
    let dir = app.path().app_data_dir().map_err(|_| "no-data-dir".to_string())?.join("saves");
    let backup = dir.join(format!("{slot}.json.bak"));
    if backup.exists() {
        std::fs::remove_file(&backup).map_err(|_| "remove-backup-failed".to_string())?;
    }
    Ok(())
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn dpapi_roundtrip() {
        let plain = "折角-秘密-记忆";
        let encrypted = super::protect_text(plain.to_string()).expect("protect");
        assert_ne!(encrypted, plain);
        let decrypted = super::unprotect_text(encrypted).expect("unprotect");
        assert_eq!(decrypted, plain);
    }
}

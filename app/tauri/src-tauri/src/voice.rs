use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    pub has_key: bool,
    pub source: &'static str,
}

#[derive(Serialize, Deserialize)]
struct Quota {
    day: u64,
    billed: u32,
}

const DAILY_BILLED_LIMIT: u32 = 2000;

fn today() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() / 86400)
        .unwrap_or(0)
}

fn billing_chars(text: &str) -> u32 {
    text.chars()
        .map(|c| if ('\u{3400}'..='\u{9fff}').contains(&c) { 2 } else { 1 })
        .sum()
}

/// DeepSeek streaming WAV may use 0xFFFFFFFF for RIFF/data sizes. Patch the
/// canonical RIFF header so WebAudio decodeAudioData accepts cached cloud audio.
fn normalize_wav(mut bytes: Vec<u8>) -> Vec<u8> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return bytes;
    }
    let total = bytes.len() as u32;
    bytes[4..8].copy_from_slice(&(total - 8).to_le_bytes());
    let mut offset = 12usize;
    while offset + 8 <= bytes.len() {
        let size = u32::from_le_bytes([
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        ]) as usize;
        if &bytes[offset..offset + 4] == b"data" {
            let actual = (bytes.len() - offset - 8) as u32;
            bytes[offset + 4..offset + 8].copy_from_slice(&actual.to_le_bytes());
            break;
        }
        offset = match offset.checked_add(8).and_then(|v| v.checked_add(size)) {
            Some(v) => v,
            None => break,
        };
    }
    bytes
}

fn voice_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|_| "no-data-dir".to_string())?;
    let dir = base.join("voice");
    std::fs::create_dir_all(&dir).map_err(|_| "no-voice-dir".to_string())?;
    Ok(dir)
}

fn cache_path(app: &tauri::AppHandle, text: &str, voice: &str) -> Result<PathBuf, String> {
    let mut hasher = DefaultHasher::new();
    "v1".hash(&mut hasher);
    voice.hash(&mut hasher);
    text.hash(&mut hasher);
    let key = format!("{:016x}", hasher.finish());
    Ok(voice_dir(app)?.join("cache").join(format!("{key}.wav")))
}

fn read_quota(dir: &PathBuf) -> Quota {
    let path = dir.join("quota.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Quota { day: today(), billed: 0 };
    };
    let Ok(mut quota) = serde_json::from_str::<Quota>(&text) else {
        return Quota { day: today(), billed: 0 };
    };
    if quota.day != today() {
        quota.day = today();
        quota.billed = 0;
    }
    quota
}

fn write_quota(dir: &PathBuf, quota: &Quota) {
    let path = dir.join("quota.json");
    let tmp = dir.join("quota.json.tmp");
    if let Ok(text) = serde_json::to_string(quota) {
        if std::fs::write(&tmp, text).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

#[tauri::command]
pub fn voice_status() -> VoiceStatus {
    let has = std::env::var("DEEPSEEK_API_KEY")
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);
    VoiceStatus {
        has_key: has,
        source: if has { "env" } else { "none" },
    }
}

#[tauri::command]
pub async fn voice_synthesize(
    app: tauri::AppHandle,
    text: String,
    voice: Option<String>,
) -> Result<String, String> {
    let key = std::env::var("DEEPSEEK_API_KEY")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| "no-key".to_string())?;
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("empty-text".to_string());
    }
    if text.chars().count() > 500 {
        return Err("text-too-long".to_string());
    }
    let voice = match voice.as_deref() {
        Some("tide") => "tide",
        _ => "stella",
    };
    let dir = voice_dir(&app)?;
    let cache = cache_path(&app, &text, voice)?;
    if let Ok(bytes) = std::fs::read(&cache) {
        if !bytes.is_empty() {
            return Ok(base64::engine::general_purpose::STANDARD.encode(normalize_wav(bytes)));
        }
    }
    let cost = billing_chars(&text);
    let mut quota = read_quota(&dir);
    if quota.billed + cost > DAILY_BILLED_LIMIT {
        return Err("quota".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|_| "client-unavailable".to_string())?;
    let response = client
        .post("https://api.deepseek.com/v1/tools/tts")
        .bearer_auth(key)
        .json(&serde_json::json!({
            "text": text,
            "voice_id": voice,
            "format": "wav",
            "filter_markdown": true,
        }))
        .send()
        .await
        .map_err(|_| "network".to_string())?;
    if !response.status().is_success() {
        return Err(format!("http-{}", response.status().as_u16()));
    }
    let bytes = response.bytes().await.map_err(|_| "body".to_string())?;
    if bytes.is_empty() {
        return Err("empty-audio".to_string());
    }
    let bytes = normalize_wav(bytes.to_vec());
    if let Some(parent) = cache.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&cache, &bytes);
    quota.billed += cost;
    write_quota(&dir, &quota);
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn voice_cache_clear(app: tauri::AppHandle) -> Result<(), String> {
    let dir = voice_dir(&app)?;
    let _ = std::fs::remove_dir_all(dir.join("cache"));
    Ok(())
}


#[tauri::command]
pub async fn voice_asr(audio_base64: String) -> Result<String, String> {
    let key = std::env::var("DEEPSEEK_API_KEY")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| "no-key".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_base64)
        .map_err(|_| "bad-base64".to_string())?;
    if bytes.is_empty() {
        return Err("empty-audio".to_string());
    }
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("audio-too-large".to_string());
    }
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("speech.wav")
        .mime_str("audio/wav")
        .map_err(|_| "bad-audio".to_string())?;
    let form = reqwest::multipart::Form::new().part("file", part);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|_| "client-unavailable".to_string())?;
    let response = client
        .post("https://api.deepseek.com/v1/tools/asr")
        .bearer_auth(key)
        .multipart(form)
        .send()
        .await
        .map_err(|_| "network".to_string())?;
    if !response.status().is_success() {
        return Err(format!("http-{}", response.status().as_u16()));
    }
    let json = response.json::<serde_json::Value>().await.map_err(|_| "body".to_string())?;
    json.get("text")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
        .ok_or_else(|| "no-text".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn riff_wav() -> Vec<u8> {
        let mut bytes = vec![0u8; 48];
        bytes[0..4].copy_from_slice(b"RIFF");
        bytes[4..8].copy_from_slice(&0xffff_ffffu32.to_le_bytes());
        bytes[8..12].copy_from_slice(b"WAVE");
        bytes[12..16].copy_from_slice(b"fmt ");
        bytes[16..20].copy_from_slice(&16u32.to_le_bytes());
        bytes[20..22].copy_from_slice(&1u16.to_le_bytes());
        bytes[22..24].copy_from_slice(&1u16.to_le_bytes());
        bytes[24..28].copy_from_slice(&24000u32.to_le_bytes());
        bytes[28..32].copy_from_slice(&48000u32.to_le_bytes());
        bytes[36..40].copy_from_slice(b"data");
        bytes[40..44].copy_from_slice(&0xffff_ffffu32.to_le_bytes());
        bytes
    }

    #[test]
    fn normalize_wav_patches_streaming_sizes() {
        let out = normalize_wav(riff_wav());
        assert_eq!(u32::from_le_bytes(out[4..8].try_into().unwrap()), 40);
        assert_eq!(u32::from_le_bytes(out[40..44].try_into().unwrap()), 4);
    }

    #[test]
    fn billing_counts_cjk_as_two() {
        assert_eq!(billing_chars("你来了。"), 7);
        assert_eq!(billing_chars("ok"), 2);
    }
}

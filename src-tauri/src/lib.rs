use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub family: String,
    pub app_version: String,
}

#[tauri::command]
fn set_window_title(window: tauri::Window, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
fn save_vector_file(file_path: String, content: Vec<u8>) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(file_path)
}

#[tauri::command]
fn read_vector_file(file_path: String) -> Result<Vec<u8>, String> {
    fs::read(&file_path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.set_title("Geovanta — Vector Editor (Windows 64-Bit)");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_window_title,
            get_system_info,
            save_vector_file,
            read_vector_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Geovanta Tauri Windows 64-bit application");
}

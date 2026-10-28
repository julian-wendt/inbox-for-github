use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

/// The log file is replaced by a fresh one past this size; the older ones shift down.
const LOG_MAX_BYTES: u64 = 2 * 1024 * 1024;
/// Files kept: `inbox.log` plus `inbox.1.log` … `inbox.4.log`.
const LOG_FILES: u32 = 5;
/// Serializes writes, so a rotation never runs under another write.
static LOG_LOCK: Mutex<()> = Mutex::new(());

/// Apps started from Finder do not inherit the shell PATH, so `gh` is looked up in the usual install locations.
const GH_CANDIDATES: [&str; 3] = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "gh"];

/// Returns the token of the active `gh` CLI login. The token is never persisted.
#[tauri::command]
fn gh_token() -> Result<String, String> {
    for gh in GH_CANDIDATES {
        if let Ok(output) = Command::new(gh).args(["auth", "token"]).output() {
            if output.status.success() {
                return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
            }
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
    }
    Err("GitHub CLI `gh` not found. Install it and run `gh auth login`.".into())
}

/// Orca's command-line entry in its app bundle, see `docs/reference/orca.md`.
const ORCA_CLI: &str = "/Applications/Orca.app/Contents/Resources/bin/orca";
const ORCA_BUNDLE_ID: &str = "com.stablyai.orca";
/// The only Orca commands the web view may run (`worktree set` for the display name); removing
/// worktrees or typing into terminals stays in Orca.
const ORCA_COMMANDS: [[&str; 2]; 7] = [
    ["repo", "list"],
    ["worktree", "list"],
    ["worktree", "create"],
    ["worktree", "set"],
    ["terminal", "list"],
    ["terminal", "switch"],
    ["terminal", "create"],
];

/// Runs one allowed command of Orca's CLI with `--json` and returns its output, or its error text.
/// Off the main thread, since every call starts Orca's runtime in Node mode.
#[tauri::command(async)]
fn orca(args: Vec<String>) -> Result<String, String> {
    if !ORCA_COMMANDS.iter().any(|c| args.len() >= 2 && args[0] == c[0] && args[1] == c[1]) {
        return Err(format!("Orca command not allowed: {}", args.join(" ")));
    }
    let output = Command::new(ORCA_CLI).args(&args).arg("--json").output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() {
        return Ok(stdout);
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() { stdout } else { stderr })
}

/// Brings Orca's window to the front after a worktree or terminal was chosen there.
#[tauri::command]
fn orca_activate() -> Result<(), String> {
    Command::new("open").args(["-b", ORCA_BUNDLE_ID]).spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn rotated(dir: &Path, index: u32) -> std::path::PathBuf {
    dir.join(if index == 0 { "inbox.log".to_string() } else { format!("inbox.{index}.log") })
}

/// Appends one line to `~/Library/Logs/<bundle id>/inbox.log` and rotates it by size.
#[tauri::command]
fn log_write(app: tauri::AppHandle, line: String) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let _guard = LOG_LOCK.lock().map_err(|e| e.to_string())?;
    let current = rotated(&dir, 0);
    if fs::metadata(&current).map(|m| m.len()).unwrap_or(0) >= LOG_MAX_BYTES {
        let _ = fs::remove_file(rotated(&dir, LOG_FILES - 1));
        for index in (0..LOG_FILES - 1).rev() {
            let _ = fs::rename(rotated(&dir, index), rotated(&dir, index + 1));
        }
    }
    let mut file = OpenOptions::new().create(true).append(true).open(current).map_err(|e| e.to_string())?;
    writeln!(file, "{line}").map_err(|e| e.to_string())
}

/// Opens the log folder in the Finder, creating it first so there is always something to show.
#[tauri::command]
fn log_reveal(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Command::new("open").arg(&dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Brings the hidden main window back, for a click on the Dock icon or on a notification.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![gh_token, log_write, log_reveal, orca, orca_activate])
        .setup(|app| {
            // The web view picks the item; the window must come forward first, also when hidden.
            let handle = app.handle().clone();
            app.notification().on_action(move |_| show_main_window(&handle))?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // On macOS closing only hides the window, so snooze reminders keep arriving; ⌘Q quits.
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { has_visible_windows: false, .. } = _event {
                show_main_window(_app);
            }
        });
}

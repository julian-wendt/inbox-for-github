mod calendar;

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
/// The only Orca commands the web view may run (`worktree set` for the display name, `repo add`
/// for a checkout `repo_checkouts` found, `project setup-clone` to clone a repo Orca lacks, see
/// `clones_from_github`); removing worktrees or repos and typing into terminals stays in Orca.
const ORCA_COMMANDS: [[&str; 2]; 9] = [
    ["repo", "list"],
    ["repo", "add"],
    ["project", "setup-clone"],
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
    let allowed = ORCA_COMMANDS.iter().any(|c| args.len() >= 2 && args[0] == c[0] && args[1] == c[1]);
    if !allowed || (args[0] == "project" && !clones_from_github(&args)) {
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

/// A clone only from github.com onto this Mac: `--host local` and an `https://github.com/` URL.
fn clones_from_github(args: &[String]) -> bool {
    let value = |flag: &str| args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1));
    value("--host").is_some_and(|h| h == "local") && value("--url").is_some_and(|u| u.starts_with("https://github.com/"))
}

/// A git checkout directly inside the repo folder, with the URL of its `origin` remote.
#[derive(serde::Serialize)]
struct Checkout {
    path: String,
    origin: String,
}

/// The repo folder with "~" expanded, and the git checkouts directly inside it that have an
/// `origin` remote, read from each `.git/config`. Reads nothing else and goes one level deep.
#[tauri::command(async)]
fn repo_checkouts(folder: String) -> Result<(String, Vec<Checkout>), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let folder = match folder.strip_prefix('~') {
        Some(rest) if rest.is_empty() || rest.starts_with('/') => format!("{home}{rest}"),
        _ => folder,
    };
    let mut checkouts = Vec::new();
    for entry in fs::read_dir(&folder).map_err(|e| format!("{folder}: {e}"))?.flatten() {
        let path = entry.path();
        if let Some(origin) = fs::read_to_string(path.join(".git/config")).ok().as_deref().and_then(origin_url) {
            checkouts.push(Checkout { path: path.to_string_lossy().into_owned(), origin });
        }
    }
    Ok((folder, checkouts))
}

/// The `url` of the `[remote "origin"]` section of a git config file.
fn origin_url(config: &str) -> Option<String> {
    let mut in_origin = false;
    for line in config.lines().map(str::trim) {
        if line.starts_with('[') {
            in_origin = line == r#"[remote "origin"]"#;
        } else if let Some(url) = line.strip_prefix("url").map(str::trim_start).and_then(|l| l.strip_prefix('=')) {
            if in_origin {
                return Some(url.trim().to_string());
            }
        }
    }
    None
}

/// The Mac's locale with its region (`defaults read -g AppleLocale`, e.g. "en_US@rg=dezzzz"); the
/// web view knows only the language, so dates would ignore System Settings › Language & Region.
#[tauri::command]
fn system_locale() -> Result<String, String> {
    let output = Command::new("defaults").args(["read", "-g", "AppleLocale"]).output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Brings Orca's window to the front after a worktree or terminal was chosen there.
#[tauri::command]
fn orca_activate() -> Result<(), String> {
    Command::new("open").args(["-b", ORCA_BUNDLE_ID]).spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn log_name(index: u32) -> String {
    if index == 0 { "inbox.log".to_string() } else { format!("inbox.{index}.log") }
}

fn rotated(dir: &Path, index: u32) -> std::path::PathBuf {
    dir.join(log_name(index))
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

/// The bundle identifier of earlier builds, whose folders are copied over on the first start.
const OLD_IDENTIFIER: &str = "io.github.julian-wendt.github-task-tracker";
/// What the old config folder holds; `tracker.db` comes last, as its presence marks a finished copy.
const MIGRATED_DATA: [&str; 4] = [".window-state.json", "tracker.db-wal", "tracker.db-shm", "tracker.db"];

/// Copies the data and logs of builds under the old bundle identifier into the app's folders.
///
/// Covers the config folder (`~/Library/Application Support/<bundle id>/`: the database, its WAL
/// files and `.window-state.json`) and the log folder (`~/Library/Logs/<bundle id>/`:
/// `inbox.log` and its rotations), each with `copy_from_old_folder`, so it does nothing after
/// the first start and on a fresh install. The old folders stay untouched, so an older build
/// still finds its data. The web view's localStorage (collapsed bars, sort orders) is not
/// carried over.
///
/// It must run before the window-state plugin's setup, which reads `.window-state.json`, and
/// before the SQL plugin opens the database; see `docs/reference/architecture.md#local-data`.
///
/// Returns an error when a data file cannot be copied; the app then refuses to start rather than
/// open an empty database in place of the user's data. A failed copy of the logs is ignored.
///
/// # Example
///
/// ```ignore
/// tauri::Builder::default()
///     .plugin(tauri::plugin::Builder::<tauri::Wry>::new("data-migration").setup(|app, _| migrate_data_dir(app)).build())
/// ```
fn migrate_data_dir(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    copy_from_old_folder(&app.path().app_config_dir()?, &MIGRATED_DATA.map(String::from))?;
    let logs: Vec<String> = (0..LOG_FILES).rev().map(log_name).collect();
    let _ = copy_from_old_folder(&app.path().app_log_dir()?, &logs);
    Ok(())
}

/// Copies the files `names` from the old identifier's folder next to `dir` into `dir`.
///
/// The last name is the marker: nothing happens when `dir` already has it or the old folder
/// lacks it. Each file is copied to `<name>.migrating` and then renamed, and the marker comes
/// last, so an interrupted copy never leaves the marker behind and the next start tries again.
/// Names the old folder lacks are skipped.
///
/// # Example
///
/// ```ignore
/// copy_from_old_folder(Path::new("/Users/me/Library/Logs/inbox-for-github"), &["inbox.1.log".into(), "inbox.log".into()])?;
/// ```
fn copy_from_old_folder(dir: &Path, names: &[String]) -> std::io::Result<()> {
    let (Some(old_dir), Some(marker)) = (dir.parent().map(|parent| parent.join(OLD_IDENTIFIER)), names.last()) else {
        return Ok(());
    };
    if dir.join(marker).exists() || !old_dir.join(marker).exists() {
        return Ok(());
    }
    fs::create_dir_all(dir)?;
    for name in names {
        let from = old_dir.join(name);
        if from.exists() {
            let staged = dir.join(format!("{name}.migrating"));
            fs::copy(&from, &staged)?;
            fs::rename(&staged, dir.join(name))?;
        }
    }
    Ok(())
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
        // Plugins set up in registration order, so the data is in place before the others read it.
        .plugin(tauri::plugin::Builder::<tauri::Wry>::new("data-migration").setup(|app, _| migrate_data_dir(app)).build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            calendar::calendar_access,
            calendar::calendar_events,
            calendar::calendar_find,
            calendar::calendar_list,
            calendar::calendar_put,
            calendar::calendar_remove,
            gh_token, log_write, log_reveal, orca, orca_activate, repo_checkouts, system_locale
        ])
        .setup(|app| {
            // The web view picks the item; the window must come forward first, also when hidden.
            let handle = app.handle().clone();
            app.notification().on_action(move |_| show_main_window(&handle))?;
            calendar::watch(app.handle().clone());
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

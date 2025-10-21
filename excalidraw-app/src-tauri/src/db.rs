use once_cell::sync::Lazy;
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct Drawing {
    pub id: String,
    pub name: String,
    pub data: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub room_id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub thumbnail: Option<String>,
    pub created_by: Option<String>,
    pub created_at: i64,
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoomSettings {
    pub room_id: String,
    pub max_snapshots: i32,
    pub auto_save_interval: i32,
}

pub static DB: Lazy<Mutex<Connection>> = Lazy::new(|| {
    let conn = Connection::open(get_db_path()).expect("Failed to open database");
    init_db(&conn).expect("Failed to initialize database");
    Mutex::new(conn)
});

fn get_db_path() -> PathBuf {
    // Use a simple path in the user's home directory
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());

    let app_dir = PathBuf::from(home).join(".excalidraw");
    std::fs::create_dir_all(&app_dir).ok();

    app_dir.join("drawings.db")
}

fn init_db(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS drawings (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS snapshots (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            name TEXT,
            description TEXT,
            thumbnail TEXT,
            created_by TEXT,
            created_at INTEGER NOT NULL,
            data TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS room_settings (
            room_id TEXT PRIMARY KEY,
            max_snapshots INTEGER DEFAULT 10,
            auto_save_interval INTEGER DEFAULT 60
        )",
        [],
    )?;

    Ok(())
}

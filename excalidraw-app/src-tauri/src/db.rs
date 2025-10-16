use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct Drawing {
    pub id: String,
    pub name: String,
    pub data: String,
    pub created_at: i64,
    pub updated_at: i64,
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
    Ok(())
}

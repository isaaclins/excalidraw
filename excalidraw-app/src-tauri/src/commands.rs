use crate::db::{Drawing, RoomSettings, Snapshot, DB};
use std::time::{SystemTime, UNIX_EPOCH};

const AUTOSAVE_CREATED_BY: &str = "__autosave__";
const AUTOSAVE_DEFAULT_NAME: &str = "Latest autosave snapshot";
const AUTOSAVE_DEFAULT_DESCRIPTION: &str = "Automatically saved by Excalidraw";

#[tauri::command]
pub fn save_drawing(name: String, data: String) -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let id = uuid::Uuid::new_v4().to_string();

    let conn = DB.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO drawings (id, name, data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![&id, &name, &data, timestamp, timestamp],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn update_drawing(id: String, name: String, data: String) -> Result<(), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let conn = DB.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE drawings SET name = ?1, data = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![&name, &data, timestamp, &id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn load_drawing(id: String) -> Result<Drawing, String> {
    let conn = DB.lock().map_err(|e| e.to_string())?;

    let drawing = conn
        .query_row(
            "SELECT id, name, data, created_at, updated_at FROM drawings WHERE id = ?1",
            rusqlite::params![&id],
            |row| {
                Ok(Drawing {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    data: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(drawing)
}

#[tauri::command]
pub fn list_drawings() -> Result<Vec<Drawing>, String> {
    let conn = DB.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, data, created_at, updated_at FROM drawings ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let drawings = stmt
        .query_map([], |row| {
            Ok(Drawing {
                id: row.get(0)?,
                name: row.get(1)?,
                data: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(drawings)
}

#[tauri::command]
pub fn delete_drawing(id: String) -> Result<(), String> {
    let conn = DB.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM drawings WHERE id = ?1", rusqlite::params![&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// Snapshot-related commands

#[tauri::command]
pub fn save_snapshot(
    room_id: String,
    name: Option<String>,
    description: Option<String>,
    thumbnail: Option<String>,
    created_by: Option<String>,
    data: String,
) -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let id = uuid::Uuid::new_v4().to_string();

    let conn = DB.lock().map_err(|e| e.to_string())?;

    // Get room settings to check max snapshots
    let settings = get_room_settings_internal(&conn, &room_id)?;

    // Count existing snapshots
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM snapshots WHERE room_id = ?1",
            rusqlite::params![&room_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // If at limit, delete oldest snapshot
    if count >= settings.max_snapshots {
        conn.execute(
            "DELETE FROM snapshots WHERE id = (SELECT id FROM snapshots WHERE room_id = ?1 ORDER BY created_at ASC LIMIT 1)",
            rusqlite::params![&room_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Insert new snapshot
    conn.execute(
        "INSERT INTO snapshots (id, room_id, name, description, thumbnail, created_by, created_at, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![&id, &room_id, &name, &description, &thumbnail, &created_by, timestamp, &data],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn list_snapshots(room_id: String) -> Result<Vec<Snapshot>, String> {
    let conn = DB.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, room_id, name, description, thumbnail, created_by, created_at, '' as data FROM snapshots WHERE room_id = ?1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let snapshots = stmt
        .query_map(rusqlite::params![&room_id], |row| {
            Ok(Snapshot {
                id: row.get(0)?,
                room_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                thumbnail: row.get(4)?,
                created_by: row.get(5)?,
                created_at: row.get(6)?,
                data: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(snapshots)
}

#[tauri::command]
pub fn load_snapshot(id: String) -> Result<Snapshot, String> {
    let conn = DB.lock().map_err(|e| e.to_string())?;

    let snapshot = conn
        .query_row(
            "SELECT id, room_id, name, description, thumbnail, created_by, created_at, data FROM snapshots WHERE id = ?1",
            rusqlite::params![&id],
            |row| {
                Ok(Snapshot {
                    id: row.get(0)?,
                    room_id: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    thumbnail: row.get(4)?,
                    created_by: row.get(5)?,
                    created_at: row.get(6)?,
                    data: row.get(7)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(snapshot)
}

#[tauri::command]
pub fn delete_snapshot(id: String) -> Result<(), String> {
    let conn = DB.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM snapshots WHERE id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_snapshot_metadata(
    id: String,
    name: String,
    description: String,
) -> Result<(), String> {
    let conn = DB.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE snapshots SET name = ?1, description = ?2 WHERE id = ?3",
        rusqlite::params![&name, &description, &id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn save_autosave_snapshot(
    room_id: String,
    name: Option<String>,
    description: Option<String>,
    thumbnail: Option<String>,
    data: String,
) -> Result<String, String> {
    let conn = DB.lock().map_err(|e| e.to_string())?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let final_name = name.unwrap_or_else(|| AUTOSAVE_DEFAULT_NAME.to_string());
    let final_description = description.unwrap_or_else(|| AUTOSAVE_DEFAULT_DESCRIPTION.to_string());
    let final_thumbnail = thumbnail.unwrap_or_default();

    let existing_id_result: Result<String, rusqlite::Error> = conn.query_row(
        "SELECT id FROM snapshots WHERE room_id = ?1 AND created_by = ?2 LIMIT 1",
        rusqlite::params![&room_id, AUTOSAVE_CREATED_BY],
        |row| row.get(0),
    );

    match existing_id_result {
        Ok(existing_id) => {
            conn.execute(
                "UPDATE snapshots SET name = ?1, description = ?2, thumbnail = ?3, data = ?4, created_at = ?5 WHERE id = ?6",
                rusqlite::params![
                    &final_name,
                    &final_description,
                    &final_thumbnail,
                    &data,
                    timestamp,
                    &existing_id,
                ],
            )
            .map_err(|e| e.to_string())?;

            Ok(existing_id)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO snapshots (id, room_id, name, description, thumbnail, created_by, created_at, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    &id,
                    &room_id,
                    &final_name,
                    &final_description,
                    &final_thumbnail,
                    AUTOSAVE_CREATED_BY,
                    timestamp,
                    &data,
                ],
            )
            .map_err(|e| e.to_string())?;

            Ok(id)
        }
        Err(err) => Err(err.to_string()),
    }
}

// Room settings commands

fn get_room_settings_internal(
    conn: &rusqlite::Connection,
    room_id: &str,
) -> Result<RoomSettings, String> {
    conn.query_row(
        "SELECT room_id, max_snapshots, auto_save_interval FROM room_settings WHERE room_id = ?1",
        rusqlite::params![room_id],
        |row| {
            Ok(RoomSettings {
                room_id: row.get(0)?,
                max_snapshots: row.get(1)?,
                auto_save_interval: row.get(2)?,
            })
        },
    )
    .or_else(|_| {
        // Return default settings if not found
        Ok(RoomSettings {
            room_id: room_id.to_string(),
            max_snapshots: 10,
            auto_save_interval: 60,
        })
    })
}

#[tauri::command]
pub fn get_room_settings(room_id: String) -> Result<RoomSettings, String> {
    let conn = DB.lock().map_err(|e| e.to_string())?;
    get_room_settings_internal(&conn, &room_id)
}

#[tauri::command]
pub fn update_room_settings(
    room_id: String,
    max_snapshots: i32,
    auto_save_interval: i32,
) -> Result<(), String> {
    let conn = DB.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO room_settings (room_id, max_snapshots, auto_save_interval) VALUES (?1, ?2, ?3) 
         ON CONFLICT(room_id) DO UPDATE SET max_snapshots = ?2, auto_save_interval = ?3",
        rusqlite::params![&room_id, max_snapshots, auto_save_interval],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

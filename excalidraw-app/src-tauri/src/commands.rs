use crate::db::{Drawing, DB};
use std::time::{SystemTime, UNIX_EPOCH};

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
        .prepare("SELECT id, name, data, created_at, updated_at FROM drawings ORDER BY updated_at DESC")
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

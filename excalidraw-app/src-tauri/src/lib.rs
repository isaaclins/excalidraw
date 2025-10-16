mod commands;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize the database (lazy static will create it on first access)
    let _ = &*db::DB;
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::save_drawing,
            commands::update_drawing,
            commands::load_drawing,
            commands::list_drawings,
            commands::delete_drawing,
            commands::save_snapshot,
            commands::list_snapshots,
            commands::load_snapshot,
            commands::delete_snapshot,
            commands::update_snapshot_metadata,
            commands::get_room_settings,
            commands::update_room_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

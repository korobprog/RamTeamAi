use crate::core::orchestrator::ChatMessage;
use rusqlite::{params, Connection};
use std::{path::PathBuf, sync::Mutex};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("storage lock poisoned")]
    Lock,
}

pub struct Storage {
    connection: Mutex<Connection>,
}

impl Storage {
    pub fn open(path: PathBuf) -> Result<Self, StorageError> {
        Ok(Self { connection: Mutex::new(Connection::open(path)?) })
    }

    pub fn migrate(&self) -> Result<(), StorageError> {
        let connection = self.connection.lock().map_err(|_| StorageError::Lock)?;
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                author TEXT NOT NULL,
                role TEXT,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            );",
        )?;
        Ok(())
    }

    pub fn append_message(&self, session_id: &str, message: &ChatMessage) -> Result<(), StorageError> {
        let connection = self.connection.lock().map_err(|_| StorageError::Lock)?;
        connection.execute(
            "INSERT OR REPLACE INTO messages (id, session_id, author, role, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![message.id, session_id, message.author, message.agent_role, serde_json::to_string(message)?, message.created_at],
        )?;
        Ok(())
    }

    pub fn load_messages(&self, session_id: &str) -> Result<Vec<ChatMessage>, StorageError> {
        let connection = self.connection.lock().map_err(|_| StorageError::Lock)?;
        let mut statement = connection.prepare("SELECT payload FROM messages WHERE session_id = ?1 ORDER BY created_at ASC")?;
        let rows = statement.query_map(params![session_id], |row| row.get::<_, String>(0))?;
        let mut messages = Vec::new();
        for row in rows {
            messages.push(serde_json::from_str(&row?)?);
        }
        Ok(messages)
    }
}

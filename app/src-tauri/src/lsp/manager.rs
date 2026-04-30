use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

pub struct LspHandle {
    pub stdin_tx: mpsc::UnboundedSender<String>,
}

pub struct LspManagerState(pub Arc<Mutex<HashMap<String, LspHandle>>>);

use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const EVENT_NAME: &str = "operation-progress";

#[derive(Debug, Clone, Serialize)]
pub struct OperationProgress {
    pub operation_id: String,
    pub label: String,
    pub percent: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancellable: Option<bool>,
}

pub struct ProgressReporter {
    app: AppHandle,
    operation_id: String,
}

impl ProgressReporter {
    pub fn new(app: AppHandle, operation_id: impl Into<String>) -> Self {
        Self {
            app,
            operation_id: operation_id.into(),
        }
    }

    pub fn emit(&self, label: impl Into<String>, done: u32, total: u32) {
        let percent = if total == 0 {
            0.0
        } else {
            ((done as f64 / total as f64) * 100.0).min(100.0)
        };
        self.emit_percent(label, percent, None);
    }

    pub fn emit_percent(&self, label: impl Into<String>, percent: f64, phase: Option<&str>) {
        let _ = self.app.emit(
            EVENT_NAME,
            OperationProgress {
                operation_id: self.operation_id.clone(),
                label: label.into(),
                percent,
                phase: phase.map(str::to_string),
                cancellable: None,
            },
        );
    }

    pub fn emit_indeterminate(&self, label: impl Into<String>, phase: Option<&str>) {
        self.emit_percent(label, -1.0, phase);
    }

    pub fn finish(&self, label: impl Into<String>) {
        self.emit_percent(label, 100.0, Some("done"));
    }

    pub fn clear(&self) {
        let _ = self.app.emit(
            EVENT_NAME,
            OperationProgress {
                operation_id: self.operation_id.clone(),
                label: String::new(),
                percent: 100.0,
                phase: Some("clear".to_string()),
                cancellable: None,
            },
        );
    }
}

pub fn emit_progress(app: &AppHandle, operation_id: &str, label: &str, percent: f64) {
    ProgressReporter::new(app.clone(), operation_id).emit_percent(label, percent, None);
}
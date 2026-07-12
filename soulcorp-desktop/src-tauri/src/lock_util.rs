//! Mutex helpers that recover from poison instead of failing every later command.
//!
//! When any thread panics while holding `AppState` (or another std Mutex), Rust marks
//! the lock as poisoned. Mapping that error to a string surfaces as
//! "poisoned lock: another task failed inside" and bricks the UI until restart.
//! Recovering the guard lets the app keep serving reads/writes after a panic.

use std::sync::{Mutex, MutexGuard};

pub trait MutexExt<T> {
    fn lock_or_recover(&self) -> Result<MutexGuard<'_, T>, String>;
}

impl<T> MutexExt<T> for Mutex<T> {
    fn lock_or_recover(&self) -> Result<MutexGuard<'_, T>, String> {
        match self.lock() {
            Ok(guard) => Ok(guard),
            Err(poisoned) => {
                crate::app_log::log_global(
                    crate::app_log::LogLevel::Error,
                    crate::app_log::LogCategory::System,
                    "mutex_poison",
                    "Recovered poisoned mutex — a prior task panicked while holding it",
                    Some("lock_or_recover"),
                );
                Ok(poisoned.into_inner())
            }
        }
    }
}

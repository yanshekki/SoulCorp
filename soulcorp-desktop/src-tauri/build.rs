fn main() {
    let edition = std::env::var("PRODUCT_EDITION").unwrap_or_else(|_| "v1".to_string());
    let edition = if edition == "v2" { "v2" } else { "v1" };
    println!("cargo:rustc-env=PRODUCT_EDITION={edition}");
    println!("cargo:rerun-if-env-changed=PRODUCT_EDITION");
    tauri_build::build();
}
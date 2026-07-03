pub const PRODUCT_EDITION: &str = env!("PRODUCT_EDITION");

pub fn is_v1() -> bool {
    PRODUCT_EDITION == "v1"
}

pub fn is_v2() -> bool {
    PRODUCT_EDITION == "v2"
}
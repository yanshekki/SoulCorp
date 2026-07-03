export type ProductEdition = "v1" | "v2";

const raw = import.meta.env.VITE_PRODUCT_EDITION;

export const PRODUCT_EDITION: ProductEdition = raw === "v2" ? "v2" : "v1";
export const IS_V1 = PRODUCT_EDITION === "v1";
export const IS_V2 = PRODUCT_EDITION === "v2";
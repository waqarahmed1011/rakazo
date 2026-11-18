const DEFAULT_PRODUCT_NAME = "Rakazo";

/** The name this server runs under: `INSTANCE_NAME` when set, else Rakazo. */
export function productName(): string {
  return process.env.INSTANCE_NAME?.trim() || DEFAULT_PRODUCT_NAME;
}

/** True when the server runs under its own name, so upstream docs and links stay out of sight. */
export function isWhiteLabeled(): boolean {
  return Boolean(process.env.INSTANCE_NAME?.trim());
}

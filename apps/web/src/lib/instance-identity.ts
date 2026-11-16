const DEFAULT_NAME = "Rakazo";

function meta(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content || undefined;
}

/** The product name: the instance theme's `name` when the server sets one, else Rakazo. */
export function instanceName(): string {
  return meta("instance-name") ?? DEFAULT_NAME;
}

/** The instance theme's icon URL, when the server sets one. */
export function instanceIcon(): string | undefined {
  return meta("instance-icon");
}

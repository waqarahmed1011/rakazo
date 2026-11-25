/** ask_user options as labels, each with the matching line from option_details if any. */
export function askUserChoices(
  options: unknown,
  details: unknown,
): Array<{ label: string; description?: string }> {
  if (!Array.isArray(options)) return [];
  const lines = Array.isArray(details) ? details : [];
  return options.map((option, index) => {
    const line = typeof lines[index] === "string" ? lines[index].trim().slice(0, 120) : "";
    return { label: String(option).trim(), ...(line ? { description: line } : {}) };
  });
}

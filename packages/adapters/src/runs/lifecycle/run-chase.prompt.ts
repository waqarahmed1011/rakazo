/** What a team's chief is told when a member's run fails, so it acts instead of the owner. */
export function chaseFailedRunMessage(failure: string): string {
  return `My last run failed: ${failure}\nPlease decide the next step: retry it, give it to the member who fits, or tell the owner only if a person must act.`;
}

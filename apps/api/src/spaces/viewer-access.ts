import { ClientError } from "@rakazo/core";

import { SPACE_VIEWER_ROLE } from "@rakazo/db";

export class SpaceReadOnlyError extends ClientError {
  constructor() {
    super("FORBIDDEN", "You can view this space but not change it");
    this.name = "SpaceReadOnlyError";
  }
}

// Writes to what the whole space shares. A viewer keeps their own account, models, voice,
// connected accounts and approval rules, and can still chat, answer approvals and leave.
const SHARED_WRITES = new Set([
  "spaces.rename",
  "spaces.remove",
  "spaces.members.add",
  "spaces.members.remove",
  "spaces.members.setRole",
  "spaces.invites.create",
  "spaces.invites.cancel",
  "spaceSettings.setOverride",
  "externalConversations.updatePolicy",
  "threads.clear",
  "memory.update",
  "memory.remove",
  "memory.connectProvider",
  "memory.setDefaultScope",
  "memory.updateProvider",
  "memory.disconnectProvider",
  "routines.create",
  "routines.update",
  "routines.remove",
  "routines.testRun",
  "boards.rename",
  "artifacts.create",
  "artifacts.remove",
  "pages.rename",
  "pages.setVisibility",
  "pages.pin",
  "pages.remove",
  "computerProvider.update",
  "computerProvider.account.update",
]);

// Every write in these families changes something the whole space shares.
const SHARED_FAMILIES: ReadonlyArray<{ prefix: string; reads: ReadonlySet<string> }> = [
  {
    prefix: "bots.",
    reads: new Set([
      "templates",
      "importSetupState",
      "emailAddress",
      "emailAddresses",
      "removePreview",
    ]),
  },
  { prefix: "botSections.", reads: new Set() },
  { prefix: "groups.", reads: new Set() },
  { prefix: "agentSecrets.", reads: new Set() },
  { prefix: "botSecrets.", reads: new Set() },
  { prefix: "skills.", reads: new Set() },
  { prefix: "tickets.", reads: new Set(["comments"]) },
  {
    prefix: "computer.",
    reads: new Set([
      "updates",
      "screenUrl",
      "heartbeat",
      "downloadFile",
      "dismissUpdate",
      "dismissDiskWarning",
    ]),
  },
];

const READ_VERB =
  /^(get|list|read|search|subscribe|preview|status|stream|count|catalog|describe|show|find|lookup|check|history|summary|usage|health|options|available|members|events|threads|detail|load|current|config)/;

/** Whether a member with this space role may call this procedure. */
export function spaceRoleMayCall(role: string | undefined, path: readonly string[]): boolean {
  if (role !== SPACE_VIEWER_ROLE) return true;
  const name = path.join(".");
  if (SHARED_WRITES.has(name)) return false;
  const last = path.at(-1) ?? "";
  for (const family of SHARED_FAMILIES) {
    if (!name.startsWith(family.prefix)) continue;
    return READ_VERB.test(last) || family.reads.has(last);
  }
  return true;
}

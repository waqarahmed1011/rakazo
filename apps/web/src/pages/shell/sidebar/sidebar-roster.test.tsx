// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SidebarRoster } from "./sidebar-roster";
import { sidebarGroupsForSpaces } from "./space-sidebar";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const chat = (id: string, tags: string[]) => ({
  id,
  name: id,
  pinned: false,
  sectionId: null,
  tags,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

function dragEvent(type: string) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { setData: vi.fn(), effectAllowed: "", dropEffect: "" },
  });
  return event;
}

it("moves a dragged section header to the header it is dropped on", async () => {
  const space = {
    id: "space-1",
    name: "BTG",
    bots: [chat("chief", ["Chiefs"]), chat("estimator", ["Projects"])],
    groups: [{ ...chat("office", []), members: [] }],
    botSections: [],
  };
  const groups = sidebarGroupsForSpaces([space], "", undefined, Date.now(), {
    sort: "custom",
    groupChats: "Group chats",
    untagged: "Other",
  });
  const moveSidebarSection = vi.fn();
  const noop = vi.fn();
  await act(async () =>
    root.render(
      <SidebarRoster
        sidebarGroups={groups as never}
        collapsedSidebarSections={new Set()}
        bootstrapMe={{ spaceId: "space-1" }}
        botSections={[]}
        spaces={[]}
        rosterDropKey={null}
        setRosterDropKey={noop}
        rosterDropAction={() => null}
        applyRosterDrop={noop}
        openSpaceChat={noop}
        openSpaceSettings={noop}
        setRenameSectionTarget={noop}
        setDeleteSectionTarget={noop}
        moveSidebarSection={moveSidebarSection}
        toggleSidebarSection={noop}
        inGroup={false}
        active={undefined}
        activeGroup={undefined}
        botsSidebarDensity={"comfortable" as never}
        dismissedRunErrorIds={new Set()}
        displayedRunError={null}
        draggedChatKey={null}
        setDraggedChatKey={noop}
        chatMenu={{} as never}
        reorderRosterChat={noop}
        activeSnapshot={null}
      />,
    ),
  );
  const header = (key: string) =>
    host.querySelector(`[data-sidebar-group="${key}"] [role="group"]`) as HTMLElement;
  expect(header("tag:projects").getAttribute("draggable")).toBe("true");
  await act(async () => header("tag:projects").dispatchEvent(dragEvent("dragstart")));
  await act(async () => header("groups").dispatchEvent(dragEvent("dragover")));
  await act(async () => header("groups").dispatchEvent(dragEvent("drop")));
  expect(moveSidebarSection).toHaveBeenCalledWith(
    "space-1",
    ["groups", "tag:chiefs", "tag:projects"],
    "tag:projects",
    -2,
  );
});

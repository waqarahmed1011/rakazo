import { useLingui } from "@lingui/react/macro";
import type {
  AppBootstrap,
  Bot,
  BotSection,
  ComputerStatus,
  Group,
  Me,
  Space,
  ThreadSnapshot,
} from "@rakazo/contracts";
import { chatKey, sortChats } from "@rakazo/core";
import { replaceEqualDeep } from "@tanstack/react-query";
import type { RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { applyAccountCapabilities, takeInitialBootstrap } from "../../../lib/bootstrap";
import {
  initialBootstrapTarget,
  linkedBotRoute,
  linkedGroupRoute,
} from "../../../lib/bootstrap-target";
import { markOnce } from "../../../lib/platform/performance";
import type { ChatTarget } from "../../../lib/query/query";
import { lastChatKey, queryClient, seedOnLeave, spaceSeedKey } from "../../../lib/query/query";
import type { createSpaceRpc } from "../../../lib/query/rpc";
import { errorText } from "../../../lib/query/user-error";
import { useEventListener } from "../../../lib/use-event-listener";
import type { ThreadState } from "../chat/use-thread-state";
import type { useShellNavigation } from "../use-shell-navigation";
import { firstThreadRoute } from "../use-shell-navigation";
import type { DraggedChat, RosterDropTarget } from "./roster-drop";
import { resolveRosterDrop } from "./roster-drop";
import { createRosterSignals } from "./roster-signals";

type Navigation = ReturnType<typeof useShellNavigation>;
type ChatRoute = NonNullable<ReturnType<typeof initialBootstrapTarget>>;

function routeChatListed(route: ChatRoute, bots: readonly Bot[], groups: readonly Group[]) {
  return route.groupId
    ? groups.some((group) => group.id === route.groupId)
    : bots.some((bot) => bot.id === route.botId);
}

/** The space's bots, groups, sections and spaces, refreshed while the shell is open. */
export function useSpaceRoster({
  rpc,
  seed,
  navigate,
  redirectKeepingOverlay,
}: {
  rpc: ReturnType<typeof createSpaceRpc>;
  seed: AppBootstrap | undefined;
  navigate: Navigation["navigate"];
  redirectKeepingOverlay: Navigation["redirectKeepingOverlay"];
}) {
  const [groups, setGroups] = useState<Group[]>(seed?.groups ?? []);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const [bots, setBots] = useState<Bot[]>(seed?.bots ?? []);
  const botsRef = useRef(bots);
  botsRef.current = bots;
  const botOrderEpochRef = useRef(0);
  const pendingBotOrderRef = useRef<Array<{ kind: "bot" | "group"; id: string }> | null>(null);
  const savingBotOrderRef = useRef(false);
  const [botSections, setBotSections] = useState<BotSection[]>(seed?.botSections ?? []);
  const [spaces, setSpaces] = useState<Space[]>(seed?.spaces ?? []);
  // Until the server says otherwise, an account with nothing in sight is treated as new.
  const [firstBotDue, setFirstBotDue] = useState(true);
  const [archivedBots, setArchivedBots] = useState<Bot[]>(seed?.archivedBots ?? []);
  const [archivedGroups, setArchivedGroups] = useState<Group[]>(seed?.archivedGroups ?? []);
  const [initialBotsLoaded, setInitialBotsLoaded] = useState(Boolean(seed));
  // A failed first load falls back to the shell, whose re-reads and footer can still recover.
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [bootstrapMe, setBootstrapMe] = useState<Me | null | undefined>(seed?.me);
  // Set when the first load failed without a seed: roster re-reads then fetch the account too,
  // or what it decides (Labs, Billing, ...) would stay hidden until a reload.
  const meMissingRef = useRef(false);
  const accountLoadFailed = useCallback(() => {
    meMissingRef.current = true;
    setBootstrapMe(null);
  }, []);
  // An account arriving another way (a settings save) is newer than a pending re-read, and a
  // shell that is gone must not apply its account over the next one's.
  useEffect(() => {
    if (bootstrapMe) meMissingRef.current = false;
  }, [bootstrapMe]);
  useEffect(
    () => () => {
      meMissingRef.current = false;
    },
    [],
  );
  const callsEnabledRef = useRef(false);
  useEffect(() => {
    callsEnabledRef.current = bootstrapMe?.phoneCallsEnabled === true;
  }, [bootstrapMe?.phoneCallsEnabled]);
  const botsRefreshEpoch = useRef(0);
  const botsRefreshApplied = useRef(0);
  const archivedBotsRefreshEpoch = useRef(0);
  const renderedPath = useRef("");
  renderedPath.current = useLocation().pathname;
  /** Whether the switch to another space that has begun is still on its way; null between switches. */
  const switchingSpace = useRef<(() => boolean) | null>(null);

  /** The chat the URL names now, not at the shell's last render; null on another page's URL. */
  const liveRoute = useCallback((): ChatRoute | null => {
    const { pathname } = window.location;
    const route = initialBootstrapTarget(pathname, false);
    if (!route || route.botId || route.groupId) return route;
    // Only the router knows which chatless paths under /app are the shell's: those it rendered.
    return pathname === renderedPath.current ? route : null;
  }, []);

  const refreshBots = useCallback(
    async (includeArchived = false, replaceBotOrder = false) => {
      markOnce("rk:renderer:bots-request-start");
      const request = ++botsRefreshEpoch.current;
      const botOrderEpoch = botOrderEpochRef.current;
      const preserveBotOrder = savingBotOrderRef.current || pendingBotOrderRef.current !== null;
      const archivedRequest = includeArchived ? ++archivedBotsRefreshEpoch.current : null;
      if (meMissingRef.current) {
        // Apart from the roster, so a failing account read cannot hold it back. The RPC client
        // reports a transport failure and the API a server one; the flag stays set, so the next
        // re-read tries again.
        void rpc.me().then(
          (me) => {
            if (!meMissingRef.current) return;
            meMissingRef.current = false;
            applyAccountCapabilities(me);
            setBootstrapMe((previous) => previous ?? me);
          },
          () => {},
        );
      }
      const [navigation, archived, archivedGroupList] = await Promise.all([
        rpc.spaces.list(),
        includeArchived ? rpc.bots.listArchived() : Promise.resolve(null),
        includeArchived ? rpc.groups.listArchived() : Promise.resolve(null),
      ]);
      const { bots: list, botSections: sections, groups: groupList } = navigation.current;
      markOnce("rk:renderer:bots-response");
      const botsFresh = request === botsRefreshEpoch.current;
      const archivedFresh =
        archivedRequest != null && archivedRequest === archivedBotsRefreshEpoch.current;
      // A newer non-archived refresh can win the bots epoch while an older
      // includeArchived request still owns archivedBotsRefreshEpoch — apply
      // whichever slices are still current.
      if (!botsFresh && !archivedFresh) return;
      // Keeping unchanged values lets a re-read that found nothing new skip rendering.
      if (archivedFresh && archived)
        setArchivedBots((previous) => replaceEqualDeep(previous, archived));
      if (archivedFresh && archivedGroupList)
        setArchivedGroups((previous) => replaceEqualDeep(previous, archivedGroupList));
      if (!botsFresh) return;
      if (
        botOrderEpoch === botOrderEpochRef.current &&
        (replaceBotOrder || (!preserveBotOrder && !savingBotOrderRef.current))
      ) {
        setBots((previous) => replaceEqualDeep(previous, list));
      }
      setBotSections((previous) => replaceEqualDeep(previous, sections));
      setGroups((previous) =>
        replaceEqualDeep(
          previous,
          preserveBotOrder || savingBotOrderRef.current
            ? groupList.map((group) => ({
                ...group,
                position: previous.find((item) => item.id === group.id)?.position ?? group.position,
              }))
            : groupList,
        ),
      );
      setSpaces((previous) => replaceEqualDeep(previous, navigation.spaces));
      setFirstBotDue(navigation.firstBotDue !== false);
      setInitialBotsLoaded(true);
      botsRefreshApplied.current = request;
      const route = liveRoute();
      if (!route) return;
      if (
        includeArchived &&
        list.length === 0 &&
        archived?.length === 0 &&
        groupList.length === 0 &&
        archivedGroupList?.length === 0 &&
        !navigation.spaces.some((space) => space.hasContent) &&
        navigation.firstBotDue !== false
      ) {
        // Only the very first bot everywhere needs onboarding, which the server
        // says: an empty space beside used ones, or in a new organization of
        // someone who has chatted before, stays in the app so it can be
        // switched from, filled or deleted instead of trapping the user.
        navigate("/onboarding", { replace: true });
        return;
      }
      // The chat a switch is opening is in the other space's roster, and moving the route cancels it.
      if (switchingSpace.current?.()) return;
      if (!routeChatListed(route, list, groupList)) {
        redirectKeepingOverlay(firstThreadRoute(list, groupList));
      }
    },
    [navigate, liveRoute],
  );

  /**
   * Leaves the route alone while `live` says a switch to another space is on its way. The switch
   * calls the returned function when it is over; one that stayed in this space has its route
   * checked then, since nothing repaired it meanwhile.
   */
  const beginSpaceSwitch = useCallback(
    (live: () => boolean) => {
      switchingSpace.current = live;
      return (leftSpace: boolean) => {
        // A newer switch has taken over, and checks the route when it ends.
        if (switchingSpace.current !== live) return;
        switchingSpace.current = null;
        if (!leftSpace) void refreshBots().catch(() => undefined);
      };
    },
    [refreshBots],
  );

  const flushBotOrder = useCallback(async () => {
    if (savingBotOrderRef.current) return;
    savingBotOrderRef.current = true;
    try {
      while (pendingBotOrderRef.current) {
        const chats = pendingBotOrderRef.current;
        pendingBotOrderRef.current = null;
        try {
          await rpc.bots.reorderChats({ chats });
        } catch {
          // Keep a newer order queued during this failed save; only roll back
          // when nothing else is pending.
          if (pendingBotOrderRef.current === null) {
            await refreshBots(false, true).catch(() => undefined);
          }
        }
      }
    } finally {
      savingBotOrderRef.current = false;
      // A reorder may have arrived while saving=true and returned early.
      if (pendingBotOrderRef.current) {
        void flushBotOrder();
      }
    }
  }, [refreshBots]);
  /** Moves one chat (a bot or a group chat, by `chatKey`) onto another within the same list. */
  const reorderRosterChat = useCallback(
    (sourceKey: string, targetKey: string, listKeys: string[]) => {
      if (!listKeys.includes(sourceKey) || !listKeys.includes(targetKey)) return;
      const order = sortChats([
        ...botsRef.current.map((bot) => ({
          kind: "bot" as const,
          id: bot.id,
          position: bot.position,
        })),
        ...groupsRef.current
          .filter((group) => !group.archivedAt)
          .map((group) => ({ kind: "group" as const, id: group.id, position: group.position })),
      ]);
      const keys = order.map(chatKey);
      const from = keys.indexOf(sourceKey);
      const to = keys.indexOf(targetKey);
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = order.splice(from, 1);
      if (!moved) return;
      order.splice(to, 0, moved);
      const positions = new Map(order.map((chat, position) => [chatKey(chat), position]));
      const next = botsRef.current
        .map((bot) => ({ ...bot, position: positions.get(`bot:${bot.id}`) ?? bot.position }))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      botOrderEpochRef.current += 1;
      botsRef.current = next;
      setBots(next);
      setGroups((current) =>
        current.map((group) => ({
          ...group,
          position: positions.get(`group:${group.id}`) ?? group.position,
        })),
      );
      pendingBotOrderRef.current = order.map(({ kind, id }) => ({ kind, id }));
      void flushBotOrder();
    },
    [flushBotOrder],
  );

  /** Shows a bot created here at once: a roster requested before creation may omit it. */
  function addCreatedBot(bot: Bot) {
    botsRefreshEpoch.current += 1;
    setBots((current) =>
      current.some((item) => item.id === bot.id) ? current : [bot, ...current],
    );
  }

  return {
    groups,
    setGroups,
    groupsRef,
    bots,
    setBots,
    botsRef,
    botSections,
    spaces,
    setSpaces,
    firstBotDue,
    setFirstBotDue,
    archivedBots,
    setArchivedBots,
    archivedGroups,
    setArchivedGroups,
    setBotSections,
    initialBotsLoaded,
    setInitialBotsLoaded,
    initialLoadFailed,
    setInitialLoadFailed,
    bootstrapMe,
    setBootstrapMe,
    accountLoadFailed,
    callsEnabledRef,
    botsRefreshApplied,
    switchingSpace,
    liveRoute,
    beginSpaceSwitch,
    refreshBots,
    reorderRosterChat,
    addCreatedBot,
  };
}

export type SpaceRoster = ReturnType<typeof useSpaceRoster>;

/**
 * Loads the space's bootstrap, keeps the roster current, and saves what the shell showed so a
 * revisit paints at once. Returns what the server's roster signals drive.
 */
export function useSpaceBootstrap({
  roster,
  thread,
  commitComputer,
  userId,
  shellSpaceId,
  seed,
  startChat,
  botId,
  groupId,
  chat,
  navigate,
  redirectKeepingOverlay,
  openSpaceChat,
}: {
  roster: SpaceRoster;
  thread: ThreadState;
  commitComputer: (next: ComputerStatus | null) => void;
  userId: string | undefined;
  shellSpaceId: string | null;
  seed: AppBootstrap | undefined;
  startChat: ChatTarget | undefined;
  botId: string | undefined;
  groupId: string | undefined;
  chat: ChatTarget | undefined;
  navigate: Navigation["navigate"];
  redirectKeepingOverlay: Navigation["redirectKeepingOverlay"];
  /** Opens a linked chat that lives in another of the user's Spaces. */
  openSpaceChat: RefObject<(spaceId: string, path: string) => void>;
}) {
  const {
    bots,
    setBots,
    groups,
    setGroups,
    botSections,
    setBotSections,
    archivedBots,
    setArchivedBots,
    archivedGroups,
    setArchivedGroups,
    spaces,
    setSpaces,
    setFirstBotDue,
    setInitialBotsLoaded,
    setInitialLoadFailed,
    bootstrapMe,
    setBootstrapMe,
    accountLoadFailed,
    callsEnabledRef,
    botsRefreshApplied,
    switchingSpace,
    liveRoute,
    refreshBots,
  } = roster;
  const { snapshotRef, commitSnapshot, setRoutines, setRoutinesBotId, bootstrappedThread } = thread;
  // Until the route names the chat reopened from cache, that chat stands in for it.
  const routeChat = botId || groupId ? undefined : startChat;
  const refreshRosterRef = useRef<() => void>(() => {});
  const [rosterSignals] = useState(() => createRosterSignals(() => refreshRosterRef.current()));

  function saveSeed(bootstrap: AppBootstrap, chat?: ChatTarget) {
    // With no space chosen the server picks one, so a shell reopened that way looks there too.
    for (const spaceId of shellSpaceId ? [bootstrap.me.spaceId] : [bootstrap.me.spaceId, null]) {
      queryClient.setQueryData(spaceSeedKey(userId ?? null, spaceId), bootstrap);
      if (chat) queryClient.setQueryData(lastChatKey(userId ?? null, spaceId), chat);
    }
  }
  const seedStateRef = useRef<
    | (Omit<AppBootstrap, "thread" | "routines" | "me" | "firstBotDue"> & {
        me?: Me | null;
        chat: ChatTarget | undefined;
      })
    | null
  >(null);
  seedStateRef.current = {
    chat,
    me: bootstrapMe,
    bots,
    groups,
    botSections,
    archivedBots,
    archivedGroups,
    spaces,
  };
  useLayoutEffect(() => {
    if (routeChat) {
      redirectKeepingOverlay(
        routeChat.groupId ? `/app/g/${routeChat.groupId}` : `/app/${routeChat.botId}`,
      );
    }
    // Leaving for another page or space keeps the sidebar and open chat to reopen with.
    return () => {
      const state = seedStateRef.current;
      if (!state?.me) return;
      const { me, chat, ...lists } = state;
      const previous = queryClient.getQueryData(spaceSeedKey(userId ?? null, me.spaceId));
      if (!previous) return;
      saveSeed(seedOnLeave(previous, { ...lists, me }, chat, snapshotRef.current), chat);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const appliedAtStart = botsRefreshApplied.current;
    void takeInitialBootstrap(botId ?? startChat?.botId, groupId)
      .then((bootstrap) => {
        // Kept for the space it belongs to, so switching back to it can paint at once.
        saveSeed(bootstrap);
        if (cancelled) return;
        const groupList = bootstrap.groups;
        setBootstrapMe(bootstrap.me);
        // Skip list/route writes only if a later refreshBots() successfully
        // committed (failed refreshes bump epoch but not botsRefreshApplied).
        const applyBotLists = appliedAtStart === botsRefreshApplied.current;
        if (applyBotLists) {
          setBots(bootstrap.bots);
          setBotSections(bootstrap.botSections);
          setArchivedBots(bootstrap.archivedBots);
          setArchivedGroups(bootstrap.archivedGroups);
          setGroups(groupList);
          setSpaces(bootstrap.spaces);
          setFirstBotDue(bootstrap.firstBotDue !== false);
          setInitialBotsLoaded(true);
        }
        // A seeded shell already loads its chat live; this older copy must not replace it.
        if (!seed && !groupId && bootstrap.thread) {
          bootstrappedThread.current = bootstrap.thread;
          commitSnapshot(bootstrap.thread);
          commitComputer(bootstrap.thread.computer ?? null);
          setRoutines(bootstrap.routines);
          setRoutinesBotId(bootstrap.thread.botId ?? null);
          markOnce("rk:renderer:bots-response");
          markOnce("rk:renderer:thread-response");
        }
        // The user may have opened another chat while this loaded, so the route is read now.
        const route = liveRoute();
        // A switch begun meanwhile is taking the user elsewhere, and moving the route cancels it.
        if (!route || switchingSpace.current?.()) return;
        // Checked before the roster gate: a refresh that landed first may already have moved away.
        // The server placed the chat this load asked about, so the route must still name it.
        const linked =
          route.botId !== botId || route.groupId !== groupId
            ? undefined
            : groupId
              ? linkedGroupRoute(bootstrap, groupId, window.location.search)
              : linkedBotRoute(bootstrap, botId, window.location.search);
        if (linked) {
          openSpaceChat.current(linked.spaceId, linked.path);
          return;
        }
        if (!applyBotLists) return;
        // The shell moves only if the chat its route names is gone.
        if (routeChatListed(route, bootstrap.bots, groupList)) return;
        if (
          bootstrap.bots.length === 0 &&
          bootstrap.archivedBots.length === 0 &&
          groupList.length === 0 &&
          bootstrap.archivedGroups.length === 0 &&
          !bootstrap.spaces.some((space) => space.hasContent) &&
          bootstrap.firstBotDue !== false
        ) {
          navigate("/onboarding", { replace: true });
          return;
        }
        if (route.groupId) {
          redirectKeepingOverlay(firstThreadRoute(bootstrap.bots, groupList));
          return;
        }
        const selectedBotId = bootstrap.thread?.botId ?? bootstrap.bots[0]?.id;
        if (selectedBotId) redirectKeepingOverlay(`/app/${selectedBotId}`);
      })
      .catch(() => {
        if (cancelled) return;
        if (!seed) accountLoadFailed();
        return refreshBots(true).catch(() => {
          if (!cancelled) setInitialLoadFailed(true);
        });
      })
      // Only the load whose answer was applied lets held re-reads go: one answering for an effect
      // already torn down would let them repair the route before the kept load places its chat.
      .finally(() => {
        if (!cancelled) rosterSignals.firstLoadSettled();
      });
    let refreshTimer: number | undefined;
    refreshRosterRef.current = () => {
      if (document.visibilityState !== "visible" && !callsEnabledRef.current) return;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshBots().catch(() => undefined), 50);
    };
    return () => {
      cancelled = true;
      refreshRosterRef.current = () => {};
      window.clearTimeout(refreshTimer);
    };
  }, []);
  // Held back like the server's signals, so neither re-reads before the first load has answered.
  useEventListener(window, "focus", rosterSignals.changed);
  useEventListener(document, "visibilitychange", rosterSignals.changed);
  return rosterSignals;
}

/** Dragging a bot or group chat in the roster: reorder it, move it to a section, or add a bot to a group. */
export function useRosterDrop({
  rpc,
  bots,
  groups,
  reorderRosterChat,
  refreshBots,
  refreshGroupThread,
  activeGroupId,
  setSendError,
}: {
  rpc: ReturnType<typeof createSpaceRpc>;
  bots: Bot[];
  groups: Group[];
  reorderRosterChat: SpaceRoster["reorderRosterChat"];
  refreshBots: () => Promise<void>;
  refreshGroupThread: (groupId: string) => Promise<ThreadSnapshot>;
  activeGroupId: RefObject<string | undefined>;
  setSendError: (error: string | null) => void;
}) {
  const { t } = useLingui();
  const [draggedChatKey, setDraggedChatKey] = useState<string | null>(null);
  const [rosterDropKey, setRosterDropKey] = useState<string | null>(null);
  // Drags only act on chats of the active space; other spaces are read-only here.
  const draggedChat = useMemo<DraggedChat | undefined>(() => {
    if (!draggedChatKey) return undefined;
    const bot = bots.find((item) => chatKey({ kind: "bot", id: item.id }) === draggedChatKey);
    if (bot) return { kind: "bot", id: bot.id, sectionId: bot.sectionId, pinned: bot.pinned };
    const group = groups.find((item) => chatKey({ kind: "group", id: item.id }) === draggedChatKey);
    return group
      ? { kind: "group", id: group.id, sectionId: group.sectionId, pinned: group.pinned }
      : undefined;
  }, [bots, draggedChatKey, groups]);
  const rosterDropAction = useCallback(
    (target: RosterDropTarget, sameList: boolean) =>
      draggedChat ? resolveRosterDrop({ dragged: draggedChat, target, sameList }) : null,
    [draggedChat],
  );
  const applyRosterDrop = useCallback(
    (target: RosterDropTarget, sameList: boolean, listKeys: string[]) => {
      const action = rosterDropAction(target, sameList);
      setDraggedChatKey(null);
      setRosterDropKey(null);
      if (!action || !draggedChat) return;
      setSendError(null);
      if (action.action === "reorder") {
        reorderRosterChat(chatKey(draggedChat), action.targetKey, listKeys);
        return;
      }
      const request =
        action.action === "move"
          ? draggedChat.kind === "bot"
            ? rpc.bots.update({ botId: draggedChat.id, sectionId: action.sectionId })
            : rpc.groups.update({ groupId: draggedChat.id, sectionId: action.sectionId })
          : rpc.groups.update({
              groupId: action.groupId,
              botIds: action.botIds,
              expectedBotIds: action.botIds.filter((id) => id !== draggedChat.id),
            });
      void request
        .then(async () => {
          await refreshBots();
          if (action.action === "join" && activeGroupId.current === action.groupId) {
            await refreshGroupThread(action.groupId);
          }
        })
        .catch((error) => {
          setSendError(errorText(error, t`Could not save`));
          void refreshBots().catch(() => undefined);
        });
    },
    [draggedChat, refreshBots, reorderRosterChat, rosterDropAction, t],
  );
  return {
    draggedChatKey,
    setDraggedChatKey,
    rosterDropKey,
    setRosterDropKey,
    rosterDropAction,
    applyRosterDrop,
  };
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import VoiceWebRTC from "@/components/spaces/VoiceWebRTC";
import { recoverSessionOrRedirect } from "@/lib/api/auth-recovery";
import { getHttpStatus } from "@/lib/api/errors";
import { buildWebSocketUrl } from "@/lib/api/ws";
import {
  joinVoiceChannelById,
  leaveVoiceChannel,
  sendVoiceHeartbeat,
  updateVoiceState,
} from "@/lib/api/voice";
import { useMe } from "@/lib/me";
import type { VoiceMember } from "@/lib/api/generated/zerizeha-schemas";

type ConnectionQuality = "good" | "ok" | "bad" | "unknown";
type ScreenShareInfo = { feedId: string; userId: string };
type EventsEnvelope = {
  type?: string;
  payload?: unknown;
};
type EventsListener = (event: EventsEnvelope) => void;

type VoiceSessionContextValue = {
  activeVoiceChannelId: string | null;
  activeVoiceChannelName: string;
  activeVoiceSpaceId: string | null;
  activeVoiceSpaceName: string;
  voiceMembersByChannelId: Record<string, VoiceMember[]>;
  voiceSpeakingByUserId: Record<string, boolean>;
  voiceFatalError: string | null;
  screenShareEnabled: boolean;
  localScreenStream: MediaStream | null;
  screenStreamsByFeedId: Record<string, MediaStream>;
  screenShares: ScreenShareInfo[];
  selectedScreenFeedId: string | null;
  focusedUserId: string | null;
  connectionQuality: ConnectionQuality;
  voicePanelExpanded: boolean;
  voiceReady: boolean;
  voicePeerReady: boolean;
  pttAvailable: boolean;
  pttEnabled: boolean;
  pttActive: boolean;
  pttKey: string;
  capturingPttKey: boolean;
  micMuted: boolean;
  incomingMuted: boolean;
  mutedUserIds: Record<string, boolean>;
  volumeByUserId: Record<string, number>;
  micEnabled: boolean;
  audioInputDeviceId: string | null;
  audioOutputDeviceId: string | null;
  micLevel: number;
  outputLevel: number;
  meSummary: {
    id: string;
    username: string;
    is_admin: boolean;
    avatar_url: string | null;
  } | null;
  setSpaceVoiceChannels: (spaceId: string, channelIds: string[]) => void;
  joinVoiceChannel: (
    spaceId: string,
    channelId: string,
    channelName?: string,
    spaceName?: string,
  ) => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  setActiveVoiceSpaceName: (name: string) => void;
  setVoicePanelExpanded: (value: boolean) => void;
  setCapturingPttKey: (value: boolean) => void;
  setPttEnabled: (value: boolean) => void;
  setPttKey: (value: string) => void;
  setMicMuted: (value: boolean) => void;
  setIncomingMuted: (value: boolean) => void;
  setAudioInputDeviceId: (value: string | null) => void;
  setAudioOutputDeviceId: (value: string | null) => void;
  setMicLevel: (value: number) => void;
  setOutputLevel: (value: number) => void;
  toggleScreenShare: () => void;
  watchScreen: (feedId: string) => void;
  leaveScreen: () => void;
  focusUser: (userId: string | null) => void;
  toggleUserMute: (userId: string) => void;
  setVolume: (userId: string, volume: number) => void;
  clearVoiceFatalError: () => void;
  subscribeToEvents: (listener: EventsListener) => () => void;
};

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null);

export function useVoiceSession() {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) {
    throw new Error("useVoiceSession must be used within VoiceSessionProvider");
  }
  return ctx;
}

const volumeStorageKey = "zerizeha.voice.volumeByUserId";
const pttKeyStorageKey = "zerizeha.ptt.key";
const pttEnabledStorageKey = "zerizeha.ptt.enabled";
const audioInputStorageKey = "zerizeha.audio.inputDeviceId";
const audioOutputStorageKey = "zerizeha.audio.outputDeviceId";
const micLevelStorageKey = "zerizeha.audio.micLevel";
const outputLevelStorageKey = "zerizeha.audio.outputLevel";

function readStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readBooleanStorageItem(key: string, fallback = false): boolean {
  const value = readStorageItem(key);
  return value === null ? fallback : value === "true";
}

function readNumberStorageItem(key: string, fallback: number): number {
  const value = readStorageItem(key);
  if (value === null) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(0, Math.min(1, parsed));
}

function readVolumeStorage(): Record<string, number> {
  const raw = readStorageItem(volumeStorageKey);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default function VoiceSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const meState = useMe();
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(
    null,
  );
  const [activeVoiceChannelName, setActiveVoiceChannelName] = useState("");
  const [activeVoiceSpaceId, setActiveVoiceSpaceId] = useState<string | null>(
    null,
  );
  const [activeVoiceSpaceName, setActiveVoiceSpaceName] = useState("");
  const [voiceMembersByChannelId, setVoiceMembersByChannelId] = useState<
    Record<string, VoiceMember[]>
  >({});
  const [voiceSpeakingByUserId, setVoiceSpeakingByUserId] = useState<
    Record<string, boolean>
  >({});
  const [voiceFatalError, setVoiceFatalError] = useState<string | null>(null);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(
    null,
  );
  const [screenStreamsByFeedId, setScreenStreamsByFeedId] = useState<
    Record<string, MediaStream>
  >({});
  const [screenShares, setScreenShares] = useState<ScreenShareInfo[]>([]);
  const [selectedScreenFeedId, setSelectedScreenFeedId] = useState<string | null>(
    null,
  );
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    "unknown",
  );
  const [voicePanelExpanded, setVoicePanelExpanded] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voicePeerReady, setVoicePeerReady] = useState(false);
  const [pttAvailable] = useState(
    () => typeof window !== "undefined" && !!window.electron?.ptt,
  );
  const [pttEnabled, setPttEnabledState] = useState(() =>
    readBooleanStorageItem(pttEnabledStorageKey),
  );
  const [pttActive, setPttActive] = useState(false);
  const [pttKey, setPttKeyState] = useState(
    () => readStorageItem(pttKeyStorageKey) ?? "KeyV",
  );
  const [capturingPttKey, setCapturingPttKey] = useState(false);
  const [micMuted, setMicMutedState] = useState(false);
  const [incomingMuted, setIncomingMutedState] = useState(false);
  const [mutedUserIds, setMutedUserIds] = useState<Record<string, boolean>>({});
  const [volumeByUserId, setVolumeByUserId] = useState<Record<string, number>>(
    () => readVolumeStorage(),
  );
  const [audioInputDeviceId, setAudioInputDeviceId] = useState<string | null>(
    () => readStorageItem(audioInputStorageKey),
  );
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState<string | null>(
    () => readStorageItem(audioOutputStorageKey),
  );
  const [micLevel, setMicLevel] = useState(() =>
    readNumberStorageItem(micLevelStorageKey, 1),
  );
  const [outputLevel, setOutputLevel] = useState(() =>
    readNumberStorageItem(outputLevelStorageKey, 1),
  );
  const voiceChannelIdsBySpaceIdRef = useRef<Record<string, string[]>>({});
  const lastManualFocusAtRef = useRef(0);
  const lastActiveSpeakerIdRef = useRef<string | null>(null);
  const autoFocusedUserIdRef = useRef<string | null>(null);
  const voicePeerFeedsRef = useRef<Set<string>>(new Set());
  const joinSoundRef = useRef<HTMLAudioElement | null>(null);
  const leaveSoundRef = useRef<HTMLAudioElement | null>(null);
  const prevChannelRef = useRef<string | null>(null);
  const prevMembersRef = useRef<Set<string> | null>(null);
  const lastJoinSoundAtRef = useRef(0);
  const lastLeaveSoundAtRef = useRef(0);
  const switchingChannelRef = useRef(false);
  const suppressMemberSoundsUntilRef = useRef(0);
  const lastUsernameRef = useRef<string | null>(null);
  const eventListenersRef = useRef<Set<EventsListener>>(new Set());
  const voiceChannelRevisionByIdRef = useRef<Record<string, number>>({});

  const meSummary = useMemo(() => {
    if (meState.state.status !== "ready") return null;
    if (!meState.state.me.id) return null;
    return {
      id: meState.state.me.id,
      username: meState.state.me.username || "user",
      is_admin: !!meState.state.me.is_admin,
      avatar_url: null as string | null,
      muted: micMuted,
      deafened: incomingMuted,
    };
  }, [incomingMuted, meState.state, micMuted]);

  useEffect(() => {
    if (typeof Audio === "undefined") return;
    joinSoundRef.current = new Audio("/sounds/join.wav");
    leaveSoundRef.current = new Audio("/sounds/leave.wav");
  }, []);

  useEffect(() => {
    const username = meSummary?.username ?? null;
    if (lastUsernameRef.current === null) {
      lastUsernameRef.current = username;
      return;
    }
    if (lastUsernameRef.current === username) return;
    lastUsernameRef.current = username;
    if (!activeVoiceChannelId) return;
    const members = voiceMembersByChannelId[activeVoiceChannelId];
    if (!members) return;
    const currentIds = new Set(
      members
        .map((member) => member.id)
        .filter((id) => id !== meSummary?.id),
    );
    prevMembersRef.current = currentIds;
    suppressMemberSoundsUntilRef.current = Date.now() + 900;
  }, [activeVoiceChannelId, meSummary?.id, meSummary?.username, voiceMembersByChannelId]);

  useEffect(() => {
    const channelId = activeVoiceChannelId;
    if (!channelId) {
      if (switchingChannelRef.current) {
        prevMembersRef.current = null;
        return;
      }
      if (prevChannelRef.current && leaveSoundRef.current) {
        const now = Date.now();
        if (now - lastLeaveSoundAtRef.current > 700) {
          lastLeaveSoundAtRef.current = now;
          leaveSoundRef.current.volume = 0.50;
          leaveSoundRef.current.currentTime = 0;
          void leaveSoundRef.current.play().catch(() => {});
        }
      }
      prevMembersRef.current = null;
      prevChannelRef.current = null;
      return;
    }

    if (prevChannelRef.current !== channelId) {
      if (switchingChannelRef.current) {
        switchingChannelRef.current = false;
      }
      if (joinSoundRef.current) {
        const now = Date.now();
        if (now - lastJoinSoundAtRef.current > 700) {
          lastJoinSoundAtRef.current = now;
          joinSoundRef.current.volume = 0.50;
          joinSoundRef.current.currentTime = 0;
          void joinSoundRef.current.play().catch(() => {});
        }
      }
      suppressMemberSoundsUntilRef.current = Date.now() + 700;
      prevChannelRef.current = channelId;
      prevMembersRef.current = null;
    }

    const members = voiceMembersByChannelId[channelId];
    if (!members) return;

    const meId = meSummary?.id;
    const currentIds = new Set(
      members.map((member) => member.id).filter((id) => id !== meId),
    );

    if (!prevMembersRef.current) {
      prevMembersRef.current = currentIds;
      return;
    }

    let joined = false;
    let left = false;
    for (const id of currentIds) {
      if (!prevMembersRef.current.has(id)) {
        joined = true;
        break;
      }
    }
    for (const id of prevMembersRef.current) {
      if (!currentIds.has(id)) {
        left = true;
        break;
      }
    }

    prevMembersRef.current = currentIds;

    const suppressMemberSounds =
      Date.now() < suppressMemberSoundsUntilRef.current;

    if (!suppressMemberSounds && joined && joinSoundRef.current) {
      const now = Date.now();
      if (now - lastJoinSoundAtRef.current > 700) {
        lastJoinSoundAtRef.current = now;
        joinSoundRef.current.volume = 0.50;
        joinSoundRef.current.currentTime = 0;
        void joinSoundRef.current.play().catch(() => {});
      }
    }
    if (!suppressMemberSounds && left && leaveSoundRef.current) {
      const now = Date.now();
      if (now - lastLeaveSoundAtRef.current > 700) {
        lastLeaveSoundAtRef.current = now;
        leaveSoundRef.current.volume = 0.50;
        leaveSoundRef.current.currentTime = 0;
        void leaveSoundRef.current.play().catch(() => {});
      }
    }
  }, [activeVoiceChannelId, meSummary?.id, voiceMembersByChannelId]);

  const micEnabled =
    pttAvailable && pttEnabled ? pttActive && !micMuted : !micMuted;

  useEffect(() => {
    if (!pttAvailable) return;
    const unlisten = window.electron?.ptt.onState((active) => {
      setPttActive(active);
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [pttAvailable]);

  useEffect(() => {
    if (!pttAvailable) return;
    void window.electron?.ptt.setEnabled(pttEnabled);
    try {
      window.localStorage.setItem(pttEnabledStorageKey, String(pttEnabled));
    } catch {
      // ignore
    }
  }, [pttAvailable, pttEnabled]);

  useEffect(() => {
    if (!pttAvailable) return;
    void window.electron?.ptt.setKey(pttKey);
    try {
      window.localStorage.setItem(pttKeyStorageKey, pttKey);
    } catch {
      // ignore
    }
  }, [pttAvailable, pttKey]);

  useEffect(() => {
    if (!capturingPttKey) return;
    const handler = (ev: KeyboardEvent) => {
      ev.preventDefault();
      if (ev.code === "Escape") {
        setCapturingPttKey(false);
        return;
      }
      setPttKeyState(ev.code);
      setCapturingPttKey(false);
    };
    const mouseHandler = (ev: MouseEvent) => {
      if (ev.button === 3) {
        ev.preventDefault();
        setPttKeyState("Mouse4");
        setCapturingPttKey(false);
      } else if (ev.button === 4) {
        ev.preventDefault();
        setPttKeyState("Mouse5");
        setCapturingPttKey(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    window.addEventListener("mousedown", mouseHandler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("mousedown", mouseHandler, true);
    };
  }, [capturingPttKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(volumeStorageKey, JSON.stringify(volumeByUserId));
    } catch {
      // ignore
    }
  }, [volumeByUserId]);

  useEffect(() => {
    try {
      if (audioInputDeviceId) {
        window.localStorage.setItem(audioInputStorageKey, audioInputDeviceId);
      } else {
        window.localStorage.removeItem(audioInputStorageKey);
      }
    } catch {
      // ignore
    }
  }, [audioInputDeviceId]);

  useEffect(() => {
    try {
      if (audioOutputDeviceId) {
        window.localStorage.setItem(audioOutputStorageKey, audioOutputDeviceId);
      } else {
        window.localStorage.removeItem(audioOutputStorageKey);
      }
    } catch {
      // ignore
    }
  }, [audioOutputDeviceId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(micLevelStorageKey, String(micLevel));
    } catch {
      // ignore
    }
  }, [micLevel]);

  useEffect(() => {
    try {
      window.localStorage.setItem(outputLevelStorageKey, String(outputLevel));
    } catch {
      // ignore
    }
  }, [outputLevel]);

  useEffect(() => {
    if (!activeVoiceChannelId || !meSummary?.id) return;
    void updateVoiceState({
      muted: micMuted,
      deafened: incomingMuted,
    }).catch((err) => {
      console.error("Failed to update voice state", err);
    });
  }, [activeVoiceChannelId, incomingMuted, micMuted, meSummary?.id]);

  const setSpaceVoiceChannels = useCallback(
    (spaceId: string, channelIds: string[]) => {
      const existing = voiceChannelIdsBySpaceIdRef.current[spaceId];
      if (
        existing &&
        existing.length === channelIds.length &&
        existing.every((id, idx) => id === channelIds[idx])
      ) {
        return;
      }
      voiceChannelIdsBySpaceIdRef.current = {
        ...voiceChannelIdsBySpaceIdRef.current,
        [spaceId]: channelIds,
      };
    },
    [],
  );

  const joinVoiceChannel = useCallback(
    async (
      spaceId: string,
      channelId: string,
      channelName?: string,
      spaceName?: string,
    ) => {
      if (!channelId) return;
      if (channelId === activeVoiceChannelId) return;
      if (activeVoiceChannelId) {
        switchingChannelRef.current = true;
      }
      setVoiceFatalError(null);
      setScreenShareEnabled(false);
      setLocalScreenStream(null);
      setScreenStreamsByFeedId({});
      setScreenShares([]);
      setSelectedScreenFeedId(null);
      setFocusedUserId(null);
      setConnectionQuality("unknown");
      setVoicePanelExpanded(true);
      try {
        await joinVoiceChannelById(channelId);
        setActiveVoiceChannelId(channelId);
        setActiveVoiceChannelName(channelName ?? "");
        setActiveVoiceSpaceId(spaceId);
        setActiveVoiceSpaceName(spaceName ?? "");
        setVoiceReady(false);
        voicePeerFeedsRef.current.clear();
        setVoicePeerReady(false);
        if (meSummary?.id) {
          setVoiceMembersByChannelId((prev) => {
            const next: Record<string, VoiceMember[]> = {};
            for (const [cid, members] of Object.entries(prev)) {
              next[cid] = members.filter((m) => m.id !== meSummary.id);
            }
            const current = next[channelId] ?? prev[channelId] ?? [];
            next[channelId] = [
              ...current.filter((m) => m.id !== meSummary.id),
              meSummary,
            ];
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to join voice channel", err);
      }
    },
    [activeVoiceChannelId, meSummary],
  );

  const syncCurrentVoiceMember = useCallback(
    (nextMuted: boolean, nextDeafened: boolean) => {
      if (!activeVoiceChannelId || !meSummary?.id) return;

      setVoiceMembersByChannelId((prev) => {
        const members = prev[activeVoiceChannelId];
        if (!members) return prev;

        const nextMembers = members.map((member) =>
          member.id === meSummary.id
            ? { ...member, muted: nextMuted, deafened: nextDeafened }
            : member,
        );

        return { ...prev, [activeVoiceChannelId]: nextMembers };
      });
    },
    [activeVoiceChannelId, meSummary],
  );

  const setPttEnabled = useCallback((value: boolean) => {
    setPttEnabledState(value);
    if (!value) {
      setPttActive(false);
    }
  }, []);

  const setPttKey = useCallback((value: string) => {
    setPttKeyState(value);
  }, []);

  const setMicMuted = useCallback(
    (value: boolean) => {
      setMicMutedState(value);
      syncCurrentVoiceMember(value, incomingMuted);
    },
    [incomingMuted, syncCurrentVoiceMember],
  );

  const setIncomingMuted = useCallback(
    (value: boolean) => {
      setIncomingMutedState(value);
      syncCurrentVoiceMember(micMuted, value);
    },
    [micMuted, syncCurrentVoiceMember],
  );

  const resetVoiceState = useCallback(() => {
    setVoiceFatalError(null);
    setActiveVoiceChannelId(null);
    setActiveVoiceChannelName("");
    setActiveVoiceSpaceId(null);
    setActiveVoiceSpaceName("");
    setScreenShareEnabled(false);
    setLocalScreenStream(null);
    setScreenStreamsByFeedId({});
    setScreenShares([]);
    setSelectedScreenFeedId(null);
    setFocusedUserId(null);
    setConnectionQuality("unknown");
    setVoiceReady(false);
    setVoiceSpeakingByUserId({});
    voicePeerFeedsRef.current.clear();
    setVoicePeerReady(false);
    setVoicePanelExpanded(false);
    if (meSummary) {
      setVoiceMembersByChannelId((prev) => {
        const next: Record<string, VoiceMember[]> = {};
        for (const [cid, members] of Object.entries(prev)) {
          next[cid] = members.filter((m) => m.id !== meSummary.id);
        }
        return next;
      });
    }
  }, [meSummary]);

  const leaveVoiceChannelSafe = useCallback(async () => {
    let success = false;
    try {
      await leaveVoiceChannel();
      success = true;
    } catch (err) {
      console.error("Failed to leave voice channel", err);
    }
    if (success) resetVoiceState();
  }, [resetVoiceState]);

  const handleSpeaking = useCallback((userId: string, speaking: boolean) => {
    if (speaking) lastActiveSpeakerIdRef.current = userId;
    setVoiceSpeakingByUserId((prev) => {
      if (prev[userId] === speaking) return prev;
      return { ...prev, [userId]: speaking };
    });
  }, []);

  const handleConnectionQuality = useCallback((quality: ConnectionQuality) => {
    setConnectionQuality(quality);
  }, []);

  const autoReconnectDone = useRef(false);
  useEffect(() => {
    if (autoReconnectDone.current) return;
    if (activeVoiceChannelId) {
      autoReconnectDone.current = true;
      return;
    }
    const myId = meSummary?.id;
    if (!myId) return;
    const entries = Object.entries(voiceMembersByChannelId);
    if (!entries.length) return;

    const found = entries.find(([, members]) => members.some((m) => m.id === myId));
    if (!found) {
      autoReconnectDone.current = true;
      return;
    }

    const channelId = found[0];
    joinVoiceChannelById(channelId)
      .then(() => {
        setActiveVoiceChannelId(channelId);
        autoReconnectDone.current = true;
      })
      .catch((err) => {
        console.error("Auto-reconnect join failed", err);
        autoReconnectDone.current = true;
      });
  }, [activeVoiceChannelId, meSummary?.id, voiceMembersByChannelId]);

  const handleToggleScreenShare = useCallback(() => {
    setScreenShareEnabled((v) => !v);
  }, []);

  const handleLocalScreenStream = useCallback((stream: MediaStream | null) => {
    setLocalScreenStream(stream);
  }, []);

  const handleRemoteScreenStream = useCallback(
    (feedId: string, _userId: string, stream: MediaStream) => {
      setScreenStreamsByFeedId((prev) => ({ ...prev, [feedId]: stream }));
    },
    [],
  );

  const handleRemoteScreenStreamRemoved = useCallback((feedId: string) => {
    setScreenStreamsByFeedId((prev) => {
      if (!prev[feedId]) return prev;
      const next = { ...prev };
      delete next[feedId];
      return next;
    });
    setSelectedScreenFeedId((prev) => (prev === feedId ? null : prev));
  }, []);

  const handleScreenSharesChange = useCallback((shares: ScreenShareInfo[]) => {
    setScreenShares(shares);
    setSelectedScreenFeedId((prev) => {
      if (!prev) return prev;
      if (prev === "local") return prev;
      return shares.some((s) => s.feedId === prev) ? prev : null;
    });
  }, []);

  const handleScreenShareStateChange = useCallback((active: boolean) => {
    setScreenShareEnabled(active);
    if (!active) setLocalScreenStream(null);
  }, []);

  const handleWatchScreen = useCallback((feedId: string) => {
    setSelectedScreenFeedId(feedId);
    setFocusedUserId(null);
    autoFocusedUserIdRef.current = null;
  }, []);

  const handleLeaveScreen = useCallback(() => {
    setSelectedScreenFeedId(null);
  }, []);

  const handleFocusUser = useCallback((userId: string | null) => {
    lastManualFocusAtRef.current = Date.now();
    setFocusedUserId(userId);
    setSelectedScreenFeedId(null);
    autoFocusedUserIdRef.current = null;
  }, []);

  const handleToggleUserMute = useCallback((userId: string) => {
    setMutedUserIds((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }, []);

  const handleVolumeChange = useCallback((userId: string, volume: number) => {
    setVolumeByUserId((prev) => ({
      ...prev,
      [userId]: Math.max(0, Math.min(1, volume)),
    }));
  }, []);

  const subscribeToEvents = useCallback((listener: EventsListener) => {
    eventListenersRef.current.add(listener);

    return () => {
      eventListenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!voicePanelExpanded) return;
    if (selectedScreenFeedId) return;
    const lastSpeaker = lastActiveSpeakerIdRef.current;
    if (!lastSpeaker) return;
    if (!voiceSpeakingByUserId[lastSpeaker]) return;
    const sinceManual = Date.now() - lastManualFocusAtRef.current;
    if (sinceManual < 6000) return;
    if (focusedUserId === lastSpeaker) return;
    const timer = window.setTimeout(() => {
      setFocusedUserId(lastSpeaker);
      autoFocusedUserIdRef.current = lastSpeaker;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [voicePanelExpanded, selectedScreenFeedId, voiceSpeakingByUserId, focusedUserId]);

  useEffect(() => {
    if (!voicePanelExpanded) return;
    if (selectedScreenFeedId) return;
    const autoFocused = autoFocusedUserIdRef.current;
    if (!autoFocused) return;
    if (focusedUserId !== autoFocused) return;
    if (voiceSpeakingByUserId[autoFocused]) return;
    const timer = window.setTimeout(() => {
      setFocusedUserId(null);
      autoFocusedUserIdRef.current = null;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [voicePanelExpanded, selectedScreenFeedId, voiceSpeakingByUserId, focusedUserId]);

  const handleVoiceSubscriberReady = useCallback((feedId: string) => {
    if (!feedId) return;
    if (voicePeerFeedsRef.current.has(feedId)) return;
    voicePeerFeedsRef.current.add(feedId);
    setVoicePeerReady(true);
  }, []);

  const handleVoiceSubscriberRemoved = useCallback((feedId: string) => {
    if (!feedId) return;
    if (!voicePeerFeedsRef.current.delete(feedId)) return;
    if (voicePeerFeedsRef.current.size === 0) {
      setVoicePeerReady(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let retryMs = 500;
    let recoveringAuth = false;

    const connect = () => {
      if (cancelled) return;
      const url = buildWebSocketUrl("/api/ws/events");
      ws = new WebSocket(url);

      ws.onopen = () => {
        retryMs = 500;
      };

      ws.onmessage = (ev) => {
        let msg: EventsEnvelope;
        try {
          msg = JSON.parse(String(ev.data)) as EventsEnvelope;
        } catch {
          return;
        }
        for (const listener of eventListenersRef.current) {
          listener(msg);
        }
        if (msg?.type === "error") {
          const payload = msg.payload as { message?: string } | undefined;
          if (payload?.message === "unauthorized" && !recoveringAuth) {
            recoveringAuth = true;
            void recoverSessionOrRedirect().finally(() => {
              recoveringAuth = false;
            });
          }
          return;
        }
        if (msg?.type === "voice.snapshot") {
          const payload = msg.payload as
            | {
                voice_members_by_channel_id?: Record<string, VoiceMember[]>;
                channel_revisions_by_id?: Record<string, number>;
              }
            | undefined;
          const map = payload?.voice_members_by_channel_id;
          const revisions = payload?.channel_revisions_by_id;
          if (map && typeof map === "object") {
            setVoiceMembersByChannelId((prev) => {
              let changed = false;
              const next = { ...prev };

              for (const [channelId, members] of Object.entries(map)) {
                const revision = revisions?.[channelId] ?? 0;
                const currentRevision =
                  voiceChannelRevisionByIdRef.current[channelId] ?? 0;
                if (revision < currentRevision) {
                  continue;
                }

                voiceChannelRevisionByIdRef.current[channelId] = revision;
                next[channelId] = members;
                changed = true;
              }

              return changed ? next : prev;
            });
          }
          return;
        }
        if (msg?.type === "voice.channel_members") {
          const payload = msg.payload as
            | { channel_id?: string; members?: VoiceMember[]; revision?: number }
            | undefined;
          const channelId = payload?.channel_id;
          const members = payload?.members;
          const revision = payload?.revision ?? 0;
          if (!channelId || !Array.isArray(members)) return;
          setVoiceMembersByChannelId((prev) => {
            const currentRevision =
              voiceChannelRevisionByIdRef.current[channelId] ?? 0;
            if (revision < currentRevision) {
              return prev;
            }

            voiceChannelRevisionByIdRef.current[channelId] = revision;
            return { ...prev, [channelId]: members };
          });
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        retryTimer = window.setTimeout(() => {
          retryMs = Math.min(8000, Math.round(retryMs * 1.6));
          connect();
        }, retryMs);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (!activeVoiceChannelId || !meSummary?.id) return;

    const sendHeartbeat = () => {
      void sendVoiceHeartbeat().catch((err) => {
        if (getHttpStatus(err) === 401) {
          return;
        }
        console.error("Failed to send voice heartbeat", err);
      });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeVoiceChannelId, meSummary?.id]);

  const contextValue = useMemo<VoiceSessionContextValue>(
    () => ({
      activeVoiceChannelId,
      activeVoiceChannelName,
      activeVoiceSpaceId,
      activeVoiceSpaceName,
      voiceMembersByChannelId,
      voiceSpeakingByUserId,
      voiceFatalError,
      screenShareEnabled,
      localScreenStream,
      screenStreamsByFeedId,
      screenShares,
      selectedScreenFeedId,
      focusedUserId,
      connectionQuality,
      voicePanelExpanded,
      voiceReady,
      voicePeerReady,
      pttAvailable,
      pttEnabled,
      pttActive,
      pttKey,
      capturingPttKey,
      micMuted,
      incomingMuted,
      mutedUserIds,
      volumeByUserId,
      micEnabled,
      audioInputDeviceId,
      audioOutputDeviceId,
      micLevel,
      outputLevel,
      meSummary,
      setSpaceVoiceChannels,
      joinVoiceChannel,
      leaveVoiceChannel: leaveVoiceChannelSafe,
      setActiveVoiceSpaceName,
      setVoicePanelExpanded,
      setCapturingPttKey,
      setPttEnabled,
      setPttKey,
      setMicMuted,
      setIncomingMuted,
      setAudioInputDeviceId,
      setAudioOutputDeviceId,
      setMicLevel,
      setOutputLevel,
      toggleScreenShare: handleToggleScreenShare,
      watchScreen: handleWatchScreen,
      leaveScreen: handleLeaveScreen,
      focusUser: handleFocusUser,
      toggleUserMute: handleToggleUserMute,
      setVolume: handleVolumeChange,
      clearVoiceFatalError: () => setVoiceFatalError(null),
      subscribeToEvents,
    }),
    [
      activeVoiceChannelId,
      activeVoiceChannelName,
      activeVoiceSpaceId,
      activeVoiceSpaceName,
      voiceMembersByChannelId,
      voiceSpeakingByUserId,
      voiceFatalError,
      screenShareEnabled,
      localScreenStream,
      screenStreamsByFeedId,
      screenShares,
      selectedScreenFeedId,
      focusedUserId,
      connectionQuality,
      voicePanelExpanded,
      voiceReady,
      voicePeerReady,
      pttAvailable,
      pttEnabled,
      pttActive,
      pttKey,
      capturingPttKey,
      micMuted,
      incomingMuted,
      mutedUserIds,
      volumeByUserId,
      micEnabled,
      audioInputDeviceId,
      audioOutputDeviceId,
      micLevel,
      outputLevel,
      meSummary,
      setSpaceVoiceChannels,
      joinVoiceChannel,
      leaveVoiceChannelSafe,
      setActiveVoiceSpaceName,
      setVoicePanelExpanded,
      setCapturingPttKey,
      setPttEnabled,
      setPttKey,
      setMicMuted,
      setIncomingMuted,
      setAudioInputDeviceId,
      setAudioOutputDeviceId,
      setMicLevel,
      setOutputLevel,
      handleToggleScreenShare,
      handleWatchScreen,
      handleLeaveScreen,
      handleFocusUser,
      handleToggleUserMute,
      handleVolumeChange,
      subscribeToEvents,
    ],
  );

  return (
    <VoiceSessionContext.Provider value={contextValue}>
      {children}
      <VoiceWebRTC
        channelId={activeVoiceChannelId}
        onSpeaking={handleSpeaking}
        selfUserId={meSummary?.id ?? null}
        micEnabled={micEnabled}
        onLocalScreenStream={handleLocalScreenStream}
        onRemoteScreenStream={handleRemoteScreenStream}
        onRemoteScreenStreamRemoved={handleRemoteScreenStreamRemoved}
        onScreenSharesChange={handleScreenSharesChange}
        onConnectionQuality={handleConnectionQuality}
        screenShareEnabled={screenShareEnabled}
        onScreenShareStateChange={handleScreenShareStateChange}
        watchFeedId={selectedScreenFeedId === "local" ? null : selectedScreenFeedId}
        volumeByUserId={volumeByUserId}
        mutedUserIds={mutedUserIds}
        outputMuted={incomingMuted}
        inputDeviceId={audioInputDeviceId}
        outputDeviceId={audioOutputDeviceId}
        micLevel={micLevel}
        outputLevel={outputLevel}
        onVoiceSubscriberReady={handleVoiceSubscriberReady}
        onVoiceSubscriberRemoved={handleVoiceSubscriberRemoved}
        onReady={() => setVoiceReady(true)}
        onFatalError={(message) => {
          console.error("Voice fatal error", message);
          setVoiceFatalError(message);
          leaveVoiceChannel()
            .catch(() => {})
            .finally(() => resetVoiceState());
        }}
      />
    </VoiceSessionContext.Provider>
  );
}

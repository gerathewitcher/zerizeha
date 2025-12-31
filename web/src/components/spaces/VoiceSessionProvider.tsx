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
import { buildWebSocketUrl } from "@/lib/api/ws";
import {
  fetchVoiceMembers,
  joinVoiceChannelById,
  leaveVoiceChannel,
  updateVoiceState,
} from "@/lib/api/voice";
import { useMe } from "@/lib/me";
import type { VoiceMember } from "@/lib/api/generated/zerizeha-schemas";

type ConnectionQuality = "good" | "ok" | "bad" | "unknown";
type ScreenShareInfo = { feedId: string; userId: string };

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
  const [observedSpaceId, setObservedSpaceId] = useState<string | null>(null);
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
  const [pttAvailable, setPttAvailable] = useState(false);
  const [pttEnabled, setPttEnabled] = useState(false);
  const [pttActive, setPttActive] = useState(false);
  const [pttKey, setPttKey] = useState("KeyV");
  const [capturingPttKey, setCapturingPttKey] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [incomingMuted, setIncomingMuted] = useState(false);
  const [mutedUserIds, setMutedUserIds] = useState<Record<string, boolean>>({});
  const [volumeByUserId, setVolumeByUserId] = useState<Record<string, number>>(
    {},
  );
  const [audioInputDeviceId, setAudioInputDeviceId] = useState<string | null>(
    null,
  );
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState<string | null>(
    null,
  );
  const [micLevel, setMicLevel] = useState(1);
  const [outputLevel, setOutputLevel] = useState(1);
  const [voiceChannelIdsBySpaceId, setVoiceChannelIdsBySpaceId] = useState<
    Record<string, string[]>
  >({});
  const lastManualFocusAtRef = useRef(0);
  const lastActiveSpeakerIdRef = useRef<string | null>(null);
  const autoFocusedUserIdRef = useRef<string | null>(null);
  const joinSoundRef = useRef<HTMLAudioElement | null>(null);
  const leaveSoundRef = useRef<HTMLAudioElement | null>(null);
  const prevChannelRef = useRef<string | null>(null);
  const prevMembersRef = useRef<Set<string> | null>(null);
  const lastJoinSoundAtRef = useRef(0);
  const lastLeaveSoundAtRef = useRef(0);
  const switchingChannelRef = useRef(false);
  const suppressMemberSoundsUntilRef = useRef(0);

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
    if (typeof window === "undefined") return;
    if (!window.electron?.ptt) return;
    setPttAvailable(true);
    try {
      const storedKey = window.localStorage.getItem(pttKeyStorageKey);
      if (storedKey) setPttKey(storedKey);
      const storedEnabled = window.localStorage.getItem(pttEnabledStorageKey);
      if (storedEnabled === "true") setPttEnabled(true);
    } catch {
      // ignore
    }
  }, []);

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
    if (!pttEnabled) setPttActive(false);
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
      setPttKey(ev.code);
      setCapturingPttKey(false);
    };
    const mouseHandler = (ev: MouseEvent) => {
      if (ev.button === 3) {
        ev.preventDefault();
        setPttKey("Mouse4");
        setCapturingPttKey(false);
      } else if (ev.button === 4) {
        ev.preventDefault();
        setPttKey("Mouse5");
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
      const raw = window.localStorage.getItem(volumeStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (parsed && typeof parsed === "object") {
        setVolumeByUserId(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(volumeStorageKey, JSON.stringify(volumeByUserId));
    } catch {
      // ignore
    }
  }, [volumeByUserId]);

  useEffect(() => {
    try {
      const inputId = window.localStorage.getItem(audioInputStorageKey);
      const outputId = window.localStorage.getItem(audioOutputStorageKey);
      const micRaw = window.localStorage.getItem(micLevelStorageKey);
      const outRaw = window.localStorage.getItem(outputLevelStorageKey);
      if (inputId) setAudioInputDeviceId(inputId);
      if (outputId) setAudioOutputDeviceId(outputId);
      if (micRaw) {
        const value = Number(micRaw);
        if (Number.isFinite(value)) setMicLevel(Math.max(0, Math.min(1, value)));
      }
      if (outRaw) {
        const value = Number(outRaw);
        if (Number.isFinite(value)) setOutputLevel(Math.max(0, Math.min(1, value)));
      }
    } catch {
      // ignore
    }
  }, []);

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
    setVoiceMembersByChannelId((prev) => {
      const members = prev[activeVoiceChannelId];
      if (!members) return prev;
      const next = members.map((member) =>
        member.id === meSummary.id
          ? { ...member, muted: micMuted, deafened: incomingMuted }
          : member,
      );
      return { ...prev, [activeVoiceChannelId]: next };
    });
  }, [activeVoiceChannelId, incomingMuted, micMuted, meSummary?.id]);

  const setSpaceVoiceChannels = useCallback(
    (spaceId: string, channelIds: string[]) => {
      setVoiceChannelIdsBySpaceId((prev) => {
        const existing = prev[spaceId];
        if (
          existing &&
          existing.length === channelIds.length &&
          existing.every((id, idx) => id === channelIds[idx])
        ) {
          return prev;
        }
        return {
          ...prev,
          [spaceId]: channelIds,
        };
      });
      setObservedSpaceId((prev) => (prev === spaceId ? prev : spaceId));
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
    setVoicePanelExpanded(false);
    if (meSummary?.id) {
      setVoiceMembersByChannelId((prev) => {
        const next: Record<string, VoiceMember[]> = {};
        for (const [cid, members] of Object.entries(prev)) {
          next[cid] = members.filter((m) => m.id !== meSummary.id);
        }
        return next;
      });
    }
  }, [meSummary?.id]);

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

  useEffect(() => {
    if (!voicePanelExpanded) return;
    if (selectedScreenFeedId) return;
    const lastSpeaker = lastActiveSpeakerIdRef.current;
    if (!lastSpeaker) return;
    if (!voiceSpeakingByUserId[lastSpeaker]) return;
    const sinceManual = Date.now() - lastManualFocusAtRef.current;
    if (sinceManual < 6000) return;
    if (focusedUserId === lastSpeaker) return;
    setFocusedUserId(lastSpeaker);
    autoFocusedUserIdRef.current = lastSpeaker;
  }, [voicePanelExpanded, selectedScreenFeedId, voiceSpeakingByUserId, focusedUserId]);

  useEffect(() => {
    if (!voicePanelExpanded) return;
    if (selectedScreenFeedId) return;
    const autoFocused = autoFocusedUserIdRef.current;
    if (!autoFocused) return;
    if (focusedUserId !== autoFocused) return;
    if (voiceSpeakingByUserId[autoFocused]) return;
    setFocusedUserId(null);
    autoFocusedUserIdRef.current = null;
  }, [voicePanelExpanded, selectedScreenFeedId, voiceSpeakingByUserId, focusedUserId]);

  useEffect(() => {
    if (!activeVoiceChannelId) setVoiceSpeakingByUserId({});
    if (!activeVoiceChannelId) setVoiceReady(false);
  }, [activeVoiceChannelId]);

  const observedVoiceChannelIds = useMemo(() => {
    if (!observedSpaceId) return [];
    return voiceChannelIdsBySpaceId[observedSpaceId] ?? [];
  }, [observedSpaceId, voiceChannelIdsBySpaceId]);

  const activeVoiceChannelIds = useMemo(() => {
    if (!activeVoiceSpaceId) return [];
    return voiceChannelIdsBySpaceId[activeVoiceSpaceId] ?? [];
  }, [activeVoiceSpaceId, voiceChannelIdsBySpaceId]);

  useEffect(() => {
    if (!observedSpaceId) return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let retryMs = 500;

    const connect = () => {
      if (cancelled) return;
      const url = buildWebSocketUrl(`/api/ws/voice/${observedSpaceId}`);
      ws = new WebSocket(url);

      ws.onopen = async () => {
        retryMs = 500;
        try {
          if (!observedVoiceChannelIds.length) return;
          const controller = new AbortController();
          const results = await Promise.all(
            observedVoiceChannelIds.map((id) =>
              fetchVoiceMembers(id, controller.signal),
            ),
          );
          const next: Record<string, VoiceMember[]> = {};
          observedVoiceChannelIds.forEach((id, idx) => {
            next[id] = results[idx];
          });
          setVoiceMembersByChannelId((prev) => ({ ...prev, ...next }));
        } catch {
          // ignore
        }
      };

      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg?.type === "snapshot") {
          const map = msg?.payload?.voice_members_by_channel_id;
          if (map && typeof map === "object") {
            setVoiceMembersByChannelId((prev) => ({ ...prev, ...map }));
          }
          return;
        }
        if (msg?.type === "channel_members") {
          const channelId = msg?.payload?.channel_id;
          const members = msg?.payload?.members;
          if (!channelId || !Array.isArray(members)) return;
          setVoiceMembersByChannelId((prev) => ({ ...prev, [channelId]: members }));
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
  }, [observedSpaceId, observedVoiceChannelIds]);

  useEffect(() => {
    if (!activeVoiceSpaceId) return;
    if (activeVoiceSpaceId === observedSpaceId) return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let retryMs = 500;

    const connect = () => {
      if (cancelled) return;
      const url = buildWebSocketUrl(`/api/ws/voice/${activeVoiceSpaceId}`);
      ws = new WebSocket(url);

      ws.onopen = async () => {
        retryMs = 500;
        try {
          if (!activeVoiceChannelIds.length) return;
          const controller = new AbortController();
          const results = await Promise.all(
            activeVoiceChannelIds.map((id) =>
              fetchVoiceMembers(id, controller.signal),
            ),
          );
          const next: Record<string, VoiceMember[]> = {};
          activeVoiceChannelIds.forEach((id, idx) => {
            next[id] = results[idx];
          });
          setVoiceMembersByChannelId((prev) => ({ ...prev, ...next }));
        } catch {
          // ignore
        }
      };

      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg?.type === "snapshot") {
          const map = msg?.payload?.voice_members_by_channel_id;
          if (map && typeof map === "object") {
            setVoiceMembersByChannelId((prev) => ({ ...prev, ...map }));
          }
          return;
        }
        if (msg?.type === "channel_members") {
          const channelId = msg?.payload?.channel_id;
          const members = msg?.payload?.members;
          if (!channelId || !Array.isArray(members)) return;
          setVoiceMembersByChannelId((prev) => ({ ...prev, [channelId]: members }));
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
  }, [activeVoiceSpaceId, activeVoiceChannelIds, observedSpaceId]);

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

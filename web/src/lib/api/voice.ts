"use client";

import {
  joinVoiceChannel,
  leaveVoice,
  listVoiceMembers,
  voiceWebRTCBootstrap,
  voiceHeartbeat,
} from "@/lib/api/generated/zerizeha-components";
import { zerizehaFetch } from "@/lib/api/generated/zerizeha-fetcher";
import type { VoiceMember } from "@/lib/api/generated/zerizeha-schemas";
import type { WebRTCBootstrapResponse } from "@/lib/api/generated/zerizeha-schemas";

export async function joinVoiceChannelById(
  channelId: string,
  signal?: AbortSignal,
): Promise<void> {
  await joinVoiceChannel({ pathParams: { id: channelId } }, signal);
}

export async function leaveVoiceChannel(signal?: AbortSignal): Promise<void> {
  await leaveVoice({}, signal);
}

export async function sendVoiceHeartbeat(
  signal?: AbortSignal,
): Promise<void> {
  await voiceHeartbeat({}, signal);
}

export async function fetchVoiceMembers(
  channelId: string,
  signal?: AbortSignal,
): Promise<VoiceMember[]> {
  return listVoiceMembers({ pathParams: { id: channelId } }, signal);
}

export async function bootstrapVoiceWebRTC(
  channelId: string,
  signal?: AbortSignal,
): Promise<WebRTCBootstrapResponse> {
  return voiceWebRTCBootstrap({ pathParams: { id: channelId } }, signal);
}

export async function updateVoiceState(
  state: { muted: boolean; deafened: boolean },
  signal?: AbortSignal,
): Promise<void> {
  await zerizehaFetch({
    url: "/api/voice/state",
    method: "POST",
    body: state,
    signal,
  });
}

import {
  members,
  messages,
  spaces,
  textChannels,
  voiceChannels,
  voicePresence,
  type Member,
  type Message,
  type Space,
} from "@/lib/mock";

export type SpaceChannels = {
  text: string[];
  voice: string[];
};

export type VoicePresence = Record<string, string[]>;

export async function getSpaces(): Promise<Space[]> {
  return Promise.resolve(spaces);
}

export async function getSpace(spaceId: string): Promise<Space | undefined> {
  return Promise.resolve(spaces.find((space) => space.id === spaceId));
}

export async function getChannels(): Promise<SpaceChannels> {
  return Promise.resolve({ text: textChannels, voice: voiceChannels });
}

export async function getMessages(): Promise<Message[]> {
  return Promise.resolve(messages);
}

export async function getMembers(): Promise<Member[]> {
  return Promise.resolve(members);
}

export async function getVoicePresence(): Promise<VoicePresence> {
  return Promise.resolve(voicePresence);
}

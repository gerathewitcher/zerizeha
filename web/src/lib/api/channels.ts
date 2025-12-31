import {
  createChannel,
  deleteChannel,
  listChannelsBySpace,
  updateChannel,
  type ListChannelsBySpaceResponse,
} from "@/lib/api/generated/zerizeha-components";
import type { ChannelToCreate } from "@/lib/api/generated/zerizeha-schemas";

export async function fetchChannelsBySpaceId(
  spaceId: string,
  signal?: AbortSignal,
): Promise<ListChannelsBySpaceResponse> {
  return listChannelsBySpace({ pathParams: { id: spaceId } }, signal);
}

export async function createChannelInSpace(
  body: ChannelToCreate,
  signal?: AbortSignal,
): Promise<string> {
  const res = await createChannel({ body }, signal);
  return res.id;
}

export async function updateChannelName(
  channelId: string,
  name: string,
  signal?: AbortSignal,
): Promise<void> {
  await updateChannel({ pathParams: { id: channelId }, body: { name } }, signal);
}

export async function deleteChannelById(
  channelId: string,
  signal?: AbortSignal,
): Promise<void> {
  await deleteChannel({ pathParams: { id: channelId } }, signal);
}

import {
  createChannel,
  listChannelsBySpace,
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

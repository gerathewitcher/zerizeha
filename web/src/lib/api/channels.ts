import {
  listChannelsBySpace,
  type ListChannelsBySpaceResponse,
} from "@/lib/api/generated/zerizeha-components";

export async function fetchChannelsBySpaceId(
  spaceId: string,
  signal?: AbortSignal,
): Promise<ListChannelsBySpaceResponse> {
  return listChannelsBySpace({ pathParams: { id: spaceId } }, signal);
}


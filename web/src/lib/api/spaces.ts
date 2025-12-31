import {
  createSpace,
  getSpaceByID,
  listSpaces,
  updateSpace,
  type ListSpacesResponse,
} from "@/lib/api/generated/zerizeha-components";
import type { Space } from "@/lib/api/generated/zerizeha-schemas";

export async function fetchSpaces(
  signal?: AbortSignal,
): Promise<ListSpacesResponse> {
  return listSpaces({}, signal);
}

export async function fetchSpaceById(
  spaceId: string,
  signal?: AbortSignal,
): Promise<Space> {
  return getSpaceByID({ pathParams: { id: spaceId } }, signal);
}

export async function createSpaceByName(
  name: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await createSpace({ body: { name } }, signal);
  return res.id;
}

export async function updateSpaceName(
  spaceId: string,
  name: string,
  signal?: AbortSignal,
): Promise<void> {
  await updateSpace({ pathParams: { id: spaceId }, body: { name } }, signal);
}

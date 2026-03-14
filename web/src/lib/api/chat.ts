import {
  createChannelMessage,
  listChannelMessages,
} from "@/lib/api/generated/zerizeha-components";
import type {
  ChannelMessage,
  ChannelMessagesPage,
} from "@/lib/api/generated/zerizeha-schemas";

export async function fetchChannelMessages(
  channelId: string,
  options?: {
    cursor?: string;
    limit?: number;
  },
  signal?: AbortSignal,
): Promise<ChannelMessagesPage> {
  const queryParams: { limit: number; cursor?: string } = {
    limit: options?.limit ?? 50,
  };

  if (options?.cursor) {
    queryParams.cursor = options.cursor;
  }

  return listChannelMessages(
    {
      pathParams: { id: channelId },
      queryParams,
    },
    signal,
  );
}

export async function sendChannelMessage(
  channelId: string,
  body: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await createChannelMessage(
    {
      pathParams: { id: channelId },
      body: { body },
    },
    signal,
  );

  return response.id;
}

export function mergeChannelMessages(
  current: ChannelMessage[],
  incoming: ChannelMessage,
): ChannelMessage[] {
  if (current.some((message) => message.id === incoming.id)) {
    return current;
  }

  return [...current, incoming];
}

export function prependChannelMessages(
  current: ChannelMessage[],
  incoming: ChannelMessage[],
): ChannelMessage[] {
  if (!incoming.length) {
    return current;
  }

  const existingIds = new Set(current.map((message) => message.id));
  const nextItems = incoming.filter((message) => !existingIds.has(message.id));

  if (!nextItems.length) {
    return current;
  }

  return [...nextItems, ...current];
}

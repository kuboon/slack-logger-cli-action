import settings from "../settings.ts";
import { SlackAPIClient as WebClient } from "@seratch/slack-web-api-client";

export const slack = new WebClient(settings.slack.token);

export type Member = NonNullable<
  Awaited<ReturnType<typeof slack.users.list>>["members"]
>[number];

export type Message = NonNullable<
  Awaited<ReturnType<typeof slack.conversations.history>>["messages"]
>[number];

export async function* channelsIt() {
  let cursor: string | undefined;
  do {
    const res = await slack.conversations.list({
      cursor,
      types: ["public_channel"],
    });
    cursor = res!.response_metadata?.next_cursor;
    for (const c of res!.channels!) {
      if (settings.skipChannels.includes(c.id!)) continue;
      if (
        settings.autoJoin && !c.is_member && !c.is_private && !c.is_archived
      ) {
        await slack.conversations.join({ channel: c.id! });
        c.is_member = true;
        yield c;
      } else if (c.is_member) {
        yield c;
      }
    }
  } while (cursor);
}

export async function fetchReplies(
  channel: string,
  ts: string,
): Promise<Message[]> {
  const messages: Message[] = [];
  let cursor: string | undefined;
  do {
    const res = await slack.conversations.replies({
      channel,
      cursor,
      ts,
    });
    cursor = res!.response_metadata?.next_cursor;
    const resMessages = res!.messages! || [];
    for (const m of resMessages) {
      if (m.ts !== ts) {
        messages.push(m);
      }
    }
  } while (cursor);
  return messages;
}

export async function fetchHistory(
  channel: string,
  oldest: string,
  latest: string,
): Promise<Message[]> {
  const allMessages: Message[] = [];
  let cursor: string | undefined;

  do {
    const res = await slack.conversations.history({
      channel,
      cursor,
      oldest,
      latest,
    });
    cursor = res!.response_metadata?.next_cursor;
    const messages = res!.messages! || [];

    for (const msg of messages) {
      allMessages.push(msg);

      if (msg.reply_count) {
        const reps = await fetchReplies(channel, msg.ts!);
        allMessages.push(...reps);
      }
    }
  } while (cursor);

  // sort messages by ts (oldest to latest)
  allMessages.sort((a, b) => parseFloat(a.ts!) - parseFloat(b.ts!));

  return allMessages;
}

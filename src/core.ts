import { channelsIt, historyIt, Message, MessageProcessor } from "./lib/slack.ts";
import { Timestamp } from "./lib/timestamp.ts";
import { ObjError } from "./lib/objError.ts";
import type { MsgJson } from "./lib/types.ts";

export { channelsIt, historyIt, MessageProcessor };
export type { MsgJson };

export function msgToJson(msg: Message, p: MessageProcessor): MsgJson {
  const { ts, user, text, ...rest } = msg;
  const threadMark = msg.reply_count ? "+" : msg.parent_user_id ? ">" : "";

  try {
    return {
      threadMark,
      timestamp: Timestamp.fromSlack(ts!)!,
      username: p.username(user) || rest.username || "",
      text: p.readable(text) || rest.attachments?.[0].fallback || "",
      rest: JSON.stringify(rest),
    };
  } catch (e) {
    ObjError.throw(`${ts} ${user} ${text}`, e);
  }
}

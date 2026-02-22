import { Message, MessageProcessor } from "./slack.ts";
import { Timestamp } from "./timestamp.ts";

export type MessageRecord = {
  thread: string;
  ts: string;
  user: string;
  text: string;
};

export function msgToRecord(msg: Message, p: MessageProcessor): MessageRecord {
  const { ts, user, text, ...rest } = msg;
  const threadMark = msg.reply_count ? "+" : msg.parent_user_id ? ">" : "";
  return {
    thread: threadMark,
    ts: ts!,
    user: p.username(user) || rest.username || "",
    text: p.readable(text) || rest.attachments?.[0]?.fallback || "",
  };
}

export function recordsToJson(
  channels: { name: string; records: MessageRecord[] }[],
): string {
  const output = channels.map(({ name, records }) => ({
    channel: name,
    messages: records.map((r) => ({
      thread: r.thread,
      datetime: Timestamp.fromSlack(r.ts)!.toISOString(),
      user: r.user,
      text: r.text,
    })),
  }));
  return JSON.stringify(output, null, 2);
}

export function recordsToMarkdown(
  channels: { name: string; records: MessageRecord[] }[],
  tz: string,
): string {
  const lines: string[] = [];
  for (const { name, records } of channels) {
    if (records.length === 0) continue;
    lines.push(`# #${name}`);
    lines.push("");
    let lastDate = "";
    for (const r of records) {
      const ts = Timestamp.fromSlack(r.ts)!;
      const date = ts.date(tz);
      if (date !== lastDate) {
        if (lastDate !== "") lines.push("");
        lines.push(`## ${date}`);
        lines.push("");
        lastDate = date;
      }
      const time = ts.hourMin(tz);
      const indent = r.thread === ">" ? "  " : "";
      const prefix = r.thread ? `${r.thread} ` : "";
      lines.push(`${indent}${time} ${prefix}${r.user}: ${r.text}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

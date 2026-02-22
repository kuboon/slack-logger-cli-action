Deno.env.set("TZ", "UTC");
import settings from "./settings.ts";
import { channelsIt, historyIt, MessageProcessor } from "./lib/slack.ts";
import { msgToRecord, recordsToJson, recordsToMarkdown } from "./lib/textOutput.ts";
import { Timestamp } from "./lib/timestamp.ts";

export default async function textMain(
  format: "json" | "markdown",
  oldest_: Date,
  latest_: Date,
) {
  const oldest = new Timestamp(oldest_);
  const latest = new Timestamp(latest_);
  const messageProcessor = await new MessageProcessor().asyncInit();
  const channels: { name: string; records: ReturnType<typeof msgToRecord>[] }[] =
    [];
  for await (const c of channelsIt()) {
    console.error(`Processing: ${c.name}`);
    const records: ReturnType<typeof msgToRecord>[] = [];
    for await (const msg of historyIt(c.id!, oldest.slack(), latest.slack())) {
      records.push(msgToRecord(msg, messageProcessor));
    }
    if (records.length > 0) {
      channels.push({ name: c.name!, records });
    }
  }
  if (format === "json") {
    console.log(recordsToJson(channels));
  } else {
    console.log(recordsToMarkdown(channels, settings.tz));
  }
}

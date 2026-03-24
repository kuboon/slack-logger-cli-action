import { Message, MessageProcessor } from "./slack.ts";
import { Timestamp } from "./timestamp.ts";

export async function saveToMarkdown(
  jsonlDir: string,
  mdDir: string,
  messageProcessor: MessageProcessor,
  tz: string,
) {
  console.log("Exporting to Markdown...");

  for await (const entry of Deno.readDir(jsonlDir)) {
    if (!entry.isFile || !entry.name.endsWith(".jsonl")) continue;

    const channelName = entry.name.replace(".jsonl", "");
    const filePath = `${jsonlDir}/${entry.name}`;
    const mdPath = `${mdDir}/${channelName}.md`;

    const data = await Deno.readTextFile(filePath);
    const lines = data.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;

    console.log(`Writing ${channelName} to Markdown...`);
    const mdFile = await Deno.open(mdPath, {
      write: true,
      create: true,
      truncate: true,
    });

    for (const line of lines) {
      const msg = JSON.parse(line) as Message;
      const { ts, user, text, ...rest } = msg;
      const threadMark = msg.reply_count ? "+" : msg.parent_user_id ? ">" : "";
      const timeStr = Timestamp.fromSlack(ts!)!.date(tz) + " " +
        Timestamp.fromSlack(ts!)!.hourMin(tz);
      const username = messageProcessor.username(user) || rest.username ||
        "Unknown";
      const readableText = messageProcessor.readable(text) ||
        rest.attachments?.[0].fallback || "";

      const mdLine =
        `**${username}** _${timeStr}_ ${threadMark}\n${readableText}\n\n`;
      await mdFile.write(new TextEncoder().encode(mdLine));
    }
    mdFile.close();
  }
}

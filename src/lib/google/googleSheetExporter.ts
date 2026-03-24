import { BatchBuilder } from "./batchBuilder.ts";
import { Message } from "../slack.ts";
import { MessageProcessor } from "../slack/MessageProcessor.ts";
import { Timestamp } from "../timestamp.ts";
import { formattedCell, GSheet, GSheetSchema, sheets_v4 } from "./sheet.ts";
import { ObjError } from "../objError.ts";

const sleep = (msec: number) => new Promise((ok) => setTimeout(ok, msec));

function msgToRow(msg: Message, p: MessageProcessor, tz: string) {
  const { ts, user, text, ...rest } = msg;
  const threadMark = msg.reply_count ? "+" : msg.parent_user_id ? ">" : "";

  try {
    const row: sheets_v4.Schema$RowData = {
      values: [
        formattedCell(threadMark),
        formattedCell(Timestamp.fromSlack(ts!)!, tz),
        formattedCell(p.username(user) || rest.username || ""),
        formattedCell(p.readable(text) || rest.attachments?.[0].fallback || ""),
        formattedCell(JSON.stringify(rest)),
      ],
    };
    return row;
  } catch (e) {
    ObjError.throw(`${ts} ${user} ${text}`, e);
  }
}

export async function saveToGsheet(
  jsonlDir: string,
  googleConfig: { folderId: string },
  tz: string,
  oldest: Timestamp,
  messageProcessor: MessageProcessor,
) {
  console.log("Exporting to Google Sheets...");

  // Read all JSONL files to determine the channels that need sheets.
  const channels: { id: string; name: string }[] = [];
  for await (const entry of Deno.readDir(jsonlDir)) {
    if (entry.isFile && entry.name.endsWith(".jsonl")) {
      const filePath = `${jsonlDir}/${entry.name}`;
      const data = await Deno.readTextFile(filePath);
      const lines = data.split("\n").filter((l) => l.trim() !== "");
      if (lines.length > 0) {
        const frontmatter = JSON.parse(lines[0]);
        channels.push({
          id: entry.name.replace(".jsonl", ""),
          name: frontmatter.channel_name || frontmatter.name ||
            entry.name.replace(".jsonl", ""),
        });
      }
    }
  }

  if (channels.length === 0) {
    console.log("No channels found to export to Google Sheets.");
    return;
  }

  channels.sort((a, b) => a.name.localeCompare(b.name));

  const sheetsReq = GSheetSchema.sheetNames(tz, channels.map((c) => c.name));

  const gSheet = await GSheet.create(
    oldest.date(tz),
    sheetsReq,
    googleConfig.folderId,
  );
  console.log("https://docs.google.com/spreadsheets/d/" + gSheet.id);

  const builder = new BatchBuilder();

  async function flushAndSave() {
    const batches = builder.flush();
    if (batches.length == 0) return;
    await gSheet.batchUpdate(batches).catch((e) => {
      if (e.code == 429) {
        console.error(e.errors);
        Deno.exit(1);
      } else throw e;
    });
  }

  await gSheet.metaReload();

  for (const c of channels) {
    const sheetId = await gSheet.getSheetIdByName(c.name);
    if (sheetId === undefined) continue;

    builder.setSheetId(sheetId);

    const filePath = `${jsonlDir}/${c.id}.jsonl`;
    const data = await Deno.readTextFile(filePath);
    const lines = data.split("\n").filter((l) => l.trim() !== "");

    if (lines.length <= 1) { // Only frontmatter or empty
      builder.pushDeleteSheet();
      await flushAndSave();
      continue;
    }

    console.log(`Writing ${c.name} to Sheet...`);
    for (let i = 1; i < lines.length; i++) {
      const msg = JSON.parse(lines[i]) as Message;
      const row = msgToRow(msg, messageProcessor, tz);
      const estimate = builder.push(row);
      if (estimate > 10000) {
        await flushAndSave();
        await sleep(1000);
      }
    }
    await flushAndSave();
  }
}

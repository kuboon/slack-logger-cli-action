Deno.env.set("TZ", "UTC");
import settings from "./settings.ts";
import { BatchBuilder } from "./lib/batchBuilder.ts";
import { historyIt, channelsIt, Message, MessageProcessor } from "./lib/slack.ts";
import { Timestamp } from "./lib/timestamp.ts";
import { formattedCell, sheets_v4, GSheet, GSheetSchema } from "./lib/google/sheet.ts";
import { ObjError } from "./lib/objError.ts";
// Note: deno std lib fs/ensure_dir does not need to be imported if we use Deno.mkdir
// But let's use standard Deno API directly
const ensureDir = async (dir: string) => {
  try {
    await Deno.stat(dir);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      await Deno.mkdir(dir, { recursive: true });
    } else {
      throw e;
    }
  }
};

const sleep = (msec: number) => new Promise((ok) => setTimeout(ok, msec));

// console.log without new line
async function print(input: string | Uint8Array, to = Deno.stdout) {
  const stream = new Blob([typeof input === "string" ? input : input.buffer as ArrayBuffer]).stream();
  await stream.pipeTo(to.writable, { preventClose: true });
}

function msgToRow(msg: Message, p: MessageProcessor) {
  const { ts, user, text, ...rest } = msg;
  const threadMark = msg.reply_count ? "+" : msg.parent_user_id ? ">" : "";

  try {
    const row: sheets_v4.Schema$RowData = {
      values: [
        formattedCell(threadMark),
        formattedCell(Timestamp.fromSlack(ts!)!, settings.tz),
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

async function* ahead<T>(
  gen: AsyncGenerator<T, void, void>,
): AsyncGenerator<{ msg: T; next?: T }, void, void> {
  const r = await gen.next();
  if (r.done) return;
  let msg = r.value!;
  for await (const next of gen) {
    yield { msg, next };
    msg = next!;
  }
  yield { msg };
}

export default async function main(
  oldest_: Date,
  latest_: Date,
) {
  const oldest = new Timestamp(oldest_);
  const latest = new Timestamp(latest_);

  const messageProcessor = await new MessageProcessor().asyncInit();

  // 1. Fetch channels
  const channels = [];
  for await (const c of channelsIt()) {
    channels.push({
      name: c.name!,
      channel_id: c.id!,
    });
  }
  channels.sort((a, b) => a.name.localeCompare(b.name));

  const outDir = "./out";
  await ensureDir(outDir);

  // 2. Fetch logs and write to JSONL
  console.log("Fetching messages from Slack...");
  for (const c of channels) {
    console.log(`Channel: ${c.name}`);
    const filePath = `${outDir}/${c.name}.jsonl`;
    const file = await Deno.open(filePath, { write: true, create: true, truncate: true });

    // slack historyIt pagination goes from latest to oldest in general or as we saw,
    // actually historyIt yields newest items then older items.
    let count = 0;
    for await (const { msg } of ahead(historyIt(c.channel_id, oldest.slack(), latest.slack()))) {
      if (!msg) break;
      const line = JSON.stringify(msg) + "\n";
      await file.write(new TextEncoder().encode(line));
      count++;
      if (count % 1000 === 0) {
        await print(".");
      }
    }
    file.close();
    console.log(` Saved ${count} messages.`);
  }

  // 3. Write to Google Sheets
  if (settings.outGsheet) {
    console.log("Exporting to Google Sheets...");

    // Google Sheets wants an array of sheet objects. Create from names.
    const sheetsReq = GSheetSchema.sheetNames(settings.tz, channels.map(c => c.name));

    const gSheet = await GSheet.create(
      oldest.date(settings.tz),
      sheetsReq,
      settings.folder,
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

    // Prepare sheets list and get ids
    await gSheet.metaReload();

    for (const c of channels) {
      const sheetId = await gSheet.getSheetIdByName(c.name);
      if (sheetId === undefined) continue;

      builder.setSheetId(sheetId);

      const filePath = `${outDir}/${c.name}.jsonl`;
      const data = await Deno.readTextFile(filePath);
      const lines = data.split("\n").filter(l => l.trim() !== "");

      if (lines.length === 0) {
         // No messages, optionally delete sheet
         builder.pushDeleteSheet();
         await flushAndSave();
         continue;
      }

      console.log(`Writing ${c.name} to Sheet...`);
      for (const line of lines) {
         const msg = JSON.parse(line) as Message;
         const row = msgToRow(msg, messageProcessor);
         const estimate = builder.push(row);
         if (estimate > 10000) {
            await flushAndSave();
            await sleep(1000);
         }
      }
      await flushAndSave();
    }
  }

  // 4. Write to Markdown
  if (settings.outMarkdown) {
    console.log("Exporting to Markdown...");
    for (const c of channels) {
      const filePath = `${outDir}/${c.name}.jsonl`;
      const mdPath = `${outDir}/${c.name}.md`;
      const data = await Deno.readTextFile(filePath);
      const lines = data.split("\n").filter(l => l.trim() !== "");
      if (lines.length === 0) continue;

      console.log(`Writing ${c.name} to Markdown...`);
      const mdFile = await Deno.open(mdPath, { write: true, create: true, truncate: true });

      for (const line of lines) {
        const msg = JSON.parse(line) as Message;
        const { ts, user, text, ...rest } = msg;
        const threadMark = msg.reply_count ? "+" : msg.parent_user_id ? ">" : "";
        const timeStr = Timestamp.fromSlack(ts!)!.date(settings.tz) + " " + Timestamp.fromSlack(ts!)!.hourMin(settings.tz);
        const username = messageProcessor.username(user) || rest.username || "Unknown";
        const readableText = messageProcessor.readable(text) || rest.attachments?.[0].fallback || "";

        const mdLine = `**${username}** _${timeStr}_ ${threadMark}\n${readableText}\n\n`;
        await mdFile.write(new TextEncoder().encode(mdLine));
      }
      mdFile.close();
    }
  }

  console.log("Done.");
}

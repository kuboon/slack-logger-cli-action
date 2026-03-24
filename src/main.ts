Deno.env.set("TZ", "UTC");
import settings from "./settings.ts";
import { channelsIt, historyIt, MessageProcessor } from "./lib/slack.ts";
import { Timestamp } from "./lib/timestamp.ts";
import { saveToGsheet } from "./lib/googleSheetExporter.ts";
import { saveToMarkdown } from "./lib/markdownExporter.ts";

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

// console.log without new line
async function print(input: string | Uint8Array, to = Deno.stdout) {
  const stream = new Blob([
    typeof input === "string" ? input : input.buffer as ArrayBuffer,
  ]).stream();
  await stream.pipeTo(to.writable, { preventClose: true });
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
  const jsonlDir = `${outDir}/jsonl`;
  const mdDir = `${outDir}/md`;

  await ensureDir(jsonlDir);
  await ensureDir(mdDir);

  // 2. Fetch logs and write to JSONL
  console.log("Fetching messages from Slack...");
  for (const c of channels) {
    console.log(`Channel: ${c.name}`);
    const filePath = `${jsonlDir}/${c.name}.jsonl`;
    const file = await Deno.open(filePath, {
      write: true,
      create: true,
      truncate: true,
    });

    // slack historyIt pagination goes from latest to oldest in general or as we saw,
    // actually historyIt yields newest items then older items.
    let count = 0;
    for await (
      const { msg } of ahead(
        historyIt(c.channel_id, oldest.slack(), latest.slack()),
      )
    ) {
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

  // 3. Write to Google Sheets (if credentials are provided)
  if (
    settings.google.email && settings.google.key && settings.google.folderId
  ) {
    await saveToGsheet(
      jsonlDir,
      settings.google,
      settings.tz,
      oldest,
      messageProcessor,
    );
  } else {
    console.log(
      "Skipping Google Sheets export: missing credentials or folderId.",
    );
  }

  // 4. Write to Markdown (always execute)
  await saveToMarkdown(jsonlDir, mdDir, messageProcessor, settings.tz);

  console.log("Done.");
  return { jsonlDir, mdDir };
}

Deno.env.set("TZ", "UTC");
import settings from "./settings.ts";
import { channelsIt, fetchHistory } from "./lib/slack/slack.ts";
import { Timestamp } from "./lib/timestamp.ts";
import { saveToGsheet } from "./lib/google/googleSheetExporter.ts";
import { saveToMarkdown } from "./lib/markdownExporter.ts";
import { MessageProcessor } from "./lib/slack/MessageProcessor.ts";

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

export default async function main(
  oldest_: Date,
  latest_: Date,
) {
  const oldest = new Timestamp(oldest_);
  const latest = new Timestamp(latest_);

  const messageProcessor = await new MessageProcessor().asyncInit();

  const outDir = "./out";
  const jsonlDir = `${outDir}/jsonl`;
  const mdDir = `${outDir}/md`;

  await ensureDir(jsonlDir);
  await ensureDir(mdDir);

  console.log("Fetching messages from Slack...");
  // for await (const c of channelsIt()) {
  //   messageProcessor.addChannel({ id: c.id!, name: c.name! });
  //   console.log(`Channel: ${c.name}`);
  //   const filePath = `${jsonlDir}/${c.id}.jsonl`;
  //   const file = await Deno.open(filePath, {
  //     write: true,
  //     create: true,
  //     truncate: true,
  //   });

  //   const frontmatter = JSON.stringify({ channel_name: c.name }) + "\n";
  //   await file.write(new TextEncoder().encode(frontmatter));

  //   const messages = await fetchHistory(c.id!, oldest.slack(), latest.slack());

  //   for (let i = 0; i < messages.length; i++) {
  //     const msg = messages[i];
  //     const line = JSON.stringify(msg) + "\n";
  //     await file.write(new TextEncoder().encode(line));
  //     if ((i + 1) % 1000 === 0) {
  //       await print(".");
  //     }
  //   }

  //   file.close();
  //   console.log(` Saved ${messages.length} messages.`);
  // }

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

  await saveToMarkdown(jsonlDir, mdDir, messageProcessor, settings.tz);

  console.log("Done.");
  return { jsonlDir, mdDir };
}

if (import.meta.main) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  await main(sevenDaysAgo, now);
}

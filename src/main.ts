Deno.env.set("TZ", "UTC");
import settings from "./settings.ts";
import { StatusFile } from "./lib/statusFile.ts";
import { BatchBuilder } from "./lib/google/batchBuilder.ts";
import { channelsIt, historyIt, MessageProcessor, msgToJson } from "./core.ts";
import { Timestamp } from "./lib/timestamp.ts";
import { jsonToRow } from "./lib/google/sheet.ts";
import { prepareChannelSheets, prepareWorkSheet } from "./lib/google/prepare.ts";

const sleep = (msec: number) => new Promise((ok) => setTimeout(ok, msec));

// console.log without new line
async function print(input: string | Uint8Array, to = Deno.stdout) {
  const stream = new Blob([input]).stream();
  await stream.pipeTo(to.writable, { preventClose: true });
}

async function* ahead<T>(
  gen: AsyncGenerator<T, void, void>,
): AsyncGenerator<{ msg: T; next?: T }, void, void> {
  let msg = (await gen.next()).value!;
  for await (const next of gen) {
    yield { msg, next };
    msg = next!;
  }
  yield { msg };
}

export default async function main(
  append = false,
  oldest_: Date,
  latest_: Date,
) {
  const oldest = new Timestamp(oldest_);
  const latest = new Timestamp(latest_);

  const file = new StatusFile();
  if (append) file.load();

  const gSheet = await prepareWorkSheet(
    file.status.gSheetId,
    oldest.date(settings.tz),
  );
  console.log("https://docs.google.com/spreadsheets/d/" + gSheet.id);

  const channelList: Array<{ name: string; id: string }> = [];
  for await (const c of channelsIt()) {
    channelList.push({ name: c.name!, id: c.id! });
  }

  const channels = await prepareChannelSheets(gSheet, oldest.slack(), channelList);
  if (append) {
    for (const s of channels) {
      const cs = file.status.channels.find((x) => x.channel_id === s.channel_id);
      if (cs) s.ts = cs.ts;
    }
  }

  const builder = new BatchBuilder();
  const messageProcessor = await new MessageProcessor().asyncInit();

  async function flush() {
    const batches = builder.flush();
    if (batches.length == 0) return;
    await gSheet.batchUpdate(batches).catch((e) => {
      if (e.code == 429) {
        console.error(e.errors);
        Deno.exit(1);
      } else throw e;
    });
  }

  for await (const c of channels) {
    console.log(c.name);
    builder.setSheetId(c.sheetId!);
    for await (
      const { msg, next } of ahead(
        historyIt(c.channel_id, c.ts, latest.slack()),
      )
    ) {
      if (!msg) {
        builder.pushDeleteSheet();
        await print(" x");
        break;
      }
      const json = msgToJson(msg, messageProcessor);
      const row = jsonToRow(json);
      const estimate = builder.push(row);
      if (estimate > 10000 && (!next || !next.parent_user_id)) {
        await print(".");
        await flush();

        // https://developers.google.com/sheets/api/reference/limits
        await sleep(1000);
      }
    }
    console.log("");
  }
  await flush();
}

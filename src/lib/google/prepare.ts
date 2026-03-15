import settings from "../../settings.ts";
import { GSheet, GSheetSchema, sheets_v4 } from "./sheet.ts";
import type { ChannelStatus } from "../types.ts";

export type { ChannelStatus };

export async function prepareChannelSheets(
  gSheet: GSheet,
  ts: string,
  channelList: Array<{ name: string; id: string }>,
): Promise<ChannelStatus[]> {
  const channels: ChannelStatus[] = channelList.map((c) => ({
    name: c.name,
    channel_id: c.id,
    ts,
  }));
  channels.sort((a, b) => a.name.localeCompare(b.name));
  const batches: sheets_v4.Schema$Request[] = [];
  for (const c of channels) {
    const sheetId = await gSheet.getSheetIdByName(c.name);
    if (!sheetId) {
      batches.push({ addSheet: { properties: { title: c.name } } });
    }
  }
  if (batches.length > 0) {
    await gSheet.batchUpdate(batches);
    await gSheet.metaReload();
  }
  for (const s of channels) {
    const sheetId = (await gSheet.getSheetIdByName(s.name))!;
    s.sheetId = sheetId;
  }
  return channels;
}

export function prepareWorkSheet(sid: string | null, fName: string) {
  if (sid) {
    return new GSheet(sid);
  } else {
    return GSheet.create(
      fName,
      GSheetSchema.sheetNames(settings.tz, ["_"]),
      settings.folder,
    );
  }
}

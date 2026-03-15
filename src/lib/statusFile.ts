import type { ChannelStatus } from "./types.ts";

type Status = {
  gSheetId: null | string;
  channels: ChannelStatus[];
};

export class StatusFile {
  filePath = "lastStatus";
  status: Status;
  constructor() {
    this.status = { gSheetId: null, channels: [] };
  }
  load() {
    try {
      const json = JSON.parse(Deno.readTextFileSync(this.filePath));
      this.status = json;
    } catch {
      // ignore
    }
  }
}

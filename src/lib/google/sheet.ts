import auth from "./auth.ts";
import { CellVal, MsgJson } from "../types.ts";
import { Timestamp } from "../timestamp.ts";
import { ObjError } from "../objError.ts";
import settings from "../../settings.ts";

//import * as gsheets from "@googleapis/sheets";
//import * as gdrive  from "@googleapis/drive";
//const sheets = gsheets.sheets({ version: "v4", auth });
//const drive = gdrive.drive({ version: "v3", auth });
//import sheets_v4 = gsheets.sheets_v4

import { google, sheets_v4 } from "googleapis";
const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });

export { sheets_v4 };

export function jsonToRow(json: MsgJson): sheets_v4.Schema$RowData {
  return {
    values: [
      formattedCell(json.threadMark),
      formattedCell(json.timestamp, settings.tz),
      formattedCell(json.username),
      formattedCell(json.text),
      formattedCell(json.rest),
    ],
  };
}

export function formattedCell(
  c: CellVal,
  timeZone?: string,
): sheets_v4.Schema$CellData {
  switch (typeof c) {
    case "string":
      return { userEnteredValue: { stringValue: c } };
    case "number":
      return { userEnteredValue: { numberValue: c } };
    case "boolean":
      return { userEnteredValue: { boolValue: c } };
  }
  if (c === null) return { userEnteredValue: { stringValue: "" } };
  if (c && c instanceof Date) {
    return {
      userEnteredValue: {
        numberValue: new Timestamp(c).gsheetSerial(timeZone!),
      },
      userEnteredFormat: {
        numberFormat: {
          type: "DATE_TIME",
          pattern: "yyyy-mm-dd hh:mm",
        },
      },
    };
  }
  throw new ObjError("invalid format", { c, type: typeof c });
}

export const GSheetSchema = {
  sheetTitle: (title: string) => ({ properties: { title } }),
  sheetNames: (
    timeZone: string,
    names: string[],
  ): sheets_v4.Schema$Spreadsheet => ({
    properties: { timeZone },
    sheets: names.map(GSheetSchema.sheetTitle),
  }),
};
export class GSheet {
  static async create(
    name: string,
    requestBody: sheets_v4.Schema$Spreadsheet,
    parent: string,
  ): Promise<GSheet> {
    const res = await sheets.spreadsheets.create({
      requestBody,
    });
    const sheetId = res && res.data.spreadsheetId;
    if (!sheetId) {
      throw new ObjError("GSheet", res);
    }
    await drive.files
      .update(
        {
          fileId: sheetId,
          addParents: parent,
          requestBody: {
            name,
          },
        },
        {},
      )
      .catch((e) => {
        throw new ObjError("create fail", e);
      });
    return new GSheet(sheetId);
  }

  readonly id: string;
  protected meta_?: sheets_v4.Schema$Spreadsheet;
  constructor(id: string) {
    this.id = id;
  }

  url() {
    return `https://docs.google.com/spreadsheets/d/${this.id}`;
  }

  async metaReload() {
    const res = await sheets.spreadsheets
      .get({
        spreadsheetId: this.id,
        fields: "properties.timeZone,sheets.properties",
      })
      .catch((e: unknown) => {
        throw new ObjError("getMeta", e);
      });
    this.meta_ = res.data;
    return this.meta_!;
  }
  async meta(): Promise<sheets_v4.Schema$Spreadsheet> {
    if (!this.meta_) {
      await this.metaReload();
    }
    return this.meta_!;
  }
  async getSheetIdByName(name: string): Promise<number | undefined> {
    const meta = await this.meta();
    for (const s of meta.sheets!) {
      if (s.properties!.title === name) return s.properties!.sheetId!;
    }
  }

  batchUpdate(requests: sheets_v4.Schema$Request[]) {
    return sheets.spreadsheets.batchUpdate(
      {
        spreadsheetId: this.id,
        requestBody: {
          requests,
        },
      },
      {},
    );
  }
}

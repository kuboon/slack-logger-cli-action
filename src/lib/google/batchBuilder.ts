import { sheets_v4 } from "./sheet.ts";

export class BatchBuilder {
  batches: sheets_v4.Schema$Request[] = [];
  rows: sheets_v4.Schema$RowData[] = [];
  estimate = 0;
  sheetId: number = 0;

  push(row: sheets_v4.Schema$RowData) {
    this.rows.push(row);
    this.estimate += JSON.stringify(row).length + 3;
    return this.estimate;
  }

  pushDeleteSheet() {
    this.batches.push({
      deleteSheet: {
        sheetId: this.sheetId,
      },
    });
  }

  setSheetId(sheetId: number) {
    if (this.rows.length > 0) {
      const req: sheets_v4.Schema$Request = {
        appendCells: { sheetId: this.sheetId, rows: this.rows, fields: "*" },
      };
      this.batches.push(req);
      this.rows = [];
    }
    this.sheetId = sheetId;
    [15, 112, 100, 700].forEach((px, i) => {
      this.batches.push({
        updateDimensionProperties: {
          properties: { pixelSize: px },
          fields: "*",
          range: {
            sheetId: this.sheetId,
            dimension: "COLUMNS",
            startIndex: i,
            endIndex: i + 1,
          },
        },
      });
    });
    this.estimate += 500;
  }

  flush() {
    if (this.rows.length > 0) {
      const req: sheets_v4.Schema$Request = {
        appendCells: { sheetId: this.sheetId, rows: this.rows, fields: "*" },
      };
      this.batches.push(req);
      this.rows = [];
    }
    const batches = this.batches;
    this.batches = [];
    this.estimate = 0;
    return batches;
  }
}

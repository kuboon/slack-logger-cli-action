export type CellVal = number | string | boolean | Date | null;
export type ValMatrix = CellVal[][];
export type KeyVal = { [key: string]: CellVal };
export type KeyValOrArray = { [key: string]: CellVal | CellVal[] };

export type MsgJson = {
  threadMark: string;
  timestamp: Date;
  username: string;
  text: string;
  rest: string;
};

export type ChannelStatus = {
  name: string;
  channel_id: string;
  sheetId?: number;
  ts: string;
};

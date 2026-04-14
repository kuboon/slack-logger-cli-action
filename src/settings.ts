export default {
  slack: {
    token: Deno.env.get("INPUT_SLACKTOKEN")!,
    baseUrl: Deno.env.get("SLACK_BASE_URL"),
  },
  google: {
    email: Deno.env.get("INPUT_GOOGLECLIENTEMAIL") || "",
    key: Deno.env.get("INPUT_GOOGLEPRIVATEKEY") || "",
    folderId: Deno.env.get("INPUT_GOOGLEFOLDERID") || "",
  },
  tz: Deno.env.get("INPUT_TIMEZONE") || "Asia/Tokyo",
  year: Deno.env.get("INPUT_YEAR"),
  month: Deno.env.get("INPUT_MONTH"),
  autoJoin: Deno.env.get("INPUT_AUTOJOIN") !== "false",
  skipChannels: (Deno.env.get("INPUT_SKIPCHANNELS") || "").split(" ").filter(
    Boolean,
  ),
};

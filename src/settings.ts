export default {
  slack: {
    token: Deno.env.get("INPUT_SLACKTOKEN") || Deno.env.get("SLACK_TOKEN") ||
      "",
  },
  google: {
    email: Deno.env.get("INPUT_GOOGLECLIENTEMAIL") ||
      Deno.env.get("GOOGLE_CLIENT_EMAIL") || "",
    key: Deno.env.get("INPUT_GOOGLEPRIVATEKEY") ||
      Deno.env.get("GOOGLE_PRIVATE_KEY") || "",
  },
  tz: Deno.env.get("INPUT_TIMEZONE") || Deno.env.get("TIMEZONE") || "UTC",
  folder: Deno.env.get("INPUT_FOLDERID") || Deno.env.get("FOLDER_ID") || "",
  year: Deno.env.get("INPUT_YEAR") || Deno.env.get("YEAR"),
  month: Deno.env.get("INPUT_MONTH") || Deno.env.get("MONTH"),
  autoJoin: Deno.env.get("INPUT_AUTOJOIN") == "true",
  skipChannels: (Deno.env.get("INPUT_SKIPCHANNELS") ||
    Deno.env.get("SKIP_CHANNELS") || "").split(" "),
  format: Deno.env.get("INPUT_FORMAT") || Deno.env.get("FORMAT") || "gsheet",
};

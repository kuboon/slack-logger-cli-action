import { parseArgs } from "@std/cli/parse-args";

const args = parseArgs(Deno.args, {
  string: [
    "slack-token",
    "timezone",
    "format",
    "year",
    "month",
    "folder-id",
    "google-client-email",
    "google-private-key",
    "skip-channels",
  ],
  boolean: ["auto-join", "help"],
  default: {
    "auto-join": true,
    format: "json",
  },
  negatable: ["auto-join"],
  alias: {
    h: "help",
    f: "format",
    t: "timezone",
    y: "year",
    m: "month",
  },
});

if (args.help) {
  console.log(`Usage: deno run -A src/cli.ts [options]

Output format:
  --format, -f <format>         Output format: json, markdown, gsheet (default: json)

Date range:
  --year, -y <year>             Target year (default: 2 months ago)
  --month, -m <month>           Target month (default: 2 months ago)
  --timezone, -t <timezone>     Timezone (default: UTC)

Slack:
  --slack-token <token>         Slack bot token (or SLACK_TOKEN env var)
  --auto-join / --no-auto-join  Auto-join public channels (default: true)
  --skip-channels <ids>         Space-separated channel IDs to skip

Google Sheets (required for --format gsheet):
  --folder-id <id>              Google Drive folder ID (or FOLDER_ID env var)
  --google-client-email <email> Google service account email (or GOOGLE_CLIENT_EMAIL env var)
  --google-private-key <key>    Google service account private key (or GOOGLE_PRIVATE_KEY env var)

  --help, -h                    Show this help`);
  Deno.exit(0);
}

const slackToken = args["slack-token"] || Deno.env.get("SLACK_TOKEN") ||
  Deno.env.get("INPUT_SLACKTOKEN") || "";
const timezone = args["timezone"] || Deno.env.get("TIMEZONE") ||
  Deno.env.get("INPUT_TIMEZONE") || "UTC";
const year = args["year"] || Deno.env.get("YEAR") || Deno.env.get("INPUT_YEAR") ||
  "";
const month = args["month"] || Deno.env.get("MONTH") ||
  Deno.env.get("INPUT_MONTH") || "";
const folderId = args["folder-id"] || Deno.env.get("FOLDER_ID") ||
  Deno.env.get("INPUT_FOLDERID") || "";
const googleEmail = args["google-client-email"] ||
  Deno.env.get("GOOGLE_CLIENT_EMAIL") ||
  Deno.env.get("INPUT_GOOGLECLIENTEMAIL") || "";
const googleKey = args["google-private-key"] ||
  Deno.env.get("GOOGLE_PRIVATE_KEY") ||
  Deno.env.get("INPUT_GOOGLEPRIVATEKEY") || "";
const skipChannels = args["skip-channels"] || Deno.env.get("SKIP_CHANNELS") ||
  Deno.env.get("INPUT_SKIPCHANNELS") || "";
const format = args["format"] || Deno.env.get("FORMAT") || "json";
const autoJoin = args["auto-join"] ?? true;

if (!slackToken) {
  console.error(
    "Error: Slack token is required. Use --slack-token or set SLACK_TOKEN env var.",
  );
  Deno.exit(1);
}

if (format === "gsheet") {
  if (!folderId) {
    console.error(
      "Error: --folder-id is required for gsheet format. Use --folder-id or set FOLDER_ID env var.",
    );
    Deno.exit(1);
  }
  if (!googleEmail) {
    console.error(
      "Error: --google-client-email is required for gsheet format. Use --google-client-email or set GOOGLE_CLIENT_EMAIL env var.",
    );
    Deno.exit(1);
  }
  if (!googleKey) {
    console.error(
      "Error: --google-private-key is required for gsheet format. Use --google-private-key or set GOOGLE_PRIVATE_KEY env var.",
    );
    Deno.exit(1);
  }
}

if (format !== "json" && format !== "markdown" && format !== "gsheet") {
  console.error(
    `Error: Unknown format "${format}". Use json, markdown, or gsheet.`,
  );
  Deno.exit(1);
}

// Set INPUT_ env vars so that settings.ts (loaded by downstream modules) picks them up
Deno.env.set("INPUT_SLACKTOKEN", slackToken);
Deno.env.set("INPUT_TIMEZONE", timezone);
if (year) Deno.env.set("INPUT_YEAR", year);
if (month) Deno.env.set("INPUT_MONTH", month);
if (folderId) Deno.env.set("INPUT_FOLDERID", folderId);
if (googleEmail) Deno.env.set("INPUT_GOOGLECLIENTEMAIL", googleEmail);
if (googleKey) Deno.env.set("INPUT_GOOGLEPRIVATEKEY", googleKey);
if (skipChannels) Deno.env.set("INPUT_SKIPCHANNELS", skipChannels);
Deno.env.set("INPUT_AUTOJOIN", autoJoin ? "true" : "false");
Deno.env.set("INPUT_FORMAT", format);

// Calculate date range using Temporal API
const yearNum = parseInt(year);
const monthNum = parseInt(month);
let from: Date;
let to: Date;

if (isNaN(yearNum) || isNaN(monthNum)) {
  const now = Temporal.Now.zonedDateTimeISO(timezone).toPlainDate()
    .toPlainYearMonth();
  const twoMonths = Temporal.Duration.from({ months: 2 });
  const fromZoned = now.subtract(twoMonths).toPlainDate({ day: 1 })
    .toZonedDateTime(timezone);
  from = new Date(fromZoned.epochMilliseconds);
  to = new Date(fromZoned.add({ months: 1 }).epochMilliseconds);
} else {
  const fromZoned = Temporal.PlainDateTime.from({
    year: yearNum,
    month: monthNum,
    day: 1,
  }).toZonedDateTime(timezone);
  from = new Date(fromZoned.epochMilliseconds);
  to = new Date(fromZoned.add({ months: 1 }).epochMilliseconds);
}

console.error(
  `Fetching Slack logs from ${from.toISOString().slice(0, 10)} to ${
    to.toISOString().slice(0, 10)
  } (format: ${format})`,
);

// Dynamic imports ensure settings.ts is evaluated after env vars are set
if (format === "gsheet") {
  const { default: main } = await import("./main.ts");
  await main(false, from, to).catch((e: unknown) => {
    console.error(e);
    Deno.exit(1);
  });
} else {
  const { default: textMain } = await import("./textMain.ts");
  await textMain(format as "json" | "markdown", from, to).catch(
    (e: unknown) => {
      console.error(e);
      Deno.exit(1);
    },
  );
}

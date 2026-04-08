// Start the Slack emulator *before* importing main.ts so that the
// SLACK_BASE_URL env var is in place when the SlackAPIClient singleton
// inside slack.ts is initialised via the dynamic import below.
import { createEmulator, type Emulator } from "emulate";
import { SlackAPIClient } from "@seratch/slack-web-api-client";
import { assertEquals, assert } from "@std/assert";

const slackEmulator: Emulator = await createEmulator({
  service: "slack",
  port: 4003,
});

Deno.env.set("SLACK_BASE_URL", slackEmulator.url);
Deno.env.set("INPUT_SLACKTOKEN", "test_token_admin");
Deno.env.set("INPUT_AUTOJOIN", "true");
Deno.env.set("INPUT_SKIPCHANNELS", "");
Deno.env.set("INPUT_TIMEZONE", "UTC");

// Dynamic import ensures the modules read the env vars set above.
const { default: main } = await import("./main.ts");

// A direct Slack client for seeding test messages into the emulator.
const slackClient = new SlackAPIClient("test_token_admin", {
  baseUrl: slackEmulator.url,
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

Deno.test({
  name: "main: saves channel history as JSONL files",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const oldest = new Date(Date.now() - ONE_DAY_MS);
    const latest = new Date(Date.now() + ONE_DAY_MS);

    // Post two messages to the default #general channel (C000000001).
    await slackClient.chat.postMessage({
      channel: "C000000001",
      text: "Hello from integration test!",
    });
    await slackClient.chat.postMessage({
      channel: "C000000001",
      text: "Second test message",
    });

    try {
      const result = await main(oldest, latest);

      // The #general channel should have a JSONL file.
      const jsonlContent = await Deno.readTextFile(
        `${result.jsonlDir}/C000000001.jsonl`,
      );
      const lines = jsonlContent.split("\n").filter((l) => l.trim());
      // First line is frontmatter JSON, remaining lines are messages.
      assert(
        lines.length >= 3,
        "Should have frontmatter + 2 messages",
      );

      const messages = lines.slice(1).map((l) => JSON.parse(l));
      assertEquals(messages[0].text, "Hello from integration test!");
      assertEquals(messages[1].text, "Second test message");
    } finally {
      slackEmulator.reset();
      await Deno.remove("./out", { recursive: true }).catch(() => {});
    }
  },
});

Deno.test({
  name: "main: exports channel history to Markdown",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const oldest = new Date(Date.now() - ONE_DAY_MS);
    const latest = new Date(Date.now() + ONE_DAY_MS);

    await slackClient.chat.postMessage({
      channel: "C000000001",
      text: "Markdown content test",
    });

    try {
      const result = await main(oldest, latest);

      // A markdown file should be generated for #general.
      const mdContent = await Deno.readTextFile(
        `${result.mdDir}/general.md`,
      );
      assert(
        mdContent.includes("Markdown content test"),
        "Markdown file should contain the posted message",
      );
    } finally {
      slackEmulator.reset();
      await Deno.remove("./out", { recursive: true }).catch(() => {});
      await slackEmulator.close();
    }
  },
});

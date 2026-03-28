import { Member, slack } from "../slack/slack.ts";

const Regex = {
  user_id: /<@([^|>]+)(?:\|[^>]+)?>/g,
  group_id: /<!subteam\^([^|>]+)(?:\|[^>]+)?>/g,
  channel_id: /<#([^|>]+)(?:\|[^>]+)?>/g,
  specials: /<!([^^|>]+)>/g,
};

function unescape(str: string) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function users() {
  const res = await slack.users.list();
  return res.members!;
}

export class MessageProcessor {
  users: Member[];
  groups: { id: string; name: string }[];
  channels: { id: string; name: string }[];

  constructor() {
    this.users = [];
    this.groups = [];
    this.channels = [];
  }

  async asyncInit() {
    this.users = await users();
    return this;
  }

  addChannel(channel: { id: string; name: string }) {
    if (!this.channels.find((c) => c.id === channel.id)) {
      this.channels.push(channel);
    }
  }

  readable(raw: string | undefined) {
    if (!raw || raw == "") return;
    const ret = raw.replaceAll(Regex.user_id, (_, s1) => {
      const user = this.users.find((x) => x.id == s1);
      return `@${user?.name || s1}`;
    }).replaceAll(Regex.group_id, (_, s1) => {
      const hit = this.groups.find((x) => x.id == s1);
      return `@${hit?.name || s1}`;
    }).replaceAll(Regex.channel_id, (_, s1) => {
      const hit = this.channels.find((x) => x.id == s1);
      return `@${hit?.name || s1}`;
    }).replaceAll(Regex.specials, (_, s1) => {
      return `@${s1}`;
    });
    return unescape(ret);
  }

  username(id?: string) {
    if (!id) return;
    const user = this.users.find((x) => x.id == id);
    return user?.real_name || user?.name || id;
  }
}

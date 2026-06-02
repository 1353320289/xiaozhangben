const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WECHAT_WEBHOOK = process.env.WECHAT_WEBHOOK;
const REMINDER_USER_ID = process.env.REMINDER_USER_ID;

const missing = [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY],
  ["WECHAT_WEBHOOK", WECHAT_WEBHOOK]
].filter(([, value]) => !value);

if (missing.length) {
  throw new Error(`Missing secrets: ${missing.map(([name]) => name).join(", ")}`);
}

const today = chinaDateKey(new Date());
const hasRecord = await hasLedgerRecord(today);

await sendWechatReminder(today, hasRecord);
console.log(
  hasRecord
    ? `Record exists for ${today}; confirmation sent.`
    : `No record for ${today}; reminder sent.`
);

async function hasLedgerRecord(date) {
  const url = new URL("/rest/v1/ledger_records", SUPABASE_URL);
  url.searchParams.set("select", "id");
  url.searchParams.set("date", `eq.${date}`);
  url.searchParams.set("deleted_at", "is.null");
  url.searchParams.set("limit", "1");
  if (REMINDER_USER_ID) url.searchParams.set("user_id", `eq.${REMINDER_USER_ID}`);

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase query failed: ${response.status} ${await response.text()}`);
  }

  const rows = await response.json();
  return rows.length > 0;
}

async function sendWechatReminder(date, hasRecord) {
  const message = hasRecord ? buildDoneMessage(date) : buildMissingMessage(date);

  const response = await fetch(WECHAT_WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { content: message }
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.errcode) {
    throw new Error(`WeCom webhook failed: ${response.status} ${JSON.stringify(result)}`);
  }
}

function buildDoneMessage(date) {
  const tips = [
    "今天的账本已经乖乖收好。",
    "今天这一笔已经记下，心里可以轻一点。",
    "做货记录已到位，月底算账会感谢现在的你。",
    "今天没有漏记，收工感又多了一点。",
    "账本已更新，今天的小尾巴收起来了。"
  ];
  const tip = pick(tips);

  return [
    "## 记账本小提醒",
    "",
    `**${tip}**`,
    "",
    `今天 ${date} 已经有记录啦。`,
    "",
    "> 辛苦的一天，有被好好记住。"
  ].join("\n");
}

function buildMissingMessage(date) {
  const tips = [
    "今晚的小账本还空着呢。",
    "今天的做货记录还没落座。",
    "账本在等你补上今天这一笔。",
    "今天还没填，别让辛苦白忙一场。",
    "收工前记一下，明天看账就轻松。"
  ];
  const tip = pick(tips);

  return [
    "## 记账本小提醒",
    "",
    `**${tip}**`,
    "",
    `今天 ${date} 还没有填写记录。`,
    "",
    "> 现在补一下，月底算钱更省心。"
  ].join("\n");
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function chinaDateKey(date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

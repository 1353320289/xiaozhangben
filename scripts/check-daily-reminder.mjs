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

if (hasRecord) {
  console.log(`Record exists for ${today}; no reminder sent.`);
} else {
  await sendWechatReminder(today);
  console.log(`No record for ${today}; reminder sent.`);
}

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

async function sendWechatReminder(date) {
  const content = [
    "## 记账本提醒",
    "",
    `今天（${date}）还没有填写记账本。`,
    "",
    "记得补一下今天做货记录。"
  ].join("\n");

  const response = await fetch(WECHAT_WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { content }
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.errcode) {
    throw new Error(`WeCom webhook failed: ${response.status} ${JSON.stringify(result)}`);
  }
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

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
    "账本已更新，今天的小尾巴收起来了。",
    "今天的辛苦已经有名字、有数量、有记录。",
    "你已经把今天安排明白了。",
    "今日份账本完成，稳稳落袋。",
    "今天没有被账本追着跑，真不错。",
    "记录已经到位，可以安心收工。",
    "今天这一步做完了，月底少一分头疼。",
    "做货记录已保存，今天很靠谱。",
    "今天的努力没有散在风里，已经记下来了。",
    "账本点头：今天可以了。",
    "今日记录完成，整个人都清爽一点。",
    "这笔已经收好，月底翻账会很顺。",
    "今天的账本很听话，你也很稳。",
    "已经记上了，今天的小任务圆满收尾。",
    "记录完成，给今天画个小句号。",
    "今天没有漏，心里也不用惦记。",
    "做货信息已经归队。",
    "账本今天不空，辛苦也不白。",
    "今日份记录已打卡。",
    "今天的账本有着落了。",
    "这一天的成果已经被好好放好。",
    "记录已完成，收工更踏实。",
    "今天的小账清清楚楚。",
    "账本已经替你守住今天的辛苦。",
    "今日记录到位，月底快乐一点点。",
    "你已经给今天留好了证据。",
    "今天的数字已经乖乖排队。"
  ];
  const closings = [
    "辛苦的一天，有被好好记住。",
    "安心休息，今天这一项已经完成。",
    "小账不乱，心里就宽。",
    "今天可以轻轻松松收尾了。",
    "把账记清楚，也是照顾未来的自己。",
    "明天再忙，今天也已经稳住了。",
    "这份踏实感，留给晚上的你。",
    "月底看到这里，会感谢现在的认真。"
  ];
  const tip = pick(tips);
  const closing = pick(closings);

  return [
    "## 记账本小提醒",
    "",
    `**${tip}**`,
    "",
    `今天 ${date} 已经有记录啦。`,
    "",
    `> ${closing}`
  ].join("\n");
}

function buildMissingMessage(date) {
  const tips = [
    "今晚的小账本还空着呢。",
    "今天的做货记录还没落座。",
    "账本在等你补上今天这一笔。",
    "今天还没填，别让辛苦白忙一场。",
    "收工前记一下，明天看账就轻松。",
    "今天的小账还在门口等你。",
    "账本悄悄举手：今天还没写。",
    "今天做了什么货，还没进账本。",
    "别把今天的辛苦落下啦。",
    "小账本还没收到今天的消息。",
    "今天的记录还差最后一步。",
    "睡前补一下，明天醒来不用惦记。",
    "今天的成果还没有被保存。",
    "账本现在有点空，等你填满一点。",
    "今天还没记，月底可能会问你。",
    "趁现在还记得，顺手补一下。",
    "今天的做货信息还没归队。",
    "小账本在等一个答案：今天做了啥。",
    "今天这笔还没落地。",
    "再忙也别漏掉自己的辛苦。",
    "今天还没填，补一下就清爽了。",
    "账本没有催很大声，但它确实在等。",
    "今天的记录还没到家。",
    "现在花一分钟，月底省十分钟。",
    "今天的小任务还差记账这一格。",
    "别让今天的数量溜走。",
    "账本空空，等你来收尾。",
    "今天还没写，轻轻补一笔就好。",
    "做货记录还没保存，先别让它过夜。",
    "今天这一笔，值得被记下来。",
    "小账本想知道你今天忙出了多少成果。"
  ];
  const closings = [
    "现在补一下，月底算钱更省心。",
    "不用写很多，填上名字和数量就好。",
    "一分钟搞定，今晚少惦记一件事。",
    "记完就可以安心收工。",
    "把今天放进账本里，明天就不用猜。",
    "趁记忆还热乎，补一下最省事。",
    "你辛苦做的东西，值得清清楚楚记下来。",
    "填完这一笔，今天就更完整了。"
  ];
  const tip = pick(tips);
  const closing = pick(closings);

  return [
    "## 记账本小提醒",
    "",
    `**${tip}**`,
    "",
    `今天 ${date} 还没有填写记录。`,
    "",
    `> ${closing}`
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

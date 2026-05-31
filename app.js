const STORAGE_KEY = "piecework-calendar-v1";
const BACKUP_STORAGE_KEY = "piecework-calendar-backup-v1";
const LEGACY_MIGRATION_KEY = "piecework-calendar-legacy-migrated";
const BUNDLE_SIZE = 12;
const SUPABASE_URL = "https://xbelcicqzulbexljkttq.supabase.co";
const SUPABASE_KEY = "sb_publishable_oUSYtdT8CfWFh72JWyYSbg_Ds9eLduV";
const RECORDS_TABLE = "ledger_records";
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  records: loadRecords(),
  selectedDate: dateKey(new Date()),
  activeMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  showTrash: false,
  view: "auth",
  user: null,
  syncStatus: "未登录",
  editingId: null
};

const els = {
  authView: document.querySelector("#authView"),
  appView: document.querySelector("#appView"),
  reportView: document.querySelector("#reportView"),
  authForm: document.querySelector("#authForm"),
  email: document.querySelector("#emailInput"),
  password: document.querySelector("#passwordInput"),
  authStatus: document.querySelector("#authStatus"),
  accountLabel: document.querySelector("#accountLabel"),
  syncStatus: document.querySelector("#syncStatus"),
  logoutBtn: document.querySelector("#logoutBtn"),
  installBtn: document.querySelector("#installBtn"),
  monthLabel: document.querySelector("#monthLabel"),
  monthTotal: document.querySelector("#monthTotal"),
  workDays: document.querySelector("#workDays"),
  dayTotal: document.querySelector("#dayTotal"),
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  selectedDateTitle: document.querySelector("#selectedDateTitle"),
  selectedDateTotal: document.querySelector("#selectedDateTotal"),
  form: document.querySelector("#workForm"),
  goods: document.querySelector("#goodsInput"),
  price: document.querySelector("#priceInput"),
  dozen: document.querySelector("#dozenInput"),
  loose: document.querySelector("#looseInput"),
  saveBtn: document.querySelector("#saveBtn"),
  quickGoods: document.querySelector("#quickGoods"),
  reportBtn: document.querySelector("#reportBtn"),
  reportCanvas: document.querySelector("#reportCanvas"),
  reportImage: document.querySelector("#reportImage"),
  closeReportBtn: document.querySelector("#closeReportBtn"),
  trashBtn: document.querySelector("#trashBtn"),
  empty: document.querySelector("#emptyState"),
  list: document.querySelector("#workList")
};

let deferredInstallPrompt = null;

init();

async function init() {
  state.records = keepCurrentMonthRecords(state.records);
  saveRecords();
  requestPersistentStorage();
  bindEvents();
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").then((registration) => {
      registration.update();
    });
  }

  if (!supabaseClient) {
    setAuthStatus("网络组件没有加载，请刷新页面。");
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (data.session?.user) {
    await enterAccount(data.session.user);
  } else {
    setAuthStatus("请输入管理员创建的账户。");
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user && session.user.id !== state.user?.id) {
      await enterAccount(session.user);
    }
  });
}

function bindEvents() {
  els.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await login();
  });

  els.logoutBtn.addEventListener("click", async () => {
    await logout();
  });

  els.prevMonth.addEventListener("click", () => {
    state.activeMonth = new Date(state.activeMonth.getFullYear(), state.activeMonth.getMonth() - 1, 1);
    selectFirstVisibleDay();
    render();
  });

  els.nextMonth.addEventListener("click", () => {
    state.activeMonth = new Date(state.activeMonth.getFullYear(), state.activeMonth.getMonth() + 1, 1);
    selectFirstVisibleDay();
    render();
  });

  els.calendarGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button) return;
    state.selectedDate = button.dataset.date;
    state.showTrash = false;
    resetEntryForm();
    render();
    fillLatestGoods();
  });

  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const goods = els.goods.value.trim();
    const price = parseMoney(els.price.value);
    const dozenQty = parseMoney(els.dozen.value || "0");
    const looseQty = parseMoney(els.loose.value || "0");

    if (!goods) {
      els.goods.focus();
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      els.price.focus();
      return;
    }
    if (!Number.isFinite(dozenQty) || dozenQty < 0) {
      els.dozen.focus();
      return;
    }
    if (!Number.isFinite(looseQty) || looseQty < 0) {
      els.loose.focus();
      return;
    }
    if (dozenQty === 0 && looseQty === 0) {
      els.dozen.focus();
      return;
    }

    if (state.editingId) {
      const record = state.records.find((item) => item.id === state.editingId);
      if (record) {
        record.date = state.selectedDate;
        record.goods = goods;
        record.price = roundMoney(price);
        record.dozenQty = roundMoney(dozenQty);
        record.looseQty = roundMoney(looseQty);
        record.updatedAt = new Date().toISOString();
      }
    } else {
      const now = new Date().toISOString();
      state.records.push({
        id: crypto.randomUUID(),
        date: state.selectedDate,
        goods,
        price: roundMoney(price),
        dozenQty: roundMoney(dozenQty),
        looseQty: roundMoney(looseQty),
        createdAt: now,
        updatedAt: now
      });
    }

    saveRecords();
    await syncRecords();
    resetEntryForm();
    render();
    fillLatestGoods();
    els.dozen.focus();
  });

  els.list.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete]");
    const editButton = event.target.closest("[data-edit]");
    const restoreButton = event.target.closest("[data-restore]");
    const removeButton = event.target.closest("[data-remove]");

    if (editButton) {
      const record = state.records.find((item) => item.id === editButton.dataset.edit);
      if (record) startEdit(record);
      return;
    }
    if (deleteButton) {
      const record = state.records.find((item) => item.id === deleteButton.dataset.delete);
      if (record) record.deletedAt = new Date().toISOString();
    }
    if (restoreButton) {
      const record = state.records.find((item) => item.id === restoreButton.dataset.restore);
      if (record) delete record.deletedAt;
    }
    if (removeButton) {
      state.records = state.records.filter((record) => record.id !== removeButton.dataset.remove);
      await deleteCloudRecord(removeButton.dataset.remove);
    }

    saveRecords();
    await syncRecords();
    render();
  });

  els.quickGoods.addEventListener("click", (event) => {
    const button = event.target.closest("[data-goods]");
    if (!button) return;
    fillGoods(button.dataset.goods, button.dataset.price);
  });

  els.trashBtn.addEventListener("click", () => {
    state.showTrash = !state.showTrash;
    render();
  });

  els.reportBtn.addEventListener("click", () => {
    state.view = "report";
    render();
    drawReport();
  });

  els.closeReportBtn.addEventListener("click", () => {
    state.view = "app";
    render();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installBtn.hidden = false;
  });

  els.installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installBtn.hidden = true;
  });
}

function render() {
  setViewVisibility();

  const monthRecords = recordsForMonth(state.activeMonth);
  const selectedRecords = recordsForDate(state.selectedDate);
  const deletedRecords = deletedRecordsList();
  const total = sumRecords(monthRecords);
  const selectedTotal = sumRecords(selectedRecords);
  const days = new Set(monthRecords.map((record) => record.date)).size;

  els.accountLabel.textContent = state.user?.email || "未登录";
  els.syncStatus.textContent = state.syncStatus;
  els.monthLabel.textContent = "本月总计";
  els.monthTotal.textContent = currency(total);
  els.workDays.textContent = `${days} 天`;
  els.dayTotal.textContent = currency(selectedTotal);
  els.calendarTitle.textContent = formatMonth(state.activeMonth);
  els.selectedDateTitle.textContent = state.showTrash ? "回收站" : formatDateTitle(state.selectedDate);
  els.selectedDateTotal.textContent = state.showTrash ? `${deletedRecords.length} 条` : currency(selectedTotal);
  els.form.hidden = state.showTrash;
  els.saveBtn.textContent = state.editingId ? "更新" : "保存";
  els.trashBtn.textContent = state.showTrash ? "返回" : `回收站${deletedRecords.length ? ` ${deletedRecords.length}` : ""}`;

  renderCalendar(monthRecords);
  renderQuickGoods();
  state.showTrash ? renderTrashList(deletedRecords) : renderWorkList(selectedRecords);
}

function renderQuickGoods() {
  const items = frequentGoods();
  els.quickGoods.hidden = state.showTrash || !items.length;
  els.quickGoods.innerHTML = items.map((item) => `
    <button type="button" data-goods="${escapeHtml(item.goods)}" data-price="${item.price}">
      <b>${escapeHtml(item.goods)}</b>
      <span>${moneyText(item.price)}</span>
    </button>
  `).join("");
}

function renderCalendar(monthRecords) {
  const year = state.activeMonth.getFullYear();
  const month = state.activeMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const blanks = firstDay.getDay();
  const today = dateKey(new Date());
  const totals = new Map();
  const counts = new Map();

  monthRecords.forEach((record) => {
    totals.set(record.date, roundMoney((totals.get(record.date) || 0) + recordTotal(record)));
    counts.set(record.date, (counts.get(record.date) || 0) + 1);
  });

  const cells = [];
  for (let i = 0; i < blanks; i += 1) {
    cells.push('<div class="day-cell blank"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dateKey(new Date(year, month, day));
    const total = totals.get(key) || 0;
    const count = counts.get(key) || 0;
    const classes = [
      "day-cell",
      key === today ? "today" : "",
      key === state.selectedDate ? "selected" : ""
    ].filter(Boolean).join(" ");

    cells.push(`
      <button class="${classes}" type="button" data-date="${key}">
        <span class="day-number">${day}</span>
        ${total > 0 ? `<span class="day-money">${currency(total)}</span>` : ""}
        ${count > 0 ? `<span class="day-count">${count}笔</span>` : ""}
      </button>
    `);
  }

  els.calendarGrid.innerHTML = cells.join("");
}

function renderWorkList(records) {
  els.empty.hidden = records.length > 0;
  els.empty.textContent = "这天还没有记录。";
  els.list.innerHTML = records.map((record) => `
    <li class="work-item">
      <div>
        <span class="work-name">${escapeHtml(record.goods)}</span>
        <span class="work-meta">${currency(record.price)}/打 · ${formatQty(record.dozenQty)}打 + ${formatQty(record.looseQty)}闪</span>
      </div>
      <div class="work-actions">
        <span class="work-total">${currency(recordTotal(record))}</span>
        <button class="edit-button" type="button" data-edit="${record.id}">编辑</button>
        <button class="delete-button" type="button" data-delete="${record.id}">删除</button>
      </div>
    </li>
  `).join("");
}

function renderTrashList(records) {
  els.empty.hidden = records.length > 0;
  els.empty.textContent = "回收站是空的。";
  els.list.innerHTML = records.map((record) => `
    <li class="work-item">
      <div>
        <span class="work-name">${escapeHtml(record.goods)}</span>
        <span class="work-meta">${formatShortDate(record.date)} · ${currency(record.price)}/打 · ${formatQty(record.dozenQty)}打 + ${formatQty(record.looseQty)}闪</span>
      </div>
      <div class="work-actions">
        <span class="work-total">${currency(recordTotal(record))}</span>
        <button class="restore-button" type="button" data-restore="${record.id}">恢复</button>
        <button class="delete-button" type="button" data-remove="${record.id}">彻底删</button>
      </div>
    </li>
  `).join("");
}

function buildReportCards(sourceRecords = recordsForMonth(state.activeMonth)) {
  const goodsGroups = new Map();
  sourceRecords
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.goods.localeCompare(b.goods, "zh-CN"))
    .forEach((record) => {
      if (!goodsGroups.has(record.goods)) goodsGroups.set(record.goods, new Map());
      const dates = goodsGroups.get(record.goods);
      if (!dates.has(record.date)) dates.set(record.date, { dozenQty: 0, looseQty: 0 });
      const total = dates.get(record.date);
      total.dozenQty = roundMoney(total.dozenQty + (record.dozenQty || 0));
      total.looseQty = roundMoney(total.looseQty + (record.looseQty || 0));
    });

  return [...goodsGroups.entries()].map(([name, dates]) => {
    const sortedDates = [...dates.entries()].sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
    return {
      name,
      firstDate: sortedDates[0]?.[0] || "",
      rows: sortedDates
        .map(([date, qty]) => ({
        day: formatDayOnly(date),
        qty: formatReportQty(qty)
      }))
    };
  }).sort((a, b) => a.firstDate.localeCompare(b.firstDate));
}

function drawReport(cards = buildReportCards()) {
  const canvas = els.reportCanvas;
  const ctx = canvas.getContext("2d");
  const width = 900;
  const paddingX = 58;
  const paddingTop = 46;
  const titleHeight = 66;
  const rowHeight = 42;
  const groupNameHeight = 42;
  const groupGap = 28;
  const columnGap = 34;
  const cardsToDraw = cards.length ? cards : [{ name: "暂无记录", rows: [{ day: "", qty: "本月还没有做货记录" }] }];
  const totalRows = cardsToDraw.reduce((sum, card) => sum + card.rows.length, 0);
  const fullWidth = width - paddingX * 2;
  const useTwoColumns = totalRows >= 18;
  const columnWidth = useTwoColumns ? (fullWidth - columnGap) / 2 : fullWidth;
  const columns = useTwoColumns ? splitReportColumns(cardsToDraw, rowHeight, groupNameHeight, groupGap) : [cardsToDraw];
  const columnHeights = columns.map((column) => reportColumnHeight(column, rowHeight, groupNameHeight, groupGap));
  const height = paddingTop + titleHeight + Math.max(...columnHeights) + 34;

  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#fffefd";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#3f4246";
  ctx.font = "800 48px system-ui, sans-serif";
  ctx.fillText(`${state.activeMonth.getMonth() + 1}月计数`, paddingX, paddingTop + 46);

  const contentTop = paddingTop + titleHeight;
  drawReportColumn(ctx, columns[0], paddingX, contentTop, columnWidth, rowHeight, groupNameHeight, groupGap);

  if (useTwoColumns) {
    const dividerX = paddingX + columnWidth + columnGap / 2;
    ctx.fillStyle = "#e5e0d8";
    ctx.fillRect(dividerX, contentTop - 4, 1, Math.max(...columnHeights), 1);
    drawReportColumn(ctx, columns[1], paddingX + columnWidth + columnGap, contentTop, columnWidth, rowHeight, groupNameHeight, groupGap);
  }

  els.reportImage.src = canvas.toDataURL("image/png");
}

function drawReportColumn(ctx, cards, x, startY, width, rowHeight, groupNameHeight, groupGap) {
  let y = startY;
  cards.forEach((card) => {
    ctx.fillStyle = "#4b4d52";
    ctx.textAlign = "left";
    ctx.font = "500 32px system-ui, sans-serif";
    ctx.fillText(fitText(ctx, card.name, width), x, y + 32);

    card.rows.forEach((row, index) => {
      const rowY = y + groupNameHeight + index * rowHeight;
      ctx.fillStyle = "#4b4d52";
      ctx.font = "500 32px system-ui, sans-serif";
      ctx.fillText(row.day, x, rowY + 31);
      ctx.fillText(fitText(ctx, row.qty, width - 92), x + 92, rowY + 31);
    });

    y += groupNameHeight + Math.max(card.rows.length, 1) * rowHeight + groupGap;
  });
}

function splitReportColumns(cards, rowHeight, groupNameHeight, groupGap) {
  const totalHeight = reportColumnHeight(cards, rowHeight, groupNameHeight, groupGap);
  const target = totalHeight / 2;
  const left = [];
  const right = [];
  let current = 0;

  cards.forEach((card, index) => {
    const height = reportCardHeight(card, rowHeight, groupNameHeight, groupGap);
    if (!left.length && height > target && card.rows.length > 1) {
      const splitAt = Math.ceil(card.rows.length / 2);
      left.push({ ...card, rows: card.rows.slice(0, splitAt) });
      right.push({ ...card, rows: card.rows.slice(splitAt) });
      current += reportCardHeight(left[0], rowHeight, groupNameHeight, groupGap);
      return;
    }
    if (index > 0 && current + height > target) {
      right.push(card);
      return;
    }
    left.push(card);
    current += height;
  });

  return [left, right.length ? right : left.splice(Math.ceil(left.length / 2))];
}

function reportColumnHeight(cards, rowHeight, groupNameHeight, groupGap) {
  return cards.reduce((sum, card) => sum + reportCardHeight(card, rowHeight, groupNameHeight, groupGap), 0);
}

function reportCardHeight(card, rowHeight, groupNameHeight, groupGap) {
  return groupNameHeight + Math.max(card.rows.length, 1) * rowHeight + groupGap;
}

async function login() {
  if (!supabaseClient) return;
  setAuthStatus("正在登录...");
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: els.email.value.trim(),
    password: els.password.value
  });
  if (error) {
    setAuthStatus(`登录失败：${error.message}`);
  }
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  state.user = null;
  state.records = keepCurrentMonthRecords(loadRecords());
  state.view = "auth";
  state.syncStatus = "未登录";
  setAuthStatus("已退出，请重新登录。");
  render();
}

async function enterAccount(user) {
  state.user = user;
  state.view = "app";
  state.syncStatus = "同步中";
  setAuthStatus("");
  render();

  let localRecords = keepCurrentMonthRecords(loadRecords(user.id));
  if (!localRecords.length && !localStorage.getItem(LEGACY_MIGRATION_KEY)) {
    localRecords = keepCurrentMonthRecords(loadRecords());
    if (localRecords.length) localStorage.setItem(LEGACY_MIGRATION_KEY, user.id);
  }
  const cloudRecords = await fetchCloudRecords();
  state.records = mergeRecords(cloudRecords, localRecords);
  state.records = keepCurrentMonthRecords(state.records);
  saveRecords();
  await pruneOldCloudRecords();
  await syncRecords();
  state.syncStatus = "已同步";
  render();
  fillLatestGoods();
}

function startEdit(record) {
  state.editingId = record.id;
  fillGoods(record.goods, record.price, false);
  els.dozen.value = record.dozenQty ? `${formatQty(record.dozenQty)}` : "";
  els.loose.value = record.looseQty ? `${formatQty(record.looseQty)}` : "";
  els.saveBtn.textContent = "更新";
  els.dozen.focus();
}

function resetEntryForm() {
  state.editingId = null;
  els.form.reset();
  els.saveBtn.textContent = "保存";
}

function frequentGoods() {
  const items = new Map();
  state.records
    .filter((record) => !record.deletedAt)
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((record) => {
      const key = `${record.goods}::${record.price}`;
      const current = items.get(key) || { goods: record.goods, price: record.price, count: 0, latest: record.date };
      current.count += 1;
      if (record.date > current.latest) current.latest = record.date;
      items.set(key, current);
    });

  return [...items.values()]
    .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest))
    .slice(0, 6);
}

function latestGoods() {
  return state.records
    .filter((record) => !record.deletedAt && record.date <= state.selectedDate)
    .sort((a, b) => {
      const dateSort = b.date.localeCompare(a.date);
      if (dateSort !== 0) return dateSort;
      return recordTime(b).localeCompare(recordTime(a));
    })
    [0];
}

function fillLatestGoods() {
  if (state.showTrash || els.goods.value || els.price.value) return;
  const latest = latestGoods();
  if (latest) fillGoods(latest.goods, latest.price, false);
}

function fillGoods(goods, price, focusQuantity = true) {
  els.goods.value = goods || "";
  els.price.value = price ? `${roundMoney(Number(price))}` : "";
  if (focusQuantity) els.dozen.focus();
}

function recordTime(record) {
  return record.updatedAt || record.createdAt || "";
}

async function fetchCloudRecords() {
  if (!supabaseClient || !state.user) return [];
  const { data, error } = await supabaseClient
    .from(RECORDS_TABLE)
    .select("*")
    .order("date", { ascending: true });
  if (error) {
    state.syncStatus = "云端读取失败";
    return [];
  }
  return (data || []).map(recordFromCloud);
}

async function syncRecords() {
  if (!supabaseClient || !state.user) return;
  state.syncStatus = "同步中";
  render();

  const payload = state.records.map(recordToCloud);
  const { error } = payload.length
    ? await supabaseClient.from(RECORDS_TABLE).upsert(payload, { onConflict: "id" })
    : { error: null };

  state.syncStatus = error ? "同步失败" : "已同步";
  render();
}

async function deleteCloudRecord(id) {
  if (!supabaseClient || !state.user || !id) return;
  await supabaseClient.from(RECORDS_TABLE).delete().eq("id", id);
}

async function pruneOldCloudRecords() {
  if (!supabaseClient || !state.user) return;
  await supabaseClient
    .from(RECORDS_TABLE)
    .delete()
    .not("date", "like", `${monthKey(new Date())}%`);
}

function recordToCloud(record) {
  return {
    id: record.id,
    user_id: state.user.id,
    date: record.date,
    goods: record.goods,
    price: record.price,
    dozen_qty: record.dozenQty || 0,
    loose_qty: record.looseQty || 0,
    deleted_at: record.deletedAt || null,
    updated_at: record.updatedAt || record.createdAt || new Date().toISOString()
  };
}

function recordFromCloud(record) {
  return normalizeRecord({
    id: record.id,
    date: record.date,
    goods: record.goods,
    price: Number(record.price) || 0,
    dozenQty: Number(record.dozen_qty) || 0,
    looseQty: Number(record.loose_qty) || 0,
    deletedAt: record.deleted_at || undefined,
    updatedAt: record.updated_at || undefined
  });
}

function mergeRecords(primary, secondary) {
  const records = new Map();
  [...secondary, ...primary].forEach((record) => {
    records.set(record.id, record);
  });
  return [...records.values()];
}

function setAuthStatus(message) {
  els.authStatus.textContent = message;
}

function setViewVisibility() {
  const isAuth = state.view === "auth";
  const isReport = state.view === "report";
  els.authView.hidden = !isAuth;
  els.authView.style.display = isAuth ? "grid" : "none";
  els.appView.hidden = isAuth || isReport;
  els.appView.style.display = isAuth || isReport ? "none" : "grid";
  els.reportView.hidden = !isReport;
  els.reportView.style.display = isReport ? "grid" : "none";
}

function selectFirstVisibleDay() {
  const year = state.activeMonth.getFullYear();
  const month = state.activeMonth.getMonth();
  const selected = parseDateKey(state.selectedDate);
  if (selected.getFullYear() !== year || selected.getMonth() !== month) {
    state.selectedDate = dateKey(new Date(year, month, 1));
  }
}

function recordsForMonth(monthDate) {
  const key = monthKey(monthDate);
  return state.records.filter((record) => !record.deletedAt && record.date.startsWith(key));
}

function recordsForDate(key) {
  return state.records.filter((record) => !record.deletedAt && record.date === key);
}

function deletedRecordsList() {
  return state.records
    .filter((record) => record.deletedAt)
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

function recordTotal(record) {
  return roundMoney((record.price * (record.dozenQty || 0)) + ((record.price / BUNDLE_SIZE) * (record.looseQty || 0)));
}

function recordDozens(record) {
  return (record.dozenQty || 0) + ((record.looseQty || 0) / BUNDLE_SIZE);
}

function sumRecords(records) {
  return roundMoney(records.reduce((total, record) => total + recordTotal(record), 0));
}

function loadRecords(userId = null) {
  const primary = readStoredRecords(storageKey(userId));
  if (userId) {
    return (primary ?? []).map(normalizeRecord);
  }
  const backup = readStoredRecords(BACKUP_STORAGE_KEY);
  const records = primary ?? backup ?? [];
  return records.map(normalizeRecord);
}

function saveRecords() {
  const value = JSON.stringify(state.records);
  localStorage.setItem(storageKey(state.user?.id), value);
  localStorage.setItem(BACKUP_STORAGE_KEY, value);
}

function storageKey(userId = null) {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

function readStoredRecords(key) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? null : JSON.parse(value);
  } catch {
    return null;
  }
}

function keepCurrentMonthRecords(records) {
  const currentMonth = monthKey(new Date());
  return records.filter((record) => record.date?.startsWith(currentMonth));
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    // Some iOS browsers do not expose persistent storage prompts.
  }
}

function parseMoney(value) {
  return Number.parseFloat(String(value).replace(",", "."));
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatMonth(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatDateTitle(key) {
  const date = parseDateKey(key);
  const today = dateKey(new Date());
  const prefix = key === today ? "今天" : `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${prefix}做货`;
}

function formatQty(value) {
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function formatDozens(value) {
  return Number.isInteger(value) ? `${value}` : `${roundMoney(value)}`;
}

function formatShortDate(key) {
  const date = parseDateKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatFullDate(key) {
  const date = parseDateKey(key);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDayOnly(key) {
  const date = parseDateKey(key);
  return `${date.getDate()}日`;
}

function formatReportQty(record) {
  const parts = [];
  if (record.dozenQty > 0) parts.push(`${formatQty(record.dozenQty)}打`);
  if (record.looseQty > 0) parts.push(`${formatQty(record.looseQty)}件`);
  return parts.join(" ");
}

function fitText(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;

  let clipped = value;
  while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

function roundRect(ctx, x, y, width, height, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
}

function normalizeRecord(record) {
  if (record.dozenQty !== undefined) {
    return {
      ...record,
      looseQty: record.looseQty ?? 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
  if (record.madeQty === undefined) {
    return {
      ...record,
      dozenQty: record.qty ?? 0,
      looseQty: 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
  return {
    ...record,
    dozenQty: 0,
    looseQty: record.madeQty,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function currency(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
}

function moneyText(value) {
  return `¥${roundMoney(value).toFixed(2)}`;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

const STORAGE_KEY = "piecework-calendar-v1";
const BACKUP_STORAGE_KEY = "piecework-calendar-backup-v1";
const LEGACY_MIGRATION_KEY = "piecework-calendar-legacy-migrated";
const LAST_REPORT_RANGE_KEY = "piecework-calendar-last-report-range-v1";
const BUNDLE_SIZE = 12;
const SUPABASE_URL = "https://xbelcicqzulbexljkttq.supabase.co";
const SUPABASE_KEY = "sb_publishable_oUSYtdT8CfWFh72JWyYSbg_Ds9eLduV";
const RECORDS_TABLE = "ledger_records";
const REPORT_RANGES_TABLE = "report_ranges";
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  records: loadRecords(),
  selectedDate: dateKey(new Date()),
  activeMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  showTrash: false,
  view: "auth",
  user: null,
  syncStatus: "未登录",
  editingId: null,
  autoPrice: null,
  reportRange: null,
  draftReportRange: null,
  isPickingReportRange: false
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
  reportStatus: document.querySelector("#reportStatus"),
  reportPicker: document.querySelector("#reportPicker"),
  reportPickGrid: document.querySelector("#reportPickGrid"),
  reportHistory: document.querySelector("#reportHistory"),
  currentReportRange: document.querySelector("#currentReportRange"),
  reportTitleToggle: document.querySelector("#reportTitleToggle"),
  cancelReportPickBtn: document.querySelector("#cancelReportPickBtn"),
  clearReportPickBtn: document.querySelector("#clearReportPickBtn"),
  generateReportBtn: document.querySelector("#generateReportBtn"),
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

  els.goods.addEventListener("input", autoFillPriceFromGoods);

  els.price.addEventListener("input", () => {
    state.autoPrice = null;
  });

  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const goods = els.goods.value.trim();
    const inferredPrice = inferPriceFromGoods(goods);
    const price = parseMoney(els.price.value || (inferredPrice ? `${inferredPrice}` : ""));
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
    openReportPicker();
  });

  els.cancelReportPickBtn.addEventListener("click", closeReportPicker);

  els.clearReportPickBtn.addEventListener("click", () => {
    state.draftReportRange = null;
    renderReportPicker();
  });

  els.generateReportBtn.addEventListener("click", () => {
    generatePickedReport();
  });

  els.reportPickGrid.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-report-date]");
    if (!button) return;
    state.isPickingReportRange = true;
    state.draftReportRange = { start: button.dataset.reportDate, end: button.dataset.reportDate };
    renderReportPicker();
  });

  els.reportPickGrid.addEventListener("pointermove", (event) => {
    if (!state.isPickingReportRange || !state.draftReportRange) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const button = target?.closest?.("[data-report-date]");
    if (!button) return;
    state.draftReportRange.end = button.dataset.reportDate;
    renderReportPicker();
  });

  window.addEventListener("pointerup", () => {
    state.isPickingReportRange = false;
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
        <span class="work-meta">${currency(record.price)}/打 · ${formatQty(record.dozenQty)}打 + ${formatQty(record.looseQty)}件</span>
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
        <span class="work-meta">${formatShortDate(record.date)} · ${currency(record.price)}/打 · ${formatQty(record.dozenQty)}打 + ${formatQty(record.looseQty)}件</span>
      </div>
      <div class="work-actions">
        <span class="work-total">${currency(recordTotal(record))}</span>
        <button class="restore-button" type="button" data-restore="${record.id}">恢复</button>
        <button class="delete-button" type="button" data-remove="${record.id}">彻底删</button>
      </div>
    </li>
  `).join("");
}

function buildReportCards(sourceRecords = recordsForReportRange()) {
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
    const total = sortedDates.reduce((sum, [, qty]) => ({
      dozenQty: roundMoney(sum.dozenQty + (qty.dozenQty || 0)),
      looseQty: roundMoney(sum.looseQty + (qty.looseQty || 0))
    }), { dozenQty: 0, looseQty: 0 });
    return {
      name,
      firstDate: sortedDates[0]?.[0] || "",
      total: formatReportTotalQty(total),
      rows: sortedDates
        .map(([date, qty]) => ({
        day: formatDayOnly(date),
        qty: formatReportQty(qty)
      }))
    };
  }).sort((a, b) => a.firstDate.localeCompare(b.firstDate));
}

function drawReport(cards = buildReportCards(), sourceRecords = recordsForReportRange()) {
  const canvas = els.reportCanvas;
  const ctx = canvas.getContext("2d");
  const width = 980;
  const paddingX = 58;
  const showTitle = els.reportTitleToggle.checked;
  const paddingTop = showTitle ? 46 : 30;
  const titleHeight = showTitle ? 66 : 0;
  const rowHeight = 42;
  const groupNameHeight = 42;
  const groupGap = 28;
  const emptyText = "没有可以生成的记录";
  const cardsToDraw = cards.length ? cards : [{ name: "暂无记录", rows: [{ day: "", qty: emptyText }] }];
  const fullWidth = width - paddingX * 2;
  const contentHeight = reportColumnHeight(cardsToDraw, rowHeight, groupNameHeight, groupGap);
  const height = paddingTop + titleHeight + contentHeight + 34;

  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#fffefd";
  ctx.fillRect(0, 0, width, height);

  if (showTitle) {
    ctx.fillStyle = "#3f4246";
    ctx.font = "800 48px system-ui, sans-serif";
    ctx.fillText(`${state.activeMonth.getMonth() + 1}月计数`, paddingX, paddingTop + 46);
  }

  const contentTop = paddingTop + titleHeight;
  drawReportColumn(ctx, cardsToDraw, paddingX, contentTop, fullWidth, rowHeight, groupNameHeight, groupGap);

  els.reportImage.src = canvas.toDataURL("image/png");
  renderReportStatus(sourceRecords);
  els.reportImage.closest(".report-image-wrap")?.scrollTo({ top: 0, left: 0 });
  els.reportView.scrollTo?.({ top: 0, left: 0 });
  window.scrollTo?.({ top: 0, left: 0 });
}

function drawReportColumn(ctx, cards, x, startY, width, rowHeight, groupNameHeight, groupGap) {
  let y = startY;
  cards.forEach((card) => {
    const summaryWidth = 190;
    const dividerX = x + width - summaryWidth - 18;
    const detailWidth = dividerX - x - 18;

    ctx.fillStyle = "#4b4d52";
    ctx.textAlign = "left";
    ctx.font = "500 32px system-ui, sans-serif";
    ctx.fillText(fitText(ctx, card.name, detailWidth), x, y + 32);

    ctx.strokeStyle = "#ded6c7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dividerX, y + 6);
    ctx.lineTo(dividerX, y + groupNameHeight + Math.max(card.rows.length, 1) * rowHeight - 8);
    ctx.stroke();

    ctx.fillStyle = "#8a5a53";
    ctx.font = "500 24px system-ui, sans-serif";
    ctx.fillText("合计", dividerX + 18, y + 30);
    ctx.fillStyle = "#4b4d52";
    ctx.font = "700 30px system-ui, sans-serif";
    ctx.fillText(fitText(ctx, card.total || "", summaryWidth - 18), dividerX + 18, y + 68);

    card.rows.forEach((row, index) => {
      const rowY = y + groupNameHeight + index * rowHeight;
      ctx.fillStyle = "#4b4d52";
      ctx.font = "500 32px system-ui, sans-serif";
      ctx.fillText(row.day, x, rowY + 31);
      ctx.fillText(fitText(ctx, row.qty, detailWidth - 92), x + 92, rowY + 31);
    });

    y += groupNameHeight + Math.max(card.rows.length, 1) * rowHeight + groupGap;
  });
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
  await mergeCloudReportRanges();
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
  state.autoPrice = null;
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
    .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
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
  state.autoPrice = price ? roundMoney(Number(price)) : null;
  if (focusQuantity) els.dozen.focus();
}

function autoFillPriceFromGoods() {
  const inferredPrice = inferPriceFromGoods(els.goods.value);
  const currentPrice = parseMoney(els.price.value);
  const currentIsAuto = state.autoPrice !== null && Number.isFinite(currentPrice) && roundMoney(currentPrice) === state.autoPrice;

  if (!inferredPrice) {
    if (currentIsAuto) els.price.value = "";
    state.autoPrice = null;
    return;
  }

  if (els.price.value.trim() && !currentIsAuto) return;

  state.autoPrice = roundMoney(inferredPrice);
  els.price.value = `${state.autoPrice}`;
}

function inferPriceFromGoods(goods) {
  const text = String(goods || "").trim();
  const yuanMatch = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:元|块|rmb|RMB)/);
  const symbolMatch = text.match(/[¥￥]\s*(\d+(?:[.,]\d{1,2})?)/);
  const value = parseMoney(yuanMatch?.[1] || symbolMatch?.[1] || "");
  return Number.isFinite(value) && value > 0 ? roundMoney(value) : null;
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

function openReportPicker() {
  state.draftReportRange = null;
  els.reportPicker.hidden = false;
  renderReportPicker();
}

function closeReportPicker() {
  state.isPickingReportRange = false;
  els.reportPicker.hidden = true;
}

function renderReportPicker() {
  renderReportHistory();
  els.currentReportRange.textContent = state.draftReportRange
    ? `本次选择：${formatRangeText(normalizeRange(state.draftReportRange))}`
    : "不选择日期时默认生成全部记录。";

  const monthRecords = recordsForMonth(state.activeMonth);
  const recordDates = new Set(monthRecords.map((record) => record.date));
  const range = state.draftReportRange ? normalizeRange(state.draftReportRange) : null;
  const lastRange = latestReportRange();
  const days = daysInMonth(state.activeMonth);
  const blanks = (new Date(state.activeMonth.getFullYear(), state.activeMonth.getMonth(), 1).getDay() + 6) % 7;
  const cells = Array.from({ length: blanks }, () => "<span></span>");

  for (let day = 1; day <= days; day += 1) {
    const key = dateKey(new Date(state.activeMonth.getFullYear(), state.activeMonth.getMonth(), day));
    const selected = range && key >= range.start && key <= range.end;
    const inLastRange = lastRange && key >= lastRange.start && key <= lastRange.end;
    const hasRecord = recordDates.has(key);
    cells.push(`
      <button class="${selected ? "is-selected" : ""} ${inLastRange ? "is-last-range" : ""} ${hasRecord ? "has-record" : ""}" type="button" data-report-date="${key}">
        <span>${day}</span>
      </button>
    `);
  }

  els.reportPickGrid.innerHTML = cells.join("");
}

function generatePickedReport() {
  state.reportRange = state.draftReportRange ? normalizeRange(state.draftReportRange) : null;
  const historyItem = saveLastReportRange(state.reportRange);
  syncReportRangeHistory(historyItem).then(() => mergeCloudReportRanges());
  closeReportPicker();
  state.view = "report";
  render();
  drawReport();
}

function recordsForReportRange() {
  const range = state.reportRange;
  return recordsForMonth(state.activeMonth)
    .filter((record) => !range || (record.date >= range.start && record.date <= range.end))
    .sort((a, b) => a.date.localeCompare(b.date) || recordTime(a).localeCompare(recordTime(b)));
}

function renderReportStatus(records) {
  if (!records.length) {
    els.reportStatus.textContent = state.reportRange
      ? `${formatRangeText(state.reportRange)} 没有记录。`
      : "本月还没有可以生成的记录。";
    return;
  }

  els.reportStatus.textContent = state.reportRange
    ? `本次报告：${formatRangeText(state.reportRange)}`
    : "本次报告：本月全部记录。";
}

function saveLastReportRange(range) {
  const ranges = loadLastReportRange();
  const scope = reportRangeScope();
  const history = Array.isArray(ranges[scope]) ? ranges[scope].map(normalizeReportRangeItem) : ranges[scope] ? [normalizeReportRangeItem({ range: ranges[scope] })] : [];
  const item = {
    id: crypto.randomUUID(),
    range: range || { all: true },
    createdAt: new Date().toISOString()
  };
  history.unshift(item);
  ranges[scope] = history.slice(0, 2);
  localStorage.setItem(LAST_REPORT_RANGE_KEY, JSON.stringify(ranges));
  return item;
}

function renderReportHistory() {
  const history = reportRangeHistory();
  if (!history.length) {
    els.reportHistory.textContent = "上次没有选择记录。";
    return;
  }

  els.reportHistory.innerHTML = history.map((item, index) => `
    <div class="${index === 0 ? "is-latest" : ""}">
      <span>${index === 0 ? "上次选择" : `第${index + 1}次`}</span>
      <b>${escapeHtml(formatRangeText(item.range))}</b>
      <small>${escapeHtml(formatHistoryTime(item.createdAt))}</small>
    </div>
  `).join("");
}

function reportRangeHistory() {
  const value = loadLastReportRange()[reportRangeScope()];
  if (!value) return [];
  if (Array.isArray(value)) return value.slice(0, 2);
  return [{ range: value, createdAt: "" }];
}

function latestReportRange() {
  const latest = reportRangeHistory()[0]?.range;
  return latest && !latest.all ? normalizeRange(latest) : null;
}

function loadLastReportRange() {
  try {
    return JSON.parse(localStorage.getItem(LAST_REPORT_RANGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function reportRangeScope() {
  const account = state.user?.id || "local";
  return `${account}:${monthKey(state.activeMonth)}`;
}

async function mergeCloudReportRanges() {
  if (!supabaseClient || !state.user) return;
  const { data, error } = await supabaseClient
    .from(REPORT_RANGES_TABLE)
    .select("*")
    .eq("month", monthKey(state.activeMonth))
    .order("created_at", { ascending: false })
    .limit(2);
  if (error) return;

  const ranges = loadLastReportRange();
  const scope = reportRangeScope();
  const localHistory = Array.isArray(ranges[scope]) ? ranges[scope].map(normalizeReportRangeItem) : ranges[scope] ? [normalizeReportRangeItem({ range: ranges[scope] })] : [];
  const cloudHistory = (data || []).map(reportRangeFromCloud);
  ranges[scope] = mergeReportRangeHistory(cloudHistory, localHistory);
  localStorage.setItem(LAST_REPORT_RANGE_KEY, JSON.stringify(ranges));
  await syncReportRangeItems(ranges[scope]);
}

async function syncReportRangeHistory(item) {
  if (!supabaseClient || !state.user || !item) return;
  await syncReportRangeItems([item]);
}

async function syncReportRangeItems(items) {
  if (!supabaseClient || !state.user || !items?.length) return;

  const payload = items.map(reportRangeToCloud);
  const { error } = await supabaseClient.from(REPORT_RANGES_TABLE).upsert(payload, {
    onConflict: "id",
    ignoreDuplicates: true
  });
  if (error) return;

  const { data } = await supabaseClient
    .from(REPORT_RANGES_TABLE)
    .select("id")
    .eq("month", monthKey(state.activeMonth))
    .order("created_at", { ascending: false });
  const oldIds = (data || []).slice(2).map((record) => record.id);
  if (oldIds.length) {
    await supabaseClient.from(REPORT_RANGES_TABLE).delete().in("id", oldIds);
  }
}

function reportRangeToCloud(item) {
  const range = item.range || { all: true };
  return {
    id: item.id,
    user_id: state.user.id,
    month: monthKey(state.activeMonth),
    start_date: range.all ? null : range.start,
    end_date: range.all ? null : range.end,
    all_records: Boolean(range.all),
    created_at: item.createdAt
  };
}

function reportRangeFromCloud(record) {
  return {
    id: record.id,
    range: record.all_records ? { all: true } : { start: record.start_date, end: record.end_date },
    createdAt: record.created_at || ""
  };
}

function mergeReportRangeHistory(primary, secondary) {
  const items = new Map();
  [...secondary, ...primary].forEach((item) => {
    const normalized = normalizeReportRangeItem(item);
    items.set(normalized.id, normalized);
  });
  return [...items.values()]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 2);
}

function normalizeReportRangeItem(item) {
  return {
    id: item?.id || crypto.randomUUID(),
    range: item?.range || { all: true },
    createdAt: item?.createdAt || new Date().toISOString()
  };
}

function normalizeRange(range) {
  if (!range) return null;
  return range.start <= range.end ? range : { start: range.end, end: range.start };
}

function formatRangeText(range) {
  if (range?.all) return "本月全部记录";
  if (!range) return "本月全部记录";
  return range.start === range.end
    ? formatShortDate(range.start)
    : `${formatShortDate(range.start)} 到 ${formatShortDate(range.end)}`;
}

function formatHistoryTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
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

function formatReportTotalQty(record) {
  const totalPieces = roundMoney(((record.dozenQty || 0) * BUNDLE_SIZE) + (record.looseQty || 0));
  const dozenQty = Math.floor(totalPieces / BUNDLE_SIZE);
  const looseQty = roundMoney(totalPieces - dozenQty * BUNDLE_SIZE);
  const parts = [];
  if (dozenQty > 0) parts.push(`${formatQty(dozenQty)}打`);
  if (looseQty > 0) parts.push(`${formatQty(looseQty)}件`);
  return parts.join(" ") || "0件";
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

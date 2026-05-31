const STORAGE_KEY = "piecework-calendar-v1";
const BACKUP_STORAGE_KEY = "piecework-calendar-backup-v1";
const BUNDLE_SIZE = 12;

const state = {
  records: loadRecords(),
  selectedDate: dateKey(new Date()),
  activeMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  showTrash: false,
  view: "app"
};

const els = {
  appView: document.querySelector("#appView"),
  reportView: document.querySelector("#reportView"),
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
  reportBtn: document.querySelector("#reportBtn"),
  reportCanvas: document.querySelector("#reportCanvas"),
  closeReportBtn: document.querySelector("#closeReportBtn"),
  copyReportBtn: document.querySelector("#copyReportBtn"),
  trashBtn: document.querySelector("#trashBtn"),
  empty: document.querySelector("#emptyState"),
  list: document.querySelector("#workList")
};

let deferredInstallPrompt = null;

init();

function init() {
  state.records = keepCurrentMonthRecords(state.records);
  saveRecords();
  requestPersistentStorage();
  bindEvents();
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
}

function bindEvents() {
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
    render();
  });

  els.form.addEventListener("submit", (event) => {
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

    state.records.push({
      id: crypto.randomUUID(),
      date: state.selectedDate,
      goods,
      price: roundMoney(price),
      dozenQty: roundMoney(dozenQty),
      looseQty: roundMoney(looseQty)
    });

    saveRecords();
    els.form.reset();
    render();
    els.goods.focus();
  });

  els.list.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete]");
    const restoreButton = event.target.closest("[data-restore]");
    const removeButton = event.target.closest("[data-remove]");

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
    }

    saveRecords();
    render();
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

  els.copyReportBtn.addEventListener("click", downloadReport);

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

  els.monthLabel.textContent = "本月总计";
  els.monthTotal.textContent = currency(total);
  els.workDays.textContent = `${days} 天`;
  els.dayTotal.textContent = currency(selectedTotal);
  els.calendarTitle.textContent = formatMonth(state.activeMonth);
  els.selectedDateTitle.textContent = state.showTrash ? "回收站" : formatDateTitle(state.selectedDate);
  els.selectedDateTotal.textContent = state.showTrash ? `${deletedRecords.length} 条` : currency(selectedTotal);
  els.form.hidden = state.showTrash;
  els.trashBtn.textContent = state.showTrash ? "返回" : `回收站${deletedRecords.length ? ` ${deletedRecords.length}` : ""}`;

  renderCalendar(monthRecords);
  state.showTrash ? renderTrashList(deletedRecords) : renderWorkList(selectedRecords);
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

function buildReportGroups(sourceRecords = recordsForMonth(state.activeMonth)) {
  const records = sourceRecords.sort((a, b) => {
    if (a.goods === b.goods) return a.date.localeCompare(b.date);
    return a.goods.localeCompare(b.goods, "zh-CN");
  });

  if (!records.length) {
    return [];
  }

  const grouped = new Map();
  records.forEach((record) => {
    if (!grouped.has(record.goods)) grouped.set(record.goods, new Map());
    const dates = grouped.get(record.goods);
    if (!dates.has(record.date)) dates.set(record.date, { dozenQty: 0, looseQty: 0 });
    const total = dates.get(record.date);
    total.dozenQty = roundMoney(total.dozenQty + (record.dozenQty || 0));
    total.looseQty = roundMoney(total.looseQty + (record.looseQty || 0));
  });

  return [...grouped.entries()].map(([goods, dates]) => ({
    goods,
    rows: [...dates.entries()]
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, qty]) => ({
        day: formatDayOnly(date),
        qty: formatReportQty(qty)
      }))
  }));
}

function drawReport(groups = buildReportGroups()) {
  const canvas = els.reportCanvas;
  const ctx = canvas.getContext("2d");
  const width = 900;
  const padding = 34;
  const cardGap = 16;
  const rowHeight = 34;
  const cardHeader = 46;
  const cardPadding = 18;
  const groupsToDraw = groups.length ? groups : [{ goods: "暂无记录", rows: [{ day: "", qty: "本月还没有做货记录" }] }];
  const height = padding * 2 + 74 + groupsToDraw.reduce((sum, group) => {
    return sum + cardHeader + cardPadding + Math.ceil(group.rows.length / 3) * rowHeight + cardGap;
  }, 0);

  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#f7f2e8";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#17211c";
  ctx.font = "700 34px system-ui, sans-serif";
  ctx.fillText("做货报告", padding, 58);
  ctx.fillStyle = "#6b746e";
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillText(`上班 ${countReportDays(groupsToDraw)} 天`, padding, 94);

  let y = 122;
  groupsToDraw.forEach((group) => {
    const rows = Math.ceil(group.rows.length / 3);
    const cardHeight = cardHeader + cardPadding + rows * rowHeight;
    roundRect(ctx, padding, y, width - padding * 2, cardHeight, 18, "#fffdf7");

    ctx.fillStyle = "#166534";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.fillText(group.goods, padding + 22, y + 34);

    ctx.font = "20px system-ui, sans-serif";
    group.rows.forEach((row, index) => {
      const column = index % 3;
      const line = Math.floor(index / 3);
      const x = padding + 22 + column * 265;
      const rowY = y + cardHeader + 24 + line * rowHeight;
      ctx.fillStyle = "#17211c";
      ctx.fillText(row.day ? `${row.day}  ${row.qty}` : row.qty, x, rowY);
    });

    y += cardHeight + cardGap;
  });
}

function downloadReport() {
  const dataUrl = els.reportCanvas.toDataURL("image/png");
  if (!dataUrl || dataUrl === "data:,") {
    return;
  }

  const isAppleTouch =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let feedback = "已下载";

  try {
    if (isAppleTouch) {
      const opened = window.open(dataUrl, "_blank");
      if (!opened) window.location.href = dataUrl;
      feedback = "已打开图片";
    } else {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `zuohuo-report-${dateKey(new Date())}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  } catch {
    window.open(dataUrl, "_blank");
    feedback = "已打开图片";
  }

  els.copyReportBtn.textContent = feedback;
  setTimeout(() => {
    els.copyReportBtn.textContent = "下载图片";
  }, 1200);
}

function setViewVisibility() {
  const isReport = state.view === "report";
  els.appView.hidden = isReport;
  els.appView.style.display = isReport ? "none" : "grid";
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

function loadRecords() {
  const primary = readStoredRecords(STORAGE_KEY);
  const backup = readStoredRecords(BACKUP_STORAGE_KEY);
  const records = primary ?? backup ?? [];
  return records.map(normalizeRecord);
}

function saveRecords() {
  const value = JSON.stringify(state.records);
  localStorage.setItem(STORAGE_KEY, value);
  localStorage.setItem(BACKUP_STORAGE_KEY, value);
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
  if (record.looseQty > 0) parts.push(`${formatQty(record.looseQty)}闪`);
  return parts.join(" ");
}

function countReportDays(groups) {
  const days = new Set();
  groups.forEach((group) => group.rows.forEach((row) => {
    if (row.day) days.add(row.day);
  }));
  return days.size;
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
      looseQty: record.looseQty ?? 0
    };
  }
  if (record.madeQty === undefined) {
    return {
      ...record,
      dozenQty: record.qty ?? 0,
      looseQty: 0
    };
  }
  return {
    ...record,
    dozenQty: 0,
    looseQty: record.madeQty
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

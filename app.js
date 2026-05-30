const STORAGE_KEY = "tiny-ledger-transactions-v1";

const categories = {
  expense: ["餐饮", "交通", "购物", "住房", "娱乐", "其他"],
  income: ["工资", "奖金", "副业", "红包", "其他"]
};

const sampleTransactions = [
  { id: crypto.randomUUID(), type: "expense", amount: 18, category: "餐饮", note: "午餐", date: new Date().toISOString() },
  { id: crypto.randomUUID(), type: "expense", amount: 6, category: "交通", note: "地铁", date: new Date().toISOString() },
  { id: crypto.randomUUID(), type: "income", amount: 300, category: "副业", note: "临时收入", date: new Date().toISOString() }
];

const state = {
  type: "expense",
  transactions: loadTransactions() ?? sampleTransactions,
  activeMonth: monthKey(new Date())
};

const els = {
  installBtn: document.querySelector("#installBtn"),
  monthLabel: document.querySelector("#monthLabel"),
  balanceText: document.querySelector("#balanceText"),
  trendText: document.querySelector("#trendText"),
  incomeText: document.querySelector("#incomeText"),
  expenseText: document.querySelector("#expenseText"),
  countText: document.querySelector("#countText"),
  chart: document.querySelector("#monthChart"),
  typeButtons: document.querySelectorAll("[data-type]"),
  form: document.querySelector("#entryForm"),
  amount: document.querySelector("#amountInput"),
  category: document.querySelector("#categoryInput"),
  note: document.querySelector("#noteInput"),
  monthFilter: document.querySelector("#monthFilter"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  empty: document.querySelector("#emptyState"),
  list: document.querySelector("#transactionList")
};

let deferredInstallPrompt = null;

init();

function init() {
  if (localStorage.getItem(STORAGE_KEY) === null) {
    saveTransactions();
  }

  bindEvents();
  updateCategories();
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
}

function bindEvents() {
  els.typeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.type = button.dataset.type;
      els.typeButtons.forEach((item) => item.classList.toggle("active", item === button));
      updateCategories();
    });
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const amount = Number.parseFloat(els.amount.value.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      els.amount.focus();
      return;
    }

    state.transactions.unshift({
      id: crypto.randomUUID(),
      type: state.type,
      amount: roundMoney(amount),
      category: els.category.value,
      note: els.note.value.trim(),
      date: new Date().toISOString()
    });

    saveTransactions();
    els.form.reset();
    updateCategories();
    state.activeMonth = monthKey(new Date());
    render();
  });

  els.monthFilter.addEventListener("change", () => {
    state.activeMonth = els.monthFilter.value;
    render();
  });

  els.exportBtn.addEventListener("click", exportCsv);

  els.clearBtn.addEventListener("click", () => {
    if (!state.transactions.length) return;
    if (confirm("确定清空所有账单吗？")) {
      state.transactions = [];
      saveTransactions();
      render();
    }
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
  renderMonthOptions();
  const current = filteredTransactions();
  const income = sumByType(current, "income");
  const expense = sumByType(current, "expense");
  const balance = income - expense;

  els.monthLabel.textContent = `${formatMonth(state.activeMonth)}结余`;
  els.balanceText.textContent = currency(balance);
  els.incomeText.textContent = currency(income);
  els.expenseText.textContent = currency(expense);
  els.countText.textContent = String(current.length);
  els.trendText.textContent = current.length
    ? `本月共 ${current.length} 笔，平均每笔 ${currency((income + expense) / current.length)}`
    : "这个月还没有账单";

  drawChart(current);
  renderList(current);
}

function renderMonthOptions() {
  const months = [...new Set(state.transactions.map((item) => monthKey(new Date(item.date))))];
  if (!months.includes(state.activeMonth)) months.unshift(state.activeMonth);
  months.sort().reverse();

  els.monthFilter.innerHTML = months
    .map((key) => `<option value="${key}">${formatMonth(key)}</option>`)
    .join("");
  els.monthFilter.value = state.activeMonth;
}

function renderList(items) {
  els.empty.hidden = items.length > 0;
  els.list.innerHTML = items.map((item) => {
    const sign = item.type === "income" ? "+" : "-";
    const note = item.note ? ` · ${escapeHtml(item.note)}` : "";
    return `
      <li class="transaction">
        <span class="badge">${escapeHtml(item.category.slice(0, 1))}</span>
        <div>
          <strong>${escapeHtml(item.category)}</strong>
          <span>${formatDate(item.date)}${note}</span>
        </div>
        <span class="amount ${item.type}">${sign}${currency(item.amount)}</span>
      </li>
    `;
  }).join("");
}

function drawChart(items) {
  const ctx = els.chart.getContext("2d");
  const { width, height } = els.chart;
  const income = sumByType(items, "income");
  const expense = sumByType(items, "expense");
  const max = Math.max(income, expense, 1);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f6efe5";
  ctx.roundRect(18, 18, width - 36, height - 36, 18);
  ctx.fill();

  drawBar(ctx, 58, height - 42, 42, -Math.max(8, (expense / max) * 84), "#c8553d", "支出");
  drawBar(ctx, 142, height - 42, 42, -Math.max(8, (income / max) * 84), "#0f766e", "收入");

  ctx.fillStyle = "#65706d";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("本月对比", width / 2, 28);
}

function drawBar(ctx, x, y, w, h, color, label) {
  ctx.fillStyle = color;
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.fillStyle = "#17211f";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y + 18);
}

function updateCategories() {
  els.category.innerHTML = categories[state.type]
    .map((item) => `<option value="${item}">${item}</option>`)
    .join("");
}

function filteredTransactions() {
  return state.transactions.filter((item) => monthKey(new Date(item.date)) === state.activeMonth);
}

function sumByType(items, type) {
  return roundMoney(items
    .filter((item) => item.type === type)
    .reduce((total, item) => total + item.amount, 0));
}

function loadTransactions() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? null : JSON.parse(stored);
  } catch {
    return [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}

function exportCsv() {
  const rows = [["日期", "类型", "分类", "金额", "备注"], ...state.transactions.map((item) => [
    formatDate(item.date),
    item.type === "income" ? "收入" : "支出",
    item.category,
    item.amount,
    item.note
  ])];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `xiaozhangben-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(key) {
  const [year, month] = key.split("-");
  return `${year}年${Number(month)}月`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function currency(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
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

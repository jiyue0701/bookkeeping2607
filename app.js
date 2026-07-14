"use strict";

const STORAGE_KEY = "bookkeeping2607.pwa.state";
const SCHEMA_VERSION = 1;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const TYPE_META = {
  expense: { title: "支出", sign: "−", className: "expense" },
  income: { title: "收入", sign: "+", className: "income" },
  transfer: { title: "转账", sign: "↔", className: "transfer" }
};

const CATEGORY_SETS = {
  expense: [
    ["food", "餐饮", "🍜", "生活"], ["transport", "交通", "🚕", "出行"],
    ["daily", "日用", "🧴", "生活"], ["shopping", "购物", "🛍️", "消费"],
    ["snack", "零食", "🍦", "生活"], ["drink", "饮品", "🧋", "生活"],
    ["vegetable", "蔬菜", "🥬", "生活"], ["fruit", "水果", "🍎", "生活"],
    ["clothes", "服饰", "👕", "消费"], ["entertainment", "娱乐", "🎵", "娱乐"],
    ["beauty", "美容", "💄", "消费"], ["communication", "通讯", "📱", "服务"],
    ["medical", "医疗", "💊", "服务"], ["learning", "学习", "📚", "成长"],
    ["game", "游戏", "🎮", "娱乐"], ["red-packet", "红包", "🧧", "人情"],
    ["family", "家庭", "🏠", "家庭"], ["housing", "住房", "🏡", "家庭"],
    ["delivery", "快递", "📦", "服务"], ["social", "社交", "👥", "人情"],
    ["gift", "礼品", "🎁", "人情"], ["pet", "宠物", "🐾", "家庭"],
    ["car", "汽车", "🚗", "出行"], ["digital", "数码", "📷", "消费"],
    ["books", "书籍", "📖", "成长"], ["office", "办公", "💼", "工作"],
    ["sport", "运动", "🏓", "娱乐"], ["other-expense", "其他", "•••", "其他"]
  ],
  income: [
    ["salary", "工资", "💴", "收入"], ["bonus", "奖金", "⭐", "收入"],
    ["part-time", "兼职", "⏱️", "收入"], ["income-red-packet", "红包", "🧧", "收入"],
    ["refund", "退款", "↩️", "收入"], ["investment", "理财", "📈", "收入"],
    ["other-income", "其他", "•••", "其他"]
  ],
  transfer: [
    ["cash", "现金", "💵", "账户"], ["wechat", "微信", "💬", "账户"],
    ["alipay", "支付宝", "🔵", "账户"], ["bank-card", "银行卡", "💳", "账户"],
    ["other-transfer", "其他", "•••", "其他"]
  ]
};

const ui = {
  tab: "home",
  ledgerMode: "flow",
  statisticsMode: "trend",
  monthCursor: startOfMonth(new Date()),
  selectedDate: dateKey(new Date()),
  modal: false,
  helpModal: false,
  quickEntry: false,
  draft: null
};

let records = [];
let toastTimer = null;
records = loadRecords();

function categoryObjects(type) {
  return CATEGORY_SETS[type].map(([id, name, icon, group], order) => ({ id, name, icon, group, order }));
}

function categoryUsage(type) {
  const counts = new Map();
  records.forEach((record) => {
    if (record.type !== type) return;
    counts.set(record.categoryId, (counts.get(record.categoryId) || 0) + 1);
  });
  return counts;
}

function categoriesFor(type) {
  const usage = categoryUsage(type);
  return categoryObjects(type).sort((left, right) => {
    const countDiff = (usage.get(right.id) || 0) - (usage.get(left.id) || 0);
    return countDiff || left.order - right.order;
  });
}

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRecord(item) {
  const type = TYPE_META[item?.type] ? item.type : "expense";
  const categories = categoriesFor(type);
  const fallback = categories[0];
  const category = categories.find((value) => value.id === item?.categoryId) || fallback;
  const legacyCents = Number(item?.amountCents);
  const amountCents = Number.isFinite(legacyCents)
    ? Math.max(0, Math.round(legacyCents))
    : Math.max(0, Math.round(Number(item?.amount || 0) * 100));

  return {
    id: String(item?.id || makeId()),
    amountCents,
    type,
    categoryId: category.id,
    categoryName: String(item?.categoryName || category.name),
    categoryIcon: String(item?.categoryIcon || category.icon),
    note: String(item?.note || ""),
    occurredAt: item?.occurredAt || new Date().toISOString(),
    accountName: String(item?.accountName || "微信"),
    destinationAccountName: String(item?.destinationAccountName || ""),
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: item?.updatedAt || new Date().toISOString()
  };
}

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || !Array.isArray(raw.records)) return [];
    return raw.records.map(normalizeRecord).filter((item) => item.amountCents > 0);
  } catch (_) {
    return [];
  }
}

function persistRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      records
    }));
  } catch (_) {
    showToast("本机存储空间不足，请不要清除当前网页数据");
  }
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromKey(key) {
  const [year, month, day] = String(key).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function dateTimeValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateFromInput(value) {
  const [datePart, timePart = "00:00"] = String(value).split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0);
}

function sameDay(left, right) {
  return dateKey(left) === dateKey(right);
}

function sameMonth(left, right) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function monthLabel(date) {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}`;
}

function dayLabel(date) {
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} 周${WEEKDAYS[date.getDay()]}`;
}

function longDateLabel(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 周${WEEKDAYS[date.getDay()]}`;
}

function calendarDays(month) {
  const first = startOfMonth(month);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const result = Array(first.getDay()).fill(null);
  for (let day = 1; day <= count; day += 1) {
    result.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  return result;
}

function recordsForMonth(month) {
  return records
    .filter((record) => sameMonth(new Date(record.occurredAt), month))
    .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt));
}

function recordsForDay(key) {
  const date = dateFromKey(key);
  return records
    .filter((record) => sameDay(new Date(record.occurredAt), date))
    .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt));
}

function sumCents(items, type = null) {
  return items.reduce((total, record) => {
    if (type && record.type !== type) return total;
    return total + record.amountCents;
  }, 0);
}

function monthTotals(items) {
  const expense = sumCents(items, "expense");
  const income = sumCents(items, "income");
  return { expense, income, balance: income - expense };
}

function formatMoney(cents) {
  return `¥ ${(Math.abs(Number(cents || 0)) / 100).toFixed(2)}`;
}

function formatBalance(cents) {
  return Number(cents) < 0 ? `− ${formatMoney(cents)}` : formatMoney(cents);
}

function formatSigned(record) {
  const meta = TYPE_META[record.type] || TYPE_META.expense;
  return `${meta.sign} ${formatMoney(record.amountCents)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function parseAmountToCents(text) {
  const value = String(text || "").trim().replace(/,/g, ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function createDraft(type = "expense") {
  const categories = categoriesFor(type);
  return {
    type,
    amountText: "",
    categoryId: categories[0].id,
    occurredAt: dateTimeValue(new Date()),
    note: "",
    accountName: "微信",
    destinationAccountName: "银行卡"
  };
}

function openQuickEntryFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("quick") !== "1") return false;

  const requestedType = params.get("type");
  const type = TYPE_META[requestedType] ? requestedType : "expense";
  const draft = createDraft(type);
  const requestedCategory = params.get("category");
  if (categoriesFor(type).some((category) => category.id === requestedCategory)) {
    draft.categoryId = requestedCategory;
  }
  if (params.has("note")) draft.note = String(params.get("note") || "").slice(0, 200);
  if (params.has("account")) draft.accountName = String(params.get("account") || "").slice(0, 50);

  ui.draft = draft;
  ui.modal = true;
  ui.helpModal = false;
  ui.quickEntry = true;

  const cleanURL = new URL(window.location.href);
  ["quick", "type", "category", "note", "account"].forEach((key) => cleanURL.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${cleanURL.pathname}${cleanURL.search}${cleanURL.hash}`);
  return true;
}

function quickEntryURL() {
  const url = new URL(window.location.href);
  ["quick", "type", "category", "note", "account"].forEach((key) => url.searchParams.delete(key));
  url.searchParams.set("quick", "1");
  return url.toString();
}

async function copyQuickEntryURL() {
  const value = quickEntryURL();
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(value);
    showToast("已复制快速记账网址");
  } catch (_) {
    window.prompt("请复制这个快速记账网址", value);
  }
}

function createRecord(draft, amountCents, category) {
  const now = new Date().toISOString();
  return normalizeRecord({
    id: makeId(),
    amountCents,
    type: draft.type,
    categoryId: category.id,
    categoryName: category.name,
    categoryIcon: category.icon,
    note: draft.note.trim(),
    occurredAt: dateFromInput(draft.occurredAt).toISOString(),
    accountName: draft.accountName.trim() || "未设置账户",
    destinationAccountName: draft.type === "transfer" ? draft.destinationAccountName.trim() : "",
    createdAt: now,
    updatedAt: now
  });
}

function renderSummary(items, label = "本月") {
  const totals = monthTotals(items);
  return `
    <section class="paper-card month-summary">
      <div class="summary-grid">
        <div class="summary-item"><span>${label}支出</span><strong class="expense-text">${formatMoney(totals.expense)}</strong></div>
        <div class="summary-item"><span>${label}收入</span><strong class="income-text">${formatMoney(totals.income)}</strong></div>
        <div class="summary-item"><span>${label}结余</span><strong class="ink-text">${formatBalance(totals.balance)}</strong></div>
      </div>
    </section>`;
}

function renderMonthSwitcher() {
  return `
    <div class="month-switcher">
      <button type="button" data-action="previous-month" aria-label="上个月">‹</button>
      <strong>${monthLabel(ui.monthCursor)}</strong>
      <button type="button" data-action="next-month" aria-label="下个月">›</button>
    </div>`;
}

function renderRecordRow(record, deletable = false) {
  const meta = TYPE_META[record.type] || TYPE_META.expense;
  const detail = record.note || (record.type === "transfer"
    ? `${record.accountName} → ${record.destinationAccountName}`
    : record.accountName);
  return `
    <div class="record-row">
      <div class="record-main">
        <span class="category-icon ${meta.className}">${escapeHtml(record.categoryIcon)}</span>
        <div class="record-copy">
          <strong>${escapeHtml(record.categoryName)}</strong>
          <span>${escapeHtml(detail)}</span>
        </div>
      </div>
      <div class="row-between" style="justify-content:flex-end; flex:0 0 auto;">
        <strong class="record-amount ${meta.className}-text">${formatSigned(record)}</strong>
        ${deletable ? `<button class="icon-button danger" type="button" data-action="delete-record" data-id="${escapeHtml(record.id)}" aria-label="删除记录">×</button>` : ""}
      </div>
    </div>`;
}

function renderEmptyState(title, description, mark = "✦") {
  return `<div class="empty-state"><div class="empty-mark">${mark}</div><strong>${title}</strong><span>${description}</span></div>`;
}

function renderHome() {
  const today = new Date();
  const todayRecords = recordsForDay(dateKey(today));
  const monthRecords = recordsForMonth(today);
  const totals = monthTotals(monthRecords);
  const todayExpense = sumCents(todayRecords, "expense");

  return `
    <div class="page page-home">
      <section class="hero">
        <div class="hero-copy">
          <h1>欢迎光临 ✦</h1>
          <p>默认账本 · ${longDateLabel(today)}</p>
        </div>
        <img class="mascot" src="./assets/black-shiba-mascot.png" alt="米糕黑柴记账助手">
      </section>

      <section class="paper-card">
        <div class="summary-heading"><strong>本月概览</strong><span>${monthLabel(today)}</span></div>
        <div class="summary-grid">
          <div class="summary-item"><span>本月支出</span><strong class="expense-text">${formatMoney(totals.expense)}</strong></div>
          <div class="summary-item"><span>本月收入</span><strong class="income-text">${formatMoney(totals.income)}</strong></div>
          <div class="summary-item"><span>本月结余</span><strong class="ink-text">${formatBalance(totals.balance)}</strong></div>
        </div>
      </section>

      <section class="paper-card receipt-card">
        <div class="summary-heading"><strong>今日小票</strong><span class="expense-text">${formatMoney(todayExpense)}</span></div>
        ${todayRecords.length ? `<div class="record-list">${todayRecords.slice(0, 6).map((record) => renderRecordRow(record)).join("")}</div>` : renderEmptyState("今天还没有记录", "点下面的铅笔，记下第一笔吧", "📝")}
        <div class="receipt-total"><span>今日支出</span><strong class="expense-text">${formatMoney(todayExpense)}</strong></div>
      </section>

      <section class="paper-card migao-reminder-card">
        <div class="section-heading"><div><h2>米糕提醒</h2><div class="subtle">账单只保存在这台设备的浏览器里</div></div><span class="reminder-mark" aria-hidden="true">🐕</span></div>
        <p class="subtle reminder-copy">不要使用无痕模式，也不要清除 Safari 的网站数据。以后更新功能时，会继续保留这台设备里的账单。</p>
      </section>

      <section class="paper-card home-help-card">
        <div class="home-help-row">
          <span class="offline-chip">● 离线可用</span>
          <button class="small-chip home-install-button" type="button" data-action="help">怎么安装到 iPhone？</button>
        </div>
      </section>

    </div>`;
}

function renderLedger() {
  const monthRecords = recordsForMonth(ui.monthCursor);
  return `
    <div class="page">
      <div class="page-title-row">
        <div><span class="eyebrow">流水 · 日历</span><h1>账单</h1></div>
        <button class="round-button" type="button" data-action="add" aria-label="记一笔">＋</button>
      </div>
      <div class="segmented">
        <button class="${ui.ledgerMode === "flow" ? "active" : ""}" type="button" data-action="ledger-mode" data-mode="flow">流水</button>
        <button class="${ui.ledgerMode === "calendar" ? "active" : ""}" type="button" data-action="ledger-mode" data-mode="calendar">日历</button>
      </div>
      ${renderMonthSwitcher()}
      ${renderSummary(monthRecords)}
      ${ui.ledgerMode === "flow" ? renderFlow(monthRecords) : renderCalendar(monthRecords)}
    </div>`;
}

function renderFlow(monthRecords) {
  if (!monthRecords.length) {
    return `<section class="paper-card">${renderEmptyState("这个月还没有记录", "点右上角的加号，开始记账吧", "🧾")}</section>`;
  }

  const groups = new Map();
  monthRecords.forEach((record) => {
    const key = dateKey(new Date(record.occurredAt));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return Array.from(groups.entries()).map(([key, dayRecords]) => {
    const date = dateFromKey(key);
    const expense = sumCents(dayRecords, "expense");
    return `
      <section class="paper-card day-card">
        <div class="day-heading"><strong>${dayLabel(date)}</strong><span>支出 ${formatMoney(expense)}</span></div>
        <div class="record-list">${dayRecords.map((record) => renderRecordRow(record, true)).join("")}</div>
      </section>`;
  }).join("");
}

function renderCalendar(monthRecords) {
  const month = ui.monthCursor;
  const selectedKey = sameMonth(dateFromKey(ui.selectedDate), month) ? ui.selectedDate : dateKey(month);
  const selectedRecords = recordsForDay(selectedKey);
  const cells = calendarDays(month).map((date) => {
    if (!date) return `<span class="calendar-cell" aria-hidden="true"></span>`;
    const key = dateKey(date);
    const expense = sumCents(monthRecords.filter((record) => sameDay(new Date(record.occurredAt), date)), "expense");
    return `
      <button class="calendar-cell ${key === selectedKey ? "selected" : ""} ${expense > 0 ? "has-expense" : ""}" type="button" data-action="calendar-date" data-date="${key}">
        <span class="calendar-day">${date.getDate()}</span>
        <span class="calendar-expense">${expense > 0 ? formatMoney(expense).replace("¥ ", "") : ""}</span>
      </button>`;
  }).join("");

  return `
    <section class="paper-card calendar-card">
      <div class="weekdays">${WEEKDAYS.map((weekday) => `<span>${weekday}</span>`).join("")}</div>
      <div class="calendar-grid">${cells}</div>
    </section>
    <section class="paper-card selected-date-card">
      <div class="section-heading"><div><h2>${dayLabel(dateFromKey(selectedKey))}</h2><div class="subtle">当天记录</div></div><span class="small-chip">${selectedRecords.length} 笔</span></div>
      ${selectedRecords.length ? `<div class="record-list">${selectedRecords.map((record) => renderRecordRow(record, true)).join("")}</div>` : renderEmptyState("这一天还没有记录", "选择其他日期，或直接记一笔", "☀")}
    </section>`;
}

function renderStatistics() {
  const monthRecords = recordsForMonth(ui.monthCursor);
  return `
    <div class="page">
      <div class="page-title-row"><div><span class="eyebrow">趋势 · 分类</span><h1>统计</h1></div><span class="small-chip">本地计算</span></div>
      <div class="segmented">
        <button class="${ui.statisticsMode === "trend" ? "active" : ""}" type="button" data-action="statistics-mode" data-mode="trend">趋势</button>
        <button class="${ui.statisticsMode === "ranking" ? "active" : ""}" type="button" data-action="statistics-mode" data-mode="ranking">排行</button>
      </div>
      ${renderMonthSwitcher()}
      ${renderSummary(monthRecords)}
      ${ui.statisticsMode === "trend" ? renderTrend(monthRecords) : renderRanking(monthRecords)}
      ${renderQuickStats(monthRecords)}
    </div>`;
}

function dailyExpenses(month) {
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthRecords = recordsForMonth(month);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
    const dayRecords = monthRecords.filter((record) => sameDay(new Date(record.occurredAt), date));
    return { date, amountCents: sumCents(dayRecords, "expense") };
  });
}

function renderTrend(monthRecords) {
  const daily = dailyExpenses(ui.monthCursor);
  const max = Math.max(...daily.map((item) => item.amountCents), 1);
  const total = sumCents(monthRecords, "expense");
  const bars = daily.map((item) => {
    const height = item.amountCents ? Math.max(5, (item.amountCents / max) * 100) : 2;
    const label = item.date.getDate() % 5 === 0 || item.date.getDate() === 1 ? item.date.getDate() : "";
    return `<div class="bar-slot" title="${dayLabel(item.date)}：${formatMoney(item.amountCents)}"><div class="bar" style="--bar-height:${height}%"></div><span>${label}</span></div>`;
  }).join("");

  return `
    <section class="paper-card stats-card">
      <div class="section-heading"><div><h2>支出趋势</h2><div class="subtle">每天的支出金额</div></div><span class="expense-text" style="font-weight:900;">${formatMoney(total)}</span></div>
      ${total ? `<div class="chart-wrap"><div class="bar-chart">${bars}</div></div><div class="chart-note">左右滑动查看整月 · 点击柱子可看当天金额</div>` : renderEmptyState("还没有支出趋势", "开始记账后，这里会慢慢长出曲线", "📊")}
    </section>`;
}

function rankingStats(monthRecords) {
  const map = new Map();
  monthRecords.filter((record) => record.type === "expense").forEach((record) => {
    if (!map.has(record.categoryId)) {
      map.set(record.categoryId, { name: record.categoryName, icon: record.categoryIcon, amountCents: 0 });
    }
    map.get(record.categoryId).amountCents += record.amountCents;
  });
  return Array.from(map.values()).sort((left, right) => right.amountCents - left.amountCents);
}

function renderRanking(monthRecords) {
  const stats = rankingStats(monthRecords);
  if (!stats.length) {
    return `<section class="paper-card">${renderEmptyState("还没有分类排行", "记录几笔支出后，就能看到消费去向", "🏷")}</section>`;
  }
  const max = stats[0].amountCents || 1;
  return `
    <section class="paper-card stats-card">
      <div class="section-heading"><div><h2>分类排行</h2><div class="subtle">按支出金额从高到低</div></div><span class="small-chip">${stats.length} 类</span></div>
      <div class="ranking-list">
        ${stats.map((item) => `
          <div>
            <div class="ranking-top"><span class="category-icon expense">${escapeHtml(item.icon)}</span><span class="ranking-name">${escapeHtml(item.name)}</span><span class="ranking-value">${formatMoney(item.amountCents)}</span></div>
            <div class="progress-track"><div class="progress-value" style="width:${(item.amountCents / max) * 100}%"></div></div>
          </div>`).join("")}
      </div>
    </section>`;
}

function renderQuickStats(monthRecords) {
  const totals = monthTotals(monthRecords);
  const days = new Date(ui.monthCursor.getFullYear(), ui.monthCursor.getMonth() + 1, 0).getDate();
  const expenses = monthRecords.filter((record) => record.type === "expense");
  const highest = expenses.reduce((max, record) => Math.max(max, record.amountCents), 0);
  return `
    <section class="paper-card">
      <div class="section-heading"><div><h2>本月速览</h2><div class="subtle">共 ${monthRecords.length} 笔记录</div></div></div>
      <div class="quick-list">
        <div class="quick-row"><span>平均每天支出</span><strong>${formatMoney(Math.round(totals.expense / Math.max(days, 1)))}</strong></div>
        <div class="quick-row"><span>最高单笔支出</span><strong>${formatMoney(highest)}</strong></div>
        <div class="quick-row"><span>本月结余</span><strong>${formatBalance(totals.balance)}</strong></div>
      </div>
    </section>`;
}

function renderSettings() {
  const preview = categoriesFor("expense").slice(0, 8);
  return `
    <div class="page">
      <div class="page-title-row"><div><span class="eyebrow">本地 · 米糕</span><h1>我的</h1></div><span class="small-chip">v1.0</span></div>
      <section class="paper-card">
        <div class="settings-brand"><img class="mascot small" src="./assets/black-shiba-mascot.png" alt="米糕黑柴"><div class="settings-brand-copy"><strong>米糕记账</strong><span>记录每一个值得记住的日常</span></div></div>
      </section>
      <section class="paper-card">
        <div class="section-heading"><div><h2>基础分类</h2><div class="subtle">第一版内置常用分类</div></div><span class="small-chip">28 类支出</span></div>
        <div class="category-summary">${preview.map((item) => `<div class="category-summary-item"><span class="category-icon expense">${item.icon}</span><span>${item.name}</span></div>`).join("")}</div>
      </section>
      <section class="paper-card">
        <div class="section-heading"><div><h2>当前版本</h2><div class="subtle">轻量、离线、不收费</div></div></div>
        <div class="settings-list">
          <div class="settings-line"><span class="line-icon">▣</span><span>账单保存在本机浏览器</span><small>${records.length} 笔</small></div>
          <div class="settings-line"><span class="line-icon">¥</span><span>人民币元，固定两位小数</span></div>
          <div class="settings-line"><span class="line-icon">⌁</span><span>网页更新不改变本地数据</span></div>
        </div>
      </section>
      <section class="paper-card">
        <div class="section-heading"><div><h2>数据管理</h2><div class="subtle">暂不做导出，先提供演示和清空</div></div></div>
        <div class="modal-actions">
          <button class="action-button secondary" type="button" data-action="demo-data">加入演示账单</button>
          <button class="action-button danger" type="button" data-action="clear-data">清空本机全部账单</button>
        </div>
      </section>
      <section class="paper-card">
        <div class="section-heading"><div><h2>米糕的话</h2><div class="subtle">网页版不需要上架或开发者年费</div></div><span>🐕</span></div>
        <div class="subtle" style="line-height:1.65;">用 Safari 打开网址，再添加到主屏幕。之后就像打开一个小 App 一样使用。</div>
      </section>
    </div>`;
}

function renderAddModal() {
  const draft = ui.draft || createDraft();
  const categories = categoriesFor(draft.type);
  const meta = TYPE_META[draft.type];
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal-sheet" data-modal-sheet aria-label="记一笔">
        <div class="modal-heading"><h2>${ui.quickEntry ? "快速记一笔" : "记一笔"}</h2><button class="close-button" type="button" data-action="close-modal" aria-label="关闭">×</button></div>
        <form data-form="add-record">
          <div class="type-pills">
            ${Object.entries(TYPE_META).map(([type, value]) => `<button class="type-pill ${value.className} ${draft.type === type ? "active" : ""}" type="button" data-action="select-type" data-type="${type}">${value.title}</button>`).join("")}
          </div>
          <section class="paper-card amount-card form-card">
            <div class="amount-label">金额（元）</div>
            <div class="amount-entry"><em class="${meta.className}-text">¥</em><input data-draft-field="amountText" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${escapeHtml(draft.amountText)}" aria-label="金额"></div>
          </section>
          <section class="paper-card form-card">
            <div class="field"><label for="record-note">备注</label><textarea id="record-note" data-draft-field="note" placeholder="例如：午餐、打车上班">${escapeHtml(draft.note)}</textarea></div>
          </section>
          <section class="paper-card form-card">
            <div class="section-heading"><div><h2>选择分类</h2><div class="subtle">基础分类 · 常用分类优先</div></div></div>
            <div class="category-grid">${categories.map((category) => `<button class="category-button ${draft.categoryId === category.id ? "selected" : ""}" type="button" data-action="select-category" data-category="${category.id}"><span class="category-icon ${meta.className}">${category.icon}</span><span>${category.name}</span></button>`).join("")}</div>
          </section>
          <section class="paper-card form-card">
            <div class="field-grid">
              <div class="field"><label for="occurred-at">日期和时间</label><input id="occurred-at" type="datetime-local" data-draft-field="occurredAt" value="${escapeHtml(draft.occurredAt)}"></div>
              <div class="field"><label for="account-name">${draft.type === "transfer" ? "转出账户" : "账户"}</label><input id="account-name" data-draft-field="accountName" value="${escapeHtml(draft.accountName)}" placeholder="例如：微信"></div>
              ${draft.type === "transfer" ? `<div class="field"><label for="destination-account">转入账户</label><input id="destination-account" data-draft-field="destinationAccountName" value="${escapeHtml(draft.destinationAccountName)}" placeholder="例如：银行卡"></div>` : ""}
            </div>
          </section>
          <button class="action-button" type="submit">保存这笔记录</button>
        </form>
      </section>
    </div>`;
}

function renderHelpModal() {
  return `
    <div class="modal-backdrop" data-action="close-help">
      <section class="modal-sheet" data-modal-sheet aria-label="安装说明">
        <div class="modal-heading"><h2>添加到 iPhone</h2><button class="close-button" type="button" data-action="close-help" aria-label="关闭">×</button></div>
        <div class="help-copy">
          <div class="help-step"><b>1</b><div>用 <strong>Safari</strong> 打开这个 PWA 的网址。</div></div>
          <div class="help-step"><b>2</b><div>点击底部或顶部的<strong>分享</strong>按钮。</div></div>
           <div class="help-step"><b>3</b><div>选择<strong>添加到主屏幕</strong>，确认名称为“米糕记账”。</div></div>
           <div class="help-step"><b>4</b><div>从主屏幕打开图标，就会以独立网页 App 的样式运行。</div></div>
           <p>数据保存在本机浏览器里。不要用无痕模式，也不要清除 Safari 网站数据；换手机前暂时没有自动同步和导出功能。</p>
          <section class="quick-help-card">
            <h3>双击辅助触控，快速记一笔</h3>
            <p>发布完成后，复制专用网址，在 iPhone「快捷指令」中新建一个“打开 URL”快捷指令并命名。然后到“设置 → 辅助功能 → 触控 → 辅助触控 → 双击”里选择它（不同 iOS 版本的菜单名称可能略有不同）。</p>
            <p>这个入口会直接打开“快速记一笔”页面，输入金额后保存；如果双击动作列表没有直接显示快捷指令，可把快捷指令加入辅助触控顶层菜单，或改用“背部轻点”。</p>
            <p><strong>数据提醒：</strong>主屏幕独立 Web App 和 Safari 可能是两套本地账单。当前没有同步/导出功能；要使用这个快捷入口，建议日常也用 Safari 模式，不要同时混用两种入口。</p>
            <button class="action-button secondary" type="button" data-action="copy-quick-url">复制快速记账网址</button>
          </section>
         </div>
        <div class="modal-actions"><button class="action-button secondary" type="button" data-action="close-help">知道了</button></div>
      </section>
    </div>`;
}

function renderModals() {
  if (ui.modal) return renderAddModal();
  if (ui.helpModal) return renderHelpModal();
  return "";
}

function render() {
  document.querySelector("#page").innerHTML = {
    home: renderHome,
    ledger: renderLedger,
    statistics: renderStatistics,
    settings: renderSettings
  }[ui.tab]();

  document.querySelector("#modal-root").innerHTML = renderModals();
  document.querySelectorAll(".nav-item[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === ui.tab);
  });
}

function openAddModal() {
  ui.draft = createDraft("expense");
  ui.modal = true;
  ui.helpModal = false;
  ui.quickEntry = false;
  render();
  window.setTimeout(() => document.querySelector('[data-draft-field="amountText"]')?.focus(), 50);
}

function closeModal() {
  ui.modal = false;
  ui.quickEntry = false;
  ui.draft = null;
  render();
}

function showToast(message) {
  const element = document.querySelector("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove("show"), 2300);
}

function addDemoData() {
  const today = startOfDay(new Date());
  const demo = [
    [14.90, "expense", "gift", "请孙浩铭喝奶茶", 0],
    [15.60, "expense", "transport", "打车上班", 0],
    [55.50, "expense", "shopping", "温湿度计×2", -1],
    [2.70, "expense", "transport", "回家地铁", -1],
    [21.50, "expense", "food", "午餐", -1],
    [3200.00, "income", "salary", "月度工资", -4]
  ];
  demo.forEach(([amount, type, categoryId, note, offset]) => {
    const category = categoriesFor(type).find((item) => item.id === categoryId) || categoriesFor(type)[0];
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12, 0);
    records.push(createRecord({ type, note, occurredAt: dateTimeValue(date), accountName: "微信", destinationAccountName: "银行卡" }, Math.round(amount * 100), category));
  });
  persistRecords();
  ui.tab = "home";
  render();
  showToast("已加入一组演示账单");
}

function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;
  if (!window.confirm(`确定删除“${record.categoryName} ${formatMoney(record.amountCents)}”吗？`)) return;
  records = records.filter((item) => item.id !== id);
  persistRecords();
  render();
  showToast("已删除这笔记录");
}

function clearData() {
  if (!records.length) {
    showToast("当前没有账单");
    return;
  }
  if (!window.confirm("确定清空这台设备上的全部账单吗？此操作不能撤销。")) return;
  records = [];
  persistRecords();
  render();
  showToast("本机账单已清空");
}

function saveDraft(event) {
  event.preventDefault();
  const draft = ui.draft;
  if (!draft) return;
  const amountCents = parseAmountToCents(draft.amountText);
  if (!amountCents) {
    showToast("请输入大于 0 且最多两位小数的金额");
    document.querySelector('[data-draft-field="amountText"]')?.focus();
    return;
  }
  const occurredDate = dateFromInput(draft.occurredAt);
  if (Number.isNaN(occurredDate.getTime())) {
    showToast("请选择有效的日期和时间");
    return;
  }
  const category = categoriesFor(draft.type).find((item) => item.id === draft.categoryId) || categoriesFor(draft.type)[0];
  records.push(createRecord(draft, amountCents, category));
  persistRecords();
  ui.modal = false;
  ui.quickEntry = false;
  ui.draft = null;
  render();
  showToast("已保存这笔记录");
}

function handleClick(event) {
  const tab = event.target.closest("[data-tab]");
  if (tab) {
    ui.tab = tab.dataset.tab;
    render();
    return;
  }

  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.action;

  if (action === "close-modal" && event.target !== actionElement && actionElement.dataset.modalSheet === undefined) return;
  if (action === "close-help" && event.target !== actionElement && actionElement.dataset.modalSheet === undefined) return;

  switch (action) {
    case "add":
      openAddModal();
      break;
    case "help":
      ui.helpModal = true;
      render();
      break;
    case "close-modal":
      closeModal();
      break;
    case "close-help":
      ui.helpModal = false;
      render();
      break;
    case "copy-quick-url":
      copyQuickEntryURL();
      break;
    case "select-type":
      if (ui.draft) {
        ui.draft.type = actionElement.dataset.type;
        ui.draft.categoryId = categoriesFor(ui.draft.type)[0].id;
        render();
      }
      break;
    case "select-category":
      if (ui.draft) {
        ui.draft.categoryId = actionElement.dataset.category;
        render();
      }
      break;
    case "ledger-mode":
      ui.ledgerMode = actionElement.dataset.mode;
      render();
      break;
    case "statistics-mode":
      ui.statisticsMode = actionElement.dataset.mode;
      render();
      break;
    case "previous-month":
      ui.monthCursor = addMonths(ui.monthCursor, -1);
      ui.selectedDate = dateKey(ui.monthCursor);
      render();
      break;
    case "next-month":
      ui.monthCursor = addMonths(ui.monthCursor, 1);
      ui.selectedDate = dateKey(ui.monthCursor);
      render();
      break;
    case "calendar-date":
      ui.selectedDate = actionElement.dataset.date;
      render();
      break;
    case "delete-record":
      deleteRecord(actionElement.dataset.id);
      break;
    case "demo-data":
      addDemoData();
      break;
    case "clear-data":
      clearData();
      break;
    default:
      break;
  }
}

function handleInput(event) {
  const field = event.target.closest("[data-draft-field]");
  if (field && ui.draft) ui.draft[field.dataset.draftField] = field.value;
}

function init() {
  ["gesturestart", "gesturechange", "gestureend"].forEach((eventName) => {
    document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
  });
  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("submit", (event) => {
    if (event.target.matches('[data-form="add-record"]')) saveDraft(event);
  });
  const quickEntryRequested = openQuickEntryFromURL();
  render();
  if (quickEntryRequested) {
    window.setTimeout(() => document.querySelector('[data-draft-field="amountText"]')?.focus(), 50);
  }

  if ("serviceWorker" in navigator && ["https:", "http:"].includes(window.location.protocol)) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
  if (navigator.storage && typeof navigator.storage.persist === "function") {
    navigator.storage.persist().catch(() => {});
  }
}

init();

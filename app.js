"use strict";

const STORAGE_KEY = "bookkeeping2607.pwa.state";
const SCHEMA_VERSION = 1;
const BACKUP_FORMAT = "migao-bookkeeping-backup";
const BACKUP_VERSION = 1;
const AUTO_BACKUP_DB = "migao-bookkeeping-local-backup";
const AUTO_BACKUP_STORE = "snapshots";
const EXPORT_HISTORY_KEY = "bookkeeping2607.pwa.lastExportAt";
const CLOUD_SYNC_CONFIG_KEY = "bookkeeping2607.pwa.cloudSync";
const CLOUD_SYNC_FORMAT = "migao-cloud-backup-encrypted";
const CLOUD_SYNC_VERSION = 1;
const CLOUD_SYNC_DEFAULT_ENDPOINT = "https://migao-bookkeeping-cloud.migao-bookkeeping.workers.dev";
const CLOUD_SYNC_TIMEOUT_MS = 10000;
const CLOUD_SYNC_RETRY_MIN_MS = 30000;
const CLOUD_SYNC_RETRY_MAX_MS = 5 * 60 * 1000;
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

const CATEGORY_ICON_NAMES = Object.freeze({
  food: "tools-kitchen-2",
  transport: "car",
  daily: "bottle",
  shopping: "shopping-bag",
  snack: "ice-cream-2",
  drink: "cup",
  vegetable: "salad",
  fruit: "apple",
  clothes: "shirt",
  entertainment: "music",
  beauty: "sparkles",
  communication: "device-mobile",
  medical: "pill",
  learning: "school",
  game: "device-gamepad-2",
  "red-packet": "gift-card",
  family: "users",
  housing: "building-cottage",
  delivery: "package",
  social: "friends",
  gift: "gift",
  pet: "paw",
  car: "car",
  digital: "camera",
  books: "book-2",
  office: "briefcase",
  sport: "run",
  "other-expense": "dots",
  salary: "wallet",
  bonus: "star",
  "part-time": "clock-hour-4",
  "income-red-packet": "gift-card",
  refund: "arrow-back-up",
  investment: "chart-line",
  "other-income": "dots",
  cash: "cash-banknote",
  wechat: "message-circle",
  alipay: "currency-yuan",
  "bank-card": "credit-card",
  "other-transfer": "dots"
});

function iconMarkup(name, className = "") {
  const classes = ["app-icon", className].filter(Boolean).join(" ");
  return `<img class="${classes}" src="./assets/icons/${name}.svg" alt="" aria-hidden="true" decoding="async">`;
}

function categoryIconMarkup(categoryId, className = "expense") {
  const iconName = CATEGORY_ICON_NAMES[categoryId] || "dots";
  return `<span class="category-icon ${className}">${iconMarkup(iconName, "category-glyph")}</span>`;
}

const ui = {
  tab: "home",
  ledgerMode: "flow",
  statisticsMode: "trend",
  monthCursor: startOfMonth(new Date()),
  selectedDate: dateKey(new Date()),
  trendSelectedDate: null,
  statsCategoryId: null,
  modal: false,
  helpModal: false,
  recordActionId: null,
  quickEntry: false,
  showAllCategories: false,
  showMoreOptions: false,
  draft: null
};

let records = [];
let toastTimer = null;
let trendPointerHandledAt = 0;
let trendDragActive = false;
let navigationSwipe = null;
let autoBackupTimer = null;
let midnightBackupTimer = null;
let cloudBackupTimer = null;
let cloudRetryTimer = null;
let cloudRetryDelayMs = CLOUD_SYNC_RETRY_MIN_MS;
let cloudStartupSyncDone = false;
let autoBackupStatus = {
  supported: typeof window !== "undefined" && !!window.indexedDB,
  available: false,
  savedAt: null,
  recordCount: 0
};
let lastManualBackupAt = loadLastManualBackupAt();
let cloudSyncConfig = loadCloudSyncConfig();
let cloudSyncDirty = !!cloudSyncConfig?.pendingUploadAt;
let cloudSyncStatus = "";
let cloudSyncBusy = false;
let mascotReactionTimer = null;
let serviceWorkerControllerBound = false;
let serviceWorkerSwapPending = false;
let pendingUndo = null;
records = loadRecords();

const PRIMARY_TABS = ["home", "ledger", "statistics", "settings"];
const SWIPE_MIN_DISTANCE = 84;
const SWIPE_MAX_DURATION = 700;

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

function loadLastManualBackupAt() {
  try {
    return localStorage.getItem(EXPORT_HISTORY_KEY) || null;
  } catch (_) {
    return null;
  }
}

function loadCloudSyncConfig() {
  try {
    const value = JSON.parse(localStorage.getItem(CLOUD_SYNC_CONFIG_KEY) || "null");
    if (!value?.enabled || !value?.endpoint || !value?.accountId || !value?.authHash || !value?.encryptionKey) return null;
    return {
      enabled: true,
      endpoint: String(value.endpoint),
      accountLabel: String(value.accountLabel || "已绑定账号"),
      accountId: String(value.accountId),
      authHash: String(value.authHash),
      encryptionKey: String(value.encryptionKey),
      identityVersion: Number(value.identityVersion || 1),
      lastUploadedAt: value.lastUploadedAt || null,
      lastRestoredAt: value.lastRestoredAt || null,
      lastSyncedAt: value.lastSyncedAt || value.lastUploadedAt || null,
      lastSyncAttemptAt: value.lastSyncAttemptAt || null,
      lastSyncError: value.lastSyncError || null,
      pendingUploadAt: value.pendingUploadAt || null
    };
  } catch (_) {
    return null;
  }
}

function saveCloudSyncConfig(config) {
  cloudSyncConfig = config;
  try {
    if (config) {
      localStorage.setItem(CLOUD_SYNC_CONFIG_KEY, JSON.stringify(config));
    } else {
      localStorage.removeItem(CLOUD_SYNC_CONFIG_KEY);
    }
  } catch (_) {
    showToast("云备份配置保存失败，请检查本机存储空间");
  }
}

function markManualBackupPrepared() {
  lastManualBackupAt = new Date().toISOString();
  try {
    localStorage.setItem(EXPORT_HISTORY_KEY, lastManualBackupAt);
  } catch (_) {
    // This timestamp is only a reminder; failing to save it must not block backup export.
  }
}

function persistRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      records
    }));
    scheduleAutoBackup();
    scheduleCloudBackup();
    return true;
  } catch (_) {
    showToast("本机存储空间不足，请不要清除当前网页数据");
    return false;
  }
}

function bytesToBase64(bytes) {
  let value = "";
  bytes.forEach((byte) => {
    value += String.fromCharCode(byte);
  });
  return btoa(value);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function textBytes(value) {
  return new TextEncoder().encode(String(value));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", textBytes(value));
  return bytesToHex(new Uint8Array(digest));
}

function normalizePhone(value) {
  const text = String(value || "").trim();
  const leadingPlus = text.startsWith("+") ? "+" : "";
  return `${leadingPlus}${text.replace(/[^\d]/g, "")}`;
}

function maskPhone(value) {
  const text = String(value || "");
  if (text.length <= 7) return text;
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function normalizeEndpoint(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function deriveCloudIdentity(phone, pin) {
  if (!crypto.subtle) throw new Error("web crypto unavailable");
  const normalizedPhone = normalizePhone(phone);
  const normalizedPin = String(pin || "").trim();
  if (!/^\+?\d{6,20}$/.test(normalizedPhone)) throw new Error("invalid phone");
  if (normalizedPin.length < 4 || normalizedPin.length > 32) throw new Error("invalid pin");

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textBytes(`${normalizedPhone}:${normalizedPin}`),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: textBytes("migao-cloud-sync-v1"),
      iterations: 200000,
      hash: "SHA-256"
    },
    keyMaterial,
    512
  );
  const derived = new Uint8Array(bits);
  const encryptionKey = bytesToBase64(derived.slice(0, 32));
  const authSecret = bytesToBase64(derived.slice(32, 64));
  const accountId = await sha256Hex(`migao-account-v2:${normalizedPhone}`);
  const legacyAccountId = await sha256Hex(`migao-account:${normalizedPhone}:${normalizedPin}`);
  const authHash = await sha256Hex(`migao-auth:${accountId}:${authSecret}`);
  const legacyAuthHash = await sha256Hex(`migao-auth:${legacyAccountId}:${authSecret}`);

  return {
    accountId,
    authHash,
    encryptionKey,
    accountLabel: maskPhone(normalizedPhone),
    identityVersion: 2,
    legacyAccountId,
    legacyAuthHash
  };
}

async function importAesKey(base64Key) {
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(base64Key),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptCloudPayload(payload, base64Key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(base64Key);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textBytes(JSON.stringify(payload))
  );
  return {
    format: CLOUD_SYNC_FORMAT,
    version: CLOUD_SYNC_VERSION,
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function decryptCloudPayload(encryptedPayload, base64Key) {
  if (encryptedPayload?.format !== CLOUD_SYNC_FORMAT) throw new Error("cloud format mismatch");
  const key = await importAesKey(base64Key);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encryptedPayload.iv) },
    key,
    base64ToBytes(encryptedPayload.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function cloudRequest(path, options = {}) {
  if (!cloudSyncConfig?.endpoint) throw new Error("cloud sync disabled");
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CLOUD_SYNC_TIMEOUT_MS);
  try {
    const response = await fetch(`${cloudSyncConfig.endpoint}${path}`, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = data?.error || `cloud request failed: ${response.status}`;
      throw new Error(message);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("timeout");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function cloudFailureText(error) {
  if (error?.message === "forbidden") return "同步密码不匹配：这个手机号已绑定其它同步密码";
  return "云端暂时无法连接，账单已保存在本机并会自动重试";
}

function cloudStatusIsImportant() {
  return cloudSyncBusy || /失败|不匹配|无法连接|等待|正在/.test(cloudSyncStatus);
}

function cloudSyncText() {
  if (cloudSyncStatus && cloudStatusIsImportant()) return cloudSyncStatus;
  if (!cloudSyncConfig) return "未开启。使用手机号作为账号，再设置同步密码/PIN；开启后会自动拉取合并、保存后自动上传。";
  if (cloudSyncConfig.identityVersion !== 2) return `${cloudSyncConfig.accountLabel} 使用旧版云备份配置。同手机号不同 PIN 会分成两套备份；建议关闭后用最终 PIN 重新开启。`;
  if (cloudSyncConfig.lastSyncError) return cloudSyncConfig.lastSyncError;
  if (cloudSyncConfig.pendingUploadAt) return "账单已保存在本机，正在等待自动上传";
  const last = cloudSyncConfig.lastSyncedAt
    ? `上次成功同步：${backupTimeLabel(cloudSyncConfig.lastSyncedAt)}`
    : "正在等待首次自动同步";
  return `${cloudSyncConfig.accountLabel} 已开启自动同步。打开时自动合并，记账后约 3 秒自动上传。${last}`;
}

function clearCloudRetry() {
  if (cloudRetryTimer) window.clearTimeout(cloudRetryTimer);
  cloudRetryTimer = null;
  cloudRetryDelayMs = CLOUD_SYNC_RETRY_MIN_MS;
}

function scheduleCloudRetry() {
  if (!cloudSyncConfig?.enabled || cloudRetryTimer || navigator.onLine === false) return;
  const delay = cloudRetryDelayMs;
  cloudRetryTimer = window.setTimeout(async () => {
    cloudRetryTimer = null;
    if (document.visibilityState === "hidden") {
      scheduleCloudRetry();
      return;
    }
    const synced = await syncCloudNow(false);
    if (synced) {
      clearCloudRetry();
      return;
    }
    cloudRetryDelayMs = Math.min(CLOUD_SYNC_RETRY_MAX_MS, cloudRetryDelayMs * 2);
    scheduleCloudRetry();
  }, delay);
}

function scheduleCloudBackup(delayMs = 3000) {
  if (!cloudSyncConfig?.enabled) return;
  cloudSyncDirty = true;
  saveCloudSyncConfig({
    ...cloudSyncConfig,
    pendingUploadAt: cloudSyncConfig.pendingUploadAt || new Date().toISOString()
  });
  cloudSyncStatus = navigator.onLine === false
    ? "账单已保存在本机，联网后会自动同步"
    : "账单已保存在本机，等待自动同步";
  if (cloudBackupTimer) window.clearTimeout(cloudBackupTimer);
  cloudBackupTimer = window.setTimeout(() => {
    cloudBackupTimer = null;
    uploadCloudBackup(false);
  }, delayMs);
}

async function uploadCloudBackup(manual = true) {
  if (!cloudSyncConfig?.enabled) return false;
  if (cloudSyncBusy) {
    scheduleCloudBackup(1500);
    return false;
  }
  if (cloudBackupTimer) window.clearTimeout(cloudBackupTimer);
  cloudBackupTimer = null;
  cloudSyncBusy = true;
  const attemptAt = new Date().toISOString();
  saveCloudSyncConfig({ ...cloudSyncConfig, lastSyncAttemptAt: attemptAt });
  cloudSyncStatus = manual ? "正在上传云备份..." : "正在自动上传云备份...";
  if (manual || ui.tab === "settings") render();
  try {
    const encryptedPayload = await encryptCloudPayload(buildBackupPayload(), cloudSyncConfig.encryptionKey);
    const data = await cloudRequest("/api/backup", {
      method: "POST",
      body: JSON.stringify({
        accountId: cloudSyncConfig.accountId,
        authHash: cloudSyncConfig.authHash,
        encryptedPayload,
        recordCount: records.length,
        clientUpdatedAt: new Date().toISOString()
      })
    });
    saveCloudSyncConfig({
      ...cloudSyncConfig,
      lastUploadedAt: data?.updatedAt || new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      lastSyncAttemptAt: attemptAt,
      lastSyncError: null,
      pendingUploadAt: null
    });
    cloudSyncDirty = false;
    cloudSyncStatus = manual ? "云备份已上传" : "";
    clearCloudRetry();
    if (manual) showToast("云备份已上传");
    return true;
  } catch (error) {
    cloudSyncStatus = cloudFailureText(error);
    saveCloudSyncConfig({
      ...cloudSyncConfig,
      lastSyncAttemptAt: attemptAt,
      lastSyncError: cloudSyncStatus,
      pendingUploadAt: cloudSyncConfig.pendingUploadAt || attemptAt
    });
    cloudSyncDirty = true;
    scheduleCloudRetry();
    if (manual) showToast(cloudSyncStatus);
    return false;
  } finally {
    cloudSyncBusy = false;
    if (ui.tab === "settings") render();
  }
}

async function mergeCloudBackup({
  manual = true,
  uploadAfterMerge = true,
  accountId = cloudSyncConfig?.accountId,
  authHash = cloudSyncConfig?.authHash,
  encryptionKey = cloudSyncConfig?.encryptionKey
} = {}) {
  if (!cloudSyncConfig?.enabled || cloudSyncBusy) return false;
  cloudSyncBusy = true;
  const attemptAt = new Date().toISOString();
  saveCloudSyncConfig({ ...cloudSyncConfig, lastSyncAttemptAt: attemptAt });
  cloudSyncStatus = manual ? "正在读取云备份..." : "正在自动合并云端账单...";
  if (manual || ui.tab === "settings") render();
  try {
    const data = await cloudRequest(`/api/backup?account=${encodeURIComponent(accountId)}`, {
      method: "GET",
      headers: { "x-migao-auth": authHash }
    });
    const payload = await decryptCloudPayload(data.encryptedPayload, encryptionKey);
    const incoming = (payload?.records || []).map(normalizeRecord).filter((record) => record.amountCents > 0);
    const previousRecords = records;
    const result = mergeRecords(records, incoming);
    records = result.records;
    if (!persistRecords()) {
      records = previousRecords;
      render();
      return;
    }
    saveCloudSyncConfig({
      ...cloudSyncConfig,
      lastRestoredAt: new Date().toISOString(),
      lastSyncAttemptAt: attemptAt,
      lastSyncError: null
    });
    cloudSyncStatus = manual
      ? `已从云端合并 ${result.imported} 笔，新增 ${result.added} 笔`
      : "";
    if (manual) showToast(cloudSyncStatus);
    if (uploadAfterMerge && (result.added || result.updated || cloudSyncDirty)) {
      scheduleCloudBackup();
    }
    return true;
  } catch (error) {
    if (error?.message === "not found") {
      cloudSyncStatus = manual ? "云端还没有备份，将上传本机账单" : "";
      if (manual) showToast(cloudSyncStatus);
      return true;
    }
    cloudSyncStatus = cloudFailureText(error);
    saveCloudSyncConfig({
      ...cloudSyncConfig,
      lastSyncAttemptAt: attemptAt,
      lastSyncError: cloudSyncStatus
    });
    if (!manual) scheduleCloudRetry();
    if (manual) showToast(cloudSyncStatus);
    return false;
  } finally {
    cloudSyncBusy = false;
    if (ui.tab === "settings" || manual) render();
  }
}

async function syncCloudNow(manual = true) {
  const merged = await mergeCloudBackup({ manual, uploadAfterMerge: false });
  if (!cloudSyncConfig?.enabled) return false;
  if (!merged) return false;
  if (merged || cloudSyncDirty || manual) {
    return uploadCloudBackup(manual);
  }
  return true;
}

function scheduleStartupCloudSync() {
  if (!cloudSyncConfig?.enabled || cloudStartupSyncDone) return;
  cloudStartupSyncDone = true;
  window.setTimeout(() => {
    syncCloudNow(false).then((synced) => {
      if (!synced) scheduleCloudRetry();
    });
  }, 800);
}

function cloudSyncNeedsRefresh() {
  if (!cloudSyncConfig?.enabled) return false;
  if (cloudSyncDirty || cloudSyncConfig.pendingUploadAt || cloudSyncConfig.lastSyncError) return true;
  const lastSyncedAt = new Date(cloudSyncConfig.lastSyncedAt || 0).getTime();
  return !lastSyncedAt || Date.now() - lastSyncedAt > 15 * 60 * 1000;
}

function resumeCloudSync() {
  if (!cloudSyncNeedsRefresh()) return;
  clearCloudRetry();
  syncCloudNow(false).then((synced) => {
    if (!synced) scheduleCloudRetry();
  });
}

async function enableCloudSync() {
  if (cloudSyncBusy) return;
  const endpoint = normalizeEndpoint(document.querySelector("[data-cloud-field='endpoint']")?.value);
  const phone = document.querySelector("[data-cloud-field='phone']")?.value;
  const pin = document.querySelector("[data-cloud-field='pin']")?.value;
  if (!endpoint || !/^https?:\/\//.test(endpoint)) {
    showToast("请输入 Cloudflare Worker 地址");
    return;
  }

  cloudSyncBusy = true;
  cloudSyncStatus = "正在开启云备份...";
  render();
  try {
    const identity = await deriveCloudIdentity(phone, pin);
    saveCloudSyncConfig({
      enabled: true,
      endpoint,
      accountLabel: identity.accountLabel,
      accountId: identity.accountId,
      authHash: identity.authHash,
      encryptionKey: identity.encryptionKey,
      identityVersion: identity.identityVersion,
      lastUploadedAt: null,
      lastRestoredAt: null,
      lastSyncedAt: null,
      lastSyncAttemptAt: null,
      lastSyncError: null,
      pendingUploadAt: null
    });
    cloudSyncBusy = false;
    await mergeCloudBackup({
      manual: false,
      uploadAfterMerge: false,
      accountId: identity.legacyAccountId,
      authHash: identity.legacyAuthHash,
      encryptionKey: identity.encryptionKey
    });
    const synced = await syncCloudNow(false);
    if (!synced) throw new Error(cloudSyncStatus || "sync failed");
    cloudStartupSyncDone = true;
    cloudSyncStatus = "云备份已开启；以后打开自动合并，记账后自动上传";
    showToast("云备份已开启");
  } catch (error) {
    saveCloudSyncConfig(null);
    cloudSyncStatus = error?.message === "invalid phone"
      ? "手机号格式不正确"
      : (cloudSyncStatus || "开启失败：请检查 PIN、Worker 地址或网络");
    showToast(cloudSyncStatus);
  } finally {
    cloudSyncBusy = false;
    render();
  }
}

function disableCloudSync() {
  if (cloudBackupTimer) window.clearTimeout(cloudBackupTimer);
  cloudBackupTimer = null;
  clearCloudRetry();
  saveCloudSyncConfig(null);
  cloudStartupSyncDone = false;
  cloudSyncDirty = false;
  cloudSyncStatus = "已关闭本机云备份配置；云端旧备份不会自动删除。";
  render();
  showToast("已关闭云备份");
}

function canReloadForServiceWorker() {
  return !ui.modal && !ui.helpModal && !document.hidden;
}

function maybeReloadAfterServiceWorkerSwap() {
  if (!serviceWorkerSwapPending || !canReloadForServiceWorker()) return;
  serviceWorkerSwapPending = false;
  window.location.reload();
}

function bindServiceWorkerRegistration(registration) {
  if (!("serviceWorker" in navigator)) return;

  const prepareInstallingWorker = (worker) => {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state !== "installed" || !navigator.serviceWorker.controller) return;
      serviceWorkerSwapPending = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    });
  };

  prepareInstallingWorker(registration.installing);
  registration.addEventListener("updatefound", () => prepareInstallingWorker(registration.installing));

  if (registration.waiting && navigator.serviceWorker.controller) {
    serviceWorkerSwapPending = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  if (serviceWorkerControllerBound) return;
  serviceWorkerControllerBound = true;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.setTimeout(maybeReloadAfterServiceWorkerSwap, 80);
  });
  document.addEventListener("visibilitychange", maybeReloadAfterServiceWorkerSwap);
  window.addEventListener("online", () => {
    showToast("网络已恢复，正在检查米糕记账的新版本");
    navigator.serviceWorker.getRegistration().then((current) => current?.update()).catch(() => {});
  });
  window.addEventListener("offline", () => {
    showToast("当前无网络，继续使用本地版本，账单仍可正常记录");
  });
}

async function refreshAppShell() {
  if (navigator.onLine === false) {
    showToast("当前无网络，继续使用本地版本，账单仍可正常记录");
    return;
  }

  showToast("正在检查米糕记账的新版本...");
  try {
    const registration = "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistration()
      : null;
    if (registration) {
      bindServiceWorkerRegistration(registration);
      await registration.update();
      if (registration.waiting) {
        serviceWorkerSwapPending = true;
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }
    }
    showToast("已检查完成，正在重新载入当前版本");
    window.setTimeout(() => window.location.reload(), 280);
  } catch (_) {
    showToast("网络暂时不可用，已保留当前本地版本");
  }
}

function backupFileStamp(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function localDayStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildBackupPayload() {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_VERSION,
    appName: "米糕记账",
    exportedAt: new Date().toISOString(),
    recordCount: records.length,
    records: records.map((record) => ({ ...record }))
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportData() {
  const filename = `米糕记账-备份-${backupFileStamp()}.json`;
  const payload = JSON.stringify(buildBackupPayload(), null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const file = typeof File === "function" ? new File([blob], filename, { type: "application/json" }) : null;

  if (file && typeof navigator.share === "function") {
    let canShare = true;
    try {
      if (typeof navigator.canShare === "function") canShare = navigator.canShare({ files: [file] });
      if (canShare) {
        await navigator.share({
          title: "米糕记账备份",
          text: `${records.length} 笔账单备份文件`,
          files: [file]
        });
        markManualBackupPrepared();
        if (ui.tab === "settings") render();
        showToast("备份已准备好，请保存到“文件”或 iCloud 云盘");
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  downloadBlob(blob, filename);
  markManualBackupPrepared();
  if (ui.tab === "settings") render();
  showToast("备份文件已生成，请保存到“文件”或 iCloud 云盘");
}

function recordTimestamp(record) {
  const timestamp = Date.parse(record.updatedAt || record.createdAt || record.occurredAt || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeRecords(current, incoming) {
  const merged = new Map(current.map((record) => [record.id, record]));
  let added = 0;
  let updated = 0;

  incoming.forEach((record) => {
    const existing = merged.get(record.id);
    if (!existing) {
      merged.set(record.id, record);
      added += 1;
    } else if (recordTimestamp(record) > recordTimestamp(existing)) {
      merged.set(record.id, record);
      updated += 1;
    }
  });

  return { records: Array.from(merged.values()), added, updated, imported: incoming.length };
}

async function importData(file) {
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.format && parsed.format !== BACKUP_FORMAT) throw new Error("backup format mismatch");
    const sourceRecords = Array.isArray(parsed) ? parsed : parsed?.records;
    if (!Array.isArray(sourceRecords)) throw new Error("records missing");

    const imported = sourceRecords.map(normalizeRecord).filter((record) => record.amountCents > 0);
    const previousRecords = records;
    const result = mergeRecords(records, imported);
    records = result.records;
    if (!persistRecords()) {
      records = previousRecords;
      render();
      return;
    }

    render();
    const updatedText = result.updated ? `，更新 ${result.updated} 笔` : "";
    showToast(`已导入 ${result.imported} 笔，新增 ${result.added} 笔${updatedText}`);
  } catch (_) {
    showToast("导入失败，请选择米糕记账导出的 JSON 备份文件");
  }
}

function openAutoBackupDB() {
  if (!window.indexedDB) return Promise.resolve(null);

  return new Promise((resolve) => {
    let request;
    try {
      request = window.indexedDB.open(AUTO_BACKUP_DB, 1);
    } catch (_) {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(AUTO_BACKUP_STORE)) {
        request.result.createObjectStore(AUTO_BACKUP_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function updateAutoBackupStatus(snapshot) {
  autoBackupStatus = {
    supported: true,
    available: !!snapshot,
    savedAt: snapshot?.savedAt || null,
    recordCount: Number(snapshot?.recordCount ?? snapshot?.records?.length ?? 0)
  };
}

function backupTimeLabel(isoString) {
  if (!isoString) return "暂无记录";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "暂无记录";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function manualBackupText() {
  if (!records.length) return "还没有账单，开始使用后建议定期导出 JSON 备份。";
  if (!lastManualBackupAt) return "还没有生成过 JSON 备份；长期使用前，建议先导出一份保存到“文件”或 iCloud 云盘。";
  return `上次生成 JSON 备份：${backupTimeLabel(lastManualBackupAt)}。长期使用时，建议每次大版本更新或每周手动导出一次。`;
}

function autoBackupText() {
  if (!autoBackupStatus.supported) return "本机自动快照：当前浏览器不支持 IndexedDB，请依赖 JSON 导出备份。";
  if (!autoBackupStatus.available) return "本机自动快照：已开启；打开或保存账单后会写入最近快照。";
  return `本机自动快照：最近 ${backupTimeLabel(autoBackupStatus.savedAt)}，含 ${autoBackupStatus.recordCount} 笔。`;
}

async function saveAutoBackup() {
  const db = await openAutoBackupDB();
  if (!db) {
    autoBackupStatus = { supported: false, available: false, savedAt: null, recordCount: 0 };
    if (ui.tab === "settings") render();
    return;
  }

  const now = new Date();
  const payload = buildBackupPayload();
  const snapshot = {
    ...payload,
    id: "latest",
    savedAt: now.toISOString(),
    day: localDayStamp(now)
  };
  const dailySnapshot = { ...snapshot, id: `day-${snapshot.day}` };

  try {
    const transaction = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    const store = transaction.objectStore(AUTO_BACKUP_STORE);
    store.put(snapshot);
    store.put(dailySnapshot);
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    const cutoffId = `day-${localDayStamp(cutoff)}`;
    const keysRequest = store.getAllKeys();
    keysRequest.onsuccess = () => {
      keysRequest.result
        .filter((key) => typeof key === "string" && key.startsWith("day-") && key < cutoffId)
        .forEach((key) => store.delete(key));
    };
    transaction.oncomplete = () => {
      updateAutoBackupStatus(snapshot);
      db.close();
      if (ui.tab === "settings") render();
    };
    transaction.onerror = () => db.close();
  } catch (_) {
    db.close();
  }
}

async function loadAutoBackupStatus() {
  const db = await openAutoBackupDB();
  if (!db) {
    autoBackupStatus = { supported: false, available: false, savedAt: null, recordCount: 0 };
    if (ui.tab === "settings") render();
    return;
  }

  try {
    const snapshot = await new Promise((resolve) => {
      const transaction = db.transaction(AUTO_BACKUP_STORE, "readonly");
      const request = transaction.objectStore(AUTO_BACKUP_STORE).get("latest");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    db.close();
    updateAutoBackupStatus(snapshot);
    if (ui.tab === "settings") render();
  } catch (_) {
    db.close();
  }
}

function scheduleAutoBackup() {
  if (autoBackupTimer) window.clearTimeout(autoBackupTimer);
  autoBackupTimer = window.setTimeout(() => {
    autoBackupTimer = null;
    saveAutoBackup();
  }, 250);
}

function scheduleMidnightBackup() {
  if (midnightBackupTimer) window.clearTimeout(midnightBackupTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  midnightBackupTimer = window.setTimeout(() => {
    saveAutoBackup();
    scheduleMidnightBackup();
  }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
}

async function restoreAutoBackupIfNeeded() {
  if (records.length) {
    scheduleAutoBackup();
    return;
  }

  const db = await openAutoBackupDB();
  if (!db) {
    scheduleAutoBackup();
    return;
  }

  try {
    const snapshot = await new Promise((resolve) => {
      const transaction = db.transaction(AUTO_BACKUP_STORE, "readonly");
      const request = transaction.objectStore(AUTO_BACKUP_STORE).get("latest");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    db.close();
    const recovered = snapshot?.records?.map(normalizeRecord).filter((record) => record.amountCents > 0) || [];
    if (!recovered.length) {
      scheduleAutoBackup();
      return;
    }

    records = recovered;
    if (persistRecords()) {
      render();
      showToast(`已从本机自动快照恢复 ${records.length} 笔账单`);
    }
  } catch (_) {
    db.close();
    scheduleAutoBackup();
  }
}

async function clearAutoBackup() {
  const db = await openAutoBackupDB();
  if (!db) return;
  try {
    const transaction = db.transaction(AUTO_BACKUP_STORE, "readwrite");
    transaction.objectStore(AUTO_BACKUP_STORE).clear();
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  } catch (_) {
    db.close();
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
  ui.recordActionId = null;
  ui.quickEntry = true;
  ui.showAllCategories = false;
  ui.showMoreOptions = false;

  const cleanURL = new URL(window.location.href);
  ["quick", "type", "category", "note", "account"].forEach((key) => cleanURL.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${cleanURL.pathname}${cleanURL.search}${cleanURL.hash}`);
  return true;
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
      <button type="button" data-action="previous-month" aria-label="上个月">${iconMarkup("chevron-left", "month-chevron")}</button>
      <strong>${monthLabel(ui.monthCursor)}</strong>
      <button type="button" data-action="next-month" aria-label="下个月">${iconMarkup("chevron-right", "month-chevron")}</button>
    </div>`;
}

function autoBackupShortText() {
  if (!autoBackupStatus.supported) return "当前浏览器不支持自动快照";
  if (!autoBackupStatus.available) return "已开启 · 保存账单后自动更新";
  return `最近 ${backupTimeLabel(autoBackupStatus.savedAt)} · ${autoBackupStatus.recordCount} 笔`;
}

function manualBackupShortText() {
  if (!records.length) return "暂无账单 · 使用后可随时导出";
  if (!lastManualBackupAt) return "尚未生成 · 建议首次使用先备份";
  return `上次导出 ${backupTimeLabel(lastManualBackupAt)}`;
}

function cloudSyncShortText() {
  if (cloudSyncStatus && cloudStatusIsImportant()) return cloudSyncStatus;
  if (!cloudSyncConfig) return "未开启 · 开启后自动合并与上传";
  if (cloudSyncConfig.identityVersion !== 2) return "旧版配置 · 建议重新开启";
  if (cloudSyncConfig.lastSyncError) return cloudSyncConfig.lastSyncError;
  if (cloudSyncConfig.pendingUploadAt) return navigator.onLine === false
    ? "已保存本机 · 联网后自动同步"
    : "已保存本机 · 等待自动同步";
  return cloudSyncConfig.lastSyncedAt
    ? `自动同步正常 · ${backupTimeLabel(cloudSyncConfig.lastSyncedAt)}`
    : "自动同步已开启 · 等待首次同步";
}

function renderRecordRow(record, deletable = false) {
  const meta = TYPE_META[record.type] || TYPE_META.expense;
  const detail = record.note || (record.type === "transfer"
    ? `${record.accountName} → ${record.destinationAccountName}`
    : record.accountName);
  const occurred = new Date(record.occurredAt);
  const time = `${pad(occurred.getHours())}:${pad(occurred.getMinutes())}`;
  return `
    <div class="record-row">
      <div class="record-main">
        ${categoryIconMarkup(record.categoryId, meta.className)}
        <div class="record-copy">
          <strong>${escapeHtml(record.categoryName)}</strong>
          <span>${escapeHtml(detail)}</span>
        </div>
      </div>
      <div class="record-trailing">
        <strong class="record-amount ${meta.className}-text">${formatSigned(record)}</strong>
        <span class="record-time">${time}</span>
        ${deletable ? `<button class="icon-button record-more-button" type="button" data-action="record-more" data-id="${escapeHtml(record.id)}" aria-label="更多账单操作">${iconMarkup("dots", "button-glyph")}</button>` : ""}
      </div>
    </div>`;
}

function renderEmptyState(title, description, iconName = "sparkles") {
  return `<div class="empty-state"><div class="empty-mark">${iconMarkup(iconName, "empty-glyph")}</div><strong>${title}</strong><span>${description}</span></div>`;
}

function triggerMascotReaction() {
  const companion = document.querySelector("[data-mascot-companion]");
  if (!companion || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const playReaction = () => {
    companion.classList.remove("is-reacting");
    void companion.offsetWidth;
    companion.classList.add("is-reacting");
    window.clearTimeout(mascotReactionTimer);
    mascotReactionTimer = window.setTimeout(() => companion.classList.remove("is-reacting"), 920);
  };
  const activeImage = companion.querySelector(".mascot-active");
  if (activeImage?.dataset.src && !activeImage.hasAttribute("src")) {
    if (activeImage.dataset.loading) return;
    activeImage.dataset.loading = "true";
    activeImage.addEventListener("load", () => {
      delete activeImage.dataset.loading;
      playReaction();
    }, { once: true });
    activeImage.addEventListener("error", () => {
      delete activeImage.dataset.loading;
      activeImage.removeAttribute("src");
    }, { once: true });
    activeImage.src = activeImage.dataset.src;
    return;
  }
  playReaction();
}

function renderHome() {
  const today = new Date();
  const todayRecords = recordsForDay(dateKey(today));
  const monthRecords = recordsForMonth(today);
  const totals = monthTotals(monthRecords);
  const todayExpense = sumCents(todayRecords, "expense");

  return `
    <div class="page page-home">
      <section class="home-intro">
        <div class="home-intro-copy">
          <h1>米糕记账</h1>
          <p>嗨，米糕陪你记录每一笔</p>
          <span class="home-date">${longDateLabel(today)}</span>
        </div>
      </section>

      <section class="paper-card home-summary-card">
        <div class="summary-heading home-summary-heading">
          <button class="home-summary-title" type="button" data-tab="ledger"><strong>${monthLabel(today)} 月度摘要</strong>${iconMarkup("chevron-right", "chevron-glyph")}</button>
        </div>
        <button class="home-mascot-button" type="button" data-action="mascot-react" data-mascot-companion aria-label="和米糕打个招呼">
          <span class="mascot-stage" aria-hidden="true">
            <img class="home-mascot-image mascot-idle" src="./assets/black-shiba-mascot.png" alt="">
            <img class="home-mascot-image mascot-active" data-src="./assets/black-shiba-mascot-active.png" alt="">
          </span>
        </button>
        <div class="summary-grid">
          <div class="summary-item"><span>支出</span><strong class="expense-text">${formatMoney(totals.expense)}</strong><span class="summary-symbol expense-symbol">${iconMarkup("wallet", "summary-glyph")}</span></div>
          <div class="summary-item"><span>收入</span><strong class="income-text">${formatMoney(totals.income)}</strong><span class="summary-symbol income-symbol">${iconMarkup("arrow-up-circle", "summary-glyph")}</span></div>
          <div class="summary-item"><span>结余</span><strong class="balance-text">${formatBalance(totals.balance)}</strong><span class="summary-symbol balance-symbol">${iconMarkup("equal", "summary-glyph")}</span></div>
        </div>
        <button class="home-summary-footer" type="button" data-tab="ledger"><span>本月记录 <strong>${monthRecords.length}</strong> 笔</span>${iconMarkup("chevron-right", "chevron-glyph")}</button>
      </section>

      <section class="content-group receipt-card">
        <div class="summary-heading today-heading"><strong>今日记录</strong><span class="today-date">${dateKey(today).replace(/-/g, ".")} ${iconMarkup("calendar", "calendar-glyph")}</span></div>
        ${todayRecords.length ? `<div class="record-list">${todayRecords.slice(0, 2).map((record) => renderRecordRow(record)).join("")}</div>` : renderEmptyState("今天还没有记录", "点右下角“记一笔”开始记录", "pencil")}
        <div class="receipt-footer">
          <button class="home-records-link" type="button" data-tab="ledger">查看全部记录 ${iconMarkup("chevron-right", "chevron-glyph")}</button>
          <div class="receipt-total"><span>今日支出</span><strong class="expense-text">${formatMoney(todayExpense)}</strong></div>
        </div>
      </section>

      <button class="home-tip-row" type="button" data-tab="settings">
        <span class="home-tip-icon" aria-hidden="true">${iconMarkup("paw", "reminder-glyph")}</span>
        <span><strong>米糕小贴士</strong><small>离线可用 · 数据与安装说明</small></span>
        ${iconMarkup("chevron-right", "chevron-glyph")}
      </button>

    </div>`;
}

function renderLedger() {
  const monthRecords = recordsForMonth(ui.monthCursor);
  return `
    <div class="page ledger-page">
      <div class="page-title-row">
        <div><span class="eyebrow">流水 · 日历</span><h1>账单</h1></div>
        <button class="round-button" type="button" data-action="add" aria-label="记一笔">${iconMarkup("plus", "button-glyph")}</button>
      </div>
      <div class="segmented">
        <button class="${ui.ledgerMode === "flow" ? "active" : ""}" type="button" data-action="ledger-mode" data-mode="flow">流水</button>
        <button class="${ui.ledgerMode === "calendar" ? "active" : ""}" type="button" data-action="ledger-mode" data-mode="calendar">日历</button>
      </div>
      ${renderMonthSwitcher()}
      ${ui.ledgerMode === "flow" ? renderFlow(monthRecords) : renderCalendar(monthRecords)}
    </div>`;
}

function renderFlow(monthRecords) {
  if (!monthRecords.length) {
    return `<section class="content-group empty-group">${renderEmptyState("这个月还没有记录", "点右下角“记一笔”开始记录", "receipt-2")}</section>`;
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
      <section class="content-group day-card">
        <div class="day-heading">
          <div class="day-heading-copy">${iconMarkup("calendar", "day-heading-glyph")}<strong>${dayLabel(date)}</strong></div>
          <span class="day-total">支出 ${formatMoney(expense)}</span>
        </div>
        <div class="record-list">${dayRecords.map((record) => renderRecordRow(record, true)).join("")}</div>
      </section>`;
  }).join("");
}

function renderSelectedDateCard(selectedKey) {
  const selectedRecords = recordsForDay(selectedKey);
  return `
    <section class="content-group selected-date-card" data-selected-date-card>
      <div class="section-heading"><div><h2>${dayLabel(dateFromKey(selectedKey))}</h2><div class="subtle">当天记录</div></div><span class="small-chip">${selectedRecords.length} 笔</span></div>
      ${selectedRecords.length ? `<div class="record-list">${selectedRecords.map((record) => renderRecordRow(record, true)).join("")}</div>` : renderEmptyState("这一天还没有记录", "选择其他日期，或直接记一笔", "sun")}
    </section>`;
}

function renderCalendar(monthRecords) {
  const month = ui.monthCursor;
  const selectedKey = sameMonth(dateFromKey(ui.selectedDate), month) ? ui.selectedDate : dateKey(month);
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
    <section class="content-group calendar-card">
      <div class="weekdays">${WEEKDAYS.map((weekday) => `<span>${weekday}</span>`).join("")}</div>
      <div class="calendar-grid">${cells}</div>
    </section>
    ${renderSelectedDateCard(selectedKey)}`;
}

function renderStatistics() {
  const monthRecords = recordsForMonth(ui.monthCursor);
  return `
    <div class="page statistics-page">
      <div class="page-title-row"><div><span class="eyebrow">趋势 · 分类 · 复盘</span><h1>统计</h1></div></div>
      <div class="segmented statistics-segmented">
        <button class="${ui.statisticsMode === "trend" ? "active" : ""}" type="button" data-action="statistics-mode" data-mode="trend">趋势</button>
        <button class="${ui.statisticsMode === "ranking" ? "active" : ""}" type="button" data-action="statistics-mode" data-mode="ranking">排行</button>
        <button class="${ui.statisticsMode === "monthly" ? "active" : ""}" type="button" data-action="statistics-mode" data-mode="monthly">月报</button>
      </div>
      ${renderMonthSwitcher()}
      ${ui.statisticsMode === "trend" ? renderTrend(monthRecords) : ui.statisticsMode === "ranking" ? renderRanking(monthRecords) : renderMonthlyReport(monthRecords)}
      ${ui.statisticsMode === "monthly" ? "" : renderQuickStats(monthRecords)}
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
  const chart = { width: 360, height: 216, left: 12, right: 12, top: 54, bottom: 34 };
  const baseY = chart.height - chart.bottom;
  const plotHeight = baseY - chart.top;
  const spanX = chart.width - chart.left - chart.right;
  const slotWidth = spanX / daily.length;
  const barWidth = Math.max(5, Math.min(8, slotWidth * .66));
  const points = daily.map((item, index) => {
    const x = chart.left + slotWidth * index + slotWidth / 2;
    const height = item.amountCents ? Math.max(5, (item.amountCents / max) * plotHeight) : 2;
    return { ...item, x, y: baseY - height, height };
  });
  const lastPoint = points[points.length - 1];
  const gridLines = [.33, .66].map((ratio) => {
    const y = chart.top + plotHeight * ratio;
    return `<line class="trend-grid-line" x1="${chart.left}" y1="${y.toFixed(1)}" x2="${chart.width - chart.right}" y2="${y.toFixed(1)}"></line>`;
  }).join("");
  const dayLabels = points
    .filter((point) => {
      const day = point.date.getDate();
      return day === 1 || day % 5 === 0 || (point === lastPoint && day % 5 >= 2);
    })
    .map((point) => `<text class="trend-axis-label" x="${point.x.toFixed(1)}" y="${chart.height - 12}" text-anchor="middle">${pad(point.date.getDate())}</text>`)
    .join("");
  const selectedPoint = points.find((point) => dateKey(point.date) === ui.trendSelectedDate);
  const bars = points.map((point) => `
    <rect class="trend-bar ${point.amountCents ? "has-value" : "is-zero"} ${selectedPoint === point ? "selected" : ""}" data-date="${dateKey(point.date)}" x="${(point.x - barWidth / 2).toFixed(1)}" y="${point.y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${point.height.toFixed(1)}" rx="${(barWidth / 2).toFixed(1)}"></rect>`).join("");
  const tooltipPoint = selectedPoint || points[0];
  const tooltipWidth = 112;
  const tooltipX = Math.min(Math.max(tooltipPoint.x - tooltipWidth / 2, 8), chart.width - tooltipWidth - 8);
  const tooltip = `
    <g class="trend-tooltip ${selectedPoint ? "visible" : ""}">
      <rect x="${tooltipX.toFixed(1)}" y="6" width="${tooltipWidth}" height="42" rx="8"></rect>
      <path d="M ${tooltipPoint.x.toFixed(1)} 54 l -6 -7 h 12 Z"></path>
      <text x="${(tooltipX + 13).toFixed(1)}" y="24">${pad(tooltipPoint.date.getMonth() + 1)}.${pad(tooltipPoint.date.getDate())}</text>
      <text class="trend-tooltip-amount" x="${(tooltipX + 13).toFixed(1)}" y="41">${formatMoney(tooltipPoint.amountCents)}</text>
    </g>`;
  const expenseCount = monthRecords.filter((record) => record.type === "expense").length;
  const activeDays = daily.filter((item) => item.amountCents > 0).length || 1;
  const average = Math.round(total / activeDays);
  const barChart = `
    <div class="trend-chart-shell">
      <svg class="trend-chart" viewBox="0 0 ${chart.width} ${chart.height}" width="${chart.width}" height="${chart.height}" data-days="${daily.length}" data-chart-left="${chart.left}" data-chart-right="${chart.width - chart.right}" data-chart-top="${chart.top}" data-chart-base="${baseY}" data-view-width="${chart.width}" role="img" aria-label="本月每日支出柱形图">
        ${gridLines}
        ${bars}
        ${tooltip}
        <line class="trend-axis" x1="${chart.left}" y1="${baseY}" x2="${chart.width - chart.right}" y2="${baseY}"></line>
        ${dayLabels}
      </svg>
      <div class="trend-summary"><strong>${expenseCount}</strong> 笔支出 · 活跃日均 <strong>${formatMoney(average)}</strong></div>
    </div>`;

  return `
    <section class="content-group stats-card chart-primary-card">
      <div class="section-heading"><div><h2>每日支出</h2><div class="subtle">轻触或拖动查看每天合计</div></div><span class="expense-text stats-total">${formatMoney(total)}</span></div>
      ${total ? `<div class="chart-wrap">${barChart}</div>` : renderEmptyState("还没有支出趋势", "开始记账后，这里会出现每日柱形图", "chart-bar")}
    </section>`;
}

function rankingStats(monthRecords) {
  const map = new Map();
  monthRecords.filter((record) => record.type === "expense").forEach((record) => {
    if (!map.has(record.categoryId)) {
      map.set(record.categoryId, { id: record.categoryId, name: record.categoryName, icon: record.categoryIcon, amountCents: 0, records: [] });
    }
    const item = map.get(record.categoryId);
    item.amountCents += record.amountCents;
    item.records.push(record);
  });
  return Array.from(map.values()).map((item) => ({
    ...item,
    records: item.records.sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt))
  })).sort((left, right) => right.amountCents - left.amountCents);
}

function renderCategoryDetailCard(selected) {
  return `
    <section class="content-group category-detail-card" data-category-detail-card>
      <div class="section-heading"><div><h2>${escapeHtml(selected.name)}明细</h2><div class="subtle">${selected.records.length} 笔支出 · 合计 ${formatMoney(selected.amountCents)}</div></div>${categoryIconMarkup(selected.id, "expense")}</div>
      <div class="record-list">${selected.records.map((record) => renderRecordRow(record, true)).join("")}</div>
    </section>`;
}

function renderRanking(monthRecords) {
  const stats = rankingStats(monthRecords);
  if (!stats.length) {
    return `<section class="content-group empty-group">${renderEmptyState("还没有分类排行", "记录几笔支出后，就能看到消费去向", "tag")}</section>`;
  }
  const max = stats[0].amountCents || 1;
  const selected = stats.find((item) => item.id === ui.statsCategoryId) || stats[0];
  ui.statsCategoryId = selected.id;
  return `
    <section class="content-group stats-card">
      <div class="section-heading"><div><h2>分类排行</h2><div class="subtle">按支出金额从高到低</div></div><span class="small-chip">${stats.length} 类</span></div>
      <div class="ranking-list">
        ${stats.map((item) => `
          <button class="ranking-item ${item.id === selected.id ? "selected" : ""}" type="button" data-action="stats-category" data-category="${escapeHtml(item.id)}">
            <div class="ranking-top">${categoryIconMarkup(item.id, "expense")}<span class="ranking-name">${escapeHtml(item.name)}</span><span class="ranking-count">${item.records.length} 笔</span><span class="ranking-value">${formatMoney(item.amountCents)}</span></div>
            <div class="progress-track"><div class="progress-value" style="width:${(item.amountCents / max) * 100}%"></div></div>
          </button>`).join("")}
      </div>
    </section>
    ${renderCategoryDetailCard(selected)}`;
}

function renderMonthlyReport(monthRecords) {
  const totals = monthTotals(monthRecords);
  const previousTotals = monthTotals(recordsForMonth(addMonths(ui.monthCursor, -1)));
  const expenseRecords = monthRecords.filter((record) => record.type === "expense");
  const daily = dailyExpenses(ui.monthCursor);
  const activeDays = daily.filter((item) => item.amountCents > 0).length;
  const highestDay = daily.reduce((highest, item) => item.amountCents > (highest?.amountCents || 0) ? item : highest, null);
  const categoryStats = rankingStats(monthRecords);
  const topRecords = expenseRecords
    .slice()
    .sort((left, right) => right.amountCents - left.amountCents || new Date(right.occurredAt) - new Date(left.occurredAt))
    .slice(0, 3);
  const deltaCents = totals.expense - previousTotals.expense;
  let changeClass = "neutral";
  let changeText = "暂无上月支出";
  if (previousTotals.expense === 0) {
    if (totals.expense > 0) {
      changeClass = "up";
      changeText = "较上月新增";
    }
  } else if (deltaCents > 0) {
    changeClass = "up";
    changeText = `较上月增加 ${formatMoney(deltaCents)}`;
  } else if (deltaCents < 0) {
    changeClass = "down";
    changeText = `较上月减少 ${formatMoney(deltaCents)}`;
  } else {
    changeText = "与上月持平";
  }
  const activeDayAverage = activeDays ? Math.round(totals.expense / activeDays) : 0;
  const highestDayLabel = highestDay?.amountCents ? `${dayLabel(highestDay.date)} · ${formatMoney(highestDay.amountCents)}` : "暂无支出";
  const categoryTotal = totals.expense || 1;

  return `
    <section class="content-group monthly-report-hero">
      <div class="monthly-report-heading">
        <div><span class="eyebrow">月度复盘</span><h2>本月总支出</h2></div>
        <span class="monthly-report-month">${monthLabel(ui.monthCursor)}</span>
      </div>
      <div class="monthly-report-total-row">
        <strong class="expense-text">${formatMoney(totals.expense)}</strong>
        <span class="monthly-report-change ${changeClass}">${changeText}</span>
      </div>
      <div class="monthly-report-footline"><span>${expenseRecords.length} 笔支出 · ${activeDays} 个活跃日</span><span>结余 ${formatBalance(totals.balance)}</span></div>
    </section>

    <section class="content-group monthly-insights-group">
      <div class="section-heading"><div><h2>本月看点</h2><div class="subtle">用几个数字快速读懂这个月</div></div></div>
      <div class="monthly-insights-grid">
        <div class="monthly-insight monthly-insight-average">
          <span class="monthly-insight-icon">${iconMarkup("calendar", "monthly-insight-glyph")}</span>
          <span>活跃日均</span>
          <strong class="expense-text">${formatMoney(activeDayAverage)}</strong>
        </div>
        <div class="monthly-insight monthly-insight-highest">
          <span class="monthly-insight-icon">${iconMarkup("arrow-up-circle", "monthly-insight-glyph")}</span>
          <span>最高支出日</span>
          <strong>${highestDayLabel}</strong>
        </div>
        <div class="monthly-insight monthly-insight-active">
          <span class="monthly-insight-icon">${iconMarkup("receipt-2", "monthly-insight-glyph")}</span>
          <span>记账天数</span>
          <strong>${activeDays} 天</strong>
        </div>
        <div class="monthly-insight monthly-insight-count">
          <span class="monthly-insight-icon">${iconMarkup("tag", "monthly-insight-glyph")}</span>
          <span>最高分类</span>
          <strong>${categoryStats[0] ? escapeHtml(categoryStats[0].name) : "暂无分类"}</strong>
        </div>
      </div>
    </section>

    <section class="content-group monthly-category-group">
      <div class="section-heading"><div><h2>花销去向</h2><div class="subtle">按支出金额占比</div></div><span class="small-chip">${categoryStats.length} 类</span></div>
      ${categoryStats.length ? `<div class="monthly-category-list">${categoryStats.slice(0, 5).map((item) => {
        const percent = Math.round((item.amountCents / categoryTotal) * 100);
        return `
          <div class="monthly-category-row">
            ${categoryIconMarkup(item.id, "expense")}
            <div class="monthly-category-main">
              <div class="monthly-category-top"><strong>${escapeHtml(item.name)}</strong><span>${formatMoney(item.amountCents)} · ${percent}%</span></div>
              <div class="monthly-category-bar"><span style="width:${Math.min(percent, 100)}%"></span></div>
            </div>
          </div>`;
      }).join("")}</div>` : renderEmptyState("还没有支出分类", "记录几笔支出后，这里会显示花销去向", "tag")}
    </section>

    <section class="content-group monthly-highlights-group">
      <div class="section-heading"><div><h2>本月大额支出</h2><div class="subtle">金额最高的 ${topRecords.length || 3} 笔记录</div></div></div>
      ${topRecords.length ? `<div class="record-list monthly-record-list">${topRecords.map((record) => renderRecordRow(record)).join("")}</div>` : renderEmptyState("还没有大额支出", "本月记录后，这里会帮你留下消费重点", "receipt-2")}
      <div class="monthly-balance-strip">
        <span><small>本月收入</small><strong class="income-text">${formatMoney(totals.income)}</strong></span>
        <span><small>本月结余</small><strong class="${totals.balance < 0 ? "expense-text" : "income-text"}">${formatBalance(totals.balance)}</strong></span>
      </div>
    </section>`;
}

function renderQuickStats(monthRecords) {
  const totals = monthTotals(monthRecords);
  const days = new Date(ui.monthCursor.getFullYear(), ui.monthCursor.getMonth() + 1, 0).getDate();
  const expenses = monthRecords.filter((record) => record.type === "expense");
  const highest = expenses.reduce((max, record) => Math.max(max, record.amountCents), 0);
  const activeDays = new Set(monthRecords.map((record) => dateKey(new Date(record.occurredAt)))).size;
  return `
    <section class="content-group quick-stats-group">
      <div class="section-heading"><div><h2>本月速览</h2><div class="subtle">共 ${monthRecords.length} 笔记录 · ${activeDays} 个记账日</div></div></div>
      <div class="quick-stats-grid">
        <div class="quick-stat-tile quick-stat-average">
          <span class="quick-stat-icon">${iconMarkup("calendar", "quick-stat-glyph")}</span>
          <span>日均支出</span>
          <strong class="expense-text">${formatMoney(Math.round(totals.expense / Math.max(days, 1)))}</strong>
        </div>
        <div class="quick-stat-tile quick-stat-highest">
          <span class="quick-stat-icon">${iconMarkup("arrow-up-circle", "quick-stat-glyph")}</span>
          <span>最高单笔</span>
          <strong class="expense-text">${formatMoney(highest)}</strong>
        </div>
        <div class="quick-stat-tile quick-stat-active">
          <span class="quick-stat-icon">${iconMarkup("receipt-2", "quick-stat-glyph")}</span>
          <span>活跃记账</span>
          <strong>${activeDays} 天</strong>
        </div>
        <div class="quick-stat-tile quick-stat-balance">
          <span class="quick-stat-icon">${iconMarkup("wallet", "quick-stat-glyph")}</span>
          <span>本月结余</span>
          <strong class="${totals.balance < 0 ? "expense-text" : "income-text"}">${formatBalance(totals.balance)}</strong>
        </div>
      </div>
    </section>`;
}

function renderSettings() {
  const preview = categoriesFor("expense");
  return `
    <div class="page settings-page">
      <div class="page-title-row"><div><span class="eyebrow">本地 · 米糕</span><h1>我的</h1></div></div>

      <header class="settings-profile">
        <img class="mascot small" src="./assets/black-shiba-mascot.png" alt="米糕黑柴">
        <div><strong>米糕记账</strong><span>记录每一个值得记住的日常</span></div>
        <span class="profile-count">${records.length} 笔</span>
      </header>

      <section class="settings-section">
        <h2>数据与备份</h2>
        <div class="settings-group">
          <div class="settings-row static-row"><span class="line-icon">${iconMarkup("database", "line-glyph")}</span><span><strong>本机自动快照</strong><small>${autoBackupShortText()}</small></span></div>
          <button class="settings-row" type="button" data-action="export-data"><span class="line-icon">${iconMarkup("file-download", "line-glyph")}</span><span><strong>导出 JSON 备份</strong><small>${manualBackupShortText()}</small></span>${iconMarkup("chevron-right", "row-chevron")}</button>
          <button class="settings-row" type="button" data-action="import-data"><span class="line-icon">${iconMarkup("file-upload", "line-glyph")}</span><span><strong>导入 JSON 备份</strong><small>换设备或恢复旧账单</small></span>${iconMarkup("chevron-right", "row-chevron")}</button>
          <button class="settings-row" type="button" data-action="refresh-app"><span class="line-icon">${iconMarkup("refresh", "line-glyph")}</span><span><strong>刷新到最新版本</strong><small>无网络时继续保留当前本地版本</small></span>${iconMarkup("chevron-right", "row-chevron")}</button>
          <input type="file" accept="application/json,.json" data-backup-input hidden>
        </div>
      </section>

      <section class="settings-section">
        <h2>云同步</h2>
        <div class="settings-group settings-cloud-group">
          <div class="settings-row static-row"><span class="line-icon">${iconMarkup("cloud", "line-glyph")}</span><span><strong>${cloudSyncConfig ? "云备份已开启" : "可选的加密云备份"}</strong><small>${cloudSyncShortText()}</small></span></div>
          ${cloudSyncConfig ? `
            <div class="settings-inline-actions">
              <button class="action-button secondary" type="button" data-action="cloud-sync" ${cloudSyncBusy ? "disabled" : ""}>立即同步</button>
              <button class="text-danger-button" type="button" data-action="cloud-disable" ${cloudSyncBusy ? "disabled" : ""}>关闭云备份</button>
            </div>
          ` : `
            <div class="cloud-form grouped-form">
              <div class="field"><label for="cloud-phone">手机号账号</label><input id="cloud-phone" data-cloud-field="phone" inputmode="tel" autocomplete="tel" placeholder="例如：13800138000"></div>
              <div class="field"><label for="cloud-pin">同步密码 / PIN</label><input id="cloud-pin" data-cloud-field="pin" type="password" autocomplete="new-password" placeholder="至少 4 位，务必记住"></div>
              <details class="settings-disclosure advanced-settings">
                <summary>高级设置 <span>Worker 地址</span></summary>
                <div class="disclosure-body"><div class="field"><label for="cloud-endpoint">Worker 地址</label><input id="cloud-endpoint" data-cloud-field="endpoint" inputmode="url" value="${CLOUD_SYNC_DEFAULT_ENDPOINT}" placeholder="https://你的-worker.workers.dev"></div></div>
              </details>
            </div>
            <div class="settings-inline-actions"><button class="action-button" type="button" data-action="cloud-enable" ${cloudSyncBusy ? "disabled" : ""}>开启自动云备份</button></div>
          `}
        </div>
      </section>

      <section class="settings-section">
        <h2>关于与帮助</h2>
        <div class="settings-group">
          <button class="settings-row" type="button" data-action="help"><span class="line-icon">${iconMarkup("home", "line-glyph")}</span><span><strong>安装与使用说明</strong><small>添加到 iPhone 主屏幕、离线使用</small></span>${iconMarkup("chevron-right", "row-chevron")}</button>
          <details class="settings-disclosure">
            <summary><span class="line-icon">${iconMarkup("tag", "line-glyph")}</span><span><strong>基础分类</strong><small>常用优先的 28 类支出分类</small></span><span class="disclosure-count">28 类</span></summary>
            <div class="disclosure-body"><div class="category-summary compact-category-summary">${preview.map((item) => `<div class="category-summary-item">${categoryIconMarkup(item.id, "expense")}<span>${item.name}</span></div>`).join("")}</div></div>
          </details>
          <details class="settings-disclosure">
            <summary><span class="line-icon">${iconMarkup("database", "line-glyph")}</span><span><strong>数据如何保存</strong><small>本机、自动快照与云备份的区别</small></span>${iconMarkup("chevron-right", "row-chevron")}</summary>
            <div class="disclosure-body settings-explanation">
              <p>账单默认保存在当前主屏幕 Web App 的本机浏览器空间，每天凌晨会自动更新本机快照。</p>
              <p>网页更新不会清空账单；清除网站数据或换设备前，请导出 JSON 或启用云备份。Safari 与主屏幕 Web App 可能是两套本地数据，使用同一云备份账号可自动合并。</p>
            </div>
          </details>
          <div class="settings-row static-row"><span class="line-icon">${iconMarkup("currency-yuan", "line-glyph")}</span><span><strong>金额格式</strong><small>人民币元，固定保留两位小数</small></span></div>
        </div>
      </section>
      <footer class="settings-version">米糕记账 v1.6.5 · 轻量、离线、不收费</footer>
    </div>`;
}

function renderAddModal() {
  const draft = ui.draft || createDraft();
  const categories = categoriesFor(draft.type);
  let featuredCategories = categories.slice(0, 8);
  if (!featuredCategories.some((category) => category.id === draft.categoryId)) {
    const selected = categories.find((category) => category.id === draft.categoryId);
    if (selected) featuredCategories = [...featuredCategories.slice(0, 7), selected];
  }
  const visibleCategories = ui.showAllCategories ? categories : featuredCategories;
  const meta = TYPE_META[draft.type];
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal-sheet add-modal-sheet ${ui.quickEntry ? "quick-entry-sheet" : ""}" data-modal-sheet aria-label="记一笔">
        <div class="modal-heading"><h2>${ui.quickEntry ? "快速记一笔" : "记一笔"}</h2><button class="close-button" type="button" data-action="close-modal" aria-label="关闭">${iconMarkup("x", "close-glyph")}</button></div>
        <form class="add-record-form" data-form="add-record">
          <div class="add-form-scroll">
            <div class="type-pills">
              ${Object.entries(TYPE_META).map(([type, value]) => `<button class="type-pill ${value.className} ${draft.type === type ? "active" : ""}" type="button" data-action="select-type" data-type="${type}">${value.title}</button>`).join("")}
            </div>
            <section class="form-group amount-card">
              <div class="amount-label">金额（元）</div>
              <div class="amount-entry"><em class="${meta.className}-text">¥</em><input type="text" data-draft-field="amountText" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0.00" value="${escapeHtml(draft.amountText)}" aria-label="金额"></div>
            </section>
            <section class="form-group note-form-group">
              <div class="field"><label for="record-note">备注</label><textarea id="record-note" data-draft-field="note" placeholder="例如：午餐、打车上班">${escapeHtml(draft.note)}</textarea></div>
            </section>
            <section class="form-group category-form-group">
              <div class="section-heading"><div><h2>选择分类</h2><div class="subtle">基础分类 · 常用分类优先</div></div></div>
              <div class="category-grid">${visibleCategories.map((category) => `<button class="category-button ${draft.categoryId === category.id ? "selected" : ""}" type="button" data-action="select-category" data-category="${category.id}">${categoryIconMarkup(category.id, meta.className)}<span>${category.name}</span></button>`).join("")}</div>
              <button class="category-expand-button" type="button" data-action="toggle-categories">${ui.showAllCategories ? "收起分类" : `全部分类（${categories.length}）`}${iconMarkup("chevron-right", "row-chevron")}</button>
            </section>
            <button class="form-disclosure ${ui.showMoreOptions ? "open" : ""}" type="button" data-action="toggle-more-options"><span><strong>更多选项</strong><small>日期、时间与账户</small></span>${iconMarkup("chevron-right", "row-chevron")}</button>
            ${ui.showMoreOptions ? `<section class="form-group more-options-group"><div class="field-grid">
              <div class="field"><label for="occurred-at">日期和时间</label><input id="occurred-at" type="datetime-local" data-draft-field="occurredAt" value="${escapeHtml(draft.occurredAt)}"></div>
              <div class="field"><label for="account-name">${draft.type === "transfer" ? "转出账户" : "账户"}</label><input id="account-name" data-draft-field="accountName" value="${escapeHtml(draft.accountName)}" placeholder="例如：微信"></div>
              ${draft.type === "transfer" ? `<div class="field"><label for="destination-account">转入账户</label><input id="destination-account" data-draft-field="destinationAccountName" value="${escapeHtml(draft.destinationAccountName)}" placeholder="例如：银行卡"></div>` : ""}
            </div></section>` : ""}
          </div>
          <div class="modal-save-bar">
            <button class="action-button save-record-button" type="submit">保存这笔记录</button>
          </div>
        </form>
      </section>
    </div>`;
}

function renderHelpModal() {
  return `
    <div class="modal-backdrop" data-action="close-help">
      <section class="modal-sheet" data-modal-sheet aria-label="安装说明">
        <div class="modal-heading"><h2>添加到 iPhone</h2><button class="close-button" type="button" data-action="close-help" aria-label="关闭">${iconMarkup("x", "close-glyph")}</button></div>
        <div class="help-copy">
          <div class="help-step"><b>1</b><div>用 <strong>Safari</strong> 打开这个 PWA 的网址。</div></div>
          <div class="help-step"><b>2</b><div>点击底部或顶部的<strong>分享</strong>按钮。</div></div>
           <div class="help-step"><b>3</b><div>选择<strong>添加到主屏幕</strong>，确认名称为“米糕记账”。</div></div>
           <div class="help-step"><b>4</b><div>从主屏幕打开图标，就会以独立网页 App 的样式运行。</div></div>
           <p>数据保存在本机浏览器里。长期使用建议开启云备份；之后打开自动合并，记账后自动上传。JSON 备份只作为兜底。</p>
          <section class="quick-help-card">
            <h3>双击辅助触控，快速记一笔</h3>
            <p>长期使用固定从主屏幕“米糕记账”图标打开。这个入口会使用独立 Web App 的本地账单，界面也没有 Safari 地址栏。</p>
            <p>新版配置里已经加入“快速记账”Web App 快捷项；如果你的 iOS 在主屏幕长按图标时显示它，优先从这里打开快速记账。不要把快捷指令里的“打开 URL”作为日常入口，它通常会进入 Safari 的另一套账单空间。</p>
            <p><strong>合并提醒：</strong>如果 Safari 里已经有旧账单，在 Safari 那套也开启同一个云备份账号；再回到主屏幕 Web App 开启同一账号，就会自动合并。</p>
          </section>
         </div>
        <div class="modal-actions"><button class="action-button secondary" type="button" data-action="close-help">知道了</button></div>
      </section>
    </div>`;
}

function renderRecordActionsModal() {
  const record = records.find((item) => item.id === ui.recordActionId);
  if (!record) return "";
  const meta = TYPE_META[record.type] || TYPE_META.expense;
  return `
    <div class="modal-backdrop record-action-backdrop" data-action="close-record-actions">
      <section class="modal-sheet record-action-sheet" data-modal-sheet aria-label="账单操作">
        <div class="record-action-summary">
          ${categoryIconMarkup(record.categoryId, meta.className)}
          <div><strong>${escapeHtml(record.categoryName)}</strong><span>${escapeHtml(record.note || record.accountName)}</span></div>
          <strong class="${meta.className}-text">${formatSigned(record)}</strong>
        </div>
        <button class="record-delete-action" type="button" data-action="delete-record" data-id="${escapeHtml(record.id)}">${iconMarkup("trash", "button-glyph")} 删除这笔记录</button>
        <button class="record-cancel-action" type="button" data-action="close-record-actions">取消</button>
      </section>
    </div>`;
}

function renderModals() {
  if (ui.modal) return renderAddModal();
  if (ui.helpModal) return renderHelpModal();
  if (ui.recordActionId) return renderRecordActionsModal();
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
  document.body.classList.toggle("modal-open", ui.modal || ui.helpModal || !!ui.recordActionId);
  const floatingAdd = document.querySelector(".floating-add");
  if (floatingAdd) floatingAdd.hidden = ui.tab !== "home" || ui.modal || ui.helpModal || !!ui.recordActionId;
  document.querySelectorAll(".nav-item[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === ui.tab);
  });
  window.setTimeout(maybeReloadAfterServiceWorkerSwap, 0);
}

function openAddModal() {
  ui.draft = createDraft("expense");
  ui.modal = true;
  ui.helpModal = false;
  ui.recordActionId = null;
  ui.quickEntry = false;
  ui.showAllCategories = false;
  ui.showMoreOptions = false;
  render();
  const amountInput = document.querySelector('[data-draft-field="amountText"]');
  if (amountInput) {
    amountInput.focus({ preventScroll: true });
    const caretPosition = amountInput.value.length;
    amountInput.setSelectionRange?.(caretPosition, caretPosition);
  }
}

function closeModal() {
  ui.modal = false;
  ui.quickEntry = false;
  ui.showAllCategories = false;
  ui.showMoreOptions = false;
  ui.draft = null;
  render();
}

function showToast(message) {
  const element = document.querySelector("#toast");
  if (!element) return;
  element.replaceChildren(document.createTextNode(message));
  element.classList.remove("with-action");
  element.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove("show"), 2300);
}

function showUndoToast(message) {
  const element = document.querySelector("#toast");
  if (!element) return;
  const label = document.createElement("span");
  label.textContent = message;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "undo-delete";
  button.textContent = "撤销";
  element.replaceChildren(label, button);
  element.classList.add("with-action", "show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    element.classList.remove("show", "with-action");
    pendingUndo = null;
  }, 5200);
}

function activateTrendDay(actionElement) {
  activateTrendDayData(actionElement.dataset.date, Number(actionElement.dataset.amount || 0), true);
}

function activateTrendDayData(date, amountCents, toast = false) {
  if (!date || ui.trendSelectedDate === date && !toast) return;
  ui.trendSelectedDate = date;
  if (!updateTrendVisual(date, amountCents)) render();
  if (toast) showToast(`${dayLabel(dateFromKey(date))}：${formatMoney(amountCents)}`);
}

function setSvgAttributes(element, attrs) {
  if (!element) return;
  Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, String(value)));
}

function updateTrendVisual(date, amountCents) {
  const chartElement = document.querySelector(".trend-chart");
  if (!chartElement) return false;
  const days = Number(chartElement.dataset.days || 0);
  const left = Number(chartElement.dataset.chartLeft || 0);
  const right = Number(chartElement.dataset.chartRight || 0);
  const viewWidth = Number(chartElement.dataset.viewWidth || 0);
  const dateValue = dateFromKey(date);
  const index = dateValue.getDate() - 1;
  if (!days || index < 0 || index >= days || right <= left || !viewWidth) return false;

  const slotWidth = (right - left) / days;
  const pointX = left + slotWidth * index + slotWidth / 2;
  chartElement.querySelectorAll(".trend-bar").forEach((bar) => {
    bar.classList.toggle("selected", bar.dataset.date === date);
  });

  const tooltipWidth = 112;
  const tooltipX = Math.min(Math.max(pointX - tooltipWidth / 2, 8), viewWidth - tooltipWidth - 8);
  const tooltip = chartElement.querySelector(".trend-tooltip");
  if (!tooltip) return true;
  tooltip.classList.add("visible");
  setSvgAttributes(tooltip.querySelector("rect"), { x: tooltipX.toFixed(1), y: 6, width: tooltipWidth, height: 42, rx: 8 });
  setSvgAttributes(tooltip.querySelector("path"), { d: `M ${pointX.toFixed(1)} 54 l -6 -7 h 12 Z` });
  const texts = tooltip.querySelectorAll("text");
  if (texts[0]) {
    setSvgAttributes(texts[0], { x: (tooltipX + 13).toFixed(1), y: 24 });
    texts[0].textContent = `${pad(dateValue.getMonth() + 1)}.${pad(dateValue.getDate())}`;
  }
  if (texts[1]) {
    setSvgAttributes(texts[1], { x: (tooltipX + 13).toFixed(1), y: 41 });
    texts[1].textContent = formatMoney(amountCents);
  }
  return true;
}

function trendDataFromPointer(event) {
  const chartElement = event.target.closest?.(".trend-chart") || document.querySelector(".trend-chart");
  if (!chartElement) return null;
  const rect = chartElement.getBoundingClientRect();
  if (!rect.width || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
  const days = Number(chartElement.dataset.days || 0);
  const left = Number(chartElement.dataset.chartLeft || 0);
  const right = Number(chartElement.dataset.chartRight || chartElement.dataset.viewWidth || 0);
  const viewWidth = Number(chartElement.dataset.viewWidth || 1);
  if (!days || right <= left) return null;
  const viewX = ((event.clientX - rect.left) / rect.width) * viewWidth;
  const ratio = Math.min(1, Math.max(0, (viewX - left) / (right - left)));
  const index = Math.min(days - 1, Math.max(0, Math.floor(ratio * days)));
  const date = new Date(ui.monthCursor.getFullYear(), ui.monthCursor.getMonth(), index + 1);
  const amountCents = dailyExpenses(ui.monthCursor)[index]?.amountCents || 0;
  return { date: dateKey(date), amountCents };
}

function handleTrendPointer(event) {
  const data = trendDataFromPointer(event);
  if (!data) return;
  event.preventDefault();
  trendDragActive = true;
  trendPointerHandledAt = Date.now();
  activateTrendDayData(data.date, data.amountCents);
}

function handleTrendPointerMove(event) {
  if (!trendDragActive) return;
  const data = trendDataFromPointer(event);
  if (!data) return;
  event.preventDefault();
  trendPointerHandledAt = Date.now();
  activateTrendDayData(data.date, data.amountCents);
}

function stopTrendPointer() {
  trendDragActive = false;
}

function navigateToTab(tabName, swipeDirection = 0) {
  if (!PRIMARY_TABS.includes(tabName)) return false;
  if (swipeDirection && (ui.modal || ui.helpModal || ui.recordActionId)) return false;
  if (ui.tab === tabName) return false;

  ui.tab = tabName;
  render();

  if (swipeDirection) {
    const page = document.querySelector("#page > .page");
    const animationClass = swipeDirection > 0 ? "page-swipe-next" : "page-swipe-previous";
    page?.classList.add(animationClass);
    window.setTimeout(() => page?.classList.remove(animationClass), 280);
  }
  return true;
}

function swipeTargetIsInteractive(target) {
  return !!target?.closest?.("button, a, input, select, textarea, summary, [contenteditable='true'], [data-action], [data-tab], .trend-chart, .calendar-grid, [data-no-swipe]");
}

function handleNavigationTouchStart(event) {
  if (event.touches.length !== 1 || ui.modal || ui.helpModal || ui.recordActionId || swipeTargetIsInteractive(event.target)) {
    navigationSwipe = null;
    return;
  }
  const touch = event.touches[0];
  navigationSwipe = {
    x: touch.clientX,
    y: touch.clientY,
    startedAt: Date.now(),
    target: event.target
  };
}

function handleNavigationTouchEnd(event) {
  if (!navigationSwipe || event.changedTouches.length !== 1) {
    navigationSwipe = null;
    return;
  }

  const start = navigationSwipe;
  navigationSwipe = null;
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - start.x;
  const deltaY = touch.clientY - start.y;
  const distance = Math.abs(deltaX);
  const elapsed = Date.now() - start.startedAt;
  const minDistance = Math.max(SWIPE_MIN_DISTANCE, Math.min(128, Math.round(window.innerWidth * .2)));

  if (swipeTargetIsInteractive(start.target)) return;
  if (elapsed > SWIPE_MAX_DURATION || distance < minDistance || distance <= Math.abs(deltaY) * 1.35) return;

  const currentIndex = PRIMARY_TABS.indexOf(ui.tab);
  const direction = deltaX < 0 ? 1 : -1;
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= PRIMARY_TABS.length) return;
  navigateToTab(PRIMARY_TABS[nextIndex], direction);
}

function handleNavigationTouchCancel() {
  navigationSwipe = null;
}

function updateCalendarSelection(selectedDate) {
  ui.selectedDate = selectedDate;
  const selectedCard = document.querySelector("[data-selected-date-card]");
  if (!selectedCard || ui.tab !== "ledger" || ui.ledgerMode !== "calendar") return false;
  document.querySelectorAll(".calendar-cell[data-date]").forEach((cell) => {
    cell.classList.toggle("selected", cell.dataset.date === selectedDate);
  });
  selectedCard.outerHTML = renderSelectedDateCard(selectedDate);
  return true;
}

function updateStatsCategory(categoryId) {
  ui.statsCategoryId = categoryId;
  if (ui.tab !== "statistics" || ui.statisticsMode !== "ranking") return false;
  const detailCard = document.querySelector("[data-category-detail-card]");
  if (!detailCard) return false;
  const stats = rankingStats(recordsForMonth(ui.monthCursor));
  const selected = stats.find((item) => item.id === categoryId);
  if (!selected) return false;
  document.querySelectorAll(".ranking-item[data-category]").forEach((item) => {
    item.classList.toggle("selected", item.dataset.category === categoryId);
  });
  detailCard.outerHTML = renderCategoryDetailCard(selected);
  return true;
}

function updateDraftCategorySelection(categoryId) {
  if (!ui.draft) return false;
  ui.draft.categoryId = categoryId;
  const buttons = document.querySelectorAll(".category-button[data-category]");
  if (!buttons.length) return false;
  buttons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.category === categoryId);
  });
  return true;
}

function deleteRecord(id) {
  const index = records.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [record] = records.splice(index, 1);
  pendingUndo = { record, index };
  ui.recordActionId = null;
  persistRecords();
  render();
  showUndoToast("已删除这笔记录");
}

function undoDeleteRecord() {
  if (!pendingUndo) return;
  records.splice(Math.min(pendingUndo.index, records.length), 0, pendingUndo.record);
  pendingUndo = null;
  persistRecords();
  render();
  showToast("已恢复这笔记录");
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
    navigateToTab(tab.dataset.tab);
    return;
  }

  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.action;

  const backdropCloseActions = new Set(["close-modal", "close-help", "close-record-actions"]);
  if (backdropCloseActions.has(action) && actionElement.classList.contains("modal-backdrop") && event.target !== actionElement) return;

  switch (action) {
    case "add":
      openAddModal();
      break;
    case "help":
      ui.helpModal = true;
      ui.recordActionId = null;
      render();
      break;
    case "close-modal":
      closeModal();
      break;
    case "close-help":
      ui.helpModal = false;
      render();
      break;
    case "record-more":
      ui.recordActionId = actionElement.dataset.id;
      render();
      break;
    case "close-record-actions":
      ui.recordActionId = null;
      render();
      break;
    case "export-data":
      exportData();
      break;
    case "import-data":
      document.querySelector("[data-backup-input]")?.click();
      break;
    case "refresh-app":
      refreshAppShell();
      break;
    case "mascot-react":
      triggerMascotReaction();
      break;
    case "cloud-enable":
      enableCloudSync();
      break;
    case "cloud-sync":
      syncCloudNow(true);
      break;
    case "cloud-disable":
      disableCloudSync();
      break;
    case "select-type":
      if (ui.draft) {
        ui.draft.type = actionElement.dataset.type;
        ui.draft.categoryId = categoriesFor(ui.draft.type)[0].id;
        ui.showAllCategories = false;
        render();
      }
      break;
    case "select-category":
      if (ui.draft) {
        if (!updateDraftCategorySelection(actionElement.dataset.category)) render();
      }
      break;
    case "toggle-categories":
      ui.showAllCategories = !ui.showAllCategories;
      render();
      break;
    case "toggle-more-options":
      ui.showMoreOptions = !ui.showMoreOptions;
      render();
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
      ui.trendSelectedDate = null;
      render();
      break;
    case "next-month":
      ui.monthCursor = addMonths(ui.monthCursor, 1);
      ui.selectedDate = dateKey(ui.monthCursor);
      ui.trendSelectedDate = null;
      render();
      break;
    case "calendar-date":
      if (!updateCalendarSelection(actionElement.dataset.date)) render();
      break;
    case "stats-category":
      updateStatsCategory(actionElement.dataset.category);
      break;
    case "trend-day":
      if (Date.now() - trendPointerHandledAt > 450) activateTrendDay(actionElement);
      break;
    case "delete-record":
      deleteRecord(actionElement.dataset.id);
      break;
    case "undo-delete":
      undoDeleteRecord();
      break;
    default:
      break;
  }
}

function handleInput(event) {
  const field = event.target.closest("[data-draft-field]");
  if (field && ui.draft) ui.draft[field.dataset.draftField] = field.value;
}

function handleBackupInput(event) {
  const input = event.target.closest("[data-backup-input]");
  if (!input || !input.files?.[0]) return;
  importData(input.files[0]);
  input.value = "";
}

function init() {
  ["gesturestart", "gesturechange", "gestureend"].forEach((eventName) => {
    document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
  });
  document.addEventListener("click", handleClick);
  document.addEventListener("pointerdown", handleTrendPointer, { passive: false });
  document.addEventListener("pointermove", handleTrendPointerMove, { passive: false });
  document.addEventListener("pointerup", stopTrendPointer);
  document.addEventListener("pointercancel", stopTrendPointer);
  document.addEventListener("touchstart", handleNavigationTouchStart, { passive: true });
  document.addEventListener("touchend", handleNavigationTouchEnd, { passive: true });
  document.addEventListener("touchcancel", handleNavigationTouchCancel, { passive: true });
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleBackupInput);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resumeCloudSync();
  });
  window.addEventListener("online", resumeCloudSync);
  document.addEventListener("submit", (event) => {
    if (event.target.matches('[data-form="add-record"]')) saveDraft(event);
  });
  const quickEntryRequested = openQuickEntryFromURL();
  render();
  if (quickEntryRequested) {
    window.setTimeout(() => document.querySelector('[data-draft-field="amountText"]')?.focus(), 50);
  }

  if ("serviceWorker" in navigator && ["https:", "http:"].includes(window.location.protocol)) {
    navigator.serviceWorker.register("./service-worker.js")
      .then((registration) => {
        bindServiceWorkerRegistration(registration);
        if (navigator.onLine !== false) registration.update().catch(() => {});
      })
      .catch(() => {});
  }
  if (navigator.storage && typeof navigator.storage.persist === "function") {
    navigator.storage.persist().catch(() => {});
  }
  scheduleMidnightBackup();
  loadAutoBackupStatus();
  restoreAutoBackupIfNeeded();
  scheduleStartupCloudSync();
}

init();

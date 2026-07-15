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
  trendSelectedDate: null,
  statsCategoryId: null,
  modal: false,
  helpModal: false,
  quickEntry: false,
  draft: null
};

let records = [];
let toastTimer = null;
let trendPointerHandledAt = 0;
let trendDragActive = false;
let autoBackupTimer = null;
let midnightBackupTimer = null;
let cloudBackupTimer = null;
let cloudStartupSyncDone = false;
let cloudSyncDirty = false;
let autoBackupStatus = {
  supported: typeof window !== "undefined" && !!window.indexedDB,
  available: false,
  savedAt: null,
  recordCount: 0
};
let lastManualBackupAt = loadLastManualBackupAt();
let cloudSyncConfig = loadCloudSyncConfig();
let cloudSyncStatus = "";
let cloudSyncBusy = false;
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
      lastRestoredAt: value.lastRestoredAt || null
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
  const response = await fetch(`${cloudSyncConfig.endpoint}${path}`, {
    ...options,
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
}

function cloudSyncText() {
  if (cloudSyncStatus) return cloudSyncStatus;
  if (!cloudSyncConfig) return "未开启。使用手机号作为账号，再设置同步密码/PIN；开启后会自动拉取合并、保存后自动上传。";
  if (cloudSyncConfig.identityVersion !== 2) return `${cloudSyncConfig.accountLabel} 使用旧版云备份配置。同手机号不同 PIN 会分成两套备份；建议关闭后用最终 PIN 重新开启。`;
  const last = cloudSyncConfig.lastUploadedAt ? `上次云备份：${backupTimeLabel(cloudSyncConfig.lastUploadedAt)}` : "还没有上传过云备份";
  return `${cloudSyncConfig.accountLabel} 已开启自动同步。打开时自动合并云端账单，记账后自动上传。${last}`;
}

function scheduleCloudBackup() {
  if (!cloudSyncConfig?.enabled) return;
  cloudSyncDirty = true;
  if (cloudBackupTimer) window.clearTimeout(cloudBackupTimer);
  cloudBackupTimer = window.setTimeout(() => {
    cloudBackupTimer = null;
    uploadCloudBackup(false);
  }, 3000);
}

async function uploadCloudBackup(manual = true) {
  if (!cloudSyncConfig?.enabled || cloudSyncBusy) return false;
  cloudSyncBusy = true;
  if (manual) {
    cloudSyncStatus = "正在上传云备份...";
    render();
  }
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
      lastUploadedAt: data?.updatedAt || new Date().toISOString()
    });
    cloudSyncDirty = false;
    cloudSyncStatus = manual ? "云备份已上传" : "";
    if (manual) showToast("云备份已上传");
    return true;
  } catch (error) {
    cloudSyncStatus = error?.message === "forbidden"
      ? "同步密码不匹配：这个手机号已绑定其它同步密码"
      : "云备份失败：请检查 Worker 地址或网络";
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
  if (manual) {
    cloudSyncStatus = "正在读取云备份...";
    render();
  }
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
      lastRestoredAt: new Date().toISOString()
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
    cloudSyncStatus = error?.message === "forbidden"
      ? "同步密码不匹配：这个手机号已绑定其它同步密码"
      : "读取云备份失败：请检查账号、PIN 或网络";
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
    syncCloudNow(false);
  }, 800);
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
      lastRestoredAt: null
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
  saveCloudSyncConfig(null);
  cloudStartupSyncDone = false;
  cloudSyncDirty = false;
  cloudSyncStatus = "已关闭本机云备份配置；云端旧备份不会自动删除。";
  render();
  showToast("已关闭云备份");
}

async function refreshAppShell() {
  showToast("正在刷新应用版本...");
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (_) {
    // Refresh is a convenience action; reloading still gives the browser a chance to fetch fresh files.
  }

  const url = new URL(window.location.href);
  url.searchParams.set("migao_refresh", Date.now().toString());
  window.location.replace(url.toString());
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
  ui.quickEntry = true;

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
        <p class="subtle reminder-copy">长期使用请固定从主屏幕 Web App 打开，并定期在“我的 → 数据管理”导出 JSON 备份。网页更新不会清空账单，但清除网站数据或换设备会丢失本机数据。</p>
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

function renderSelectedDateCard(selectedKey) {
  const selectedRecords = recordsForDay(selectedKey);
  return `
    <section class="paper-card selected-date-card" data-selected-date-card>
      <div class="section-heading"><div><h2>${dayLabel(dateFromKey(selectedKey))}</h2><div class="subtle">当天记录</div></div><span class="small-chip">${selectedRecords.length} 笔</span></div>
      ${selectedRecords.length ? `<div class="record-list">${selectedRecords.map((record) => renderRecordRow(record, true)).join("")}</div>` : renderEmptyState("这一天还没有记录", "选择其他日期，或直接记一笔", "☀")}
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
    <section class="paper-card calendar-card">
      <div class="weekdays">${WEEKDAYS.map((weekday) => `<span>${weekday}</span>`).join("")}</div>
      <div class="calendar-grid">${cells}</div>
    </section>
    ${renderSelectedDateCard(selectedKey)}`;
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
  const chart = { width: 360, height: 210, left: 8, right: 8, top: 54, bottom: 34 };
  const baseY = chart.height - chart.bottom;
  const plotHeight = baseY - chart.top;
  const spanX = chart.width - chart.left - chart.right;
  const points = daily.map((item, index) => {
    const x = chart.left + (spanX * index) / Math.max(daily.length - 1, 1);
    const y = baseY - (item.amountCents / max) * plotHeight;
    return { ...item, x, y };
  });
  const lastPoint = points[points.length - 1];
  const linePath = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `M ${chart.left} ${baseY} ${points.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ")} L ${lastPoint.x.toFixed(1)} ${baseY} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = chart.top + plotHeight * ratio;
    return `<line class="trend-grid-line" x1="${chart.left}" y1="${y.toFixed(1)}" x2="${chart.width - chart.right}" y2="${y.toFixed(1)}"></line>`;
  }).join("");
  const dayLabels = points
    .filter((point) => point.date.getDate() === 1 || point.date.getDate() % 5 === 0 || point === lastPoint)
    .map((point) => `<text class="trend-axis-label" x="${point.x.toFixed(1)}" y="${chart.height - 12}" text-anchor="middle">${pad(point.date.getDate())}</text>`)
    .join("");
  const pointNodes = points.map((point) => `
    <g class="trend-point-hit" data-action="trend-day" data-date="${dateKey(point.date)}" data-amount="${point.amountCents}" role="button" aria-label="${dayLabel(point.date)} ${formatMoney(point.amountCents)}">
      <circle class="trend-hit-area" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="7"></circle>
      <circle class="trend-point ${point.amountCents ? "has-value" : ""}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${point.amountCents ? 3.4 : 2.8}"></circle>
    </g>`).join("");
  const selectedPoint = points.find((point) => dateKey(point.date) === ui.trendSelectedDate);
  const stepX = spanX / Math.max(points.length - 1, 1);
  const dayZones = points.map((point, index) => {
    const x1 = index === 0 ? chart.left : point.x - stepX / 2;
    const x2 = index === points.length - 1 ? chart.width - chart.right : point.x + stepX / 2;
    return `<rect class="trend-day-zone" data-action="trend-day" data-date="${dateKey(point.date)}" data-amount="${point.amountCents}" x="${x1.toFixed(1)}" y="${chart.top}" width="${(x2 - x1).toFixed(1)}" height="${plotHeight.toFixed(1)}" rx="1.5"></rect>`;
  }).join("");
  const selectedBand = selectedPoint ? (() => {
    const index = points.indexOf(selectedPoint);
    const x1 = index === 0 ? chart.left : selectedPoint.x - stepX / 2;
    const x2 = index === points.length - 1 ? chart.width - chart.right : selectedPoint.x + stepX / 2;
    const bandTop = chart.top - 8;
    return `<rect class="trend-selected-band" x="${x1.toFixed(1)}" y="${bandTop}" width="${(x2 - x1).toFixed(1)}" height="${(baseY - bandTop).toFixed(1)}" rx="2"></rect>`;
  })() : "";
  const peak = selectedPoint || points.reduce((best, point) => point.amountCents > best.amountCents ? point : best, points[0]);
  const tooltipWidth = 112;
  const tooltipX = Math.min(Math.max(peak.x - tooltipWidth / 2, 8), chart.width - tooltipWidth - 8);
  const tooltip = `
    <g class="trend-tooltip">
      <rect x="${tooltipX.toFixed(1)}" y="6" width="${tooltipWidth}" height="42" rx="8"></rect>
      <path d="M ${peak.x.toFixed(1)} 54 l -6 -7 h 12 Z"></path>
      <text x="${(tooltipX + 13).toFixed(1)}" y="24">${pad(peak.date.getMonth() + 1)}.${pad(peak.date.getDate())}</text>
      <text class="trend-tooltip-amount" x="${(tooltipX + 13).toFixed(1)}" y="41">${formatMoney(peak.amountCents)}</text>
    </g>`;
  const expenseCount = monthRecords.filter((record) => record.type === "expense").length;
  const activeDays = daily.filter((item) => item.amountCents > 0).length || 1;
  const average = Math.round(total / activeDays);
  const lineChart = `
    <div class="trend-chart-shell">
      <svg class="trend-chart" viewBox="0 0 ${chart.width} ${chart.height}" width="${chart.width}" height="${chart.height}" data-days="${daily.length}" data-chart-left="${chart.left}" data-chart-right="${chart.width - chart.right}" data-chart-top="${chart.top}" data-chart-base="${baseY}" data-view-width="${chart.width}" role="img" aria-label="本月支出趋势折线图">
        <defs>
          <linearGradient id="trendAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#ff6d82" stop-opacity=".20"></stop>
            <stop offset="100%" stop-color="#ff6d82" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        ${gridLines}
        ${selectedBand}
        <path class="trend-area" d="${areaPath}"></path>
        <path class="trend-line" d="${linePath}"></path>
        ${pointNodes}
        ${tooltip}
        <line class="trend-axis" x1="${chart.left}" y1="${baseY}" x2="${chart.width - chart.right}" y2="${baseY}"></line>
        ${dayLabels}
        ${dayZones}
      </svg>
      <div class="trend-summary">本月已产生 <strong>${expenseCount}</strong> 笔支出，活跃日均 <strong>${formatMoney(average)}</strong></div>
    </div>`;

  return `
    <section class="paper-card stats-card">
      <div class="section-heading"><div><h2>支出趋势</h2><div class="subtle">每天的支出金额</div></div><span class="expense-text" style="font-weight:900;">${formatMoney(total)}</span></div>
      ${total ? `<div class="chart-wrap">${lineChart}</div><div class="chart-note">整月完整展示 · 轻触日期区域可看当天金额</div>` : renderEmptyState("还没有支出趋势", "开始记账后，这里会慢慢长出曲线", "📊")}
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
    <section class="paper-card category-detail-card" data-category-detail-card>
      <div class="section-heading"><div><h2>${escapeHtml(selected.name)}明细</h2><div class="subtle">${selected.records.length} 笔支出 · 合计 ${formatMoney(selected.amountCents)}</div></div><span class="category-icon expense">${escapeHtml(selected.icon)}</span></div>
      <div class="record-list">${selected.records.map((record) => renderRecordRow(record, true)).join("")}</div>
    </section>`;
}

function renderRanking(monthRecords) {
  const stats = rankingStats(monthRecords);
  if (!stats.length) {
    return `<section class="paper-card">${renderEmptyState("还没有分类排行", "记录几笔支出后，就能看到消费去向", "🏷")}</section>`;
  }
  const max = stats[0].amountCents || 1;
  const selected = stats.find((item) => item.id === ui.statsCategoryId) || stats[0];
  ui.statsCategoryId = selected.id;
  return `
    <section class="paper-card stats-card">
      <div class="section-heading"><div><h2>分类排行</h2><div class="subtle">按支出金额从高到低</div></div><span class="small-chip">${stats.length} 类</span></div>
      <div class="ranking-list">
        ${stats.map((item) => `
          <button class="ranking-item ${item.id === selected.id ? "selected" : ""}" type="button" data-action="stats-category" data-category="${escapeHtml(item.id)}">
            <div class="ranking-top"><span class="category-icon expense">${escapeHtml(item.icon)}</span><span class="ranking-name">${escapeHtml(item.name)}</span><span class="ranking-count">${item.records.length} 笔</span><span class="ranking-value">${formatMoney(item.amountCents)}</span></div>
            <div class="progress-track"><div class="progress-value" style="width:${(item.amountCents / max) * 100}%"></div></div>
          </button>`).join("")}
      </div>
    </section>
    ${renderCategoryDetailCard(selected)}`;
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
      <div class="page-title-row"><div><span class="eyebrow">本地 · 米糕</span><h1>我的</h1></div><span class="small-chip">v1.2</span></div>
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
          <div class="settings-line"><span class="line-icon">↻</span><span>${autoBackupText()}</span></div>
        </div>
        <div class="settings-actions">
          <button class="action-button secondary" type="button" data-action="refresh-app">刷新到最新版本</button>
        </div>
      </section>
      <section class="paper-card backup-card">
        <div class="section-heading"><div><h2>数据管理</h2><div class="subtle">本机备份和旧数据导入</div></div><span class="small-chip">${records.length} 笔</span></div>
        <div class="subtle backup-note">主屏幕独立 Web App 和 Safari 可能是两套本地账单。开启云备份后，两边只要使用同一个手机号账号和同步密码，打开时会自动从云端合并，记账后会自动上传。JSON 导入导出只作为兜底备份。</div>
        <div class="merge-steps">
          <div><strong>1</strong><span>在有旧账单的入口开启同一个云备份账号</span></div>
          <div><strong>2</strong><span>回到主屏幕 Web App，使用同一手机号和同步密码开启云备份</span></div>
          <div><strong>3</strong><span>以后打开自动合并，保存账单后自动上传</span></div>
        </div>
        <div class="backup-auto-note">↻ ${autoBackupText()}</div>
        <div class="backup-manual-note">${manualBackupText()}</div>
        <div class="backup-actions">
          <button class="action-button secondary" type="button" data-action="export-data">导出 JSON 备份</button>
          <button class="action-button secondary" type="button" data-action="import-data">导入 JSON 备份</button>
          <input type="file" accept="application/json,.json" data-backup-input hidden>
        </div>
      </section>
      <section class="paper-card cloud-card">
        <div class="section-heading"><div><h2>云备份</h2><div class="subtle">手机号作为账号，同步密码/PIN 负责加密</div></div><span class="small-chip">可选</span></div>
        <div class="subtle backup-note">云备份用于换手机、重装或自动合并 Safari/Web App 两套账单。账单上传前会在本机加密，云端只保存密文；请记住手机号和同步密码，忘记密码无法解密云端备份。</div>
        <div class="backup-auto-note">☁ ${cloudSyncText()}</div>
        ${cloudSyncConfig ? `
          <div class="backup-actions">
            <button class="action-button secondary" type="button" data-action="cloud-sync" ${cloudSyncBusy ? "disabled" : ""}>立即同步</button>
            <button class="action-button secondary" type="button" data-action="cloud-disable" ${cloudSyncBusy ? "disabled" : ""}>关闭本机云备份配置</button>
          </div>
        ` : `
          <div class="cloud-form">
            <div class="field"><label for="cloud-endpoint">Worker 地址</label><input id="cloud-endpoint" data-cloud-field="endpoint" inputmode="url" value="${CLOUD_SYNC_DEFAULT_ENDPOINT}" placeholder="https://你的-worker.workers.dev"></div>
            <div class="field"><label for="cloud-phone">手机号账号</label><input id="cloud-phone" data-cloud-field="phone" inputmode="tel" autocomplete="tel" placeholder="例如：13800138000"></div>
            <div class="field"><label for="cloud-pin">同步密码 / PIN</label><input id="cloud-pin" data-cloud-field="pin" type="password" autocomplete="new-password" placeholder="至少 4 位，务必记住"></div>
          </div>
          <button class="action-button" type="button" data-action="cloud-enable" ${cloudSyncBusy ? "disabled" : ""}>开启自动云备份</button>
        `}
      </section>
      <section class="paper-card">
        <div class="section-heading"><div><h2>主屏幕入口</h2><div class="subtle">长期使用固定从 Web App 打开</div></div><span>🐕</span></div>
        <div class="subtle" style="line-height:1.65;">用 Safari 第一次打开网址并添加到主屏幕；之后日常记账、查看和导入备份都从主屏幕图标进入。不要把 Safari 地址栏里的页面当成另一个日常账本。</div>
      </section>
    </div>`;
}

function renderAddModal() {
  const draft = ui.draft || createDraft();
  const categories = categoriesFor(draft.type);
  const meta = TYPE_META[draft.type];
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal-sheet add-modal-sheet ${ui.quickEntry ? "quick-entry-sheet" : ""}" data-modal-sheet aria-label="记一笔">
        <div class="modal-heading"><h2>${ui.quickEntry ? "快速记一笔" : "记一笔"}</h2><button class="close-button" type="button" data-action="close-modal" aria-label="关闭">×</button></div>
        <form class="add-record-form" data-form="add-record">
          <div class="add-form-scroll">
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
        <div class="modal-heading"><h2>添加到 iPhone</h2><button class="close-button" type="button" data-action="close-help" aria-label="关闭">×</button></div>
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
  const top = Number(chartElement.dataset.chartTop || 0);
  const base = Number(chartElement.dataset.chartBase || 0);
  const viewWidth = Number(chartElement.dataset.viewWidth || 0);
  const dateValue = dateFromKey(date);
  const index = dateValue.getDate() - 1;
  if (!days || index < 0 || index >= days || right <= left || !viewWidth) return false;

  const stepX = (right - left) / Math.max(days - 1, 1);
  const pointX = left + stepX * index;
  const x1 = index === 0 ? left : pointX - stepX / 2;
  const x2 = index === days - 1 ? right : pointX + stepX / 2;
  const bandTop = top - 8;
  const svgNamespace = "http://www.w3.org/2000/svg";
  let band = chartElement.querySelector(".trend-selected-band");
  if (!band) {
    band = document.createElementNS(svgNamespace, "rect");
    band.classList.add("trend-selected-band");
    chartElement.insertBefore(band, chartElement.querySelector(".trend-area"));
  }
  setSvgAttributes(band, {
    x: x1.toFixed(1),
    y: bandTop,
    width: (x2 - x1).toFixed(1),
    height: (base - bandTop).toFixed(1),
    rx: 2
  });

  const tooltipWidth = 112;
  const tooltipX = Math.min(Math.max(pointX - tooltipWidth / 2, 8), viewWidth - tooltipWidth - 8);
  const tooltip = chartElement.querySelector(".trend-tooltip");
  if (!tooltip) return true;
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
  const index = Math.min(days - 1, Math.max(0, Math.round(ratio * (days - 1))));
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
  const record = records.find((item) => item.id === id);
  if (!record) return;
  if (!window.confirm(`确定删除“${record.categoryName} ${formatMoney(record.amountCents)}”吗？`)) return;
  records = records.filter((item) => item.id !== id);
  persistRecords();
  render();
  showToast("已删除这笔记录");
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
    case "export-data":
      exportData();
      break;
    case "import-data":
      document.querySelector("[data-backup-input]")?.click();
      break;
    case "refresh-app":
      refreshAppShell();
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
        render();
      }
      break;
    case "select-category":
      if (ui.draft) {
        if (!updateDraftCategorySelection(actionElement.dataset.category)) render();
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
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleBackupInput);
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
  scheduleMidnightBackup();
  loadAutoBackupStatus();
  restoreAutoBackupIfNeeded();
  scheduleStartupCloudSync();
}

init();

const JSON_HEADERS = {
  "content-type": "application/json;charset=utf-8"
};

function corsHeaders(env) {
  return {
    "access-control-allow-origin": env.CORS_ORIGIN || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-migao-auth",
    "access-control-max-age": "86400"
  };
}

function json(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(env) }
  });
}

function isHex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validEncryptedPayload(value) {
  return value
    && value.format === "migao-cloud-backup-encrypted"
    && value.version === 1
    && value.alg === "AES-GCM"
    && typeof value.iv === "string"
    && typeof value.ciphertext === "string"
    && value.iv.length < 128
    && value.ciphertext.length < 20 * 1024 * 1024;
}

async function readBackup(env, accountId) {
  return env.MIGAO_BACKUPS.get(`backup:${accountId}`, "json");
}

async function writeBackup(env, accountId, data) {
  await env.MIGAO_BACKUPS.put(`backup:${accountId}`, JSON.stringify(data));
}

async function handleGetBackup(request, env) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("account");
  const authHash = request.headers.get("x-migao-auth");
  if (!isHex(accountId) || !isHex(authHash)) return json({ error: "bad request" }, 400, env);

  const existing = await readBackup(env, accountId);
  if (!existing) return json({ error: "not found" }, 404, env);
  if (existing.authHash !== authHash) return json({ error: "forbidden" }, 403, env);

  return json({
    encryptedPayload: existing.encryptedPayload,
    recordCount: existing.recordCount,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt
  }, 200, env);
}

async function handlePutBackup(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "invalid json" }, 400, env);
  }

  const accountId = body?.accountId;
  const authHash = body?.authHash;
  const recordCount = Number(body?.recordCount || 0);
  if (!isHex(accountId) || !isHex(authHash) || !validEncryptedPayload(body?.encryptedPayload)) {
    return json({ error: "bad request" }, 400, env);
  }
  if (!Number.isFinite(recordCount) || recordCount < 0 || recordCount > 1000000) {
    return json({ error: "bad record count" }, 400, env);
  }

  const existing = await readBackup(env, accountId);
  if (existing && existing.authHash !== authHash) {
    return json({ error: "forbidden" }, 403, env);
  }

  const now = new Date().toISOString();
  const stored = {
    schemaVersion: 1,
    authHash,
    encryptedPayload: body.encryptedPayload,
    recordCount,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    clientUpdatedAt: body.clientUpdatedAt || null
  };
  await writeBackup(env, accountId, stored);
  return json({ ok: true, recordCount, updatedAt: now }, 200, env);
}

export default {
  async fetch(request, env) {
    if (!env.MIGAO_BACKUPS) {
      return json({ error: "missing KV binding MIGAO_BACKUPS" }, 500, env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "migao-cloud-backup" }, 200, env);
    }

    if (url.pathname === "/api/backup" && request.method === "GET") {
      return handleGetBackup(request, env);
    }
    if (url.pathname === "/api/backup" && request.method === "POST") {
      return handlePutBackup(request, env);
    }

    return json({ error: "not found" }, 404, env);
  }
};


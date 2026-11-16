import { RULES } from "./rules.js";

const GRAPH = "https://graph.instagram.com";
const TOKEN_KEY = "ig_access_token";

export default {
  // Meta 웹훅 수신
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/webhook") return new Response("ok");

    // 1) 웹훅 등록 시 Meta가 보내는 확인 요청
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token && token === env.VERIFY_TOKEN) {
        return new Response(challenge ?? "", { status: 200 });
      }
      return new Response("forbidden", { status: 403 });
    }

    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });

    // 2) 서명 검증: Meta가 보낸 요청인지 확인
    const raw = await request.text();
    const sig = request.headers.get("x-hub-signature-256") || "";
    if (!(await verifySignature(raw, sig, env.APP_SECRET))) {
      return new Response("invalid signature", { status: 401 });
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("bad json", { status: 400 });
    }

    // Meta는 빠른 200 응답을 원하므로 실제 처리는 백그라운드로
    ctx.waitUntil(handleEvent(body, env).catch((e) => console.error("handleEvent", e)));
    return new Response("EVENT_RECEIVED");
  },

  // 크론: 장기 토큰(60일) 자동 갱신
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshToken(env));
  },
};

export async function handleEvent(body, env) {
  if (body?.object !== "instagram") return;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      await handleComment(change.value, entry.id, env);
    }
  }
}

async function handleComment(c, accountId, env) {
  if (!c?.id || !c?.from?.id) return;
  const myId = env.IG_USER_ID || accountId;

  // 내 계정이 단 댓글(자동 공개답글 포함)은 무시 → 무한 루프 방지
  if (c.from.id === myId || c.from.id === accountId) return;

  const rule = matchRule(c);
  if (!rule) return;

  const username = c.from.username ?? "";
  const token = await getToken(env);

  // 비공개 답장(Private Reply): 댓글 1개당 1회, 댓글 작성 후 7일 이내만 가능
  const dm = await graphPost(`/${env.GRAPH_VERSION}/${myId}/messages`, token, {
    recipient: { comment_id: c.id },
    message: { text: fill(rule.dm, username) },
  });
  if (!dm.ok) {
    // 이미 보낸 댓글(웹훅 재전송)도 여기서 실패하므로 공개 답글이 중복되지 않음
    console.warn("private reply failed", c.id, dm.status, dm.data);
    return;
  }
  console.log("DM sent", c.id, username);

  if (rule.public_reply) {
    const r = await graphPost(`/${env.GRAPH_VERSION}/${c.id}/replies`, token, {
      message: fill(rule.public_reply, username),
    });
    if (!r.ok) console.warn("public reply failed", c.id, r.status, r.data);
  }
}

export function matchRule(c, rules = RULES) {
  const text = (c.text ?? "").toLowerCase();
  return rules.find((r) => {
    if (r.media_id && r.media_id !== c.media?.id) return false;
    if (!r.keywords || r.keywords.length === 0) return true;
    return r.keywords.some((k) => text.includes(String(k).toLowerCase()));
  });
}

function fill(tpl, username) {
  return String(tpl).replaceAll("{username}", username);
}

async function graphPost(path, token, payload) {
  const res = await fetch(GRAPH + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, data };
}

async function getToken(env) {
  const stored = env.TOKENS ? await env.TOKENS.get(TOKEN_KEY) : null;
  return stored || env.IG_ACCESS_TOKEN;
}

async function refreshToken(env) {
  if (!env.TOKENS) return;
  const current = await getToken(env);
  const res = await fetch(
    `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`
  );
  const data = await res.json().catch(() => null);
  if (res.ok && data?.access_token) {
    await env.TOKENS.put(TOKEN_KEY, data.access_token);
    console.log("token refreshed, expires_in", data.expires_in);
  } else {
    console.error("token refresh failed", res.status, data);
  }
}

export async function verifySignature(raw, header, secret) {
  if (!secret || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

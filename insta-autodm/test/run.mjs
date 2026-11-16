// node test/run.mjs — Meta API를 흉내 내서 동작 확인
import worker, { matchRule } from "../src/index.js";
import { createHmac } from "node:crypto";
import assert from "node:assert";

const env = { APP_SECRET: "s3cret", VERIFY_TOKEN: "vt", IG_ACCESS_TOKEN: "tok", GRAPH_VERSION: "v23.0", IG_USER_ID: "999" };
const calls = [];
let sentComments = new Set();
globalThis.fetch = async (url, opt) => {
  const body = JSON.parse(opt.body);
  calls.push({ url, body });
  if (url.endsWith("/messages")) {
    const id = body.recipient.comment_id;
    if (sentComments.has(id)) return new Response(JSON.stringify({ error: "already" }), { status: 400 });
    sentComments.add(id);
  }
  return new Response(JSON.stringify({ id: "x" }), { status: 200 });
};
const run = async (req) => {
  const waits = [];
  const res = await worker.fetch(req, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return res;
};
const post = (obj, secret = env.APP_SECRET) => {
  const raw = JSON.stringify(obj);
  const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return new Request("https://w/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig } });
};
const ev = (from, text, id = "c1") => ({ object: "instagram", entry: [{ id: "999", changes: [{ field: "comments", value: { id, text, from: { id: from, username: "kim" }, media: { id: "m1" } } }] }] });

// 웹훅 확인
let r = await run(new Request("https://w/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=123"));
assert.equal(await r.text(), "123");
r = await run(new Request("https://w/webhook?hub.mode=subscribe&hub.verify_token=no&hub.challenge=123"));
assert.equal(r.status, 403);
// 잘못된 서명
r = await run(post(ev("1", "신청"), "wrong"));
assert.equal(r.status, 401); assert.equal(calls.length, 0);
// 키워드 매칭 → DM + 공개답글
r = await run(post(ev("1", "저 신청할게요")));
assert.equal(r.status, 200); assert.equal(calls.length, 2);
assert.ok(calls[0].url.endsWith("/v23.0/999/messages"));
assert.deepEqual(calls[0].body.recipient, { comment_id: "c1" });
assert.ok(calls[0].body.message.text.includes("kim"));
assert.ok(calls[1].url.endsWith("/v23.0/c1/replies"));
// 재전송(중복) → DM 실패, 공개답글 안 함
r = await run(post(ev("1", "저 신청할게요")));
assert.equal(calls.length, 3);
// 키워드 없음
r = await run(post(ev("1", "예뻐요", "c2")));
assert.equal(calls.length, 3);
// 내 계정 댓글 무시
r = await run(post(ev("999", "@kim DM 보내드렸어요 신청", "c3")));
assert.equal(calls.length, 3);
// media_id 필터
assert.equal(matchRule({ text: "신청", media: { id: "a" } }, [{ media_id: "b", keywords: ["신청"] }]), undefined);
console.log("all tests passed");

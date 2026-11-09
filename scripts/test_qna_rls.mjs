import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

for (const raw of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const index = line.indexOf("=");
  const key = line.slice(0, index).trim();
  let value = line.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (!process.env[key]) process.env[key] = value;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function makeUser(label) {
  const stamp = Date.now() + Math.random();
  const email = `codex-qna-${label}-${stamp}@example.invalid`;
  const password = `Cdx!${crypto.randomBytes(18).toString("base64url")}`;
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { birth_date: "1990-01-02", terms_version: "2026-08-01", privacy_version: "2026-08-01" },
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  const cookies = [];
  const ssr = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookies,
      setAll(items) {
        for (const item of items) {
          const idx = cookies.findIndex((c) => c.name === item.name);
          if (!item.value) { if (idx >= 0) cookies.splice(idx, 1); }
          else if (idx >= 0) cookies[idx] = { name: item.name, value: item.value };
          else cookies.push({ name: item.name, value: item.value });
        }
      },
    },
  });
  const signed = await ssr.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error("no session");
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signed.data.session.access_token}` } },
  });
  return { userId, client };
}

const userIds = [];
try {
  const { data: cert } = await admin.from("certifications").select("id,code").eq("code", "gongin").maybeSingle();
  if (!cert) throw new Error("gongin certification not found - seed it first");

  const a = await makeUser("a");
  const b = await makeUser("b");
  userIds.push(a.userId, b.userId);

  // A creates a post tagged to gongin
  const { data: post, error: postErr } = await a.client.from("qna_posts").insert({ user_id: a.userId, certification_id: cert.id, title: "테스트 질문", content: "테스트 내용" }).select("id").single();
  if (postErr) throw new Error("A insert post failed: " + postErr.message);
  console.log("A created post:", post.id);

  // A creates a post tagged 일반 (certification_id null)
  const { data: basicPost, error: basicErr } = await a.client.from("qna_posts").insert({ user_id: a.userId, certification_id: null, title: "일반 질문", content: "일반 내용" }).select("id").single();
  if (basicErr) throw new Error("A insert general post failed: " + basicErr.message);
  console.log("A created general post:", basicPost.id);

  // B can read A's post
  const { data: readByB, error: readErr } = await b.client.from("qna_posts").select("id,title").eq("id", post.id).maybeSingle();
  if (readErr || !readByB) throw new Error("B could not read A's post: " + readErr?.message);
  console.log("B read A's post: OK");

  // B comments on A's post
  const { data: comment, error: commentErr } = await b.client.from("qna_comments").insert({ post_id: post.id, user_id: b.userId, content: "제 생각엔..." }).select("id").single();
  if (commentErr) throw new Error("B insert comment failed: " + commentErr.message);
  console.log("B commented: OK");

  // B tries to delete A's post - should be blocked by RLS (no rows affected, no throw)
  const { data: deletedByB } = await b.client.from("qna_posts").delete().eq("id", post.id).select("id");
  if (deletedByB && deletedByB.length > 0) throw new Error("SECURITY BUG: B was able to delete A's post!");
  console.log("B cannot delete A's post: OK (blocked by RLS)");

  // B tries to edit A's post - should be blocked
  const { data: updatedByB } = await b.client.from("qna_posts").update({ title: "해킹됨" }).eq("id", post.id).select("id");
  if (updatedByB && updatedByB.length > 0) throw new Error("SECURITY BUG: B was able to edit A's post!");
  console.log("B cannot edit A's post: OK (blocked by RLS)");

  // A deletes own comment-having post -> comment should cascade delete
  const { error: aDeleteErr } = await a.client.from("qna_posts").delete().eq("id", post.id);
  if (aDeleteErr) throw new Error("A could not delete own post: " + aDeleteErr.message);
  const { data: orphanComment } = await admin.from("qna_comments").select("id").eq("id", comment.id).maybeSingle();
  if (orphanComment) throw new Error("BUG: comment did not cascade delete with its post");
  console.log("A deleted own post, comment cascade-deleted: OK");

  // cleanup remaining post
  await a.client.from("qna_posts").delete().eq("id", basicPost.id);

  console.log("ALL QNA RLS CHECKS PASSED");
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
}

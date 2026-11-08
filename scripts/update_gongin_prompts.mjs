// 2025년 제36회 공인중개사 지문·보기를 정리본(data/gongin/prompts-2025-formatted.json)으로 바꾼다.
//   - 시험지의 네모 박스 제시문을 :::box … ::: 로 감싸 질문과 분리 (PromptText 가 박스로 그린다)
//   - PDF 두 단 편집에서 생긴 줄바꿈을 이어 붙이고, 빈칸 표기를 ( ㄱ ) / (   ) 로 통일
// 문항·보기 ID 와 정답은 그대로라 응시 기록에는 영향이 없다.
//   node scripts/update_gongin_prompts.mjs          바뀔 개수만 확인 (DB 쓰기 없음)
//   node scripts/update_gongin_prompts.mjs --apply  반영
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnv(filePath) {
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const root = process.cwd();
loadEnv(path.join(root, ".env.local"));
const apply = process.argv.includes("--apply");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
// { [exam slug]: { [문항 번호]: { prompt, choices: { [sort_order]: content } } } }
const formatted = JSON.parse(fs.readFileSync(path.join(root, "data/gongin/prompts-2025-formatted.json"), "utf8"));

async function main() {
  let promptCount = 0;
  let choiceCount = 0;
  for (const [slug, items] of Object.entries(formatted)) {
    const { data: exam, error: examErr } = await admin.from("exams").select("id").eq("slug", slug).single();
    if (examErr) throw new Error(`${slug} lookup failed: ` + examErr.message);
    const { data: questions, error } = await admin.from("questions")
      .select("id,number,prompt,question_choices(id,sort_order,content)").eq("exam_id", exam.id);
    if (error) throw new Error(`${slug} questions failed: ` + error.message);
    if (questions.length !== Object.keys(items).length) throw new Error(`${slug}: DB ${questions.length}문항, 정리본 ${Object.keys(items).length}문항`);

    for (const question of questions) {
      const item = items[String(question.number)];
      if (!item) throw new Error(`${slug} q${question.number}: 정리본에 없음`);
      if (item.prompt !== question.prompt) {
        promptCount++;
        if (apply) {
          const { error: updateErr } = await admin.from("questions").update({ prompt: item.prompt }).eq("id", question.id);
          if (updateErr) throw new Error(`${slug} q${question.number} prompt update failed: ` + updateErr.message);
        }
      }
      for (const choice of question.question_choices) {
        const content = item.choices[String(choice.sort_order)];
        if (content === undefined) throw new Error(`${slug} q${question.number} 보기 ${choice.sort_order}: 정리본에 없음`);
        if (content === choice.content) continue;
        choiceCount++;
        if (apply) {
          const { error: updateErr } = await admin.from("question_choices").update({ content }).eq("id", choice.id);
          if (updateErr) throw new Error(`${slug} q${question.number} choice update failed: ` + updateErr.message);
        }
      }
    }
  }
  console.log(`${apply ? "updated" : "would update"}: prompts ${promptCount}, choices ${choiceCount}`);
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});

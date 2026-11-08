// 예상문제(기출 아님) 세트를 등록한다. 자격증별 설정은 아래 CONFIGS 에 둔다.
// 사용: node scripts/seed_mock_exam.mjs <자격증코드> <세트번호> [--activate]
//   예) node scripts/seed_mock_exam.mjs jeongbo 01            → data/jeongbo/mock-01.json 을 slug jeongbo-mock-01 로 등록
//       --activate 를 붙이면 자격증을 공개한다(붙이지 않으면 현재 공개 상태를 유지, 새 자격증은 숨김)
// slug 의 "-mock-" 으로 기출과 구분한다(src/lib/certifications.ts isMockExamSlug).
// 데이터 형식: { "1": { subject, stem, choices: [보기 문자열...], answer: 1~n, tag, explanation }, ... }
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
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// 과목별 최소 40%(과락), 전체 60% 이상 합격. 문항당 1점.
const CONFIGS = {
  sazor2: {
    cert: { name: "사회조사분석사 2급", description: "사회조사분석사 2급 필기 출제기준(2027~2030)에 맞춘 예상문제", sort_order: 5 },
    title: (n) => `사회조사분석사 2급 필기 예상문제 제${n}회`,
    description: "2027~2030년 출제기준에 맞춰 만든 예상문제(3과목 80문항)입니다. 실제 기출문제가 아닙니다.",
    durationMinutes: 120,
    sections: [
      { title: "조사방법과 설계", code: "research-design", max: 25, min: 10 },
      { title: "조사관리와 자료처리", code: "data-management", max: 25, min: 10 },
      { title: "통계분석과 활용", code: "statistics", max: 30, min: 12 },
    ],
  },
  jeongbo: {
    cert: { name: "정보처리기사", description: "정보처리기사 필기 개편 출제기준(2027~2029)에 맞춘 예상문제", sort_order: 6 },
    title: (n) => `정보처리기사 필기 예상문제 제${n}회`,
    description: "2027년 개편 출제기준에 맞춰 만든 예상문제(4과목 80문항)입니다. 실제 기출문제가 아닙니다.",
    durationMinutes: 120,
    sections: [
      { title: "소프트웨어 개발", code: "software-development", max: 20, min: 8 },
      { title: "데이터베이스 구축", code: "database", max: 20, min: 8 },
      { title: "프로그래밍 언어 활용", code: "programming", max: 20, min: 8 },
      { title: "정보시스템 구축관리", code: "system-management", max: 20, min: 8 },
    ],
  },
  jiksang2: {
    cert: { name: "직업상담사 2급", description: "직업상담사 2급 필기 출제기준(2025~2027)에 맞춘 예상문제", sort_order: 7 },
    title: (n) => `직업상담사 2급 필기 예상문제 제${n}회`,
    description: "2025~2027년 출제기준에 맞춰 만든 예상문제(5과목 100문항)입니다. 실제 기출문제가 아닙니다. 법령은 2026년 11월 시행 기준입니다.",
    durationMinutes: 150,
    sections: [
      { title: "직업심리", code: "vocational-psychology", max: 20, min: 8 },
      { title: "직업상담 및 취업지원", code: "counseling-employment", max: 20, min: 8 },
      { title: "직업정보", code: "occupational-info", max: 20, min: 8 },
      { title: "노동시장", code: "labor-market", max: 20, min: 8 },
      { title: "고용노동관계법규(Ⅰ)", code: "labor-law", max: 20, min: 8 },
    ],
  },
};

async function main() {
  const [code, set] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const config = CONFIGS[code];
  if (!config || !set) throw new Error(`usage: node scripts/seed_mock_exam.mjs <${Object.keys(CONFIGS).join("|")}> <세트번호>`);
  const activate = process.argv.includes("--activate");
  const slug = `${code}-mock-${set}`;
  const questions = JSON.parse(fs.readFileSync(path.join(root, "data", code, `mock-${set}.json`), "utf8"));
  const count = Object.keys(questions).length;
  const totalScore = config.sections.reduce((sum, s) => sum + s.max, 0);
  if (count !== totalScore) throw new Error(`${slug}: ${totalScore}문항이어야 하는데 ${count}문항`);

  const current = await admin.from("certifications").select("is_active").eq("code", code).maybeSingle();
  const { data: cert, error: certErr } = await admin.from("certifications")
    .upsert({ code, ...config.cert, is_active: activate || Boolean(current.data?.is_active) }, { onConflict: "code" })
    .select("id,is_active").single();
  if (certErr) throw new Error("certification upsert failed: " + certErr.message);
  console.log(`certification ${code} active:`, cert.is_active);

  const existing = await admin.from("exams").select("id").eq("slug", slug).maybeSingle();
  if (existing.data) {
    console.log(`skip ${slug}: already exists`);
    return;
  }

  const { data: exam, error: examErr } = await admin.from("exams").insert({
    slug,
    title: config.title(Number(set)),
    description: config.description,
    kind: "quiz", status: "published", duration_minutes: config.durationMinutes,
    passing_score: totalScore * 0.6, total_score: totalScore, fixed_order: true,
    certification_id: cert.id, published_at: new Date().toISOString(),
  }).select("id").single();
  if (examErr) throw new Error(`${slug} exam insert failed: ` + examErr.message);

  const { data: sections, error: sectionErr } = await admin.from("exam_sections").insert(
    config.sections.map((s, i) => ({ exam_id: exam.id, code: s.code, title: s.title, max_score: s.max, min_score: s.min, sort_order: i + 1 })),
  ).select("id,title");
  if (sectionErr) throw new Error(`${slug} sections insert failed: ` + sectionErr.message);
  const sectionId = Object.fromEntries(sections.map((s) => [s.title, s.id]));

  for (let n = 1; n <= count; n++) {
    const q = questions[String(n)];
    if (!sectionId[q.subject]) throw new Error(`${slug} q${n}: unknown subject ${q.subject}`);
    const { data: inserted, error: qErr } = await admin.from("questions").insert({
      exam_id: exam.id, section_id: sectionId[q.subject], number: n, type: "single_choice",
      prompt: q.stem, score: 1, difficulty: 2, competency_tags: [q.tag], is_active: true,
    }).select("id").single();
    if (qErr) throw new Error(`${slug} q${n} insert failed: ` + qErr.message);

    const { data: choices, error: choiceErr } = await admin.from("question_choices").insert(
      q.choices.map((content, i) => ({ question_id: inserted.id, label: String(i + 1), content, sort_order: i + 1 })),
    ).select("id,label");
    if (choiceErr) throw new Error(`${slug} q${n} choices insert failed: ` + choiceErr.message);
    const correct = choices.find((c) => c.label === String(q.answer));
    if (!correct) throw new Error(`${slug} q${n}: no choice matches answer ${q.answer}`);

    const { error: keyErr } = await admin.from("answer_keys").insert({
      question_id: inserted.id, grading_type: "exact", correct_choice_id: correct.id, explanation: q.explanation,
    });
    if (keyErr) throw new Error(`${slug} q${n} answer_key insert failed: ` + keyErr.message);
  }
  console.log(`${slug}: seeded ${count} questions`);
}

main().then(() => console.log("SEED DONE")).catch((err) => {
  console.error("SEED FAILED:", err.message);
  process.exit(1);
});

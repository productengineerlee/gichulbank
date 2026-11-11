import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CertGrid, HomeFooter, HomeHeader } from "@/components/home/home-parts";
import { getCertificationProofs } from "@/lib/reviews";
import { listCertifications } from "@/lib/certifications";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "회차별로 풀기", body: "실제 시험처럼 시간을 재며 한 회차를 풀고, 과목별 점수와 해설을 바로 확인해요." },
  { title: "틀린 문제는 오답노트로", body: "틀린 문제는 자동으로 모이고 1·3·7일 간격으로 다시 풀어 3번 맞히면 졸업해요." },
  { title: "오늘의 10문제", body: "오답 복습, 약한 과목, 아직 안 푼 문제를 섞어 매일 10문제를 골라 드려요." },
];

export default async function LicensePage() {
  const supabase = await createClient();
  const [{ data: { user } }, certifications] = await Promise.all([supabase.auth.getUser(), listCertifications()]);
  const proofs = await getCertificationProofs(certifications.map((cert) => cert.id));
  const loggedIn = Boolean(user);
  const examTotal = certifications.reduce((sum, cert) => sum + cert.examCount, 0);
  const questionTotal = certifications.reduce((sum, cert) => sum + cert.questionCount, 0);

  return (
    <div className="min-h-screen bg-white text-ink-soft">
      <HomeHeader loggedIn={loggedIn} />
      <main>
        <section className="border-b border-rule bg-paper">
          <div className="mx-auto max-w-6xl px-5 pt-14 pb-12">
            <p className="text-sm text-mute">기출문제</p>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink">어떤 시험을 준비하세요?</h1>
            <p className="mt-3 max-w-2xl text-ink-soft [word-break:keep-all]">국가자격 기출문제를 회차별로 무료로 풀어 보세요. 풀수록 문항별 정오답이 쌓여 약한 과목과 다시 볼 문제를 골라 드려요.</p>
            {certifications.length > 0 && (
              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {[["자격증", `${certifications.length}종`], ["기출", `${examTotal}회차`], ["문항", questionTotal.toLocaleString("ko-KR")], ["해설", "전 문항"]].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-mute">{label}</dt>
                    <dd className="mt-0.5 text-xl font-bold tracking-tight text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-12">
          {certifications.length === 0
            ? <p className="rounded-xl border border-dashed border-rule py-16 text-center text-mute">준비 중인 자격증이 없습니다.</p>
            : <CertGrid certifications={certifications} loggedIn={loggedIn} proofs={proofs} />}
        </section>

        <section className="border-t border-rule bg-paper">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <p className="text-sm text-mute">공부 방법</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink">기출뱅크로 이렇게 공부해 보세요</h2>
            <ol className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-3">
              {STEPS.map(({ title, body }, index) => (
                <li key={title} className="border-t border-ink/80 pt-4">
                  <span className="text-sm font-semibold text-mute tabular-nums">0{index + 1}</span>
                  <h3 className="mt-2 font-bold text-ink">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft [word-break:keep-all]">{body}</p>
                </li>
              ))}
            </ol>
            {!loggedIn && (
              <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rule bg-white px-6 py-5">
                <p className="text-ink-soft"><span className="font-semibold text-ink">회원가입하면</span> 오답노트와 오늘의 10문제를 쓸 수 있어요. 가입은 무료예요.</p>
                <Link href="/auth/signup" className="flex items-center gap-1.5 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-ink-soft">무료로 시작하기<ArrowRight className="size-3.5" /></Link>
              </div>
            )}
          </div>
        </section>
      </main>
      <HomeFooter />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { getSiteStats } from "@/lib/exams";
import { getCertificationProofs } from "@/lib/reviews";
import { listCertifications } from "@/lib/certifications";
import { getReviewCounts } from "@/lib/review";
import { loadLearningInsights, loadStudyStreak } from "@/lib/insights";
import { GuestHome } from "@/components/home/guest-home";
import { MemberHome, type MemberSummary } from "@/components/home/member-home";
import { HomeFooter, HomeHeader } from "@/components/home/home-parts";

export const dynamic = "force-dynamic";

/** 로그인한 회원의 오늘 학습 요약. 일부 조회가 실패해도 메인화면은 뜨도록 각각 기본값으로 대체한다. */
async function loadMemberSummary(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, email: string | undefined): Promise<MemberSummary> {
  const [{ data: profile }, streak, review, insights, { data: openAttempt }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    loadStudyStreak(userId).catch(() => null),
    getReviewCounts(userId).catch(() => ({ active: 0, due: 0 })),
    loadLearningInsights(userId, "").catch(() => null),
    supabase.from("attempts").select("exam_id").eq("user_id", userId).eq("status", "in_progress").gt("expires_at", new Date().toISOString()).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: openExam } = openAttempt
    ? await supabase.from("exams").select("slug,title").eq("id", openAttempt.exam_id).maybeSingle()
    : { data: null };

  const selected = insights?.selected ?? null;
  const weakest = selected?.sections.filter((section) => section.enough).sort((a, b) => a.accuracy - b.accuracy)[0] ?? null;
  return {
    name: profile?.display_name || email?.split("@")[0] || "학습자",
    streak,
    review,
    mainCert: selected ? { code: selected.code, name: selected.name, accuracy: selected.accuracy, answered: selected.answered, weakest } : null,
    inProgress: openExam ? { slug: openExam.slug, title: openExam.title } : null,
  };
}

export default async function Home() {
  const supabase = await createClient();
  const [{ data: { user } }, certifications] = await Promise.all([supabase.auth.getUser(), listCertifications()]);
  const proofs = await getCertificationProofs(certifications.map((cert) => cert.id));

  return (
    <div className="min-h-screen bg-white text-ink-soft">
      <HomeHeader loggedIn={Boolean(user)} />
      <main>
        {user
          ? <MemberHome summary={await loadMemberSummary(supabase, user.id, user.email)} certifications={certifications} proofs={proofs} />
          : <GuestHome certifications={certifications} stats={await getSiteStats()} proofs={proofs} />}
      </main>
      <HomeFooter />
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Star, Users } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import type { CertificationSummary } from "@/lib/certifications";
import type { CertificationProof } from "@/lib/reviews";

const NAV_LINK = "rounded-md px-3 py-2 text-ink-soft hover:bg-black/[0.04] hover:text-ink";

export function HomeHeader({ loggedIn, isAdmin = false }: { loggedIn: boolean; isAdmin?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink">
          <Image src="/mascot.png" alt="" width={28} height={28} priority />
          <span>기출뱅크</span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm font-medium sm:flex">
          <Link className={NAV_LINK} href="/license">기출문제</Link>
          {loggedIn && <Link className={NAV_LINK} href="/review">오답노트</Link>}
          {loggedIn && <Link className={NAV_LINK} href="/mypage">학습 분석</Link>}
          <Link className={NAV_LINK} href="/qna">QnA</Link>
          {isAdmin && <Link className={NAV_LINK} href="/admin">관리자</Link>}
        </nav>
        <div className="flex items-center gap-1 text-sm font-medium">
          {loggedIn ? (
            <>
              <Link className="rounded-md bg-ink px-3.5 py-2 text-white hover:bg-ink-soft" href="/dashboard">내 학습</Link>
              <form action={signOut}><button className="rounded-md px-3 py-2 text-mute hover:text-ink" type="submit">로그아웃</button></form>
            </>
          ) : (
            <>
              <Link className="rounded-md px-3 py-2 text-ink-soft hover:text-ink" href="/auth/login">로그인</Link>
              <Link className="rounded-md bg-ink px-3.5 py-2 text-white hover:bg-ink-soft" href="/auth/signup">회원가입</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** 평균 별점·응시자 수 한 줄. 기준(응시자 30명, 후기 5개) 미만인 값은 null 이라 보이지 않는다. */
export function ProofLine({ proof, className = "" }: { proof?: CertificationProof; className?: string }) {
  if (!proof || (proof.ratingAverage === null && proof.respondentCount === null)) return null;
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft ${className}`}>
      {proof.ratingAverage !== null && <span className="flex items-center gap-1"><Star className="size-4 fill-[#f2b83a] text-[#d9a21b]" aria-hidden /><b className="font-semibold text-ink">{proof.ratingAverage.toFixed(1)}</b><span className="text-mute">({proof.ratingCount.toLocaleString("ko-KR")})</span><span className="sr-only">점, 후기 {proof.ratingCount}개</span></span>}
      {proof.respondentCount !== null && <span className="flex items-center gap-1"><Users className="size-4 text-mute" aria-hidden />응시자 {proof.respondentCount.toLocaleString("ko-KR")}명</span>}
    </p>
  );
}

export function CertGrid({ certifications, loggedIn, proofs }: { certifications: CertificationSummary[]; loggedIn: boolean; proofs?: Record<string, CertificationProof> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {certifications.map((cert) => (
        <article key={cert.code} className="flex flex-col rounded-xl border border-rule bg-white p-6 transition-colors hover:border-ink/25">
          <h3 className="text-lg font-bold tracking-tight text-ink">{cert.name}</h3>
          {/* 설명이 한 줄이든 두 줄이든 아래 구분선 높이가 카드끼리 맞도록 두 줄 높이를 확보한다 */}
          <p className="mt-1.5 line-clamp-2 min-h-[3.25em] text-sm leading-relaxed text-mute [word-break:keep-all]">{cert.description}</p>
          <dl className="mt-5 flex gap-6 border-t border-rule pt-4 text-sm">
            {(cert.examCount > 0 || cert.mockCount === 0) && <div><dt className="text-xs text-mute">기출</dt><dd className="mt-0.5 font-semibold text-ink">{cert.examCount}회차</dd></div>}
            {cert.mockCount > 0 && <div><dt className="text-xs text-mute">예상문제</dt><dd className="mt-0.5 font-semibold text-ink">{cert.mockCount}회</dd></div>}
            {cert.questionCount > 0 && <div><dt className="text-xs text-mute">문항</dt><dd className="mt-0.5 font-semibold text-ink">{cert.questionCount.toLocaleString("ko-KR")}</dd></div>}
            {cert.questionCount > 0 && <div><dt className="text-xs text-mute">해설</dt><dd className="mt-0.5 font-semibold text-ink">전 문항</dd></div>}
          </dl>
          <ProofLine proof={proofs?.[cert.id]} className="mt-3" />
          <div className="mt-auto flex gap-2 pt-6 text-sm font-medium">
            <Link className="flex-1 rounded-md border border-rule px-3 py-2.5 text-center text-ink hover:bg-paper" href={`/license/${cert.code}`}>회차 풀기</Link>
            <Link className="flex-1 rounded-md bg-ink px-3 py-2.5 text-center text-white hover:bg-ink-soft" href={loggedIn ? `/practice?mode=daily&cert=${cert.code}` : "/auth/signup"}>오늘의 10문제</Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: { href: string; label: string } }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-mute">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-ink-soft [word-break:keep-all]">{description}</p>}
      </div>
      {action && <Link className="flex items-center gap-1 text-sm font-medium text-accent hover:underline" href={action.href}>{action.label}<ArrowRight className="size-4" /></Link>}
    </div>
  );
}

export function HomeFooter() {
  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-mute">
        <div className="flex items-center gap-2">
          <span className="font-bold text-ink">기출뱅크</span>
          <span>국가자격·공무원 기출문제 무료 풀이</span>
        </div>
        <nav className="flex gap-4">
          <Link className="hover:text-ink" href="/terms">이용약관</Link>
          <Link className="font-semibold text-ink-soft hover:text-ink" href="/privacy">개인정보처리방침</Link>
          <Link className="hover:text-ink" href="/qna">문의(QnA)</Link>
        </nav>
        <p className="w-full text-xs">본 서비스는 각 시험의 공식 사이트가 아닌 학습용 서비스입니다. 기출문제의 저작권은 각 시험 시행기관에 있습니다. © 2026 기출뱅크</p>
      </div>
    </footer>
  );
}

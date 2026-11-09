import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpenCheck, Timer } from "lucide-react";
import { ExamHeader } from "@/components/exams/exam-header";
import { ExplanationView } from "@/components/explanation-view";
import { PromptText } from "@/components/prompt-text";
import { circled } from "@/lib/explanation";
import { examSource } from "@/lib/exam-source";
import { promptPreview } from "@/lib/format-prompt";
import { loadRoundExplanation } from "@/lib/round-explanation";
import "../../exams.css";
import "../../../review/review.css";
import "../../../license/license.css";
import "./explanation.css";

export const dynamic = "force-dynamic";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gichulbank.vercel.app").replace(/\/$/, "");
const getRound = cache(loadRoundExplanation);

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const round = await getRound(slug);
  if (!round) return { title: "해설을 찾을 수 없습니다 | 기출뱅크" };
  const topics = round.questions.map((question) => question.topic).filter(Boolean).slice(0, 4).join(", ");
  const title = `${round.title} 해설 · 문항별 정답과 보기별 해설 | 기출뱅크`;
  const description = `${round.title} ${round.questions.length}문항의 정답과 보기별 해설.${topics ? ` ${topics} 등 출제 주제를 문항별로 정리했습니다.` : ""}`;
  const url = `${SITE_URL}/exams/${round.slug}/explanation`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "article", locale: "ko_KR" } };
}

/** 로그인 없이 보는 회차별 해설 페이지: 주제 목차 + 문항·정답·보기별 해설 */
export default async function RoundExplanationPage({ params }: Props) {
  const { slug } = await params;
  const round = await getRound(slug);
  if (!round) notFound();
  const source = examSource(round.slug);
  const url = `${SITE_URL}/exams/${round.slug}/explanation`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "기출문제", item: `${SITE_URL}/license` },
        { "@type": "ListItem", position: 2, name: round.certName, item: `${SITE_URL}/license/${round.certCode}` },
        { "@type": "ListItem", position: 3, name: `${round.title} 해설`, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${round.title} 문항별 해설`,
      inLanguage: "ko-KR",
      about: round.certName,
      isAccessibleForFree: true,
      mainEntityOfPage: url,
      dateModified: round.updatedAt,
      ...(round.publishedAt && { datePublished: round.publishedAt }),
      keywords: [...new Set(round.questions.map((question) => question.topic).filter(Boolean))].slice(0, 30).join(", "),
      author: { "@type": "Organization", name: "기출뱅크" },
      publisher: { "@type": "Organization", name: "기출뱅크" },
    },
  ];

  return <main className="exam-app">
    <ExamHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <section className="explain-shell">
      <Link className="license-back" href={`/license/${round.certCode}`}><ArrowLeft size={15} />{round.certName}</Link>

      <header className="explain-hero">
        <span className="kind-pill quiz">문항별 해설</span>
        <h1>{round.title} 해설</h1>
        <p>{round.questions.length}문항의 정답과 보기별 해설입니다. 먼저 풀어 보고 해설을 확인하면 더 오래 기억에 남아요.</p>
        <div className="explain-cta">
          <Link className="practice" href={`/exams/${round.slug}/practice`}><BookOpenCheck />연습모드로 풀기</Link>
          <Link href={`/exams/${round.slug}/take`}><Timer />시험모드로 풀기</Link>
        </div>
        {source && <p className="exam-source-note">{source.text}</p>}
      </header>

      <div className="explain-layout">
        <nav className="explain-toc" aria-label="이 회차에서 다룬 주제">
          <b>이 회차에서 다룬 주제</b>
          <ol>{round.questions.map((question) => <li key={question.number}>
            <a href={`#q${question.number}`}><span>{question.number}</span>{question.topic ?? promptPreview(question.prompt).slice(0, 24)}</a>
          </li>)}</ol>
        </nav>

        <div className="explain-list">
          {round.questions.map((question) => <article className="explain-card" id={`q${question.number}`} key={question.number}>
            <div className="explain-card-head">
              <span className="explain-num">{question.number}번</span>
              <h2>{question.topic ?? `${question.number}번 문항`}</h2>
              <small>{question.correctLabel && <>정답 {circled(question.correctLabel)} · </>}{question.score}점</small>
            </div>
            {question.sectionTitle && <p className="explain-section">{question.sectionTitle}</p>}
            <PromptText className="review-full-prompt" prompt={question.prompt} />
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 원본 이미지를 그대로 보여준다 */}
            {question.imageUrl && <img className="review-image" src={question.imageUrl} alt={`${question.number}번 문제 자료`} />}
            <ExplanationView text={question.explanation} correctLabel={question.correctLabel} choices={question.choices} heading={false} />
            {question.tags.length > 0 && <div className="explain-tags">{question.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
          </article>)}
          {source && <p className="exam-source-note">{source.text}</p>}
        </div>
      </div>
    </section>
  </main>;
}

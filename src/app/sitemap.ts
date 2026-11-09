import type { MetadataRoute } from "next";
import { listExplanationRounds } from "@/lib/round-explanation";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gichulbank.vercel.app").replace(/\/$/, "");

// 회차가 공개될 때마다 바뀌므로 요청 시점에 만든다.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { certCodes, rounds } = await listExplanationRounds();
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/license`, changeFrequency: "weekly", priority: 0.9 },
    ...certCodes.map((code) => ({ url: `${SITE_URL}/license/${code}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...rounds.map((round) => ({ url: `${SITE_URL}/exams/${round.slug}/explanation`, lastModified: round.updatedAt, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}

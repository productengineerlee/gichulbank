/**
 * 회차별 문제 출처(저작권) 안내. 기출문제는 시행기관에 저작권이 있음을 밝히고,
 * slug 에 "-mock-" 이 들어간 예상문제는 기출뱅크가 직접 만든 문제임을 밝힌다.
 * 서버·클라이언트 어디서나 쓸 수 있도록 DB 조회 없이 slug 접두어로 판단한다.
 */
const ISSUERS: { prefix: string; issuer: string; exam: string }[] = [
  { prefix: "korean-history-", issuer: "국사편찬위원회", exam: "한국사능력검정시험" },
  { prefix: "gongin-", issuer: "한국산업인력공단", exam: "공인중개사 자격시험" },
  { prefix: "sabok1-", issuer: "한국산업인력공단", exam: "사회복지사 1급 국가시험" },
  { prefix: "mgmt-viz-", issuer: "대한상공회의소", exam: "경영정보시각화능력" },
];

export type ExamSource = { kind: "official"; issuer: string; text: string } | { kind: "original"; text: string };

export function examSource(slug: string): ExamSource | null {
  if (slug.includes("-mock-")) {
    return { kind: "original", text: "이 회차는 출제기준과 기출 경향을 바탕으로 기출뱅크가 직접 만든 예상문제입니다." };
  }
  const match = ISSUERS.find((item) => slug.startsWith(item.prefix));
  if (!match) return null;
  return {
    kind: "official",
    issuer: match.issuer,
    text: `출처: ${match.issuer} ${match.exam}. 문제 지문과 자료 이미지의 저작권은 ${match.issuer}에 있으며, 해설은 기출뱅크가 작성했습니다.`,
  };
}

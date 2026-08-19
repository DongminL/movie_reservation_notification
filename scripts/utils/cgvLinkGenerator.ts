export interface CgvParams {
  /* 극장 코드 (예: 용산아이파크몰 = '0013') */
  siteNo: string;
  /* 극장명 (예: '용산아이파크몰') */
  siteNm: string;
  /* 상영 날짜 YYYYMMDD (예: '20260825') */
  scnYmd: string;
}

/**
 * 극장 예매 페이지 URL 생성
 */
export function buildCgvWebUrl(params: CgvParams): string {
  const { siteNo, siteNm, scnYmd } = params;
  const query = new URLSearchParams({ siteNo, siteNm, scnYmd });
  return `https://cgv.co.kr/met/webAppUsgGoid?r=${encodeURIComponent(`/cnm/movieBook/cinema?${query.toString()}`)}`;
}
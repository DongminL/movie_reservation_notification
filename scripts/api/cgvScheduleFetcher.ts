import Puppeteer, { Browser, HTTPResponse, Page } from 'puppeteer';
import { config } from '../config';

/* API 응답 원본 항목 */
interface RawScreeningItem {
    scnYmd?: string;
    scnsNo?: string;
    scnSseq?: string;
    movNm?: string;
    scnsrtTm?: string;
    scnendTm?: string;
    frSeatCnt?: string;
    cpSeatCnt?: string;
    tcscnsGradCd?: string;
    scnsEnm?: string;
}

interface SearchMovScnInfoResponse {
    data?: RawScreeningItem[];
}

/* 알림/diff에 사용할 정제된 상영 정보 */
interface Screening {
    scnYmd: string;
    scnsNo: string;
    scnSseq: string;
    movNm: string;
    scnsrtTm: string;
    scnendTm: string;
    seatInfo: string;
    tcscnsGradCd: string;
    scnsEnm: string;
}

const IMAX_GRADE_CD = '03';
const RESPONSE_TIMEOUT_MS = 20000;
const SITE_NO = '0013';
const SITE_NM = '용산아이파크몰';

/*
 * CGV searchMovScnInfo는 x-signature/x-timestamp가 1회용이라 헤더를 캡처해 별도
 * HTTP 클라이언트로 재요청하는 방식이 통하지 않는다 (Cloudflare가 비 브라우저 TLS
 * 클라이언트를 차단하고, 서명 재사용은 origin에서 401로 거부됨 — 둘 다 실측 확인)
 * 대신 실제 브라우저에서 날짜/극장이 반영된 URL로 직접 이동시켜(imaxCrawler.ts와 동일
 * 방식) 사이트 JS가 매번 새로 서명하도록 하고, 그 응답을 그대로 가로챈다
 */
class CgvScheduleFetcher {

    private browser: Browser | null = null;
    private page: Page | null = null;

    /* 브라우저를 연다 (한 사이클 시작 시 1회 호출) */
    async open(): Promise<void> {
        this.browser = await Puppeteer.launch({
            headless: 'new',
            args: ['--disable-geolocation']
        });
        this.page = await this.browser.newPage();
    }

    /* 브라우저를 닫는다 (한 사이클 종료 시 1회 호출) */
    async close(): Promise<void> {
        await this.page?.close().catch(() => {});
        await this.browser?.close().catch(() => {});
        this.page = null;
        this.browser = null;
    }

    /*
     * 극장과 날짜가 반영된 URL로 직접 이동해 실제 요청을 발생시키고 그 응답 JSON을 가로챈다
     * (imaxCrawler.ts의 targetUrl 패턴과 동일)
     */
    async fetchScreenings(scnYmd: string): Promise<Screening[]> {
        const page = this.page;
        if (!page) {
            throw new Error('open()을 먼저 호출해야 합니다.');
        }

        // goto 자체가 타임아웃/에러가 나도 응답은 이미 캡처됐을 수 있으므로, 완료 판단은
        // 아래 waitForResponse(및 그 안의 20초 타이머)에 전적으로 맡기고 goto 에러는 무시한다.
        const targetUrl = `${config.urls.imax}?siteNo=${SITE_NO}&siteNm=${SITE_NM}&scnYmd=${scnYmd}`;
        page.goto(
            targetUrl,
            { waitUntil: 'domcontentloaded', timeout: RESPONSE_TIMEOUT_MS }
        ).catch(() => {});

        const res: HTTPResponse = await page.waitForResponse(
            (candidate: HTTPResponse) => {
                if (!candidate.url().includes('searchMovScnInfo')) {
                    return false;
                }
                if (candidate.request().method() !== 'GET') {
                    return false; // CORS preflight(OPTIONS) 응답은 본문이 없으므로 제외
                }

                return new URL(candidate.url()).searchParams.get('scnYmd') === scnYmd; // 다른 날짜에 대한 응답(겹치는 요청)은 무시
            },
            { timeout: RESPONSE_TIMEOUT_MS }
        );

        return this.parseScreenings(await res.json(), scnYmd);
    }

    private parseScreenings(body: SearchMovScnInfoResponse, scnYmd: string): Screening[] {
        const items: RawScreeningItem[] = body.data ?? [];

        return items.map(item => ({
            scnYmd: item.scnYmd ?? scnYmd,
            scnsNo: item.scnsNo ?? '',
            scnSseq: item.scnSseq ?? '',
            movNm: item.movNm ?? '',
            scnsrtTm: item.scnsrtTm ?? '',
            scnendTm: item.scnendTm ?? '',
            seatInfo: item.frSeatCnt && item.cpSeatCnt ? `${item.frSeatCnt}/${item.cpSeatCnt}` : (item.frSeatCnt ?? ''),
            tcscnsGradCd: item.tcscnsGradCd ?? '',
            scnsEnm: item.scnsEnm ?? '',
        }));
    }
}

function filterImax(list: Screening[]): Screening[] {
    return list.filter(item => item.tcscnsGradCd === IMAX_GRADE_CD);
}

export default CgvScheduleFetcher;
export { Screening, filterImax };

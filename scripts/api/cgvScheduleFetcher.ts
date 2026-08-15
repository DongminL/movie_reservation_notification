import Puppeteer, { HTTPResponse } from 'puppeteer';
import { config } from '../config';
import { CLOUD_SANDBOX_ARGS } from '../puppeteerArgs';

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

/* 크롤링 없이 재사용할 CGV 세션 (Cloudflare 쿠키 + 요청 헤더) */
interface CgvSession {
    apiUrl: string;
    headers: Record<string, string>;
    capturedAt: number;
}

const IMAX_GRADE_CD = '03';
const RESPONSE_TIMEOUT_MS = 20000;
const SITE_NO = '0013';
const SITE_NM = '용산아이파크몰';

// Cloudflare __cf_bm 쿠키 통상 수명(~30분)보다 보수적으로 잡은 세션 재사용 유효 시간
const SESSION_TTL_MS = 20 * 60 * 1000;

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
export { sleep };

/*
 * searchMovScnInfo에는 x-signature 같은 서명 헤더가 없고, Cloudflare가 발급하는
 * 쿠키(__cf_bm/_cfuvid)만으로 접근이 허용된다 — 같은 쿠키로 다른 날짜/여러 번 재요청해도
 * 되고, 브라우저 없이 Node fetch로 재사용해도 통과된다(실측 확인, Postman 검증 완료).
 * 그래서 브라우저는 세션이 없거나(콜드 스타트) 만료/차단(403 등)됐을 때만 그때그때 띄워
 * 쿠키를 캡처하고 바로 닫는다. 인스턴스가 살아있는 동안(호출자가 재생성하지 않는 한)
 * 세션은 여러 조회, 여러 사이클에 걸쳐 계속 재사용된다.
 */
class CgvScheduleFetcher {

    private session: CgvSession | null = null;

    /* 캐시된 세션이 유효하면 브라우저 없이 직접 요청, 없거나 실패하면 크롤링으로 폴백해 갱신 */
    async fetchScreenings(scnYmd: string): Promise<Screening[]> {
        if (this.session && Date.now() - this.session.capturedAt < SESSION_TTL_MS) {
            try {
                return await this.fetchViaDirectRequest(this.session, scnYmd);
            } catch {
                this.session = null; // 쿠키 만료/차단으로 간주하고 아래에서 브라우저로 재발급
            }
        }

        return this.fetchViaBrowserCrawl(scnYmd);
    }

    /* 캡처해둔 쿠키/헤더로 브라우저 없이 직접 API 호출 */
    private async fetchViaDirectRequest(session: CgvSession, scnYmd: string): Promise<Screening[]> {
        const url = new URL(session.apiUrl);
        url.searchParams.set('scnYmd', scnYmd);

        const res = await fetch(url.toString(), {
            headers: session.headers,
            signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
        });

        if (!res.ok) {
            throw new Error(`직접 요청 실패: ${res.status}`);
        }

        return this.parseScreenings(await res.json(), scnYmd);
    }

    /*
     * 세션(쿠키) 발급/갱신이 필요할 때만 브라우저를 띄워 극장/날짜가 반영된 URL로
     * 이동시키고(imaxCrawler.ts의 targetUrl 패턴과 동일) 그 응답 JSON을 가로챈다.
     * 동시에 CDP로 실제 전송된 헤더(쿠키 포함)를 캡처해 세션에 저장한 뒤 브라우저는 바로 닫는다.
     */
    private async fetchViaBrowserCrawl(scnYmd: string): Promise<Screening[]> {
        const browser = await Puppeteer.launch({
            headless: 'new',
            args: ['--disable-geolocation', ...CLOUD_SANDBOX_ARGS]
        });

        try {
            const page = await browser.newPage();
            const client = await page.target().createCDPSession();
            await client.send('Network.enable');

            const urlByRequestId = new Map<string, string>();
            const headersByRequestId = new Map<string, Record<string, string>>();

            client.on('Network.requestWillBeSent', (event: { requestId: string; request: { url: string } }) => {
                if (event.request.url.includes('searchMovScnInfo')) {
                    urlByRequestId.set(event.requestId, event.request.url);
                }
            });
            client.on('Network.requestWillBeSentExtraInfo', (event: { requestId: string; headers: Record<string, string> }) => {
                headersByRequestId.set(event.requestId, event.headers);
            });

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

            await sleep(300); // requestWillBeSentExtraInfo가 조금 늦게 도착할 수 있어 잠깐 대기
            this.captureSession(res.request().url(), urlByRequestId, headersByRequestId);

            return this.parseScreenings(await res.json(), scnYmd);
        } finally {
            await browser.close().catch(() => {});
        }
    }

    /* CDP로 캡처한 헤더에서 HTTP/2 의사 헤더(:authority 등)를 제외하고 세션으로 저장 */
    private captureSession(
        matchedUrl: string,
        urlByRequestId: Map<string, string>,
        headersByRequestId: Map<string, Record<string, string>>
    ): void {
        for (const [requestId, url] of urlByRequestId) {
            const rawHeaders = headersByRequestId.get(requestId);
            if (url === matchedUrl && rawHeaders) {
                const headers = Object.fromEntries(
                    Object.entries(rawHeaders).filter(([key]) => !key.startsWith(':'))
                );
                this.session = { apiUrl: matchedUrl, headers, capturedAt: Date.now() };
                return;
            }
        }
        // 캡처 실패 시 세션이 채워지지 않아 다음 조회부터 계속 브라우저 크롤링으로 폴백됨 — 표면화
        console.error('[CgvScheduleFetcher] 세션 캡처 실패, 다음 조회도 브라우저 크롤링으로 폴백됩니다.');
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

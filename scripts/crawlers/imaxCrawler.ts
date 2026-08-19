import Crawler from './crawler';
import Puppeteer, { Page } from 'puppeteer';
import MovieTime from './movieTime';
import { CLOUD_SANDBOX_ARGS } from '../utils/puppeteerArgs';

class ImaxCrawler extends Crawler {

    constructor(date: string, theater: string) {
        super(date, theater);
    }

    async crawl(): Promise<string> {
        // crawl() 재진입 시 isStop을 반드시 초기화 (stopCrawler 후 재시작 버그 방지)
        this.isStop = false;

        // 웹 크롤링을 위한 puppeteer 브라우저 생성
        this.browser = await Puppeteer.launch({
            headless: 'new',
            args: ['--disable-geolocation', ...CLOUD_SANDBOX_ARGS]
        });

        try {
            while (!this.isStop) {  // IMAX관 시간표를 가져올 때까지 반복
                const page = await this.browser.newPage();

                try {
                    // 탭 옵션
                    const pageOption = {
                        // waitUntil: 적어도 500ms 동안 두 개 이상의 네트워크 연결이 없으면 탐색이 완료된 것으로 간주합니다.
                        waitUntil: 'networkidle2',
                        // timeout: 20초 안에 새 탭의 주소로 이동하지 않으면 에러 발생
                        timeout: 20000
                    } as const;

                    const targetTheater = this.theater === "용아맥"
                        ? "용산아이파크몰"
                        : this.theater;

                    // CGV 용산아이파크몰 예매 사이트 접속
                    const targetUrl = `${this.config.urls.imax}?siteNo=0013&siteNm=${targetTheater}&scnYmd=${this.date}`;
                    await page.goto(targetUrl, pageOption);

                    await this.applyImaxFilter(page);

                    // 상영 정보가 없는 경우 (= 날짜는 있지만 IMAX 편성 없음, 정상 분기)
                    if (await this.isTimetableEmpty(page)) {
                        console.log("IMAX관이 열리지 않았습니다.");

                        this.resetErrorCount();  // 사이트는 정상 응답 중
                        await this.closeQuietly(page);
                        await this.trick();   // 차단 회피

                        continue;
                    }

                    await this.sortByTime(page);

                    // 해당 날짜와 상영관의 시간표를 영화별로 매핑
                    const movieTimeMap = await this.parseTimetable(page);

                    // 출력할 내용
                    let result = MovieTime.toString(movieTimeMap, targetTheater, this.date);
                    result += `[예매하러 가기](${targetUrl})\n`;
                    console.log(result);

                    await this.closeQuietly(page);  // puppeteer 페이지 종료

                    // 크롤링한 시간표 반환
                    return result;

                } catch (err) {
                    this.handleError(err);

                    await this.closeQuietly(page);
                    await this.trick();   // 차단 회피
                }
        }
        } finally {
            // 정상 반환, 중단(/stop), 예외 어느 경로로 나오더라도 브라우저를 반드시 정리
            await this.closeQuietly(this.browser);
            this.browser = null;
        }

        return "";
    }

    /* 극장 속성 필터에서 IMAX만 선택 후 확인 */
    private async applyImaxFilter(page: Page): Promise<void> {
        // 극장 선택 기다리기
        await page.waitForSelector('div.roundtab_container__MA2_a > div > div > div > button[title="선택됨"]');

        const filterBtn = await page.waitForSelector('button[aria-label="극장 속성"]');
        await page.evaluate(elem => (elem as HTMLElement)?.click(), filterBtn);
        const imaxFilterBtn = await page.waitForSelector('#\\30 3-TCSCNS_GRAD_CD');
        await page.evaluate(elem => (elem as HTMLElement)?.click(), imaxFilterBtn);
        const confirmBtn = await page.waitForSelector('div.bot-modal-footer > div.btn-wrap > button');
        await page.evaluate(elem => (elem as HTMLElement)?.click(), confirmBtn);
    }

    /* 상영 시간표를 시간순 정렬 */
    private async sortByTime(page: Page): Promise<void> {
        const sortByTimeBtn = await page.waitForSelector('div.linetabMini_container__VsBQ1 > button:nth-child(2)');
        await page.evaluate(elem => (elem as HTMLElement)?.click(), sortByTimeBtn);
    }

    /* 상영 시간표가 비어있는지(= IMAX 편성 없음) 확인 */
    private async isTimetableEmpty(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector(
                'div.screenInfo_container__XpHXJ',
                { timeout: 10000 }
            );
        } catch (error) {
            // 10초가 지나도 시간표가 렌더링 되지 않으면 시간표가 비어있는 것으로 간주
            return true;
        }
        return false;
    }

    /* 해당 날짜/상영관의 시간표를 영화별로 매핑해서 반환 */
    private async parseTimetable(page: Page): Promise<Map<string, MovieTime[]>> {
        await page.waitForSelector('ul.screenInfoTimes_scheduleWrap__sXjoc');  // 시간표 렌더링 대기
        const timetable = await page.$$('div[class="screenInfoTimes_startTimeItem__JW8_2"]');

        const movieTimeMap: Map<string, MovieTime[]> = new Map();

        for (const item of timetable) {
            const screenType = await item.$eval(
                'button.screenInfoTimes_infoWrap__dcYhr > span.screenInfoTimes_seatWrap__7ww9A > span:nth-child(2)',
                e => e.textContent?.trim() || ''
            );

            const movie = await item.$eval(
                'button.screenInfoTimes_infoWrap__dcYhr > span.screenInfoTimes_title__tnsJz > span',
                e => e.textContent?.trim() || ''
            );

            const seatInfo = await item.$eval(
                'button.screenInfoTimes_infoWrap__dcYhr > span.screenInfoTimes_seatWrap__7ww9A > span:nth-child(1)',
                e => e.textContent?.trim() || ''
            );

            const startTime = await item.$eval(
                'div.screenInfoTimes_timeWrap__rv8jI > p.screenInfoTimes_startTime__dtHP0',
                e => e.textContent?.trim() || ''
            );

            const endTime = await item.$eval(
                'div.screenInfoTimes_timeWrap__rv8jI > p.screenInfoTimes_endTime__RNcSo',
                e => e.textContent?.trim().substring(1) || ''
            );

            // 영화별로 상영 시간 추가
            if (!movieTimeMap.has(movie)) {
                movieTimeMap.set(movie, []);
            }
            const list = movieTimeMap.get(movie);
            list?.push(
                new MovieTime({
                    screenType: screenType, movie: movie, seatInfo: seatInfo,
                    startTime: startTime, endTime: endTime
                }));
        }

        return movieTimeMap;
    }
}

export default ImaxCrawler;

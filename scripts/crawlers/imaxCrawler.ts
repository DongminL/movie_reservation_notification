import Crawler from './crawler';
import Puppeteer, { Page } from 'puppeteer';
import MovieTime from './movieTime';

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
            args: [
                '--disable-geolocation',                  // 위치 정보 자체 비활성화
            ]
        });

        try {
            while (!this.isStop) {  // IMAX관 시간표를 가져올 때까지 반복
                const page: Page = await this.browser.newPage();

                try {
                    // 탭 옵션
                    const pageOption = {
                        // waitUntil: 적어도 500ms 동안 두 개 이상의 네트워크 연결이 없으면 탐색이 완료된 것으로 간주합니다.
                        waitUntil: 'networkidle2',
                        // timeout: 20초 안에 새 탭의 주소로 이동하지 않으면 에러 발생
                        timeout: 20000
                    } as const;

                    await page.goto(this.config.urls.imax, pageOption);   // CGV 극장별 예매 사이트 접속

                    // 크롤링할 극장
                    const targetTheater: string = this.theater === "용아맥" ? "용산아이파크몰" : "";

                    await this.selectTheater(page, targetTheater);

                    // 원하는 날짜가 존재하지 않는 경우 (= 아직 안 열림, 정상 분기)
                    if (!await this.selectTargetDate(page)) {
                        console.log("IMAX관이 열리지 않았습니다.");

                        this.resetErrorCount();  // 사이트는 정상 응답 중
                        await this.closeQuietly(page);
                        await this.trick();   // 차단 회피

                        continue;
                    }

                    await this.applyImaxFilter(page);
                    await this.sortByTime(page);

                    // 상영 정보가 없는 경우 (= 날짜는 있지만 IMAX 편성 없음, 정상 분기)
                    if (await this.isTimetableEmpty(page)) {
                        console.log("IMAX관이 열리지 않았습니다.");

                        this.resetErrorCount();  // 사이트는 정상 응답 중
                        await this.closeQuietly(page);
                        await this.trick();   // 차단 회피

                        continue;
                    }

                    // 해당 날짜와 상영관의 시간표를 영화별로 매핑
                    const movieTimeMap: Map<string, MovieTime[]> = await this.parseTimetable(page);

                    // 출력할 내용
                    let result: string = MovieTime.toString(movieTimeMap, targetTheater, this.date);

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

    /* 극장 목록에서 targetTheater를 찾아 클릭 */
    private async selectTheater(page: Page, targetTheater: string): Promise<void> {
        await page.waitForSelector('div.bottom_listCon__8g46z > ul > li');  // 렌더링 대기
        const theaterList = await page.$$('div[class="bottom_listCon__8g46z"] > ul > li');

        for (const li of theaterList) {
            const button = await li.$('button');
            if (!button) {
                continue;
            }

            const p = await button.$('p');
            if (!p) {
                continue;
            }

            // 설정한 극장을 찾았으면 클릭
            const theaterName: string = await page.evaluate(e => e.textContent?.trim() || '', p);
            if (theaterName?.includes(targetTheater)) {
                await button.click();
                break;
            }
        }
    }

    /*
     * 원하는 날짜의 버튼을 찾아 클릭한다.
     * 반환값은 해당 날짜가 달력에 존재했는지 여부 (false면 아직 안 열린 것으로 간주).
     */
    private async selectTargetDate(page: Page): Promise<boolean> {
        const dayContainer = await page.waitForSelector('div.dayScroll_container__e9cLv');   // 날짜 렌더링 대기
        const dayBtns = await dayContainer?.$$('div > div > div') || [];  // 날짜 버튼들

        let isExistedTargetDate: boolean = false;
        let cursorMonth: number = new Date().getMonth() + 1;    // 탐색 중인 월(Month)의 구간
        const targetMonth: number = parseInt(this.date.substring(4, 6), 10);    // 원하는 날짜의 월(Month)
        const targetDate: string = this.getTargetDate();    // 원하는 날짜
        let hasPreviousMonth: boolean = false;   // 이전 월의 존재 여부

        for (const dayBtn of dayBtns) {
            const button = await dayBtn.$('button');
            if (!button) {
                continue;
            }

            const span = await dayBtn.$('span.dayScroll_number__o8i9s');
            if (!span) {
                continue;
            }

            let dayText: string = await page.evaluate(e => e.textContent?.trim() || '', span);

            // 탐색 중인 월 갱신
            if (dayText.includes('.')) {
                const [month]: string[] = dayText.split('.');
                cursorMonth = parseInt(month, 10);
                hasPreviousMonth = true;

            } else if (dayText === '01') {
                // 당일 또는 2개월 이상 후에는 CGV에서 01로 표시됨

                // 이전 month가 존재할 때만, 다음 달로 넘어간 것으로 간주
                if (hasPreviousMonth) {
                    cursorMonth += 1;
                }

                dayText = `${cursorMonth}.1`;   // 형식 통일
            }

            // 원하는 날짜 선택
            if (targetDate === dayText && targetMonth === cursorMonth) {
                // 비활성화된 버튼인지 확인
                const isDisabled = await button.evaluate(e => e.disabled)
                if (!isDisabled) {
                    await button.click();
                    isExistedTargetDate = true;
                }
                break;
            }
        }

        return isExistedTargetDate;
    }

    /* 극장 속성 필터에서 IMAX만 선택 후 확인 */
    private async applyImaxFilter(page: Page): Promise<void> {
        const filterBtn = await page.waitForSelector('button[aria-label="극장 속성"]');
        await filterBtn?.click();
        const imaxFilterBtn = await page.waitForSelector('#\\30 3-TCSCNS_GRAD_CD');
        await imaxFilterBtn?.click();
        const confirmBtn = await page.waitForSelector('div.bot-modal-footer > div.btn-wrap > button');
        await confirmBtn?.click();
    }

    /* 상영 시간표를 시간순 정렬 */
    private async sortByTime(page: Page): Promise<void> {
        const sortByTimeBtn = await page.waitForSelector('div.linetabMini_container__VsBQ1 > button:nth-child(2)'); // 시간순 정렬 버튼
        await sortByTimeBtn?.click();
    }

    /* 상영 시간표가 비어있는지(= IMAX 편성 없음) 확인 */
    private async isTimetableEmpty(page: Page): Promise<boolean> {
        return page.evaluate(() => {
            return !!document.querySelector('div.empty-section');
        });
    }

    /* 해당 날짜/상영관의 시간표를 영화별로 매핑해서 반환 */
    private async parseTimetable(page: Page): Promise<Map<string, MovieTime[]>> {
        await page.waitForSelector('ul.screenInfoTimes_scheduleWrap__sXjoc');  // 시간표 렌더링 대기
        const timetable = await page.$$('div[class="screenInfoTimes_startTimeItem__JW8_2"]');

        const movieTimeMap: Map<string, MovieTime[]> = new Map<string, MovieTime[]>();
        for (const item of timetable) {
            const screenType: string = await item.$eval(
                'button.screenInfoTimes_infoWrap__dcYhr > span.screenInfoTimes_seatWrap__7ww9A > span:nth-child(2)',
                e => e.textContent?.trim() || ''
            );

            const movie: string = await item.$eval(
                'button.screenInfoTimes_infoWrap__dcYhr > span.screenInfoTimes_title__tnsJz > span',
                e => e.textContent?.trim() || ''
            );

            const seatInfo: string = await item.$eval(
                'button.screenInfoTimes_infoWrap__dcYhr > span.screenInfoTimes_seatWrap__7ww9A > span:nth-child(1)',
                e => e.textContent?.trim() || ''
            );

            const startTime: string = await item.$eval(
                'div.screenInfoTimes_timeWrap__rv8jI > p.screenInfoTimes_startTime__dtHP0',
                e => e.textContent?.trim() || ''
            );

            const endTime: string = await item.$eval(
                'div.screenInfoTimes_timeWrap__rv8jI > p.screenInfoTimes_endTime__RNcSo',
                e => e.textContent?.trim().substring(1) || ''
            );

            // 영화별로 상영 시간 추가
            if (!movieTimeMap.has(movie)) {
                movieTimeMap.set(movie, []);
            }
            const list: MovieTime[] | undefined = movieTimeMap.get(movie);
            list?.push(
                new MovieTime({
                    screenType: screenType, movie: movie, seatInfo: seatInfo,
                    startTime: startTime, endTime: endTime
                }));
        }

        return movieTimeMap;
    }

    private getTargetDate(): string {
        let targetDate = "";

        // 월과 일을 10진수로 변환
        const targetMonth: number = parseInt(this.date.substring(4, 6), 10);
        const targetDay: string = this.date.substring(6, 8);

        // 매월 1일의 날짜 형태
        if (targetDay === '01') {
            targetDate = `${targetMonth}.1`;
        } else {
            targetDate = targetDay;
        }

        return targetDate;
    }
}

export default ImaxCrawler;

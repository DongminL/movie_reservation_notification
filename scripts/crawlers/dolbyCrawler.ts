import Crawler from './crawler';
import Puppeteer, { ElementHandle, Page } from 'puppeteer';
import Cheerio from 'cheerio';
import { CLOUD_SANDBOX_ARGS } from '../puppeteerArgs';


class DolbyCrawler extends Crawler {

    constructor(date: string, theater: string) {
        super(date, theater);
    }

    /* 메가박스 Dolby 웹 크롤링 */
    async crawl(): Promise<string> {
        // crawl() 재진입 시 isStop을 반드시 초기화 (stopCrawler 후 재시작 버그 방지)
        this.isStop = false;

        // 웹 크롤링을 위한 puppeteer 객체 생성
        this.browser = await Puppeteer.launch({
            headless: 'new',
            args: CLOUD_SANDBOX_ARGS
        });

        try {
            while (!this.isStop) {  // Dolby Cinema관 시간표를 가져올 때까지 반복
                const page: Page = await this.browser.newPage();

                try {
                    // 탭 옵션
                    const pageOption = {
                        // waitUntil: 적어도 500ms 동안 두 개 이상의 네트워크 연결이 없으면 탐색이 완료된 것으로 간주합니다.
                        waitUntil: 'networkidle2',
                        // timeout: 20초 안에 새 탭의 주소로 이동하지 않으면 에러 발생
                        timeout: 20000
                    } as const;

                    await page.goto(this.config.urls.dolby, pageOption);   // 메가박스 예매 사이트 접속

                    await this.selectTheater(page);

                    await this.openCalendar(page);
                    await this.adjustMonth(page);
                    await this.selectDay(page);

                    // 원하는 날짜가 아직 예매 가능일이 아닌 경우 (= 아직 안 열림, 정상 분기)
                    if (!await this.waitForTimetable(page)) {
                        console.log("Dolby Cinema가 열리지 않았습니다.");

                        this.resetErrorCount();  // 사이트는 정상 응답 중
                        await this.closeQuietly(page);
                        await this.trick();   // 차단 회피

                        continue;
                    }

                    // 스크래핑을 위한 cheerio 객체로 Dolby Cinema 시간표 파싱
                    const { timeTable, dolby } = await this.parseDolbyTimetable(page);

                    // Dolby Cinema 오픈 확인
                    if (dolby) {
                        console.log(timeTable);

                        await this.closeQuietly(page);  // puppeteer 페이지 종료

                        // 크롤링한 시간표 반환
                        return timeTable;
                    }
                    else {
                        // 아직 Dolby Cinema가 편성되지 않음 (정상 분기)
                        console.log("Dolby Cinema가 열리지 않았습니다.");

                        this.resetErrorCount();  // 사이트는 정상 응답 중
                        await this.closeQuietly(page);
                        await this.trick();   // 차단 회피
                    }
                } catch (err) {
                    this.handleError(err);
                    console.log("Dolby Cinema가 열리지 않았습니다.");

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

    /* 영화관 선택: 극장별 선택 탭 → (남돌비/코돌비) 지점 선택 → 시간표 로딩 대기 */
    private async selectTheater(page: Page): Promise<void> {
        const theater_select: ElementHandle<Element> | null = await page.waitForSelector('div[class="tab-left-area"] > ul > li > a[title="극장별 선택"]');
        await page.evaluate(elem => (elem as HTMLElement)?.click(), theater_select);

        if (this.theater === "남돌비") {
            const gyeonggi: ElementHandle<Element> | null = await page.waitForSelector('#masterBrch > div > div.tab-list-choice > ul > li:nth-child(2) > a[title="경기지점 선택"]');   // 경기 선택
            await page.evaluate(elem => (elem as HTMLElement)?.click(), gyeonggi);

            const namyang: ElementHandle<Element> | null = await page.waitForSelector('#mCSB_5_container > ul.list > li > button[data-brch-no="0019"]');   // 남양주현대아울렛 스페이스원 극장 선택
            await page.evaluate(elem => (elem as HTMLElement)?.click(), namyang);

            await new Promise(page => setTimeout(page, 100));    // 0.1초 대기
            await page.evaluate(elem => (elem as HTMLElement)?.click(), namyang);

        } else if (this.theater === "코돌비") {
            const coex: ElementHandle<Element> | null = await page.waitForSelector('#mCSB_4_container > ul.list > li > button[data-brch-no="1351"]');  // 코엑스 극장 선택
            await page.evaluate(elem => (elem as HTMLElement)?.click(), coex);

            await new Promise(page => setTimeout(page, 100));    // 0.1초 대기
            await page.evaluate(elem => (elem as HTMLElement)?.click(), coex);
        }

        await page.waitForSelector('#contents > div > div > div.time-schedule.mb30');
        await new Promise(page => setTimeout(page, 300));    // 0.3초 대기
    }

    /* 달력 보기 버튼 클릭 */
    private async openCalendar(page: Page): Promise<void> {
        const calender: ElementHandle<Element> | null = await page.waitForSelector('#contents > div > div > div.time-schedule.mb30 > div > div.bg-line > button[title="달력보기"]');
        await page.evaluate(elem => (elem as HTMLElement)?.click(), calender);    // 캘린더 클릭
    }

    /* 달력에 표시된 월을 원하는 월(this.date의 MM)까지 이전/다음 버튼으로 이동 */
    private async adjustMonth(page: Page): Promise<void> {
        const month: ElementHandle<Element> | null = await page.waitForSelector('#ui-datepicker-div > div.ui-datepicker-header.ui-widget-header.ui-helper-clearfix.ui-corner-all > div > span.ui-datepicker-month');
        const monthText: string | null | undefined = await page.evaluate(elem => {
            return elem?.textContent;
        }, month);  // 몇 월인지 가져오기

        // 달력에 표시된 월(한 자리 "7월" 또는 두 자리 "12월" 형식 모두 대응)
        const currentMonth: number = monthText?.charAt(1) === "월"
            ? parseInt(monthText.charAt(0), 10)
            : parseInt(monthText?.substring(0, 2) ?? "0", 10);

        // 원하는 월 (this.date: YYYYMMDD)
        const targetMonth: number = parseInt(this.date.substring(4, 6), 10);

        const diff: number = targetMonth - currentMonth;

        // 다음 월로 이동
        if (diff > 0) {
            for (let i = 0; i < diff; i++) {
                let nextBtn: ElementHandle<Element> | null = await page.waitForSelector('#ui-datepicker-div > div.ui-datepicker-header.ui-widget-header.ui-helper-clearfix.ui-corner-all > a.ui-datepicker-next.ui-corner-all');
                await page.evaluate(elem => (elem as HTMLElement)?.click(), nextBtn);
            }
        } else if (diff < 0) {    // 이전 월로 이동
            for (let i = 0; i > diff; i--) {
                let prevBtn: ElementHandle<Element> | null = await page.waitForSelector('#ui-datepicker-div > div.ui-datepicker-header.ui-widget-header.ui-helper-clearfix.ui-corner-all > a.ui-datepicker-prev.ui-corner-all.ui-state-disabled')
                await page.evaluate(elem => (elem as HTMLElement)?.click(), prevBtn);
            }
        }
    }

    /* 달력에서 원하는 일(this.date의 DD)의 셀을 찾아 클릭 */
    private async selectDay(page: Page): Promise<void> {
        // 원하는 일 (예: "01" -> "1", "10" -> "10")
        const targetDay: string = String(parseInt(this.date.substring(6, 8), 10));

        // 이전/다음 달의 패딩 셀(같은 일자 숫자를 가질 수 있음)은 클릭해도 반응이 없으므로 제외
        await page.waitForSelector(`#ui-datepicker-div > table > tbody td:not(.ui-datepicker-other-month)`);
        const days: ElementHandle<HTMLTableCellElement>[] = await page.$$(`#ui-datepicker-div > table > tbody td:not(.ui-datepicker-other-month)`);
        let dayText: string | null;
        for (let i = 0; i < days.length; i++) {
            dayText = await page.evaluate(elem => elem.textContent, days[i]);  // 며칠인지 가져오기

            // 해당 날짜 클릭
            if (targetDay == dayText) {
                await page.evaluate(elem => elem.click(), days[i]);
                break;
            }
        }
    }

    /* 날짜 클릭 후 상영관/시간표가 렌더링될 때까지 대기. 예매 가능 기간을 벗어나 '예매가능일이 아닙니다' 팝업이 뜨면 false 반환 */
    private async waitForTimetable(page: Page): Promise<boolean> {
        const dateButtonSelector = `#contents > div > div > div.time-schedule.mb30 > div > div.date-list > div.date-area > div > button[date-data="${this.date.substring(0, 4)}.${this.date.substring(4, 6)}.${this.date.substring(6, 8)}"]`;
        const popupTextSelector = 'section.alert-popup .txt-common';

        // 날짜 버튼이 나타나거나(예매 가능) 예매 불가 팝업이 뜰 때까지(예매 불가) 대기
        await page.waitForSelector(`${dateButtonSelector}, ${popupTextSelector}`);

        const popupText: string | null = await page.$eval(popupTextSelector, elem => elem.textContent).catch(() => null);

        if (popupText?.includes('예매가능일이 아닙니다')) {
            return false;
        }

        await page.waitForSelector('div.theater-list');
        await page.waitForSelector(`.theater-time table.time-list-table > tbody > tr > td[play-de="${this.date}"]`);

        return true;
    }

    /* cheerio로 페이지 HTML을 파싱해 Dolby Cinema 상영 시간표를 만든다 */
    private async parseDolbyTimetable(page: Page): Promise<{ timeTable: string; dolby: boolean }> {
        let content: string = await page.content();
        let $: cheerio.Root = Cheerio.load(content);

        let brchNm = $('#contents > div > div > h3:nth-child(5)').text();   // 극장 이름
        const theaterNm = $('p.theater-name');  // 상영관 이름들
        let timeTable: string = ""; // Dolby Cinema 상영 시간표
        let dolby: boolean = false;  // Dolby Cinema 유무
        
        theaterNm.each((i, e) => {
            if ($(e).text().toUpperCase().includes("DOLBY CINEMA")) {    // 상영관 이름 확인
                let movieNm: string = $(e).parents('.theater-list').find('.theater-tit > p > a').text().trim(); // Dolby Cinema관에서 상영하는 영화 이름
                let play: cheerio.Cheerio = $(e).parents('.theater-type-box').find('.theater-time table.time-list-table > tbody > tr > td'); // 상영 시간 정보
                let playDate: string | undefined = $(play).attr('play-de'); // 상영 날짜

                // 상영관 지점 및 날짜(헤더)는 최초 한 번만 추가
                if (!dolby) {
                    timeTable += (brchNm + "\n" + playDate?.substring(0, 4) + "년 " + playDate?.substring(4, 6) + "월 " +
                        playDate?.substring(6, 8) + "일\nDolby Cinema 오픈\n\n");
                }

                dolby = true;

                timeTable += (`🎬 ${movieNm}\n`); // 영화 제목 추가

                play.each((i, e) => {
                    let playTime: string = $(e).find('div.td-ab div.play-time > p').first().text().trim();  // 상영 시간
                    let seatRemainCnt: string = $(e).find('div.td-ab > div.txt-center > a > p.chair').text().trim()   // 남은 좌석수

                    // 매진 될 때
                    if ($(play).attr('class') === "end-time") {
                        playTime = $(e).find('p.time').text().trim();   // 상영 시간
                        seatRemainCnt = $(e).find('p.chair').text().trim(); // 남은 좌석수
                    }

                    timeTable += (`${playTime} | 남은 좌석수 : ${seatRemainCnt}\n`);
                });
                timeTable += "\n";
            }
        });

        return { timeTable, dolby };
    }
}

export default DolbyCrawler;

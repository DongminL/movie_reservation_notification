import Crawler from './crawler';
import Puppeteer, { ElementHandle, Frame, Page } from 'puppeteer';
import Cheerio from 'cheerio';

class ImaxCrawler extends Crawler {

    constructor(date: string, theater: string) {
        super(date, theater);
    }

    async crawl(): Promise<string> {
        // 웹 크롤링을 위한 puppeteer 브라우저 생성
        this.browser = await Puppeteer.launch({
            headless: true,
            args: [
                '--disable-geolocation',                  // 위치 정보 자체 비활성화
            ]
        });

        while (!this.isStop) {  // IMAX관 시간표를 가져올 때까지 반복
            const page: Page = await this.browser?.newPage();   // 페이지 생성

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

                // 영화관 선택
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

                // 스크래핑을 위한 cheerio 객체 생성
                const content: string | undefined = await page.content();
                const $: cheerio.Root = Cheerio.load(content);

                // 해당 날짜와 상영관의 시간표
                await page.waitForSelector('ul.screenInfoTimes_scheduleWrap__sXjoc');  // 시간표 렌더링 대기
                const timetable = await page.$$('div[class="screenInfoTimes_startTimeItem__JW8_2"]');
                
                const imaxTimetable: Map<string, any[]> = new Map<string, any[]>();
                for (const item of timetable) {
                    const screenType: string = await item.$eval(
                        'button.screenInfoTimes_infoWrap__dcYhr > span.screenInfoTimes_seatWrap__7ww9A > span:nth-child(2)',
                        e => e.textContent?.trim() || ''
                    );

                    if (screenType !== 'IMAX관') {
                        continue;
                    } 

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
                    if (!imaxTimetable.has(movie)) {
                        imaxTimetable.set(movie, []);
                    }
                    const list: any[]|undefined = imaxTimetable.get(movie);
                    list?.push();

                    console.log('영화:', movie);
                    console.log('시작 시간:', startTime);
                    console.log('종료 시간:', endTime);
                    console.log('좌석수:', seatInfo);
                }

                // IMAX관 오픈 여부에 따른 처리
                if (timetable.length > 0) {
                    let result: string = ""; // 상영 시간표 및 남은 좌석수
                    


                    console.log(result);

                    await page.close();  // puppeteer 페이지 종료
                    await this.browser.close();  // puppeteer 브라우저 종료

                    // 크롤링한 시간표 반환
                    return result;
                } else {
                    console.log("IMAX관이 열리지 않았습니다.");

                    await this.trick();   // 차단 회피
                    await page.close(); // 페이지 종료
                }
            } catch (err) {
                console.error(err);

                await page.close(); // 페이지 종료
                await this.trick();   // 차단 회피
            }
        }

        this.browser.close();
        return "";
    }
}

export default ImaxCrawler;
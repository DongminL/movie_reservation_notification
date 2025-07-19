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
            headless: "new"
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

                    const text: string|undefined = await page.evaluate(e => e.textContent?.trim(), p);
                    if (text?.includes(targetTheater)) {
                        await button.click();
                        console.log("용산아이파크몰 선택");
                        break;
                    }
                }

                // 상영시간표 정보가 담긴 iframe으로 전환
                const ifrmHandle: ElementHandle<HTMLIFrameElement> | null = await page.$('iframe[id="ifrm_movie_time_table"]');
                const ifrm: Frame | null | undefined = await ifrmHandle?.contentFrame();

                // 스크래핑을 위한 cheerio 객체 생성
                const content: string | undefined = await ifrm?.content();
                const $: cheerio.Root = Cheerio.load(content ?? '');

                // 해당 날짜에 IMAX관 오픈 정보 가져오기
                const imax: cheerio.Cheerio = $('span.imax');

                // IMAX관 오픈 여부에 따른 처리
                if (imax.length > 0) {
                    let timeTable: string = ""; // 상영 시간표 및 남은 좌석수
                    


                    console.log(timeTable);

                    await page.close();  // puppeteer 페이지 종료
                    await this.browser.close();  // puppeteer 브라우저 종료

                    // 크롤링한 시간표 반환
                    return timeTable;
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
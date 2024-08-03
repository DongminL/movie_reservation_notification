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

                await page.goto(this.config.urls.imax + this.date, pageOption);   // CGV 용산아이파크몰점 예매 사이트 접속

                // 상영시간표 정보가 담긴 iframe으로 전환
                const ifrmHandle: ElementHandle<HTMLIFrameElement> | null = await page.$('iframe[id="ifrm_movie_time_table"]');
                const ifrm: Frame | null | undefined = await ifrmHandle?.contentFrame();

                // 스크래핑을 위한 cheerio 객체 생성
                const content: string | undefined = await ifrm?.content();
                const $: cheerio.Root = Cheerio.load(content?? '');

                // 해당 날짜에 IMAX관 오픈 정보 가져오기
                const imax: cheerio.Cheerio = $('span.imax');

                // IMAX관 오픈 여부에 따른 처리
                if (imax.length > 0) {
                    let timeTable: string = ""; // 상영 시간표 및 남은 좌석수
                    let movieNm: string = $(imax).parents('.col-times').find('.info-movie > a > strong').text().trim(); // IMAX관에서 상영하는 영화 이름
                    let playDate: string | undefined = $(imax).parents('.type-hall').find('.info-timetable > ul > li > a').attr('data-playymd');    // 상영 날짜 (yyyymmdd)

                    // uri의 date 값과 상영 날짜의 값이 다르면 종료
                    if (playDate !== this.date) {
                        console.log("IMAX관이 열리지 않았습니다.");

                        await this.trick();   // 차단 회피
                        await page.close();
                        continue;
                    }

                    timeTable += (`${playDate?.substring(0, 4)}년 ${playDate?.substring(4, 6)}월 ${playDate?.substring(6, 8)}일\nIMAX 오픈\n\n`); // 상영 날짜 추가
                    timeTable += (movieNm + "\n");  // 영화 제목 추가

                    // 상영시간표 가져오기
                    $(imax).parents('.type-hall').find('.info-timetable > ul > li')
                    .each((i, e) => {
                        let startTime: string | undefined = $(e).find('a').attr('data-playstarttime');  // 상영 시작 시간
                        let endTime: string | undefined = $(e).find('a').attr('data-playendtime');  // 상영 종료 시간
                        let seatRemainCnt: string | undefined = $(e).find('a').attr('data-seatremaincnt');  // 남은 좌석수
                        let link: string = "http://www.cgv.co.kr" + $(e).find('a').attr('href'); // 예매하는 페이지 url

                        // 예매 준비중이거나 마감 표시
                        if ($(e).find('a').length < 1) {
                            startTime = $(e).find('em').text();
                            seatRemainCnt = $(e).find('span').text();

                            timeTable += ("\n" + startTime +
                                " | 남은 좌석수 : " + seatRemainCnt);

                        } else if (seatRemainCnt == null || startTime == null) {
                            startTime = $(e).find('em').text();
                            seatRemainCnt = $(e).find('span').text();

                            timeTable += ("\n" + startTime +
                                " | 남은 좌석수 : " + seatRemainCnt +
                                " | [예매](" + link + ")");

                        } else {
                            timeTable += ("\n" + startTime.substring(0, 2) + ":" + startTime.substring(2, 4) + " ~ " +
                                endTime?.substring(0, 2) + ":" + endTime?.substring(2, 4) +
                                " | 남은 좌석수 : " + seatRemainCnt +
                                " | [예매](" + link + ")");
                        }
                    });

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
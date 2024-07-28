const Crawler = require('./crawler');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');


class DolbyCrawler extends Crawler {

    constructor(date, theater) {
        super(date, theater);
    }

    /* 메가박스 Dolby 웹 크롤링 */
    async crawl() {
        // 웹 크롤링을 위한 puppeteer 객체 생성
        this.browser = await puppeteer.launch({
            headless: "new"
        });

        let dolby = false;  // Dolby Cinema 유무

        while (true) {  // Dolby Cinema관 시간표를 가져올 때까지 반복
            const page = await this.browser.newPage();   // 페이지 생성

            try {
                // 탭 옵션
                const pageOption = {
                    // waitUntil: 적어도 500ms 동안 두 개 이상의 네트워크 연결이 없으면 탐색이 완료된 것으로 간주합니다.
                    waitUntil: 'networkidle2',
                    // timeout: 20초 안에 새 탭의 주소로 이동하지 않으면 에러 발생
                    timeout: 20000
                };

                await page.goto(this.config.urls.dolby, pageOption);   // 메가박스 예매 사이트 접속

                // 영화관 선택
                const theater_select = await page.waitForSelector('div[class="tab-left-area"] > ul > li > a[title="극장별 선택"]');
                await page.evaluate(elem => elem.click(), theater_select);

                if (this.theater === "남돌비") {
                    const gyeonggi = await page.waitForSelector('#masterBrch > div > div.tab-list-choice > ul > li:nth-child(2) > a[title="경기지점 선택"]');   // 경기 선택
                    await page.evaluate(elem => elem.click(), gyeonggi);
                    const namyang = await page.waitForSelector('#mCSB_5_container > ul.list > li > button[data-brch-no="0019"]');   // 남양주현대아울렛 스페이스원 극장 선택
                    await page.evaluate(elem => elem.click(), namyang);
                    await new Promise((page) => setTimeout(page, 100));    // 0.1초 대기
                    await page.evaluate(elem => elem.click(), namyang);
                }
                else if (this.theater === "코돌비") {
                    const coex = await page.waitForSelector('#mCSB_4_container > ul.list > li > button[data-brch-no="1351"]');  // 코엑스 극장 선택
                    await page.evaluate(elem => elem.click(), coex);
                    await new Promise((page) => setTimeout(page, 100));    // 0.1초 대기
                    await page.evaluate(elem => elem.click(), coex);
                }

                await page.waitForSelector('#contents > div > div > div.time-schedule.mb30');
                await new Promise((page) => setTimeout(page, 300));    // 0.3초 대기

                // 날짜 선택
                const calender = await page.waitForSelector('#contents > div > div > div.time-schedule.mb30 > div > div.bg-line > button[title="달력보기"]');
                await page.evaluate(elem => elem.click(), calender);    // 캘린더 클릭
                const month = await page.waitForSelector('#ui-datepicker-div > div.ui-datepicker-header.ui-widget-header.ui-helper-clearfix.ui-corner-all > div > span.ui-datepicker-month');
                const monthText = await page.evaluate(elem => {
                    return elem.textContent;
                }, month);  // 몇 월인지 가져오기

                // 월 맞추기
                if (this.date.charAt(4) === '0') {
                    let next = 0;
                    if (monthText.charAt(1) === "월") {
                        next = parseInt(this.date.charAt(5) - monthText.charAt(0));
                    }
                    else {
                        next = parseInt(this.date.charAt(5) - monthText.substring(0, 2));
                    }

                    // 다음 월로 이동
                    if (next > 0) {
                        for (let i = 0; i < next; i++) {
                            let nextBtn = await page.waitForSelector('#ui-datepicker-div > div.ui-datepicker-header.ui-widget-header.ui-helper-clearfix.ui-corner-all > a.ui-datepicker-next.ui-corner-all');
                            await page.evaluate(elem => elem.click(), nextBtn);
                        }
                    }

                    // 이전 월로 이동
                    else if (next < 0) {
                        for (let i = 0; i > next; i--) {
                            let prevBtn = await page.waitForSelector('#ui-datepicker-div > div.ui-datepicker-header.ui-widget-header.ui-helper-clearfix.ui-corner-all > a.ui-datepicker-prev.ui-corner-all.ui-state-disabled')
                            await page.evaluate(elem => elem.click(), prevBtn);
                        }
                    }
                }
                else {
                    let next = 0;
                    if (monthText.charAt(1) === "월") {
                        next = parseInt(this.date.substring(4, 6) - monthText.charAt(0));
                    }
                    else {
                        next = parseInt(this.date.substring(4, 6) - monthText.substring(0, 2));
                    }

                    // 다음 월로 이동
                    if (next > 0) {
                        for (let i = 0; i < next; i++) {
                            let nextBtn = await page.waitForSelector('#ui-datepicker-div > div.ui-datepicker-header.ui-widget-header.ui-helper-clearfix.ui-corner-all > a.ui-datepicker-next.ui-corner-all');
                            await page.evaluate(elem => elem.click(), nextBtn);
                        }
                    }

                    // 이전 월로 이동
                    else if (next < 0) {
                        for (let i = 0; i > next; i--) {
                            let prevBtn = await page.waitForSelector('#ui-datepicker-div > div.ui-datepicker-header.ui-widget-header.ui-helper-clearfix.ui-corner-all > a.ui-datepicker-prev.ui-corner-all.ui-state-disabled')
                            await page.evaluate(elem => elem.click(), prevBtn);
                        }
                    }
                }

                // 월 선택
                let targetMonth = 0;
                if (this.date.charAt(4) === "0") {
                    targetMonth = parseInt(this.date.charAt(5));
                }
                else {
                    targetMonth = parseInt(this.date.substring(4, 6));
                }

                // 일 선택
                let targetDay = "";
                if (this.date.charAt(6) === "0") {
                    targetDay = this.date.charAt(7);
                }
                else {
                    targetDay = this.date.substring(6, 8);
                }

                await page.waitForSelector(`#ui-datepicker-div > table > tbody td`);
                const days = await page.$$(`#ui-datepicker-div > table > tbody td`);
                let dayText = "";
                for (let i = 0; i < days.length; i++) {
                    dayText = await page.evaluate(elem => elem.textContent, days[i]);  // 며칠인지 가져오기

                    // 해당 날짜 클릭
                    if (targetDay == dayText) {
                        await page.evaluate(elem => elem.click(), days[i]);
                        break;
                    }
                }

                // html 불러오기까지 대기
                await page.waitForSelector(`#contents > div > div > div.time-schedule.mb30 > div > div.date-list > div.date-area > div > button[date-data="${this.date.substring(0, 4)}.${this.date.substring(4, 6)}.${this.date.substring(6, 8)}"]`);
                await page.waitForSelector('div.theater-list');
                await page.waitForSelector(`.theater-time table.time-list-table > tbody > tr > td[play-de="${this.date}"]`)

                // 스크래핑을 위한 cheerio 객체 생성
                let content = await page.content();
                let $ = cheerio.load(content);

                let brchNm = $('#contents > div > div > h3:nth-child(5)').text();   // 
                console.log(brchNm);

                const theaterNm = $('p.theater-name');
                console.log(theaterNm.length);

                let timeTable = ""; // Dolby Cinema 상영 시간표 
                theaterNm.each((i, e) => {
                    if ($(e).text() == "Dolby Cinema [Laser]") {    // 상영관 이름 확인
                        let movieNm = $(e).parents('.theater-list').find('.theater-tit > p > a').text().trim(); // Dolby Cinema관에서 상영하는 영화 이름
                        let play = $(e).parents('.theater-type-box').find('.theater-time table.time-list-table > tbody > tr > td'); // 상영 시간 정보
                        let playDate = $(play).attr('play-de'); // 상영 날짜
                        
                        dolby = true;

                        timeTable += (brchNm + "\n" + playDate.substring(0, 4) + "년 " + playDate.substring(4, 6) + "월 " +
                                    playDate.substring(6, 8) + "일\nDolby Cinema 오픈\n");  // 영화관 지점 및 날짜 추가
                        timeTable += ("\n" + movieNm + "\n\n"); // 영화 이름 추가

                        play.each((i, e) => {
                            let playTime = $(e).find('div.td-ab div.play-time > p').first().text().trim();  // 상영 시간
                            let seatRemainCnt = $(e).find('div.td-ab > div.txt-center > a > p.chair').text().trim()   // 남은 좌석수

                            // 매진 될 때
                            if ($(play).attr('class') === "end-time") {
                                playTime = $(e).find('p.time').text().trim();   // 상영 시간
                                seatRemainCnt = $(e).find('p.chair').text().trim(); // 남은 좌석수
                            }

                            timeTable += (`${playTime} | 남은 좌석수 : ${seatRemainCnt}\n`);
                        });
                    }
                });

                // Telegram으로 전송
                if (dolby) {
                    console.log(timeTable);

                    await page.close();  // puppeteer 페이지 종료
                    await this.browser.close();  // puppeteer 브라우저 종료

                    // 크롤링한 시간표 반환
                    return timeTable;
                }
                else {
                    console.log("Dolby Cinema가 열리지 않았습니다.");

                    this.trick();   // 차단 회피
                    await page.close();  // puppeteer 페이지 종료
                }
            } catch (err) {
                console.error(err);
                console.log("Dolby Cinema가 열리지 않았습니다.");

                await page.close();    // puppeteer 페이지 종료
                this.trick();   // 차단 회피
            }
        }
    }
}

module.exports = DolbyCrawler;
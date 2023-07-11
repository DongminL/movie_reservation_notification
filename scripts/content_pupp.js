const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const schedule = require('node-schedule');

/* 오늘 날짜 (yyyymmdd) */
function today() {
    const date = new Date();    // Date 객체 생성  
    let year = String(date.getFullYear());  // 년도 (yyyy)
    let month = String("0" + (date.getMonth() + 1)).slice(-2);  // 두 자리수의 월 (mm)
    let day = String("0" + date.getDate()).slice(-2);   // 두 자리수의 일 (dd)

    return year + month + day;  // yyyyymmdd 형태로 반환
}

/* 웹 크롤링 */
async function crawler() {
    try {
        // 웹 크롤링을 위한 puppeteer 객체 생성
        const browser = await puppeteer.launch({
            headless: "new"
        });
        const page = await browser.newPage();
        await page.goto("http://www.cgv.co.kr/theaters/?areacode=01&theaterCode=0013&date=20230715");   // CGV 용산아이파크몰점 예매 사이트 접속

        // 상영시간표 정보가 담긴 iframe으로 전환
        const ifrmHandle = await page.$('iframe[id="ifrm_movie_time_table"]');
        const ifrm = await ifrmHandle.contentFrame();

        // 스크래핑을 위한 cheerio 객체 생성
        const content = await ifrm.content();
        const $ = cheerio.load(content);

        // 해당 날짜에 IMAX관 오픈 정보 가져오기
        const imax = $('span.imax');
        console.log(imax.length)

        // IMAX관 오픈 여부에 따른 처리
        if (imax.length > 0) {
            console.log("IMAX관 오픈");
            console.log($(imax).parents('.col-times').find('.info-movie > a > strong').text().trim());  // IMAX관에서 상영하는 영화 이름
            // 상영시간 및 잔여 좌석수
            $(imax).parents('.type-hall').find('.info-timetable > ul > li').each((i, e) => {
                console.log($(e).text());
            });
        }
        else {
            console.log("IMAX관이 열리지 않았습니다.");
        }

        await browser.close();  // puppeteer 브라우저 종료
    } catch (err) {
        console.error(err);
    }
}

/* 10초간격으로 웹 크롤링 실행 */
const job = schedule.scheduleJob("*/10 * * * * *", function () {
    crawler();
});
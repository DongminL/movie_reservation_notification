const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const schedule = require('node-schedule');
const telegram = require("node-telegram-bot-api");

/* Telegram Bot */
const token = "6331704920:AAEL5bnlVpBKe5Usx0QXQOSOgeLRFrfaD-Y"; // telegram bot token
const bot = new telegram(token, {polling: true});   // telegram bot api 객체 생성
const chatId = "6288907835";  // 나의 chat id

let flag = false;   // 해당일의 IMAX관 예매 오픈 여부


/* 오늘 날짜 (yyyymmdd) */
function today() {
    const date = new Date();    // Date 객체 생성  
    let year = String(date.getFullYear());  // 년도 (yyyy)
    let month = String("0" + (date.getMonth() + 1)).slice(-2);  // 두 자리수의 월 (mm)
    let day = String("0" + date.getDate()).slice(-2);   // 두 자리수의 일 (dd)

    return year + month + day;  // yyyyymmdd 형태로 반환
}

// Telegram Bot에 메세지 보내기
function sendMsg(msg) {
    bot.sendMessage(chatId, msg, {parse_mode: 'Markdown'});
}

/* 웹 크롤링 */
async function crawler() {
    try {
        // 웹 크롤링을 위한 puppeteer 객체 생성
        const browser = await puppeteer.launch({
            headless: "new"
        });
        const page = await browser.newPage();
        await page.goto("http://www.cgv.co.kr/theaters/?areacode=01&theaterCode=0013&date=20230720");   // CGV 용산아이파크몰점 예매 사이트 접속

        // 상영시간표 정보가 담긴 iframe으로 전환
        const ifrmHandle = await page.$('iframe[id="ifrm_movie_time_table"]');
        const ifrm = await ifrmHandle.contentFrame();

        // 스크래핑을 위한 cheerio 객체 생성
        const content = await ifrm.content();
        const $ = cheerio.load(content);

        // 해당 날짜에 IMAX관 오픈 정보 가져오기
        const imax = $('span.imax');

        // IMAX관 오픈 여부에 따른 처리
        if (imax.length > 0) {
            let movieNm = $(imax).parents('.col-times').find('.info-movie > a > strong').text().trim(); // IMAX관에서 상영하는 영화 이름
            let playDate = $(imax).parents('.type-hall').find('.info-timetable > ul > li > a').attr('data-playymd');    // 상영 날짜 (yyyymmdd)
            let timeTable = ""; // 상영 시간표 및 남은 좌석수
            $(imax).parents('.type-hall').find('.info-timetable > ul > li').each((i, e) => {
                let startTime = $(e).find('a').attr('data-playstarttime');  // 상영 시작 시간
                let endTime = $(e).find('a').attr('data-playendtime');  // 상영 종료 시간
                let seatRemainCnt = $(e).find('a').attr('data-seatremaincnt');  // 남은 좌석수
                let link = "http://www.cgv.co.kr" + $(e).find('a').attr('href'); // 예매하는 페이지 url

                timeTable += ("\n" + startTime.substring(0,2) + ":" + startTime.substring(2,4) + " ~ " + 
                            endTime.substring(0,2) + ":" + endTime.substring(2,4) +
                            " | 남은 좌석 : " + seatRemainCnt + 
                            " | [예매](" + link + ")");
            });

            console.log(`${playDate.substring(0,4)}년 ${playDate.substring(4,6)}월 ${playDate.substring(6,8)}일\nIMAX관 오픈\n`);
            console.log(movieNm);
            console.log(timeTable);

            // Telegram에 전송
            sendMsg(playDate.substring(0,4) + "년 " + playDate.substring(4,6) + "월 " +
                    playDate.substring(6,8) + "일\nIMAX관 오픈\n\n" + movieNm + "\n" + timeTable);

            job.cancel();   // 스케줄러 종료
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
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const schedule = require('node-schedule');
const telegram = require("node-telegram-bot-api");

/* Telegram Bot */
const Token = "6331704920:AAEL5bnlVpBKe5Usx0QXQOSOgeLRFrfaD-Y"; // telegram bot token
const bot = new telegram(Token, {polling: true});   // telegram bot api 객체 생성
const ChatId = "6288907835";  // 나의 chat id

let flag = false;   // 해당일의 IMAX관 예매 오픈 여부
let targetDate = today();   // 예매할 날짜


/* 오늘 날짜 (yyyymmdd) */
function today() {
    const date = new Date();    // Date 객체 생성  
    let year = String(date.getFullYear());  // 년도 (yyyy)
    let month = String("0" + (date.getMonth() + 1)).slice(-2);  // 두 자리수의 월 (mm)
    let day = String("0" + date.getDate()).slice(-2);   // 두 자리수의 일 (dd)

    return year + month + day;  // yyyyymmdd 형태로 반환
}

/* undifined나 null을 null string으로 변환 */
function fnToNull(data) { 
    if (String(data) == 'undefined' || String(data) == 'null') {
        return ''
    } else {
        return data
    }
}

/* 날짜 유효성 체크 (윤달 포함) */
function fnisDate(vDate) {
	let vValue = vDate;
	let vValue_Num = vValue.replace(/[^0-9]/g, ""); //숫자를 제외한 나머지는 예외처리 합니다.
    
    // 아무것도 입력하지 않은 경우
	if (fnToNull(vValue_Num) == "") {
		sendMsg("날짜를 입력 해 주세요.");
		return false;
	}

	//8자리가 아닌 경우 false
	if (vValue_Num.length != 8) {
		sendMsg("날짜를 yyyymmdd 형식으로 입력 해 주세요.");
		return false;
	}
	
    //8자리의 yyyymmdd를 원본 , 4자리 , 2자리 , 2자리로 변경해 주기 위한 패턴생성을 합니다.
	let rxDatePattern = /^(\d{4})(\d{1,2})(\d{1,2})$/; 
	let dtArray = vValue_Num.match(rxDatePattern); 

	if (dtArray == null) {
		return false;
	}

	//0번째는 원본 , 1번째는 yyyy(년) , 2번재는 mm(월) , 3번재는 dd(일) 입니다.
	let dtYear = dtArray[1];
	let dtMonth = dtArray[2];
	let dtDay = dtArray[3];

	//yyyymmdd 체크
	if (dtMonth < 1 || dtMonth > 12) {
		sendMsg("존재하지 않은 월을 입력하셨습니다. 다시 한번 확인 해주세요");
		return false;
	}
	else if (dtDay < 1 || dtDay > 31) {
		sendMsg("존재하지 않은 일을 입력하셨습니다. 다시 한번 확인 해주세요");
		return false;
	}
	else if ((dtMonth == 4 || dtMonth == 6 || dtMonth == 9 || dtMonth == 11) && dtDay == 31) {
		sendMsg("존재하지 않은 일을 입력하셨습니다. 다시 한번 확인 해주세요");
		return false;
	}
	else if (dtMonth == 2) {
		let isleap = (dtYear % 4 == 0 && (dtYear % 100 != 0 || dtYear % 400 == 0));

		if (dtDay > 29 || (dtDay == 29 && !isleap)) {
			sendMsg("존재하지 않은 일을 입력하셨습니다. 다시 한번 확인 해주세요");
			return false;
		}
	}

	return true;
}

/* Telegram Bot에 메세지 보내기 */
function sendMsg(msg) {
    bot.sendMessage(ChatId, msg, {parse_mode: 'Markdown'});
}

/* 예매할 날짜 설정 (명령어 : "/setdate yyyymmdd") */
bot.onText(/\/setdate (.+)/, (msg, match) => {
    let date = match[1];
    console.log(`변경된 날짜 : ${date}`);

    // 날짜 형식 확인 후 변경
    if (fnisDate(date)) {
        targetDate = String(date);
        job.reschedule("*/10 * * * * *");   // 스케줄러 재시작
    }
});

/* 웹 크롤링 */
async function crawler() {
    try {
        // 웹 크롤링을 위한 puppeteer 객체 생성
        const browser = await puppeteer.launch({
            headless: "new"
        });
        const page = await browser.newPage();
        await page.goto(`http://www.cgv.co.kr/theaters/?areacode=01&theaterCode=0013&date=${targetDate}`);   // CGV 용산아이파크몰점 예매 사이트 접속

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
            let timeTable = ""; // 상영 시간표 및 남은 좌석수
            let movieNm = $(imax).parents('.col-times').find('.info-movie > a > strong').text().trim(); // IMAX관에서 상영하는 영화 이름
            let playDate = $(imax).parents('.type-hall').find('.info-timetable > ul > li > a').attr('data-playymd');    // 상영 날짜 (yyyymmdd)

            // uri의 date 값과 상영 날짜의 값이 다르면 종료
            if (playDate !== targetDate) {
                console.log("IMAX관이 열리지 않았습니다.");
                return await browser.close();  // puppeteer 브라우저 종료
            }

            // 상영시간표 가져오기
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
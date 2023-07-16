const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const telegram = require("node-telegram-bot-api");

/* Telegram Bot */
const Token = "6331704920:AAEL5bnlVpBKe5Usx0QXQOSOgeLRFrfaD-Y"; // telegram bot token
const bot = new telegram(Token, {polling: true});   // telegram bot api 객체 생성
let ChatId = "6288907835";  // 나의 chat id

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
    ChatId = msg.chat.id;
    let date = match[1];
    console.log(`변경된 날짜 : ${date}`);

    // 날짜 형식 확인 후 변경
    if (fnisDate(date)) {
        let targetDate = String(date);
        dolbyCrawler(targetDate);  
    }
});

/* 메가박스 Dolby 웹 크롤링 */
async function dolbyCrawler(targetDate) {
    // 웹 크롤링을 위한 puppeteer 객체 생성
    const browser = await puppeteer.launch({
        headless: "new"
    });

    const page = await browser.newPage();   // 새 페이지 생성
    
    // 브라우저 실행 시 생성되어 있는 탭 닫기
    const [firstPage] = await browser.pages();
    await firstPage.close();

    try {
        await page.goto(`https://www.megabox.co.kr/booking/timetable`);   // 메가박스 예매 사이트 접속

        // 영화관 선택
        await page.click('div[class="tab-left-area"] > ul > li > a[title="극장별 선택"]');
        const brch = await page.waitForSelector('#mCSB_4_container > ul.list > li > button[data-brch-no="1351"]');
        await page.evaluate(elem => elem.click(), brch);
        
        // 날짜 선택
        const date = await page.waitForSelector('#contents > div > div > div.time-schedule.mb30 > div > div.date-list > div.date-area > div > button[date-data="2023.07.17"]');
        await page.evaluate(elem => elem.click(), date);

        // html 불러오기까지 대기
        const date_delay = await page.waitForSelector('#contents > div > div > div.time-schedule.mb30 > div > div.date-list > div.date-area > div > button[date-data="2023.07.17"].on');
        const n_d = await page.waitForSelector('div.theater-list');
        
        // 스크래핑을 위한 cheerio 객체 생성
        const content = await page.content();
        const $ = cheerio.load(content);

        const name = $('p.theater-name');
        console.log(name.length)
        
        name.each((i, e) => {
            if ($(e).text() == "Dolby Cinema") {
                let movieNm = $(e).parents('.theater-list').find('.theater-tit > p > a').text().trim(); // IMAX관에서 상영하는 영화 이름
                console.log(movieNm);
            }
        })
        

    } catch (err) {
        console.error(err);
        page.close()    // puppeteer 페이지 종료
    }
}

dolbyCrawler(today());

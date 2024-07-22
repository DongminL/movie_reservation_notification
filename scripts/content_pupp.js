const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const telegram = require("node-telegram-bot-api");
const yaml = require('js-yaml');
const fs = require('fs');

// YAML 파일 읽기
const config = yaml.load(fs.readFileSync('./config.yaml', 'utf-8'));

/* Telegram Bot */
const token = config.telegram.token; // telegram bot token
const bot = new telegram(token, {polling: true});   // telegram bot api 객체 생성
const chatId = config.telegram.chatId;  // 나의 chat id
let date = today(); // 현재 크롤링하고 있는 날짜
let theater = "용아맥"; // 현재 크롤링하고 있는 극장   (기본값 : 용산 아이파크점)

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
		sendMsg("날짜를 입력해 주세요.");
		return false;
	}

	//8자리가 아닌 경우 false
	if (vValue_Num.length != 8) {
		sendMsg("날짜를 yyyymmdd 형식으로 입력해 주세요.");
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
		sendMsg("존재하지 않는 달을 입력하셨습니다.\n다시 확인 해주세요.");
		return false;
	}
	else if (dtDay < 1 || dtDay > 31) {
		sendMsg("존재하지 않는 날을 입력하셨습니다.\n다시 확인 해주세요.");
		return false;
	}
	else if ((dtMonth == 4 || dtMonth == 6 || dtMonth == 9 || dtMonth == 11) && dtDay == 31) {
		sendMsg("존재하지 않는 날을 입력하셨습니다.\n다시 확인 해주세요.");
		return false;
	}
	else if (dtMonth == 2) {
		let isleap = (dtYear % 4 == 0 && (dtYear % 100 != 0 || dtYear % 400 == 0));

		if (dtDay > 29 || (dtDay == 29 && !isleap)) {
			sendMsg("존재하지 않는 날을 입력하셨습니다.\n다시 확인 해주세요.");
			return false;
		}
	}

	return true;
}

// 명령어 목록
bot.setMyCommands([
    { command: '/setdate', description: '날짜 설정 (YYYYMMDD)' },
    { command: '/settheater', description: '극장 설정 (용아맥, 남돌비, 코돌비)' },
]);

/* Telegram Bot에 메세지 보내기 */
function sendMsg(msg) {
    bot.sendMessage(chatId, msg, {parse_mode: 'Markdown'});
}

/* 예매할 날짜 설정 (명령어 : "/setdate yyyymmdd") */
bot.onText(/\/setdate (.+)/, (msg, match) => {
    chatId = msg.chat.id;
    let setDate = match[1];
    console.log(`변경된 날짜 : ${setDate}`);

    // 날짜 형식 확인 후 변경
    if (fnisDate(setDate)) {
        let targetDate = String(setDate);
        date = targetDate;  // 크롤링 날짜 변경
        
        if (theater === "용아맥") {
            imaxCrawler(date, theater);
        }
        else if (theater === "남돌비" || theater === "코돌비") {
            dolbyCrawler(date, theater);
        }
    }
});

/* 예매할 극장 설정 (명령어 : "/setdate 남돌비 OR 코돌비") */
bot.onText(/\/settheater (.+)/, (msg, match) => {
    chatId = msg.chat.id;
    let setTheater = match[1];

    let targetTheater = String(setTheater);
    if (theater !== targetTheater && targetTheater === "용아맥") {
        theater = targetTheater;  // 크롤링 극장 변경
        console.log(`변경된 극장 : ${theater}`);

        imaxCrawler(date, theater);
    }
    else if (theater !== targetTheater && (targetTheater === "남돌비" || targetTheater === "코돌비")) {
        theater = targetTheater;  // 크롤링 극장 변경
        console.log(`변경된 극장 : ${theater}`);
        
        dolbyCrawler(date, theater);
    } else {
        sendMsg("잘못된 극장 설정입니다.\n다시 입력해 주세요.");
    }
});

/* 메가박스 Dolby 웹 크롤링 */
async function dolbyCrawler(targetDate, targetTheater) {
    // 웹 크롤링을 위한 puppeteer 객체 생성
    const browser = await puppeteer.launch({
        headless: "new"
    });

    let dolby = false;  // Dolby Cinema 유무
    
    while (true) {  // Dolby Cinema관 시간표를 가져올 때까지 반복
        const page = await browser.newPage();   // 페이지 생성
        
        let random = (Math.random() * 20) + 30;  // 30 ~ 50 사이의 난수
        
        // 날짜가 변경되면 이전 함수 종료
        if (targetDate !== date) {
            await page.close();  // puppeteer 페이지 종료
            await browser.close();  // puppeteer 브라우저 종료
            return;
        }

        // 극장이 변경되면 이전 함수 종료
        if (targetTheater !== theater) {
            await page.close();  // puppeteer 페이지 종료
            await browser.close();  // puppeteer 브라우저 종료
            return;
        }

        try {
            // 탭 옵션
            const pageOption = {
                // waitUntil: 적어도 500ms 동안 두 개 이상의 네트워크 연결이 없으면 탐색이 완료된 것으로 간주합니다.
                waitUntil: 'networkidle2',
                // timeout: 20초 안에 새 탭의 주소로 이동하지 않으면 에러 발생
                timeout: 20000
            };

            await page.goto(config.urls.dolby, pageOption);   // 메가박스 예매 사이트 접속

            // 영화관 선택
            const theater_select = await page.waitForSelector('div[class="tab-left-area"] > ul > li > a[title="극장별 선택"]');
            await page.evaluate(elem => elem.click(), theater_select);

            if (targetTheater === "남돌비") {
                const gyeonggi = await page.waitForSelector('#masterBrch > div > div.tab-list-choice > ul > li:nth-child(2) > a[title="경기지점 선택"]');   // 경기 선택
                await page.evaluate(elem => elem.click(), gyeonggi);
                const namyang = await page.waitForSelector('#mCSB_5_container > ul.list > li > button[data-brch-no="0019"]');   // 남양주현대아울렛 스페이스원 극장 선택
                await page.evaluate(elem => elem.click(), namyang);
                await new Promise((page) => setTimeout(page, 100));    // 0.1초 대기
                await page.evaluate(elem => elem.click(), namyang);
            }
            else if (targetTheater === "코돌비") {
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
            if (targetDate.charAt(4) === '0') {
                let next = 0;
                if (monthText.charAt(1) === "월") {
                    next = parseInt(targetDate.charAt(5) - monthText.charAt(0));
                }
                else {
                    next = parseInt(targetDate.charAt(5) - monthText.substring(0, 2));
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
                    next = parseInt(targetDate.substring(4, 6) - monthText.charAt(0));
                }
                else {
                    next = parseInt(targetDate.substring(4, 6) - monthText.substring(0, 2));
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

            // 일 선택
            let targetMonth = 0;
            if (targetDate.charAt(4) === "0") {
                targetMonth = parseInt(targetDate.charAt(5));
            }
            else {
                targetMonth = parseInt(targetDate.substring(4, 6));
            }
            let targetDay = "";
            if (targetDate.charAt(6) === "0") {
                targetDay = targetDate.charAt(7);
            }
            else {
                targetDay = targetDate.substring(6, 8);
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
            await page.waitForSelector(`#contents > div > div > div.time-schedule.mb30 > div > div.date-list > div.date-area > div > button[date-data="${targetDate.substring(0,4)}.${targetDate.substring(4,6)}.${targetDate.substring(6,8)}"]`);
            await page.waitForSelector('div.theater-list');
            await page.waitForSelector(`.theater-time table.time-list-table > tbody > tr > td[play-de="${targetDate}"]`)

            // 스크래핑을 위한 cheerio 객체 생성
            let content = await page.content();
            let $ = cheerio.load(content);

            let brchNm = $('#contents > div > div > h3:nth-child(5)').text();
            console.log(brchNm);

            const theaterNm = $('p.theater-name');
            console.log(theaterNm.length);
        
            let timeTable = ""; // Dolby Cinema 상영 시간표 
            theaterNm.each((i, e) => {
                if ($(e).text() == "Dolby Cinema [Laser]") {
                    let movieNm = $(e).parents('.theater-list').find('.theater-tit > p > a').text().trim(); // Dolby Cinema관에서 상영하는 영화 이름
                    let play = $(e).parents('.theater-type-box').find('.theater-time table.time-list-table > tbody > tr > td'); // 상영 시간 정보
                    let playDate = $(play).attr('play-de'); // 상영 날짜
                    dolby = true;

                    timeTable += ("\n" + movieNm + "\n\n");

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

            if (dolby) {
                // Telegram으로 전송
                console.log(brchNm + "\n" + targetDate.substring(0,4) + "년 " + targetDate.substring(4,6) + "월 " +
                            targetDate.substring(6,8) + "일\nDolby Cinema 오픈\n" + timeTable);

                sendMsg(brchNm + "\n" + targetDate.substring(0,4) + "년 " + targetDate.substring(4,6) + "월 " +
                    targetDate.substring(6,8) + "일\n\nDolby Cinema 오픈\n" + timeTable);
        
                await page.close();  // puppeteer 페이지 종료
                await browser.close();  // puppeteer 브라우저 종료
                break;
            }
            else {
                console.log("Dolby Cinema가 열리지 않았습니다.");
                
                await new Promise((page) => setTimeout(page, random * 1000));   // 안들키기 위해 랜덤값만큼 대기 (ms)
                await page.close();  // puppeteer 페이지 종료
            }
        } catch (err) {
            console.error(err);
            console.log("Dolby Cinema가 열리지 않았습니다.");

            //await page.close();    // puppeteer 페이지 종료
            await new Promise((page) => setTimeout(page, random * 1000));   // 안들키기 위해 랜덤값만큼 대기 (ms)
        }
    }
}

/* CGV IMAX 웹 크롤링 */
async function imaxCrawler(targetDate, targetTheater) {
    // 웹 크롤링을 위한 puppeteer 브라우저 생성
    const browser = await puppeteer.launch({
        headless: "new"
    });

    while (true) {  // IMAX관 시간표를 가져올 때까지 반복
        const page = await browser.newPage();   // 페이지 생성
        
        let random = (Math.random() * 20) + 30;  // 30 ~ 50 사이의 난수

        // 날짜가 변경되면 이전 함수 종료
        if (targetDate !== date) {
            await page.close();  // puppeteer 페이지 종료
            await browser.close();  // puppeteer 브라우저 종료
            return;
        }

        // 극장이 변경되면 이전 함수 종료
        if (targetTheater !== theater) {
            await page.close();  // puppeteer 페이지 종료
            await browser.close();  // puppeteer 브라우저 종료
            return;
        }

        try {
            // 탭 옵션
            const pageOption = {
                // waitUntil: 적어도 500ms 동안 두 개 이상의 네트워크 연결이 없으면 탐색이 완료된 것으로 간주합니다.
                waitUntil: 'networkidle2',
                // timeout: 20초 안에 새 탭의 주소로 이동하지 않으면 에러 발생
                timeout: 20000
            };

            await page.goto(config.urls.imax + targetDate, pageOption);   // CGV 용산아이파크몰점 예매 사이트 접속
    
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
    
                    await new Promise((page) => setTimeout(page, random * 1000));   // 안들키기 위해 랜덤값만큼 대기 (ms)
                    await page.close();  // puppeteer 페이지 종료
                    continue;
                }
    
                // 상영시간표 가져오기
                $(imax).parents('.type-hall').find('.info-timetable > ul > li').each((i, e) => {
                    let startTime = $(e).find('a').attr('data-playstarttime');  // 상영 시작 시간
                    let endTime = $(e).find('a').attr('data-playendtime');  // 상영 종료 시간
                    let seatRemainCnt = $(e).find('a').attr('data-seatremaincnt');  // 남은 좌석수
                    let link = "http://www.cgv.co.kr" + $(e).find('a').attr('href'); // 예매하는 페이지 url
    
                    // 예매 준비중이거나 마감 표시
                    if ($(e).find('a').length < 1) {
                        startTime = $(e).find('em').text();
                        seatRemainCnt = $(e).find('span').text();
                        
                        timeTable += ("\n" + startTime +
                                " | 남은 좌석수 : " + seatRemainCnt);
                    }
                    else if (seatRemainCnt == null || startTime == null) {
                        startTime = $(e).find('em').text();
                        seatRemainCnt = $(e).find('span').text();
    
                        timeTable += ("\n" + startTime +
                                " | 남은 좌석수 : " + seatRemainCnt +
                                " | [예매](" + link + ")");
                    }
                    else {
                        timeTable += ("\n" + startTime.substring(0,2) + ":" + startTime.substring(2,4) + " ~ " + 
                                endTime.substring(0,2) + ":" + endTime.substring(2,4) +
                                " | 남은 좌석수 : " + seatRemainCnt + 
                                " | [예매](" + link + ")");
                    }
                });
    
                console.log(`${playDate.substring(0,4)}년 ${playDate.substring(4,6)}월 ${playDate.substring(6,8)}일\nIMAX 오픈\n`);
                console.log(movieNm);
                console.log(timeTable);
    
                // Telegram으로 전송
                sendMsg(playDate.substring(0,4) + "년 " + playDate.substring(4,6) + "월 " +
                        playDate.substring(6,8) + "일\nIMAX 오픈\n\n" + movieNm + "\n" + timeTable);
    
                await page.close();  // puppeteer 페이지 종료
                await browser.close();  // puppeteer 브라우저 종료
                break;
            } else {
                console.log("IMAX관이 열리지 않았습니다.");
    
                await new Promise((page) => setTimeout(page, random * 1000));   // 안들키기 위해 랜덤값만큼 대기 (ms)
                await page.close();  // puppeteer 페이지 종료
            }
        } catch (err) {
            console.error(err);

            await page.close();  // puppeteer 페이지 종료
            await new Promise((page) => setTimeout(page, random * 1000));   // 안들키기 위해 랜덤값만큼 대기 (ms)
        }
    }
}

imaxCrawler(date, theater);
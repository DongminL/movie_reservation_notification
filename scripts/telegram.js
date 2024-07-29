const telegram = require("node-telegram-bot-api");
const ImaxCrawler = require('./crawlers/imaxCrawler');    // 크롤러 모듈 불러오기
const DolbyCrawler = require('./crawlers/dolbyCrawler');    // 크롤러 모듈 불러오기
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');

class TelegramBot {

    constructor() {
        // 현재 파일의 디렉토리를 기준으로 config.yaml 경로 설정
        const configPath = path.join(__dirname, '../config.yaml');

        // YAML 파일 읽기
        const config = yaml.load(fs.readFileSync(configPath, 'utf-8'));

        this.token = config.telegram.token; // Telegram Bot의 Token 값
        this.chatId = config.telegram.chatId;  // 알림 받을 텔레그램 채팅방의 ID 값
        this.bot = new telegram(this.token, { polling: true }); // telegram bot api 객체 생성
        this.date = this.today();   // 현재 크롤링하고 있는 날짜 (Default: 당일)
        this.theater = "용아맥";    // 현재 크롤링하고 있는 극장   (Default : 용산 아이파크점)
        this.crawler = new ImaxCrawler(this.date, this.theater); // 크롤링 객체 생성
    }

    /* 메시지 전송 */
    async sendMsg(msg) {
        await this.bot.sendMessage(this.chatId, msg, { parse_mode: 'Markdown' });
    }

    /* Bot 기능 설정 */
    setupBot() {
        // 명령어 목록
        this.bot.setMyCommands([
            { command: '/start', description: '알리미 시작' },
            { command: '/setdate', description: '날짜 설정 (YYYYMMDD)' },
            { command: '/settheater', description: '극장 설정 (용아맥, 남돌비, 코돌비)' }
        ]);

        // 크롤링 시작
        this.bot.onText(/\/start/, async (msg, match) => {
            const result = await this.crawler.crawl();

            this.sendMsg(result);
        });

        /* 예매할 날짜 설정 (명령어 : "/setdate yyyymmdd") */
        this.bot.onText(/\/setdate (.+)/, async (msg, match) => {
            let setDate = match[1];

            // 날짜 형식 확인 후 변경
            if (this.fnisDate(setDate)) {
                this.date = setDate;  // 크롤링 날짜 변경

                
                console.log(`변경된 날짜 : ${this.crawler.date}`);

                const result = await this.crawler.changeDate(this.date);

                this.sendMsg(result);
            }
        });
    }

    /* 변경할 극장 설정 */
    setTheater(theater) {
        if (["용아맥", "남돌비", "코돌비"].includes(theater)) {
            if (!this.crawler.isTargetTheater(theater)) {
                this.theater = theater;
                this.crawler.stopCrawler();
            } else {
                return;
            }
        } else {
            this.sendMsg("잘못된 극장 설정입니다.\n다시 입력해 주세요.");
            console.log(`잘못된 극장 설정: ${theater}`);
        }
    }

    /* 당일 날짜 */
    today() {
        const date = new Date();    // Date 객체 생성  
        let year = String(date.getFullYear());  // 년도 (yyyy)
        let month = String("0" + (date.getMonth() + 1)).slice(-2);  // 두 자리수의 월 (mm)
        let day = String("0" + date.getDate()).slice(-2);   // 두 자리수의 일 (dd)

        return year + month + day;  // yyyyymmdd 형태로 반환
    }

    /* 날짜 유효성 체크 (윤달 포함) */
    fnisDate(vDate) {
        let vValue_Num = vDate.replace(/[^0-9]/g, ""); //숫자를 제외한 나머지는 예외처리 합니다.

        // 아무것도 입력하지 않은 경우
        if (vValue_Num == "") {
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
        } else if (dtDay < 1 || dtDay > 31) {
            sendMsg("존재하지 않는 날을 입력하셨습니다.\n다시 확인 해주세요.");
            return false;
        } else if ((dtMonth == 4 || dtMonth == 6 || dtMonth == 9 || dtMonth == 11) && dtDay == 31) {
            sendMsg("존재하지 않는 날을 입력하셨습니다.\n다시 확인 해주세요.");
            return false;
        } else if (dtMonth == 2) {
            let isleap = (dtYear % 4 == 0 && (dtYear % 100 != 0 || dtYear % 400 == 0));

            if (dtDay > 29 || (dtDay == 29 && !isleap)) {
                sendMsg("존재하지 않는 날을 입력하셨습니다.\n다시 확인 해주세요.");
                return false;
            }
        }

        return true;
    }
}

module.exports = TelegramBot;
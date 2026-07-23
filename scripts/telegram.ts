import telegram from 'node-telegram-bot-api';
import Crawler from './crawlers/crawler';
import ImaxCrawler from './crawlers/imaxCrawler';
import DolbyCrawler from './crawlers/dolbyCrawler';
import ImaxWatcher from './monitors/imaxWatcher';
import { config } from './config';


class TelegramBot {

    private readonly token: string; // Telegram Bot의 Token 값
    private readonly chatId: string;    // 알림 받을 텔레그램 채팅방의 ID 값
    private bot: telegram;  // telegram bot api 객체
    private date: string;   // 현재 크롤링하고 있는 날짜 (Default: 당일)
    private theater: string;    // 현재 크롤링하고 있는 극장   (Default : 용산 아이파크점)
    private crawler: Crawler;   // 크롤링 객체
    private isCrawling: boolean;    // 현재 폴링 중 여부 (중복 /start 방지)
    private readonly imaxWatcher: ImaxWatcher;  // 날짜 무관 용산 IMAX 신규 오픈 감시 객체

    constructor() {
        this.token = config.telegram.token;
        this.chatId = config.telegram.chatId;
        this.bot = new telegram(this.token, { polling: true });
        this.date = this.today();
        this.theater = "용아맥";
        this.isCrawling = false;
        this.crawler = this.buildCrawler(this.date, this.theater);
        this.imaxWatcher = new ImaxWatcher();
        this.imaxWatcher.notify = (msg: string) => this.sendMsg(msg);

        // 텔레그램 polling 오류가 봇 프로세스를 죽이지 않도록 처리
        this.bot.on('polling_error', (err) => {
            console.error('[polling_error]', (err as Error).message ?? err);
        });
        this.bot.on('error', (err) => {
            console.error('[telegram_error]', (err as Error).message ?? err);
        });
    }

    /* 텔레그램 메시지 최대 길이 (4096자, 초과 시 400 Bad Request) */
    private static readonly MAX_MSG_LENGTH = 4000;

    /* 메시지 전송 */
    sendMsg(msg: string | null): void {
        if (!msg) {
            return;
        }

        const truncated: string = msg.length > TelegramBot.MAX_MSG_LENGTH
            ? msg.substring(0, TelegramBot.MAX_MSG_LENGTH) + '\n\n...(생략)'
            : msg;

        this.bot.sendMessage(this.chatId, truncated, { parse_mode: 'Markdown' })
            .catch((err) => console.error('[sendMessage 실패]', (err as Error).message ?? err));
    }

    /**
     * 크롤러를 생성하고 notify 콜백을 주입한다.
     * 모든 크롤러 생성 지점을 여기서 통일 관리.
     */
    private buildCrawler(date: string, theater: string): Crawler {
        const crawler: Crawler = theater === "용아맥"
            ? new ImaxCrawler(date, theater)
            : new DolbyCrawler(date, theater);

        crawler.notify = (msg: string) => this.sendMsg(msg);

        return crawler;
    }

    /* Bot 기능 설정 */
    setupBot(): void {
        // 명령어 목록
        this.bot.setMyCommands([
            { command: '/start', description: '알리미 시작' },
            { command: '/stop', description: '알림 대기 중단' },
            { command: '/setdate', description: '날짜 설정 (YYYYMMDD)' },
            { command: '/settheater', description: '극장 설정 (용아맥, 남돌비, 코돌비)' },
            { command: '/watchimax', description: '날짜 무관 용산 IMAX 신규 오픈 감시 시작' },
            { command: '/unwatch', description: '용산 IMAX 신규 오픈 감시 중단' }
        ]);

        // 크롤링 시작
        this.bot.onText(/\/start/, async (msg, match) => {
            // 이미 폴링 중이면 중복 실행 방지
            if (this.isCrawling) {
                this.sendMsg("이미 알림 대기 중입니다.\n/stop 으로 중단할 수 있어요.");
                return;
            }

            const formattedDate = `${this.date.substring(0, 4)}년 ${this.date.substring(4, 6)}월 ${this.date.substring(6, 8)}`;
            this.sendMsg(`${this.theater}의 ${formattedDate}일자 상영 정보를 가져오는 중입니다...\n(1분 이상 지연되면 아직 상영 정보가 오픈되지 않은 것입니다!)`);

            this.isCrawling = true;
            try {
                const result: string = await this.crawler.crawl();

                // 빈 문자열은 /stop 으로 중단된 것 — 결과 메시지를 보내지 않음
                if (result) {
                    this.sendMsg(result);
                }
            } catch (err) {
                console.error('[crawl 예외]', err);
                this.sendMsg("크롤링 중 예기치 않은 오류가 발생했습니다. 다시 /start 해보세요.");
            } finally {
                this.isCrawling = false;
            }
        });

        /* 알림 대기 중단 (명령어 : "/stop") */
        this.bot.onText(/\/stop/, (msg) => {
            if (this.isCrawling) {
                this.crawler.stopCrawler();
                this.sendMsg("알림 대기를 중단했습니다.");
            } else {
                this.sendMsg("현재 대기 중인 알림이 없습니다.");
            }
        });

        /* 예매할 날짜 설정 (명령어 : "/setdate yyyymmdd") */
        this.bot.onText(/\/setdate (.+)/, async (msg, match) => {
            if (match) {
                let setDate: string | null = match[1].trim(); // 입력값 가져오기

                // 날짜 형식 확인 후 변경
                if (this.isValidDate(setDate)) {
                    if (this.crawler.changeDate(setDate)) {
                        this.date = setDate;  // 크롤링 날짜 변경
                        console.log(`변경된 날짜 : ${setDate}`);

                        this.crawler = this.buildCrawler(setDate, this.theater);

                        this.sendMsg(`변경된 날짜 : ${setDate}\n/start 명령으로 알림을 받아보세요!`);
                    } else {
                        this.sendMsg("이미 설정된 날짜입니다.");
                    }
                }
            }
        });

        /* 예매할 극장 설정 (명령어 : "/settheater 용아맥 OR 남돌비 OR 코돌비") */
        this.bot.onText(/\/settheater (.+)/, async (msg, match) => {
            if (match) {
                let setTheater: string = match[1].trim();  // 입력값 가져오기

                // 입력된 극장 확인 후 변경
                if (this.isValidTheater(setTheater)) {
                    if (this.crawler.changeTheater(setTheater)) {
                        this.theater = setTheater;  // 크롤링 극장 변경
                        console.log(`변경된 극장 : ${setTheater}`);

                        this.crawler = this.buildCrawler(this.date, setTheater);

                        this.sendMsg(`변경된 극장 : ${setTheater}\n/start 명령으로 알림을 받아보세요!`);
                    } else {
                        this.sendMsg("이미 설정된 극장입니다.");
                    }
                } else {
                    this.sendMsg("잘못된 극장 설정입니다.\n다시 입력해 주세요.");
                }
            }
        });

        /* 날짜 무관 용산 IMAX 신규 오픈 감시 시작 (명령어 : "/watchimax") */
        this.bot.onText(/\/watchimax/, async (msg, match) => {
            if (this.imaxWatcher.isRunning()) {
                this.sendMsg("이미 용산 IMAX 감시 중입니다.\n/unwatch 으로 중단할 수 있어요.");
                return;
            }

            this.sendMsg("용산 IMAX 신규 오픈 감시를 시작합니다...\n(날짜와 무관하게 새 회차가 열리면 알려드려요)");

            this.imaxWatcher.start()
                .catch((err) => {
                    console.error('[watchimax 예외]', err);
                    this.sendMsg("IMAX 감시 중 예기치 않은 오류로 중단되었습니다. 다시 /watchimax 해보세요.");
                });
        });

        /* 용산 IMAX 신규 오픈 감시 중단 (명령어 : "/unwatch") */
        this.bot.onText(/\/unwatch/, (msg) => {
            if (this.imaxWatcher.isRunning()) {
                this.imaxWatcher.stop();
                this.sendMsg("용산 IMAX 감시를 중단했습니다.");
            } else {
                this.sendMsg("현재 진행 중인 IMAX 감시가 없습니다.");
            }
        });
    }

    /* 당일 날짜 */
    today(): string {
        const date: Date = new Date();    // Date 객체 생성
        let year: string = String(date.getFullYear());  // 년도 (yyyy)
        let month: string = String("0" + (date.getMonth() + 1)).slice(-2);  // 두 자리수의 월 (mm)
        let day: string = String("0" + date.getDate()).slice(-2);   // 두 자리수의 일 (dd)

        return year + month + day;  // yyyyymmdd 형태로 반환
    }

    /* 날짜 유효성 체크 (윤달 포함) */
    isValidDate(date: string): boolean {
        let vValue_Num: string = date.replace(/[^0-9]/g, ""); //숫자를 제외한 나머지는 예외처리 합니다.

        // 아무것도 입력하지 않은 경우
        if (vValue_Num == "") {
            this.sendMsg("날짜를 입력해 주세요.");
            return false;
        }

        //8자리가 아닌 경우 false
        if (vValue_Num.length != 8) {
            this.sendMsg("날짜를 yyyymmdd 형식으로 입력해 주세요.");
            return false;
        }

        //8자리의 yyyymmdd를 원본 , 4자리 , 2자리 , 2자리로 변경해 주기 위한 패턴생성을 합니다.
        let rxDatePattern: RegExp = /^(\d{4})(\d{1,2})(\d{1,2})$/;
        let dtArray: RegExpMatchArray | null = vValue_Num.match(rxDatePattern);

        if (dtArray == null) {
            return false;
        }

        //0번째는 원본 , 1번째는 yyyy(년) , 2번재는 mm(월) , 3번재는 dd(일) 입니다.
        let dtYear: number = parseInt(dtArray[1]);
        let dtMonth: number = parseInt(dtArray[2]);
        let dtDay: number = parseInt(dtArray[3]);

        //yyyymmdd 체크
        if (dtMonth < 1 || dtMonth > 12) {
            this.sendMsg("존재하지 않는 달을 입력하셨습니다.\n다시 확인 해주세요.");
            return false;

        } else if (dtDay < 1 || dtDay > 31) {
            this.sendMsg("존재하지 않는 날을 입력하셨습니다.\n다시 확인 해주세요.");
            return false;

        } else if ((dtMonth == 4 || dtMonth == 6 || dtMonth == 9 || dtMonth == 11) && dtDay == 31) {
            this.sendMsg("존재하지 않는 날을 입력하셨습니다.\n다시 확인 해주세요.");
            return false;

        } else if (dtMonth == 2) {
            let isleap = (dtYear % 4 == 0 && (dtYear % 100 != 0 || dtYear % 400 == 0));

            if (dtDay > 29 || (dtDay == 29 && !isleap)) {
                this.sendMsg("존재하지 않는 날을 입력하셨습니다.\n다시 확인 해주세요.");
                return false;
            }
        }

        return true;
    }

    /* 극장 유효성 체크 */
    isValidTheater(theater: string): boolean {
        return ["용아맥", "남돌비", "코돌비"].includes(theater);
    }
}

export default TelegramBot;

import { Browser, Page } from 'puppeteer';
import {config, CrawlConfig} from '../config';

const ERROR_NOTIFY_THRESHOLD = 5; // 연속 오류 알림 임계치

class Crawler {

    protected readonly config: CrawlConfig; // YAML 파일 읽어오는 객체
    protected date: string; // 날짜
    protected theater: string;  // 극장
    protected browser: Browser | null;  // puppeteer의 browser
    protected isStop: boolean;  // 크롤링 멈추는 여부

    /* 텔레그램으로 사용자에게 알릴 때 호출되는 콜백 (telegram.ts에서 주입) */
    notify?: (msg: string) => void;

    private consecutiveErrors: number = 0;  // 연속 오류 횟수

    constructor(date: string, theater: string) {
        this.config = config;
        this.date = date;
        this.theater = theater;
        this.browser = null;
        this.isStop = false;
    }

    /* 날짜 변경 */
    changeDate(targetDate: string): boolean {
        if (!this.isTargetDate(targetDate)) {
            this.date = targetDate;

            this.stopCrawler();

            return true;
        }

        return false;
    }

    /* 극장 변경 */
    changeTheater(targetTheater: string): boolean {
        if (!this.isTargetTheater(targetTheater)) {
            this.theater = targetTheater;

            this.stopCrawler();

            return true;
        }

        return false;
    }

    /* 크롤러 중단 */
    stopCrawler(): void {
        this.isStop = true;
        console.log("크롤러 중지");
    }

    // 현재 설정된 날짜와 수정하려는 날짜 비교
    isTargetDate(targetDate: string): boolean {
        return targetDate === this.date;
    }

    // 현재 설정된 극장과 수정하려는 극장 비교
    isTargetTheater(targetTheater: string): boolean {
        return targetTheater === this.theater;
    }

    /* 크롤링을 안 들키기 위해 랜덤 값만큼 대기 (ms) */
    async trick(): Promise<void> {
        let random = (Math.random() * 20) + 30;  // 30 ~ 50 사이의 난수
        await new Promise(page => setTimeout(page, random * 1000));   // 안들키기 위해 랜덤값만큼 대기 (ms)
    }

    /**
     * 페이지 또는 브라우저를 안전하게 닫는다.
     * 이미 닫혔거나 예외가 발생해도 무시하고 진행.
     */
    protected async closeQuietly(target: Page | Browser | null | undefined): Promise<void> {
        if (!target) return;
        try {
            await target.close();
        } catch (e) {
            // 이미 닫혔거나 실패해도 무시
        }
    }

    /**
     * 정상 동작(아직 안 열림) 분기에서 호출 — 연속 오류 카운터 리셋.
     * 사이트 자체는 정상 응답 중이므로 카운터를 0으로 되돌린다.
     */
    protected resetErrorCount(): void {
        this.consecutiveErrors = 0;
    }

    /**
     * catch 블록에서 호출 — 연속 오류 카운터를 증가시키고,
     * 임계치 도달 시 사용자에게 알림을 보낸다 (폴링은 유지).
     */
    protected handleError(err: unknown): void {
        console.error(err);
        this.consecutiveErrors++;
        if (this.consecutiveErrors >= ERROR_NOTIFY_THRESHOLD) {
            this.notify?.(
                "상영 정보를 가져오는 중 오류가 반복되고 있습니다.\n"
                + "사이트 구조가 바뀌었을 수 있습니다.\n"
                + "폴링은 계속되므로, 해결되면 자동으로 시간표를 받으실 수 있습니다."
            );
            this.consecutiveErrors = 0;
        }
    }

    /* 상영관 시간표 웹 크롤링 */
    async crawl(): Promise<string> {
        throw new Error("구현 필수");
    }
}

export default Crawler;

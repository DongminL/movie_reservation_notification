import { Browser } from 'puppeteer';
import {config, CrawlConfig} from '../config';

class Crawler {
    protected readonly config: CrawlConfig;
    protected date: string;
    protected theater: string;
    protected browser: Browser | null;
    protected isStop: boolean;

    constructor(date: string, theater: string) {
        this.config = config;
        this.date = date;   // 날짜
        this.theater = theater; // 극장
        this.browser = null;    // puppeteer의 browser
        this.isStop = false;  // 크롤링 멈추는 여부
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

    /* 상영관 시간표 웹 크롤링 */
    async crawl(): Promise<string> {
        throw new Error("구현 필수");
    }
}

export default Crawler;
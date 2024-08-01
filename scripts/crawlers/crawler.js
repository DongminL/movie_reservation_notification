import path from 'path';
import yaml from 'js-yaml';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Crawler {

    constructor(date, theater) {
        // 현재 파일의 디렉토리를 기준으로 config.yaml 경로 설정
        const configPath = path.join(__dirname, '../../config.yaml');

        this.config = yaml.load(fs.readFileSync(configPath, 'utf-8'));    // YAML 파일 읽기
        this.date = date;   // 날짜
        this.theater = theater; // 극장
        this.browser = null;    // puppeteer의 browser
        this.isStop = false;  // 크롤링 멈추는 여부
    }

    /* 날짜 변경 */
    changeDate(targetDate) {
        if (!this.isTargetDate(targetDate)) {
            this.date = targetDate;

            this.stopCrawler();

            return true;
        }

        return false;
    }

    /* 극장 변경 */
    changeTheater(targetTheater) {
        if (!this.isTargetTheater(targetTheater)) {
            this.theater = targetTheater;

            this.stopCrawler();

            return true;
        }

        return false;
    }

    /* 크롤러 중단 */
    stopCrawler() {
        this.isStop = true;
        console.log("크롤러 중지");
    }

    // 현재 설정된 날짜와 수정하려는 날짜 비교
    isTargetDate(targetDate) {
        return targetDate === this.date;
    }

    // 현재 설정된 극장과 수정하려는 극장 비교
    isTargetTheater(targetTheater) {
        return targetTheater === this.theater;
    }

    /* 크롤링을 안 들키기 위해 랜덤 값만큼 대기 (ms) */
    async trick() {
        let random = (Math.random() * 20) + 30;  // 30 ~ 50 사이의 난수
        await new Promise((page) => setTimeout(page, random * 1000));   // 안들키기 위해 랜덤값만큼 대기 (ms)
    }

    /* 상영관 시간표 웹 크롤링 */
    async crawl() {
        throw new Error("구현 필수");
    }
}

export default Crawler;
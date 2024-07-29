const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');

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
    changeDate(date) {
        this.date = date;

        this.stopCrawler();

        // 크롤링 재시작
        this.isStop = false;
        return this.crawl();
    }

    /* 극장 변경 */
    changeTheater(theater) {
        this.theater = theater;

        this.stopCrawler();
    }

    /* 크롤러 중단 */
    stopCrawler() {
        this.isStop = true;
        if (this.browser != null) {
            this.browser.close();
        }
    }

    /* 크롤링 중인 극장명 가져오기 */
    getTheater() {
        return this.theater;
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
    trick() {
        let random = (Math.random() * 20) + 30;  // 30 ~ 50 사이의 난수
        new Promise((page) => setTimeout(page, random * 1000));   // 안들키기 위해 랜덤값만큼 대기 (ms)
    }

    /* 상영관 시간표 웹 크롤링 */
    async crawl() {
        throw new Error("구현 필수");
    }
}

module.exports = Crawler;
import fs from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { config } from '../config';
import CgvScheduleFetcher, { filterImax, Screening } from '../api/cgvScheduleFetcher';
import MovieTime from '../crawlers/movieTime';

const WATCH_THEATER = '용산아이파크몰';

/* API의 원시 HHMM 문자열("2000")을 imaxCrawler와 동일한 HH:MM 표기로 변환 */
const formatTime = (raw: string): string =>
    raw.length === 4 ? `${raw.substring(0, 2)}:${raw.substring(2, 4)}` : raw;

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = dirname(__filename);
const SNAPSHOT_PATH: string = join(__dirname, '../../data/imax-snapshot.json');
const ERROR_NOTIFY_THRESHOLD = 5; // 연속 오류 알림 임계치 (crawler.ts와 동일 기준)

type Snapshot = Record<string, string[]>; // scnYmd -> ["scnYmd|scnsNo|scnSseq", ...]

const buildKey = (s: Screening): string => `${s.scnYmd}|${s.scnsNo}|${s.scnSseq}`;

/*
 * 날짜 상관없이 용산 IMAX의 신규 오픈/회차 추가를 감지하는 감시자.
 * horizonDays 만큼의 날짜를 매 사이클마다 조회해 이전 스냅샷과 diff한다.
 */
class ImaxWatcher {

    /* 텔레그램으로 알릴 때 호출되는 콜백 (telegram.ts에서 주입) */
    notify?: (msg: string) => void;

    private isStop: boolean = true;
    private previousSnapshot: Snapshot = {};
    private isColdStart: boolean = true;
    private consecutiveErrors: number = 0;
    private readonly fetcher: CgvScheduleFetcher = new CgvScheduleFetcher();

    /* 감시 루프 시작. stop()이 호출될 때까지 반환하지 않는다 */
    async start(): Promise<void> {
        this.isStop = false;
        this.loadSnapshot();

        while (!this.isStop) {
            try {
                await this.runCycle();
                this.consecutiveErrors = 0;
            } catch (err) {
                console.error('[ImaxWatcher] 사이클 오류', err);
                this.consecutiveErrors++;
                if (this.consecutiveErrors >= ERROR_NOTIFY_THRESHOLD) {
                    this.notify?.('IMAX 감시 중 오류가 반복되고 있습니다. 감시는 계속됩니다.');
                    this.consecutiveErrors = 0;
                }
            }

            if (this.isStop) {
                break;
            }

            await this.trick(config.watch.pollIntervalSec - 5, config.watch.pollIntervalSec + 5);
        }
    }

    /* 감시 루프 중단 */
    stop(): void {
        this.isStop = true;
        console.log('[ImaxWatcher] 감시 중지');
    }

    isRunning(): boolean {
        return !this.isStop;
    }

    /*
     * 오늘부터 horizonDays 만큼 조회. 날짜별로 조회 즉시 이전 스냅샷과 diff해서
     * 신규 발견 시 그 날짜 하나만 담아 바로 알린다 (한 사이클 전체를 모아 보내면
     * 텔레그램 메시지 길이 제한(4096자)에 걸릴 수 있어 날짜 단위로 쪼갬).
     */
    private async runCycle(): Promise<void> {
        const dates = this.buildDateRange();
        const currentSnapshot: Snapshot = {};
        let coldStartTotal = 0;
        let notifiedCount = 0;

        let interrupted = false;

        console.log(`[ImaxWatcher] 사이클 시작 (${dates.length}일치 조회)`);
        const cycleStartedAt = Date.now();

        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];

            if (this.isStop) {
                interrupted = true;
                break;
            }

            let screenings: Screening[];
            try {
                screenings = filterImax(await this.fetcher.fetchScreenings(date));
            } catch (err) {
                console.error(`[ImaxWatcher] ${date} 조회 실패, 건너뜀`, err);
                await this.trick(1, 2);
                continue;
            }

            const keys = screenings.map(buildKey);
            currentSnapshot[date] = keys;

            if (this.isColdStart) {
                coldStartTotal += keys.length;
            } else {
                const prevKeys = this.previousSnapshot[date];
                const newScreenings = screenings.filter(
                    s => !prevKeys || !prevKeys.includes(buildKey(s))
                );

                if (newScreenings.length > 0) {
                    console.log(`[ImaxWatcher] ${date} 신규 ${newScreenings.length}건 발견 — 알림 전송`);
                    this.notify?.(this.buildMessage(date, newScreenings));
                    notifiedCount += newScreenings.length;
                }
            }

            console.log(`[ImaxWatcher] (${i + 1}/${dates.length}) ${date} IMAX ${screenings.length}건`);

            await this.trick(1, 2);
        }

        console.log(`[ImaxWatcher] 사이클 종료 (${Math.round((Date.now() - cycleStartedAt) / 1000)}초 소요)`);

        if (interrupted) {
            return; // 중단 시 이번 사이클 결과는 버리고 스냅샷도 갱신하지 않음
        }

        // 이번 사이클에 조회 실패한 날짜는 currentSnapshot에 없음 — 그대로 교체하면
        // 그 날짜의 기존 상태가 유실되어 다음에 성공했을 때 전부 "신규"로 오인될 수 있으므로,
        // 실패한 날짜는 이전 스냅샷 값을 그대로 보존한다(스프레드 덮어쓰기로 자동 처리됨).
        const mergedSnapshot: Snapshot = { ...this.previousSnapshot, ...currentSnapshot };
        const changed = JSON.stringify(mergedSnapshot) !== JSON.stringify(this.previousSnapshot);

        this.previousSnapshot = mergedSnapshot;
        if (changed) {
            this.saveSnapshot(mergedSnapshot);
        }

        if (this.isColdStart) {
            this.isColdStart = false;
            this.notify?.(
                `용산 IMAX 감시를 시작했습니다.\n` +
                `현재 예정된 IMAX 상영: ${coldStartTotal}건\n` +
                `앞으로 새로 열리는 상영만 알려드립니다.`
            );
        } else if (notifiedCount === 0) {
            console.log('[ImaxWatcher] 신규 상영 없음 — 알림 없이 대기 (정상 동작)');
        }
    }

    /* 오늘부터 horizonDays 만큼의 YYYYMMDD 목록 */
    private buildDateRange(): string[] {
        const dates: string[] = [];
        const today = new Date();

        for (let i = 0; i < config.watch.horizonDays; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);

            const year = String(d.getFullYear());
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');

            dates.push(`${year}${month}${day}`);
        }

        return dates;
    }

    /*
     * 날짜 하나에 대한 신규 상영 알림 메시지
     */
    private buildMessage(date: string, added: Screening[]): string {
        const movieTimeMap: Map<string, MovieTime[]> = new Map();

        for (const s of [...added].sort((a, b) => a.scnsrtTm.localeCompare(b.scnsrtTm))) {
            if (!movieTimeMap.has(s.movNm)) {
                movieTimeMap.set(s.movNm, []);
            }
            movieTimeMap.get(s.movNm)?.push(new MovieTime({
                screenType: s.scnsEnm,
                movie: s.movNm,
                seatInfo: s.seatInfo,
                startTime: formatTime(s.scnsrtTm),
                endTime: formatTime(s.scnendTm),
            }));
        }

        let body: string = MovieTime.toString(movieTimeMap, WATCH_THEATER, date);
        body += `[예매하러 가기](https://cgv.co.kr/cnm/movieBook/cinema?siteNo=0013&siteNm=${WATCH_THEATER}&scnYmd=${date})\n`;

        return body;
    }

    private loadSnapshot(): void {
        if (!fs.existsSync(SNAPSHOT_PATH)) {
            this.previousSnapshot = {};
            this.isColdStart = true;
            return;
        }

        try {
            this.previousSnapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
            this.isColdStart = false;
        } catch (err) {
            console.error('[ImaxWatcher] 스냅샷 로드 실패, 콜드 스타트로 진행', err);
            this.previousSnapshot = {};
            this.isColdStart = true;
        }
    }

    private saveSnapshot(snapshot: Snapshot): void {
        const dir: string = dirname(SNAPSHOT_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
    }

    /* minSec ~ maxSec 사이 랜덤 지연 */
    private async trick(minSec: number, maxSec: number): Promise<void> {
        const randomSec = minSec + Math.random() * (maxSec - minSec);
        await this.sleep(randomSec * 1000);
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default ImaxWatcher;

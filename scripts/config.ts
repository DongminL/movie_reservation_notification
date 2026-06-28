import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import fs from 'fs';

/* config.yaml 파일 구조 */
interface CrawlConfig {

    telegram: {
      token: string;
      chatId: string;
    },

    urls: {
      imax: string;
      dolby: string;
    }
}

/* 현재 모듈의 파일 경로를 가져옵니다. */
const __filename: string = fileURLToPath(import.meta.url);

/* 파일 경로를 이용해 디렉토리 경로를 가져옵니다. */
const __dirname: string = dirname(__filename);

/* 현재 파일의 디렉토리를 기준으로 config.yaml 경로 설정 */
const configPath: string = join(__dirname, '../config.yaml');

/* config.yaml 파일이 존재하는지 먼저 확인 */
if (!fs.existsSync(configPath)) {
    throw new Error('config.yaml 파일이 없습니다.');
}

/* YAML 파일 읽기, Unknown 타입을 CrawlConfig 타입으로 간주 */
const config: CrawlConfig = yaml.load(fs.readFileSync(configPath, 'utf-8')) as unknown as CrawlConfig;

/* 필수 설정값 검증 */
const missingKeys: string[] = [];
if (!config?.telegram?.token) missingKeys.push('telegram.token');
if (!config?.telegram?.chatId) missingKeys.push('telegram.chatId');
if (!config?.urls?.imax)       missingKeys.push('urls.imax');
if (!config?.urls?.dolby)      missingKeys.push('urls.dolby');

if (missingKeys.length > 0) {
    throw new Error(
        `config.yaml에 다음 필수 값이 누락되어 있습니다: ${missingKeys.join(', ')}\n` +
        `config.example.yaml을 참고해 올바르게 작성했는지 확인해 주세요.\n` +
        `(README.md → 실행 방법 3번 절차 참고)`
    );
}

export {config, CrawlConfig};

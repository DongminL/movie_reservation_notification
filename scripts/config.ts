import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import fs from 'fs';

/* cofing.yaml 파일 구조 */
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
const __filename = fileURLToPath(import.meta.url);

/* 파일 경로를 이용해 디렉토리 경로를 가져옵니다. */
const __dirname = dirname(__filename);

/* 현재 파일의 디렉토리를 기준으로 config.yaml 경로 설정 */
const configPath: string = join(__dirname, '../config.yaml');

/* YAML 파일 읽기, Unknown 타입을 CrawlConfig 타입으로 간주 */
const config: CrawlConfig = yaml.load(fs.readFileSync(configPath, 'utf-8')) as unknown as CrawlConfig;

export {config, CrawlConfig};
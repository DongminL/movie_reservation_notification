/* 클라우드 VM 환경에서 Puppeteer 실행에 필요한 공통 launch args */
const CLOUD_SANDBOX_ARGS: string[] = [
    '--no-sandbox',                            // 클라우드 VM에서 SUID 샌드박스 권한 없어 필요
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',                 // 저메모리 VM /dev/shm 부족 방지
];

export { CLOUD_SANDBOX_ARGS };

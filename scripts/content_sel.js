const {Builder, By, Key, until} = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

(async function crawler() {
    // headless로 크롬 드라이버 실행
    let driver = await new Builder()
    .forBrowser('chrome')    
    .setChromeOptions(new chrome.Options().headless())
    .build();

    try {
        await driver.get('http://www.cgv.co.kr/theaters/?areacode=01&theaterCode=0013&date=20230715');

        const ifrm = await driver.findElement(By.id('ifrm_movie_time_table'));
        await driver.switchTo().frame(ifrm);

        const movies = await driver.findElements(By.css('div.col-times'));
        console.log('movie count :', movies.length);

        const imax = await driver.findElements(By.css('span.imax'));
        
        for (let i = 0; i < imax.length; i++) {
            console.log(await imax[i].findElement(By.xpath('../../../../../../div[@class="info-movie"]/a/strong')).getText());
        }
    } catch (err) {
        console.error(err);
    }
    finally{
        // 종료한다.
        driver.quit();
    }
}) ();
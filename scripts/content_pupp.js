const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

function today() {
    const date = new Date();
    let year = String(date.getFullYear());
    let month = String("0" + (date.getMonth() + 1)).slice(-2);
    let day = String("0" + date.getDate()).slice(-2);

    return year + month + day;
}

(async function crawler() {
    try {
        const browser = await puppeteer.launch({
            headless: "new"
        });
        const page = await browser.newPage();
        await page.goto("http://www.cgv.co.kr/theaters/?areacode=01&theaterCode=0013&date=20230715");

        const ifrmHandle = await page.$('iframe[id="ifrm_movie_time_table"]');
        const ifrm = await ifrmHandle.contentFrame();

        const content = await ifrm.content();
        const $ = cheerio.load(content);
        
        const imax = $('span.imax');
        console.log(imax.length)

        if (imax.length > 0) {
            console.log("IMAX관 오픈");
            console.log($(imax).parents('.col-times').find('.info-movie > a > strong').text().trim());
            $(imax).parents('.type-hall').find('.info-timetable > ul > li').each((i, e) => {
                console.log($(e).text() + " " + $(e).children('a').attr('data-playymd'));
            });
        }
        else {
            console.log("IMAX관이 열리지 않았습니다.");
        }


        await browser.close();
    } catch (err) {
        console.error(err);
    }
}) ();
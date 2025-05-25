# 영화 예매 오픈 알리미

## 기술 스택

[![My Skills](https://skillicons.dev/icons?i=js,ts,nodejs)](https://skillicons.dev)

### 사용한 라이브러리

- **Puppeteer**(동적 크롤링)

- **Cheerio**(웹 스크랩핑)

- **node-telegram-bot-api**(텔레그램 봇 연동)

## 실행 방법

1. 원하는 경로에서 `git clone` 하기

2. 텔레그램 봇 생성 및 Token, Chat ID 확인하기 ([참고](https://gabrielkim.tistory.com/entry/Telegram-Bot-Token-%EB%B0%8F-Chat-Id-%EC%96%BB%EA%B8%B0))

3. 프로젝트 root 위치에 `config.yaml` 파일 생성


    3-1. 아래 내용대로 구성하기
    ``` yaml
    telegram:
        token:    # 2번에서 확인한 Telegram Bot Token 값 넣어주기
        chatId:   # 2번에서 확인한 Chat ID 값 넣어주기

    urls:
        imax: http://www.cgv.co.kr/theaters/?areacode=01&theaterCode=0013&date= # CGV 용산아이파크몰 시간표 URL
        dolby: https://www.megabox.co.kr/booking/timetable  # 메가박스 시간표 URL
    ```

4. `npm start`로 알리미 실행하기

<br>

## 프로젝트 시연 영상
[시연 영상](https://youtu.be/5w1zwWe8SxQ)

<br>

## 텔레그램 명령어

### 크롤링 시작 : /start 
---

<image src="https://github.com/user-attachments/assets/22aa00b2-aca0-4dcc-8488-6bd73e0d9e50" width="50%" height="50%">

### 날짜 설정 : /setdate {yyyymmdd} (기본값 : 실행한 당일날짜)
---

<image src="https://github.com/user-attachments/assets/424e27e7-b8b0-4ad1-af54-ef9552d51dc4" width="50%" height="50%">

### 극장 설정 : /settheater {용아맥 or 코돌비 or 남돌비}
---

>- 용아맥 : CGV 용산 아이파크몰점 아이맥스  (기본값)
>
>- 코돌비 : MEGABOX 코엑스점 돌비 시네마
>
>- 남돌비 : MEGABOX 남양주 현대아울렛 스페이스원점 돌비 시네마 

<image src="https://github.com/user-attachments/assets/b5f44ece-e60c-48d5-82f8-72363257ed96" width="50%" height="50%">
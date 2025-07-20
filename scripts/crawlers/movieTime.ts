interface MovieTimeOption {
    startTime: string;
    endTime: string;
    movie: string;
    screenType: string;
    seatInfo: string;
}

class MovieTime {

    private _startTime: string;
    private _endTime: string;
    private _movie: string;
    private _screenType: string;
    private _seatInfo: string;

    constructor(
        {startTime, endTime, movie, screenType, seatInfo}: MovieTimeOption
    ) {
        this._startTime = startTime;
        this._endTime = endTime;
        this._movie = movie;
        this._screenType = screenType;
        this._seatInfo = seatInfo;
    }

    static toString(
        movieTimeMap: Map<string, MovieTime[]>, 
        targetTheater: string, date: string
    ): string {
        if (date.length != 8) {
            throw new Error("date의 형식은 20250101 이어야 합니다.");
        }

        let result: string = ""; // 상영 시간표 및 남은 좌석수
                    
        movieTimeMap.forEach((timeList, movie) => {
            // 영화관 지점 및 날짜
            result += (
                `CGV ${targetTheater} 상영 시간표\n` + 
                `${date.substring(0, 4)}년 ${date.substring(4, 6)}월 ${date.substring(6, 8)}일\n` +
                "IMAX 오픈\n\n"
            );

            // 영화 제목 
            result += (`${movie}\n`);

            // 시간 및 좌석수 정보
            timeList.forEach((time) => {
                result += (`${time.startTime} ~ ${time.endTime} | 좌석수: ${time.seatInfo}\n`)
            });
        });

        return result;
    }

    get startTime(): string {
        return this._startTime;
    }
    get endTime(): string {
        return this._endTime;
    }
    get movie(): string {
        return this._movie;
    }
    get screenType(): string {
        return this._screenType;
    }
    get seatInfo(): string {
        return this._seatInfo;
    }
}

export default MovieTime;
# 라인전 지표 검증

현재 Challenge Config의 7분/14분 골드·XP 20% 조건과 Match-V5 필드 사이의 관계를 실측 대조했다. 같은 포지션 상대를 임시 매칭하고 가까운 Timeline 프레임으로 계산한 가설 검증이며, Riot 내부 알고리즘의 완전 재현은 아니다.

- 7분: 25개 중 25개 일치, 0개 불일치.
- 14분: 25개 중 24개 일치, 1개 불일치.

| 선수 | 경기 | 포지션 | 분 | 실제 ms | API 값 | 직접 계산 조건 | 일치 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Faker | KR_8421752997 | MIDDLE | 7 | 420159 | 0 | False | True |
| Faker | KR_8421721409 | MIDDLE | 7 | 420150 | 0 | False | True |
| Chovy | KR_8420448348 | UTILITY | 7 | 420204 | 0 | False | True |
| Chovy | KR_8419523152 | TOP | 7 | 420210 | 1 | True | True |
| Chovy | KR_8419501041 | MIDDLE | 7 | 420204 | 0 | False | True |
| Keria | KR_8421640437 | TOP | 7 | 420154 | 0 | False | True |
| Keria | KR_8420505385 | TOP | 7 | 420168 | 1 | True | True |
| Gumayusi | KR_8422737101 | BOTTOM | 7 | 420229 | 0 | False | True |
| Gumayusi | KR_8422675615 | BOTTOM | 7 | 420169 | 0 | False | True |
| Zeus | KR_8422343743 | TOP | 7 | 420151 | 0 | False | True |
| Zeus | KR_8421674902 | TOP | 7 | 420167 | 0 | False | True |
| Zeus | KR_8421327840 | TOP | 7 | 420221 | 0 | False | True |
| Kiin | KR_8421327840 | UTILITY | 7 | 420221 | 0 | False | True |
| Kiin | KR_8420474016 | UTILITY | 7 | 420191 | 0 | False | True |
| Kiin | KR_8419523152 | TOP | 7 | 420210 | 0 | False | True |
| ShowMaker | KR_8419501041 | TOP | 7 | 420204 | 0 | False | True |
| ShowMaker | KR_8419173644 | MIDDLE | 7 | 420234 | 0 | False | True |
| Oner | KR_8421752997 | JUNGLE | 7 | 420159 | 0 | False | True |
| Oner | KR_8421611354 | BOTTOM | 7 | 420159 | 1 | True | True |
| Oner | KR_8420534543 | BOTTOM | 7 | 420181 | 0 | False | True |
| Doran | KR_8422700463 | TOP | 7 | 420185 | 1 | True | True |
| Doran | KR_8422666206 | TOP | 7 | 420173 | 0 | False | True |
| Doran | KR_8420262535 | TOP | 7 | 420146 | 0 | False | True |
| Ruler | KR_8420262535 | BOTTOM | 7 | 420146 | 1 | True | True |
| Ruler | KR_8420188756 | BOTTOM | 7 | 420115 | 0 | False | True |
| Faker | KR_8421752997 | MIDDLE | 14 | 840295 | 0 | False | True |
| Faker | KR_8421721409 | MIDDLE | 14 | 840298 | 0 | False | True |
| Chovy | KR_8420448348 | UTILITY | 14 | 840328 | 1 | True | True |
| Chovy | KR_8419523152 | TOP | 14 | 840298 | 0 | False | True |
| Chovy | KR_8419501041 | MIDDLE | 14 | 840342 | 0 | False | True |
| Keria | KR_8421640437 | TOP | 14 | 840300 | 0 | False | True |
| Keria | KR_8420505385 | TOP | 14 | 840246 | 0 | False | True |
| Gumayusi | KR_8422737101 | BOTTOM | 14 | 840326 | 0 | False | True |
| Gumayusi | KR_8422675615 | BOTTOM | 14 | 840314 | 0 | False | True |
| Zeus | KR_8422343743 | TOP | 14 | 840256 | 1 | True | True |
| Zeus | KR_8421674902 | TOP | 14 | 840319 | 0 | False | True |
| Zeus | KR_8421327840 | TOP | 14 | 840321 | 0 | False | True |
| Kiin | KR_8421327840 | UTILITY | 14 | 840321 | 0 | False | True |
| Kiin | KR_8420474016 | UTILITY | 14 | 840289 | 0 | False | True |
| Kiin | KR_8419523152 | TOP | 14 | 840298 | 0 | False | True |
| ShowMaker | KR_8419501041 | TOP | 14 | 840342 | 1 | True | True |
| ShowMaker | KR_8419173644 | MIDDLE | 14 | 840346 | 0 | False | True |
| Oner | KR_8421752997 | JUNGLE | 14 | 840295 | 0 | False | True |
| Oner | KR_8421611354 | BOTTOM | 14 | 840255 | 0 | False | True |
| Oner | KR_8420534543 | BOTTOM | 14 | 840334 | 0 | False | True |
| Doran | KR_8422700463 | TOP | 14 | 840360 | 1 | True | True |
| Doran | KR_8422666206 | TOP | 14 | 840305 | 0 | False | True |
| Doran | KR_8420262535 | TOP | 14 | 840270 | 1 | True | True |
| Ruler | KR_8420262535 | BOTTOM | 14 | 840270 | 0 | False | True |
| Ruler | KR_8420188756 | BOTTOM | 14 | 840308 | 0 | True | False |

## 불일치 사례

Ruler / KR_8420188756 / BOTTOM: 14분 API 값은 0. Timeline 840,308ms에서는 본인 골드 6,826, 상대 골드 5,659, 본인 XP 5,846, 상대 XP 4,330으로 계산 조건은 true다. 표본 시각은 정확한 840,000ms와 308ms 차이가 있고 상대 선택·서버 내부 시점도 다를 수 있다. 이 한 사례만으로 API 버그나 잘못된 필드로 단정하지 않는다.

## 시점별 차이의 실제 예

Faker / KR_8421752997: 10분 근처(600,225ms) 골드 차이 +541, XP 차이 +434, 총 CS 차이 -1. 15분 근처(900,327ms) 골드 차이 +1,598, XP 차이 +1,507, 총 CS 차이 +4. 같은 경기의 maxCsAdvantageOnLaneOpponent는 12다. 세 수치는 서로 다른 지표다.

## 후속 저장 모델 제안

- API 판정값: earlyLaningPhaseGoldExpAdvantage, laningPhaseGoldExpAdvantage를 원값으로 저장.
- API 최대 우위값: maxCsAdvantageOnLaneOpponent를 원값으로 저장. 소수도 실제 관측되므로 임의로 정수화하지 않음.
- Timeline 입력: 본인 10분/15분 totalGold, xp, minionsKilled, jungleMinionsKilled.
- 비교값: 상대 대비 goldDiff, xpDiff, laneCsDiff, totalCsDiff.
- 추적 정보: requestedMinute, actualTimestampMs, counterpartMethod.
- 상대 데이터는 계산 중에만 참조하고, 다른 플레이어의 전체 기록을 저장할 필요 없음.
- 필요한 시점에 게임이 끝났거나 상대를 유일하게 식별하지 못하면 해당 비교는 null.
- 통계/DB/서비스 변경은 이 결과를 검토한 뒤 수행.

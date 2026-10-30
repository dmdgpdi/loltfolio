# 필드별 관측 결과

200개 대상 개인 기록에서의 제공 여부와 값 범위다. 선수 전체 평균을 개인의 성향으로 사용하는 표가 아니다. 각 선수의 통계는 summary.json에 있다. 누락은 0으로 대체하지 않았다.

| 경로 | 제공/200 | 누락 | 관측 타입 | 숫자 최소 | 숫자 최대 | 값 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| match.queueId | 200/200 | 0 | int | 420 | 420 | 420 |
| match.gameId | 200/200 | 0 | int | 8378286847 | 8422737101 | 8378286847, 8378418404, 8378479119, 8378524799 |
| match.gameMode | 200/200 | 0 | str | - | - | "CLASSIC" |
| match.mapId | 200/200 | 0 | int | 11 | 11 | 11 |
| match.gameVersion | 200/200 | 0 | str | - | - | "16.18.817.5716", "16.19.821.7343", "16.19.823.722", "16.20.824.8524" |
| match.gameStartTimestamp | 200/200 | 0 | int | 1789206270698 | 1792238133260 | 1789206270698, 1789211424221, 1789213364532, 1789215330344 |
| match.gameDuration | 200/200 | 0 | int | 912 | 2559 | 1011, 1057, 1094, 1095 |
| match.endOfGameResult | 200/200 | 0 | str | - | - | "GameComplete" |
| participant.assists | 200/200 | 0 | int | 0 | 25 | 0, 1, 10, 11 |
| participant.kills | 200/200 | 0 | int | 0 | 18 | 0, 1, 10, 11 |
| participant.deaths | 200/200 | 0 | int | 0 | 15 | 0, 1, 10, 11 |
| participant.win | 200/200 | 0 | bool | - | - | false, true |
| participant.championId | 200/200 | 0 | int | 1 | 950 | 1, 10, 110, 112 |
| participant.championName | 200/200 | 0 | str | - | - | "Aatrox", "Akali", "Ambessa", "Anivia" |
| participant.teamPosition | 200/200 | 0 | str | - | - | "BOTTOM", "JUNGLE", "MIDDLE", "TOP" |
| participant.individualPosition | 200/200 | 0 | str | - | - | "BOTTOM", "JUNGLE", "MIDDLE", "TOP" |
| participant.teamId | 200/200 | 0 | int | 100 | 200 | 100, 200 |
| participant.participantId | 200/200 | 0 | int | 1 | 10 | 1, 10, 2, 3 |
| participant.summoner1Id | 200/200 | 0 | int | 1 | 21 | 1, 11, 12, 14 |
| participant.summoner2Id | 200/200 | 0 | int | 1 | 21 | 1, 12, 21, 3 |
| participant.enemyMissingPings | 200/200 | 0 | int | 0 | 45 | 0, 1, 10, 11 |
| participant.dangerPings | 200/200 | 0 | int | 0 | 29 | 0, 1, 10, 11 |
| participant.retreatPings | 200/200 | 0 | int | 0 | 6 | 0, 1, 2, 3 |
| participant.getBackPings | 200/200 | 0 | int | 0 | 20 | 0, 1, 10, 11 |
| participant.onMyWayPings | 200/200 | 0 | int | 0 | 65 | 0, 1, 10, 11 |
| participant.allInPings | 200/200 | 0 | int | 0 | 15 | 0, 1, 11, 12 |
| participant.assistMePings | 200/200 | 0 | int | 0 | 33 | 0, 1, 10, 11 |
| participant.commandPings | 200/200 | 0 | int | 0 | 78 | 0, 1, 10, 11 |
| participant.enemyVisionPings | 200/200 | 0 | int | 0 | 31 | 0, 1, 10, 11 |
| participant.needVisionPings | 200/200 | 0 | int | 0 | 6 | 0, 1, 2, 3 |
| participant.pushPings | 200/200 | 0 | int | 0 | 1 | 0, 1 |
| participant.holdPings | 200/200 | 0 | int | 0 | 0 | 0 |
| participant.firstBloodAssist | 200/200 | 0 | bool | - | - | false, true |
| participant.firstBloodKill | 200/200 | 0 | bool | - | - | false, true |
| participant.firstTowerKill | 200/200 | 0 | bool | - | - | false, true |
| participant.firstTowerAssist | 200/200 | 0 | bool | - | - | false, true |
| participant.wardsPlaced | 200/200 | 0 | int | 2 | 78 | 10, 11, 12, 13 |
| participant.wardsKilled | 200/200 | 0 | int | 0 | 25 | 0, 1, 10, 11 |
| participant.visionScore | 200/200 | 0 | int | 7 | 181 | 10, 102, 103, 11 |
| participant.visionWardsBoughtInGame | 200/200 | 0 | int | 0 | 28 | 0, 1, 10, 11 |
| participant.detectorWardsPlaced | 200/200 | 0 | int | 0 | 19 | 0, 1, 10, 11 |
| participant.turretTakedowns | 200/200 | 0 | int | 0 | 7 | 0, 1, 2, 3 |
| participant.inhibitorTakedowns | 200/200 | 0 | int | 0 | 2 | 0, 1, 2 |
| participant.objectivesStolen | 200/200 | 0 | int | 0 | 1 | 0, 1 |
| participant.totalEnemyJungleMinionsKilled | 200/200 | 0 | int | 0 | 43 | 0, 10, 11, 12 |
| participant.totalDamageTaken | 200/200 | 0 | int | 6376 | 56793 | 10262, 10388, 10602, 10695 |
| participant.damageSelfMitigated | 200/200 | 0 | int | 3163 | 61515 | 10034, 10042, 10115, 10203 |
| participant.totalHealsOnTeammates | 200/200 | 0 | int | 0 | 8427 | 0, 1110, 1166, 1518 |
| participant.totalDamageShieldedOnTeammates | 200/200 | 0 | int | 0 | 8591 | 0, 1046, 1080, 1488 |
| participant.timeCCingOthers | 200/200 | 0 | int | 0 | 86 | 0, 1, 10, 11 |
| participant.totalDamageDealtToChampions | 200/200 | 0 | int | 3889 | 57722 | 10021, 10214, 10369, 10523 |
| participant.damageDealtToTurrets | 200/200 | 0 | int | 0 | 22566 | 0, 10066, 1027, 1043 |
| participant.longestTimeSpentLiving | 200/200 | 0 | int | 0 | 1258 | 0, 1017, 1032, 1047 |
| participant.timePlayed | 200/200 | 0 | int | 912 | 2559 | 1011, 1057, 1094, 1095 |
| participant.gameEndedInEarlySurrender | 200/200 | 0 | bool | - | - | false |
| participant.gameEndedInSurrender | 200/200 | 0 | bool | - | - | false, true |
| participant.totalMinionsKilled | 200/200 | 0 | int | 3 | 424 | 10, 100, 102, 103 |
| participant.neutralMinionsKilled | 200/200 | 0 | int | 0 | 238 | 0, 1, 104, 11 |
| participant.goldEarned | 200/200 | 0 | int | 4809 | 23284 | 10011, 10037, 10124, 10149 |
| challenges.baronBuffGoldAdvantageOverThreshold | 36/200 | 164 | int | 1 | 1 | 1 |
| challenges.controlWardTimeCoverageInRiverOrEnemyHalf | 157/200 | 43 | float | 0.05084664285313974 | 0.8935971148018371 | 0.05084664285313974, 0.05792348654291755, 0.09293705091878722, 0.14363373246608058 |
| challenges.earliestBaron | 68/200 | 132 | float | 1214.946340639 | 1809.210923349 | 1214.946340639, 1222.7884814200002, 1226.3568380210002, 1229.487437279 |
| challenges.earliestDragonTakedown | 68/200 | 132 | float | 352.33672422200004 | 2071.313067012 | 1008.117893738, 1067.977830709, 1086.9942883150002, 1094.455615954 |
| challenges.earlyLaningPhaseGoldExpAdvantage | 200/200 | 0 | int | 0 | 1 | 0, 1 |
| challenges.fastestLegendary | 10/200 | 190 | float | 580.07986065 | 1885.615803612 | 1139.0942927370002, 1149.277097154, 1453.4454829840001, 1487.5005966400001 |
| challenges.highestCrowdControlScore | 19/200 | 181 | int | 1 | 1 | 1 |
| challenges.highestChampionDamage | 42/200 | 158 | int | 1 | 1 | 1 |
| challenges.highestWardKills | 16/200 | 184 | int | 1 | 1 | 1 |
| challenges.junglerKillsEarlyJungle | 34/200 | 166 | int | 0 | 1 | 0, 1 |
| challenges.killsOnLanersEarlyJungleAsJungler | 34/200 | 166 | int | 0 | 4 | 0, 1, 2, 3 |
| challenges.laningPhaseGoldExpAdvantage | 200/200 | 0 | int | 0 | 1 | 0, 1 |
| challenges.maxCsAdvantageOnLaneOpponent | 200/200 | 0 | float, int | 0 | 109 | 0, 1, 10, 10.5 |
| challenges.maxLevelLeadLaneOpponent | 200/200 | 0 | int | 0 | 4 | 0, 1, 2, 3 |
| challenges.visionScoreAdvantageLaneOpponent | 200/200 | 0 | float | -0.649867057800293 | 3.1519546508789062 | -0.009959578514099121, -0.01142042875289917, -0.018073737621307373, -0.018535733222961426 |
| challenges.acesBefore15Minutes | 200/200 | 0 | int | 0 | 1 | 0, 1 |
| challenges.controlWardsPlaced | 200/200 | 0 | int | 0 | 19 | 0, 1, 10, 11 |
| challenges.damageTakenOnTeamPercentage | 200/200 | 0 | float | 0.09141644220988904 | 0.36319837086677154 | 0.09141644220988904, 0.11511699550776408, 0.11756915700675333, 0.13332624256466236 |
| challenges.dragonTakedowns | 200/200 | 0 | int | 0 | 3 | 0, 1, 2, 3 |
| challenges.enemyChampionImmobilizations | 200/200 | 0 | int | 0 | 143 | 0, 1, 10, 11 |
| challenges.enemyJungleMonsterKills | 200/200 | 0 | int | 0 | 34 | 0, 1, 10, 11 |
| challenges.epicMonsterSteals | 200/200 | 0 | int | 0 | 1 | 0, 1 |
| challenges.firstTurretKilled | 200/200 | 0 | int | 0 | 1 | 0, 1 |
| challenges.firstTurretKilledTime | 105/200 | 95 | float | 553.267884757 | 1058.5415979430002 | 1013.203716297, 1035.252293915, 1058.5415979430002, 553.267884757 |
| challenges.flawlessAces | 200/200 | 0 | int | 0 | 2 | 0, 1, 2 |
| challenges.goldPerMinute | 200/200 | 0 | float | 245.29791008237308 | 822.8171233451991 | 245.29791008237308, 255.830652269129, 258.6431453542899, 280.26259390562996 |
| challenges.jungleCsBefore10Minutes | 200/200 | 0 | float, int | 0 | 88.00000011920929 | 0, 0.4000000059604645, 0.5, 0.800000011920929 |
| challenges.kda | 200/200 | 0 | float, int | 0 | 20 | 0, 0.16666666666666666, 0.2222222222222222, 0.25 |
| challenges.laneMinionsFirst10Minutes | 200/200 | 0 | int | 0 | 113 | 0, 1, 10, 100 |
| challenges.quickFirstTurret | 200/200 | 0 | int | 0 | 0 | 0 |
| challenges.quickSoloKills | 200/200 | 0 | int | 0 | 1 | 0, 1 |
| challenges.saveAllyFromDeath | 200/200 | 0 | int | 0 | 11 | 0, 1, 11, 2 |
| challenges.soloKills | 200/200 | 0 | int | 0 | 6 | 0, 1, 2, 3 |
| challenges.outnumberedKills | 200/200 | 0 | int | 0 | 6 | 0, 1, 2, 3 |
| challenges.killsNearEnemyTurret | 200/200 | 0 | int | 0 | 9 | 0, 1, 2, 3 |
| challenges.killsUnderOwnTurret | 200/200 | 0 | int | 0 | 7 | 0, 1, 2, 3 |
| challenges.killsOnOtherLanesEarlyJungleAsLaner | 166/200 | 34 | int | 0 | 2 | 0, 1, 2 |
| challenges.scuttleCrabKills | 200/200 | 0 | int | 0 | 7 | 0, 1, 2, 3 |
| challenges.buffsStolen | 200/200 | 0 | int | 0 | 4 | 0, 1, 2, 3 |
| challenges.baronTakedowns | 200/200 | 0 | int | 0 | 2 | 0, 1, 2 |
| challenges.turretPlatesTaken | 200/200 | 0 | int | 0 | 24 | 0, 1, 10, 11 |
| challenges.survivedSingleDigitHpCount | 200/200 | 0 | int | 0 | 1 | 0, 1 |
| challenges.tookLargeDamageSurvived | 200/200 | 0 | int | 0 | 0 | 0 |
| challenges.survivedThreeImmobilizesInFight | 200/200 | 0 | int | 0 | 14 | 0, 1, 10, 11 |
| challenges.skillshotsDodged | 200/200 | 0 | int | 0 | 189 | 0, 1, 10, 106 |
| challenges.immobilizeAndKillWithAlly | 200/200 | 0 | int | 0 | 17 | 0, 1, 10, 11 |
| challenges.pickKillWithAlly | 200/200 | 0 | int | 0 | 26 | 0, 1, 10, 11 |
| challenges.wardTakedownsBefore20M | 200/200 | 0 | int | 0 | 13 | 0, 1, 10, 11 |
| challenges.twoWardsOneSweeperCount | 200/200 | 0 | int | 0 | 2 | 0, 1, 2 |
| challenges.threeWardsOneSweeperCount | 0/200 | 200 |  | - | - |  |
| challenges.killParticipation | 200/200 | 0 | float, int | 0 | 0.8846153846153846 | 0, 0.09090909090909091, 0.1, 0.1111111111111111 |

# -*- coding: utf-8 -*-
import os,tempfile
import json,collections,statistics,datetime,hashlib
from pathlib import Path
ROOT=Path(os.environ.get('RIOT_AUDIT_CACHE', str(Path(tempfile.gettempdir())/'loltfolio-riot-audit')));CACHE=ROOT/'cache'
OUT=Path(__file__).resolve().parent;OUT.mkdir(parents=True,exist_ok=True)
state=json.loads((ROOT/'collection-private.json').read_text())
P='assists kills deaths win championId championName teamPosition individualPosition teamId participantId summoner1Id summoner2Id enemyMissingPings dangerPings retreatPings getBackPings onMyWayPings allInPings assistMePings commandPings enemyVisionPings needVisionPings pushPings holdPings firstBloodAssist firstBloodKill firstTowerKill firstTowerAssist wardsPlaced wardsKilled visionScore visionWardsBoughtInGame detectorWardsPlaced turretTakedowns inhibitorTakedowns objectivesStolen totalEnemyJungleMinionsKilled totalDamageTaken damageSelfMitigated totalHealsOnTeammates totalDamageShieldedOnTeammates timeCCingOthers totalDamageDealtToChampions damageDealtToTurrets longestTimeSpentLiving timePlayed gameEndedInEarlySurrender gameEndedInSurrender totalMinionsKilled neutralMinionsKilled goldEarned'.split()
C='baronBuffGoldAdvantageOverThreshold controlWardTimeCoverageInRiverOrEnemyHalf earliestBaron earliestDragonTakedown earlyLaningPhaseGoldExpAdvantage fastestLegendary highestCrowdControlScore highestChampionDamage highestWardKills junglerKillsEarlyJungle killsOnLanersEarlyJungleAsJungler laningPhaseGoldExpAdvantage maxCsAdvantageOnLaneOpponent maxLevelLeadLaneOpponent visionScoreAdvantageLaneOpponent acesBefore15Minutes controlWardsPlaced damageTakenOnTeamPercentage dragonTakedowns enemyChampionImmobilizations enemyJungleMonsterKills epicMonsterSteals firstTurretKilled firstTurretKilledTime flawlessAces goldPerMinute jungleCsBefore10Minutes kda laneMinionsFirst10Minutes quickFirstTurret quickSoloKills saveAllyFromDeath soloKills outnumberedKills killsNearEnemyTurret killsUnderOwnTurret killsOnOtherLanesEarlyJungleAsLaner scuttleCrabKills buffsStolen baronTakedowns turretPlatesTaken survivedSingleDigitHpCount tookLargeDamageSurvived survivedThreeImmobilizesInFight skillshotsDodged immobilizeAndKillWithAlly pickKillWithAlly wardTakedownsBefore20M twoWardsOneSweeperCount threeWardsOneSweeperCount killParticipation'.split()
I='queueId gameId gameMode mapId gameVersion gameStartTimestamp gameDuration endOfGameResult'.split()
rows=[];players=[];timelines=[]
def stats(vals):
 nums=[x for x in vals if isinstance(x,(int,float)) and not isinstance(x,bool)]
 return {'present':len(vals),'numericCount':len(nums),'min':min(nums) if nums else None,'max':max(nums) if nums else None,'mean':statistics.mean(nums) if nums else None,'sum':sum(nums) if nums else None}
for entry in state['players']:
 ownrows=[]
 for ref in entry.get('matches',[]):
  m=json.loads((CACHE/('match-'+ref['matchId']+'.json')).read_text());info=m['info'];own=next(p for p in info['participants'] if p.get('puuid')==entry['puuid'])
  ch=own.get('challenges',{})
  row={'player':entry['player'],'matchId':ref['matchId'],'match':{k:info[k] for k in I if k in info},'participant':{k:own[k] for k in P if k in own},'challenges':{k:ch[k] for k in C if k in ch}}
  rows.append(row);ownrows.append(row)
  f=CACHE/('timeline-'+ref['matchId']+'.json')
  if not f.exists():continue
  t=json.loads(f.read_text());frames=t['info']['frames'];pid=str(own['participantId']);role=own.get('teamPosition');opps=[p for p in info['participants'] if p.get('teamId')!=own.get('teamId') and p.get('teamPosition')==role]
  opp=opps[0] if len(opps)==1 and role in ['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'] else None
  tr={'player':entry['player'],'matchId':ref['matchId'],'role':role,'champion':own.get('championName'),'durationSeconds':info['gameDuration'],'frameInterval':t['info'].get('frameInterval'),'counterpartMethod':'opposite team same teamPosition (estimated role, not path tracking)' if opp else None,'reported':{k:ch.get(k) for k in ['earlyLaningPhaseGoldExpAdvantage','laningPhaseGoldExpAdvantage','maxCsAdvantageOnLaneOpponent']},'snapshots':[]}
  deltas=[]
  for frame in frames:
   a=frame.get('participantFrames',{}).get(pid);b=frame.get('participantFrames',{}).get(str(opp['participantId'])) if opp else None
   if a and b:
    deltas.append({'timestampMs':frame['timestamp'],'laneCsDiff':a['minionsKilled']-b['minionsKilled'],'totalCsDiff':a['minionsKilled']+a['jungleMinionsKilled']-b['minionsKilled']-b['jungleMinionsKilled']})
  tr['sampledMaxLaneCsDiff']=max((x['laneCsDiff'] for x in deltas),default=None)
  tr['sampledMaxTotalCsDiff']=max((x['totalCsDiff'] for x in deltas),default=None)
  for minute in [7,10,14,15]:
   target=minute*60000
   frame=min(frames,key=lambda f:abs(f['timestamp']-target))
   snapshot={'minute':minute,'available':False}
   if abs(frame['timestamp']-target)<=5000 and info['gameDuration']>=minute*60:
    a=frame.get('participantFrames',{}).get(pid);b=frame.get('participantFrames',{}).get(str(opp['participantId'])) if opp else None
    if a:
     snapshot.update({'available':True,'actualTimestampMs':frame['timestamp'],'own':{k:a.get(k) for k in ['totalGold','currentGold','xp','level','minionsKilled','jungleMinionsKilled']}})
     if b:
      snapshot['diff']={k:a[k]-b[k] for k in ['totalGold','xp','level','minionsKilled','jungleMinionsKilled']}
      snapshot['diff']['totalCs']=(a['minionsKilled']+a['jungleMinionsKilled'])-(b['minionsKilled']+b['jungleMinionsKilled'])
      snapshot['goldXp20PercentHypothesis']=a['totalGold']>=b['totalGold']*1.2 and a['xp']>=b['xp']*1.2
   tr['snapshots'].append(snapshot)
  timelines.append(tr)
 player={'player':entry['player'],'riotId':entry.get('riotId',entry.get('requestedRiotId')),'accountSource':entry['source'],'matchCount':len(ownrows),'excluded':entry.get('excluded',[]),'roles':dict(collections.Counter(r['participant'].get('teamPosition','MISSING') for r in ownrows)),'wins':sum(r['participant'].get('win') is True for r in ownrows),'firstStartedAt':datetime.datetime.fromtimestamp(min((r['match']['gameStartTimestamp'] for r in ownrows),default=0)/1000,datetime.timezone.utc).isoformat() if ownrows else None,'lastStartedAt':datetime.datetime.fromtimestamp(max((r['match']['gameStartTimestamp'] for r in ownrows),default=0)/1000,datetime.timezone.utc).isoformat() if ownrows else None}
 for f in ['earlyLaningPhaseGoldExpAdvantage','laningPhaseGoldExpAdvantage','maxCsAdvantageOnLaneOpponent']:
  vals=[r['challenges'][f] for r in ownrows if f in r['challenges']]
  player[f]={**stats(vals),'valueCounts':dict(collections.Counter(str(x) for x in vals))}
 player['enemyMissingPings']=stats([r['participant']['enemyMissingPings'] for r in ownrows if 'enemyMissingPings' in r['participant']])
 players.append(player)
fields=[]
for category,keys in [('match',I),('participant',P),('challenges',C)]:
 for key in keys:
  vals=[r[category][key] for r in rows if key in r[category]]
  unique=sorted(set(json.dumps(v,ensure_ascii=False) for v in vals))
  fields.append({'path':category+'.'+key,'total':len(rows),'missing':len(rows)-len(vals),'types':sorted({type(v).__name__ for v in vals}),'examples':unique[:8],**stats(vals)})
summary={'collectedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'KR public pro-linked accounts; queue 420; own-participant-only extraction; 20 eligible records per account where available','playerCount':sum(p['matchCount']>0 for p in players),'playerMatchCount':len(rows),'uniqueMatches':len({r['matchId'] for r in rows}),'timelineRows':len(timelines),'uniqueTimelines':len({t['matchId'] for t in timelines}),'apiCallsInCollector':state['calls'],'statusCounts':dict(collections.Counter(str(x.get('status',x.get('failure'))) for x in state['ledger'])),'players':players}
for name,obj in [('summary.json',summary),('player-matches.json',rows),('field-observations.json',fields),('timeline-snapshots.json',timelines)]:
 (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2))
(OUT/'request-log.json').write_text(json.dumps(state['ledger'],ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in summary.items() if k!='players'},ensure_ascii=False))
print('PLAYERS',[(p['player'],p['matchCount']) for p in players])
print('EARLY',[(p['player'],p['earlyLaningPhaseGoldExpAdvantage']['valueCounts']) for p in players])
print('LANING',[(p['player'],p['laningPhaseGoldExpAdvantage']['valueCounts']) for p in players])
print('TIMELINE',len(timelines))

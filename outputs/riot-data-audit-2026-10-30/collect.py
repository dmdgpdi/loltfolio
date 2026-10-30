# -*- coding: utf-8 -*-
import os,tempfile
import json,time,urllib.request,urllib.error,urllib.parse,datetime,collections
from pathlib import Path
ROOT=Path(os.environ.get('RIOT_AUDIT_CACHE', str(Path(tempfile.gettempdir())/'loltfolio-riot-audit'))); CACHE=ROOT/'cache'; CACHE.mkdir(exist_ok=True)
OUT=Path(__file__).resolve().parent; OUT.mkdir(parents=True,exist_ok=True)
KEY=os.environ['LOL_API_KEY'].strip()
PLAYERS=[
 ('Faker','Hide on bush','KR1','https://lolprofile.net/pros/faker'),
 ('Chovy','허거덩','0303','https://lolprofile.net/pros/chovy'),
 ('Keria','Ciro','KR10','https://lolprofile.net/pros/keria'),
 ('Gumayusi','HLE Gumayusi','0298','https://lolprofile.net/pros/gumayusi'),
 ('Zeus','Athene','lll','https://lolprofile.net/pros/zeus'),
 ('Kiin','kiin','KR1','https://lolprofile.net/pros/kiin'),
 ('ShowMaker','DK ShowMaker','KR1','https://lolprofile.net/pros/showmaker'),
 ('Oner','오 너','111','https://mid.gg/streamer/oner'),
 ('Doran','어리고싶다','KR1','https://www.probuild.gg/pro/doran'),
 ('Ruler','강 철','샤 넬','https://www.trackingthepros.com/player/Ruler'),
]
last=0; calls=0; ledger=[]
def fetch(path,cache_name):
 global last,calls
 file=CACHE/(cache_name+'.json')
 if file.exists():return json.loads(file.read_text())
 for attempt in range(3):
  time.sleep(max(0,1.35-(time.monotonic()-last)))
  req=urllib.request.Request('https://asia.api.riotgames.com'+path,headers={'X-Riot-Token':KEY,'Accept':'application/json','User-Agent':'loltfolio-data-audit/1.0'})
  last=time.monotonic();calls+=1
  try:
   with urllib.request.urlopen(req,timeout=25) as res:
    body=res.read(); data=json.loads(body)
    ledger.append({'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'endpoint':path.split('/by-puuid/')[0] if '/by-puuid/' in path else path,'status':res.status,'appLimit':res.headers.get('X-App-Rate-Limit'),'appCount':res.headers.get('X-App-Rate-Limit-Count')})
    file.write_text(json.dumps(data,ensure_ascii=False));return data
  except urllib.error.HTTPError as e:
   body=e.read().decode(errors='replace')
   ledger.append({'status':e.code,'endpoint':path.split('/by-puuid/')[0] if '/by-puuid/' in path else path,'body':body[:500].replace(KEY,'[REDACTED]')})
   if e.code==429:
    delay=max(float(e.headers.get('Retry-After','5')),2); print('rate limit: waiting',delay,flush=True);time.sleep(delay);continue
   if e.code>=500 and attempt<2:time.sleep(2);continue
   if e.code in (401,403):raise RuntimeError('API authentication or access failure '+str(e.code))
   return None
  except Exception as e:
   ledger.append({'endpoint':path.split('/by-puuid/')[0] if '/by-puuid/' in path else path,'failure':type(e).__name__})
   if attempt==2:return None
 return None

def save_state():
 (ROOT/'collection-private.json').write_text(json.dumps({'players':collected,'ledger':ledger,'calls':calls},ensure_ascii=False,indent=2))

collected=[]
for alias,name,tag,source in PLAYERS:
 path='/riot/account/v1/accounts/by-riot-id/'+urllib.parse.quote(name,safe='')+'/'+urllib.parse.quote(tag,safe='')
 account=fetch(path,'account-'+alias)
 if not account or not account.get('puuid'):
  print(alias,'ACCOUNT FAILED',flush=True);collected.append({'player':alias,'requestedRiotId':name+'#'+tag,'source':source,'error':'account lookup failed'});save_state();continue
 entry={'player':alias,'riotId':account.get('gameName',name)+'#'+account.get('tagLine',tag),'puuid':account['puuid'],'source':source,'matches':[],'excluded':[]}
 collected.append(entry); offset=0
 while len(entry['matches'])<20 and offset<200:
  ids=fetch('/lol/match/v5/matches/by-puuid/'+urllib.parse.quote(account['puuid'],safe='')+'/ids?queue=420&start='+str(offset)+'&count=20','ids-'+alias+'-'+str(offset))
  if not ids:break
  for mid in ids:
   if len(entry['matches'])>=20:break
   match=fetch('/lol/match/v5/matches/'+mid,'match-'+mid)
   if not match:entry['excluded'].append({'matchId':mid,'reason':'detail fetch failed'});continue
   info=match['info']; own=next((p for p in info['participants'] if p.get('puuid')==account['puuid']),None)
   if not own:entry['excluded'].append({'matchId':mid,'reason':'participant not found'});continue
   if info.get('queueId')!=420:entry['excluded'].append({'matchId':mid,'reason':'queue mismatch'});continue
   reason=None
   if info.get('endOfGameResult') not in ('GameComplete',None):reason='non GameComplete end result'
   elif own.get('gameEndedInEarlySurrender') is True:reason='early surrender flag (provisional exclusion)'
   if reason:
    entry['excluded'].append({'matchId':mid,'reason':reason,'duration':info.get('gameDuration'),'endOfGameResult':info.get('endOfGameResult')});continue
   entry['matches'].append({'matchId':mid,'participantId':own['participantId']})
   if len(entry['matches'])%5==0:print(alias,len(entry['matches']),'matches; live calls',calls,flush=True)
  offset+=len(ids)
  save_state()
  if len(ids)<20:break
 print(alias,'DONE',len(entry['matches']),'matches excluded',len(entry['excluded']),flush=True)
 save_state()

# Timeline validation: two selected-player matches per pro, prioritizing >= 15 min and a non-jungle role.
for entry in collected:
 if 'matches' not in entry:continue
 candidates=[]
 for ref in entry['matches']:
  m=json.loads((CACHE/('match-'+ref['matchId']+'.json')).read_text());p=next(p for p in m['info']['participants'] if p['participantId']==ref['participantId'])
  candidates.append((m['info'].get('gameDuration',0)>=900,p.get('teamPosition')!='JUNGLE',ref))
 candidates.sort(key=lambda x:(not x[0],not x[1]))
 entry['timelines']=[]
 for _,__,ref in candidates[:2]:
  timeline=fetch('/lol/match/v5/matches/'+ref['matchId']+'/timeline','timeline-'+ref['matchId'])
  entry['timelines'].append({'matchId':ref['matchId'],'fetched':timeline is not None})
 print(entry['player'],'timeline samples',len(entry['timelines']),flush=True);save_state()
print('COMPLETE',sum(len(p.get('matches',[])) for p in collected),'player-match rows;',calls,'live calls',flush=True)

// ============================================================================
// race-engine.js — EXTRACTED VERBATIM from Lucky-7-Web/index.html (the live app).
// These are the SAME scoring functions the admin 'Settle' button runs, sliced out
// line-for-line so server-side auto-settlement produces byte-identical payouts.
// DO NOT hand-edit the extracted blocks — re-slice from index.html if the app engine
// changes. Extraction date: 2026-07-06 (app build v562).
// ============================================================================

// ---- constants (index.html:19584, 21558, 21590) ----
var _SR_HOUR_GAP_MS = 20*60*1000;   // merge only true catch-up/batch readings (<=20min apart)
var _RC_MAXJMP = 20;
var _RC_ROSTER = { claws:'d12',prod:'d12',jeff:'d12',bruce:'d12',kyros:'d12',hana:'d12', ace:'n12',sid:'n12',kaiji:'n12',vici:'n12', ron:'s1',bob:'s1', eric:'s2',san:'s2',bin:'s2', el:'s3',sil:'s3',miru:'s3',ditt:'s3' };   /* [v593] 'eric' aliased · [v594] hana n12→d12 (boss 7/9) */
var _RC_NAME_ALIAS={ ericson:'eric' };   // [v593] alias applied in _rcNorm too (was only in the inner normName) — _rcNorm feeds playerKey → race_payouts.player_key, so without this a server settle would still write 'ericson'
// [v593] per-player RACE START DATE (boss 7/9): BOB/SAN/DITT join 2026-07-06; earlier records are fully out of the race.
var _RC_JOIN_DATE = { bob:'2026-07-06', san:'2026-07-06', ditt:'2026-07-06', sil:'2026-07-04' };   /* [v595] boss 7/9: SIL from 7/4 */

// ---- small helpers (index.html:21560,21587,21591,21592) ----
function _rcMs(r){ if(!r) return null; if(typeof r.createdAt==='number'&&r.createdAt>1e12) return r.createdAt; var m=String(r.id||'').match(/^rpt-(\d+)/); return m?Number(m[1]):null; }
function _rcNorm(n){ var k=String(n||'').toLowerCase().replace(/^\s*(mr|ms|mrs)(\.|\s)\s*/,'').trim().split(/\s+/)[0]||''; return _RC_NAME_ALIAS[k]||k; }   /* [v593] alias-aware */
function _rcGroupOf(name){ return _RC_ROSTER[_rcNorm(name)] || 'un'; }
function _rcModeOf(group){ return (group==='d12'||group==='n12') ? '1212' : '888'; }

// ---- test-client filter (index.html:21615-21625) ----
var _RC_TEST_CLIENTS = ['일점커','마프르','bob pc3','handover','handpver'];   // 일점커 — internal test client since 7/1; 마프르 — PC4 test assignment since 7/6; [v560] 'bob pc3' + handover/handpver(typo) — 인수인계/훈련 세션이 리포트에 섞여 들어온 것 (boss 7/6: 레이스 제외); entries are matched lowercase
function _rcIsTestReport(r){
  try{
    if(String(r.map||'').toUpperCase().indexOf('TEST')>=0) return true;
    var cli=String(r.client||'');
    if(cli.toUpperCase().indexOf('TRAINING')>=0) return true;
    var cliLow=cli.toLowerCase();   // [v560] case-insensitive so English test-client names can't slip through on casing
    for(var i=0;i<_RC_TEST_CLIENTS.length;i++){ if(_RC_TEST_CLIENTS[i] && cliLow.indexOf(_RC_TEST_CLIENTS[i])>=0) return true; }
  }catch(_){ }
  return false;
}

// ---- _srRecCompute: the Records scoring pipeline (index.html:20294-20443) ----
function _srRecCompute(reports, clients){
  reports = Array.isArray(reports)?reports:[];
  clients = Array.isArray(clients)?clients:[];
  var _NAME_ALIAS={ ericson:'eric' };   // [v591] same alias table as the app's _RC_NAME_ALIAS — keeps server-settled player_key identical to app-settled ('eric'), ending the mixed eric/ericson keys in race_payouts
  var normName=function(n){ var k=String(n||'').toLowerCase().replace(/^\s*(mr|ms|mrs)(\.|\s)\s*/,'').trim().split(/\s+/)[0]||''; return _NAME_ALIAS[k]||k; };
  var MAX_LV_JUMP=20;
  var gainedPct=function(r){ var dLv=(Number(r.lvAfter)||0)-(Number(r.lvBefore)||0); var dExp=(Number(r.expAfter)||0)-(Number(r.expBefore)||0); if(Math.abs(dLv)>MAX_LV_JUMP) return dExp; return dLv*100+dExp; };
  var reportMs=function(r){ if(!r) return null; if(typeof r.createdAt==='number'&&r.createdAt>1e12) return r.createdAt; var m=String(r.id||'').match(/^rpt-(\d+)/); return m?Number(m[1]):null; };
  var isTestMap=function(r){ return String(r.map||'').toUpperCase()==='TEST'; };
  var zoneKey=function(s){ s=(s||'').toLowerCase(); if(s.indexOf('orc')>=0||s.indexOf('오크')>=0||s.indexOf('totem')>=0||s.indexOf('토템')>=0)return'orc'; if(s.indexOf('dream')>=0||s.indexOf('ivory')>=0||s.indexOf('드림')>=0||s.indexOf('상아')>=0||s.indexOf('아일랜드')>=0)return'dream'; if(s.indexOf('oren')>=0||s.indexOf('snow')>=0||s.indexOf('오렌')>=0||s.indexOf('설원')>=0)return'oren'; if(s.indexOf('ant')>=0)return'ant'; if(s.indexOf('dragon')>=0||s.indexOf('드래곤')>=0)return'dragon'; if(s.indexOf('blessed')>=0||s.indexOf('ats')>=0)return'ats'; if(s.indexOf('gludio')>=0||s.indexOf('giran')>=0||s.indexOf('desert')>=0||s.indexOf('dessert')>=0)return'dgg'; return s; };
  var isBreakMap=function(r){ return zoneKey(String(r.map||''))==='ats'; };   // [v500/v519] ATS has NO standard yet -> still EXCLUDED from all performance math (%, average, actual/h, quota, hours) so it never distorts scores, but as of v519 it is NO LONGER treated/labelled as a player 'break': the row shows the normal unscored verdict (check-in='Start', otherwise '—') and is not greyed. Once a real ATS standard EXP is added it will be scored like any other map.
  var _stdNorm=function(x){ return String(x||'').replace(/[\s\u00b7.\-_'"’]/g,'').replace(/(쌤|선생님|님|씨|형님|형|누님|누나|언니|오빠)$/,'').toLowerCase(); };
  var _pickFromMaps=function(maps,z,lv){ if(!Array.isArray(maps)) return null; var cand=maps.filter(function(m){return zoneKey(m.en||m.ko)===z;}); if(!cand.length) return null; var wild=cand.find(function(m){return m.level==null||m.level==='';}); if(wild) return wild; var leveled=cand.filter(function(m){return isFinite(Number(m.level));}).sort(function(a,b){return Number(a.level)-Number(b.level);}); if(!leveled.length) return null; var below=leveled.filter(function(m){return Number(m.level)<=lv;}); return below.length?below[below.length-1]:leveled[0]; };
  var findMap=function(clients,r){
    var cn=String(r.client||'').trim(), cnn=_stdNorm(cn); var c=null,i;
    // [v494] tolerant client match: exact name -> normalized name (쌤/님/spaces stripped) -> PC number
    // [v510] PC/ACCOUNT FIRST: two clients can share a name but sit on different PCs (accounts). Match the
    // report's PC to its own card BEFORE name so same-named clients never cross-connect; name is the fallback.
    var _rpc=String(r.pc==null?'':r.pc).replace(/[^0-9]/g,'');   // [v512] digit-tolerant: 'PC 6' == '6' == 6
    if(_rpc!==''){ for(i=0;i<clients.length;i++){ if(String(clients[i].pc==null?'':clients[i].pc).replace(/[^0-9]/g,'')===_rpc){c=clients[i];break;} } }
    if(!c){ for(i=0;i<clients.length;i++){ if(String(clients[i].name||'').trim()===cn && cn){c=clients[i];break;} } }
    if(!c && cnn){ for(i=0;i<clients.length;i++){ if(_stdNorm(clients[i].name)===cnn){c=clients[i];break;} } }
    var z=zoneKey(r.map); var lv=Number(r.lvAfter!=null?r.lvAfter:r.lv);
    var hit = (c && c.maps) ? _pickFromMaps(c.maps,z,lv) : null;
    var _hasBand=function(m){ return !!(m && m.sh!=null && m.sh!=='' && m.sl!=null && m.sl!==''); };
    if(hit && _hasBand(hit)) return hit;
    // [v495] BAND-BACKFILL + last-resort fallback: the matched card's own map entry either doesn't exist,
    // or has a Goal target but no Stable/Cut band (e.g. a client card seeded with only a Goal number while
    // the full band lives on a DIFFERENT card for the same zone — the 아귀님/고고형님 Dream Island case).
    // Search every other card for the SAME map zone and prefer one with a COMPLETE band (target+sh+sl),
    // preferring a card whose name normalizes to this report's client. If the matched card DID have its
    // own target, keep that target but borrow sh/sl from the fallback card, so Stable/Cut and the verdict
    // resolve correctly instead of showing a bare Goal number (GOAL filled, STABLE/CUT '—') as before.
    // [v499] Training cards neither LEND nor BORROW whole standards across clients. Real clients still
    // share a same-zone standard (e.g. Mr.Sil on Dragon Dungeon reads a real 경상도쌀/Owen Dragon Valley
    // target), but a training card's practice target never leaks to others, and a training-client report
    // with no own standard shows 'No standard' instead of borrowing (e.g. Luke's ATS). Band-backfill
    // (own target present, borrow ONLY sh/sl) is unchanged and always allowed.
    var _isTrain=function(nm){ return /training|훈련|연습/i.test(String(nm||'')); };
    var prefFull=null, prefAny=null, anyFull=null, anyAny=null;
    for(i=0;i<clients.length;i++){
      if(_isTrain(clients[i].name)) continue;   // never borrow FROM a training card
      var m=_pickFromMaps(clients[i].maps,z,lv); if(!m) continue;
      var full=_hasBand(m);
      if(anyAny==null) anyAny=m;
      if(full && anyFull==null) anyFull=m;
      if(cnn && _stdNorm(clients[i].name)===cnn){ if(prefAny==null) prefAny=m; if(full && prefFull==null) prefFull=m; }
    }
    var bandSrc=prefFull||anyFull;
    // [v509] OWN CLIENT CARD ONLY — no cross-client borrowing of any kind. Removed the full-borrow that
    // gave a client a standard it never had (e.g. Owen라인쌀, with no Oren entry, was reading a borrowed Oren
    // 0.94/0.78~0.72 from other cards) AND the cross-client band-backfill. If the report's own client card
    // has this map's zone, use it (a bare target with no Stable/Cut band falls to the target-only verdict
    // path); otherwise 'No standard'. Each Standard-EXP client card stands alone, matched by name/PC.
    if(!hit){
      // [v511] The primary matched card has no standard for this map's zone, but the SAME account can carry
      // it on another card: two entries may exist for one PC — a name-only PC-Status client (e.g. reports
      // store 석도쌀, which has no maps) alongside the real Standard-EXP card on that PC (e.g. 마석도님, which
      // holds Dragon/Oren). Search ONLY same-PC (digit-tolerant, so 'PC 6' == '6') or same-name cards — own
      // account only, never other clients — and use the first that actually has this zone's standard.
      var _rpcD=String(r.pc==null?'':r.pc).replace(/[^0-9]/g,'');
      for(var _fi=0;_fi<clients.length;_fi++){
        var _oc=clients[_fi]; if(!_oc || _oc===c) continue;
        var _ocpcD=String(_oc.pc==null?'':_oc.pc).replace(/[^0-9]/g,'');
        var _ocn=_stdNorm(_oc.name);
        // [v512] containment bridge: the report's short client alias and the card's fuller name (or vice
        // versa) count as the same account when one normalized name contains the other (>=2 chars) — the
        // PC-Status alias vs Standard-EXP card-name case. Only reached when the primary card had no standard.
        var _nameLink=(cn && String(_oc.name||'').trim()===cn) || (cnn && _ocn===cnn) ||
                      (cnn && cnn.length>=2 && _ocn && _ocn.length>=2 && (_ocn.indexOf(cnn)>=0 || cnn.indexOf(_ocn)>=0));
        var _same=(_rpcD!=='' && _ocpcD===_rpcD) || _nameLink;
        if(!_same) continue;
        var _h2=_pickFromMaps(_oc.maps,z,lv);
        if(_h2){ hit=_h2; break; }
      }
    }
    return hit || null;
  };
  var _ord={checkin:0,status:1,checkout:2};
  var groups={};
  reports.forEach(function(r){ var k=normName(r.booster); if(!k) return; if(!groups[k]) groups[k]={name:r.booster, rs:[]}; groups[k].rs.push(r); });
  var recAgg={}, sessions=[];
  Object.keys(groups).forEach(function(k){
    var g=groups[k];
    var allRs=g.rs.slice().sort(function(a,b){ return ((reportMs(a)||0)-(reportMs(b)||0)) || ((_ord[a.tag]!=null?_ord[a.tag]:1)-(_ord[b.tag]!=null?_ord[b.tag]:1)); });
    var isDup={}, DUP=10*60*1000, i,j;
    for(i=0;i<allRs.length;i++){ var r=allRs[i]; if(isTestMap(r))continue; for(j=i-1;j>=0;j--){ var p=allRs[j]; if(((reportMs(r)||0)-(reportMs(p)||0))>DUP)break; if(isDup[p.id])continue; if(String(p.client||'').trim()===String(r.client||'').trim()&&(p.tag||'')===(r.tag||'')&&Number(p.lvAfter)===Number(r.lvAfter)&&Number(p.expAfter)===Number(r.expAfter)){ isDup[r.id]=true; break; } } }
    var segGain={}; (function(){ var prev=null; allRs.forEach(function(r){ if(isDup[r.id]){segGain[r.id]=0; return;} if(isTestMap(r)){segGain[r.id]=gainedPct(r); return;} if(prev&&prev.client!==r.client){prev=null;} if(r.tag==='checkin'){segGain[r.id]=null; prev=r; return;} segGain[r.id]=gainedPct(r); prev=r;   /* [v392] actual per-report result, matches Discord */ }); })();
    var shiftDateMap={}; (function(){ var curCi=null,curCiMs=null,MAXSPAN=16*3600*1000; allRs.forEach(function(r){ if(isTestMap(r))return; var rms=reportMs(r); if(curCi&&curCiMs!=null&&rms!=null&&(rms-curCiMs)>MAXSPAN)curCi=null; if(r.tag==='checkin'){curCi=r;curCiMs=rms;return;} if(curCi&&curCi.client!==r.client)curCi=null; shiftDateMap[r.id]=curCi?curCi.date:r.date; if(r.tag==='checkout')curCi=null; }); })();
    var shiftDateOf=function(r){ return String(shiftDateMap[r.id]||r.date||'').slice(0,10); };
    // [v314] EXP-jump detection: an hourly report can't realistically gain a large % of a level. Flag any
    // report whose gain is a big outlier vs this booster's OWN typical hourly gain (or huge in absolute) —
    // these are almost always typos / EXP-readout glitches that inflate the totals.
    var _g=[]; allRs.forEach(function(r){ if(isTestMap(r)||isBreakMap(r)||isDup[r.id]||r.tag==='checkin'||r.ignored)return; var gg=segGain[r.id]; if(gg!=null&&gg>0)_g.push(gg); });
    var _med=0; if(_g.length){ var _gs=_g.slice().sort(function(a,b){return a-b;}); _med=_gs[Math.floor(_gs.length/2)]; }
    var _jThr=Math.max(5, 6*Math.max(_med,0.3));   // flag if a single hour gained > 6x the usual, with a 5% floor
    var _hourSeqByDate={};   // [v384] per-date rolling-gap hour sequence — see _SR_HOUR_GAP_MS
    // [v588] ATS manual-play sessions — an ATS block scores only when flagged hand-played (atsManual=true,
    // set at submit when a 2h+ ATS block is confirmed manual) AND its card has an ATS standard. Auto/rest ATS
    // stays excluded. Keep in lockstep with index.html _srRecCompute.
    var _atsMan={}; allRs.forEach(function(r){ if(r&&isBreakMap(r)&&r.atsManual===true){ _atsMan[normName(r.booster)+'|'+shiftDateOf(r)+'|'+String(r.client||'').trim()]=1; } });
    allRs.forEach(function(r){
      if(isTestMap(r)) return;
      var _rd=shiftDateOf(r);
      var _tag=(r.tag==='checkin')?'checkin':((r.tag==='checkout')?'checkout':'status');
      var _rmo=findMap(clients,r);
      var _tgt=(_rmo&&Number(_rmo.target)>0)?Number(_rmo.target):null;
      // [v386] Surface the Stable hi/lo band alongside the Goal target, so Records can show the full
      // Goal/Stable/Cut breakdown, not just the single Goal number.
      var _sh=(_rmo&&_rmo.sh!=null&&_rmo.sh!=='')?Number(_rmo.sh):null; if(_sh!=null&&!isFinite(_sh))_sh=null;
      var _sl=(_rmo&&_rmo.sl!=null&&_rmo.sl!=='')?Number(_rmo.sl):null; if(_sl!=null&&!isFinite(_sl))_sl=null;
      var _dup=!!isDup[r.id];
      var _gain=(_tag==='checkin')?null:(_dup?0:(segGain[r.id]||0));
      var _flag=(_gain!=null)&&(_gain>80 || _gain>_jThr);
      var _rms=reportMs(r);
      var _ignored=!!r.ignored;   // [v447] 미반영 — excluded from performance calc/averages/stats, but still shown (greyed) in the session log
      var _isBreak=isBreakMap(r) && !(_tgt!=null && _tgt>0 && _atsMan[normName(r.booster)+'|'+_rd+'|'+String(r.client||'').trim()]);   // [v588] ATS scores ONLY when it has a real standard AND the session was flagged hand-played; else excluded (auto/rest). Lockstep with index.html.
      sessions.push({ id:r.id, name:g.name, key:normName(g.name), date:_rd, ms:_rms, tag:_tag, client:r.client||'', pc:r.pc, lv:(r.lvAfter!=null?r.lvAfter:r.lv), map:r.map||'', gain:_gain, expAt:(Number(r.expAfter)||0), target:_tgt, sh:_sh, sl:_sl, dup:_dup, flag:_flag, ignored:_ignored, brk:_isBreak });
      if(_rd){
        if(!recAgg[g.name]) recAgg[g.name]={};
        if(!recAgg[g.name][_rd]) recAgg[g.name][_rd]={hours:0,gain:0,quota:0,flags:0,cleanGain:0,scored:0,scoredClean:0,minMs:null,maxMs:null,hb:{}};
        var _ra=recAgg[g.name][_rd];
        // [v366] track the shift's clock span (incl. check-in = start) so Records shows WHEN, not just how many hours
        if(_rms!=null){ if(_ra.minMs==null||_rms<_ra.minMs)_ra.minMs=_rms; if(_ra.maxMs==null||_rms>_ra.maxMs)_ra.maxMs=_rms; }
        if(_tag!=='checkin' && !_dup){
          // [v447] keep the hour-bucket-sequence timing consistent (lastMs advances) even for an ignored
          // report, so adjacent CLEAN reports still bucket correctly — but the ignored report itself
          // contributes nothing to gain/cleanGain/quota/hours, fully excluding it from the stats.
          var _hk;
          if(_rms!=null){ var _hs=_hourSeqByDate[_rd]||(_hourSeqByDate[_rd]={lastMs:null,seq:0}); if(_hs.lastMs==null||(_rms-_hs.lastMs)>_SR_HOUR_GAP_MS)_hs.seq++; _hs.lastMs=_rms; _hk='h'+_hs.seq; } else { _hk='r'+r.id; }
          if(!_ignored && !_isBreak){   // [v500] ATS break contributes nothing to gain/quota/hours
            _ra.gain+=(_gain||0);
            if(!_flag) _ra.cleanGain+=(_gain||0);   // [v314] gain with jumps removed
            // [v514] SCORED gain: only reports that HAVE a standard count toward the perf %, because the
            // quota only ever accumulates for hours WITH a target — mixing no-standard gain into the
            // numerator inflated the % (e.g. a band showing 228% when its only scored member was 105%).
            if(_tgt){ _ra.scored+=(_gain||0); if(!_flag) _ra.scoredClean+=(_gain||0); }
            // [v384] count actual real-time HOUR RUNS, not reports and not a fixed clock grid: a new hour
            // starts whenever the gap since the booster's last reading (this date) exceeds _SR_HOUR_GAP_MS.
            // (Old [v371] bucketed by Math.floor(ms/3600000) — a fixed UTC grid that could wrongly merge two
            // genuinely separate ~1h reports landing in the same calendar-hour cell, e.g. one submitted late.)
            if(!_ra.hb[_hk]) _ra.hb[_hk]={tgt:0};
            if(_tgt) _ra.hb[_hk].tgt=_tgt;          // target for this clock-hour (last seen wins)
            if(_flag) _ra.flags++;
          }
        }
      }
    });
  });
  var daily=[];
  Object.keys(recAgg).forEach(function(nm){ Object.keys(recAgg[nm]).forEach(function(d){ var a=recAgg[nm][d]; var _hb=a.hb||{}; a.hours=Object.keys(_hb).length; a.quota=0; Object.keys(_hb).forEach(function(_hk){ a.quota+=(_hb[_hk].tgt||0); }); if(!(a.hours>0)) return; var perH=(a.hours>0?a.gain/a.hours:0); var targetH=(a.hours>0&&a.quota>0?a.quota/a.hours:0); var perf=(a.quota>0?((a.scored||0)/a.quota*100):null); var cleanPerf=(a.quota>0?((a.scoredClean||0)/a.quota*100):null); daily.push({name:nm,key:normName(nm),date:d,hours:a.hours,gain:a.gain,quota:a.quota,perH:perH,targetH:targetH,perf:perf,flags:(a.flags||0),cleanGain:(a.cleanGain||0),cleanPerf:cleanPerf,scored:(a.scored||0),scoredClean:(a.scoredClean||0),hoursFlag:(a.hours>16),minMs:a.minMs,maxMs:a.maxMs}); }); });
  daily.sort(function(a,b){ if(a.date!==b.date) return a.date<b.date?1:-1; return a.name<b.name?-1:(a.name>b.name?1:0); });
  sessions.sort(function(a,b){ return (b.ms||0)-(a.ms||0); });
  return { daily:daily, sessions:sessions };
}

// ---- _rcAggPlayers (index.html:21746-21753) ----
function _rcAggPlayers(rows){
  var by={};
  rows.forEach(function(r){ var k=r.playerKey; if(!by[k]) by[k]={key:k,name:r.player,pc:r.pc,client:r.client,points:0,goal:0,stable:0,cut:0,dq:0,rows:[]};
    var p=by[k]; p.rows.push(r); if(r.pc!=null&&r.pc!=='') p.pc=r.pc; if(r.client) p.client=r.client;
    if(r.dq) p.dq++; else if(r.result==='Goal') p.goal++; else if(r.result==='Stable') p.stable++; else if(r.result==='Cut') p.cut++;
    p.points+=r.total; });
  return Object.keys(by).map(function(k){return by[k];});
}

// ---- _rcScoreReports (index.html:21626-21700) ----
function _rcScoreReports(reports, clients, settings, dqSet){
  settings = settings || {}; reports = Array.isArray(reports)?reports:[]; clients = Array.isArray(clients)?clients:[];
  var base = settings.base_point!=null ? Number(settings.base_point) : 1;
  var rb = settings.rank_bonus || {1:3,2:2,3:1};
  var gb = settings.goal_bonus || {t100:1,t110:3,t120:6};
  dqSet = dqSet || (typeof Set!=='undefined' ? new Set() : {has:function(){return false;}});
  var _rcm = _srRecCompute(reports, clients);
  // [v540] SHIFT-DATE attribution (same idea Records uses): every report belongs to the day its shift
  // CHECKED IN, so a night shift crossing midnight is NOT split across two race days. Walk reports in
  // time order per booster; a check-in opens a shift date that holds for up to 16h.
  var _sdMap={}; (function(){
    var byB={}; reports.forEach(function(r){ if(r.tag==='checkin'||r.tag==='status'||r.tag==='checkout'){ var b=_rcNorm(r.booster); (byB[b]=byB[b]||[]).push(r); } });
    Object.keys(byB).forEach(function(b){ var arr=byB[b].slice().sort(function(a,x){return (_rcMs(a)||0)-(_rcMs(x)||0);});
      var curDate=null, curMs=null, SPAN=16*3600*1000;
      arr.forEach(function(r){ var ms=_rcMs(r);
        if(r.tag==='checkin'){ curDate=String(r.date||'').slice(0,10); curMs=ms; }
        if(curDate!=null && curMs!=null && ms!=null && (ms-curMs)>=0 && (ms-curMs)<=SPAN){ _sdMap[r.id]=curDate; }
      }); });
  })();
  // [v561] SAME-HOUR DUPLICATE GUARD — a booster+client+shift-date+hour may score only ONCE. The Records
  // dup detector only catches identical values within 10 minutes; the 7/6 incident (ERP checkout backfill
  // regenerating a whole already-reported day hours later, with different interpolated EXP values) sailed
  // right past it. Keep the EARLIEST submission per hour label (the live report), DQ later ones — earn-only
  // rules make earliest-wins also the anti-gaming choice (you can't "improve" an hour by resubmitting).
  var _dupHour={}; (function(){
    var best={};
    reports.forEach(function(r){
      if(r.tag!=='status') return;
      var hh=parseInt(String(r.start||''),10); if(!isFinite(hh)) return;
      var k=_rcNorm(r.booster)+'|'+String(_sdMap[r.id]||r.date||'').slice(0,10)+'|'+String(r.client||'').trim()+'|'+hh;
      var ms=_rcMs(r)||0;
      if(!(k in best)){ best[k]={id:r.id, ms:ms}; }
      else if(ms<best[k].ms){ _dupHour[best[k].id]=true; best[k]={id:r.id, ms:ms}; }
      else { _dupHour[r.id]=true; }
    });
  })();
  var sessById = {}; (_rcm.sessions||[]).forEach(function(s){ sessById[s.id] = s; });
  var rows = [];
  reports.forEach(function(r){
    if(r.tag==='checkin') return;
    if(_rcIsTestReport(r)) return;   /* [v548] test/practice reports fully out of the race (map contains TEST, client is *TRAINING or a listed test client e.g. 일점커) */
    if(typeof _isHiddenKey==='function' && _isHiddenKey(_rcNorm(r.booster))) return;   /* [v547] hidden/monitoring staff are fully out of the race: no points, no rank slots, no payouts */
    if(typeof _isTrainingKey==='function' && _isTrainingKey(_rcNorm(r.booster), r.booster)) return;   /* [v549] trainees (calc 'training_staff') fully out of the race even when they touch a real client — prevents a trainee helping on a real account from earning points or stealing a rank slot */
    var _jd0=_RC_JOIN_DATE[_rcNorm(r.booster)]; if(_jd0 && String(_sdMap[r.id]||r.date||'').slice(0,10)<_jd0) return;   /* [v593] before this player's race start date — fully out of the race (boss 7/9) */
    var sess = sessById[r.id];
    if(!sess) return;   // not resolvable by Records either (shouldn't normally happen) — skip rather than guess
    if(sess.brk) return;   // ATS — same exclusion Records applies (isBreakMap), still no standard for it
    var gain = sess.gain || 0;
    var group=_rcGroupOf(r.booster); var ms=_rcMs(r);
    var hourBucket = ms!=null ? Math.floor((ms + 9*3600000)/3600000) : null;
    var row={ id:r.id, player:r.booster, playerKey:_rcNorm(r.booster), pc:r.pc, client:r.client, map:r.map,
      date:String(_sdMap[r.id]||r.date||'').slice(0,10), group:group,   /* [v540] check-in day attribution */ mode:_rcModeOf(group), hourBucket:hourBucket, ms:ms,
      actual:gain, target:null, sh:null, sl:null, rate:null, result:'NoStd', base:0, rank:0, goal:0, total:0, dq:false, dqReason:'' };
    if(r.dead) { row.dq=true; row.dqReason='Death'; }
    else if(sess.ignored) { row.dq=true; row.dqReason='Admin Excluded'; }
    else if(sess.dup) { row.dq=true; row.dqReason='Duplicate'; }
    else if(_dupHour[r.id]) { row.dq=true; row.dqReason='Duplicate Hour'; }   /* [v561] same booster+client+day+hour submitted again later (e.g. checkout backfill over a live-reported day) — the earliest submission keeps the score */
    else if(sess.flag) { row.dq=true; row.dqReason='EXP Jump'; }
    else if(dqSet.has && dqSet.has(r.id)) { row.dq=true; row.dqReason='Safety Issue'; }
    if(sess.target!=null && Number(sess.target)>0){
      var t=Number(sess.target), sh=Number(sess.sh), sl=Number(sess.sl);
      row.target=t; row.sh=sh; row.sl=sl; row.rate=t>0?(gain/t*100):null;
      if(gain>=sh) row.result='Goal'; else if(gain>=sl) row.result='Stable'; else row.result='Cut';
    }
    var eligible=(!row.dq)&&(row.result==='Goal'||row.result==='Stable');
    if(eligible) row.base=base;
    if(eligible && row.rate!=null){ if(row.rate>=120) row.goal=Number(gb.t120); else if(row.rate>=110) row.goal=Number(gb.t110); else if(row.rate>=100) row.goal=Number(gb.t100); }
    row.total=row.base+row.goal;
    rows.push(row);
  });
  var buckets={};
  // [v539] rank bonus compares ALL staff that hour (whole-company individual race), not per shift group
  rows.forEach(function(row){ if(row.dq) return; if(!(row.result==='Goal'||row.result==='Stable')) return; if(row.hourBucket==null) return; var k=row.date+'|'+row.hourBucket; (buckets[k]=buckets[k]||[]).push(row); });
  Object.keys(buckets).forEach(function(k){ var arr=buckets[k].sort(function(a,b){return (b.rate||0)-(a.rate||0);}); for(var i=0;i<arr.length&&i<3;i++){ var pos=i+1; var bonus=Number(rb[pos]||rb[String(pos)]||0); arr[i].rank=bonus; arr[i].total+=bonus; } });
  return rows;
}

// ============================================================================
// SERVER SHIM — the extracted _rcScoreReports references _isHiddenKey /
// _isTrainingKey as globals (they read the hidden/training exclusion sets that
// the app loads from calc_data). Here they read module-level sets that
// computePayouts() fills from its opts before scoring. Logic copied verbatim
// from index.html:22021 (_isTrainingKey) and :22037 (_isHiddenKey).
// ============================================================================
var _HIDDEN_SET = {};
var _TRAINING_SET = {};
function _isTrainingKey(key,name){ try{ if(_TRAINING_SET[String(key)]) return true; }catch(_){ } try{ if(/training|訓練|연습/i.test(String(name||''))) return true; }catch(_){ } return false; }
function _isHiddenKey(key){ try{ return !!_HIDDEN_SET[String(key)]; }catch(_){ return false; } }

// ============================================================================
// computePayouts — the payout layer, copied from index.html _kb5jComputePayouts
// (:21438) MINUS the DB writes and the toast. Same math: points x rate x
// multiplier, floored, with the 5-JUTA pool HARD CAP proportional scaling.
// Returns the exact rows the app would insert into race_payouts.
//   opts = { reports, clients, settings, hidden:{key:true}, training:{key:true},
//            dqReportIds:[...], existingPayouts:[...race_payouts rows...],
//            finalizedBy:'auto-settle' }
// ============================================================================
function computePayouts(dateStr, opts){
  opts = opts || {};
  var reports = Array.isArray(opts.reports) ? opts.reports : [];
  var clients = Array.isArray(opts.clients) ? opts.clients : [];
  var st = opts.settings || {};
  _HIDDEN_SET = opts.hidden || {};
  _TRAINING_SET = opts.training || {};
  var _dqIds = Array.isArray(opts.dqReportIds) ? opts.dqReportIds : [];
  var dqSet = { has: function(id){ return _dqIds.indexOf(id) >= 0; } };

  var rows = _rcScoreReports(reports, clients, st, dqSet);
  var day = rows.filter(function(r){ return r.date===dateStr; });
  var mult = Number(st.payout_multiplier); if(!isFinite(mult)) mult=1;
  var rate = Number(st.point_rate)||1300;
  var groups={}; day.forEach(function(r){ (groups[r.group]=groups[r.group]||[]).push(r); });
  var out=[]; var by=opts.finalizedBy||'auto-settle';
  var dayAll=_rcAggPlayers(day); var dayTotal=dayAll.reduce(function(s,p){return s+p.points;},0);
  Object.keys(groups).forEach(function(g){
    var gr=groups[g]; var mode=_rcModeOf(g);
    var players=_rcAggPlayers(gr);
    players.forEach(function(p){ if(p.points<=0) return;
      var calc=Math.floor(p.points*rate); var fin=Math.floor(calc*mult);
      out.push({ shift_date:dateStr, shift_group:g, shift_mode:mode, player:p.name, player_key:p.key,
        total_point:p.points, shift_total_point:dayTotal, shift_prize:rate, payout_multiplier:mult,
        calculated_amount:calc, final_payout_amount:fin, finalized_by:by }); });
  });
  // 5 JUTA hard cap: available = total_pool - everything already finalized on OTHER dates
  try{
    var pays = Array.isArray(opts.existingPayouts) ? opts.existingPayouts : [];
    var other=0;
    pays.forEach(function(q){ var ds=String(q.shift_date||'').slice(0,10);
      if(ds===dateStr) return;   // this date is being (re)written by this finalize
      other+=Number(q.final_payout_amount)||0; });
    var avail=Math.max(0, Number(st.total_pool)-other);
    var need=out.reduce(function(s,r){return s+r.final_payout_amount;},0);
    if(need>avail){ var f=need>0?(avail/need):0;
      out.forEach(function(r){ r.calculated_amount=Math.floor(r.calculated_amount*f); r.final_payout_amount=Math.floor(r.final_payout_amount*f); }); }
  }catch(_){ }
  return out;
}

// scoreReports exposed too, for the health-check / debugging path
function scoreReports(reports, clients, settings, hidden, training, dqReportIds){
  _HIDDEN_SET = hidden||{}; _TRAINING_SET = training||{};
  var ids = Array.isArray(dqReportIds)?dqReportIds:[];
  return _rcScoreReports(reports||[], clients||[], settings||{}, { has:function(id){return ids.indexOf(id)>=0;} });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computePayouts: computePayouts, scoreReports: scoreReports };
}
if (typeof window !== 'undefined') { window.RaceEngine = { computePayouts: computePayouts, scoreReports: scoreReports }; }

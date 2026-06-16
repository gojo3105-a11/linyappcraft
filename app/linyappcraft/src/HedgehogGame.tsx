import { useState, useEffect, useRef } from 'react';
import { HeroSVG } from './sprites/HeroSVG';
import { MonsterSVG } from './sprites/MonsterSVG';
import { questAddKill, questClaim, loadQuests, type QuestSave } from './quest';

// ── localStorage 저장/불러오기 ─────────────────────────
const HH_KEY = 'hedgehog_v2';
function loadHH() {
  try { return JSON.parse(localStorage.getItem(HH_KEY) ?? 'null') ?? {}; }
  catch { return {}; }
}

// ── 데이터 ────────────────────────────────────────────
const GRADES = [
  { name: '일반', color: '#8899AA', bg: 'rgba(10,16,26,0.96)',  border: '#2A3A4A', code: 'common' },
  { name: '희귀', color: '#44BBFF', bg: 'rgba(4,24,56,0.96)',   border: '#0E6EC0', code: 'rare'   },
  { name: '영웅', color: '#CC88FF', bg: 'rgba(30,8,60,0.96)',   border: '#7722CC', code: 'epic'   },
  { name: '전설', color: '#FFB800', bg: 'rgba(40,24,0,0.96)',   border: '#CC7800', code: 'legend' },
] as const;
type GradeCode = 'common'|'rare'|'epic'|'legend';
type GObj = typeof GRADES[number];

const PROB: Record<number,Record<GradeCode,number>> = {
  1:{common:.70,rare:.25,epic:.05,legend:.00},
  2:{common:.50,rare:.35,epic:.12,legend:.03},
  3:{common:.30,rare:.40,epic:.20,legend:.10},
  4:{common:.10,rare:.30,epic:.35,legend:.25},
};

const SLOTS   = ['무기','갑옷','투구'] as const;
type Slot = typeof SLOTS[number];
const SLOT_IC: Record<Slot,string> = { 무기:'⚔️', 갑옷:'🛡️', 투구:'⛑️' };

const MON_NAMES = ['제로 버섯','알파 슬라임','베타 고블린','감마 정령','오메가 밤송이'];
const PETS = [
  {id:'p1',name:'다람쥐 드론',atkBonus:15, cost:50,  emote:'🐿️'},
  {id:'p2',name:'레이저 새',  atkBonus:40, cost:150, emote:'🐦'},
  {id:'p3',name:'사이버 여우',atkBonus:120,cost:400, emote:'🦊'},
] as const;
type Pet = typeof PETS[number];

interface Item{type:Slot;name:string;grade:GObj;atk:number;hp:number;}
interface Mon {name:string;hp:number;maxHp:number;isBoss:boolean;}
interface Dmg {id:number;text:string;hero:boolean;}
type Tab = 'battle'|'shop'|'pet'|'dungeon';

const gradeRank=(c:string)=>['common','rare','epic','legend'].indexOf(c);

// ── SC 팔레트 ─────────────────────────────────────────
const SC = {
  bg:     '#05080F',
  panel:  'rgba(8,14,26,0.97)',
  border: 'rgba(0,200,255,0.28)',
  cyan:   '#00C8FF',
  gold:   '#FFB800',
  red:    '#FF3030',
  green:  '#22DD66',
  dim:    'rgba(0,200,255,0.08)',
};

// ── Component ─────────────────────────────────────────
export default function HedgehogGame({ onSwitchGame = () => {} }: { onSwitchGame?: () => void } = {}) {
  const _s = loadHH();
  const [gold,     setGold]     = useState<number>(_s.gold     ?? 2000);
  const [diamond,  setDiamond]  = useState<number>(_s.diamond  ?? 500);
  const [lamp,     setLamp]     = useState<number>(_s.lamp     ?? 80);
  const [stage,    setStage]    = useState<number>(_s.stage    ?? 1);
  const [level,    setLevel]    = useState<number>(_s.level    ?? 1);
  const [lampLv,   setLampLv]   = useState<number>(_s.lampLv   ?? 1);
  const [trainAtk, setTrainAtk] = useState<number>(_s.trainAtk ?? 20);
  const [trainHp,  setTrainHp]  = useState<number>(_s.trainHp  ?? 200);

  const defaultEquipped: Record<Slot,Item> = {
    무기:{type:'무기',name:'나뭇가지',    grade:GRADES[0],atk:5, hp:0 },
    갑옷:{type:'갑옷',name:'나뭇잎 갑옷',grade:GRADES[0],atk:0, hp:40},
    투구:{type:'투구',name:'도토리 투구', grade:GRADES[0],atk:2, hp:15},
  };
  const fixGrade = (item: Item): Item => ({
    ...item, grade: GRADES.find(g => g.code === item.grade?.code) ?? GRADES[0],
  });
  const loadedEquipped: Record<Slot,Item> = _s.equipped
    ? Object.fromEntries(SLOTS.map(s => [s, fixGrade(_s.equipped[s] ?? defaultEquipped[s])])) as Record<Slot,Item>
    : defaultEquipped;

  const [equipped, setEquipped] = useState<Record<Slot,Item>>(loadedEquipped);
  const [recentItems, setRecentItems] = useState<Item[]>([]);

  const [ownedPets,   setOwnedPets]   = useState<Pet[]>(
    (_s.ownedPetIds as string[] | undefined)
      ?.map((id: string) => PETS.find(p => p.id === id))
      .filter(Boolean) as Pet[] ?? []
  );
  const [equippedPet, setEquippedPet] = useState<Pet|null>(
    _s.equippedPetId ? PETS.find(p => p.id === _s.equippedPetId) ?? null : null
  );

  const [newDraw,    setNewDraw]    = useState<Item|null>(null);
  const [isAuto,     setIsAuto]     = useState(false);
  const [autoTarget, setAutoTarget] = useState<GradeCode>('epic');

  const [offlineGold,     setOfflineGold]     = useState(0);
  const [showOffline,     setShowOffline]      = useState(false);
  const [quests,          setQuests]           = useState<QuestSave>(loadQuests);
  const [showQuestHH,     setShowQuestHH]      = useState(false);

  const [monster,   setMonster]  = useState<Mon>({name:'제로 버섯',hp:120,maxHp:120,isBoss:false});
  const [myHp,      setMyHp]     = useState(200);
  const [dmgs,      setDmgs]     = useState<Dmg[]>([]);
  const [heroShake, setHeroShake]= useState(false);
  const [monHit,    setMonHit]   = useState(false);

  const [tab,   setTab]   = useState<Tab>('battle');
  const [toast, setToast] = useState<string|null>(null);

  const petBonus = equippedPet?.atkBonus ?? 0;
  const totalAtk = trainAtk + SLOTS.reduce((s,k)=>s+equipped[k].atk,0) + petBonus;
  const totalHp  = trainHp  + SLOTS.reduce((s,k)=>s+equipped[k].hp, 0);

  const R = useRef({totalAtk,totalHp,stage,monster,lamp,lampLv,isAuto,autoTarget});
  R.current = {totalAtk,totalHp,stage,monster,lamp,lampLv,isAuto,autoTarget};

  const pop = (msg:string)=>{setToast(msg);setTimeout(()=>setToast(null),2200);};

  // 오프라인 보상 계산 (최초 마운트 시)
  useEffect(() => {
    const raw = loadHH();
    if (raw.lastSave) {
      const elapsed = Math.min((Date.now() - raw.lastSave) / 1000, 4 * 3600);
      const earned = Math.floor(elapsed * (raw.stage ?? 1) * 5);
      if (earned >= 100) { setOfflineGold(earned); setShowOffline(true); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 진행 상황 자동 저장
  useEffect(() => {
    const save = {
      gold, diamond, lamp, stage, level, lampLv, trainAtk, trainHp,
      equipped,
      ownedPetIds: ownedPets.map(p => p.id),
      equippedPetId: equippedPet?.id ?? null,
      lastSave: Date.now(),
    };
    localStorage.setItem(HH_KEY, JSON.stringify(save));
  }, [gold, diamond, lamp, stage, level, lampLv, trainAtk, trainHp, equipped, ownedPets, equippedPet]);

  useEffect(()=>{setMyHp(totalHp);},[totalHp]);

  useEffect(()=>{
    const t=setInterval(()=>{
      setGold(g=>g+R.current.stage*5);
      if(Math.random()<0.3)setLamp(l=>l+1);
    },1000);
    return ()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    const t=setInterval(()=>{
      const{totalAtk:atk,totalHp:hp,stage:st,monster:m}=R.current;
      const heroAtk=Math.floor(atk*(0.9+Math.random()*0.2));
      const id1=Date.now();
      setDmgs(p=>[...p.slice(-8),{id:id1,text:`-${heroAtk}`,hero:true}]);
      setTimeout(()=>setDmgs(p=>p.filter(d=>d.id!==id1)),700);
      setMonHit(true);setTimeout(()=>setMonHit(false),220);
      setMonster(prev=>{
        const nxt=prev.hp-heroAtk;
        if(nxt<=0){
          if(prev.isBoss){setDiamond(d=>d+st*100);pop(`🎉 보스 격파! 💎 +${st*100}`);}
          else{setGold(g=>g+Math.floor(st*20*(1+Math.random())));if(Math.random()<0.35)setLamp(l=>l+1);setStage(s=>s+1);}
          const q=questAddKill(); setQuests(q);
          if(q.kills===30&&!q.claimed.kill) pop('⚔️ 퀘스트 달성! 수령하세요');
          const max=Math.floor(120*Math.pow(1.3,st));
          const name=MON_NAMES[Math.floor(Math.random()*MON_NAMES.length)];
          return{name:`${name} [${st}구역]`,hp:max,maxHp:max,isBoss:false};
        }
        return{...prev,hp:nxt};
      });
      const mDmg=Math.floor(st*(m.isBoss?15:3)*(0.8+Math.random()*0.4));
      const id2=Date.now()+1;
      setDmgs(p=>[...p.slice(-8),{id:id2,text:`-${mDmg}`,hero:false}]);
      setTimeout(()=>setDmgs(p=>p.filter(d=>d.id!==id2)),700);
      setHeroShake(true);setTimeout(()=>setHeroShake(false),220);
      setMyHp(p=>(p-mDmg<=0?hp:p-mDmg));
    },800);
    return ()=>clearInterval(t);
  },[]);

  function genItem(ll:number):Item{
    const{stage:st}=R.current;
    const p=PROB[Math.min(ll,4)];
    const r=Math.random();
    const g=r<p.legend?GRADES[3]:r<p.legend+p.epic?GRADES[2]:r<p.legend+p.epic+p.rare?GRADES[1]:GRADES[0];
    const slot=SLOTS[Math.floor(Math.random()*SLOTS.length)];
    const power=Math.floor(st*6*(GRADES.indexOf(g)+1)*(0.9+Math.random()*0.2));
    return{type:slot,grade:g,name:`${g.name}급 ${slot}`,
      atk:slot==='무기'?power:slot==='투구'?Math.floor(power/3):0,
      hp: slot==='갑옷'?power*8:slot==='투구'?power*3:0};
  }

  const handleDraw=()=>{
    if(isAuto||lamp<=0)return;
    setLamp(p=>p-1);
    const item=genItem(lampLv);
    setNewDraw(item);
    setRecentItems(p=>[item,...p].slice(0,9));
  };

  useEffect(()=>{
    if(!isAuto)return;
    const t=setInterval(()=>{
      const{lamp:l,lampLv:ll,isAuto:ia,autoTarget:tgt}=R.current;
      if(!ia||l<=0){setIsAuto(false);return;}
      setLamp(p=>p-1);
      const item=genItem(ll);
      setRecentItems(p=>[item,...p].slice(0,9));
      if(gradeRank(item.grade.code)>=gradeRank(tgt)){setIsAuto(false);setNewDraw(item);pop(`🎉 ${item.grade.name} 획득!`);}
    },450);
    return ()=>clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isAuto]);

  const equipItem=()=>{if(!newDraw)return;setEquipped(p=>({...p,[newDraw.type]:newDraw}));pop(`✅ 장착 완료`);setNewDraw(null);};
  const sellItem =()=>{if(!newDraw)return;const g=(GRADES.indexOf(newDraw.grade)+1)*50;setGold(p=>p+g);setLevel(p=>p+1);pop(`+${g} 자원`);setNewDraw(null);};
  const upgradeLamp=()=>{const cost=lampLv*1000;if(gold<cost){pop('자원 부족');return;}setGold(p=>p-cost);setLampLv(p=>p+1);pop(`램프 Lv.${lampLv+1}`);};
  const buyLamps=(amt:number,price:number)=>{if(diamond<price){pop('크리스탈 부족');return;}setDiamond(p=>p-price);setLamp(p=>p+amt);pop(`🌰 ×${amt}`);};
  const buyPet=(pet:Pet)=>{if(diamond<pet.cost){pop('크리스탈 부족');return;}if(ownedPets.some(p=>p.id===pet.id)){pop('이미 보유');return;}setDiamond(p=>p-pet.cost);setOwnedPets(p=>[...p,pet]);pop(`${pet.name} 합류`);};
  const challengeBoss=()=>{const max=Math.floor(500*Math.pow(1.5,stage));setMonster({name:`심연의 대마왕 [${stage}구역]`,hp:max,maxHp:max,isBoss:true});setTab('battle');pop('⚠️ 보스 출현');};

  const hpPct =Math.max(0,(myHp/totalHp)*100);
  const monPct=Math.max(0,(monster.hp/monster.maxHp)*100);

  // 별 배경 (정적)
  const STARS = Array.from({length:40},(_,i)=>({
    x: (i*37+13)%100, y: (i*61+7)%100,
    r: i%5===0?1.5:i%3===0?1:0.7,
    o: 0.4+((i*17)%6)*0.1,
  }));

  return (
    <div className="flex flex-col max-w-md mx-auto select-none"
      style={{height:'100dvh',background:SC.bg,position:'relative',overflow:'hidden',fontFamily:"'Consolas','Courier New',monospace"}}>

      {/* ── 배경 별 ── */}
      <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" style={{zIndex:0}}>
        {STARS.map((s,i)=>(
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="white" opacity={s.o}/>
        ))}
        {/* 성운 느낌 블러 원 */}
        <ellipse cx="75%" cy="20%" rx="80" ry="50" fill="rgba(0,60,120,0.12)"/>
        <ellipse cx="20%" cy="70%" rx="60" ry="40" fill="rgba(60,0,100,0.1)"/>
      </svg>

      {/* ── Toast ── */}
      {toast&&(
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 font-bold text-xs pointer-events-none"
          style={{background:'rgba(0,8,20,0.95)',border:`1px solid ${SC.cyan}`,color:SC.cyan,
                  whiteSpace:'nowrap',boxShadow:`0 0 16px ${SC.cyan}44`,letterSpacing:1}}>
          {toast}
        </div>
      )}

      {/* ── 오프라인 보상 팝업 ── */}
      {showOffline&&(
        <div style={{position:'absolute',inset:0,zIndex:80,background:'rgba(0,0,0,0.8)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{width:'100%',maxWidth:320,background:'linear-gradient(160deg,#0a0d1a,#1a0d0a)',borderRadius:20,border:`2px solid ${SC.gold}55`,boxShadow:`0 0 40px ${SC.gold}33`,padding:24,textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:8}}>🌙</div>
            <div style={{fontSize:16,fontWeight:900,color:SC.gold,marginBottom:4}}>오프라인 보상!</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,0.5)',marginBottom:16}}>자리를 비운 동안 골드를 모았어요</div>
            <div style={{fontSize:28,fontWeight:900,color:SC.gold,textShadow:`0 0 20px ${SC.gold}`,marginBottom:20}}>
              💰 +{offlineGold.toLocaleString()}
            </div>
            <button onClick={()=>{setGold(g=>g+offlineGold);setShowOffline(false);pop(`💰 +${offlineGold.toLocaleString()} 골드 수령!`);}}
              style={{width:'100%',padding:'14px',borderRadius:999,background:`linear-gradient(135deg,${SC.gold},#FF8C00)`,border:'none',cursor:'pointer',fontWeight:900,fontSize:16,color:'#3D1C00',boxShadow:`0 6px 0 #8B4500`}}>
              수령하기 💰
            </button>
          </div>
        </div>
      )}

      {/* ── 퀘스트 팝업 ── */}
      {showQuestHH&&(
        <div style={{position:'absolute',inset:0,zIndex:80,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{width:'100%',maxWidth:340,background:'linear-gradient(160deg,#0a0d1a,#0d1a0d)',borderRadius:20,border:`2px solid ${SC.gold}44`,boxShadow:`0 20px 60px rgba(0,0,0,0.8)`,overflow:'hidden'}}>
            <div style={{padding:'16px 16px 12px',borderBottom:`1px solid ${SC.gold}33`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:16,fontWeight:900,color:SC.gold,letterSpacing:1}}>📋 일일 퀘스트</span>
              <button onClick={()=>setShowQuestHH(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'rgba(255,255,255,0.5)',lineHeight:1}}>✕</button>
            </div>
            <div style={{padding:12,display:'flex',flexDirection:'column',gap:8}}>
              {[
                {key:'game' as const,icon:'🎮',label:'AniPang 3판 클리어',target:3,current:quests.gamesCleared,reward:'🌰 +50',claimed:quests.claimed.game},
                {key:'combo' as const,icon:'⚡',label:'AniPang 5x 콤보',target:5,current:quests.maxCombo,reward:'💎 +100',claimed:quests.claimed.combo},
                {key:'kill' as const,icon:'⚔️',label:'적 30마리 처치',target:30,current:quests.kills,reward:'💰 +1000',claimed:quests.claimed.kill},
              ].map(q=>{
                const done=q.current>=q.target;
                return (
                  <div key={q.key} style={{padding:'10px 12px',borderRadius:12,background:q.claimed?'rgba(255,255,255,0.03)':done?`${SC.gold}18`:'rgba(255,255,255,0.04)',border:`1px solid ${q.claimed?'rgba(255,255,255,0.08)':done?`${SC.gold}55`:'rgba(255,255,255,0.08)'}`,display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:20,opacity:q.claimed?0.4:1}}>{q.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:800,color:q.claimed?'rgba(255,255,255,0.3)':'white'}}>{q.label}</div>
                      <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginTop:2}}>{q.claimed?'완료 ✓':`${Math.min(q.current,q.target)} / ${q.target}`}</div>
                      {!q.claimed&&<div style={{marginTop:4,height:4,borderRadius:999,background:'rgba(255,255,255,0.08)',overflow:'hidden'}}>
                        <div style={{height:'100%',borderRadius:999,background:`linear-gradient(90deg,${SC.cyan},${SC.gold})`,width:`${Math.min((q.current/q.target)*100,100)}%`,transition:'width 0.3s'}}/>
                      </div>}
                    </div>
                    {done&&!q.claimed&&(
                      <button onClick={()=>{const r=questClaim(q.key);if(r.success){setQuests(loadQuests());if(q.key==='game')setLamp(l=>l+50);if(q.key==='combo')setDiamond(d=>d+100);if(q.key==='kill')setGold(g=>g+1000);pop(`🎉 ${r.reward} 수령!`);}}}
                        style={{padding:'6px 10px',borderRadius:999,background:`linear-gradient(135deg,${SC.gold},#FF8C00)`,border:'none',cursor:'pointer',fontSize:10,fontWeight:900,color:'#3D1C00',whiteSpace:'nowrap'}}>
                        수령 {q.reward}
                      </button>
                    )}
                    {q.claimed&&<span style={{fontSize:18,opacity:0.5}}>✅</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════ HUD ════ */}
      <div className="shrink-0 relative z-10 flex items-center gap-2.5 px-3 py-2"
        style={{background:'rgba(4,10,20,0.97)',borderBottom:`1px solid ${SC.border}`}}>
        {/* 뒤로가기 버튼 */}
        <button onClick={() => onSwitchGame()}
          className="shrink-0 flex items-center justify-center rounded font-bold text-[9px] active:scale-95 transition-all"
          style={{width:28,height:28,background:'rgba(0,200,255,0.08)',border:`1px solid ${SC.border}`,color:SC.cyan,letterSpacing:0.5}}>
          ◀
        </button>
        {/* 영웅 포트레이트 */}
        <div className="shrink-0 relative" style={{width:38,height:38}}>
          <div className="w-full h-full flex items-center justify-center rounded"
            style={{background:'rgba(0,20,40,0.9)',border:`1px solid ${SC.cyan}`,
                    boxShadow:`0 0 8px ${SC.cyan}44`}}>
            <HeroSVG size={32} animate={false}/>
          </div>
          <div className="absolute -bottom-1 -right-0.5 text-[8px] font-black px-1"
            style={{background:'#001830',border:`1px solid ${SC.cyan}`,color:SC.cyan,lineHeight:'14px'}}>
            {level}
          </div>
        </div>

        {/* HP + 이름 */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[10px] font-bold tracking-wider" style={{color:SC.cyan}}>
              고슴도치 [LV.{level}]
            </span>
            <span className="text-[9px]" style={{color:'rgba(0,200,255,0.6)'}}>
              {myHp}/{totalHp}
            </span>
          </div>
          {/* SC2 스타일 HP 바 — 세그먼트 */}
          <div className="relative rounded-sm overflow-hidden" style={{height:6,background:'rgba(0,0,0,0.6)',
              border:'1px solid rgba(0,200,255,0.2)'}}>
            <div className="h-full transition-all duration-300"
              style={{width:`${hpPct}%`,
                background:hpPct>60?'linear-gradient(90deg,#16A34A,#4ADE80)':
                           hpPct>30?'linear-gradient(90deg,#D97706,#FBBF24)':
                                    'linear-gradient(90deg,#991B1B,#EF4444)',
                boxShadow:hpPct>60?'0 0 6px #4ADE8088':hpPct>30?'0 0 6px #FBBF2488':'0 0 6px #EF444488'}}/>
            {/* 세그먼트 선 */}
            {Array.from({length:9},(_,i)=>(
              <div key={i} className="absolute top-0 bottom-0 w-px"
                style={{left:`${(i+1)*10}%`,background:'rgba(0,200,255,0.15)'}}/>
            ))}
          </div>
        </div>

        {/* 재화 + 퀘스트 버튼 */}
        <div className="shrink-0 flex flex-col gap-0.5 text-[9px] font-bold">
          <span style={{color:SC.gold}}>◈ {gold>=10000?`${(gold/1000).toFixed(1)}K`:gold.toLocaleString()}</span>
          <span style={{color:'#44AAFF'}}>◆ {diamond}</span>
          <span style={{color:'#44DD88'}}>● {lamp}</span>
          <button onClick={()=>setShowQuestHH(true)}
            style={{position:'relative',marginTop:2,padding:'2px 6px',borderRadius:6,background:`rgba(255,184,0,0.12)`,border:`1px solid ${SC.gold}55`,cursor:'pointer',fontSize:8,fontWeight:900,color:SC.gold,letterSpacing:0.5}}>
            📋 퀘스트
            {(()=>{const cnt=(quests.kills>=30&&!quests.claimed.kill?1:0)+(quests.gamesCleared>=3&&!quests.claimed.game?1:0)+(quests.maxCombo>=5&&!quests.claimed.combo?1:0);return cnt>0?<span style={{position:'absolute',top:-4,right:-4,width:12,height:12,borderRadius:'50%',background:'#FF3030',border:'1px solid white',fontSize:8,fontWeight:900,color:'white',display:'flex',alignItems:'center',justifyContent:'center'}}>{cnt}</span>:null;})()}
          </button>
        </div>
      </div>

      {/* ════ 전투 필드 ════ */}
      <div className="shrink-0 relative z-10 overflow-hidden" style={{height:162}}>
        {/* 우주 배경 */}
        <div className="absolute inset-0"
          style={{background:'linear-gradient(180deg,#060C1E 0%,#0A1428 55%,#101830 80%,#0C1420 100%)'}}>
          {/* 행성 */}
          <div className="absolute rounded-full"
            style={{width:80,height:80,top:-20,right:-10,
                    background:'radial-gradient(circle at 35% 30%,#1A3A6A,#0A1C3A 55%,#040E1E)',
                    boxShadow:'0 0 30px rgba(0,100,200,0.25)'}}/>
          {/* 행성 링 */}
          <div className="absolute"
            style={{width:110,height:20,top:22,right:-25,
                    borderTop:'2px solid rgba(40,120,200,0.2)',borderRadius:'50%',transform:'rotate(-15deg)'}}/>
          {/* 지면 */}
          <div className="absolute bottom-0 left-0 right-0"
            style={{height:28,background:'linear-gradient(0deg,rgba(8,20,40,0.9),rgba(10,24,50,0.6))',
                    borderTop:'1px solid rgba(0,200,255,0.2)'}}>
            {/* 지면 그리드 선 */}
            {Array.from({length:8},(_,i)=>(
              <div key={i} className="absolute top-0 bottom-0"
                style={{left:`${i*14+2}%`,width:'1px',background:'rgba(0,200,255,0.06)'}}/>
            ))}
          </div>
        </div>

        {/* 스테이지 */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold px-3 py-0.5"
          style={{background:'rgba(0,4,14,0.85)',border:`1px solid ${SC.border}`,
                  color:SC.cyan,letterSpacing:1.5,boxShadow:`0 0 10px ${SC.cyan}33`}}>
          {monster.isBoss?'⚠ BOSS':'SECTOR'} {stage}
        </div>

        {/* 몬스터 */}
        <div className={`absolute right-3 bottom-5 flex flex-col items-center transition-all duration-100
          ${monHit?'scale-90 brightness-200':''}`}>
          {/* 몬스터 HP 바 */}
          <div className="mb-0.5 rounded-sm overflow-hidden"
            style={{width:64,height:4,background:'rgba(0,0,0,0.6)',border:'1px solid rgba(255,40,40,0.3)'}}>
            <div className="h-full transition-all duration-200"
              style={{width:`${monPct}%`,
                      background:'linear-gradient(90deg,#991B1B,#EF4444)',
                      boxShadow:'0 0 6px #EF444488'}}/>
          </div>
          <div className="relative">
            <MonsterSVG size={84} isBoss={monster.isBoss}/>
            {dmgs.filter(d=>d.hero).map(d=>(
              <span key={d.id} className="absolute -top-7 left-1/2 -translate-x-1/2 font-black pointer-events-none"
                style={{fontSize:14,color:SC.gold,textShadow:`0 0 8px ${SC.gold},0 0 2px #000`,whiteSpace:'nowrap'}}>
                {d.text}
              </span>
            ))}
          </div>
          <span className="text-[8px] font-bold mt-0.5 tracking-wide"
            style={{color:monster.isBoss?'#FF8844':'rgba(255,100,100,0.8)',
                    maxWidth:80,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',display:'block',textAlign:'center'}}>
            {monster.name}
          </span>
        </div>

        {/* 펫 */}
        {equippedPet&&(
          <div className="absolute bottom-8 left-8 text-2xl"
            style={{filter:'drop-shadow(0 0 6px rgba(0,200,255,0.6))'}}>
            {equippedPet.emote}
          </div>
        )}

        {/* 영웅 */}
        <div className={`absolute bottom-2 transition-transform duration-100 ${heroShake?'-translate-x-1.5':''}`}
          style={{left:equippedPet?50:28}}>
          {dmgs.filter(d=>!d.hero).map(d=>(
            <span key={d.id} className="absolute -top-7 left-1/2 -translate-x-1/2 font-black pointer-events-none"
              style={{fontSize:14,color:SC.red,textShadow:`0 0 8px ${SC.red},0 0 2px #000`,whiteSpace:'nowrap',zIndex:10}}>
              {d.text}
            </span>
          ))}
          <HeroSVG size={88}/>
        </div>
      </div>

      {/* ════ 탭 콘텐츠 ════ */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 relative z-10"
        style={{background:'rgba(4,8,18,0.94)'}}>

        {tab==='battle'&&(
          <div className="flex flex-col h-full">
            {/* AUTO 컨트롤 바 */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2"
              style={{borderBottom:`1px solid ${SC.border}`}}>
              {/* AUTO 버튼 */}
              <button onClick={()=>setIsAuto(p=>!p)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded font-bold text-[10px] active:scale-95 transition-all"
                style={{background:isAuto?'rgba(0,180,80,0.2)':'rgba(0,200,255,0.08)',
                        border:`1px solid ${isAuto?SC.green:SC.border}`,
                        color:isAuto?SC.green:SC.cyan,
                        boxShadow:isAuto?`0 0 10px rgba(34,221,102,0.35)`:undefined,
                        letterSpacing:1}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:isAuto?SC.green:'rgba(0,200,255,0.4)',
                               display:'inline-block',boxShadow:isAuto?`0 0 6px ${SC.green}`:undefined}}/>
                AUTO {isAuto?'ON':'OFF'}
              </button>

              {/* 목표 등급 */}
              <select value={autoTarget} onChange={e=>setAutoTarget(e.target.value as GradeCode)}
                className="text-[9px] font-bold rounded outline-none px-2 py-1.5"
                style={{background:'rgba(0,12,28,0.95)',border:`1px solid ${SC.border}`,color:SC.cyan}}>
                <option value="rare">희귀↑</option>
                <option value="epic">영웅↑</option>
                <option value="legend">전설↑</option>
              </select>

              {/* 스탯 */}
              <div className="flex gap-3 ml-auto text-[9px] font-bold">
                <span style={{color:SC.gold}}>⚔ {totalAtk}</span>
                <span style={{color:SC.red}}>❤ {totalHp}</span>
                <span style={{color:'rgba(0,200,255,0.7)'}}>관문 {stage}</span>
              </div>
            </div>

            {/* 인벤토리 + 장비 슬롯 */}
            <div className="flex gap-2 px-3 pt-2.5 pb-2 shrink-0">
              {/* 아이템 그리드 */}
              <div className="flex-1">
                <div className="text-[9px] mb-1.5 tracking-widest" style={{color:'rgba(0,200,255,0.5)'}}>
                  INVENTORY
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {Array.from({length:9}).map((_,i)=>{
                    const item=recentItems[i];
                    return (
                      <button key={i} onClick={()=>{if(item)setNewDraw(item);}}
                        className="aspect-square rounded flex flex-col items-center justify-center relative overflow-hidden active:scale-95 transition-transform"
                        style={{background:item?item.grade.bg:'rgba(4,10,22,0.8)',
                                border:item?`1px solid ${item.grade.border}`:`1px solid ${SC.border}`,
                                boxShadow:item?`0 0 8px ${item.grade.border}44`:undefined}}>
                        {item?(
                          <>
                            <div className="absolute inset-0" style={{
                              background:`radial-gradient(circle at 35% 28%,${item.grade.color}18,transparent 65%)`}}/>
                            <span className="text-lg relative z-10">{SLOT_IC[item.type]}</span>
                            <span className="text-[7px] font-bold relative z-10 tracking-wide"
                              style={{color:item.grade.color}}>{item.grade.name}</span>
                          </>
                        ):(
                          <span style={{color:'rgba(0,200,255,0.15)',fontSize:16}}>+</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 장비 슬롯 */}
              <div style={{width:90}}>
                <div className="text-[9px] mb-1.5 tracking-widest" style={{color:'rgba(0,200,255,0.5)'}}>
                  EQUIPPED
                </div>
                <div className="flex flex-col gap-1.5">
                  {SLOTS.map(slot=>{
                    const item=equipped[slot];
                    return (
                      <div key={slot} className="flex items-center gap-1.5 rounded px-2 py-1.5"
                        style={{background:item.grade.bg,border:`1px solid ${item.grade.border}`,
                                boxShadow:`0 0 6px ${item.grade.border}33`}}>
                        <span className="text-sm">{SLOT_IC[slot]}</span>
                        <div>
                          <div className="text-[7px] font-bold truncate" style={{color:item.grade.color,maxWidth:52}}>
                            {item.name.length>7?item.name.slice(0,7)+'…':item.name}
                          </div>
                          <div className="text-[7px]" style={{color:'rgba(0,200,255,0.5)'}}>
                            {item.atk>0?`ATK+${item.atk}`:`HP+${item.hp}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 뽑기 결과 */}
            {newDraw&&(
              <div className="mx-3 mb-2 rounded p-2.5 shrink-0"
                style={{background:newDraw.grade.bg,border:`1px solid ${newDraw.grade.border}`,
                        boxShadow:`0 0 20px ${newDraw.grade.border}55`}}>
                <div className="text-center font-bold text-xs mb-2 tracking-wide"
                  style={{color:newDraw.grade.color}}>
                  ▶ {newDraw.name} [{newDraw.grade.name}]
                </div>
                <div className="flex gap-2 text-[9px] text-center mb-2">
                  {(['현재','획득'] as const).map((lb,idx)=>{
                    const src=idx===0?equipped[newDraw.type]:newDraw;
                    return (
                      <div key={lb} className="flex-1 py-1 rounded"
                        style={{background:'rgba(0,0,0,0.4)',border:`1px solid ${SC.border}`}}>
                        <div style={{color:'rgba(0,200,255,0.5)'}}>{lb}</div>
                        <div className="font-bold mt-0.5"
                          style={{color:idx===0?SC.red:SC.green}}>
                          {src.atk>0?`⚔${src.atk}`:`❤${src.hp}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={sellItem}
                    className="flex-1 py-1.5 rounded font-bold text-[10px] active:scale-95 transition-all"
                    style={{background:'rgba(0,0,0,0.5)',border:`1px solid ${SC.border}`,color:'rgba(0,200,255,0.6)',letterSpacing:0.5}}>
                    분해
                  </button>
                  <button onClick={equipItem}
                    className="flex-1 py-1.5 rounded font-bold text-[10px] active:scale-95 transition-all"
                    style={{background:`linear-gradient(135deg,${newDraw.grade.border}88,${newDraw.grade.color}88)`,
                            border:`1px solid ${newDraw.grade.color}`,color:'white',letterSpacing:0.5}}>
                    장착
                  </button>
                </div>
              </div>
            )}

            {/* 램프 / 뽑기 */}
            <div className="mx-3 mb-2 rounded shrink-0"
              style={{background:'rgba(0,10,24,0.9)',border:`1px solid ${SC.border}`,
                      boxShadow:`0 0 12px ${SC.cyan}11`}}>
              <div className="flex items-center gap-2 px-3 py-2">
                {/* 카운터 */}
                <div className="flex flex-col items-center shrink-0">
                  <span className="text-lg" style={{filter:`drop-shadow(0 0 6px ${SC.gold})`}}>🌰</span>
                  <span className="text-[10px] font-bold" style={{color:SC.gold}}>{lamp}</span>
                </div>

                {/* 업그레이드 */}
                <button onClick={upgradeLamp}
                  className="flex-1 py-2 rounded font-bold text-[9px] active:scale-95 transition-all tracking-wide"
                  style={{background:gold>=lampLv*1000?'rgba(200,120,0,0.2)':'rgba(0,0,0,0.3)',
                          border:`1px solid ${gold>=lampLv*1000?SC.gold:SC.border}`,
                          color:gold>=lampLv*1000?SC.gold:'rgba(0,200,255,0.3)'}}>
                  UPGRADE Lv.{lampLv}→{lampLv+1} [{lampLv}K]
                </button>

                {/* 뽑기 버튼 */}
                <button onClick={handleDraw} disabled={isAuto||lamp<=0}
                  className="shrink-0 flex flex-col items-center justify-center rounded font-bold text-[9px] active:scale-95 active:translate-y-0.5 transition-all tracking-wider"
                  style={{width:58,height:46,
                    background:(!isAuto&&lamp>0)?`linear-gradient(180deg,rgba(0,200,255,0.2),rgba(0,100,180,0.15))`:'rgba(0,0,0,0.4)',
                    border:`1px solid ${(!isAuto&&lamp>0)?SC.cyan:SC.border}`,
                    borderBottom:`3px solid ${(!isAuto&&lamp>0)?'rgba(0,120,200,0.8)':SC.border}`,
                    color:(!isAuto&&lamp>0)?SC.cyan:'rgba(0,200,255,0.2)',
                    boxShadow:(!isAuto&&lamp>0)?`0 0 12px ${SC.cyan}44`:undefined}}>
                  <span>DRAW</span>
                  <span style={{fontSize:8,opacity:0.7}}>×1</span>
                </button>
              </div>
            </div>

            {/* 다음 관문 */}
            <div className="px-3 pb-3 shrink-0">
              <button onClick={()=>setStage(p=>p+1)}
                className="w-full py-2 rounded font-bold text-xs active:scale-95 transition-transform tracking-widest"
                style={{background:'rgba(0,200,255,0.1)',border:`1px solid ${SC.cyan}`,
                        color:SC.cyan,boxShadow:`0 0 10px ${SC.cyan}22`}}>
                ▶ NEXT SECTOR [{stage+1}]
              </button>
            </div>
          </div>
        )}

        {/* ─── 상점 ─── */}
        {tab==='shop'&&(
          <div className="p-3 flex flex-col gap-2.5">
            <div className="text-[10px] font-bold tracking-widest mb-1" style={{color:SC.cyan}}>◈ STORE</div>
            {[{label:'도토리 [소]',amt:30,price:100,desc:'🌰 ×30'},
              {label:'도토리 [대]',amt:100,price:300,desc:'🌰 ×100'}].map(it=>(
              <div key={it.label} className="flex items-center justify-between rounded p-3"
                style={{background:'rgba(0,10,28,0.9)',border:`1px solid ${SC.border}`}}>
                <div>
                  <div className="text-sm font-bold" style={{color:'rgba(0,200,255,0.85)'}}>{it.label}</div>
                  <div className="text-[10px] mt-0.5" style={{color:'rgba(0,200,255,0.4)'}}>{it.desc}</div>
                </div>
                <button onClick={()=>buyLamps(it.amt,it.price)}
                  className="px-4 py-2 rounded font-bold text-xs active:scale-95"
                  style={{background:diamond>=it.price?'rgba(0,100,180,0.35)':'rgba(0,0,0,0.4)',
                          border:`1px solid ${diamond>=it.price?'#44AAFF':SC.border}`,
                          color:diamond>=it.price?'#44BBFF':'rgba(0,200,255,0.25)'}}>
                  ◆ {it.price}
                </button>
              </div>
            ))}
            <div className="rounded p-3" style={{background:'rgba(0,10,28,0.9)',border:`1px solid ${SC.border}`}}>
              <div className="flex justify-between text-[10px] mb-2">
                <span style={{color:SC.cyan}}>PERMANENT UPGRADE</span>
                <span style={{color:SC.gold}}>LV.{level}</span>
              </div>
              <div className="text-[9px] mb-2" style={{color:'rgba(0,200,255,0.45)'}}>ATK +6 / HP +40 (영구)</div>
              <button onClick={()=>{const cost=level*120;if(gold<cost){pop('자원 부족');return;}setGold(g=>g-cost);setTrainAtk(a=>a+6);setTrainHp(h=>h+40);setLevel(l=>l+1);pop('강화 완료');}}
                className="w-full py-2 rounded font-bold text-xs active:scale-95 tracking-wide"
                style={{background:gold>=level*120?'rgba(200,140,0,0.2)':'rgba(0,0,0,0.4)',
                        border:`1px solid ${gold>=level*120?SC.gold:SC.border}`,
                        color:gold>=level*120?SC.gold:'rgba(0,200,255,0.25)'}}>
                ◈ {(level*120).toLocaleString()} 자원 소모
              </button>
            </div>
          </div>
        )}

        {/* ─── 동료 ─── */}
        {tab==='pet'&&(
          <div className="p-3 flex flex-col gap-2.5">
            <div className="text-[10px] font-bold tracking-widest mb-1" style={{color:SC.cyan}}>◈ COMPANIONS</div>
            {PETS.map(pet=>{
              const owned=ownedPets.some(p=>p.id===pet.id);
              const isEquip=equippedPet?.id===pet.id;
              return (
                <div key={pet.id} className="flex items-center gap-3 rounded p-3"
                  style={{background:owned?'rgba(80,0,120,0.35)':'rgba(0,10,28,0.9)',
                          border:`1px solid ${owned?'#7722CC':SC.border}`}}>
                  <div className="text-3xl">{pet.emote}</div>
                  <div className="flex-1">
                    <div className="text-xs font-bold" style={{color:'rgba(0,200,255,0.85)'}}>{pet.name}</div>
                    <div className="text-[9px] mt-0.5" style={{color:SC.gold}}>ATK +{pet.atkBonus}</div>
                  </div>
                  {owned?(
                    <button onClick={()=>setEquippedPet(isEquip?null:pet)}
                      className="px-3 py-1.5 rounded font-bold text-[10px] active:scale-95"
                      style={{background:isEquip?'rgba(180,0,0,0.3)':'rgba(0,50,100,0.5)',
                              border:`1px solid ${isEquip?SC.red:'#3B82F6'}`,
                              color:isEquip?SC.red:'#60A5FA'}}>
                      {isEquip?'해제':'출전'}
                    </button>
                  ):(
                    <button onClick={()=>buyPet(pet)}
                      className="px-3 py-1.5 rounded font-bold text-[10px] active:scale-95"
                      style={{background:diamond>=pet.cost?'rgba(0,80,160,0.35)':'rgba(0,0,0,0.4)',
                              border:`1px solid ${diamond>=pet.cost?'#44AAFF':SC.border}`,
                              color:diamond>=pet.cost?'#44BBFF':'rgba(0,200,255,0.25)'}}>
                      ◆ {pet.cost}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── 던전 ─── */}
        {tab==='dungeon'&&(
          <div className="p-3">
            <div className="text-[10px] font-bold tracking-widest mb-3" style={{color:SC.red}}>⚠ BOSS RAID</div>
            <div className="rounded overflow-hidden"
              style={{border:`1px solid ${SC.red}88`,boxShadow:`0 0 20px ${SC.red}33`}}>
              <div className="py-6 flex flex-col items-center"
                style={{background:'rgba(40,0,0,0.7)'}}>
                <MonsterSVG size={100} isBoss={true} animate={false}/>
                <div className="text-sm font-bold mt-2 tracking-wide" style={{color:SC.red}}>
                  SECTOR {stage} BOSS
                </div>
                <div className="text-[9px] mt-1" style={{color:'rgba(255,80,80,0.6)'}}>
                  HP: {Math.floor(500*Math.pow(1.5,stage)).toLocaleString()}
                </div>
                <div className="text-[10px] mt-1 font-bold" style={{color:SC.gold}}>
                  보상: ◆ ×{stage*100}
                </div>
              </div>
              <button onClick={challengeBoss}
                className="w-full py-3 font-bold text-xs active:scale-95 tracking-widest"
                style={{background:'rgba(120,0,0,0.6)',borderTop:`1px solid ${SC.red}88`,color:SC.red}}>
                ▶ ENGAGE BOSS
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════ 하단 내비 ════ */}
      <div className="shrink-0 z-10 grid grid-cols-4 relative"
        style={{background:'rgba(4,8,18,0.98)',borderTop:`1px solid ${SC.border}`}}>
        {([
          ['battle','🦔','UNIT'  ],
          ['shop',  '◈', 'STORE' ],
          ['pet',   '🦊','SQUAD' ],
          ['dungeon','⚠','RAID'  ],
        ] as const).map(([t,ic,lb])=>(
          <button key={t} onClick={()=>setTab(t)}
            className="flex flex-col items-center py-2.5 gap-0.5 active:scale-95 transition-all relative"
            style={{color:tab===t?SC.cyan:'rgba(0,200,255,0.3)'}}>
            {tab===t&&(
              <div className="absolute top-0 left-2 right-2 h-px"
                style={{background:`linear-gradient(90deg,transparent,${SC.cyan},transparent)`}}/>
            )}
            <span style={{fontSize:16,lineHeight:1,filter:tab===t?`drop-shadow(0 0 6px ${SC.cyan})`:undefined}}>
              {ic}
            </span>
            <span className="text-[8px] font-bold tracking-widest">{lb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

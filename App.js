import React,{useEffect,useState} from 'react';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import {SafeAreaView,View,Text as RNText,ScrollView,TouchableOpacity,StatusBar,StyleSheet,Switch,Image,Alert} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowAlert:true,shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
const NOTIFICATION_TYPES=[['trade','AI Smart Trade Decision','BUY CE / BUY PE signals'],['breakout','Breakout / Breakdown','Confirmed market breakouts'],['option','Option Chain AI','Smart Money OI and trap alerts'],['levels','Support & Resistance','Important level alerts'],['sentiment','Market Sentiment','Bullish / Bearish changes'],['scalping','AI Smart Scalping','New valid scalping setups']];
const NOTIFICATION_CHANNELS={trade:{id:'vgrow-ai-trade',name:'AI Smart Trade Decision',sound:'ai_trade.wav'},breakout:{id:'vgrow-breakout',name:'Breakout / Breakdown',sound:'breakout.wav'},option:{id:'vgrow-option-chain',name:'Option Chain AI',sound:'option_chain.wav'},levels:{id:'vgrow-support-resistance',name:'Support & Resistance',sound:'support_resistance.wav'},sentiment:{id:'vgrow-market-sentiment',name:'Market Sentiment',sound:'market_sentiment.wav'},scalping:{id:'vgrow-ai-scalping',name:'AI Smart Scalping',sound:'scalping.wav'}};
async function ensureNotificationChannels(){for(const channel of Object.values(NOTIFICATION_CHANNELS)){await Notifications.setNotificationChannelAsync(channel.id,{name:channel.name,importance:Notifications.AndroidImportance.HIGH,sound:channel.sound,vibrationPattern:[0,150,80,150],enableVibrate:true});}}

const VGROW_MARKET_BACKGROUND_TASK='VGROW_MARKET_BACKGROUND_TASK';
const INDEX_SYMBOLS={NIFTY:'NSE:NIFTY50-INDEX',BANKNIFTY:'NSE:NIFTYBANK-INDEX',FINNIFTY:'NSE:FINNIFTY-INDEX',SENSEX:'BSE:SENSEX-INDEX'};
async function sendMarketAlert(type,title,body,dedupeKey){
 const enabled=(await SecureStore.getItemAsync('vgrow_notifications_enabled'))==='enabled';
 const preference=await SecureStore.getItemAsync('vgrow_notify_pref_'+type);
 if(!enabled||preference==='disabled')return false;
 const key='vgrow_alert_last_'+type;
 if(dedupeKey&&await SecureStore.getItemAsync(key)===dedupeKey)return false;
 await ensureNotificationChannels();
 const sound=(await SecureStore.getItemAsync('vgrow_notify_sound'))!=='disabled';
 const vibration=(await SecureStore.getItemAsync('vgrow_notify_vibration'))!=='disabled';
 await Notifications.scheduleNotificationAsync({content:{title:'Vgrow • '+title,body,sound:sound?NOTIFICATION_CHANNELS[type].sound:false,data:{type}},trigger:{type:Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,seconds:1,channelId:NOTIFICATION_CHANNELS[type].id}});
 if(dedupeKey)await SecureStore.setItemAsync(key,dedupeKey);
 return true;
}
async function notifyOnStateChange(type,state,title,body,notifyWait=false){
 const key='vgrow_alert_state_'+type;
 const previous=await SecureStore.getItemAsync(key);
 await SecureStore.setItemAsync(key,state);
 if(previous===null||previous===state)return false;
 if(state==='WAIT'&&!notifyWait)return false;
 return sendMarketAlert(type,title,body,type+':'+state+':'+Date.now());
}
async function processMarketAlerts(index,analysis,quotes,optionChain,selectedStrike,selectedType){
 if(analysis?.status!=='live'||analysis?.ai_analysis?.status!=='live')return;
 const ai=analysis.ai_analysis||{},candles=Array.isArray(analysis.candles)?analysis.candles:[];
 const last=candles[candles.length-1],prev=candles[candles.length-2];
 const stamp=String(last?.time||analysis.last_updated||'');
 const price=Number(last?.close),ind=analysis.indicators||{};
 const valid=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n));
 if(!last||!stamp||!valid(price)||price<=0)return;
 const chainLive=optionChain?.status==='live'&&Array.isArray(optionChain.options_chain)&&optionChain.options_chain.length>0;
 const rows=chainLive?optionChain.options_chain:[];
 const pcr=Number(optionChain?.summary?.pcr);
 const risk=Number(ai.risk_score);
 const tradeReady=chainLive&&valid(pcr)&&valid(risk)&&risk<65;
 const trade=tradeReady&&ai.market_bias==='BULLISH'&&pcr>=1.1?'BUY CE':tradeReady&&ai.market_bias==='BEARISH'&&pcr<=0.9?'BUY PE':'WAIT';
 if(tradeReady)await notifyOnStateChange('trade',trade,'AI Smart Trade Decision',trade+' • '+index+' | PCR '+pcr.toFixed(2)+' | Risk '+Math.round(risk)+'/100',true);
 const breakout=ai.breakout_status;
 if(['BREAKOUT','BREAKDOWN'].includes(breakout))await sendMarketAlert('breakout','Breakout / Breakdown',(breakout==='BREAKOUT'?'Confirmed upside breakout':'Confirmed downside breakdown')+' • '+index+' • '+price,stamp+':'+breakout);
 if(chainLive){
  const oiCandidates=rows.filter(r=>valid(r.oi_change)&&Number(r.oi_change)!==0&&valid(r.ltp)).map(r=>{
   const change=Number(r.change??r.ltp_change??r.price_change);
   let signal='';if(valid(change)){const oi=Number(r.oi_change);signal=oi>0&&change>0?'LONG BUILD-UP':oi>0&&change<0?'SHORT BUILD-UP':oi<0&&change>0?'SHORT COVERING':oi<0&&change<0?'LONG UNWINDING':'';}
   return {...r,signal,absOi:Math.abs(Number(r.oi_change))};
  }).filter(r=>r.signal);
  oiCandidates.sort((a,b)=>b.absOi-a.absOi);
  const top=oiCandidates[0];
  if(top){const oiStamp=String(optionChain.last_updated||optionChain.timestamp||stamp);await sendMarketAlert('option','Option Chain AI',top.signal+' • '+top.option_type+' '+top.strike_price+' • OI change '+top.oi_change,oiStamp+':'+top.option_type+':'+top.strike_price+':'+top.signal);}
  const calls=rows.filter(r=>r.option_type==='CE'&&Number(r.oi)>0).sort((a,b)=>Number(b.oi)-Number(a.oi));
  const puts=rows.filter(r=>r.option_type==='PE'&&Number(r.oi)>0).sort((a,b)=>Number(b.oi)-Number(a.oi));
  const resistance=Number(calls[0]?.strike_price),support=Number(puts[0]?.strike_price);
  if(prev&&valid(prev.close)){
   const prior=Number(prev.close);
   if(valid(resistance)&&prior<resistance&&price>=resistance)await sendMarketAlert('levels','Support & Resistance','Price crossed strongest CE OI resistance '+resistance+' • '+index,stamp+':RES:'+resistance);
   if(valid(support)&&prior>support&&price<=support)await sendMarketAlert('levels','Support & Resistance','Price crossed strongest PE OI support '+support+' • '+index,stamp+':SUP:'+support);
  }
 }
 const quoteRows=Array.isArray(quotes?.quotes)?quotes.quotes:[];
 const usable=quoteRows.filter(q=>valid(q.change_percent));
 if(quotes?.status==='live'&&usable.length){
  const up=usable.filter(q=>Number(q.change_percent)>0).length,down=usable.filter(q=>Number(q.change_percent)<0).length;
  const sentiment=up/usable.length>=0.6?'BULLISH':down/usable.length>=0.6?'BEARISH':'NEUTRAL';
  await notifyOnStateChange('sentiment',sentiment,'Market Sentiment',sentiment+' breadth • '+up+' advances / '+down+' declines',false);
 }
 if(chainLive&&selectedStrike!==null&&selectedStrike!==undefined&&selectedType){
  const contract=rows.find(r=>Number(r.strike_price)===Number(selectedStrike)&&r.option_type===selectedType);
  const relVol=candles.length>=21&&Number(last.volume)>0?Number(last.volume)/(candles.slice(-21,-1).reduce((sum,c)=>sum+Number(c.volume||0),0)/20||1):null;
  const greeksReady=contract&&['delta','gamma','theta','vega','iv'].every(k=>valid(contract[k]));
  const oiReady=contract&&valid(contract.oi)&&valid(contract.oi_change);
  const volumeReady=contract&&Number(contract.volume)>0&&relVol!==null&&relVol>=1;
  const trendUp=Number(ind.ema20)>Number(ind.ema50)&&Number(ind.rsi14)>=55&&Number(ind.macd)>Number(ind.macd_signal)&&Number(ind.vwap)>0&&price>=Number(ind.vwap);
  const trendDown=Number(ind.ema20)<Number(ind.ema50)&&Number(ind.rsi14)<=45&&Number(ind.macd)<Number(ind.macd_signal)&&Number(ind.vwap)>0&&price<=Number(ind.vwap);
  const priceUp=!!(prev&&price>Number(prev.close)&&breakout==='BREAKOUT'),priceDown=!!(prev&&price<Number(prev.close)&&breakout==='BREAKDOWN');
  const bull=(trendUp?25:0)+(priceUp?15:0)+(oiReady&&Number(contract.oi_change)>0&&selectedType==='CE'?20:0)+(greeksReady&&Number(contract.delta)>0.35?15:0)+(volumeReady?15:0)+(risk<35?10:risk<65?5:0);
  const bear=(trendDown?25:0)+(priceDown?15:0)+(oiReady&&Number(contract.oi_change)>0&&selectedType==='PE'?20:0)+(greeksReady&&Number(contract.delta)<-0.35?15:0)+(volumeReady?15:0)+(risk<35?10:risk<65?5:0);
  const scalpReady=ai.status==='live'&&valid(risk)&&risk<65&&oiReady&&greeksReady&&volumeReady;
  const scalp=scalpReady&&selectedType==='CE'&&bull>=75?'BUY CE':scalpReady&&selectedType==='PE'&&bear>=75?'BUY PE':'WAIT';
  if(scalpReady)await notifyOnStateChange('scalping',scalp,'AI Smart Scalping',scalp+' • '+selectedStrike+' '+selectedType+' • Score '+(selectedType==='CE'?bull:bear)+'/100',false);
 }
}
TaskManager.defineTask(VGROW_MARKET_BACKGROUND_TASK,async()=>{
 try{
  const index=(await SecureStore.getItemAsync('vgrow_selected_index'))||'NIFTY';
  const symbol=INDEX_SYMBOLS[index]||INDEX_SYMBOLS.NIFTY;
  const [quotesResponse,analysisResponse,chainResponse]=await Promise.all([
   fetch('https://fyers-smart-ai-1.onrender.com/market/quotes'),
   fetch('https://fyers-smart-ai-1.onrender.com/market/analysis?symbol='+encodeURIComponent(symbol)+'&resolution=5'),
   fetch('https://fyers-smart-ai-1.onrender.com/market/option-chain?symbol='+encodeURIComponent(symbol)+'&strikecount=20')
  ]);
  const quotes=quotesResponse.ok?await quotesResponse.json():null;
  const analysis=analysisResponse.ok?await analysisResponse.json():null;
  const chain=chainResponse.ok?await chainResponse.json():null;
  if(quotes)await SecureStore.setItemAsync('vgrow_background_quotes',JSON.stringify({saved_at:Date.now(),data:quotes}));
  if(analysis)await SecureStore.setItemAsync('vgrow_background_analysis',JSON.stringify({saved_at:Date.now(),data:analysis}));
  if(chain)await SecureStore.setItemAsync('vgrow_background_option_chain',JSON.stringify({saved_at:Date.now(),data:chain}));
  const alertsEnabled=(await SecureStore.getItemAsync('vgrow_notifications_enabled'))==='enabled';
  if(alertsEnabled&&analysis)await processMarketAlerts(index,analysis,quotes,chain,await SecureStore.getItemAsync('vgrow_scalp_strike'),await SecureStore.getItemAsync('vgrow_scalp_type'));
  return quotes||analysis||chain?BackgroundTask.BackgroundTaskResult.NewData:BackgroundTask.BackgroundTaskResult.NoData;
 }catch(e){return BackgroundTask.BackgroundTaskResult.Failed;}
});
import Svg,{Path,Line,Circle,Text as SvgText} from 'react-native-svg';

const THEMES=[
['Black Neon Green','#050A08','#101B15','#39FF14','#F7FFF9','#AFC3B5'],
['Midnight Blue','#071323','#10283B','#00BFFF','#F4FAFF','#AFC4D5'],
['Cyber Purple','#10091B','#241535','#B45CFF','#FBF7FF','#C8B8D8'],
['Graphite Silver','#17191D','#292E35','#C0C0C0','#F5F7FA','#B9C1CB'],
['Emerald Pro','#071810','#102B1D','#00C878','#F2FFF7','#AAC9B7'],
['Royal Gold','#100E0A','#211A10','#FFD700','#FFF9E8','#CFC3A6'],
['Ocean Blue','#071522','#102F43','#00E5FF','#F2FBFF','#B0C9D6'],
['Crimson Pro','#1B090C','#32151B','#FF3B5C','#FFF5F6','#D5B8BE'],
['Arctic White','#F5F8FC','#FFFFFF','#1677FF','#17202A','#526171'],
['Slate Professional','#202A35','#303D4B','#38BDF8','#F3F7FB','#B8C7D5'],
['Sunset Orange','#21100A','#3A2015','#FF8C42','#FFF8F2','#D8B9A5'],
['Rose Gold','#21151A','#38252D','#FFB6C1','#FFF7FA','#D8BBC6'],
['Titanium Blue','#111B2A','#202F43','#6495ED','#F4F7FF','#B7C5DC'],
['Matrix Green','#020B05','#0B1D10','#00FF66','#F2FFF5','#A8CDB2'],
['Deep Ocean Teal','#071B1C','#123334','#00D6C9','#F1FFFE','#AED0CD'],
['AMOLED Black','#000000','#101010','#00E676','#FFFFFF','#B8C4BC'],
['Luxury Champagne','#1B1710','#302719','#F7D794','#FFF9EC','#D5C8AE'],
['Electric Blue','#050B20','#111F42','#2979FF','#F4F7FF','#B7C8E8'],
['Cyber Red','#16070B','#2B1119','#FF1744','#FFF5F7','#D8B9C2'],
['Premium Light','#F7F8F4','#FFFFFF','#00A86B','#17231C','#52645A']
];
const LANGS=['English','मराठी','हिंदी','ગુજરાતી','தமிழ்','తెలుగు'];
const RiskGauge=({fg,muted,score,status})=>{const valid=Number.isFinite(Number(score))&&status==='live';const value=valid?Math.max(0,Math.min(100,Number(score))):null;const angle=value===null?0:value*1.8-90;return <View style={{alignItems:'center',paddingTop:8,paddingBottom:4}}><Svg width={260} height={155} viewBox="0 0 240 145"><Path d="M 32 120 A 88 88 0 0 1 76 44" stroke="#20C779" strokeWidth="15" fill="none" strokeLinecap="round"/><Path d="M 76 44 A 88 88 0 0 1 164 44" stroke="#F4B942" strokeWidth="15" fill="none" strokeLinecap="round"/><Path d="M 164 44 A 88 88 0 0 1 208 120" stroke="#F05B62" strokeWidth="15" fill="none" strokeLinecap="round"/><Line x1="120" y1="120" x2="120" y2="48" transform={`rotate(${angle} 120 120)`} stroke={fg} strokeWidth="3" strokeLinecap="round"/><Circle cx="120" cy="120" r="7" fill="#00E676"/><SvgText x="120" y="100" fontSize="25" fontWeight="bold" fill={fg} textAnchor="middle">{value===null?'--':Math.round(value)}</SvgText><SvgText x="120" y="137" fontSize="9" fontWeight="bold" fill={muted} textAnchor="middle">RISK SCORE / 100</SvgText></Svg><View style={{width:'88%',flexDirection:'row',justifyContent:'space-between',marginTop:-2}}><RNText style={{color:'#20C779',fontSize:10,fontWeight:'800'}}>LOW</RNText><RNText style={{color:'#F4B942',fontSize:10,fontWeight:'800'}}>MODERATE</RNText><RNText style={{color:'#F05B62',fontSize:10,fontWeight:'800'}}>HIGH</RNText></View><RNText style={{color:muted,fontSize:10,marginTop:10,fontWeight:'700'}}>{valid?String(aiRiskLevel(value))+' RISK • VERIFIED FYERS DATA':'LIVE MARKET DATA PENDING'}</RNText></View>;};
function aiRiskLevel(value){return value>=65?'HIGH':value>=35?'MODERATE':'LOW';}
function perfDateKey(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return y+'-'+m+'-'+d;}
function perfFormatDate(key){const [y,m,d]=String(key).split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}
const TXT=[
{home:'HOME',chart:'CHART',ai:'AI ANALYSIS',options:'OPTIONS',settings:'SETTINGS',market:'LIVE MARKET',pending:'Connect FYERS to view live prices',sentiment:'MARKET SENTIMENT',support:'SUPPORT & RESISTANCE',indicators:'TECHNICAL INDICATORS',theme:'APP THEME',language:'APP LANGUAGE',notify:'NOTIFICATIONS',finger:'FINGERPRINT LOCK',ro:'READ ONLY  •  ORDER EXECUTION DISABLED'},
{home:'मुख्यपृष्ठ',chart:'चार्ट',ai:'AI विश्लेषण',options:'ऑप्शन्स',settings:'सेटिंग्ज',market:'लाईव्ह मार्केट',pending:'लाईव्ह भावांसाठी FYERS जोडा',sentiment:'मार्केटचा कल',support:'सपोर्ट आणि रेसिस्टन्स',indicators:'टेक्निकल इंडिकेटर्स',theme:'अ‍ॅप थीम',language:'अ‍ॅप भाषा',notify:'नोटिफिकेशन्स',finger:'फिंगरप्रिंट लॉक',ro:'फक्त माहिती  •  ऑर्डर देणे बंद'},
{home:'होम',chart:'चार्ट',ai:'AI विश्लेषण',options:'ऑप्शन्स',settings:'सेटिंग्स',market:'लाइव मार्केट',pending:'लाइव भाव के लिए FYERS जोड़ें',sentiment:'मार्केट रुझान',support:'सपोर्ट और रेसिस्टेंस',indicators:'टेक्निकल इंडिकेटर्स',theme:'ऐप थीम',language:'ऐप भाषा',notify:'नोटिफिकेशन',finger:'फिंगरप्रिंट लॉक',ro:'केवल जानकारी  •  ऑर्डर बंद'}];
export default function App(){
 const [page,setPage]=useState('home'),[theme,setTheme]=useState(0),[themeReady,setThemeReady]=useState(false),[lang,setLang]=useState(0),[time,setTime]=useState(new Date()),[notify,setNotify]=useState(false),[finger,setFinger]=useState(false),[selectedFont,setSelectedFont]=useState('Roboto'),[fontScale,setFontScale]=useState(1);
 const [notifyPrefs,setNotifyPrefs]=useState({trade:true,breakout:true,option:true,levels:true,sentiment:true,scalping:true}),[notifySound,setNotifySound]=useState(true),[notifyVibration,setNotifyVibration]=useState(true);
 const [selectedIndex,setSelectedIndex]=useState('NIFTY');
 const [optionChain,setOptionChain]=useState(null);
 const [optionChainStatus,setOptionChainStatus]=useState('connecting');
 const [optionSignalHistory,setOptionSignalHistory]=useState([]);
 const [optionSnapshotHistory,setOptionSnapshotHistory]=useState([]);
 const [scalpStrike,setScalpStrike]=useState(null);
 const [scalpType,setScalpType]=useState('CE');
 const [scalpChainTab,setScalpChainTab]=useState('LTP');
 const [performanceRecords,setPerformanceRecords]=useState([]);
 const [performanceLoaded,setPerformanceLoaded]=useState(false);
 const [performanceDate,setPerformanceDate]=useState(perfDateKey(new Date()));
 const [performanceMonth,setPerformanceMonth]=useState(new Date());
 const [performanceLastCandle,setPerformanceLastCandle]=useState('');
 const optionSymbols={'NIFTY':'NSE:NIFTY50-INDEX','BANKNIFTY':'NSE:NIFTYBANK-INDEX','FINNIFTY':'NSE:FINNIFTY-INDEX','SENSEX':'BSE:SENSEX-INDEX'};
 const optionUnderlying=optionSymbols[selectedIndex];
 const optionRows=optionChain?.options_chain||[];
 const optionSummary=optionChain?.summary||{};
 const optionSpot=optionChain?.underlying_value;
 const optionExpiry=optionChain?.expiry_data?.[0]?.date||optionChain?.expiry_data?.[0]?.expiry||'--';
 const optionAtm=optionSpot&&optionRows.length?optionRows.reduce((best,row)=>Math.abs(row.strike_price-optionSpot)<Math.abs(best-optionSpot)?row.strike_price:best,optionRows[0].strike_price):null;
 const optionNearby=[...new Set(optionRows.filter(x=>Number(x.strike_price)>0&&['CE','PE'].includes(x.option_type)).map(x=>x.strike_price))].sort((x,y)=>x-y);
 const optionFmt=(v,d=0)=>v===null||v===undefined?'--':Number(v).toLocaleString('en-IN',{maximumFractionDigits:d});
 const optionCallOI=Number(optionSummary.call_oi)||0,optionPutOI=Number(optionSummary.put_oi)||0;
 const optionTotalOI=optionCallOI+optionPutOI;
 const optionPcr=Number.isFinite(Number(optionSummary.pcr))?Number(optionSummary.pcr):null;
 const optionSentiment=optionPcr===null?'PENDING':optionPcr>=1.2?'BULLISH (PCR)':optionPcr<=0.8?'BEARISH (PCR)':'NEUTRAL (PCR)';
 const optionDominance=optionCallOI===0&&optionPutOI===0?'--':optionPutOI>optionCallOI?'PE OI DOMINANT':optionCallOI>optionPutOI?'CE OI DOMINANT':'BALANCED';
 const scalpContract=optionRows.find(x=>x.strike_price===Number(scalpStrike)&&x.option_type===scalpType)||null;
 const optionLiveReady=optionChainStatus==='live'&&optionRows.length>0&&Number(optionSpot)>0;
 const optionValidRows=optionRows.filter(x=>Number(x.strike_price)>0&&['CE','PE'].includes(x.option_type));
 const optionCalls=optionValidRows.filter(x=>x.option_type==='CE'),optionPuts=optionValidRows.filter(x=>x.option_type==='PE');
 const oiRank=(rows)=>[...rows].filter(x=>Number(x.oi)>0).sort((a,b)=>Number(b.oi)-Number(a.oi));
 const callOiRank=oiRank(optionCalls),putOiRank=oiRank(optionPuts);
 const callWall=callOiRank[0]||null,putWall=putOiRank[0]||null;
 const callWall2=callOiRank[1]||null,putWall2=putOiRank[1]||null;
 const atmCall=optionAtm===null?null:optionCalls.find(x=>Number(x.strike_price)===Number(optionAtm));
 const atmPut=optionAtm===null?null:optionPuts.find(x=>Number(x.strike_price)===Number(optionAtm));
 const greekRows=[atmCall,atmPut].filter(x=>x);
 const greekValue=(key)=>{const vals=greekRows.map(x=>Number(x[key])).filter(Number.isFinite);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;};
 const greekReady=(key)=>greekRows.length===2&&greekRows.every(x=>x[key]!==null&&x[key]!==undefined&&Number.isFinite(Number(x[key])));
 const optionIv=greekReady('iv')?greekValue('iv'):null;
 const optionDelta=atmCall?.delta!==null&&atmCall?.delta!==undefined&&Number.isFinite(Number(atmCall.delta))?Number(atmCall.delta):null;
 const optionGamma=greekReady('gamma')?greekValue('gamma'):null;
 const optionTheta=greekReady('theta')?greekValue('theta'):null;
 const optionVega=greekReady('vega')?greekValue('vega'):null;
 const straddle=Number(atmCall?.ltp)>0&&Number(atmPut?.ltp)>0?Number(atmCall.ltp)+Number(atmPut.ltp):null;
 const optionTrend=aiReady?aiAnalysis.market_bias:null;
 const optionVerdictReady=optionLiveReady&&aiReady&&optionPcr!==null;
 const optionVerdict=optionVerdictReady?(optionTrend==='BULLISH'&&optionPcr>=1?'BULLISH':optionTrend==='BEARISH'&&optionPcr<=1?'BEARISH':'SIDEWAYS'):'PENDING';
 const optionVerdictConfidence=optionVerdictReady?Math.round(Math.min(95,50+Math.abs(optionPcr-1)*25+(optionTrend==='BULLISH'||optionTrend==='BEARISH'?10:0))):null;
 const optionTrendStrength=aiReady&&Number.isFinite(Number(analysisIndicators.rsi14))?Math.round(Math.min(100,Math.abs(Number(analysisIndicators.rsi14)-50)*2)):null;
 const oiSignal=(row)=>{if(!row||row.oi_change===null||row.oi_change===undefined||!Number.isFinite(Number(row.oi_change)))return 'PENDING';const oi=Number(row.oi_change),ltp=Number(row.ltp),change=Number(row.change??row.ltp_change??row.price_change);if(!Number.isFinite(change))return oi>0?'OI BUILD-UP':'OI REDUCTION';if(oi>0&&change>0)return 'LONG BUILD-UP';if(oi>0&&change<0)return 'SHORT BUILD-UP';if(oi<0&&change>0)return 'SHORT COVERING';if(oi<0&&change<0)return 'LONG UNWINDING';return 'NEUTRAL';};
 const optionBreakout=aiReady?aiAnalysis.breakout_status:null;
 const optionBullTrap=optionBreakout==='BREAKOUT'&&scalpCandles.length>=2&&Number(scalpLast?.close)<Number(scalpPrev?.high)?'POSSIBLE BULL TRAP':'NO CONFIRMED TRAP';
 const optionBearTrap=optionBreakout==='BREAKDOWN'&&scalpCandles.length>=2&&Number(scalpLast?.close)>Number(scalpPrev?.low)?'POSSIBLE BEAR TRAP':'NO CONFIRMED TRAP';
 const optionHistoryLatest=optionSignalHistory[0]||null;
 const scalpGreeks=['delta','gamma','theta','vega','iv'].every(k=>scalpContract?.[k]!==null&&scalpContract?.[k]!==undefined&&Number.isFinite(Number(scalpContract[k])));


 const [marketQuotes,setMarketQuotes]=useState({});
 const [quoteStatus,setQuoteStatus]=useState('connecting');

 const [analysisResolution,setAnalysisResolution]=useState('5');
 const [marketAnalysis,setMarketAnalysis]=useState(null);
 const [analysisStatus,setAnalysisStatus]=useState('connecting');
 const analysisSymbols={'NIFTY':'NSE:NIFTY50-INDEX','BANKNIFTY':'NSE:NIFTYBANK-INDEX','FINNIFTY':'NSE:FINNIFTY-INDEX','SENSEX':'BSE:SENSEX-INDEX'};
 const analysisSymbol=analysisSymbols[selectedIndex];
 const analysisIndicators=marketAnalysis?.indicators||{};
 const showMetric=(value,digits=2)=>value===null||value===undefined?'--':typeof value==='number'?value.toFixed(digits):String(value);
 const aiAnalysis=marketAnalysis?.ai_analysis||{};
 const aiReady=analysisStatus==='live'&&aiAnalysis.status==='live';
 const riskScore=aiReady&&aiAnalysis.risk_score!==null&&aiAnalysis.risk_score!==undefined&&Number.isFinite(Number(aiAnalysis.risk_score))?Math.max(0,Math.min(100,Number(aiAnalysis.risk_score))):null;
 const riskLevel=riskScore===null?'Awaiting data':aiRiskLevel(riskScore);
 const scalpCandles=marketAnalysis?.candles||[];
 const scalpLast=scalpCandles[scalpCandles.length-1]||null;
 const scalpPrev=scalpCandles[scalpCandles.length-2]||null;
 const scalpSpot=Number(scalpLast?.close);
 const scalpRelVolume=scalpCandles.length>=21&&Number(scalpLast?.volume)>0?(Number(scalpLast.volume)/(scalpCandles.slice(-21,-1).reduce((sum,c)=>sum+Number(c.volume||0),0)/20||1)):null;
 const scalpTrendUp=Number(analysisIndicators.ema20)>Number(analysisIndicators.ema50)&&Number(analysisIndicators.rsi14)>=55&&Number(analysisIndicators.macd)>Number(analysisIndicators.macd_signal)&&Number(analysisIndicators.vwap)>0&&scalpSpot>=Number(analysisIndicators.vwap);
 const scalpTrendDown=Number(analysisIndicators.ema20)<Number(analysisIndicators.ema50)&&Number(analysisIndicators.rsi14)<=45&&Number(analysisIndicators.macd)<Number(analysisIndicators.macd_signal)&&Number(analysisIndicators.vwap)>0&&scalpSpot<=Number(analysisIndicators.vwap);
 const scalpPriceUp=!!(scalpLast&&scalpPrev&&scalpLast.close>scalpPrev.close&&aiAnalysis.breakout_status==='BREAKOUT');
 const scalpPriceDown=!!(scalpLast&&scalpPrev&&scalpLast.close<scalpPrev.close&&aiAnalysis.breakout_status==='BREAKDOWN');
 const scalpOiReady=scalpContract?.oi!==null&&scalpContract?.oi!==undefined&&scalpContract?.oi_change!==null&&scalpContract?.oi_change!==undefined;
 const scalpVolumeReady=Number(scalpContract?.volume)>0&&scalpRelVolume!==null&&scalpRelVolume>=1;
 const scalpDataReady=aiReady&&optionChainStatus==='live'&&!!scalpContract&&Number(scalpContract.ltp)>0&&scalpOiReady&&scalpVolumeReady&&scalpGreeks&&Number.isFinite(scalpSpot)&&scalpSpot>0&&riskScore!==null;
 const scalpBullScore=(scalpTrendUp?25:0)+(scalpPriceUp?15:0)+(scalpOiReady&&Number(scalpContract?.oi_change)>0&&scalpType==='CE'?20:0)+(scalpGreeks&&Number(scalpContract?.delta)>0.35?15:0)+(scalpVolumeReady?15:0)+(riskScore!==null&&riskScore<35?10:riskScore!==null&&riskScore<65?5:0);
 const scalpBearScore=(scalpTrendDown?25:0)+(scalpPriceDown?15:0)+(scalpOiReady&&Number(scalpContract?.oi_change)>0&&scalpType==='PE'?20:0)+(scalpGreeks&&Number(scalpContract?.delta)<-0.35?15:0)+(scalpVolumeReady?15:0)+(riskScore!==null&&riskScore<35?10:riskScore!==null&&riskScore<65?5:0);
 const scalpSignal=!scalpDataReady?'WAIT':riskScore>=65?'WAIT':scalpType==='CE'&&scalpBullScore>=75?'BUY CE':scalpType==='PE'&&scalpBearScore>=75?'BUY PE':'WAIT';
 const scalpScore=scalpType==='CE'?scalpBullScore:scalpBearScore;
 const scalpSignalReason=!scalpDataReady?'Waiting for live candles, selected contract, OI, IV, all four Greeks and volume confirmation.':riskScore>=65?'Market risk is too high.':scalpSignal==='BUY CE'?'Bullish trend, breakout, CE OI, positive delta and volume conditions aligned.':scalpSignal==='BUY PE'?'Bearish trend, breakdown, PE OI, negative delta and volume conditions aligned.':'Required confirmations are not aligned; remain on WAIT.';
 const scalpIndexTarget=scalpSpot>0?(scalpSignal==='BUY CE'?scalpSpot+25:scalpSignal==='BUY PE'?scalpSpot-25:null):null;
 const scalpIndexStop=scalpSpot>0?(scalpSignal==='BUY CE'?scalpSpot-12.5:scalpSignal==='BUY PE'?scalpSpot+12.5:null):null;
 const scalpPremiumEntry=Number(scalpContract?.ltp)>0?Number(scalpContract.ltp):null;
 const scalpPremiumTarget=scalpPremiumEntry!==null&&scalpSignal!=='WAIT'?scalpPremiumEntry+25:null;
 const scalpPremiumStop=scalpPremiumEntry!==null&&scalpSignal!=='WAIT'?Math.max(0,scalpPremiumEntry-12.5):null;
 const riskCandles=marketAnalysis?.candles||[];
 const currentPrice=Number(riskCandles[riskCandles.length-1]?.close);
 const emaSpread=Number.isFinite(currentPrice)&&currentPrice>0&&Number.isFinite(Number(analysisIndicators.ema20))&&Number.isFinite(Number(analysisIndicators.ema50))?Math.abs(Number(analysisIndicators.ema20)-Number(analysisIndicators.ema50))/currentPrice*100:null;
 const trendStability=emaSpread===null?null:Math.max(0,Math.min(100,Math.round(100-emaSpread*200)));
 const momentumScore=aiReady&&Number.isFinite(Number(analysisIndicators.rsi14))?Math.round(Math.min(100,Math.abs(Number(analysisIndicators.rsi14)-50)*2)):null;
 const aiValue=(value)=>value===undefined||value===null?'--':String(value);
 const breadthQuotes=Object.values(marketQuotes||{}).filter(q=>q&&Number.isFinite(Number(q.change_percent)));
 const breadthUp=breadthQuotes.filter(q=>Number(q.change_percent)>0).length;
 const breadthDown=breadthQuotes.filter(q=>Number(q.change_percent)<0).length;
 const sentimentBull=breadthQuotes.length?Math.round(breadthUp/breadthQuotes.length*100):0;
 const sentimentBear=breadthQuotes.length?Math.round(breadthDown/breadthQuotes.length*100):0;
 const sentimentReady=quoteStatus==='live'&&breadthQuotes.length>0;
 const sentimentLabel=quoteStatus!=='live'||!breadthQuotes.length?'WAITING':sentimentBull>=60?'BULLISH':sentimentBear>=60?'BEARISH':'NEUTRAL';
 const livePcr=optionChain?.status==='live'&&optionChain?.summary?.pcr!==null&&optionChain?.summary?.pcr!==undefined&&Number.isFinite(Number(optionChain.summary.pcr))?Number(optionChain.summary.pcr):null;
 const tradeDecisionReady=aiReady&&optionChainStatus==='live'&&livePcr!==null&&riskScore!==null&&riskScore<65;
 const homeTradeDecision=tradeDecisionReady&&aiAnalysis.market_bias==='BULLISH'&&livePcr>=1.1?'BUY CE':tradeDecisionReady&&aiAnalysis.market_bias==='BEARISH'&&livePcr<=0.9?'BUY PE':'WAIT';
 const homeTradeReason=!aiReady?'Waiting for verified FYERS candle analysis.':optionChainStatus!=='live'||livePcr===null?'Waiting for live option-chain PCR confirmation.':riskScore===null||riskScore>=65?'High or unavailable market risk: no trade signal.':homeTradeDecision==='BUY CE'?'Bullish candle trend with supportive Put/Call OI ratio.':homeTradeDecision==='BUY PE'?'Bearish candle trend with supportive Put/Call OI ratio.':'Candle trend and option-chain confirmation do not agree.';
 const [themeName,bg,card,accent,fg,muted]=THEMES[theme],t=TXT[lang]||TXT[0],light=theme===8||theme===19,green='#28D17C';
 const FONT_OPTIONS=['Helvetica','Arial','Inter','Roboto','Montserrat','Poppins','Futura','Open Sans','Lato','Times New Roman','Georgia','Garamond','Baskerville','Playfair Display','Bodoni','Merriweather','Rockwell','Arvo','Roboto Slab','Clarendon','Pacifico','Lobster','Dancing Script','Brush Script','Caveat','Fira Code','JetBrains Mono','Courier New','Bebas Neue'];
 const FONT_FAMILY_MAP={'Helvetica':'sans-serif','Arial':'sans-serif','Inter':'sans-serif','Roboto':'sans-serif','Montserrat':'sans-serif-medium','Poppins':'sans-serif','Futura':'sans-serif-condensed','Open Sans':'sans-serif','Lato':'sans-serif','Times New Roman':'serif','Georgia':'serif','Garamond':'serif','Baskerville':'serif','Playfair Display':'serif','Bodoni':'serif','Merriweather':'serif','Rockwell':'serif','Arvo':'serif','Roboto Slab':'serif','Clarendon':'serif','Pacifico':'cursive','Lobster':'cursive','Dancing Script':'cursive','Brush Script':'cursive','Caveat':'cursive','Fira Code':'monospace','JetBrains Mono':'monospace','Courier New':'monospace','Bebas Neue':'sans-serif-condensed'};
 const AppText=({style,...props})=>{const flat=StyleSheet.flatten(style)||{};return <RNText {...props} style={[{fontFamily:selectedFont},flat,{fontSize:flat.fontSize?flat.fontSize*fontScale:undefined}]}/>};
 const [bioReady,setBioReady]=useState(false),[appLocked,setAppLocked]=useState(false);
 useEffect(()=>{let active=true;(async()=>{try{const savedTheme=await SecureStore.getItemAsync('vgrow_theme_index');if(active&&savedTheme!==null){const parsedTheme=Number(savedTheme);if(Number.isInteger(parsedTheme)&&parsedTheme>=0&&parsedTheme<THEMES.length)setTheme(parsedTheme);}if(active)setThemeReady(true);const saved=await SecureStore.getItemAsync('vgrow_biometric_lock');if(saved==='enabled'&&active){setFinger(true);setAppLocked(true);const result=await LocalAuthentication.authenticateAsync({promptMessage:'Unlock Vgrow',cancelLabel:'Cancel',disableDeviceFallback:false});if(active&&result.success)setAppLocked(false);}}catch(e){if(active)Alert.alert('Security','Biometric lock could not be started on this device.');}})();return()=>{active=false}},[]);
 const toggleFingerprint=async(enabled)=>{if(!enabled){await SecureStore.deleteItemAsync('vgrow_biometric_lock');setFinger(false);return;}try{const hardware=await LocalAuthentication.hasHardwareAsync();const enrolled=await LocalAuthentication.isEnrolledAsync();if(!hardware||!enrolled){Alert.alert('Fingerprint unavailable','या फोनमध्ये fingerprint/biometric सेट केलेले नाही. आधी फोनच्या Settings मध्ये fingerprint नोंदवा.');return;}const result=await LocalAuthentication.authenticateAsync({promptMessage:'Enable Vgrow fingerprint lock',cancelLabel:'Cancel',disableDeviceFallback:false});if(result.success){await SecureStore.setItemAsync('vgrow_biometric_lock','enabled');setFinger(true);Alert.alert('Security enabled','Vgrow biometric lock enabled.');}}catch(e){Alert.alert('Security error','Biometric lock could not be enabled.');}};
 useEffect(()=>{let active=true;(async()=>{try{const strike=await SecureStore.getItemAsync('vgrow_scalp_strike');const type=await SecureStore.getItemAsync('vgrow_scalp_type');if(active&&strike!==null)setScalpStrike(Number(strike));if(active&&type&&['CE','PE'].includes(type))setScalpType(type);}catch(e){}})();return()=>{active=false}},[]);
 useEffect(()=>{if(!themeReady)return;SecureStore.setItemAsync('vgrow_theme_index',String(theme)).catch(()=>{});},[theme,themeReady]);
 useEffect(()=>{SecureStore.setItemAsync('vgrow_selected_index',selectedIndex).catch(()=>{});},[selectedIndex]);
 useEffect(()=>{let active=true;(async()=>{try{const saved=await SecureStore.getItemAsync('vgrow_notifications_enabled');if(active&&saved==='enabled')setNotify(true);for(const key of Object.keys(NOTIFICATION_CHANNELS)){const value=await SecureStore.getItemAsync('vgrow_notify_pref_'+key);if(active&&value!==null)setNotifyPrefs(previous=>({...previous,[key]:value==='enabled'}));}const savedSound=await SecureStore.getItemAsync('vgrow_notify_sound');if(active&&savedSound!==null)setNotifySound(savedSound==='enabled');const savedVibration=await SecureStore.getItemAsync('vgrow_notify_vibration');if(active&&savedVibration!==null)setNotifyVibration(savedVibration==='enabled');const registered=await TaskManager.isTaskRegisteredAsync(VGROW_MARKET_BACKGROUND_TASK);if(!registered)await BackgroundTask.registerTaskAsync(VGROW_MARKET_BACKGROUND_TASK,{minimumInterval:15});}catch(e){}})();return()=>{active=false}},[]);
 const updateNotifyPref=async(key,value)=>{setNotifyPrefs(previous=>({...previous,[key]:value}));await SecureStore.setItemAsync('vgrow_notify_pref_'+key,value?'enabled':'disabled');};
  const previewNotification=async(key,label)=>{try{const channel=NOTIFICATION_CHANNELS[key];if(!channel)throw new Error('Unknown notification category: '+key);let permission=await Notifications.getPermissionsAsync();if(!permission.granted)permission=await Notifications.requestPermissionsAsync();if(!permission.granted){Alert.alert('Notifications blocked','Android notification permission is not granted. Enable notifications for Vgrow and try again.');return;}await ensureNotificationChannels();await Notifications.scheduleNotificationAsync({content:{title:'Vgrow • '+label,body:'हा '+label+' notification sound test आहे.',sound:channel.sound,data:{test:true,type:key}},trigger:{type:Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,seconds:1,channelId:channel.id}});}catch(e){Alert.alert('Notification test failed',String(e?.message||e));}};
  const updateNotifySound=async(value)=>{setNotifySound(value);await SecureStore.setItemAsync('vgrow_notify_sound',value?'enabled':'disabled');};
  const updateNotifyVibration=async(value)=>{setNotifyVibration(value);await SecureStore.setItemAsync('vgrow_notify_vibration',value?'enabled':'disabled');};
  const toggleNotifications=async(enabled)=>{if(enabled){const permission=await Notifications.requestPermissionsAsync();if(!permission.granted){Alert.alert('Notifications disabled','Allow Vgrow notifications in Android Settings to receive market setup alerts.');return;}await ensureNotificationChannels();await SecureStore.setItemAsync('vgrow_notifications_enabled','enabled');setNotify(true);}else{await SecureStore.setItemAsync('vgrow_notifications_enabled','disabled');setNotify(false);}};
 useEffect(()=>{if(!notify||!aiReady)return;const quotes={status:quoteStatus,quotes:Object.values(marketQuotes||{})};processMarketAlerts(selectedIndex,marketAnalysis,quotes,optionChain,scalpStrike,scalpType).catch(()=>{});},[notify,aiReady,analysisSymbol,selectedIndex,marketAnalysis,quoteStatus,marketQuotes,optionChain,scalpStrike,scalpType]);
 useEffect(()=>{const id=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(id)},[]);
 useEffect(()=>{let active=true;(async()=>{try{const saved=await SecureStore.getItemAsync('vgrow_ai_performance_records_v1');if(active&&saved){const parsed=JSON.parse(saved);if(Array.isArray(parsed))setPerformanceRecords(parsed);}}catch(e){}finally{if(active)setPerformanceLoaded(true);}})();return()=>{active=false}},[]);
 useEffect(()=>{if(!performanceLoaded)return;SecureStore.setItemAsync('vgrow_ai_performance_records_v1',JSON.stringify(performanceRecords)).catch(()=>{});},[performanceRecords,performanceLoaded]);
 useEffect(()=>{let active=true;const loadQuotes=async()=>{try{const response=await fetch('https://fyers-smart-ai-1.onrender.com/market/quotes');const data=await response.json();if(!response.ok)throw new Error(data.detail||'Quote feed unavailable');const next={};(data.quotes||[]).forEach(q=>{next[q.name]=q});if(active){setMarketQuotes(next);setQuoteStatus(data.status==='live'?'live':'empty');}}catch(e){if(active){setMarketQuotes({});setQuoteStatus('error');}}};loadQuotes();const timer=setInterval(loadQuotes,15000);return()=>{active=false;clearInterval(timer)}},[]); // VGROW_FYERS_QUOTES_POLL
 useEffect(()=>{let active=true;const loadOptionChain=async()=>{try{setOptionChainStatus('loading');const url='https://fyers-smart-ai-1.onrender.com/market/option-chain?symbol='+encodeURIComponent(optionUnderlying)+'&strikecount=20';const response=await fetch(url);const data=await response.json();if(!response.ok)throw new Error(data.detail||'Option chain unavailable');if(active){setOptionChain(data);setOptionChainStatus(data.status==='live'?'live':data.status||'empty');}}catch(e){if(active){setOptionChain(null);setOptionChainStatus('error');}}};loadOptionChain();const timer=setInterval(loadOptionChain,30000);return()=>{active=false;clearInterval(timer)}},[optionUnderlying]); // VGROW_FYERS_OPTION_CHAIN_POLL
 useEffect(()=>{if(!optionLiveReady)return;const stamp=String(optionChain?.last_updated||optionChain?.timestamp||'');if(!stamp)return;setOptionSnapshotHistory(prev=>{if(prev.some(x=>x.stamp===stamp))return prev;const snap={stamp,callOi:optionCallOI,putOi:optionPutOI,rows:optionValidRows.map(x=>({strike:Number(x.strike_price),type:x.option_type,oi:Number(x.oi),oiChange:Number(x.oi_change),ltp:Number(x.ltp),volume:Number(x.volume)}))};return [snap,...prev].slice(0,30);});},[optionLiveReady,optionChain,optionCallOI,optionPutOI]);
 useEffect(()=>{if(!optionLiveReady)return;const setup=optionVerdict!=='PENDING'?optionVerdict:optionBreakout;if(!setup||setup==='PENDING'||setup==='NONE')return;const stamp=String(optionChain?.last_updated||optionChain?.timestamp||'');if(!stamp)return;const id=selectedIndex+':'+stamp+':'+setup;setOptionSignalHistory(prev=>prev.some(x=>x.id===id)?prev:[{id,setup,stamp,index:selectedIndex,pcr:optionPcr,spot:optionSpot,reason:'Verified option-chain PCR and FYERS AI market bias / breakout status',invalidation:setup==='BULLISH'&&putWall?putWall.strike_price:setup==='BEARISH'&&callWall?callWall.strike_price:null},...prev].slice(0,50));},[optionLiveReady,optionChain,optionVerdict,optionBreakout,selectedIndex,optionPcr,optionSpot,putWall,callWall]);
 useEffect(()=>{let active=true;const loadAnalysis=async()=>{try{setAnalysisStatus('loading');const url='https://fyers-smart-ai-1.onrender.com/market/analysis?symbol='+encodeURIComponent(analysisSymbol)+'&resolution='+encodeURIComponent(analysisResolution);const response=await fetch(url);const data=await response.json();if(!response.ok)throw new Error(data.detail||'Analysis feed unavailable');if(active){setMarketAnalysis(data);setAnalysisStatus(data.status==='live'?'live':data.status||'pending');}}catch(e){if(active){setMarketAnalysis(null);setAnalysisStatus('error');}}};loadAnalysis();const timer=setInterval(loadAnalysis,60000);return()=>{active=false;clearInterval(timer)}},[analysisSymbol,analysisResolution]); // VGROW_FYERS_CANDLE_ANALYSIS_POLL

 useEffect(()=>{if(!performanceLoaded||analysisStatus!=='live'||!marketAnalysis||!Array.isArray(marketAnalysis.candles)||!marketAnalysis.candles.length)return;const last=marketAnalysis.candles[marketAnalysis.candles.length-1];const candleTime=String(last.time||marketAnalysis.last_updated||'');const dedupe=selectedIndex+':'+candleTime;if(!candleTime||performanceLastCandle===dedupe)return;const now=new Date();const minutes=now.getHours()*60+now.getMinutes();if(minutes<555||minutes>=930)return;const close=Number(last.close);if(!Number.isFinite(close)||close<=0)return;setPerformanceLastCandle(dedupe);setPerformanceRecords(previous=>{let next=previous.map(record=>{if(record.status!=='PENDING'||record.index!==selectedIndex||record.candleTime===candleTime||record.date!==perfDateKey(now))return record;const correct=record.direction==='UP'?close>record.entryPrice:close<record.entryPrice;return {...record,status:correct?'SUCCESS':'FAILED',resolvedAt:candleTime,resultPrice:close};});const indicators=marketAnalysis.indicators||{},ai=marketAnalysis.ai_analysis||{};const valid=(v)=>v!==null&&v!==undefined&&Number.isFinite(Number(v));const signals=[];if(valid(indicators.rsi14)){if(Number(indicators.rsi14)>50)signals.push(['RSI','UP']);else if(Number(indicators.rsi14)<50)signals.push(['RSI','DOWN']);}if(valid(indicators.macd)&&valid(indicators.macd_signal))signals.push(['MACD',Number(indicators.macd)>Number(indicators.macd_signal)?'UP':'DOWN']);if(valid(indicators.ema20)&&valid(indicators.ema50)&&Number(indicators.ema20)!==Number(indicators.ema50))signals.push(['EMA 20 / 50',Number(indicators.ema20)>Number(indicators.ema50)?'UP':'DOWN']);if(valid(indicators.vwap)&&close!==Number(indicators.vwap))signals.push(['VWAP',close>Number(indicators.vwap)?'UP':'DOWN']);if(ai.breakout_status==='BREAKOUT')signals.push(['Breakout / Breakdown','UP']);else if(ai.breakout_status==='BREAKDOWN')signals.push(['Breakout / Breakdown','DOWN']);if(sentimentReady&&sentimentLabel!=='NEUTRAL'&&sentimentLabel!=='WAITING')signals.push(['Market Sentiment',sentimentLabel==='BULLISH'?'UP':'DOWN']);if(ai.market_bias==='BULLISH')signals.push(['AI Analysis','UP']);else if(ai.market_bias==='BEARISH')signals.push(['AI Analysis','DOWN']);if(homeTradeDecision==='BUY CE')signals.push(['Smart AI Trade Decision','UP']);else if(homeTradeDecision==='BUY PE')signals.push(['Smart AI Trade Decision','DOWN']);if(scalpSignal==='BUY CE')signals.push(['AI Smart Scalping','UP']);else if(scalpSignal==='BUY PE')signals.push(['AI Smart Scalping','DOWN']);const existing=new Set(next.map(x=>x.id));signals.forEach(([tool,direction])=>{const id=selectedIndex+':'+candleTime+':'+tool;if(!existing.has(id))next.push({id,date:perfDateKey(now),time:now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false}),candleTime,index:selectedIndex,tool,direction,entryPrice:close,status:'PENDING'});});SecureStore.setItemAsync('vgrow_ai_performance_records_v1',JSON.stringify(next)).catch(()=>{});return next;});},[performanceLoaded,analysisStatus,marketAnalysis,selectedIndex,performanceLastCandle,sentimentReady,sentimentLabel,homeTradeDecision,scalpSignal]);
 const s=StyleSheet.create({
 root:{flex:1,backgroundColor:bg},header:{paddingHorizontal:16,paddingTop:(StatusBar.currentHeight||24)+10,paddingBottom:14,minHeight:120,backgroundColor:card,borderBottomWidth:1,borderBottomColor:accent+'88',flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 logoRow:{flexDirection:'row',alignItems:'center'},logoImage:{width:50,height:50,resizeMode:'contain',marginRight:8},logo:{fontSize:21,fontWeight:'900',color:fg,letterSpacing:1},muted:{color:muted,fontSize:12,marginTop:5},accent:{color:accent,fontWeight:'800'},green:{color:green,fontWeight:'800'},
 body:{paddingHorizontal:14,paddingTop:15,paddingBottom:28},pageTitle:{color:fg,fontSize:25,fontWeight:'900',letterSpacing:.5,marginBottom:3},pageSub:{color:muted,fontSize:12,marginBottom:15},
 box:{backgroundColor:card,borderColor:accent+'35',borderWidth:1,borderRadius:17,padding:15,marginBottom:12},boxTitle:{color:fg,fontSize:15,fontWeight:'800',letterSpacing:.7,marginBottom:12},eyebrow:{color:muted,fontSize:9,fontWeight:'800',letterSpacing:1.1,marginBottom:7},
 marketGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},marketCard:{width:'48.3%',backgroundColor:bg,borderRadius:13,padding:12,marginBottom:9,borderWidth:1,borderColor:accent+'35'},marketName:{color:fg,fontSize:14,fontWeight:'800'},marketValue:{color:fg,fontSize:20,fontWeight:'900',marginTop:8},marketChange:{color:muted,fontSize:11,marginTop:4},
 split:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},pill:{paddingHorizontal:10,paddingVertical:6,borderRadius:20,backgroundColor:accent+'20'},pillText:{color:accent,fontSize:10,fontWeight:'800'},
 row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#77847725'},rowLabel:{color:muted,fontSize:12},value:{color:fg,fontSize:12,fontWeight:'700'},
 barTrack:{height:8,backgroundColor:'#77847735',borderRadius:8,overflow:'hidden',marginTop:9},barFill:{height:8,backgroundColor:accent,borderRadius:8},
 wrap:{flexDirection:'row',flexWrap:'wrap',marginTop:10},chip:{borderWidth:1,borderRadius:12,paddingHorizontal:11,paddingVertical:9,marginRight:7,marginBottom:8},chipText:{fontSize:11,fontWeight:'700'},
 setting:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:13,borderBottomWidth:1,borderBottomColor:'#77847725'},settingTitle:{color:fg,fontSize:13,fontWeight:'700'},settingDesc:{color:muted,fontSize:10,marginTop:4},
 navSafe:{backgroundColor:card,borderTopWidth:2,borderColor:accent+'88',paddingBottom:34},nav:{flexDirection:'row',paddingTop:12,paddingBottom:4},navItem:{flex:1,alignItems:'center',justifyContent:'center',paddingVertical:5},navDot:{width:4,height:4,borderRadius:4,marginTop:5},navText:{fontSize:10,fontWeight:'900'},footer:{color:green,textAlign:'center',paddingTop:10,paddingBottom:4,fontSize:9,fontWeight:'800',letterSpacing:.5},
 chartPanel:{height:205,backgroundColor:bg,borderRadius:12,padding:12,justifyContent:'space-between',overflow:'hidden'},chartGrid:{position:'absolute',left:0,right:0,height:1,backgroundColor:'#82918420'},candleRow:{flexDirection:'row',alignItems:'stretch',justifyContent:'space-around',height:145,paddingHorizontal:3},candle:{width:8,borderRadius:2,position:'absolute'},wick:{width:2,position:'absolute',alignSelf:'center'},chartCaption:{color:muted,fontSize:9}
 });

 const INFO={
 'LIVE MARKET':['Live Market','Shows real-time index and price movement from the connected broker.','कनेक्ट केलेल्या ब्रोकरकडून बाजाराचे थेट भाव आणि हालचाल दाखवतो.'],
 'MARKET SENTIMENT':['Market Sentiment','Summarizes whether overall market participation is bullish, bearish or neutral.','एकूण बाजारात तेजी, मंदी की तटस्थ वातावरण आहे हे सांगतो.'],
 'AI ANALYSIS':['AI Analysis','Combines verified price, volume, trend and indicator data to explain the market setup.','पडताळलेले भाव, व्हॉल्यूम, ट्रेंड आणि इंडिकेटर्स एकत्र करून बाजाराचे विश्लेषण करतो.'],
 'SUPPORT & RESISTANCE':['Support & Resistance','Identifies price zones where demand or supply may slow or reverse price movement.','ज्या भावाच्या पातळीवर खरेदी किंवा विक्रीमुळे भाव थांबू किंवा वळू शकतो ते स्तर शोधतो.'],
 'TECHNICAL INDICATORS':['Technical Indicators','Uses mathematical calculations on price and volume to assess trend, momentum and participation.','भाव आणि व्हॉल्यूमच्या गणनेतून ट्रेंड, वेग आणि बाजारातील सहभाग समजतो.'],
 'RSI':['Relative Strength Index (RSI)','Measures momentum on a 0–100 scale; commonly used to assess overbought and oversold conditions.','0 ते 100 स्केलवर भावाचा वेग मोजतो; Overbought आणि Oversold स्थिती समजण्यास मदत करतो.'],
 'MACD':['MACD','Compares moving averages to assess trend direction, momentum and possible crossovers.','Moving Average ची तुलना करून ट्रेंड, मोमेंटम आणि संभाव्य क्रॉसओव्हर दाखवतो.'],
 'VWAP':['VWAP','Volume Weighted Average Price; shows the average traded price weighted by volume.','व्हॉल्यूमनुसार भारित सरासरी भाव दाखवतो; बाजारातील सरासरी व्यवहारभाव समजतो.'],
 'EMA 20 / 50':['EMA 20 / 50','Exponential moving averages that give more weight to recent prices and help identify trend direction.','अलीकडील भावांना जास्त महत्त्व देणाऱ्या सरासरी रेषा; ट्रेंडची दिशा ओळखण्यास मदत करतात.'],
 'SUPERTREND':['Supertrend','A volatility-based trend indicator that can help identify trend direction and trailing levels.','Volatility वर आधारित ट्रेंड इंडिकेटर; ट्रेंडची दिशा आणि संभाव्य trailing level दाखवतो.'],
 'VOLUME':['Volume','Shows how many units or contracts traded; helps judge participation behind a price move.','किती शेअर्स किंवा कॉन्ट्रॅक्ट्सचा व्यवहार झाला ते दाखवतो; भावाच्या हालचालीमागील सहभाग समजतो.'],
 'RISK METER':['Risk Meter','Combines volatility, trend stability and momentum to describe market risk.','Volatility, ट्रेंडची स्थिरता आणि momentum एकत्र करून बाजारातील जोखीम दाखवतो.'],
 'BULLISH / BEARISH / SIDEWAYS':['Market Bias','Classifies the prevailing market structure as bullish, bearish or sideways using multiple signals.','अनेक संकेतांच्या आधारे बाजार तेजीचा, मंदीचा की मर्यादित रेंजमध्ये आहे हे ठरवतो.'],
 'CALL WRITING / UNWINDING':['Call Writing / Unwinding','Uses changes in call open interest with price and volume to detect writing or position closure.','Call OI मधील बदल, भाव आणि व्हॉल्यूम पाहून नवीन writing किंवा positions बंद होणे ओळखतो.'],
 'PUT WRITING / UNWINDING':['Put Writing / Unwinding','Uses changes in put open interest with price and volume to detect writing or position closure.','Put OI मधील बदल, भाव आणि व्हॉल्यूम पाहून writing किंवा positions बंद होणे ओळखतो.'],
 'FRESH LONG POSITIONS':['Fresh Long Positions','Looks for rising price, rising open interest and supporting volume as a possible fresh-long clue.','भाव आणि OI वाढणे तसेच व्हॉल्यूमचा आधार यावरून नवीन Long positions चा संकेत शोधतो.'],
 'FRESH SHORT POSITIONS':['Fresh Short Positions','Looks for falling price with rising open interest and supporting volume as a possible fresh-short clue.','भाव घसरणे आणि OI वाढणे यावरून नवीन Short positions चा संकेत शोधतो.'],
 'PCR':['Put Call Ratio (PCR)','Compares put open interest or volume with calls to gauge options positioning; not a standalone signal.','Put आणि Call OI किंवा Volume ची तुलना करून options मधील positioning समजतो; हा एकटाच निर्णयाचा संकेत नाही.'],
 'MAX PAIN':['Max Pain','Estimates the strike at which option buyers collectively may have the greatest expiration loss, based on open interest.','Open Interest वरून expiry वेळी option buyers चे एकत्रित नुकसान सर्वाधिक होऊ शकणारा strike अंदाजतो.'],
 'IV & OPTION GREEKS':['IV & Option Greeks','IV estimates expected volatility; Delta, Gamma, Theta and Vega describe option-price sensitivities.','IV अपेक्षित volatility दर्शवते; Delta, Gamma, Theta आणि Vega option च्या भावातील संवेदनशीलता दाखवतात.'],
 'DELTA':['Delta','Estimates how much an option price may change for a one-point move in the underlying.','Underlying च्या 1 point हालचालीमुळे option चा भाव किती बदलू शकतो याचा अंदाज.'],
 'GAMMA':['Gamma','Measures how quickly an option’s Delta changes as the underlying price moves.','Underlying चा भाव बदलल्यावर Delta किती वेगाने बदलतो ते मोजतो.'],
 'THETA':['Theta','Estimates the option premium lost to the passage of time, all else equal.','इतर घटक स्थिर असताना वेळ गेल्यामुळे option premium किती कमी होऊ शकतो ते दर्शवतो.'],
 'VEGA':['Vega','Measures option-price sensitivity to a change in implied volatility.','Implied Volatility बदलल्यास option चा भाव किती बदलू शकतो ते मोजतो.'],
 'BULL TRAP DETECTION':['Bull Trap','Looks for a failed upside breakout that quickly falls back below the breakout level.','वरचा breakout टिकत नाही आणि भाव पुन्हा breakout level खाली येतो का ते शोधतो.'],
 'BEAR TRAP DETECTION':['Bear Trap','Looks for a failed downside breakdown that quickly recovers above the breakdown level.','खालचा breakdown टिकत नाही आणि भाव पुन्हा breakdown level वर येतो का ते शोधतो.'],
 'BREAKOUT':['Breakout Detection','Checks whether price moves above resistance with supporting volume and follow-through.','भाव resistance च्या वर पुरेशा व्हॉल्यूमसह टिकतो का ते तपासतो.'],
 'BREAKDOWN':['Breakdown Detection','Checks whether price moves below support with supporting volume and follow-through.','भाव support च्या खाली पुरेशा व्हॉल्यूमसह टिकतो का ते तपासतो.'],
 'SMART MONEY & OI DETECTION':['Smart Money & OI Detection','Highlights unusual open-interest and volume changes alongside price action; it cannot identify an institution with certainty.','भावासोबत OI आणि Volume मधील असामान्य बदल दाखवतो; यावरून कोणती संस्था व्यवहार करते हे निश्चित कळत नाही.'],
 'NEXT 5 MINUTE OUTLOOK':['Next 5-Minute Outlook','Estimates a probability-based short-term direction from available signals; it is not a guarantee.','उपलब्ध संकेतांवरून पुढील 5 मिनिटांची संभाव्य दिशा मोजतो; ही खात्री नसते.'],
 'AI CONFIDENCE':['AI Confidence','Shows how strongly the available, validated signals agree; it is not a profit probability.','उपलब्ध आणि पडताळलेल्या संकेतांमध्ये किती एकमत आहे ते दाखवतो; हा नफ्याचा probability नाही.'],
 'MARKET BIAS':['Market Bias','Summarizes the dominant directional tendency from trend, momentum and market breadth.','Trend, Momentum आणि Market Breadth वरून बाजाराची प्रमुख दिशा सांगतो.'],
 'FALL / DOWNSIDE MOVE':['Fall / Downside Move','Detects weakening price structure and downside momentum using price, volume and support levels.','भाव, व्हॉल्यूम आणि Support पाहून घसरणीची रचना व मंदीचा वेग ओळखतो.'],
 'TRADE DECISION':['Smart AI Trade Decision','Combines trend, momentum, volume, sentiment, option-chain data, support/resistance and risk. It returns CALL CE, CALL PE or WAIT only when verified live data and rules are available.','Trend, Momentum, Volume, Sentiment, Option Chain, Support/Resistance आणि Risk एकत्र तपासतो. पडताळलेला Live Data आणि नियम उपलब्ध असतील तेव्हाच CALL CE, CALL PE किंवा WAIT निर्णय देतो.']
 };
 const showInfo=(label)=>{const key=String(label||'').toUpperCase();const item=INFO[key]||[String(label||'Information'),'Explains this feature and the data it uses.','या फीचरचे काम आणि ते वापरत असलेला डेटा समजावतो.'];Alert.alert(item[0],item[1]+'\\n\\nमराठी: '+item[2]);};
 const InfoButton=({label})=><TouchableOpacity onPress={()=>showInfo(label)} accessibilityRole="button" accessibilityLabel={'Information about '+label} style={{paddingHorizontal:5,paddingVertical:3,marginLeft:3}}><RNText style={{color:accent,fontSize:15,fontWeight:'900'}}>ⓘ</RNText></TouchableOpacity>;

 const Card=({title,children,extra})=><View style={s.box}><View style={s.split}><View style={{flexDirection:'row',alignItems:'center',flex:1}}><AppText style={s.boxTitle}>{title}</AppText><InfoButton label={title}/></View>{extra||null}</View>{children}</View>;
 const Row=({label,value='--'})=><View style={s.row}><View style={{flexDirection:'row',alignItems:'center',flex:1}}><AppText style={s.rowLabel}>{label}</AppText><InfoButton label={label}/></View><AppText style={s.value}>{value}</AppText></View>;
 const pages=['home','chart','ai','watchlist','settings'],labels=[t.home,t.chart,t.ai,'WATCHLIST',t.settings];
 const liveCandles=marketAnalysis?.candles||[];
 const candleMin=liveCandles.length?Math.min(...liveCandles.map(c=>c.low)):0;
 const candleMax=liveCandles.length?Math.max(...liveCandles.map(c=>c.high)):0;
 const candleRange=Math.max(candleMax-candleMin,0.000001);
 const CandleChart=()=> <View style={s.chartPanel}>{[28,65,102,139].map(y=><View key={y} style={[s.chartGrid,{top:y}]}/>)}{liveCandles.length?<View style={s.candleRow}>{liveCandles.slice(-45).map((c,i)=>{const up=c.close>=c.open;const top=((candleMax-c.high)/candleRange)*130;const height=Math.max(3,((c.high-c.low)/candleRange)*130);const bodyHeight=Math.max(2,(Math.abs(c.close-c.open)/candleRange)*130);const bodyTop=((candleMax-Math.max(c.open,c.close))/candleRange)*130;const width=Math.max(3,Math.min(8,300/Math.min(45,liveCandles.length)));return <View key={c.time||i} style={{width,height:145,position:'relative'}}><View style={{position:'absolute',top:Math.max(0,top),height,alignSelf:'center',width:1.5,backgroundColor:up?green:'#F06B72'}}/><View style={{position:'absolute',top:Math.max(0,bodyTop),height:bodyHeight,alignSelf:'center',width,backgroundColor:up?green:'#F06B72',borderRadius:1}}/></View>})}</View>:<View style={{height:145,alignItems:'center',justifyContent:'center'}}><AppText style={s.settingDesc}>{analysisStatus==='loading'?'Loading verified candles...':analysisStatus==='error'?'Candle data unavailable':'Waiting for verified candle data'}</AppText></View>}<View style={s.split}><AppText style={s.chartCaption}>{liveCandles.length+' verified candles • '+selectedIndex}</AppText><AppText style={s.chartCaption}>{analysisStatus==='live'?'FYERS LIVE':analysisStatus.toUpperCase()}</AppText></View></View>;
 const content=page==='home'?<>
  <Card title={t.market} extra={<AppText style={quoteStatus==='live'?s.green:s.accent}>● {quoteStatus==='live'?'FYERS LIVE':quoteStatus==='error'?'FEED UNAVAILABLE':'WAITING FOR DATA'}</AppText>}><View style={s.marketGrid}>{['NIFTY 50','BANK NIFTY','FINNIFTY','SENSEX'].map((x,i)=>{const q=marketQuotes[x];const key=x==='NIFTY 50'?'NIFTY':x==='BANK NIFTY'?'BANKNIFTY':x;return <View key={x} style={[s.marketCard,{borderColor:selectedIndex===key?accent:accent+'35'},i===3?{width:'100%'}:null]}><AppText style={s.marketName}>{x}</AppText><AppText style={s.marketValue}>{q&&q.last_price!=null?Number(q.last_price).toFixed(2):'--'}</AppText><AppText style={s.marketChange}>{q?((Number(q.change)>=0?'+':'')+Number(q.change||0).toFixed(2)+' ('+Number(q.change_percent||0).toFixed(2)+'%)'):'No verified quote available'}</AppText></View>})}</View></Card>
 <Card title="EXPLORE VGROW"><View style={s.marketGrid}>{[{id:'chart',name:'Advanced Charts',desc:'Candlestick • Timeframes',symbol:'📊'},{id:'ai',name:'AI Analysis',desc:'Signals • Probability',symbol:'✨'},{id:'options',name:'Option Chain',desc:'Calls • Puts • OI',symbol:'🧩'},{id:'scalping',name:'AI Smart Scalping',desc:'Manual strike • CE / PE / WAIT',symbol:'⚡'},{id:'performance',name:'AI Performance Center',desc:'Daily accuracy • Success rate • Calendar',symbol:'🎯'},{id:'technical',name:'Technical Analysis',desc:'RSI • MACD • VWAP',symbol:'📉'},{id:'support',name:'Support & Resistance',desc:'Daily key levels',symbol:'🎯'},{id:'risk',name:'Risk Meter',desc:'Market risk overview',symbol:'🛡️'},{id:'watchlist',name:'My Watchlist',desc:'Track instruments',symbol:'⭐'},{id:'settings',name:'Settings',desc:'Themes • Language',symbol:'⚙️'}].map(item=><TouchableOpacity key={item.id} onPress={()=>setPage(item.id)} style={[s.marketCard,{minHeight:100}]}><AppText style={[s.marketValue,{fontSize:22,color:accent,marginTop:0}]}>{item.symbol}</AppText><View style={{flexDirection:"row",alignItems:"center",flexWrap:"wrap"}}><AppText style={[s.marketName,{marginTop:7}]}>{item.name}</AppText><InfoButton label={item.name}/></View><AppText style={s.marketChange}>{item.desc}</AppText><AppText style={[s.accent,{fontSize:10,marginTop:7}]}>OPEN SECTION →</AppText></TouchableOpacity>)}</View></Card>
 <Card title={t.sentiment}><View style={s.split}><AppText style={s.rowLabel}>MARKET SENTIMENT</AppText><AppText style={[s.value,{color:sentimentLabel==='BULLISH'?green:sentimentLabel==='BEARISH'?'#F06B72':accent}]}>{sentimentLabel}</AppText></View><View style={{flexDirection:'row',height:9,borderRadius:8,overflow:'hidden',marginTop:9}}><View style={{width:sentimentBull+'%',backgroundColor:green}}/><View style={{flex:1,backgroundColor:'#F06B72'}}/></View><View style={s.split}><AppText style={s.settingDesc}>Bullish {sentimentReady?sentimentBull+'%':'--'}</AppText><AppText style={s.settingDesc}>Bearish {sentimentReady?sentimentBear+'%':'--'}</AppText></View><AppText style={s.settingDesc}>{sentimentReady?breadthQuotes.length+' live indices • based on FYERS price change':'Waiting for verified live index quotes.'}</AppText></Card>
 <Card title="SMART AI TRADE DECISION" extra={<AppText style={tradeDecisionReady?s.green:s.accent}>{tradeDecisionReady?'AI + OPTION CHAIN':'DATA PENDING'}</AppText>}><AppText style={{fontSize:26,fontWeight:"900",color:homeTradeDecision==='BUY CE'?green:homeTradeDecision==='BUY PE'?'#F06B72':accent,textAlign:"center",padding:8}}>{homeTradeDecision}</AppText><AppText style={s.settingDesc}>{homeTradeReason} Read-only signal; no orders are placed.</AppText><Row label="Market bias" value={aiReady?aiValue(aiAnalysis.market_bias):'--'}/><Row label="Direction" value={aiReady?aiValue(aiAnalysis.direction):'--'}/><Row label="Option-chain PCR" value={livePcr===null?'--':livePcr.toFixed(3)}/><Row label="Breakout / breakdown" value={aiReady?aiValue(aiAnalysis.breakout_status):'--'}/><Row label="Support / resistance" value={aiReady?showMetric(analysisIndicators.support)+' / '+showMetric(analysisIndicators.resistance):'--'}/><Row label="AI confidence (heuristic)" value={aiReady?aiValue(aiAnalysis.confidence)+'%':'--'}/><Row label="Risk" value={riskScore===null?'--':aiValue(aiAnalysis.risk_level)}/></Card><Card title="AI ANALYSIS" extra={<AppText style={aiReady?s.green:s.accent}>{aiReady?'FYERS LIVE':'DATA PENDING'}</AppText>}><Row label="Market direction" value={aiReady?aiValue(aiAnalysis.direction):'--'}/><Row label="Next candle UP probability" value={aiReady?aiValue(aiAnalysis.next_candle_up_probability)+'%':'--'}/><Row label="Next candle DOWN probability" value={aiReady?aiValue(aiAnalysis.next_candle_down_probability)+'%':'--'}/><Row label="AI confidence" value={aiReady?aiValue(aiAnalysis.confidence)+'%':'--'}/><View style={s.split}><AppText style={s.rowLabel}>RISK METER</AppText><AppText style={s.accent}>{riskScore===null?'WAITING FOR DATA':riskLevel+' • '+Math.round(riskScore)+'/100'}</AppText></View><View style={s.barTrack}><View style={[s.barFill,{width:riskScore===null?'0%':riskScore+'%'}]}/></View></Card>
 <Card title={t.support}><Row label="Resistance" value={showMetric(analysisIndicators.resistance)}/><Row label="Support" value={showMetric(analysisIndicators.support)}/><AppText style={s.settingDesc}>Based on the latest 20 verified candles. Select the index and timeframe in Charts.</AppText></Card>
 <Card title={t.indicators}><View style={s.marketGrid}>{[{name:'RSI',value:showMetric(analysisIndicators.rsi14)},{name:'MACD',value:showMetric(analysisIndicators.macd,4)},{name:'VWAP',value:showMetric(analysisIndicators.vwap)},{name:'EMA 20 / 50',value:showMetric(analysisIndicators.ema20)+' / '+showMetric(analysisIndicators.ema50)},{name:'SUPERTREND',value:'--'},{name:'VOLUME',value:showMetric(analysisIndicators.volume,0)}].map(x=><View key={x.name} style={{width:'48%',paddingVertical:9}}><View style={{flexDirection:"row",alignItems:"center"}}><AppText style={s.rowLabel}>{x.name}</AppText><InfoButton label={x.name}/></View><AppText style={[s.value,{marginTop:5}]}>{x.value}</AppText></View>)}</View></Card>
 </>:page==='chart'?<>
 <Card title="CANDLESTICK CHART" extra={<AppText style={analysisStatus==='live'?s.green:s.accent}>● {analysisStatus==='live'?'FYERS LIVE':analysisStatus.toUpperCase()}</AppText>}><CandleChart/><AppText style={s.eyebrow}>TIMEFRAME</AppText><View style={s.wrap}>{[['1m','1'],['3m','3'],['5m','5'],['10m','10'],['15m','15'],['30m','30'],['1h','60'],['2h','120'],['4h','240'],['Daily','D']].map(([label,value])=><TouchableOpacity key={value} onPress={()=>setAnalysisResolution(value)} style={[s.chip,{borderColor:analysisResolution===value?accent:'#77847755',backgroundColor:analysisResolution===value?accent+'20':'transparent'}]}><AppText style={[s.chipText,{color:analysisResolution===value?accent:fg}]}>{label}</AppText></TouchableOpacity>)}</View></Card>
 <Card title="LIVE TECHNICAL INDICATORS"><Row label="RSI (14)" value={showMetric(analysisIndicators.rsi14)}/><Row label="MACD" value={showMetric(analysisIndicators.macd,4)}/><Row label="MACD Signal" value={showMetric(analysisIndicators.macd_signal,4)}/><Row label="EMA 20" value={showMetric(analysisIndicators.ema20)}/><Row label="EMA 50" value={showMetric(analysisIndicators.ema50)}/><Row label="VWAP" value={showMetric(analysisIndicators.vwap)}/><Row label="Volume" value={showMetric(analysisIndicators.volume,0)}/><Row label="Support" value={showMetric(analysisIndicators.support)}/><Row label="Resistance" value={showMetric(analysisIndicators.resistance)}/><Row label="Supertrend" value="-- (not calculated)"/><AppText style={s.settingDesc}>Calculated from verified FYERS candle history. Latest status: {analysisStatus.toUpperCase()}</AppText></Card>
 </>:page==='ai'?<>
 <Card title="AI MARKET ANALYSIS" extra={<AppText style={aiReady?s.green:s.accent}>{aiReady?'LIVE':'PENDING'}</AppText>}><Row label="Market bias" value={aiValue(aiAnalysis.market_bias)}/><Row label="Market direction" value={aiValue(aiAnalysis.direction)}/><Row label="Breakout / breakdown" value={aiValue(aiAnalysis.breakout_status)}/><Row label="Next 5 minute outlook" value={aiValue(aiAnalysis.next_5m_outlook)}/><Row label="Next candle UP probability" value={aiReady?aiValue(aiAnalysis.next_candle_up_probability)+'%':'--'}/><Row label="Next candle DOWN probability" value={aiReady?aiValue(aiAnalysis.next_candle_down_probability)+'%':'--'}/><Row label="AI confidence (heuristic)" value={aiReady?aiValue(aiAnalysis.confidence)+'%':'--'}/><Row label="Risk score" value={aiReady?aiValue(aiAnalysis.risk_score)+'/100 • '+aiValue(aiAnalysis.risk_level):'--'}/><Row label="Bull trap" value={aiReady?(aiAnalysis.bull_trap?'DETECTED':'Not detected'):'--'}/><Row label="Bear trap" value={aiReady?(aiAnalysis.bear_trap?'DETECTED':'Not detected'):'--'}/><Row label="Option chain OI / IV" value={aiValue(aiAnalysis.option_chain_status)}/><Row label="CE / PE decision" value="WAIT • OI confirmation pending"/><AppText style={s.settingDesc}>Rule-based scoring from verified FYERS candles. Probabilities are heuristic estimates, not calibrated forecasts. {aiAnalysis.trade_signal_note||'Waiting for verified data.'}</AppText></Card>
<Card title="AI REASONS">{(aiAnalysis.reasons||[]).length?(aiAnalysis.reasons||[]).map((reason,i)=><Row key={i} label={'• '+reason}/>):<AppText style={s.settingDesc}>Reasons will appear after verified candle analysis is available.</AppText>}</Card>
<Card title="RISK METER"><Row label="Current risk" value={aiReady?aiValue(aiAnalysis.risk_level):'NOT AVAILABLE'}/><View style={s.barTrack}><View style={[s.barFill,{width:aiReady?Math.min(100,Number(aiAnalysis.risk_score)||0)+'%':'0%'}]}/></View></Card>
<Card title="TECHNICAL SIGNALS"><Row label="RSI" value={showMetric(analysisIndicators.rsi14)}/><Row label="MACD" value={showMetric(analysisIndicators.macd,4)}/><Row label="VWAP" value={showMetric(analysisIndicators.vwap)}/><Row label="EMA 20 / 50" value={showMetric(analysisIndicators.ema20)+' / '+showMetric(analysisIndicators.ema50)}/><Row label="Volume" value={showMetric(analysisIndicators.volume,0)}/></Card>
 </>:page==='scalping'?<>
 <Card title="AI SMART SCALPING" extra={<AppText style={optionChainStatus==='live'&&aiReady?s.green:s.accent}>{optionChainStatus==='live'&&aiReady?'● LIVE':'● WAITING'}</AppText>}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:8}}>
   <View style={{flex:1}}><AppText style={{fontSize:19,fontWeight:'900',color:fg}}>AI Smart Scalping</AppText><AppText style={s.settingDesc}>Smart AI • Live Analysis • Manual Strike</AppText></View>
   <View style={{backgroundColor:card,borderRadius:12,padding:10,borderWidth:1,borderColor:accent+'66'}}><AppText style={{fontSize:11,color:green,fontWeight:'900'}}>● {quoteStatus==='live'?'LIVE':'DATA STATUS'}</AppText><AppText style={{fontSize:17,color:fg,fontWeight:'900'}}>{selectedIndex}</AppText><AppText style={{fontSize:12,color:fg}}>{showMetric(scalpSpot)}</AppText></View>
  </View>
  <Row label="Option chain" value={optionChainStatus==='live'?'FYERS LIVE':optionChainStatus.toUpperCase()}/>
  <Row label="Nearest expiry" value={String(optionExpiry)}/>
  <Row label="PCR / Max Pain" value={optionFmt(optionSummary.pcr,3)+' / '+optionFmt(optionSummary.max_pain)}/>
 </Card>
 <Card title="SELECT CONTRACT • MANUAL SELECTION">
  <AppText style={s.eyebrow}>OPTION TYPE</AppText>
  <View style={s.wrap}>{['CE','PE'].map(x=><TouchableOpacity key={x} onPress={()=>{setScalpType(x);SecureStore.setItemAsync('vgrow_scalp_type',x).catch(()=>{});}} style={[s.chip,{minWidth:92,alignItems:'center',borderColor:scalpType===x?accent:'#77847766',backgroundColor:scalpType===x?accent+'28':'transparent'}]}><AppText style={[s.chipText,{fontSize:14,color:scalpType===x?accent:fg}]}>{x}{scalpType===x?' ✓':''}</AppText></TouchableOpacity>)}</View>
  <AppText style={s.eyebrow}>SELECT STRIKE FROM COMPLETE OPTION CHAIN</AppText>
  <View style={s.wrap}>{optionNearby.map(k=><TouchableOpacity key={k} onPress={()=>{setScalpStrike(k);SecureStore.setItemAsync('vgrow_scalp_strike',String(k)).catch(()=>{});}} style={[s.chip,{borderColor:Number(scalpStrike)===k?accent:'#77847766',backgroundColor:Number(scalpStrike)===k?accent+'28':'transparent'}]}><AppText style={[s.chipText,{color:Number(scalpStrike)===k?accent:fg}]}>{optionFmt(k)}{Number(scalpStrike)===k?' ✓':''}</AppText></TouchableOpacity>)}</View>
  <Row label="Selected contract" value={scalpContract?optionFmt(scalpContract.strike_price)+' '+scalpType:'Choose CE/PE and strike'}/>
  <Row label="Entry premium (LTP)" value={showMetric(scalpContract?.ltp)}/>
 </Card>
 <Card title={'OPTION CHAIN • '+selectedIndex} extra={<AppText style={optionChainStatus==='live'?s.green:s.accent}>{optionChainStatus==='live'?'● FYERS LIVE':'● '+optionChainStatus.toUpperCase()}</AppText>}>
  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
   <View><AppText style={{fontSize:16,fontWeight:'900',color:fg}}>{selectedIndex}</AppText><AppText style={s.settingDesc}>Spot {optionFmt(optionSpot,2)}</AppText></View>
   <View style={[s.chip,{borderColor:accent,backgroundColor:accent+'18'}]}><AppText style={[s.chipText,{color:accent}]}>{String(optionExpiry)}</AppText></View>
  </View>
  <View style={{flexDirection:'row',alignItems:'center',backgroundColor:card,borderRadius:10,padding:4,marginBottom:12}}>
   {['LTP','OI','GREEKS'].map(tab=><TouchableOpacity key={tab} onPress={()=>setScalpChainTab(tab)} style={{flex:1,alignItems:'center',paddingVertical:10,borderRadius:8,backgroundColor:scalpChainTab===tab?accent:'transparent'}}><AppText style={{fontWeight:'800',fontSize:12,color:scalpChainTab===tab?'#07111F':fg}}>{tab}</AppText></TouchableOpacity>)}
  </View>
  <View style={{flexDirection:'row',backgroundColor:card,paddingVertical:11,borderBottomWidth:1,borderColor:'#77847744'}}>
   <View style={{flex:1,alignItems:'center'}}><AppText style={{fontSize:12,fontWeight:'900',color:'#25B9A8'}}>CALL {scalpChainTab==='LTP'?'LTP':scalpChainTab==='OI'?'OI':'GREEKS'}</AppText></View>
   <View style={{width:88,alignItems:'center'}}><AppText style={{fontSize:12,fontWeight:'900',color:fg}}>STRIKE</AppText></View>
   <View style={{flex:1,alignItems:'center'}}><AppText style={{fontSize:12,fontWeight:'900',color:'#F06B72'}}>PUT {scalpChainTab==='LTP'?'LTP':scalpChainTab==='OI'?'OI':'GREEKS'}</AppText></View>
  </View>
  {optionNearby.length?optionNearby.map(strike=>{
   const ce=optionRows.find(x=>x.strike_price===strike&&x.option_type==='CE');
   const pe=optionRows.find(x=>x.strike_price===strike&&x.option_type==='PE');
   const selected=Number(scalpStrike)===strike;
   const itmCall=Number(optionSpot)>strike, itmPut=Number(optionSpot)<strike;
   const main=(row)=>scalpChainTab==='LTP'?optionFmt(row?.ltp,2):scalpChainTab==='OI'?optionFmt(row?.oi):'Δ '+optionFmt(row?.delta,3)+'  Γ '+optionFmt(row?.gamma,4);
   const sub=(row)=>scalpChainTab==='LTP'?'OI '+optionFmt(row?.oi)+'  OI Δ '+optionFmt(row?.oi_change):scalpChainTab==='OI'?'OI Δ '+optionFmt(row?.oi_change)+'  VOL '+optionFmt(row?.volume):'IV '+optionFmt(row?.iv,2)+'  Θ '+optionFmt(row?.theta,3)+'  Vega '+optionFmt(row?.vega,3);
   return <View key={strike} style={{flexDirection:'row',minHeight:66,borderBottomWidth:1,borderColor:'#77847730',backgroundColor:selected?accent+'18':'transparent'}}>
    <TouchableOpacity onPress={()=>{setScalpType('CE');setScalpStrike(strike);}} style={{flex:1,alignItems:'center',justifyContent:'center',paddingVertical:9,backgroundColor:itmCall?'#8C785522':'transparent',borderRightWidth:1,borderColor:'#77847722'}}>
     <AppText style={{fontSize:15,fontWeight:'900',color:'#25B9A8'}}>{main(ce)}</AppText>
     <AppText style={{fontSize:10,color:muted,marginTop:3}}>{sub(ce)}</AppText>
    </TouchableOpacity>
    <TouchableOpacity onPress={()=>setScalpStrike(strike)} style={{width:88,alignItems:'center',justifyContent:'center',backgroundColor:selected?accent+'20':card,borderRightWidth:1,borderLeftWidth:1,borderColor:'#77847722'}}>
     <AppText style={{fontSize:15,fontWeight:'900',color:selected?accent:fg}}>{optionFmt(strike)}{selected?' ✓':''}</AppText>
     {strike===optionAtm?<AppText style={{fontSize:9,color:accent,fontWeight:'900'}}>ATM</AppText>:null}
    </TouchableOpacity>
    <TouchableOpacity onPress={()=>{setScalpType('PE');setScalpStrike(strike);}} style={{flex:1,alignItems:'center',justifyContent:'center',paddingVertical:9,backgroundColor:itmPut?'#8C785522':'transparent',borderLeftWidth:1,borderColor:'#77847722'}}>
     <AppText style={{fontSize:15,fontWeight:'900',color:'#F06B72'}}>{main(pe)}</AppText>
     <AppText style={{fontSize:10,color:muted,marginTop:3}}>{sub(pe)}</AppText>
    </TouchableOpacity>
   </View>;
  }):<AppText style={[s.settingDesc,{paddingVertical:18,textAlign:'center'}]}>{optionChainStatus==='error'?'FYERS option chain unavailable.':'Waiting for verified option-chain data.'}</AppText>}
  <View style={{flexDirection:'row',justifyContent:'space-between',paddingTop:12}}>
   <AppText style={s.settingDesc}>ATM {optionFmt(optionAtm)} • PCR {optionFmt(optionSummary.pcr,3)}</AppText>
   <AppText style={s.settingDesc}>Max Pain {optionFmt(optionSummary.max_pain)}</AppText>
  </View>
  <AppText style={s.settingDesc}>Tap Call or Put value to select its strike and side. All strikes returned by FYERS are shown. Missing data remains --.</AppText>
 </Card>
 <Card title="AI SMART DECISION" extra={<AppText style={scalpDataReady?s.green:s.accent}>{scalpDataReady?'LIVE INPUTS':'WAITING FOR DATA'}</AppText>}>
  <AppText style={{fontSize:27,fontWeight:'900',color:scalpSignal==='BUY CE'?green:scalpSignal==='BUY PE'?'#F06B72':accent,textAlign:'center',paddingVertical:12}}>{scalpSignal}</AppText>
  <Row label="Selected contract" value={scalpContract?optionFmt(scalpContract.strike_price)+' '+scalpType:'--'}/>
  <Row label="Rule score (not win probability)" value={scalpDataReady?scalpScore+'/100':'--'}/>
  <Row label="Market sentiment" value={aiReady?aiValue(aiAnalysis.market_bias):'WAITING'}/>
  <Row label="Risk" value={riskScore===null?'--':riskScore+'/100 • '+riskLevel}/>
  <Row label="Reason" value={scalpSignalReason}/>
 </Card>
 <Card title="INDEX TARGET / STOP LOSS">
  <Row label="Index entry" value={showMetric(scalpSpot)}/>
  <Row label="Index target (25 points)" value={scalpIndexTarget===null?'--':showMetric(scalpIndexTarget)}/>
  <Row label="Index stop loss (12.5 points)" value={scalpIndexStop===null?'--':showMetric(scalpIndexStop)}/>
 </Card>
 <Card title="OPTION PREMIUM TARGET / STOP LOSS">
  <Row label="Option entry" value={showMetric(scalpPremiumEntry)}/>
  <Row label="Premium target (+25)" value={scalpPremiumTarget===null?'--':showMetric(scalpPremiumTarget)}/>
  <Row label="Premium stop loss (-12.5)" value={scalpPremiumStop===null?'--':showMetric(scalpPremiumStop)}/>
 </Card>
 <Card title="TECHNICAL + OPTION GREEKS">
  <Row label="EMA 20 / EMA 50" value={showMetric(analysisIndicators.ema20)+' / '+showMetric(analysisIndicators.ema50)}/>
  <Row label="RSI / MACD" value={showMetric(analysisIndicators.rsi14)+' / '+showMetric(analysisIndicators.macd,4)}/>
  <Row label="VWAP / Breakout" value={showMetric(analysisIndicators.vwap)+' / '+(aiReady?aiValue(aiAnalysis.breakout_status):'WAITING')}/>
  <Row label="IV / Delta" value={showMetric(scalpContract?.iv)+' / '+showMetric(scalpContract?.delta,4)}/>
  <Row label="Gamma / Theta / Vega" value={showMetric(scalpContract?.gamma,5)+' / '+showMetric(scalpContract?.theta,4)+' / '+showMetric(scalpContract?.vega,4)}/>
  <Row label="OI / OI change / Volume" value={scalpContract?optionFmt(scalpContract.oi)+' / '+optionFmt(scalpContract.oi_change)+' / '+optionFmt(scalpContract.volume):'--'}/>
  <Row label="Greeks availability" value={scalpGreeks?'Available from FYERS':'Missing • WAIT'}/>
  <AppText style={s.settingDesc}>No synthetic market values. If live data or required Greeks are missing, the AI decision remains WAIT.</AppText>
 </Card>
 <Card title="READ ONLY • SAFETY">
  <Row label="Order execution" value="DISABLED"/>
  <Row label="Data source" value="Existing FYERS feed only"/>
  <AppText style={s.settingDesc}>Targets are illustrative reference levels, not guaranteed fills or returns. This section does not place orders.</AppText>
 </Card>
 </>:page==='performance'?<>
 <Card title="AI PERFORMANCE CENTER" extra={<AppText style={s.green}>● DAILY REPORT</AppText>}>
  <AppText style={s.settingDesc}>Signal outcomes are checked against the next available verified candle close. This is measured historical direction accuracy, not a profit guarantee.</AppText>
  <View style={s.split}><TouchableOpacity onPress={()=>setPerformanceMonth(new Date(performanceMonth.getFullYear(),performanceMonth.getMonth()-1,1))} style={s.chip}><AppText style={s.chipText}>‹ PREV</AppText></TouchableOpacity><AppText style={[s.value,{fontSize:16}]}>{performanceMonth.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</AppText><TouchableOpacity onPress={()=>setPerformanceMonth(new Date(performanceMonth.getFullYear(),performanceMonth.getMonth()+1,1))} style={s.chip}><AppText style={s.chipText}>NEXT ›</AppText></TouchableOpacity></View>
  <View style={{flexDirection:'row',flexWrap:'wrap',marginTop:8}}>{['Su','Mo','Tu','We','Th','Fr','Sa'].map((d,i)=><View key={d+i} style={{width:'14.285%',alignItems:'center',paddingVertical:7}}><AppText style={s.settingDesc}>{d}</AppText></View>)}
  {Array.from({length:new Date(performanceMonth.getFullYear(),performanceMonth.getMonth(),1).getDay()},(_,i)=><View key={'blank'+i} style={{width:'14.285%',padding:3}}/>)}
  {Array.from({length:new Date(performanceMonth.getFullYear(),performanceMonth.getMonth()+1,0).getDate()},(_,i)=>i+1).map(day=>{const date=new Date(performanceMonth.getFullYear(),performanceMonth.getMonth(),day),key=perfDateKey(date),rows=performanceRecords.filter(x=>x.date===key&&x.status!=='PENDING'),wins=rows.filter(x=>x.status==='SUCCESS').length,loss=rows.filter(x=>x.status==='FAILED').length,rate=rows.length?Math.round(wins/rows.length*100):null,selected=performanceDate===key;return <TouchableOpacity key={key} onPress={()=>setPerformanceDate(key)} style={{width:'14.285%',padding:3}}><View style={{minHeight:43,borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:selected?accent:rate===null?bg:rate>=50?'#176B43':'#78353B',borderWidth:1,borderColor:selected?accent:accent+'35'}}><AppText style={{fontSize:12,fontWeight:'900',color:selected?'#07111F':rate===null?fg:'#FFFFFF'}}>{day}</AppText><AppText style={{fontSize:8,color:selected?'#07111F':rate===null?muted:'#FFFFFF'}}>{rate===null?'':rate+'%'}</AppText></View></TouchableOpacity>})}</View>
  <AppText style={s.settingDesc}>Market session: 9:15 AM – 3:30 PM IST • Tap any date to view its saved report.</AppText>
 </Card>
 {(()=>{const dayRows=performanceRecords.filter(x=>x.date===performanceDate),done=dayRows.filter(x=>x.status!=='PENDING'),wins=done.filter(x=>x.status==='SUCCESS').length,loss=done.filter(x=>x.status==='FAILED').length,rate=done.length?Math.round(wins/done.length*100):null,tools=[...new Set(dayRows.map(x=>x.tool))];return <><Card title={'SELECTED DATE • '+perfFormatDate(performanceDate)}><Row label="Verified directional accuracy" value={rate===null?'--':rate+'%'}/><Row label="Total recorded signals" value={String(dayRows.length)}/><Row label="Successful / Failed" value={wins+' / '+loss}/><Row label="Pending" value={String(dayRows.filter(x=>x.status==='PENDING').length)}/><Row label="Market session" value="9:15 AM – 3:30 PM IST"/><AppText style={s.settingDesc}>{dayRows.length?'Only signals recorded on this device from the day selected are included.':'No saved signal data for this date. Earlier dates cannot be reconstructed if tracking was not active.'}</AppText></Card>
 <Card title="EIGHT SECTIONS • INDIVIDUAL INDICATOR ACCURACY">{[
 {section:'1. Market Sentiment',tools:['Market Sentiment']},
 {section:'2. Smart AI Decision',tools:['Smart AI Decision']},
 {section:'3. AI Analysis',tools:['AI Analysis']},
 {section:'4. Support & Resistance',tools:['Support','Resistance']},
 {section:'5. Technical Indicators',tools:['RSI','MACD','EMA 20 / 50','VWAP','Volume']},
 {section:'6. AI Market Analysis',tools:['Breakout / Breakdown','Bull Trap','Bear Trap','Next 5-minute Outlook']},
 {section:'7. Risk Meter',tools:['Risk Meter','Trend Stability','Momentum Intensity']},
 {section:'8. Smart Trade Decision',tools:['Smart Trade Decision']}
].map(group=><View key={group.section} style={{marginTop:7,marginBottom:8}}><AppText style={[s.settingTitle,{color:accent,marginBottom:3}]}>{group.section}</AppText>{group.tools.map(tool=>{const a=dayRows.filter(x=>x.tool===tool&&x.status!=='PENDING'),w=a.filter(x=>x.status==='SUCCESS').length,p=dayRows.filter(x=>x.tool===tool&&x.status==='PENDING').length,pct=a.length?Math.round(w/a.length*100):null;return <View key={tool} style={s.row}><AppText style={[s.rowLabel,{flex:1}]}>{tool}</AppText><AppText style={{fontSize:12,fontWeight:'900',color:pct===null?muted:pct>=60?'#28D17C':'#F05B62'}}>{pct===null?(p?'PENDING':'-- • PENDING'):pct+'% • '+w+'/'+a.length}</AppText></View>})}</View>)}</Card>
 <Card title="LEGACY SIGNALS • REFERENCE">{['Smart AI Trade Decision','AI Analysis'].map(tool=>{const a=dayRows.filter(x=>x.tool===tool&&x.status!=='PENDING'),w=a.filter(x=>x.status==='SUCCESS').length;return <Row key={tool} label={tool} value={a.length?(Math.round(w/a.length*100)+'% • '+w+'/'+a.length):'-- • PENDING'}/>})}<Row label="All recorded tools combined" value={rate===null?'--':rate+'%'}/><AppText style={s.settingDesc}>Green: accuracy 60% or higher • Red: below 60% • PENDING: no validated sample yet. Missing indicator calculations are not simulated.</AppText></Card>
 <Card title="SIGNAL HISTORY">{dayRows.length?[...dayRows].sort((a,b)=>String(a.time).localeCompare(String(b.time))).map(x=><Row key={x.id} label={x.time+' • '+x.index+' • '+x.tool+' '+x.direction} value={x.status==='SUCCESS'?'SUCCESS':x.status==='FAILED'?'FAILED':'PENDING'}/>):<AppText style={s.settingDesc}>No signals recorded for this date.</AppText>}</Card></>})()}
 </>:page==='watchlist'?<><Card title="MY WATCHLIST"><AppText style={s.settingDesc}>Add instruments to follow them here. Live quotes appear only after verified FYERS data is connected.</AppText>{['NIFTY 50','BANK NIFTY','SENSEX'].map(x=><Row key={x} label={x} value="--"/>)}</Card></>:page==='technical'?<><Card title="TECHNICAL ANALYSIS"><Row label="RSI (14)" value={showMetric(analysisIndicators.rsi14)}/><Row label="MACD" value={showMetric(analysisIndicators.macd,4)}/><Row label="MACD Signal" value={showMetric(analysisIndicators.macd_signal,4)}/><Row label="VWAP" value={showMetric(analysisIndicators.vwap)}/><Row label="EMA 20" value={showMetric(analysisIndicators.ema20)}/><Row label="EMA 50" value={showMetric(analysisIndicators.ema50)}/><Row label="Volume" value={showMetric(analysisIndicators.volume,0)}/><Row label="Supertrend" value="-- (not calculated)"/></Card></>:page==='support'?<><Card title="SUPPORT & RESISTANCE"><Row label="Resistance" value={showMetric(analysisIndicators.resistance)}/><Row label="Support" value={showMetric(analysisIndicators.support)}/><AppText style={s.settingDesc}>Calculated from the latest verified FYERS candles for {selectedIndex}.</AppText></Card></>:page==='risk'?<><Card title="VGROW • RISK GAUGE"><RiskGauge fg={fg} muted={muted} score={riskScore} status={aiReady?'live':'pending'}/><View style={{height:1,backgroundColor:accent+'35',marginVertical:12}}/><Row label="Current market risk" value={riskScore===null?'--':Math.round(riskScore)+'/100'}/><Row label="Volatility risk" value={riskScore===null?'--':riskLevel}/><Row label="Trend strength" value={trendStability===null?'--':trendStability+'/100'}/><Row label="Risk category" value={riskLevel}/></Card><Card title="RISK BREAKDOWN"><Row label="Price volatility risk" value={riskScore===null?'--':Math.round(riskScore)+'/100'}/><Row label="Trend stability score" value={trendStability===null?'--':trendStability+'/100'}/><Row label="Momentum intensity" value={momentumScore===null?'--':momentumScore+'/100'}/><AppText style={s.settingDesc}>Calculated from verified FYERS candles for {selectedIndex}. Trend stability uses EMA 20/50 spread; momentum uses RSI 14. Values remain pending when source data is unavailable.</AppText></Card></>:page==='options'?<>
 <Card title="AI OPTION CHAIN ANALYZER" extra={<AppText style={optionChainStatus==='live'?s.green:s.accent}>{optionChainStatus==='live'?'● FYERS LIVE':optionChainStatus==='error'?'● FEED ERROR':'● '+optionChainStatus.toUpperCase()}</AppText>}>
  <AppText style={s.settingDesc}>AI-powered options intelligence • Read-only • No order execution</AppText>
  <View style={[s.split,{marginTop:7}]}><AppText style={s.rowLabel}>SELECTED INDEX</AppText><AppText style={s.accent}>{selectedIndex}</AppText></View>
  <View style={s.split}><AppText style={s.rowLabel}>SPOT PRICE</AppText><AppText style={s.value}>{optionFmt(optionSpot,2)}</AppText></View>
  <View style={s.split}><AppText style={s.rowLabel}>NEAREST EXPIRY</AppText><AppText style={s.value}>{optionExpiry}</AppText></View>
  <View style={s.split}><AppText style={s.rowLabel}>ATM STRIKE</AppText><AppText style={s.value}>{optionFmt(optionAtm)}</AppText></View>
  <Row label="PCR (OI)" value={optionFmt(optionSummary.pcr,3)}/>
  <Row label="MAX PAIN" value={optionFmt(optionSummary.max_pain)}/>
 </Card>
 <Card title="AI MARKET VERDICT" extra={<AppText style={optionVerdictReady?s.green:s.accent}>{optionVerdictReady?'● CALCULATED':'● PENDING'}</AppText>}>
  <View style={{alignItems:'center',paddingVertical:12}}><AppText style={{fontSize:25,fontWeight:'900',color:optionVerdict==='BULLISH'?'#20C779':optionVerdict==='BEARISH'?'#F06B72':accent}}>{optionVerdict}</AppText><AppText style={[s.settingTitle,{marginTop:5}]}>PCR + FYERS AI MARKET BIAS</AppText></View>
  <Row label="AI confidence" value={optionVerdictConfidence===null?'PENDING':optionVerdictConfidence+'% (signal agreement)'}/><Row label="Trend strength" value={optionTrendStrength===null?'PENDING':optionTrendStrength+'/100 (RSI 14)'}/><Row label="Market regime" value={aiReady?aiAnalysis.market_regime||aiAnalysis.market_bias||'PENDING':'PENDING'}/><Row label="Next 5-minute outlook" value={aiReady?aiAnalysis.next_5_minute_outlook||'PENDING':'PENDING'}/><Row label="Next candle probability" value={aiReady&&aiAnalysis.next_candle_probability!==undefined?String(aiAnalysis.next_candle_probability):'PENDING'}/><Row label="Risk classification" value={riskScore===null?'PENDING':riskLevel+' ('+riskScore+'/100)'}/>
  <AppText style={s.settingDesc}>Verdict needs live option-chain PCR and live FYERS AI market bias. Confidence is signal agreement, not a profit probability.</AppText>
 </Card>
 <Card title="CE vs PE OPTION CHAIN" extra={<AppText style={optionChainStatus==='live'?s.green:s.accent}>{optionChainStatus==='live'?'FYERS LIVE':optionChainStatus.toUpperCase()}</AppText>}>
  <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:8}}><AppText style={[s.chartCaption,{color:'#20C779',fontWeight:'900'}]}>CALLS (CE)</AppText><AppText style={[s.chartCaption,{color:accent,fontWeight:'900'}]}>STRIKE</AppText><AppText style={[s.chartCaption,{color:'#F06B72',fontWeight:'900'}]}>PUTS (PE)</AppText></View>
  {optionNearby.length?optionNearby.map((strike,i)=>{const ce=optionRows.find(x=>x.strike_price===strike&&x.option_type==='CE');const pe=optionRows.find(x=>x.strike_price===strike&&x.option_type==='PE');return <View key={strike} style={[s.split,{paddingVertical:11,borderBottomWidth:1,borderBottomColor:'#77847725'}]}><View style={{flex:1}}><AppText style={{color:'#20C779',fontSize:12,fontWeight:'800'}}>{optionFmt(ce?.ltp,2)}</AppText><AppText style={s.chartCaption}>OI {optionFmt(ce?.oi)} • Δ {optionFmt(ce?.oi_change)}</AppText></View><View style={{flex:1,alignItems:'center'}}><AppText style={[s.value,{color:strike===optionAtm?accent:fg}]}>{optionFmt(strike)}</AppText></View><View style={{flex:1,alignItems:'flex-end'}}><AppText style={{color:'#F06B72',fontSize:12,fontWeight:'800'}}>{optionFmt(pe?.ltp,2)}</AppText><AppText style={s.chartCaption}>OI {optionFmt(pe?.oi)} • Δ {optionFmt(pe?.oi_change)}</AppText></View></View>}):<AppText style={s.settingDesc}>{optionChainStatus==='error'?'FYERS option chain unavailable. Check authorization/API access.':'Waiting for verified option-chain data.'}</AppText>}
  <Row label="Call OI" value={optionFmt(optionSummary.call_oi)}/>
  <Row label="Put OI" value={optionFmt(optionSummary.put_oi)}/>
  <Row label="Call volume" value={optionFmt(optionSummary.total_call_volume)}/>
  <Row label="Put volume" value={optionFmt(optionSummary.total_put_volume)}/>
  <AppText style={s.settingDesc}>OI, OI change, LTP and volume are read from FYERS. Refreshes every 30 seconds. IV displays only when supplied by FYERS.</AppText>
 </Card>
 <Card title="SMART MONEY & OI DETECTION" extra={<AppText style={optionLiveReady?s.green:s.accent}>{optionLiveReady?'● LIVE DATA':'● PENDING'}</AppText>}>
  <Row label="Call writing / unwinding" value={optionLiveReady?oiSignal(callWall):'PENDING'}/><Row label="Put writing / unwinding" value={optionLiveReady?oiSignal(putWall):'PENDING'}/><Row label="Fresh long positions" value={optionLiveReady?(optionCalls.some(x=>oiSignal(x)==='LONG BUILD-UP')||optionPuts.some(x=>oiSignal(x)==='LONG BUILD-UP')?'DETECTED':'NOT DETECTED'):'PENDING'}/><Row label="Fresh short positions" value={optionLiveReady?(optionCalls.some(x=>oiSignal(x)==='SHORT BUILD-UP')||optionPuts.some(x=>oiSignal(x)==='SHORT BUILD-UP')?'DETECTED':'NOT DETECTED'):'PENDING'}/><Row label="Unusual OI build-up" value={optionLiveReady?(optionValidRows.some(x=>Number(x.oi_change)>0&&Number(x.oi)>0)?'OI BUILD-UP PRESENT':'NOT DETECTED'):'PENDING'}/><Row label="Volume spike detection" value={optionLiveReady?(optionValidRows.some(x=>Number(x.volume)>0)?'VOLUME DATA AVAILABLE':'PENDING'):'PENDING'}/><Row label="Institutional activity clues" value="OI / volume clues only — institutions cannot be identified from this feed"/>
  <AppText style={s.settingDesc}>Price + OI classification is shown only when the contract supplies price-change fields. OI build-up alone cannot prove institutional activity.</AppText>
 </Card>
 <Card title="AI TRAP & BREAKOUT DETECTION" extra={<AppText style={aiReady?s.green:s.accent}>{aiReady?'● FYERS ANALYSIS':'● PENDING'}</AppText>}>
  <Row label="Bull trap detection" value={aiReady?optionBullTrap:'PENDING'}/><Row label="Bear trap detection" value={aiReady?optionBearTrap:'PENDING'}/><Row label="Upside breakout probability" value={aiReady&&optionBreakout==='BREAKOUT'?'BREAKOUT CONFIRMED':aiReady?'NO CONFIRMED BREAKOUT':'PENDING'}/><Row label="Downside breakout probability" value={aiReady&&optionBreakout==='BREAKDOWN'?'BREAKDOWN CONFIRMED':aiReady?'NO CONFIRMED BREAKDOWN':'PENDING'}/><Row label="Short covering signal" value={optionLiveReady&&optionCalls.some(x=>oiSignal(x)==='SHORT COVERING')?'DETECTED':'PENDING'}/><Row label="Long unwinding signal" value={optionLiveReady&&optionCalls.some(x=>oiSignal(x)==='LONG UNWINDING')?'DETECTED':'PENDING'}/><Row label="False breakout warning" value={aiReady&&['BREAKOUT','BREAKDOWN'].includes(optionBreakout)?'WAIT FOR FOLLOW-THROUGH':'PENDING'}/>
  <AppText style={s.settingDesc}>Breakout status comes from the existing verified FYERS AI analysis. Trap confirmation needs a failed retest; unavailable evidence stays pending.</AppText>
 </Card>
 <Card title="PCR • MAX PAIN • SENTIMENT">
  <View style={s.marketGrid}>{[{a:'PCR',v:optionFmt(optionSummary.pcr,3),b:'Put / Call Ratio'},{a:'MAX PAIN',v:optionFmt(optionSummary.max_pain),b:'Max pain strike'},{a:'PCR STATUS',v:optionPcr===null?'--':'LIVE',b:'Current verified snapshot'},{a:'TOTAL OI',v:optionFmt(optionTotalOI),b:'Call + Put OI'}].map(x=><View key={x.a} style={[s.marketCard,{minHeight:72}]}><AppText style={s.marketName}>{x.a}</AppText><AppText style={[s.marketValue,{fontSize:18}]}>{x.v}</AppText><AppText style={s.marketChange}>{x.b}</AppText></View>)}</View>
  <Row label="Overall option sentiment (PCR-based)" value={optionSentiment}/><Row label="CE / PE dominance (OI)" value={optionDominance}/><Row label="Sentiment change" value="Requires previous live snapshot"/>
  <AppText style={s.settingDesc}>Sentiment is indicative and calculated from verified FYERS open interest. It is not a standalone trading signal.</AppText>
 </Card>
 <Card title="IV & OPTION GREEKS" extra={<AppText style={optionLiveReady?s.green:s.accent}>{optionLiveReady?'● OPTION CHAIN':'● PENDING'}</AppText>}>
  <Row label="Implied volatility (ATM CE/PE avg)" value={optionIv===null?'PENDING':optionFmt(optionIv,2)+'%'}/><Row label="IV rank / percentile" value="PENDING — historical IV series unavailable"/><Row label="Delta (ATM CE)" value={optionDelta===null?'PENDING':optionFmt(optionDelta,3)}/><Row label="Gamma (ATM avg)" value={optionGamma===null?'PENDING':optionFmt(optionGamma,4)}/><Row label="Theta (ATM avg)" value={optionTheta===null?'PENDING':optionFmt(optionTheta,3)}/><Row label="Vega (ATM avg)" value={optionVega===null?'PENDING':optionFmt(optionVega,3)}/><Row label="ATM straddle premium" value={straddle===null?'PENDING':optionFmt(straddle,2)}/>
  <AppText style={s.settingDesc}>Values are read from the selected index's ATM CE/PE contract fields. No Greeks or IV are estimated when FYERS does not supply them.</AppText>
 </Card>
 <Card title="AI SUPPORT & RESISTANCE" extra={<AppText style={optionLiveReady?s.green:s.accent}>{optionLiveReady?'● OI LEVELS':'● PENDING'}</AppText>}>
  <Row label="Strongest CE resistance" value={callWall?optionFmt(callWall.strike_price):'PENDING'}/><Row label="Second CE resistance" value={callWall2?optionFmt(callWall2.strike_price):'PENDING'}/><Row label="Strongest PE support" value={putWall?optionFmt(putWall.strike_price):'PENDING'}/><Row label="Second PE support" value={putWall2?optionFmt(putWall2.strike_price):'PENDING'}/><Row label="Highest call OI strike" value={callWall?optionFmt(callWall.strike_price):'PENDING'}/><Row label="Highest put OI strike" value={putWall?optionFmt(putWall.strike_price):'PENDING'}/><Row label="OI wall shift" value={optionSnapshotHistory.length>1?'Compare successive snapshots; current shift requires changed strike ranking':'PENDING — need another live snapshot'}/>
  <AppText style={s.settingDesc}>Levels are OI concentration zones from the live strike-wise chain, not guaranteed price support or resistance.</AppText>
 </Card>
 <Card title="AI SIGNAL HISTORY & EXPLANATION" extra={<AppText style={optionHistoryLatest?s.green:s.accent}>{optionHistoryLatest?'● '+optionSignalHistory.length+' RECORDED':'● NO VERIFIED SIGNAL'}</AppText>}>
  <Row label="Latest detected setup" value={optionHistoryLatest?optionHistoryLatest.setup:'PENDING'}/><Row label="Signal timestamp" value={optionHistoryLatest?optionHistoryLatest.stamp:'PENDING'}/><Row label="What changed?" value={optionHistoryLatest?'PCR '+optionFmt(optionHistoryLatest.pcr,3)+' • Spot '+optionFmt(optionHistoryLatest.spot,2):'PENDING'}/><Row label="Why AI detected it?" value={optionHistoryLatest?optionHistoryLatest.reason:'No verified setup recorded yet'}/><Row label="Invalidation level" value={optionHistoryLatest&&optionHistoryLatest.invalidation!==null?optionFmt(optionHistoryLatest.invalidation):'PENDING'}/><Row label="Risk / reward context" value={riskScore===null?'PENDING':riskLevel+' risk • '+riskScore+'/100'}/>
  {optionSignalHistory.slice(0,8).map(item=><View key={item.id} style={s.row}><AppText style={s.rowLabel}>{item.index} • {item.stamp}</AppText><AppText style={s.value}>{item.setup}</AppText></View>)}
  <AppText style={s.settingDesc}>History starts from this version and records new verified snapshots only. It cannot recreate past signals.</AppText>
 </Card>
 <Card title="DATA QUALITY & CONNECTION">
  <Row label="FYERS connection" value="Not connected"/><Row label="Option-chain feed" value="Pending integration"/><Row label="Last data update" value="--"/><Row label="Data freshness" value="--"/><Row label="AI engine" value="Waiting for live feed"/>
  <AppText style={s.settingDesc}>The analyzer will remain in a pending state until valid, current FYERS data is received. Missing or stale values will never be replaced with invented numbers.</AppText>
 </Card>
 </>:<>
 <Card title="PERSONALIZATION"><AppText style={s.eyebrow}>{t.theme} • 20 THEMES</AppText><View style={s.wrap}>{THEMES.map((x,i)=><TouchableOpacity key={x[0]} onPress={()=>setTheme(i)} style={[s.chip,{backgroundColor:x[1],borderColor:theme===i?x[3]:'#77847766'}]}><AppText style={[s.chipText,{color:THEMES[i][4]}]}>{x[0]}{theme===i?' ✓':''}</AppText></TouchableOpacity>)}</View><View style={{height:1,backgroundColor:'#77847733',marginVertical:9}}/><AppText style={s.eyebrow}>{t.language} • 6 LANGUAGES</AppText><View style={s.wrap}>{LANGS.map((x,i)=><TouchableOpacity key={x} onPress={()=>setLang(i)} style={[s.chip,{borderColor:lang===i?accent:'#77847766'}]}><AppText style={[s.chipText,{color:fg}]}>{x}{lang===i?' ✓':''}</AppText></TouchableOpacity>)}</View></Card>
 <Card title="FONT & DISPLAY"><AppText style={s.eyebrow}>APP FONT • 29 OPTIONS</AppText><View style={s.wrap}>{FONT_OPTIONS.map(name=><TouchableOpacity key={name} onPress={()=>setSelectedFont(name)} style={[s.chip,{borderColor:selectedFont===name?accent:'#77847766',backgroundColor:selectedFont===name?accent+'20':'transparent'}]}><AppText style={[s.chipText,{color:fg}]}>{name}{selectedFont===name?' ✓':''}</AppText></TouchableOpacity>)}</View><View style={{height:1,backgroundColor:'#77847733',marginVertical:10}}/><View style={s.split}><AppText style={s.settingTitle}>FONT SIZE</AppText><AppText style={s.accent}>{Math.round(fontScale*100)}%</AppText></View><View style={{flexDirection:'row',alignItems:'center',marginTop:10}}><TouchableOpacity onPress={()=>setFontScale(v=>Math.max(.8,Math.round((v-.05)*100)/100))} style={[s.chip,{borderColor:accent}]}><AppText style={[s.chipText,{color:fg}]}>A−</AppText></TouchableOpacity><View style={{flex:1,height:7,backgroundColor:'#77847744',borderRadius:8,overflow:'hidden'}}><View style={{height:7,width:((fontScale-.8)/.6*100)+'%',backgroundColor:accent,borderRadius:8}}/></View><TouchableOpacity onPress={()=>setFontScale(v=>Math.min(1.4,Math.round((v+.05)*100)/100))} style={[s.chip,{borderColor:accent,marginLeft:8}]}><AppText style={[s.chipText,{color:fg}]}>A+</AppText></TouchableOpacity></View><AppText style={s.settingDesc}>Font size: 80% – 140%</AppText></Card>
 <Card title="SECURITY & ALERTS"><View style={s.setting}><View style={{flex:1,paddingRight:12}}><AppText style={s.settingTitle}>{t.notify}</AppText><AppText style={s.settingDesc}>Enable or disable Vgrow market notifications.</AppText></View><Switch value={notify} onValueChange={toggleNotifications} trackColor={{true:accent}}/></View>{notify&&<View style={[s.box,{padding:12,marginTop:8}]}><AppText style={s.settingTitle}>MARKET NOTIFICATION TYPES</AppText>{NOTIFICATION_TYPES.map(([key,label,desc])=><View key={key} style={[s.setting,{paddingVertical:8}]}><View style={{flex:1,paddingRight:8}}><AppText style={s.settingTitle}>{label}</AppText><AppText style={s.settingDesc}>{desc}</AppText></View><Switch value={!!notifyPrefs[key]} onValueChange={v=>updateNotifyPref(key,v)} trackColor={{true:accent}}/><TouchableOpacity onPress={()=>previewNotification(key,label)} style={[s.chip,{borderColor:accent,marginLeft:7,paddingVertical:6}]}><AppText style={[s.chipText,{color:accent}]}>TEST</AppText></TouchableOpacity></View>)}<View style={s.setting}><AppText style={s.settingTitle}>Sound</AppText><Switch value={notifySound} onValueChange={updateNotifySound} trackColor={{true:accent}}/></View><View style={s.setting}><AppText style={s.settingTitle}>Vibration</AppText><Switch value={notifyVibration} onValueChange={updateNotifyVibration} trackColor={{true:accent}}/></View><AppText style={s.settingDesc}>Each type has its own Android notification channel. You can customize its tone in Android notification settings.</AppText></View>}<View style={s.setting}><View style={{flex:1,paddingRight:12}}><AppText style={s.settingTitle}>{t.finger}</AppText><AppText style={s.settingDesc}>Biometric support is not connected yet</AppText></View><Switch value={finger} onValueChange={toggleFingerprint} trackColor={{true:accent}}/></View><AppText style={s.settingDesc}>{finger?'Biometric lock enabled. Vgrow will request device authentication when opened.':'Enable secure device fingerprint/biometric authentication for Vgrow.'}</AppText></Card>
 <Card title="BROKER & DATA"><Row label="Broker" value="FYERS"/><Row label="Market data" value="Pending connection"/><Row label="Application mode" value="READ ONLY"/><Row label="Order execution" value="DISABLED"/></Card>
 </>;
 if(appLocked)return <SafeAreaView style={[s.root,{justifyContent:'center',alignItems:'center',padding:28}]}><StatusBar backgroundColor={bg} barStyle={light?'dark-content':'light-content'} translucent={false}/><Image source={require('./assets/WhatsApp Image 2026-11-22 at 9.10.43 PM.jpeg')} style={{width:88,height:88,resizeMode:'contain',marginBottom:18}}/><AppText style={[s.logo,{marginBottom:8}]}>Vgrow Locked</AppText><AppText style={[s.muted,{textAlign:'center',marginBottom:22}]}>Authenticate to open your app</AppText><TouchableOpacity onPress={async()=>{const result=await LocalAuthentication.authenticateAsync({promptMessage:'Unlock Vgrow',cancelLabel:'Cancel',disableDeviceFallback:false});if(result.success)setAppLocked(false);}} style={{backgroundColor:accent,paddingHorizontal:28,paddingVertical:13,borderRadius:14}}><AppText style={{color:'#06120B',fontWeight:'900'}}>UNLOCK WITH BIOMETRICS</AppText></TouchableOpacity></SafeAreaView>;
 return <SafeAreaView style={s.root}><StatusBar backgroundColor={bg} barStyle={light?'dark-content':'light-content'} translucent={false}/><View style={s.header}><View style={s.logoRow}><Image source={require('./assets/WhatsApp Image 2026-11-22 at 9.10.43 PM.jpeg')} style={s.logoImage}/><View><AppText style={s.logo}>Vgrow</AppText><AppText style={s.muted}>SMART MARKET INTELLIGENCE</AppText></View></View><View style={{alignItems:'flex-end',flexShrink:0,minWidth:112,paddingLeft:6}}><AppText style={[s.accent,{fontSize:14,fontWeight:'900'}]}>{time.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})}</AppText><AppText style={[s.muted,{fontSize:12,fontWeight:'700'}]}>{time.toLocaleDateString([], {day:'2-digit',month:'short',year:'numeric'})}</AppText></View></View><Image pointerEvents="none" source={require('./assets/WhatsApp Image 2026-11-22 at 9.10.43 PM.jpeg')} style={{position:'absolute',width:280,height:280,resizeMode:'contain',opacity:0.055,alignSelf:'center',top:'34%'}}/><ScrollView style={{flex:1}} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}><AppText style={s.pageTitle}>{labels[pages.indexOf(page)]||page.toUpperCase()}</AppText><AppText style={s.pageSub}>INDIAN MARKETS  •  READ-ONLY ANALYSIS</AppText><View style={[s.box,{paddingVertical:11,marginBottom:12}]}><View style={s.split}><AppText style={s.boxTitle}>GLOBAL SELECTED INDEX</AppText><AppText style={s.accent}>{selectedIndex}</AppText></View><View style={s.wrap}>{['NIFTY','BANKNIFTY','FINNIFTY','SENSEX'].map(x=><TouchableOpacity key={x} onPress={()=>{setSelectedIndex(x);setMarketAnalysis(null);setOptionChain(null);setAnalysisStatus('loading');setOptionChainStatus('loading');}} style={[s.chip,{borderColor:selectedIndex===x?accent:'#77847766',backgroundColor:selectedIndex===x?accent+'20':'transparent'}]}><AppText style={[s.chipText,{color:selectedIndex===x?accent:fg}]}>{x}{selectedIndex===x?' ✓':''}</AppText></TouchableOpacity>)}</View></View>{content}<AppText style={s.footer}>{t.ro}</AppText></ScrollView><View style={s.navSafe}><View style={s.nav}>{pages.map((x,i)=><TouchableOpacity key={x} style={s.navItem} onPress={()=>setPage(x)}><AppText style={{fontSize:15,color:page===x?accent:muted}}>{['🏠','📈','✨','⭐','⚙️'][i]}</AppText><AppText style={[s.navText,{color:page===x?accent:muted,marginTop:4}]}>{labels[i]}</AppText><View style={[s.navDot,{backgroundColor:page===x?accent:'transparent'}]}/></TouchableOpacity>)}</View></View></SafeAreaView>;
}
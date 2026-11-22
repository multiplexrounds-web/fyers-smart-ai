import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, SafeAreaView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

const GOLD = '#D6AD55';
const BG = '#090A0D';
const CARD = '#17181D';
const MUTED = '#92939B';
const GREEN = '#20C997';
const RED = '#F05B65';

function Card({children}) {
  return <View style={s.card}>{children}</View>;
}

function App() {
  const [tab, setTab] = useState('HOME');
  const [symbol, setSymbol] = useState('NIFTY');
  const [frame, setFrame] = useState('5m');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString('en-IN');
  const date = now.toLocaleDateString('en-IN', {
    day:'2-digit', month:'short', year:'numeric'
  });

  const Header = () => (
    <View style={s.header}>
      <View>
        <Text style={s.brand}>FYERS <Text style={{color:GOLD}}>SMART AI</Text></Text>
        <Text style={s.sub}>PREMIUM MARKET INTELLIGENCE</Text>
      </View>
      <View style={{alignItems:'flex-end'}}>
        <Text style={s.gold}>{time}</Text>
        <Text style={s.muted}>{date}</Text>
      </View>
    </View>
  );

  const Section = ({title, right}) => (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.gold}>{right || ''}</Text>
    </View>
  );

  const Home = () => (
    <>
      <Card>
        <Section title="MARKET WATCH" right="LIVE DATA PENDING"/>
        <View style={s.row}>
          {['NIFTY','BANKNIFTY','SENSEX'].map(x=>(
            <TouchableOpacity key={x} onPress={()=>setSymbol(x)}
              style={[s.chip,symbol===x&&s.active]}>
              <Text style={[s.chipText,symbol===x&&{color:GOLD}]}>{x}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.price}>-- <Text style={s.muted}>INR</Text></Text>
        <Text style={s.muted}>Price and change will appear after FYERS connection</Text>
      </Card>

      <Card>
        <Section title="MARKET SENTIMENT"/>
        <Text style={s.bigGold}>WAITING</Text>
        <Text style={s.muted}>Live market data required</Text>
      </Card>

      <Card>
        <Section title="MARKET CHART" right={symbol}/>
        <View style={s.row}>
          {['1m','3m','5m','10m','15m','30m','1h','2h','4h','D'].map(x=>(
            <TouchableOpacity key={x} onPress={()=>setFrame(x)}
              style={[s.timeChip,frame===x&&s.active]}>
              <Text style={{color:frame===x?GOLD:'#AAA',fontSize:11}}>{x}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.chart}>
          <Text style={s.bigGold}>CHART</Text>
          <Text style={s.muted}>Candlestick data will appear after connection</Text>
        </View>
      </Card>

      <Card>
        <Section title="AI NEXT CANDLE ANALYSIS"/>
        <View style={s.row}>
          <View style={s.half}>
            <Text style={s.muted}>GREEN PROBABILITY</Text>
            <Text style={s.bigGold}>-- %</Text>
          </View>
          <View style={s.half}>
            <Text style={s.muted}>RED PROBABILITY</Text>
            <Text style={s.bigGold}>-- %</Text>
          </View>
        </View>
        <Text style={s.muted}>Next 5-minute candle prediction pending</Text>
      </Card>

      <Card>
        <Section title="DAILY SUPPORT & RESISTANCE"/>
        {['Resistance','Pivot','Support'].map(x=>(
          <View style={s.dataRow} key={x}>
            <Text style={s.muted}>{x}</Text>
            <Text style={s.gold}>--</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Section title="AI RISK METER"/>
        <Text style={s.bigGold}>-- / 100</Text>
        <Text style={s.muted}>Risk level pending live data</Text>
      </Card>

      <Card>
        <Section title="TECHNICAL INDICATORS"/>
        {['RSI','MACD','VWAP','EMA','SUPERTREND','VOLUME'].map(x=>(
          <View style={s.dataRow} key={x}>
            <Text style={s.muted}>{x}</Text>
            <Text style={s.gold}>--</Text>
          </View>
        ))}
      </Card>
    </>
  );

  const Analysis = () => (
    <>
      <Card>
        <Section title="AI MARKET ANALYZER"/>
        {['Bullish / Bearish / Sideways','Trend Strength','Next Candle','Confidence','Market Risk','Price Action'].map(x=>(
          <View style={s.dataRow} key={x}>
            <Text style={s.muted}>{x}</Text>
            <Text style={s.gold}>--</Text>
          </View>
        ))}
      </Card>
      <Card>
        <Section title="AI OPTION ANALYZER"/>
        {['Long Buildup','Short Buildup','Short Covering','Long Unwinding','CE / PE Strength','Target / Stop Loss'].map(x=>(
          <View style={s.dataRow} key={x}>
            <Text style={s.muted}>{x}</Text>
            <Text style={s.gold}>--</Text>
          </View>
        ))}
      </Card>
    </>
  );

  const Options = () => (
    <>
      <Card>
        <Section title="OPTION CHAIN" right={symbol}/>
        <View style={s.row}>
          <Text style={s.gold}>CALL (CE)</Text>
          <Text style={s.gold}>STRIKE</Text>
          <Text style={s.gold}>PUT (PE)</Text>
        </View>
        {['OI','CHANGE OI','VOLUME','IV','LTP'].map(x=>(
          <View style={s.dataRow} key={x}>
            <Text style={s.muted}>{x}</Text>
            <Text style={s.gold}>--</Text>
            <Text style={s.gold}>--</Text>
          </View>
        ))}
      </Card>
      <Card>
        <Section title="OPTION INSIGHTS"/>
        {['PCR','MAX PAIN','ATM STRIKE','IV','GREEKS'].map(x=>(
          <View style={s.dataRow} key={x}>
            <Text style={s.muted}>{x}</Text>
            <Text style={s.gold}>--</Text>
          </View>
        ))}
      </Card>
    </>
  );

  const Charts = () => (
    <Card>
      <Section title="ADVANCED CHART"/>
      <Text style={s.bigGold}>{symbol}</Text>
      <Text style={s.muted}>Timeframe: {frame}</Text>
      <View style={s.chart}>
        <Text style={s.gold}>Live chart pending connection</Text>
      </View>
    </Card>
  );

  const Settings = () => (
    <Card>
      <Section title="APP SETTINGS"/>
      {['Theme: Black + Gold','Market: NSE / BSE','Live Data Connection','Notifications','Watchlist','Privacy & Security','Read Only Mode: ON','Order Execution: DISABLED'].map(x=>(
        <View style={s.dataRow} key={x}>
          <Text style={s.muted}>{x}</Text>
          <Text style={s.gold}>›</Text>
        </View>
      ))}
    </Card>
  );

  const pages = {
    HOME:<Home/>,
    CHART:<Charts/>,
    AI:<Analysis/>,
    OPTIONS:<Options/>,
    SETTINGS:<Settings/>
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light"/>
      <Header/>
      <ScrollView contentContainerStyle={s.content}>
        {pages[tab]}
        <Text style={s.footer}>FYERS SMART AI  •  READ ONLY  •  NO ORDER EXECUTION</Text>
      </ScrollView>
      <View style={s.nav}>
        {['HOME','CHART','AI','OPTIONS','SETTINGS'].map(x=>(
          <TouchableOpacity key={x} style={s.navItem} onPress={()=>setTab(x)}>
            <Text style={{color:tab===x?GOLD:MUTED,fontSize:11,fontWeight:'bold'}}>{x}</Text>
            <View style={[s.navLine,tab===x&&{backgroundColor:GOLD}]}/>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:BG},
  header:{padding:18,paddingTop:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderColor:'#29251C'},
  brand:{color:'#FFF',fontSize:22,fontWeight:'900',letterSpacing:1},
  sub:{color:MUTED,fontSize:9,letterSpacing:1.5,marginTop:4},
  gold:{color:GOLD,fontWeight:'bold'},
  muted:{color:MUTED,fontSize:12},
  content:{padding:15,paddingBottom:25},
  card:{backgroundColor:CARD,borderRadius:16,padding:17,marginBottom:14,borderWidth:1,borderColor:'#34302A'},
  section:{flexDirection:'row',justifyContent:'space-between',marginBottom:15},
  sectionTitle:{color:'#F2E7D0',fontSize:12,fontWeight:'bold',letterSpacing:1},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:7},
  chip:{padding:10,borderRadius:9,backgroundColor:'#22232A'},
  active:{borderWidth:1,borderColor:GOLD,backgroundColor:'#30291C'},
  chipText:{color:'#AAA',fontSize:11,fontWeight:'bold'},
  price:{fontSize:34,color:'#FFF',fontWeight:'bold',marginVertical:12},
  bigGold:{fontSize:26,color:GOLD,fontWeight:'bold',marginVertical:8},
  half:{width:'47%'},
  timeChip:{padding:7,backgroundColor:'#24252A',borderRadius:6},
  chart:{height:155,backgroundColor:'#101116',borderRadius:10,alignItems:'center',justifyContent:'center',marginTop:14,borderWidth:1,borderColor:'#302B21'},
  dataRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:12,borderBottomWidth:1,borderColor:'#292A30'},
  nav:{flexDirection:'row',backgroundColor:'#141519',borderTopWidth:1,borderColor:'#34302A',paddingVertical:13},
  navItem:{flex:1,alignItems:'center',gap:8},
  navLine:{height:2,width:22,backgroundColor:'transparent'},
  footer:{color:GOLD,textAlign:'center',fontSize:9,marginVertical:18,letterSpacing:1}
});

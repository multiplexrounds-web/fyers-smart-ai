import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, SafeAreaView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

const C = {
  bg: '#070B12',
  card: '#111A25',
  green: '#00E6A0',
  red: '#FF5268',
  white: '#FFFFFF',
  muted: '#8795A8',
  border: '#253344',
  yellow: '#FFC857'
};

const indexes = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
const frames = ['1m','3m','5m','10m','15m','30m','1H','2H','4H','1D'];
const tabs = ['Home','Charts','AI','Options','Settings'];

function Card({ children }) {
  return <View style={s.card}>{children}</View>;
}

function Heading({ children }) {
  return <Text style={s.heading}>{children}</Text>;
}

function Chip({ title, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={[s.chip, active && s.activeChip]}>
      <Text style={{color:active ? C.bg : C.muted,fontWeight:'bold'}}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function Row({ left, right, color }) {
  return (
    <View style={s.rowBetween}>
      <Text style={s.label}>{left}</Text>
      <Text style={[s.value,color ? {color} : null]}>{right}</Text>
    </View>
  );
}

export default function App() {
  const [tab,setTab] = useState('Home');
  const [symbol,setSymbol] = useState('NIFTY');
  const [frame,setFrame] = useState('5m');
  const [strike,setStrike] = useState(25000);
  const [optionType,setOptionType] = useState('CE');

  const Header = () => (
    <View style={s.header}>
      <View>
        <Text style={s.brand}>
          FYERS <Text style={s.green}>SMART AI</Text>
        </Text>
        <Text style={s.sub}>ADVANCED MARKET INTELLIGENCE</Text>
      </View>
      <Text style={s.green}>● READ ONLY</Text>
    </View>
  );

  const MarketSelector = () => (
    <View style={s.wrap}>
      {indexes.map(x => (
        <Chip key={x} title={x} active={symbol===x}
          onPress={()=>setSymbol(x)} />
      ))}
    </View>
  );

  const Home = () => (
    <>
      <Heading>MARKET WATCH</Heading>
      <MarketSelector/>
      <View style={s.row}>
        {indexes.map(x => (
          <View key={x} style={s.marketCard}>
            <Text style={s.muted}>{x}</Text>
            <Text style={s.price}>--</Text>
            <Text style={s.muted}>Data pending</Text>
          </View>
        ))}
      </View>

      <Heading>AI MARKET SENTIMENT</Heading>
      <Card>
        <Text style={s.big}>WAITING FOR DATA</Text>
        <Text style={s.muted}>Bullish / Bearish / Sideways</Text>
        <View style={s.line}/>
        <Row left="AI Confidence" right="-- %" color={C.green}/>
        <Text style={s.note}>Live data connection pending.</Text>
      </Card>

      <Heading>NEXT 5 MIN CANDLE PREDICTION</Heading>
      <Card>
        <View style={s.row}>
          <View style={s.half}>
            <Text style={s.green}>GREEN</Text>
            <Text style={s.big}>-- %</Text>
          </View>
          <View style={s.half}>
            <Text style={s.red}>RED</Text>
            <Text style={s.big}>-- %</Text>
          </View>
        </View>
        <Text style={s.note}>Prediction requires live data and a validated calculation engine.</Text>
      </Card>

      <Heading>DAILY SUPPORT & RESISTANCE</Heading>
      <Card>
        <Row left="Resistance 2" right="--" color={C.red}/>
        <Row left="Resistance 1" right="--" color={C.red}/>
        <View style={s.line}/>
        <Row left="Support 1" right="--" color={C.green}/>
        <Row left="Support 2" right="--" color={C.green}/>
      </Card>

      <Heading>AI RISK METER</Heading>
      <Card>
        <Text style={s.big}>--</Text>
        <Text style={s.yellow}>LOW / MEDIUM / HIGH</Text>
        <Text style={s.note}>Risk calculation pending live data.</Text>
      </Card>

      <Heading>TECHNICAL INDICATORS</Heading>
      <Card>
        {['RSI (14)','MACD','VWAP','EMA 20 / 50 / 200','SUPERTREND','VOLUME'].map(x=>(
          <Row key={x} left={x} right="--"/>
        ))}
      </Card>
    </>
  );

  const Charts = () => (
    <>
      <Heading>MARKET CHARTS</Heading>
      <MarketSelector/>
      <Heading>SELECT TIMEFRAME</Heading>
      <View style={s.wrap}>
        {frames.map(x=>(
          <Chip key={x} title={x} active={frame===x}
            onPress={()=>setFrame(x)}/>
        ))}
      </View>
      <Card>
        <Text style={s.green}>{symbol} • {frame}</Text>
        <View style={s.chart}>
          <Text style={s.big}>CANDLESTICK CHART</Text>
          <Text style={s.muted}>Live chart integration pending</Text>
        </View>
      </Card>
      <Heading>PRICE ACTION</Heading>
      <Card>
        <Row left="Trend" right="--"/>
        <Row left="Momentum" right="--"/>
        <Row left="Volume" right="--"/>
        <Row left="Breakout" right="--"/>
      </Card>
    </>
  );

  const AIAnalysis = () => (
    <>
      <Heading>SMART AI DETECTION</Heading>
      <MarketSelector/>
      <Card>
        <Text style={s.big}>AI ANALYSIS</Text>
        <Text style={s.muted}>Automatic multi-indicator analysis</Text>
        <View style={s.line}/>
        <Row left="Market Trend" right="--"/>
        <Row left="Market Sentiment" right="--"/>
        <Row left="Trend Strength" right="--"/>
        <Row left="AI Confidence" right="-- %"/>
      </Card>

      <Heading>NEXT CANDLE ANALYSER</Heading>
      <Card>
        <Row left="Next 5 Minute Candle" right="--"/>
        <Row left="Green Probability" right="-- %" color={C.green}/>
        <Row left="Red Probability" right="-- %" color={C.red}/>
        <Text style={s.note}>Probabilities will require live and historical data. They are not guaranteed predictions.</Text>
      </Card>

      <Heading>SUPPORT & RESISTANCE</Heading>
      <Card>
        <Row left="Daily Pivot" right="--"/>
        <Row left="Resistance 1 / 2" right="--"/>
        <Row left="Support 1 / 2" right="--"/>
      </Card>

      <Heading>RISK ANALYSER</Heading>
      <Card>
        <Text style={s.big}>RISK: --</Text>
        <Row left="Volatility Risk" right="--"/>
        <Row left="Trend Risk" right="--"/>
        <Row left="Reward / Risk" right="--"/>
      </Card>
    </>
  );

  const Options = () => (
    <>
      <Heading>OPTION CHAIN</Heading>
      <MarketSelector/>

      <Heading>OPTION TYPE</Heading>
      <View style={s.wrap}>
        <Chip title="CALL (CE)" active={optionType==='CE'}
          onPress={()=>setOptionType('CE')}/>
        <Chip title="PUT (PE)" active={optionType==='PE'}
          onPress={()=>setOptionType('PE')}/>
      </View>

      <Heading>SELECT STRIKE PRICE</Heading>
      <Card>
        <View style={s.rowBetween}>
          <TouchableOpacity
            style={s.strikeButton}
            onPress={()=>setStrike(Math.max(0,strike-50))}>
            <Text style={s.white}>−</Text>
          </TouchableOpacity>
          <View style={{alignItems:'center'}}>
            <Text style={s.muted}>SELECTED STRIKE</Text>
            <Text style={s.big}>{strike}</Text>
          </View>
          <TouchableOpacity
            style={s.strikeButton}
            onPress={()=>setStrike(strike+50)}>
            <Text style={s.white}>+</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Heading>OPTION CHAIN DATA</Heading>
      <Card>
        <View style={s.rowBetween}>
          <Text style={s.green}>CALL (CE)</Text>
          <Text style={s.yellow}>STRIKE</Text>
          <Text style={s.red}>PUT (PE)</Text>
        </View>
        {[-100,-50,0,50,100].map(n=>(
          <View key={n} style={s.chainRow}>
            <Text style={s.label}>--</Text>
            <Text style={s.white}>{strike+n}</Text>
            <Text style={s.label}>--</Text>
          </View>
        ))}
        <Text style={s.note}>LTP, OI, Volume and IV will appear after API integration.</Text>
      </Card>

      <Heading>OPTION DATA ANALYSER</Heading>
      <Card>
        <Row left="Selected Index" right={symbol}/>
        <Row left="Selected Strike" right={String(strike)}/>
        <Row left="Option Type" right={optionType}/>
        <Row left="Open Interest" right="--"/>
        <Row left="Change in OI" right="--"/>
        <Row left="Volume" right="--"/>
        <Row left="Implied Volatility" right="--"/>
        <Row left="PCR / Max Pain" right="--"/>
      </Card>

      <Heading>AI OPTION ANALYSIS</Heading>
      <Card>
        <Text style={s.big}>WAITING FOR DATA</Text>
        <Row left="CE / PE Strength" right="--"/>
        <Row left="Build-up Analysis" right="--"/>
        <Row left="Potential Target" right="--"/>
        <Row left="Stop Loss Estimate" right="--"/>
        <Row left="Risk Meter" right="--"/>
      </Card>
    </>
  );

  const Settings = () => (
    <>
      <Heading>APP SETTINGS</Heading>
      <Card>
        <Row left="Application" right="FYERS SMART AI"/>
        <Row left="Theme" right="Black + Green"/>
        <Row left="Market Data" right="Pending"/>
        <Row left="Backend" right="Render"/>
        <Row left="Trading Mode" right="READ ONLY"/>
      </Card>
      <Heading>SECURITY</Heading>
      <Card>
        <Text style={s.green}>ORDER EXECUTION DISABLED</Text>
        <Text style={s.note}>This application is designed for analysis only. It does not place, modify or cancel orders.</Text>
      </Card>
      <Heading>ABOUT</Heading>
      <Card>
        <Text style={s.white}>FYERS SMART AI</Text>
        <Text style={s.muted}>Version 1.0.0</Text>
        <Text style={s.note}>Live data and AI calculations are not connected yet.</Text>
      </Card>
    </>
  );

  const pages = {
    Home: <Home/>,
    Charts: <Charts/>,
    AI: <AIAnalysis/>,
    Options: <Options/>,
    Settings: <Settings/>
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light"/>
      <Header/>
      <ScrollView style={s.scroll}
        contentContainerStyle={{paddingBottom:25}}>
        <View style={s.content}>
          {pages[tab]}
          <Text style={s.footer}>FYERS SMART AI • READ ONLY • NO ORDER EXECUTION</Text>
        </View>
      </ScrollView>

      <View style={s.bottom}>
        {tabs.map(x=>(
          <TouchableOpacity key={x}
            onPress={()=>setTab(x)}
            style={s.navItem}>
            <Text style={{
              color:tab===x ? C.green : C.muted,
              fontSize:11,
              fontWeight:'bold'
            }}>{x}</Text>
            <View style={{
              height:3,
              width:20,
              backgroundColor:tab===x ? C.green : 'transparent',
              marginTop:5,
              borderRadius:5
            }}/>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},
  scroll:{flex:1},
  content:{padding:16},
  header:{
    padding:17,
    paddingTop:12,
    backgroundColor:C.card,
    borderBottomWidth:1,
    borderColor:C.border,
    flexDirection:'row',
    justifyContent:'space-between',
    alignItems:'center'
  },
  brand:{fontSize:22,fontWeight:'900',color:C.white},
  sub:{fontSize:9,color:C.muted,marginTop:4,letterSpacing:1},
  green:{color:C.green,fontWeight:'bold'},
  greenText:{color:C.green,fontSize:10,fontWeight:'bold'},
  red:{color:C.red,fontWeight:'bold'},
  yellow:{color:C.yellow,fontWeight:'bold'},
  white:{color:C.white,fontWeight:'bold'},
  muted:{color:C.muted,fontSize:11},
  heading:{
    color:C.white,
    fontSize:14,
    fontWeight:'bold',
    marginTop:22,
    marginBottom:12,
    letterSpacing:0.6
  },
  card:{
    backgroundColor:C.card,
    borderRadius:15,
    borderWidth:1,
    borderColor:C.border,
    padding:16,
    marginBottom:12
  },
  row:{flexDirection:'row',gap:8},
  rowBetween:{
    flexDirection:'row',
    justifyContent:'space-between',
    alignItems:'center',
    marginVertical:8
  },
  half:{flex:1,alignItems:'center',padding:8},
  marketCard:{
    flex:1,
    backgroundColor:C.card,
    borderRadius:12,
    padding:10,
    borderWidth:1,
    borderColor:C.border
  },
  price:{fontSize:20,color:C.white,fontWeight:'bold',marginVertical:8},
  big:{fontSize:23,color:C.white,fontWeight:'900',marginVertical:8},
  label:{color:C.muted,fontSize:12},
  value:{color:C.white,fontSize:12,fontWeight:'bold'},
  note:{color:C.muted,fontSize:11,lineHeight:18,marginTop:10},
  line:{height:1,backgroundColor:C.border,marginVertical:12},
  wrap:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:12},
  chip:{
    backgroundColor:C.card,
    borderRadius:9,
    paddingVertical:10,
    paddingHorizontal:13,
    borderWidth:1,
    borderColor:C.border
  },
  activeChip:{backgroundColor:C.green,borderColor:C.green},
  chart:{
    height:210,
    backgroundColor:'#0A111B',
    borderRadius:10,
    marginTop:14,
    justifyContent:'center',
    alignItems:'center',
    borderWidth:1,
    borderColor:C.border
  },
  strikeButton:{
    backgroundColor:'#1D2A38',
    padding:14,
    borderRadius:10,
    minWidth:45,
    alignItems:'center'
  },
  chainRow:{
    flexDirection:'row',
    justifyContent:'space-between',
    paddingVertical:13,
    borderBottomWidth:1,
    borderColor:C.border
  },
  footer:{
    textAlign:'center',
    color:C.green,
    fontSize:9,
    marginTop:22,
    marginBottom:10
  },
  bottom:{
    flexDirection:'row',
    backgroundColor:C.card,
    borderTopWidth:1,
    borderColor:C.border,
    justifyContent:'space-around',
    paddingTop:13,
    paddingBottom:10
  },
  navItem:{alignItems:'center',flex:1}
});

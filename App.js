
import React, {useState, useEffect} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  StyleSheet
} from 'react-native';

const GOLD = '#D6AD55';
const BG = '#090A0D';
const CARD = '#17181D';

export default function App() {
  const [page, setPage] = useState('HOME');
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date());
    }, 1000);

    return () => clearInterval(id);
  }, []);

  const menu = ['HOME', 'CHART', 'AI', 'OPTIONS', 'SETTINGS'];

  const Card = ({title, children}) => (
    <View style={styles.card}>
      <Text style={styles.goldTitle}>{title}</Text>
      {children}
    </View>
  );

  const Data = ({label}) => (
    <View style={styles.data}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.value}>--</Text>
    </View>
  );

  const Home = () => (
    <>
      <Card title="MARKET WATCH">
        <Data label="NIFTY 50" />
        <Data label="BANK NIFTY" />
        <Data label="SENSEX" />
        <Text style={styles.pending}>Waiting for FYERS connection</Text>
      </Card>

      <Card title="MARKET SENTIMENT">
        <Data label="Market Trend" />
        <Data label="Bullish / Bearish" />
        <Data label="Confidence" />
      </Card>

      <Card title="LIVE CHART">
        <Text style={styles.chart}>CHART DATA PENDING</Text>
        <Text style={styles.muted}>1m | 3m | 5m | 15m | 30m | 1h | 1D</Text>
      </Card>

      <Card title="AI PREDICTION">
        <Data label="Next Candle" />
        <Data label="Green Probability" />
        <Data label="Red Probability" />
        <Data label="Confidence" />
      </Card>

      <Card title="SUPPORT & RESISTANCE">
        <Data label="Resistance 1" />
        <Data label="Resistance 2" />
        <Data label="Support 1" />
        <Data label="Support 2" />
      </Card>

      <Card title="TECHNICAL INDICATORS">
        <Data label="RSI" />
        <Data label="MACD" />
        <Data label="VWAP" />
        <Data label="EMA 20 / 50" />
        <Data label="Supertrend" />
      </Card>
    </>
  );

  const OtherPage = ({name}) => (
    <Card title={name}>
      {name === 'OPTIONS' ? (
        <>
          <Data label="CE LTP" />
          <Data label="PE LTP" />
          <Data label="PCR" />
          <Data label="MAX PAIN" />
          <Data label="OPEN INTEREST" />
          <Data label="IV / GREEKS" />
        </>
      ) : name === 'AI' ? (
        <>
          <Data label="Market Direction" />
          <Data label="Price Action" />
          <Data label="Next 5 Minute Prediction" />
          <Data label="AI Confidence" />
          <Data label="Risk Meter" />
        </>
      ) : name === 'CHART' ? (
        <>
          <Text style={styles.chart}>LIVE CHART PENDING</Text>
          <Data label="Selected Timeframe" />
          <Data label="Indicators" />
        </>
      ) : (
        <>
          <Data label="Broker: FYERS" />
          <Data label="Backend Status: Pending" />
          <Data label="Live Data: Not Connected" />
          <Data label="Mode: READ ONLY" />
          <Data label="Order Execution: Disabled" />
        </>
      )}
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor={BG} barStyle="light-content" />

      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>FYERS <Text style={styles.gold}>SMART AI</Text></Text>
          <Text style={styles.muted}>LUXURY TRADING ANALYTICS</Text>
        </View>
        <View>
          <Text style={styles.gold}>{clock.toLocaleTimeString()}</Text>
          <Text style={styles.muted}>{clock.toLocaleDateString()}</Text>
        </View>
      </View>

      <ScrollView style={styles.body}>
        <Text style={styles.heading}>{page} DASHBOARD</Text>

        {page === 'HOME' ? <Home /> : <OtherPage name={page} />}

        <Text style={styles.footer}>
          READ ONLY • NO ORDER EXECUTION
        </Text>
      </ScrollView>

      <View style={styles.navigation}>
        {menu.map(item => (
          <TouchableOpacity
            key={item}
            style={styles.navButton}
            onPress={() => setPage(item)}
          >
            <Text style={{
              color: page === item ? GOLD : '#999999',
              fontSize: 9,
              fontWeight: 'bold'
            }}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG
  },
  header: {
    padding: 16,
    backgroundColor: CARD,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  logo: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#FFFFFF'
  },
  gold: {
    color: GOLD,
    fontWeight: 'bold'
  },
  goldTitle: {
    color: GOLD,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 14
  },
  muted: {
    color: '#999999',
    fontSize: 11,
    marginTop: 4
  },
  body: {
    flex: 1,
    padding: 14
  },
  heading: {
    color: GOLD,
    fontSize: 16,
    fontWeight: 'bold',
    marginVertical: 12
  },
  card: {
    backgroundColor: CARD,
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3020'
  },
  data: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#292A30'
  },
  value: {
    color: '#FFFFFF',
    fontWeight: 'bold'
  },
  pending: {
    color: '#999999',
    fontSize: 10,
    marginTop: 10
  },
  chart: {
    height: 150,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: GOLD,
    backgroundColor: BG,
    marginBottom: 10
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    backgroundColor: CARD,
    borderTopWidth: 1,
    borderTopColor: '#3A3020'
  },
  navButton: {
    paddingHorizontal: 3,
    paddingVertical: 5
  },
  footer: {
    color: '#20C989',
    textAlign: 'center',
    fontSize: 10,
    padding: 15
  }
});

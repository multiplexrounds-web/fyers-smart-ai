import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView>
        <Text style={styles.title}>FYERS SMART AI</Text>
        <Text style={styles.subtitle}>LIVE MARKET ANALYSIS</Text>

        <View style={styles.card}>
          <Text style={styles.heading}>MARKET SENTIMENT</Text>
          <Text style={styles.value}>ANALYZING...</Text>
          <Text style={styles.note}>Live data connection pending</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>NEXT 5 MIN CANDLE</Text>
          <Text style={styles.value}>WAITING</Text>
          <Text style={styles.note}>AI prediction pending</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>DAILY SUPPORT & RESISTANCE</Text>
          <Text style={styles.note}>Calculation pending</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>AI RISK METER</Text>
          <Text style={styles.value}>WAITING</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>TECHNICAL INDICATORS</Text>
          <Text style={styles.note}>RSI | MACD | VWAP | EMA | SUPERTREND</Text>
        </View>

        <Text style={styles.footer}>READ ONLY • NO ORDER EXECUTION</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080D18', padding: 18, paddingTop: 55 },
  title: { color: '#FFFFFF', fontSize: 27, fontWeight: 'bold' },
  subtitle: { color: '#8B9BB4', marginTop: 5, marginBottom: 22 },
  card: { backgroundColor: '#151F30', padding: 18, borderRadius: 14, marginBottom: 14 },
  heading: { color: '#A8B7CC', fontSize: 13, fontWeight: 'bold' },
  value: { color: '#FFFFFF', fontSize: 23, fontWeight: 'bold', marginTop: 12 },
  note: { color: '#8292AA', marginTop: 9 },
  footer: { color: '#36D399', textAlign: 'center', marginVertical: 20, fontWeight: 'bold' }
});

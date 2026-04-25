import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

interface PriceChartProps {
  data: { date: string; price: number }[];
}

const PriceChart: React.FC<PriceChartProps> = ({ data }) => {
  const prices = data.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const step = (width - 80) / Math.max(data.length - 1, 1);

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.bars}>
        {data.map((d, i) => {
          const height = ((d.price - min) / range) * 80 + 4;
          const isUp = i === 0 ? true : d.price >= data[i - 1].price;
          return (
            <View key={i} style={[chartStyles.barWrap, { width: step }]}>
              <View
                style={[
                  chartStyles.bar,
                  {
                    height,
                    backgroundColor: isUp ? '#00C864' : '#FF3C3C',
                    opacity: 0.5 + (i / data.length) * 0.5,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={chartStyles.labels}>
        <Text style={chartStyles.label}>{data[0]?.date.slice(5)}</Text>
        <Text style={chartStyles.label}>{data[data.length - 1]?.date.slice(5)}</Text>
      </View>
    </View>
  );
};

const chartStyles = StyleSheet.create({
  container: { paddingVertical: 8 },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    paddingHorizontal: 4,
  },
  barWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  bar: {
    width: 6,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    minHeight: 4,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 6,
  },
  label: {
    color: '#6666AA',
    fontSize: 10,
  },
});

export default PriceChart;
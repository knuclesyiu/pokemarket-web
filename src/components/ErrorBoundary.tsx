import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'Something went wrong.' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.warn('[ErrorBoundary] Caught:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Oops! Something went wrong</Text>
          <Text style={styles.message}>{this.state.errorMessage}</Text>
          <Text style={styles.hint}>Please try restarting the app. If the problem persists, contact support.</Text>
          <TouchableOpacity style={styles.resetBtn} onPress={this.handleReset}>
            <Text style={styles.resetBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080810',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: {
    color: '#F0F0FF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    color: '#FF4060',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    backgroundColor: 'rgba(255,60,60,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  hint: {
    color: '#8888CC',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  resetBtn: {
    backgroundColor: '#FF4060',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  resetBtnText: {
    color: '#F0F0FF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ErrorBoundary;
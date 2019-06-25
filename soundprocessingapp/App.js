/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow
 */

import React, { Component } from 'react';
import { AppRegistry, StyleSheet, Text, View } from 'react-native';
import { createAppContainer } from 'react-navigation';
import NavigationService from './src/navigation/NavigationService';
import AppNavigator from './src/navigation/AppNavigator';
import { colors, layout, typography } from './src/assets/styles';
const AppContainer = createAppContainer(AppNavigator);

class App extends Component {
  render() {
    return (
      <View style={styles.container}>
        <AppContainer ref={navigatorRef => {
          NavigationService.setTopLevelNavigator(navigatorRef)
        }} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.BG_COLOR,
  }
});

export default App
import React from 'react';
import {
  createSwitchNavigator,
  createStackNavigator
} from 'react-navigation';

import LoginScreen from '../screen/LoginScreen';
import IntroScreen from '../screen/IntroScreen';
import InitcalScreen from '../screen/InitcalScreen';
import Init2calScreen from '../screen/Init2calScreen';
import StartcalrecScreen from '../screen/StartcalrecScreen';
import FinishcalScreen from '../screen/FinishcalScreen';
import InitrealtimeScreen from '../screen/InitrealtimeScreen';
import Init2realtimeScreen from '../screen/Init2realtimeScreen';
import StartrealtimeScreen from '../screen/StartrealtimeScreen';
import FinishrealtimeScreen from '../screen/FinishrealtimeScreen';

export default createSwitchNavigator(
  {
    Login: LoginScreen,
    Intro: IntroScreen,
    Initcal: InitcalScreen,
    Init2cal: Init2calScreen,
    Startcalrec: StartcalrecScreen,
    Finishcal: FinishcalScreen,
    Initrealtime: InitrealtimeScreen,
    Init2realtime: Init2realtimeScreen,
    Startrealtime: StartrealtimeScreen,
    Finishrealtime: FinishrealtimeScreen,
  }, {
    initialRouteName: 'Login'
  }
);



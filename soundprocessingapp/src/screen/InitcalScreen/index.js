import React, { Component } from 'react'
import { Text, View, StyleSheet, Image, TouchableHighlight, TouchableWithoutFeedback, Keyboard } from 'react-native'
import { colors, layout, typography } from '../../assets/styles';
import { Button, Input } from '../../component';
import NavigationService from '../../navigation/NavigationService';
import Voice from 'react-native-voice';
import Config from '../../config';

const FFT_LEN = 64;
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 50;
const FRAME_RATE = 50;
const SPEECH_TIME_FRAME = 50; //How frequent to update the speech_hist. This is limited to the HIST_DEPTH.

const BUCKETS_LOW = 8; //Total number of frequency slices from the low end.
const HIST_DEPTH = 200; //The logging depth of FFT results to keep. Also for the averaging filter.
const FLOOR_DEPTH = HIST_DEPTH / 4;
const SPEECH_HIST_DEPTH = 10; //Total number of speech blocks in history.
const SMOOTHING_SIDE = 4; //The number of samples on each side of the current node to smooth with.
const SMOOTHING_DEPTH = (SMOOTHING_SIDE * 2) + 1; //Used to make sure we have enough samples to smooth.
const MAX_PAUSE = 50; //Number of frames to truncate a pause at.
const DY_START = SMOOTHING_SIDE * BUCKETS_LOW * 55; //Minimum amount of rise in the smoothing time to call the start of a new speech block.
const DY_END = SMOOTHING_SIDE * BUCKETS_LOW * -70; //Minimum amount of drop in the smoothing time to call the beginning of the end of a speech block.
const DY_FLAT = 2048;
// const rt_speed_slider = document.getElementById('rt_speed_input');
// const tgt_spm = document.getElementById('spm');
// const tgt_avg_word = document.getElementById('avg_word');
// const tgt_speech_ratio = document.getElementById('speech_ratio');

let curr_mode = 'intro'; //Start in the intro.
let curr_interval; //Used for interval timers.
let cal_store = {};
let cal_settings = {};
let rt_settings = {};
let rt_store = {};
let rt_results = {};
let hist_filtered = []; //This is storing the filtered sample results from the audio input.
let hist_filtered_sorted = []; //Used for building a sorted set for filtering. May be able to move this.
let hist_spectrum_sum_max = 0; //Keeping a max value for filtering and presentation.
let speech_hist = []; //Log of speaking starts and stops. This is a summary of the filtered results.
let speech_stats = {};
let syllables_per_word = 1; //The average number of syllables per word. This could be calibrated later per user.
let curr_floor = 0; //This is used in the FFT fetching. Moving it here to see if it reduces time.
let temp_hfs_len = 0; //Used for sorting.
let audio1, audio2;
let dy = {};
dy.min = 6000;
dy.max = 0;

let time_frame = 0; //Used as a clock for relative measurements.
//We will need to handle size issues if we allow for long continuous sampling,
//but at 100fps and 32-bit integers, we are ok for several hours.
//Ultimately, we will want to switch to a different timer, not use
//p5 loop or library.
let mic, fft, canvas; //This is for p5 functions. Will need to replace these in the long term.
let speech_hist_last = 0; //Used for keeping track of when to update the speech stats.
class InitcalScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      recognized: '',
      pitch: '',
      error: '',
      end: '',
      started: '',
      results: [],
      partialResults: [],
      hist_filtered: [],
    };
    Voice.onSpeechStart = this.onSpeechStart.bind(this);
    Voice.onSpeechRecognized = this.onSpeechRecognized.bind(this);
    Voice.onSpeechEnd = this.onSpeechEnd.bind(this);
    Voice.onSpeechError = this.onSpeechError.bind(this);
    Voice.onSpeechResults = this.onSpeechResults.bind(this);
    // Voice.onSpeechPartialResults = this.onSpeechPartialResults.bind(this);
    Voice.onSpeechVolumeChanged = this.onSpeechVolumeChanged.bind(this);
  }

  componentDidMount() {
    this.setState({ hist_filtered: [] })
    this._startRecognizing()
  }

  componentWillUnmount() {
    Voice.destroy().then(Voice.removeAllListeners);
  }

  onSpeechStart = e => {
    // eslint-disable-next-line
    console.warn('Start')
  };

  onSpeechRecognized = e => {
    // eslint-disable-next-line
    console.warn('Recording')
  };

  onSpeechEnd = e => {
    // eslint-disable-next-line
    console.warn('End')
  };

  onSpeechError = e => {
    // eslint-disable-next-line
    console.warn('onSpeechError: ', e);
  };

  onSpeechResults = e => {
    // eslint-disable-next-line
    console.log('onSpeechResults: ', e);
    this.setState({ results: e.value });
  };

  // onSpeechPartialResults = e => {
  //   // eslint-disable-next-line
  //   console.log('onSpeechPartialResults: ', e);
  //   this.setState({
  //     partialResults: e.value,
  //   });
  // };

  onSpeechVolumeChanged = e => {
    // eslint-disable-next-line
    console.log('onSpeechVolumeChanged: ', e);
    this.setState({ pitch: e.value });
  };

  _startRecognizing = async () => {
    this.setState({
      recognized: '',
      pitch: '',
      error: '',
      started: '',
      results: [],
      partialResults: [],
      end: '',
    });
    try {
      await Voice.start(Config.LOCALE);
    } catch (e) {
      //eslint-disable-next-line
      console.error(e);
    }
  };

  _destroyRecognizer = async () => {
    try {
      await Voice.destroy();
    } catch (e) {
      //eslint-disable-next-line
      console.error(e);
    }
    this.setState({
      recognized: '',
      pitch: '',
      error: '',
      started: '',
      results: [],
      partialResults: [],
      end: '',
    });
  };

  render() {
    return (
      <View style={styles.container}>
        {/* <Text style={styles.stat}>{`Started: ${this.state.started}`}</Text>
        <Text style={styles.stat}>{`Recognized: ${this.state.recognized}`}</Text>
        <Text style={styles.stat}>{`Pitch: ${this.state.pitch}`}</Text>
        <Text style={styles.stat}>{`Error: ${this.state.error}`}</Text>
        <Text style={styles.stat}>Results</Text>
        {this.state.results.map((result, index) => {
          return (
            <Text key={`result-${index}`} style={styles.stat}>
              {result}
            </Text>
          );
        })}
        <Text style={styles.stat}>Partial Results</Text>
        {this.state.partialResults.map((result, index) => {
          return (
            <Text key={`partial-result-${index}`} style={styles.stat}>
              {result}
            </Text>
          );
        })}
        <Text style={styles.stat}>{`End: ${this.state.end}`}</Text>
        <TouchableHighlight onPress={this._startRecognizing}>
          <Image style={styles.button} source={require('./button.png')} />
        </TouchableHighlight>
        <TouchableHighlight onPress={this._stopRecognizing}>
          <Text style={styles.action}>Stop Recognizing</Text>
        </TouchableHighlight>
        <TouchableHighlight onPress={this._cancelRecognizing}>
          <Text style={styles.action}>Cancel</Text>
        </TouchableHighlight>
        <TouchableHighlight onPress={this._destroyRecognizer}>
          <Text style={styles.action}>Destroy</Text>
        </TouchableHighlight> */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View>
            <View style={styles.block}>
              <Text style={{ fontSize: typography.MD_TEXT, color: colors.TEXT, textAlign: "left", fontFamily: typography.FONT_DEFALT, fontWeight: "bold" }}>{"\n"}Mic, check, 1, 2.{"\n"}{"\n"}(B.){"\n"}</Text>
              <Text style={{ fontSize: typography.MD_TEXT, color: colors.TEXT, textAlign: "left", fontFamily: typography.FONT_DEFALT }}>
                First, let's check to see your microphone is working.{"\n"}{"\n"}
                You should see a line of dots just above this.{"\n"}{"\n"}
                They are green when i don't hear much sound, and they turn blue when i hear speech.{"\n"}{"\n"}
                Try saying "Hello Bene!" so I can see that I can hear you well.{"\n"}{"\n"}
                Press Next when you see the dots changing color and moving.</Text>
              <Text style={styles.stat}>{`${this.state.pitch}`}</Text>
            </View>
            <View style={styles.displayInlineBlock}>
              <Button
                style={{ marginRight: 5 }}
                label={'Next'}
                buttonWidth={'30%'}
                background={colors.BUTTON_LOGIN}
                onPress={() => {
                  NavigationService.navigate('Init2cal')
                  // Voice.stop()
                }}
              />
              <Button
                label={'Help'}
                buttonWidth={'30%'}
                background={colors.BUTTON_HELP}
                onPress={() => NavigationService.navigate()}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.BG_COLOR
  },
  block: {
    flex: 1,
    width: layout.VW * 0.8,
    backgroundColor: colors.BG_COLOR
  },
  displayInlineBlock: {
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginBottom: 50,
  }
});

export default InitcalScreen

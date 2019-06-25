import React, { Component } from 'react'
import { Text, View, StyleSheet, TouchableWithoutFeedback, Keyboard } from 'react-native'
import { colors, layout, typography } from '../../assets/styles';
import { Button, Input } from '../../component';
import NavigationService from '../../navigation/NavigationService';

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
class Init2realtimeScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      current_speed: 0,
      bien_moi: 0
    }
  }
  // bắt giá trị của biến slider_value truyền từ page6 vào
  componentDidMount() {
    const { navigation } = this.props;
    this.setState({
      current_speed: navigation.getParam('current_speed', 40),
      bien_moi: navigation.getParam('bien_moi', 0)
    });

  }
  // new
  updateInnerText = (tgt_id, tgt_val) => {
    // document.getElementById(tgt_id).innerText = tgt_val;
  }

  setRealtimeTargets = (cal_settings, rt_settings) => {
    //Use the calibration data to create an adjusted set of targets based on the set SPM.
    //This includes a max speech per unit time. (based on SPM and average speech per syllable, adjusted for speed)
    //Save the targets into the RT targets setting object.
    //Calculate the final target values for:
    //pause to speech
    //avg_speech_block
    let speed_adj = cal_settings.SPM / rt_settings.tgt_SPM;
    rt_settings.tgt_pause_to_speech = cal_settings.pause_to_speech;
    rt_settings.tgt_avg_speech_block = cal_settings.avg_speech_block * speed_adj;
    rt_settings.syl_per_avg_speech_block = cal_settings.syl_per_avg_speech_block / speed_adj;
  }

  render() {
    return (
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View>
            <View style={styles.block}>
              <Text style={{ fontSize: typography.MD_TEXT, color: colors.TEXT, textAlign: "left", fontFamily: typography.FONT_DEFALT }}>
                {"\n"}OK, you want to practice at:{"\n"}</Text>
              <Text style={{ fontSize: typography.MD_TEXT, color: colors.TEXT, textAlign: "left", fontFamily: typography.FONT_DEFALT, fontWeight: "bold" }}>
                {this.state.current_speed}{"\n"}Bien_moi:{this.state.bien_moi}
              </Text>
              <Text style={{ fontSize: typography.MD_TEXT, color: colors.TEXT, textAlign: "left", fontFamily: typography.FONT_DEFALT }}>
                {"\n"}SPM{"\n"}{"\n"}(B.){"\n"}{"\n"}Next, I will look for you talking at the speed you chose, with a similar amount of pausing between words and phrases as you trained me with.{"\n"}{"\n"}You will hear a breathing sound if you need to pause more, and you will hear a heartbeat if you need to slow down.</Text>
              <Text style={{ fontSize: typography.MD_TEXT, color: colors.TEXT, textAlign: "left", fontFamily: typography.FONT_DEFALT, fontWeight: "bold" }}>
                {"\n"}Press Start button to have me listen to you and give you feedback.</Text>
            </View>
            <View style={styles.displayInlineBlock}>
              <Button
                style={{ marginRight: 5 }}
                label={'Start'}
                buttonWidth={'30%'}
                background={colors.BUTTON_LOGIN}
                onPress={() => NavigationService.navigate('Startrealtime')}
              />

              <Button
                label={'Help'}
                buttonWidth={'30%'}
                background={colors.BUTTON_HELP}
                onPress={() => NavigationService.navigate("Startrealtime", {
                  current_speed: this.state.current_speed,
                  bien_moi: this.state.bien_moi
                })}
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

export default Init2realtimeScreen

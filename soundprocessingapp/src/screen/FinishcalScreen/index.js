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
class FinishcalScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {

    }
  }
// setCalibration function  chua kiem ra
setCalibration = (cal_store, cal_settings, speech_hist, speech_stats) => {
  //Store the number of speech blocks, total duration of speech blocks,
  //and total pause duration.
  let total_time = cal_store.end_time - cal_store.start_time;
  let total_speech_blocks = speech_hist.length;
  let total_frames = speech_hist[0].end_time_frame - speech_hist[total_speech_blocks - 1].start_time_frame;
  let frame_time = total_time / total_frames;
  //Take the summary results of the calibration time and the number of syllables read to calculate:
  // *SPM
  cal_settings.SPM = (cal_store.syllable_count * 60000 / total_time).toFixed(0); //# Syllables * 60000 ms/min / total_time ms
  cal_store.SPM = cal_settings.SPM;
  // *Average Pause to Speech Ratio
  cal_settings.pause_to_speech = speech_stats.PTS;
  cal_store.pause_to_speech = cal_settings.pause_to_speech;
  // *Average Speech Block Size
  cal_settings.avg_speech_block = speech_stats.avg_word;
  cal_store.avg_speech_block = cal_settings.avg_speech_block;
  // *Syllables per average speech block
  cal_settings.syl_per_avg_speech_block = (cal_store.syllable_count / speech_stats.total_talk) * speech_stats.avg_word;
  cal_store.syl_per_avg_speech_block = cal_settings.syl_per_avg_speech_block;
  // Save these into the Calibration results object (including the full FFT data) and send them to the server.
  // TODO: Send the cal_store to the server and wipe it.
}

 initCalSettings = (cal_settings) => {
    cal_settings.SPM = 0;
    cal_settings.pause_to_speech = 0;
    cal_settings.avg_speech_block = 0;
    cal_settings.avg_syl_per_frame = 0;
    cal_settings.syl_per_avg_speech_block = 0;
  }

  render() {
    return (
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View>
            <View style={styles.block}>
              <Text style={{ fontSize: typography.MD_TEXT, color: colors.TEXT, textAlign: "left", fontFamily: typography.FONT_DEFALT }}>
                {"\n"}Great! You spoke at:{"\n"}</Text>
              <Text style={{ fontSize: typography.MD_TEXT, color: colors.TEXT, textAlign: "left", fontFamily: typography.FONT_DEFALT }}>
                {"\n"}Syllables Per Minute{"\n"}{"\n"}Do you want to re-train, or save this to practice with?</Text>
            </View>
            <View style={styles.displayInlineBlock}>
              <Button
                style={{ marginRight: 5 }}
                label={'Save'}
                buttonWidth={'30%'}
                background={colors.BUTTON_LOGIN}
                onPress={() => NavigationService.navigate('Initrealtime')}
              />
              <Button
                style={{ marginRight: 5 }}
                label={'Redo'}
                buttonWidth={'30%'}
                background={colors.BUTTON_LOGIN}
                onPress={() => NavigationService.navigate('Startcalrec')}
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

export default FinishcalScreen

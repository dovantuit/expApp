//This handles getting audio in and running a canvas display all based on the p5
//libraries. We will want to separate out the p5 specific things and swap them
// for native versions in the mobile app.

//Common Canvas and FFT Settings
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
const rt_speed_slider = document.getElementById('rt_speed_input');
const tgt_spm = document.getElementById('spm');
const tgt_avg_word = document.getElementById('avg_word');
const tgt_speech_ratio = document.getElementById('speech_ratio');

let curr_mode = 'intro'; //Start in the intro.
let curr_interval; //Used for interval timers.
let cal_store = {};
let cal_settings = {};
let rt_settings ={};
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

function initSpeechStats() {
  //Init with starting values.
  speech_stats.SPM = 0;
  speech_stats.avg_word = 0;
  speech_stats.speech_ratio = 0;
  speech_stats.total_pause = 0;
  speech_stats.total_talk = 0;
  speech_stats.total_syllables = 0;
  speech_stats.total_time = 0;
}

function initCalSettings(cal_settings) {
  cal_settings.SPM = 0;
  cal_settings.pause_to_speech = 0;
  cal_settings.avg_speech_block = 0;
  cal_settings.avg_syl_per_frame = 0;
  cal_settings.syl_per_avg_speech_block = 0;
}

function newFFTSumFilter() {
  let sum_filter = {};
  sum_filter.sum = 0;
  //default to being in a pause
  sum_filter.filter = 0;
  sum_filter.longavg = 0;

  return sum_filter;
}

function newSpeechHist(start_time_frame, min_start) {
  let speech_curr_word = {};
  speech_curr_word.start_time = (new Date()).getTime();
  speech_curr_word.end_time = 0;
  speech_curr_word.speech_frames = 0;
  speech_curr_word.pause_frames = 0;
  speech_curr_word.syl_count = 0;
  speech_curr_word.max = 0;
  speech_curr_word.min_start = 0;
  speech_curr_word.min_end = 0;
  speech_curr_word.running_time = 0;

  return speech_curr_word;
}

function initCalStore() {
  //Init cal_store with starting values. This may need to go into the cal function.
  let store = {};
  store.start_time = 0;
  store.end_time = 0;
  store.syllable_count = 0;
  store.word_count = 0;
  store.cal_text = "";
  store.fft_hist = [];
  store.SPM = 0;
  store.pause_to_speech = 0;
  store.avg_speech_block = 0;

  return store;
}

function setup() {
  // This is a p5 required function.
  frameRate(FRAME_RATE);
  canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.parent('initcal_graph');
  noFill();
  noStroke();

  mic = new p5.AudioIn();
  mic.start();
  fft = new p5.FFT(0, FFT_LEN);
  fft.setInput(mic);
  noLoop();
}

function updateRate(rt_results) {
  //Update the interface with the current speaking rate and quality vs. the target.
  //Trigger audio feedback when exceeding either speech rate or not enough pausing ratio.
  // TODO:
  //1. Get the current target values from the interface. (Allows for tuning the settings in use.)
  //2. Compare the current rates with the target values. This will need some buffering so that it waits
  //for a little history before triggering the feedback, but should be pretty responsive.
  //3. Update the interface to show the current rate and any feedback of relative value.
  //4. Play feedback sound for a given condition (too fast, too little space).
  tgt_spm.innerText = rt_results.SPM + " SPM now vs. " + rt_settings.tgt_SPM + " Target SPM";
  tgt_avg_word.innerText = speech_stats.avg_word + " Average Speech Block Length vs. " + rt_settings.tgt_avg_speech_block + " Target";
  tgt_speech_ratio.innerText = (rt_results.breathing * 100) + "% Breathing Target";
}

function updateInnerText(tgt_id, tgt_val) {
  document.getElementById(tgt_id).innerText = tgt_val;
}

function draw() {
//This is a p5 required function used to do things on an approximate timer, like drawing a canvas.
//Outside reference to hist_filtered global.
  time_frame++;

  switch (curr_mode) {
    case "initcal":
      runMicCheck(hist_filtered);
      showSpeechDots(255);
      break;
    case "startcalrec":
      runCalibration(hist_filtered, cal_store);
      showSpeechDots(255);
      break;
    case "finishcal":
      break;
    case "initrealtime":
      break;
    case "startrealtime":
      rt_results = runRealtime(hist_filtered, rt_settings);
      updateRate(rt_results);
      showSpeechDots(255);
      break;
    case "finishrealtime":
      //stop the realtime function
      //show summary data, etc.
      break;
  }
}

function playAudio(audio_object) {
  if('audio1' == audio_object){
    audio1.play();
  } else if ('audio2' == audio_object) {
    audio2.play();
  }
}

function flipPage(show_id, canvas_id) {
  //Function to flip the display of two elements (show and hide "pages")
  if(canvas_id !== null && canvas_id !== '') {
    canvas.parent(canvas_id);
  }
  curr_mode = show_id;
  //The below are things that need to happen once per context switch.
  //looped functions, like reading the mic are in the draw function.
  switch (curr_mode) {
    case "initcal":
      hist_filtered = [];
      loop();
      break;
    case "init2cal":
      audio1 = createAudio("Camperdown_Naturalness_2_cleaned.mp3");
      break;
    case "startcalrec":
      cal_store = initCalStore();
      let temp_cal_text = document.getElementById("trainingtxt");
      cal_store.syllable_count = temp_cal_text.dataset.syllable_count;
      cal_store.word_count = temp_cal_text.dataset.word_count;
      cal_store.cal_text = temp_cal_text.innerText;
      cal_store.start_time = (new Date()).getTime();
      initSpeechStats();
      hist_filtered = [];
      speech_hist = []; //Reset the speech history.
      loop();
      break;
    case "finishcal":
      noLoop();
      cal_store.end_time = (new Date()).getTime();
      initCalSettings(cal_settings);
      setCalibration(cal_store, cal_settings, speech_hist, speech_stats);
      document.getElementById('calresults').innerText = cal_settings.SPM;
      break;
    case "initrealtime":
      audio1 = createAudio("Camperdown_Naturalness_2_cleaned.mp3");
      rt_speed_slider.onchange = function(){updateInnerText('target_rt_speed', rt_speed_slider.value);};
      getRealtimeTargets(cal_settings, rt_settings);
      rt_speed_slider.value = rt_settings.tgt_SPM;
      updateInnerText('target_rt_speed', rt_speed_slider.value);
      break;
    case "init2realtime":
      // audio1 = createAudio("hearbeat.mp3");
      // audio2 = createAudio("breathing.mp3");
      rt_settings.tgt_SPM = rt_speed_slider.value;
      updateInnerText('i2rt_set_rt_speed', rt_settings.tgt_SPM);
      setRealtimeTargets(cal_settings, rt_settings);
      break;
    case "startrealtime":
      initSpeechStats();
      hist_filtered = [];
      speech_hist = []; //Reset the speech history.
      loop();
      break;
    case "finishrealtime":
      noLoop();
      //stop the realtime function
      //show summary data, etc.

      rt_settings = {};
      break;
  }
}

function showSpeechDots(background_clr) {
  background(background_clr);
  //Don't start displaying or doing other things until there is some buffer.
  if(hist_filtered.length > SMOOTHING_DEPTH){

    const NODE_CYCLE = 4;
    const NODE_SPACING = 2;

    var width_nodes = (HIST_DEPTH - SMOOTHING_DEPTH);
    if(hist_filtered.length < HIST_DEPTH) {
      width_nodes = (hist_filtered.length - SMOOTHING_DEPTH);
    }
    var scale_len_horz = width / width_nodes;
    var dia = scale_len_horz * NODE_CYCLE;
    var display_base = height-(dia / 2);
    var display_top = dia / 2;
    var temp_node_cycle_count = NODE_CYCLE - 1;
    var temp_node_spacing_count = NODE_SPACING;

    beginShape();

    if ("startrealtime" == curr_mode) {
      let rect_size = {};
      rect_size.vcen = height/2;
      if(rt_results.breathing <= 2) {
        rect_size.width = rt_results.breathing * height;
      } else {
        rect_size.width = 2 * height;
      }
      rect_size.hcen = map(rt_results.SPM, 0, 220, 0, width) - (rect_size.width / 2);
      fill(255, 0, 0);
      rect(rect_size.hcen, 0, rect_size.width, height, 20);
    }

    //Draw the sum values.
    for (i = SMOOTHING_DEPTH; i < width_nodes; i++){
      if(NODE_SPACING == temp_node_spacing_count){
        if(NODE_CYCLE-1 == temp_node_cycle_count) {
          if(0==hist_filtered[i].filter) {
            fill(0, 255, 0);
          } else {
            fill(0, 0, 255);
          }
          circle((i*scale_len_horz), map(hist_filtered[i].longavg, 0, hist_spectrum_sum_max, display_base, display_top), dia);
          temp_node_cycle_count = 0;
        } else {
          temp_node_cycle_count++;
        }
        temp_node_spacing_count = 0;
      } else {
        temp_node_spacing_count++;
      }
      //Put a marker line at the start and stop of speech blocks.
      if(i > 0 && (0 == hist_filtered[i].filter && 1 == hist_filtered[i-1].filter) ||  (1 == hist_filtered[i].filter && 0 == hist_filtered[i-1].filter)){
        stroke(51);
        line((i*scale_len_horz), 0, (i*scale_len_horz), display_top);
        noStroke();
      }
    }
    endShape();
  }
}

// export {
//   initSpeechStats,
//   initCalSettings,
//   newFFTSumFilter,
//   newSpeechHist,
//   initCalStore,
//   setup,
//   updateRate,
//   updateInnerText,
//   draw,
//   playAudio,
//   flipPage,
//   showSpeechDots
// }
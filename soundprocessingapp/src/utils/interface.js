const SAMPLE_INTERVAL = 20; //Number of ms per each FFT and analysis.
const BUCKETS_LOW = 8; //Total number of frequency slices from the low end.
const HIST_DEPTH = 200; //The logging depth of FFT results to keep. Also for the averaging filter.
const FLOOR_DEPTH = HIST_DEPTH / 4;
const SPEECH_HIST_DEPTH = 100; //Total number of speech blocks in history.
const SMOOTHING_SIDE = 5; //The number of samples on each side of the current node to smooth with.
const SMOOTHING_DEPTH = (SMOOTHING_SIDE * 2) + 1; //Used to make sure we have enough samples to smooth.

let curr_mode = 'intro'; //Start in the intro.
let curr_interval; //Used for interval timers.
let cal_store = {};
let cal_settings = {};
let rt_settings ={};
let rt_store = {};
let rt_results = {};
let hist_filtered = []; //This is storing the filtered sample results from the audio input.

// TODO: It looks like we may need to combine the display.js functions with this and use
// it instead of the interval timer here. Right now the intervals activate once only and
// do not repeat for some reason. 

function initCalStore() {
  //Init cal_store with starting values. This may need to go into the cal function.
  var store = {};
  store.start_time = 0;
  store.end_time = 0;
  store.syllable_count = 0;
  store.word_count = 0;
  store.fft_hist = [];

  return store;
}

function flipPage(hide_id, show_id, canvas_id) {
  //Function to flip the display of two elements (show and hide "pages")
  document.getElementById(show_id).classList.toggle("collapse");
  document.getElementById(hide_id).classList.toggle("collapse");
  if(canvas_id !== null && canvas_id !== '') {
    canvas.parent(canvas_id);
  }
  curr_mode = show_id;

  //The functions on the interval timers are for things that need to be sampled repeatedly.
  //This separates the display updating from the sampling, allowing for using something other than the p5
  //libraries later on.
  switch (curr_mode) {
    case "initcal":
      curr_interval = setInterval(runMicCheck(), SAMPLE_INTERVAL);
      break;
    case "startcalrec":
      clearInterval(curr_interval);
      cal_store = initCalStore();
      cal_store.start_time = (new Date()).getTime();
      curr_interval = setInterval(runCalibration(cal_store, hist_filtered), SAMPLE_INTERVAL);
      break;
    case "finishcal":
      clearInterval(curr_interval);
      cal_store.finish_time = (new Date()).getTime();
      setCalibration(cal_store, cal_settings);
      break;
    case "initrealtime":
      setRealtimeTargets(cal_settings, rt_settings);
      break;
    case "startrealtime":
      curr_interval = setInterval(runRealtime(rt_settings), SAMPLE_INTERVAL);
      break;
    case "finishrealtime":
      clearInterval(curr_interval);
      //stop the realtime function
      //show summary data, etc.
      break;
  }
}

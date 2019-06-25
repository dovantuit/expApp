const BUCKETS_LOW = 8; //Total number of frequency slices from the low end.
const HIST_DEPTH = 200; //The logging depth of FFT results to keep. Also for the averaging filter.
const FLOOR_DEPTH = HIST_DEPTH / 4;
const SPEECH_HIST_DEPTH = 100; //Total number of speech blocks in history.
const SMOOTHING_SIDE = 5; //The number of samples on each side of the current node to smooth with.
const SMOOTHING_DEPTH = (SMOOTHING_SIDE * 2) + 1; //Used to make sure we have enough samples to smooth.

let hist_filtered = []; //This is storing the filtered sample results from the audio input.
let hist_filtered_sorted = []; //Used for building a sorted set for filtering.
let speech_hist = []; //Log of speaking starts and stops. This is a summary of the filtered results.
let hist_spectrum_sum_max = 0; //Keeping a max value for filtering and presentation.
let speech_stats = {};
let speech_total = {};
let cal_store = {};
let syllables_per_word = 1; //The average number of syllables per word. This could be calibrated later per user.
let curr_floor = 0; //This is used in the FFT fetching. Moving it here to see if it reduces time.
let temp_hfs_len = 0; //Used for sorting.

//Init with starting values.
speech_stats.spm = 0;
speech_stats.avg_word = 0;
speech_stats.speech_ratio = 0;
speech_total.pause = 0;
speech_total.talk = 0;
speech_total.syllables = 0;

//Init cal_store with starting values. This may need to go into the cal function.
cal_store.start_time = (new Date()).getTime()
cal_store.end_time = 0;
cal_store.syllable_count = 0;
cal_store.word_count = 0;
cal_store.fft_hist = [];

function newSpeechHist(start_time_frame) {
  var speech_curr_word = {};
  speech_curr_word.start_time_frame = start_time_frame;
  speech_curr_word.end_time_frame = 0;
  speech_curr_word.word_frames = 0;
  speech_curr_word.last_pause = 0;
  speech_curr_word.syl_count = 0;

  return speech_curr_word;
}

function getCleanFFT(){
  //Get the current FFT array.
  let spectrum = fft.analyze();
  var temp_sum_filter = {};
  temp_sum_filter.sum = 0;
  temp_sum_filter.filter = 0;
  temp_sum_filter.longavg = 0;
  curr_floor = 0;
  temp_hfs_len = 0;
  if ('startcalrec' == curr_mode) {
    cal_store.fft_hist.push(spectrum);
  }

//Add up the lower frequencies in the voice range to consolidate and filter.
  for (var i = 0; i < BUCKETS_LOW; i++) {
    temp_sum_filter.sum += spectrum[i];
  }
  //Increasing the differences by squaring the results of the sums.
  temp_sum_filter.sum = temp_sum_filter.sum * temp_sum_filter.sum * temp_sum_filter.sum;
  hist_filtered.unshift(temp_sum_filter);
  //Smoothing by adding the past X (SMOOTHING_DEPTH) together.
  if(hist_filtered.length > SMOOTHING_DEPTH){
    for (var i = 0; i < SMOOTHING_DEPTH; i++) {
      hist_filtered[SMOOTHING_SIDE].longavg += hist_filtered[i].sum;
    }
    //Keep the history short.
    if(hist_filtered.length > HIST_DEPTH) {
      var temp_pop = hist_filtered.pop();
      //Remove the popped value from the sorted array.
      hist_filtered_sorted.splice(hist_filtered_sorted.indexOf(temp_pop.longavg), 1);
    }
    temp_hfs_len = hist_filtered_sorted.length;
    //Put this into a sorted array of filtered values.
    for (var i = 0; i < temp_hfs_len; i++) {
      if (hist_filtered_sorted[i] > hist_filtered[SMOOTHING_SIDE].longavg) {
        hist_filtered_sorted.splice(i, 0, hist_filtered[SMOOTHING_SIDE].longavg);
        i = temp_hfs_len;
      }
    }
    if (hist_filtered_sorted.length == temp_hfs_len) {
      hist_filtered_sorted.push(hist_filtered[SMOOTHING_SIDE].longavg);
    }

    //Set a ceiling for comparison. Currently this is just used for plotting.
    if (hist_spectrum_sum_max < hist_filtered[SMOOTHING_SIDE].longavg) {
      hist_spectrum_sum_max = hist_filtered[SMOOTHING_SIDE].longavg;
    }
    //Pick the max of the lower quartile or some other point. Then use that as
    // a band for the cutoff floor setting.
    if(temp_hfs_len > FLOOR_DEPTH) {
      curr_floor = hist_spectrum_sum_max - ((hist_spectrum_sum_max - hist_filtered_sorted[FLOOR_DEPTH]) * 4 / 5);
    } else {
      curr_floor = hist_spectrum_sum_max - ((hist_spectrum_sum_max - hist_filtered_sorted[temp_hfs_len]) * 4 / 5);
    }

  //Filtering - This can be made to be more nuanced.
  // TODO: 1. Use the rate of change over time (dy > target for multiple measurements)
  // to determine if it is a word or noise above the floor. It looks like speech tends
  // to have a long but steep ramp up and down, currently around 5-10 measurements.
    if(hist_filtered[SMOOTHING_SIDE].longavg > curr_floor) {
      hist_filtered[SMOOTHING_SIDE].filter = 1;
    } else {
      hist_filtered[SMOOTHING_SIDE].filter = 0;
    }
  }
}

function getWords() {
  //Look at the sampled data to sort out speech blocks and pauses.
  // TODO:
  //1. Revise this to use it for the calibration and the running sampling.

  //Parsing out words and storing them into a log.
  if(hist_filtered.length > SMOOTHING_DEPTH) {
    //Starting with at least a buffer to be able to look at history and allow filtering to be done.
    if(1 == hist_filtered[SMOOTHING_SIDE].filter && (0 == speech_hist.length || 0 < speech_hist[0].end_time_frame)){
      //Found the start of a new word, add a new history word.
      speech_hist.unshift(newSpeechHist(time_frame));
    } else if (0 < speech_hist.length && 0 == speech_hist[0].end_time_frame && 0 == hist_filtered[SMOOTHING_SIDE].filter) {
      speech_hist[0].end_time_frame = time_frame;
      speech_hist[0].word_frames = speech_hist[0].end_time_frame - speech_hist[0].start_time_frame;
      if(1 < speech_hist.length){
        var temp_last_pause = speech_hist[0].start_time_frame - speech_hist[1].end_time_frame
        if(temp_last_pause < 100) {
          //If the pause length is shorter than x then assume it is a pause in talking and not a total pause.
          //It would make sense to count even longer pauses as a breath point, but we will need to see how to do that.
          speech_hist[1].last_pause = temp_last_pause;
        } else {
          //This is just a quick hack to count in longer pauses as at least something.
          speech_hist[1].last_pause = 100;
        }
        speech_total.pause = speech_total.pause + speech_hist[1].last_pause;
     }
     getSpeakingStats();
    }
  }
}

function getCalibration() {
  //Have user read a block of text of known words and syllables.
  //Calculate AVG Syllables per Block, AVG Words per Block, AVG Syllables per Time,
  //and AVG Speech per Pause
// TODO: 1. Create the workflow for how calibration will be activated.
//  a) In interface, show Train button.
//  b) Start a calibration session.
//  c) Finish a calibration session.
//  d) Store calibration settings for use in real time feedback.
//2. Sort out how to revise the functions or create new ones for gettting the results.
}

function getSpeakingStats () {
  // TODO: 1. Need to revise this for feedback use and calibration use.
  var speech_hist_end = speech_hist[speech_hist.length - 1];
  speech_total.talk += speech_hist[0].word_frames;

  //Create a running average word size.
  speech_stats.avg_word = (speech_total.talk / speech_hist.length).toFixed(0);

  //How many syllables are in the current word, and what is the total for the queue.
  //From calibration, use the syllables_per_word.
  speech_hist[0].syl_count = syllables_per_word * speech_hist[0].word_frames / speech_stats.avg_word;
  speech_total.syllables += speech_hist[0].syl_count;
  speech_stats.spm = ((speech_total.syllables * FRAME_RATE * 60) / (speech_total.talk + speech_total.pause)).toFixed(0);

  //What is the ratio of speaking frames to pauses within speech?
  speech_stats.speech_ratio = ((speech_stats.avg_word * speech_hist.length) / (speech_stats.avg_word * speech_hist.length + speech_total.pause)).toFixed(2);

  //Limit the the length of the speech_hist and remove related info from the totals.
  if(speech_hist.length > SPEECH_HIST_DEPTH) {
    speech_total.pause -= speech_hist_end.last_pause;
    speech_total.talk -= speech_hist_end.word_frames;
    speech_total.syllables -= speech_hist_end.syl_count;
    speech_hist.pop();
  }
}

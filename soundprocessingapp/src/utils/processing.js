//Speech audio processing functions and functions to handle calibration and real time usage.

function getSumFFT(curr_fft, BUCKETS_LOW, display_store) {
  //Add up the lower frequencies in the voice range to consolidate and filter.
  //Init a new
  let temp_sum_filter = newFFTSumFilter();
  for (var i = 0; i < BUCKETS_LOW; i++) {
    temp_sum_filter.sum += curr_fft[i];
  }
  display_store.unshift(temp_sum_filter);
}

function checkStartSpeechBlock(dy, display_store, speech_hist) {
  if(dy >= DY_START) {
    //Oh look, a new speech block!
    //Create a new speech_curr_word in speech_hist
    //Found the start of a new word, add a new history word.
    // TODO: This still seems to not filter out the start of smaller bumps.
    speech_hist.unshift(newSpeechHist(time_frame));
    speech_hist[0].min_start = display_store[SMOOTHING_SIDE].longavg;
  }
}


function getSpeechStartStop(display_store){
  let temp_val = {};
  temp_val.dy = 0;

  //Keep the history short.
  if(display_store.length > HIST_DEPTH) {
    let temp_pop = display_store.pop();
  }
  // Smooth out the input to a given depth.
  for (var i = 0; i < SMOOTHING_DEPTH; i++) {
    display_store[0].longavg += display_store[i].sum;
  }

  temp_val.max_i = SMOOTHING_SIDE;
  temp_val.max = display_store[SMOOTHING_SIDE].longavg;
  temp_val.min_i = SMOOTHING_SIDE;
  temp_val.min = display_store[SMOOTHING_SIDE].longavg;

  for (var i = 0; i < SMOOTHING_SIDE; i++) {
    temp_val.dy += display_store[i].longavg - display_store[i + 1].longavg;
    if (display_store[i].longavg > temp_val.max) {
      temp_val.max_i = i;
      temp_val.max = display_store[i].longavg;
    } else if (display_store[i].longavg < temp_val.min) {
      temp_val.min_i = i;
      temp_val.min = display_store[i].longavg;
    }
  }
  if (hist_spectrum_sum_max < temp_val.max) {
    hist_spectrum_sum_max = temp_val.max;
  }
  if (dy.min > temp_val.dy) {
    dy.min = temp_val.dy;
  } else if (dy.max < temp_val.dy) {
    dy.max = temp_val.dy;
  }
  //  Look for the start of a word based on a positive change over a longer sample.
  //If the dY is big enough and we are in a pause, assume we are starting a new word.
  if (0 == speech_hist.length){
    //If there is no speech_hist, start with looking for the first speech block.
    checkStartSpeechBlock(temp_val.dy, display_store, speech_hist);
  } else if (0 < speech_hist[0].end_time) {
    //We are in a pause.
    //Increment the length of the pause in frames.
    speech_hist[0].pause_frames++;
    //See if it is a start of a speech block.
    checkStartSpeechBlock(temp_val.dy, display_store, speech_hist);
  } else {
    //We are in a speech block and need to get more details.
    //Increment a speech block length counter of number of frames for quick math.
    speech_hist[0].speech_frames++;
    //Tagging the current part as a speech block for display.
    display_store[SMOOTHING_SIDE].filter = 1;
    //Look for the top of the word and get the highest point of it.
    //there is a start of a new word, but there isn't a peak yet
    //Store that high point in a running history for reference.
    if (speech_hist[0].max < temp_val.max) {
      speech_hist[0].max = temp_val.max;
    }
    //Look for the end of the word coming up with negative dy or if we are back at the starting point.
    if (temp_val.dy <= DY_END || temp_val.min < speech_hist[0].min_start) {
      //The end is nigh, prepare or suffer the consequences.
      if (0 == speech_hist[0].min_end || speech_hist[0].min_end > temp_val.min) {
        //This is a local minima so far.
        speech_hist[0].min_end = temp_val.min;
      }
    }
    //Find the end of the speech block with dy ~= 0 after the end precursor.
    //ie. We've been setting min_end already and we've reached a flat spot.
    //Squaring it vs. doing a +- comparison.
    // TODO: Need to include if this is a saddle. The dy >= DY_START is sketching that in.
    if (speech_hist[0].min_end > 0 && (DY_FLAT >= (temp_val.dy * temp_val.dy) || temp_val.dy >= DY_START)) {
      //It's the end of the word as we know it, and I feel fine.
      speech_hist[0].end_time = (new Date()).getTime();
    }
  }
}

function getSpeechBlocks(display_store) {
  //Get FFT
  //Get speech blocks and set it in a passed in global.
  //Return FFT
  let curr_fft = fft.analyze();
  //Summarize the results and scale them.
  getSumFFT(curr_fft, BUCKETS_LOW, display_store);
  //Smooth the results and look for the start and stop points of words.
  if(display_store.length > SMOOTHING_DEPTH){
    getSpeechStartStop(display_store);
  }
  return curr_fft;
}

function getSpeakingStats(speech_hist_depth_limit, syl_per_block, tgt_avg_speech_block) {
  if (1 < speech_hist.length && 0 == speech_hist[0].max) {
    //Parsing out words and storing them into a log.
    let speech_hist_end = {};
    //Look at defining this based on pause length statistics.
    if(speech_hist[1].pause_frames < MAX_PAUSE) {
      speech_stats.total_pause += speech_hist[1].pause_frames;
    } else {
      speech_stats.total_pause += MAX_PAUSE;
    }
    speech_hist[1].running_time = speech_hist[0].start_time - speech_hist[1].start_time;
    speech_stats.total_talk += speech_hist[1].speech_frames;
    speech_stats.total_time += speech_hist[1].running_time;
    speech_hist_end = speech_hist[speech_hist.length - 1];

    //Create a running average word size.
    speech_stats.avg_word = (speech_stats.total_talk / speech_hist.length).toFixed(0);

    //How many syllables are in the current word, and what is the total for the queue.
    //From calibration, use the syllables_per_word.
    // TODO: Rework this to use the average syllables per speech block to adjust the syl_per_frame.
    speech_hist[1].syl_count = (syl_per_block * speech_hist[1].speech_frames) / speech_stats.avg_word;
    speech_stats.total_syllables += speech_hist[1].syl_count;

    //Clock time, SPM. We could also do SPM during speech blocks, but that doesn't handle slow parts as well.
    speech_stats.SPM = (speech_stats.total_syllables * 60000 / speech_stats.total_time).toFixed(0); //Total recent syllables, 60000 ms to a minute, total clock time.

    //What is the ratio of speaking frames to pauses within speech?
    speech_stats.PTS = getCurrPauseToSpeech(speech_stats);

    //Limit the the length of the speech_hist and remove related info from the totals.
    if(speech_hist.length > speech_hist_depth_limit) {
      if (speech_hist_end.pause_frames > MAX_PAUSE) {
        speech_stats.total_pause -= MAX_PAUSE;
      } else {
        speech_stats.total_pause -= speech_hist_end.pause_frames;
      }
      speech_stats.total_talk -= speech_hist_end.speech_frames;
      speech_stats.total_syllables -= speech_hist_end.syl_count;
      speech_stats.total_time -= speech_hist_end.running_time;
      speech_hist.pop();
    }
  }
}

function getCurrPauseToSpeech(speech_stats) {
  let curr_pts;
  curr_pts = (speech_stats.total_pause / speech_stats.total_talk).toFixed(2);
  return curr_pts;
}

function runMicCheck(display_store) {
  //Get FFT
  //Get speech blocks
  //Set initial filter values?
  getSpeechBlocks(display_store);
}

function runCalibration(display_store, history_store) {
  //Get FFT
  //Store the FFT results into the calibration audio array.
  //Get speech blocks (filter out background noise, etc.)
  history_store.fft_hist.push(getSpeechBlocks(display_store));
  getSpeakingStats(10000, 1, 1);
}

function setCalibration(cal_store, cal_settings, speech_hist, speech_stats) {
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

function getRealtimeTargets(cal_settings, rt_settings) {
  //Get slider SPM setting. May need to make the slider width bigger.
  rt_settings.tgt_SPM = 20 * Math.round(cal_settings.SPM / 20);
}

function setRealtimeTargets(cal_settings, rt_settings) {
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

function runRealtime(display_store, rt_settings) {
  let fb = {};
  let curr_pts = 1;
  fb.breathing = 1;
  fb.speed = 1;
  fb.SPM = rt_settings.tgt_SPM;
  getSpeechBlocks(display_store);
  getSpeakingStats(SPEECH_HIST_DEPTH, rt_settings.syl_per_avg_speech_block, rt_settings.tgt_avg_speech_block);
  //Store the summary info and running averages to compare to the targets:
  fb.SPM = speech_stats.SPM;
  fb.breathing =  speech_stats.PTS / rt_settings.tgt_pause_to_speech;
  // *Total speech per time (remove longer pauses)
  // *Total pauses per time (remove longer pauses)
  // *Number of speech blocks over that time.
  // *Recent Pause to Speech Ratio (for a certain number of speech blocks or something)
  // *Longer Term Pause to Speech Ratio (for a certain number of speech blocks or something, but longer than recent)
  // *Recent Average Speech Block Size (for the last n blocks)
  // *Longer Term Average Speech Block Size (for the last bigger than n blocks)
  return fb;
}

//Common Canvas and FFT Settings
const FFT_LEN = 64;
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 50;
const FRAME_RATE = 50;
const SPEECH_TIME_FRAME = 50; //How frequent to update the speech_hist. This is limited to the HIST_DEPTH.
let time_frame = 0; //Used as a clock for relative measurements.
                  //We will need to handle size issues if we allow for long continuous sampling,
                  //but at 100fps and 32-bit integers, we are ok for several hours.
                  //Ultimately, we will want to switch to a different timer, not use
                  //p5 loop or library.
let mic, fft, canvas, tgt_spm, tgt_avg_word, tgt_speech_ratio;  //This is for p5 functions. Will need to replace these in the long term.
let speech_hist_last = 0; //Used for keeping track of when to update the speech stats.
let curr_mode = 'intro'; //

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
  tgt_spm = document.getElementById('spm');
  tgt_avg_word = document.getElementById('avg_word');
  tgt_speech_ratio = document.getElementById('speech_ratio');
}

function updateRate () {
  //Update the interface with the current speaking rate and quality vs. the target.
  //Trigger audio feedback when exceeding either speech rate or not enough pausing ratio.
  // TODO:
  //1. Get the current target values from the interface. (Allows for tuning the settings in use.)
  //2. Compare the current rates with the target values. This will need some buffering so that it waits
  //for a little history before triggering the feedback, but should be pretty responsive.
  //3. Update the interface to show the current rate and any feedback of relative value.
  //4. Play feedback sound for a given condition (too fast, too little space).
  if(speech_hist_last + SPEECH_TIME_FRAME >= time_frame || 0 == speech_hist_last){
    speech_hist_last = time_frame; //Increment counter.
    tgt_spm.innerText = speech_stats.spm;
    tgt_avg_word.innerText = speech_stats.avg_word;
    tgt_speech_ratio.innerText = speech_stats.speech_ratio;
  }
}

function draw() {
//This is a p5 required function used to do things on an approximate timer, like drawing a canvas.
//Outside reference to hist_filtered global.
  time_frame++;
  getCleanFFT();
  getWords();

  background(255);
  //Don't start displaying or doing other things until there is some buffer.
  // TODO: 1. Change what happens during calibration vs. during feedback.
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
    // //Draw the filtered values.
    // for (i = SMOOTHING_DEPTH; i < width_nodes; i++){
    //   //Draw the vertices for this slice.
    //   vertex((i*scale_len_horz), map(hist_filtered[i].filter, 0, 1, filter_base, filter_top));
    //   vertex(((i+1)*scale_len_horz), map(hist_filtered[i].filter, 0, 1, filter_base, filter_top));
    // }

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

    }

    endShape();
  }
  if ('startrealtime' == curr_mode) {
    //Draw and update displayed info.
    updateRate();
  }
}

function mousePressed() {
  noLoop();
}

function mouseReleased() {
  loop();
}

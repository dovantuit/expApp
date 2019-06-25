function flipPage(hide_id, show_id, canvas_id) {
  //Function to flip the display of two elements (show and hide "pages")
  document.getElementById(show_id).classList.toggle("collapse");
  document.getElementById(hide_id).classList.toggle("collapse");
  if(canvas_id !== null && canvas_id !== '') {
    canvas.parent(canvas_id);
  }
  curr_mode = show_id;
}

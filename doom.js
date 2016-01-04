var state = {};

$(document).ready(function() {
  main();
});

function abort(message) {
  document.write(message);
}

function parse_wad(wad) {
  if (wad.getString(4, 0) != "IWAD") {
    abort("WAD format not supported");
  }
  var directory_size = wad.getInt32(4, true);
  var directory_pointer = wad.getInt32(8, true);
  state.directory = [];
  for (var entry = 0; entry < directory_size; entry++) {
    var addr = directory_pointer + entry * 16;
    state.directory.push({
      name: wad.getString(8, addr + 8),
      start: wad.getInt32(addr, true),
      size: wad.getInt32(addr + 4, true)
    });
  }
  console.log(state.directory);
}

function load_wad() {
  xhr = new XMLHttpRequest()
  xhr.open("GET", "http://localhost:8000/doom.wad", true);
  xhr.responseType = "arraybuffer";
  xhr.onload = function(event) {
    if (this.status == 200) {
      parse_wad(new jDataView(this.response));
    } else {
      array("Error loading WAD");
    }
  };
  xhr.send();
}

function main() {
  load_wad();
}


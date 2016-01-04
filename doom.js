var state = {};

$(document).ready(function() {
  main();
});

function abort(message) {
  document.write(message);
}

function load_vertex(start) {
  var assets = _.rest(state.directory, start);
  var entry = _.findWhere(assets, {name: "VERTEXES"});
  var vertexes = {x: [], y: []};
  var size = entry.size / 4;
  for (var i = 0; i < size; i++) {
    vertexes.x.push(state.wad.getInt16(entry.start + i * 4, true));
    vertexes.y.push(state.wad.getInt16(entry.start + i * 4 + 2, true));
  }
  vertexes.minx = _.min(vertexes.x);
  vertexes.maxx = _.max(vertexes.x);
  vertexes.miny = _.min(vertexes.y);
  vertexes.maxy = _.max(vertexes.y);
  console.log(vertexes);

  return vertexes;
}

function load_stage(stage_name) {
  var stage = {}
  var start = _.findWhere(state.directory, {name: stage_name}).index;
  stage.vertex = load_vertex(start);
  return stage;
}

function wad_trim(str) {
  return (str + '\0').split('\0').shift();
}

function parse_wad() {
  if (state.wad.getString(4, 0) != "IWAD") {
    abort("WAD format not supported");
  }
  var directory_size = state.wad.getInt32(4, true);
  var directory_pointer = state.wad.getInt32(8, true);
  state.directory = [];
  for (var entry = 0; entry < directory_size; entry++) {
    var addr = directory_pointer + entry * 16;
    state.directory.push({
      name: wad_trim(state.wad.getString(8, addr + 8)),
      start: state.wad.getInt32(addr, true),
      size: state.wad.getInt32(addr + 4, true),
      index: entry
    });
  }
  state.stage = load_stage("E1M1");
}

function load_wad() {
  xhr = new XMLHttpRequest()
  xhr.open("GET", "http://localhost:8000/doom.wad", true);
  xhr.responseType = "arraybuffer";
  xhr.onload = function(event) {
    if (this.status == 200) {
      state.wad = new jDataView(this.response);
      parse_wad();
    } else {
      array("Error loading WAD");
    }
  };
  xhr.send();
}

function main() {
  load_wad();
}


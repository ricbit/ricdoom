// Ricardo Bittencourt 2016

var state = {};

$(document).ready(function() {
  main();
});

function abort(message) {
  document.write(message);
}

function scale(x, minx, maxx, size) {
  return (x - minx) / (maxx - minx) * size;
}

function draw_stage() {
  var ctx = $("#playfield")[0].getContext("2d");
  var vertexes = state.stage.vertexes;
  var lines = state.stage.lines;
  for (var i = 0; i < lines.size; i++) {
    ctx.beginPath();
    ctx.moveTo(scale(vertexes.x[lines[i].begin], 
                     vertexes.minx, vertexes.maxx, 500),
               scale(vertexes.y[lines[i].begin], 
                     vertexes.miny, vertexes.maxy, 500));
    ctx.lineTo(scale(vertexes.x[lines[i].end], 
                     vertexes.minx, vertexes.maxx, 500),
               scale(vertexes.y[lines[i].end], 
                     vertexes.miny, vertexes.maxy, 500));
    ctx.stroke();
  }
}

function load_vertexes(start) {
  var assets = _.rest(state.directory, start);
  var entry = _.findWhere(assets, {name: "VERTEXES"});
  var vertexes = {x: [], y: []};
  vertexes.size = entry.size / 4;
  for (var i = 0; i < vertexes.size; i++) {
    vertexes.x.push(state.wad.getInt16(entry.start + i * 4, true));
    vertexes.y.push(state.wad.getInt16(entry.start + i * 4 + 2, true));
  }
  vertexes.minx = _.min(vertexes.x);
  vertexes.maxx = _.max(vertexes.x);
  vertexes.miny = _.min(vertexes.y);
  vertexes.maxy = _.max(vertexes.y);
  return vertexes;
}

function load_lines(start) {
  var assets = _.rest(state.directory, start);
  var entry = _.findWhere(assets, {name: "LINEDEFS"});
  var lines = [];
  lines.size = entry.size / 14;
  for (var i = 0; i < lines.size; i++) {
    lines.push({
      begin: state.wad.getUint16(entry.start + i * 14 + 0, true),
      end: state.wad.getUint16(entry.start + i * 14 + 2, true)
    });
  }
  return lines;
}

function load_stage(stage_name) {
  var stage = {}
  var start = _.findWhere(state.directory, {name: stage_name}).index;
  stage.vertexes = load_vertexes(start);
  stage.lines = load_lines(start);
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
  var all_names = _.pluck(state.directory, "name");
  var name_regexp = /^E.M.$/;
  var stage_names = _.filter(all_names, function(name) {
    return name_regexp.test(name);
  });
  console.log(stage_names);
  state.stage = load_stage(getStageName());
  draw_stage();
}

function getStageName() {
  var uri = window.location.search.substring(1);
  var params = decodeURIComponent(uri).split("=");
  return params[1];
}

function load_wad() {
  // Can't use $.get because it doesn't support binary arraybuffers.
  xhr = new XMLHttpRequest()
  xhr.open("GET", "doom.wad", true);
  xhr.responseType = "arraybuffer";
  xhr.onload = function(event) {
    if (this.status == 200) {
      state.wad = new jDataView(this.response);
      $("#loading").hide();
      $("#playfield").show();
      parse_wad();
    } else {
      abort("Error loading WAD");
    }
  };
  xhr.send();
}

function main() {
  load_wad();
}


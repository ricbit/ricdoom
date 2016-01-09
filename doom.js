// Ricardo Bittencourt 2016

(function() {
  "use strict";

  var state = {};

  $(document).ready(function() {
    ready();
  });

  function abort(message) {
    console.log(message);
    throw new Error();
  }

  function wad_trim(str) {
    return (str + '\0').split('\0').shift();
  }

  function Wad(wad) {
    this.wad = wad;
    this.directory = [];
    if (this.wad.getString(4, 0) != "IWAD") {
      abort("WAD format not supported");
    }
    this.parse_directory();
  }

  Wad.prototype.parse_directory = function() {
    var directory_size = this.wad.getInt32(4, true);
    var directory_pointer = this.wad.getInt32(8, true);
    for (var entry = 0; entry < directory_size; entry++) {
      var addr = directory_pointer + entry * 16;
      this.directory.push({
        name: wad_trim(this.wad.getString(8, addr + 8)),
        start: this.wad.getInt32(addr, true),
        size: this.wad.getInt32(addr + 4, true),
        index: entry
      });
    }
  };

  Wad.prototype.parse_stage = function(stage_name) {
    var stage = {};
    var start = _.findWhere(this.directory, {name: stage_name}).index;
    stage.vertexes = this.parse_vertexes(start);
    stage.lines = this.parse_lines(start);
    return stage;
  };

  Wad.prototype.parse_vertexes = function(start) {
    var assets = _.rest(this.directory, start);
    var entry = _.findWhere(assets, {name: "VERTEXES"});
    var vertexes = {x: [], y: []};
    vertexes.size = entry.size / 4;
    for (var i = 0; i < vertexes.size; i++) {
      vertexes.x.push(this.wad.getInt16(entry.start + i * 4, true));
      vertexes.y.push(this.wad.getInt16(entry.start + i * 4 + 2, true));
    }
    vertexes.minx = _.min(vertexes.x);
    vertexes.maxx = _.max(vertexes.x);
    vertexes.miny = _.min(vertexes.y);
    vertexes.maxy = _.max(vertexes.y);
    return vertexes;
  };

  Wad.prototype.parse_lines = function(start) {
    var assets = _.rest(state.wad.directory, start);
    var entry = _.findWhere(assets, {name: "LINEDEFS"});
    var lines = [];
    lines.size = entry.size / 14;
    for (var i = 0; i < lines.size; i++) {
      lines.push({
        begin: this.wad.getUint16(entry.start + i * 14 + 0, true),
        end: this.wad.getUint16(entry.start + i * 14 + 2, true)
      });
    }
    return lines;
  };

  function scale(x, minx, maxx, size) {
    return (x - minx) / (maxx - minx) * size;
  }

  function draw_stage() {
    var ctx = $("#playfield")[0].getContext("2d");
    ctx.clearRect(0, 0, 500, 500);
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

  function fill_select() { 
    var all_names = _.pluck(state.wad.directory, "name");
    var name_regexp = /^E.M.$/;
    var stage_names = _.filter(all_names, function(name) {
      return name_regexp.test(name);
    });
    var select = $("#stage_select");
    _.each(stage_names, function(name) {
      select.append($("<option>", {
        value: name,
        text: name
      }));
    });
    select.change(function() {
      var name = $(this).find(":selected").text();
      enable_stage(name);
    });
  }

  function load_first_stage() {
    $("#stage_select option:first").attr('selected', 'selected');
    $("#stage_select").trigger("change");
  }

  function enable_stage(name) {
    state.stage = state.wad.parse_stage(name);
    draw_stage();
  }

  function load_wad() {
    // Can't use $.get because it doesn't support binary arraybuffers.
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "doom.wad", true);
    xhr.responseType = "arraybuffer";
    xhr.onload = function(event) {
      if (this.status == 200) {
        main(new jDataView(this.response));
      } else {
        abort("Error loading WAD");
      }
    };
    xhr.send();
  }

  function main(wad) {
    state.wad = new Wad(wad);
    $("#loading").hide();
    $("#main").show();
    fill_select();
    load_first_stage();
  }

  function ready() {
    load_wad();
  }

}());

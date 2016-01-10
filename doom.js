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

  function Scaler(limits) {
    this.limits = limits;
  }

  function Stage() {
    this.vertexes = {x: [], y: []};
    this.lines = [];
    this.scaler = 0;
  }

  Stage.prototype.push_vertex = function(vertex) {
    this.vertexes.x.push(vertex.x);
    this.vertexes.y.push(vertex.y);
  };

  Stage.prototype.push_line = function(line) {
    this.lines.push(line);
  };

  Stage.prototype.optimize = function() {
    this.scaler = new Scaler({
      minx: _.min(this.vertexes.x),
      maxx: _.max(this.vertexes.x),
      miny: _.min(this.vertexes.y),
      maxy: _.max(this.vertexes.y),
    });
  };

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
    var stage = new Stage();
    var start = _.findWhere(this.directory, {name: stage_name}).index;
    var assets = _.rest(this.directory, start);
    this.parse_vertexes(assets, stage);
    this.parse_lines(assets, stage);
    return stage;
  };

  Wad.prototype.parse_vertexes = function(assets, stage) {
    var entry = _.findWhere(assets, {name: "VERTEXES"});
    var size = entry.size / 4;
    for (var i = 0; i < size; i++) {
      stage.push_vertex({
        x: this.wad.getInt16(entry.start + i * 4, true),
        y: this.wad.getInt16(entry.start + i * 4 + 2, true)
      });
    }
  };

  Wad.prototype.parse_lines = function(assets, stage) {
    var entry = _.findWhere(assets, {name: "LINEDEFS"});
    var size = entry.size / 14;
    for (var i = 0; i < size; i++) {
      stage.push_line({
        begin: this.wad.getUint16(entry.start + i * 14 + 0, true),
        end: this.wad.getUint16(entry.start + i * 14 + 2, true)
      });
    }
  };

  function scale(x, minx, maxx, size) {
    return (x - minx) / (maxx - minx) * size;
  }

  function draw_stage(stage) {
    var ctx = $("#playfield")[0].getContext("2d");
    ctx.clearRect(0, 0, 500, 500);
    var vertexes = stage.vertexes;
    var lines = stage.lines;
    for (var i = 0; i < lines.length; i++) {
      ctx.beginPath();      
      ctx.moveTo(scale(vertexes.x[lines[i].begin], 
                       stage.scaler.limits.minx, stage.scaler.limits.maxx, 500),
                 scale(vertexes.y[lines[i].begin], 
                       stage.scaler.limits.miny, stage.scaler.limits.maxy, 500));
      ctx.lineTo(scale(vertexes.x[lines[i].end], 
                       stage.scaler.limits.minx, stage.scaler.limits.maxx, 500),
                 scale(vertexes.y[lines[i].end], 
                       stage.scaler.limits.miny, stage.scaler.limits.maxy, 500));
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
      var stage = state.wad.parse_stage(name);
      stage.optimize();
      draw_stage(stage);
    });
  }

  function load_first_stage() {
    $("#stage_select option:first").attr('selected', 'selected');
    $("#stage_select").trigger("change");
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

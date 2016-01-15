// Ricardo Bittencourt 2016

(function() {
  "use strict";

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

  function filled_array(size, value) {
    return _.map(new Array(size), function(old) {
      return value;
    });
  }

  function Scaler(limits) {
    this.xlimits = {
      min: limits.minx,
      max: limits.maxx,
      inner: limits.maxx - limits.minx,
      outer: limits.windowx
    };
    this.ylimits = {
      min: limits.miny,
      max: limits.maxy,
      inner: limits.maxy - limits.miny,
      outer: limits.windowy
    };
    if (this.xlimits.inner > this.ylimits.inner) {
      this.xlimits.coef = this.xlimits.outer / this.xlimits.inner;
      this.ylimits.coef = this.xlimits.coef;
    } else {
      this.ylimits.coef = this.ylimits.outer / this.ylimits.inner;
      this.xlimits.coef = this.ylimits.coef;
    }
  }

  Scaler.prototype.scale = function(value, limits) {
    return (value - limits.min) * limits.coef;
  };

  Scaler.prototype.x = function(value) {
    return this.scale(value, this.xlimits);
  };

  Scaler.prototype.y = function(value) {
    return this.ylimits.outer - this.scale(value, this.ylimits);
  };

  function Stage() {
    this.vertexes = {x: [], y: []};
    this.lines = [];
    this.sectors = [];
    this.sidedefs = [];
  }

  Stage.prototype.push_vertex = function(vertex) {
    this.vertexes.x.push(vertex.x);
    this.vertexes.y.push(vertex.y);
  };

  Stage.prototype.push_line = function(line) {
    var parsed_line = {
      begin: line.begin,
      end: line.end,
      sidedefs: [],
      vertexes: [line.begin, line.end],
      index: line.index
    };
    if (line.right != 65535) {
      parsed_line.sidedefs.push(line.right);
    }
    if (line.left != 65535) {
      parsed_line.sidedefs.push(line.left);
    }
    this.lines.push(parsed_line);
  };

  Stage.prototype.push_sector = function(sector) {
    this.sectors.push({
      floor: sector.floor,
      lines: [],
      raw_polygons: []
    });
  };

  Stage.prototype.push_sidedef = function(sidedef) {
    this.sidedefs.push(sidedef);
  };

  Stage.prototype.optimize = function() {
    this.scaler = new Scaler({
      minx: _.min(this.vertexes.x),
      maxx: _.max(this.vertexes.x),
      miny: _.min(this.vertexes.y),
      maxy: _.max(this.vertexes.y),
      windowx: 500,
      windowy: 500
    });
    this.collect_lines_from_sectors();
    this.collect_polygons();
  };

  Stage.prototype.collect_lines_from_sectors = function() {
    _.each(this.lines, function(line) {
      _.each(line.sidedefs, function(sidedef) {
        this.sectors[this.sidedefs[sidedef].sector].lines.push(line.index);
      }.bind(this));
    }.bind(this));
  };

  Stage.prototype.get_shared_vertexes = function(lines) {
    var all_vertexes = _.flatten(_.map(lines, function(line) {
      return this.lines[line].vertexes;
    }.bind(this)));
    var grouped_vertexes = _.countBy(all_vertexes, _.identity);
    var shared_vertexes = _.filter(_.keys(grouped_vertexes), function(key) {
      return grouped_vertexes[key] > 2;
    });
    if (shared_vertexes.length > 0) {
      console.log(shared_vertexes);
    }
  };

  Stage.prototype.collect_polygons = function() {
    _.each(this.sectors, function(sector) {
      var visited = filled_array(sector.lines.length, false);
      var shared_vertexes = this.get_shared_vertexes(sector.lines);
      _.each(sector.lines, function(line, i) {
        if (!visited[i]) {
          var polygon = this.traverse_polygon(sector, i, visited);
          sector.raw_polygons.push(polygon);
        }
      }.bind(this));
      var bug = _.any(sector.raw_polygons, function(polygon) {
        return polygon.length <= 2;
      }); 
      if (bug) {
        console.log(sector);
      }
    }.bind(this));
  };

  Stage.prototype.traverse_polygon = function(sector, first, visited) {
    var cur = first;
    var polygon = [];
    while (!visited[cur]) {
      visited[cur] = true;
      polygon.push(this.lines[sector.lines[cur]]);
      for (var i = 0; i < sector.lines.length; i++) {
        if (!visited[i] && _.intersection(
            this.lines[sector.lines[cur]].vertexes, 
            this.lines[sector.lines[i]].vertexes).length > 0) {
          cur = i;
          break;
        }
      }
    }
    if (this.signed_polygon_area(polygon) < 0) {
      polygon.reverse();
    }
    return polygon;
  };

  Stage.prototype.signed_polygon_area = function(polygon) {
    var sum = 0;
    _.each(polygon, function(line) {
      var ax = this.vertexes.x[line.begin];
      var bx = this.vertexes.x[line.end];
      var ay = this.vertexes.y[line.begin];
      var by = this.vertexes.y[line.end];
      sum += (bx - ax) * (by + ay);
    }.bind(this));
    return sum;
  };

  Stage.prototype.draw = function(svg, sector) {
    svg.clear();
    this.draw_filled_sectors(svg, sector);
    this.draw_lines(svg, sector);
  };

  Stage.prototype.get_random_color = function() {
    var random_color = _.random(0xFFFFFF);
    var random_string = ("000000" + random_color.toString(16)).slice(-6);
    return "#" + random_string;
  };

  Stage.prototype.draw_filled_sectors = function(svg, sector) {
    _.each(this.sectors, function(sector) {
      _.each(sector.raw_polygons, function(polygon) {
        if (polygon.length > 2) {
          var points = _.map(this.get_point_list(polygon), function(point) {
            return [this.scaler.x(point.x), this.scaler.y(point.y)];
          }.bind(this));
          svg.polyline(points, {fill: this.get_random_color()});
        }
      }.bind(this));
    }.bind(this));
  };

  Stage.prototype.get_point_list = function(polygon) {
    var cur = _.difference(polygon[0].vertexes, polygon[1].vertexes)[0];
    var points = [cur];
    _.each(_.initial(polygon), function(line) {
      cur = cur == line.begin ? line.end : line.begin;
      points.push(cur);
    });
    return _.map(points, function(point) {
      return {
        x: this.vertexes.x[point],
        y: this.vertexes.y[point]
      };
    }.bind(this));
  };

  Stage.prototype.draw_lines = function(svg, sector) {
    var g = svg.group({stroke: "black", strokeWidth: 1});
    _.each(this.lines, function(line) {
      svg.line(g, this.scaler.x(this.vertexes.x[line.begin]),
                  this.scaler.y(this.vertexes.y[line.begin]),
                  this.scaler.x(this.vertexes.x[line.end]),
                  this.scaler.y(this.vertexes.y[line.end]));
    }.bind(this));
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
    this.parse_sectors(assets, stage);
    this.parse_sidedefs(assets, stage);
    this.parse_vertexes(assets, stage);
    this.parse_lines(assets, stage);
    return stage;
  };

  Wad.prototype.parse_iterator = function(assets, name, size, parser) {
    var entry = _.findWhere(assets, {name: name});
    var entry_size = entry.size / size;
    for (var index = 0; index < entry_size; index++) {
      var addr = entry.start + index * size;
      parser(addr, index, this.wad);
    }
  };

  Wad.prototype.parse_vertexes = function(assets, stage) {
    this.parse_iterator(assets, "VERTEXES", 4, function(addr, index, wad) {
      stage.push_vertex({
        x: wad.getInt16(addr + 0, true),
        y: wad.getInt16(addr + 2, true)
      });
    });
  };

  Wad.prototype.parse_lines = function(assets, stage) {
    this.parse_iterator(assets, "LINEDEFS", 14, function(addr, index, wad) {
      stage.push_line({
        begin: wad.getUint16(addr + 0, true),
        end: wad.getUint16(addr + 2, true),
        right: wad.getUint16(addr + 10, true),
        left: wad.getUint16(addr + 12, true),
        index: index
      });
    });
  };

  Wad.prototype.parse_sectors = function(assets, stage) {
    this.parse_iterator(assets, "SECTORS", 26, function(addr, index, wad) {
      stage.push_sector({
        floor: wad_trim(wad.getString(8, addr + 4))
      });
    });
  };

  Wad.prototype.parse_sidedefs = function(assets, stage) {
    this.parse_iterator(assets, "SIDEDEFS", 30, function(addr, index, wad) {
      stage.push_sidedef({
        sector: wad.getUint16(addr + 28, true),
      });
    });
  };

  Wad.prototype.get_stage_names = function() {
    var all_names = _.pluck(this.directory, "name");
    var name_regexp = /^E.M.$/;
    return _.filter(all_names, function(name) {
      return name_regexp.test(name);
    });
  };

  function fill_select(wad) {
    var stage_names = wad.get_stage_names();
    var select = $("#stage_select");
    _.each(stage_names, function(name) {
      select.append($("<option>", {
        value: name,
        text: name
      }));
    });
    select.change(function() {
      var name = $(this).find(":selected").text();
      var svg = $("#playfield").svg("get");
      var stage = wad.parse_stage(name);
      stage.optimize();
      stage.draw(svg, 1);
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

  function main(binary_wad) {
    var wad = new Wad(binary_wad);
    $("#loading").hide();
    $("#main").show();
    $("#playfield").svg({
      onLoad: function() {
        fill_select(wad);
        load_first_stage();
      },
      settings: {
        width: 500,
        height: 500
      }
    });
  }

  function ready() {
    load_wad();
  }

}());

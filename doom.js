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

  function PolygonFinder(lines) {
    this.lines = lines;
    this.visited = filled_array(lines.length, false);
    this.raw_polygons = [];
  }

  PolygonFinder.prototype.collect_polygons = function() {
    for (var i = 0 ; i < 3; i++) {
      var shared_vertexes = this.get_shared_vertexes(this.lines);
      if (shared_vertexes.length > 0) {
        console.log(this.dump_dot_sector());
        this.collect_polygons_hard(shared_vertexes);
      }
    }
    _.each(this.lines, function(line, i) {
      if (!this.visited[i]) {
        this.traverse_polygon(i);
      }
    }.bind(this));
    return this.raw_polygons;
  };

  PolygonFinder.prototype.collect_polygons_hard = function(shared_vertexes) {
    if (undefined === _.find(shared_vertexes, function(vertex) {
      console.log("Trying vertex ", vertex);
      return this.try_shared_vertex(vertex, shared_vertexes);
    }.bind(this))) {
      console.log("Could not find simple polygon");
    }
  };

  PolygonFinder.prototype.try_shared_vertex = function(vertex, shared) {
    var candidates = this.get_lines_from_vertex(vertex, shared);
    console.log("Candidates: ");
    console.log(candidates);
    return undefined !== _.find(candidates, function(line_index) {
      console.log("Trying line ", line_index);
      return this.traverse_from_line(line_index, vertex, shared);
    }.bind(this));
  };

  PolygonFinder.prototype.traverse_from_line = function(
      line_index, start_vertex, shared) {
    var visited = _.clone(this.visited);
    var current_vertex = start_vertex;
    var current_line = line_index;
    var polygon = [this.lines[line_index]];
    visited[current_line] = true;
    while (true) {
      var next_vertexes = _.without(
          this.lines[current_line].vertexes, current_vertex);
      if (next_vertexes.length === 0) {
        return false;
      }
      current_vertex = next_vertexes[0];
      if (_.contains(shared, current_vertex)) {
        break;
      }
      var count = 0;
      _.each(this.lines, function(line, index) {
        if (!visited[index] && _.contains(line.vertexes, current_vertex)) {
          current_line = index;
          polygon.push(line);
          count++;
          visited[index] = true;
        }
      });
      if (count != 1) {
        return false;
      }
    }
    if (current_vertex != start_vertex) {
      return false;
    }
    this.raw_polygons.push(polygon);
    this.visited = visited;
    console.log(polygon);
    return true;
  };

  PolygonFinder.prototype.get_lines_from_vertex = function(vertex, shared) {
    var lines = [];
    for (var i = 0; i < this.lines.length; i++) {
      if (!this.visited[i] && _.contains(this.lines[i].vertexes, vertex)) {
        lines.push(i);
      }
    }
    return lines;
  };

  PolygonFinder.prototype.check_non_euclidean = function(polygon) {
    if (polygon.length <= 2) {
      console.log("Found non-euclidean polygon");
      console.log(this.dump_dot_sector());
    }
  };

  PolygonFinder.prototype.check_open_polygon = function(polygon) {
    if (_.intersection(_.first(polygon).vertexes, 
                       _.last(polygon).vertexes).length === 0)  {
      console.log("Found open polygon");
      console.log(polygon);
      console.log(this.dump_dot_sector());
    }
  };

  PolygonFinder.prototype.dump_dot_sector = function() {
    var dot = "graph {";
    _.each(this.lines, function(line) {
      dot += "" + line.vertexes[0];
      dot += " -- " + line.vertexes[1] + ";";
    }.bind(this));
    dot += "}";
    return dot;
  };

  PolygonFinder.prototype.traverse_polygon = function(first) {
    var cur = first;
    var polygon = [];
    while (!this.visited[cur]) {
      this.visited[cur] = true;
      polygon.push(this.lines[cur]);
      for (var i = 0; i < this.lines.length; i++) {
        if (!this.visited[i] && _.intersection(
            this.lines[cur].vertexes,
            this.lines[i].vertexes).length > 0) {
          cur = i;
          break;
        }
      }
    }
    this.check_non_euclidean(polygon);
    this.check_open_polygon(polygon);
    this.raw_polygons.push(polygon);
  };

  PolygonFinder.prototype.get_shared_vertexes = function(lines) {
    var all_vertexes = [];
    for (var i = 0; i < lines.length; i++) {
      if (!this.visited[i]) {
        all_vertexes.push(lines[i].vertexes);
      }
    }
    var flattened = _.flatten(all_vertexes);
    var grouped_vertexes = _.countBy(flattened, _.identity);
    var shared_vertexes = _.filter(_.keys(grouped_vertexes), function(key) {
      return grouped_vertexes[key] > 2;
    });    
    if (shared_vertexes.length > 0) {
      console.log("Shared vertexes");
      console.log(shared_vertexes);
    }
    return _.map(shared_vertexes, function(value) {
      return parseInt(value);
    });
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
      index: line.index,
      flags: line.flags,
      type: line.type
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
    _.each(this.sectors, function(sector) {
      var finder = new PolygonFinder(sector.lines);
      var polygons = finder.collect_polygons();
      sector.raw_polygons = _.map(polygons, function(polygon) {
        return _.map(polygon, function(line) {
          return this.lines[line.index];
        }.bind(this));
      }.bind(this));
    }.bind(this));
  };

  Stage.prototype.is_double_line = function(line) {
    var sectors = _.map(line.sidedefs, function(sidedef) {
      return this.sidedefs[sidedef].sector;
    }.bind(this));
    return (line.sidedefs.length > 1 && _.intersection(sectors).length == 1);
  };

  Stage.prototype.collect_lines_from_sectors = function() {
    _.each(this.lines, function(line) {
      if (!this.is_double_line(line)) {
        _.each(line.sidedefs, function(sidedef) {
          this.sectors[this.sidedefs[sidedef].sector].lines.push({
            index: line.index,
            vertexes: line.vertexes
          });
        }.bind(this));
      }
    }.bind(this));
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

  Stage.prototype.choose_color = function() {
    var r = _.random(32, 255);
    var g = _.random(32, 255);
    var b = _.random(32, 255);
    return (r << 16) + (g << 8) + b;
  }

  Stage.prototype.get_random_color = function() {
    var random_color = this.choose_color();
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
    var normal = {stroke: "black", strokeWidth: 1};
    var secret = {strokeDashArray: "2, 2"};
    _.extend(secret, normal);
    _.each(this.lines, function(line) {
      svg.line(svg.group(line.flags & 0x20 ? secret : normal),
               this.scaler.x(this.vertexes.x[line.begin]),
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
        flags: wad.getUint16(addr + 4, true),
        type: wad.getUint16(addr + 6, true),
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
    xhr.addEventListener("progress", function(progress) {
      // Hardcoded the max value, because progress.total only works
      // when the server sets correctly the header Content-length.
      // Unfortunately this is not the case of my static server.
      var progress_bar = $("#wad_progress");
      progress_bar.attr("max", 4196020);
      progress_bar.attr("value", progress.loaded);
    }, false);
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

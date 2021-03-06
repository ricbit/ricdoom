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

  function bind_mousewheel(dom_node, wheelup, wheeldown) {
    // jQuery doesn't have a mouse wheel event.
    // We use 'mousewheel' for Chrome, IE, and 'DOMMouseScroll' for Firefox.
    dom_node.bind("mousewheel DOMMouseScroll", function(event) {
      if (event.originalEvent.wheelDelta > 0 ||
          event.originalEvent.detail < 0) {
        wheelup();
      } else {
        wheeldown();
      }
    });
  };

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
    this.lines = _.map(lines, function(line) {
      return {
        original: line,
        vertexes: line.vertexes,
        visited: false
      };
    });
    this.all_polygons = [];
  }

  PolygonFinder.prototype.collect_polygons = function() {
    while (this.has_available_lines()) {
      var polygon = this.collect_one_polygon();
      if (_.isEmpty(polygon)) {
        console.log("Could not find polygon");
        console.log(this.dump_dot_sector());
        break;
      }
      this.all_polygons.push(polygon);
      this.update_visited(polygon);
    }
    return this.format_lines();
  };

  PolygonFinder.prototype.format_lines = function() {
    return _.map(this.all_polygons.reverse(), function(polygon) {
      return _.pluck(polygon, 'original');
    });
  };

  PolygonFinder.prototype.update_visited = function(polygon) {
    _.each(polygon, function(line) {
      line.visited = true;
    });
  };

  PolygonFinder.prototype.has_available_lines = function() {
    return undefined !== _.findWhere(this.lines, {visited: false});
  };

  PolygonFinder.prototype.collect_one_polygon = function() {
    this.best_polygon = [];
    this.best_distance = 10000;
    _.each(this.get_available_lines(), function(line) {
      if (!_.contains(this.best_polygon, line)) {
        this.find_smallest_cycle(line);
      }
    }.bind(this));
    return this.best_polygon;
  };

  PolygonFinder.prototype.find_smallest_cycle = function(line) {
    this.current_polygon = [line];
    this.start_vertex = line.vertexes[0];
    line.visited = true;
    this.smallest_cycle_rec(line.vertexes[1]);
    line.visited = false;
  };

  PolygonFinder.prototype.smallest_cycle_rec = function(current_vertex) {
    var candidate_lines = this.get_candidate_lines(current_vertex);
    _.each(candidate_lines, function(line) {
      line.visited = true;
      this.current_polygon.push(line);
      var other_vertex = this.get_other_vertex(current_vertex, line);
      if (this.current_polygon.length < this.best_distance) {
        if (other_vertex == this.start_vertex) {
          this.best_polygon = _.clone(this.current_polygon);
          this.best_distance = this.current_polygon.length;
        } else {
          this.smallest_cycle_rec(other_vertex);
        }
      }
      this.current_polygon.pop();
      line.visited = false;
    }.bind(this));
  };

  PolygonFinder.prototype.get_other_vertex = function(vertex, line) {
    return _.difference(line.vertexes, [vertex])[0];
  };

  PolygonFinder.prototype.get_available_lines = function() {
    return _.where(this.lines, {visited: false});
  };

  PolygonFinder.prototype.get_candidate_lines = function(current_vertex) {
    return _.filter(this.lines, function(line) {
      return !line.visited && _.contains(line.vertexes, current_vertex);
    });
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

  function Stage() {
    this.vertexes = [];
    this.lines = [];
    this.sectors = [];
    this.sidedefs = [];
    this.flats = {};
    this.palette = [];
  }

  Stage.prototype.push_vertex = function(vertex) {
    this.vertexes.push(vertex);
  };

  Stage.prototype.push_palette = function(palette) {
    this.palette = palette;
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

  Stage.prototype.push_flat = function(name, bytes) {
    this.flats[name] = bytes;
  };

  Stage.prototype.optimize = function() {
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
      var ax = this.vertexes[line.begin].x;
      var bx = this.vertexes[line.end].x;
      var ay = this.vertexes[line.begin].y;
      var by = this.vertexes[line.end].y;
      sum += (bx - ax) * (by + ay);
    }.bind(this));
    return sum;
  };

  function PolygonSorter(polygons) {
    this.polygons = _.map(polygons, function(original) {
      original.visited = false;
      return original;
    });
    this.sorted = [];
  }

  PolygonSorter.prototype.sort = function() {
    var available = this.available_polygons();
    do {
      _.each(available, function(polygon) {
        if (this.outside(polygon, available)) {
          this.sorted.push(polygon);
          polygon.visited = true;
        }
      }.bind(this));
      available = this.available_polygons();
    } while (!_.isEmpty(available));
    return this.sorted;
  };

  PolygonSorter.prototype.outside = function(polygon, available) {    
    return _.all(available, function(inside) {
      if (polygon == inside || inside.visited) {
        return true;
      }
      return !_.all(polygon.polygon, function(point) {
         return this.point_inside_polygon(point, inside.polygon);
      }.bind(this));
    }.bind(this));
  };

  PolygonSorter.prototype.is_left = function(p0, p1, p2) {
    return (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
  };

  PolygonSorter.prototype.point_inside_polygon = function(point, polygon) {
    var wn = 0;
    for (var i = 0; i < polygon.length; i++) {
      var i2 = (i + 1) % polygon.length;
      if (polygon[i].y <= point.y) {
        if (polygon[i2].y > point.y) {
          if (this.is_left(polygon[i], polygon[i2], point) > 0) {
            wn += 1;
          }
        }
      } else {
        if (polygon[i2].y <= point.y) {
          if (this.is_left(polygon[i], polygon[i2], point) < 0) {
            wn -= 1;
          }
        }
      }
    }
    return wn != 0;
  };

  PolygonSorter.prototype.available_polygons = function() {
    return _.filter(this.polygons, function(polygon) {
      return !polygon.visited;
    });
  };

  function StageRenderer(stage, svg) {
    this.stage = stage;
    this.svg = svg;
    this.zoom_level = 1;
    this.mouse_down = false;
    this.originX = 0;
    this.originY = 0;
    this.dragX = 0;
    this.dragY = 0;
    this.moveX = 0;
    this.moveY = 0;
    this.playfield = $("#playfield");
    this.scaler = new Scaler({
      minx: _.min(_.pluck(this.stage.vertexes, 'x')),
      maxx: _.max(_.pluck(this.stage.vertexes, 'x')),
      miny: _.min(_.pluck(this.stage.vertexes, 'y')),
      maxy: _.max(_.pluck(this.stage.vertexes, 'y')),
      windowx: this.playfield.width(),
      windowy: this.playfield.height()
    });
  }

  StageRenderer.prototype.draw = function() {
    this.svg.clear();
    this.draw_patterns();
    this.draw_filled_sectors();
    this.draw_lines();
    bind_mousewheel(this.playfield,
        this.wheelup.bind(this), this.wheeldown.bind(this));
    this.playfield.mousedown(this.mousedown.bind(this));
    this.playfield.mouseup(this.mouseup.bind(this));
    this.playfield.mousemove(this.mousemove.bind(this));
  };

  StageRenderer.prototype.wheelup = function(event) {
    this.zoom_level /= 1.1;
    this.set_current_viewbox();
  };

  StageRenderer.prototype.wheeldown = function(event) {
    this.zoom_level *= 1.1;
    this.set_current_viewbox();
  };

  StageRenderer.prototype.mousedown = function(event) {
    this.mouse_down = true;
    this.playfield.css("cursor", "move");
    this.dragX = event.pageX;
    this.dragY = event.pageY;
    this.set_current_viewbox();
    event.stopPropagation();
  };

  StageRenderer.prototype.mouseup = function(event) {
    this.moveX = event.pageX;
    this.moveY = event.pageY;
    var origin = this.move_origin();
    this.originX = origin[0];
    this.originY = origin[1];
    this.mouse_down = false;
    this.set_current_viewbox();
    this.playfield.css("cursor", "default");
    event.stopPropagation();
  };

  StageRenderer.prototype.mousemove = function(event) {
    this.moveX = event.pageX;
    this.moveY = event.pageY;
    this.set_current_viewbox();
    event.stopPropagation();
  };

  StageRenderer.prototype.move_origin = function() {
    var oX = this.originX;
    var oY = this.originY;
    if (this.mouse_down) {
      oX -= (this.moveX - this.dragX) * this.zoom_level;
      oY -= (this.moveY - this.dragY) * this.zoom_level;
    }
    return [oX, oY];
  };

  StageRenderer.prototype.set_current_viewbox = function() {
    var origin = this.move_origin();
    this.set_viewbox(
      origin[0],
      origin[1],
      this.zoom_level * this.svg.width(),
      this.zoom_level * this.svg.height());
  };

  StageRenderer.prototype.set_viewbox = function(oX, oY, width, height) {
    var viewbox = [oX, oY, width, height].join(" ");
    this.svg.configure({viewBox: viewbox}, false);
  };

  StageRenderer.prototype.draw_patterns = function() {
    _.each(this.stage.flats, function(flat, name) {
      var canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      var ctx = canvas.getContext('2d');
      var image = ctx.createImageData(64, 64);
      image.data.set(_.flatten(_.map(flat, function(pixel) {
        return this.stage.palette[pixel];
      }.bind(this))));
      ctx.putImageData(image, 0, 0);
      var data_url = canvas.toDataURL("image/png");
      var pattern = this.svg.pattern(
        name, 0, 0,
        this.scaler.xlimits.coef * 64,
        this.scaler.ylimits.coef * 64,
        0, 0, 64, 64, {patternUnits: 'userSpaceOnUse'});
      this.svg.image(pattern, 0, 0, 64, 64, data_url);
    }.bind(this));
  };

  StageRenderer.prototype.draw_filled_sectors = function() {
    var all_polygons = _.flatten(_.map(this.stage.sectors, function(sector) {
      return _.map(sector.raw_polygons, function(polygon) {
        return {
          polygon: this.get_point_list(polygon),
          floor: sector.floor
        };
      }.bind(this));
    }.bind(this)));
    var sorter = new PolygonSorter(all_polygons);
    _.each(sorter.sort(all_polygons), function(polygon) {
      var points = _.map(polygon.polygon, function(point) {
        return [this.scaler.x(point.x), this.scaler.y(point.y)];
      }.bind(this));
      this.svg.polyline(points, {fill: 'url(#' + polygon.floor+ ')'});
    }.bind(this));
  };

  StageRenderer.prototype.get_point_list = function(polygon) {
    var cur = _.difference(polygon[0].vertexes, polygon[1].vertexes)[0];
    var points = [cur];
    _.each(_.initial(polygon), function(line) {
      cur = cur == line.begin ? line.end : line.begin;
      points.push(cur);
    });
    return _.map(points, function(point) {
      return this.stage.vertexes[point];
    }.bind(this));
  };

  StageRenderer.prototype.draw_lines = function() {
    var normal = {stroke: "lightgray", strokeWidth: 0.2};
    var secret = {strokeDashArray: "2, 2"};
    _.extend(secret, normal);
    _.each(this.stage.lines, function(line) {
      this.svg.line(this.svg.group(line.flags & 0x20 ? secret : normal),
               this.scaler.x(this.stage.vertexes[line.begin].x),
               this.scaler.y(this.stage.vertexes[line.begin].y),
               this.scaler.x(this.stage.vertexes[line.end].x),
               this.scaler.y(this.stage.vertexes[line.end].y));
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
    this.parse_palette(stage);
    this.parse_sectors(assets, stage);
    this.parse_flats(stage);
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

  Wad.prototype.parse_palette = function(stage) {
    var entry = _.find(this.directory, {name: 'PLAYPAL'});
    var raw_rgb = this.wad.getBytes(256 * 3, entry.start, true, true);
    var palette = _.map(_.range(256), function(i) {
      return [
        raw_rgb[i * 3 + 0],
        raw_rgb[i * 3 + 1],
        raw_rgb[i * 3 + 2],
        255
      ];
    });
    stage.push_palette(palette);
  };

  Wad.prototype.parse_flats = function(stage) {
    var start = _.findWhere(this.directory, {name: 'F_START'}).index;
    var flats = _.rest(this.directory, start);
    var unique_floors = _.uniq(_.pluck(stage.sectors, 'floor'));
    _.each(unique_floors, function(floor) {
      var entry = _.findWhere(flats, {name: floor});
      stage.push_flat(floor, this.wad.getBytes(
          entry.size, entry.start, true, true));
    }.bind(this));
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
      var before = _.now();
      stage.optimize();
      console.log(_.now() - before);
      var renderer = new StageRenderer(stage, svg);
      renderer.draw();
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
      }
    });
  }

  function ready() {
    load_wad();
  }

}());

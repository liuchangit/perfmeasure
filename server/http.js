var config = require('../conf/sys.js');

var sys = require("sys"),
	util = require("util"),
	step = require('step');

process.on('uncaughtException', function(error){
    console.log('uncaught exception: ' + (error && error.stack ? error.stack : error));
});

Array.prototype.fill = function(val, offset, len) {
    for (var i = offset; i < len; i++) {
        this[i] = val;
    }
}

/** initialize mongodb driver and define db access functions */

var mongodb = require('mongodb'),
	Db = mongodb.Db,
	Connection = mongodb.Connection,
	Server = mongodb.Server,
    ReplSet = mongodb.ReplSet;

var servers = [];
for (var i = 0; i < config.mongodb.servers.length; i++) {
    var hostport = config.mongodb.servers[i];
    var host = hostport.split(':')[0];
    var port = parseInt(hostport.split(':')[1]);
    servers.push(new Server(host, port, { auto_reconnect: true }));
}

console.log("Connecting to mongodb " + JSON.stringify(config.mongodb.servers));
var reps = new ReplSet(servers, { rs_name: config.mongodb.repl_set });
var db = new Db(config.mongodb.db_name, reps, {safe:true});
db.open(function(err, db){ if(err){console.log('open mongodb ' + err);} /*init();*/ });


/** initialize http server to provide web access */

var fu = require("./fu"),
    url = require("url"),
    qs = require("querystring"),
    perf = require("../conf/perf"),
    comutil = require("../computing/comutil");

fu.listen(Number(config.http.port), config.http.host);

fu.get("/", fu.staticHandler("html/index.html"));

fu.get("/menus", function (req, res) {
    var menus = perf.kpi_menus;
    res.simpleJSON(200, { 'menus': menus });
});

function latency_criteria(req, res) {
    var params = qs.parse(url.parse(req.url).query);
    var item = params.item;
    var rules = perf.rules;
    var modules = {};
    for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.precond.kpi != 'latency') {
            continue;
        }
        if (item == rule.precond.api) {
            var fields = rule.precond.field;
            for (var k = 0; k < fields.length; k++) {
                var field = fields[k];
                modules[field] = field.replace('_time', '');
            }
        }
    }
    res.simpleJSON(200, { 'modules': modules });
}

function throughput_criteria(req, res, kpi) {
    var rules = perf.rules;
    var modules = {};
    for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.precond.kpi != kpi) {
            continue;
        }
        modules[rule.precond.api] = rule.precond.api;
    }
    res.simpleJSON(200, { 'modules': modules });
}

function dispatch_qty_criteria(req, res) {
    var params = qs.parse(url.parse(req.url).query);
    var cat = params.cat;
    var options = [];
    options.push({'code': '', 'name': '全部'});
    if (cat == 'city') {
        step(function() {
                db.collection('metadata', this);
            },  
            function(err, collection) {
                var condition = {'key': 'city'};
                collection.findOne(condition, this);
            },
            function(err, data) {
                if (data) {
                    cities = data.value;
                    cities.forEach(function(city) {
                        options.push(city);
                    });
                }
                res.simpleJSON(200, { 'options': options });
                return 0;
            }
        );
    } else if (cat == 'product_type') {
        var product_types = perf.product_types;
        for (var k in product_types) {
            var opt = { 'code': k, 'name': product_types[k] };
            options.push(opt);
        }
        res.simpleJSON(200, { 'options': options });
    } else if (cat == 'car_type') {
        var car_types = perf.car_types;
        for (var k in car_types) {
            var opt = { 'code': k, 'name': car_types[k] };
            options.push(opt);
        }
        res.simpleJSON(200, { 'options': options });
    } else {
        res.simpleJSON(404, { 'error': '404' });
    }
}

fu.get("/criteria", function (req, res) {
    var params = qs.parse(url.parse(req.url).query);
    var kpi = params.kpi;
    if (kpi == 'latency') {
        latency_criteria(req, res);
    } else if (kpi == 'dispatch_qty') {
        dispatch_qty_criteria(req, res);
    } else if (kpi == 'throughput') {
        throughput_criteria(req, res, params.item);
    } else {
        res.simpleJSON(404, { 'error': '404' });
    }
});

fu.get("/period", function (req, res) {
    var params = qs.parse(url.parse(req.url).query);
    var api = params.api;
    var kpi = params.kpi;
    console.log('api:' + api + ' kpi:' + kpi);
    var all_periods = {'min1': '分钟', 'min5': '5分钟', 'min10': '10分钟', 'min60': '小时'};
    var periods = {};
    var rules = perf.rules;
    for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.precond.api == api && rule.precond.kpi == kpi) {
            for (var j = 0; j < rule.postcond.configs.length; j++) {
                var c = rule.postcond.configs[j];
                if (c in all_periods) {
                    periods[c] = all_periods[c];
                }
            }
            break;
        }
    }
    console.log(periods);
    res.simpleJSON(200, { 'periods': periods });
});

fu.get("/latency", function (req, res) {
    var params = qs.parse(url.parse(req.url).query);
    var api = params.api;
    var module = params.module;
    var period = params.period;
    var time = params.time;

    var interval = perf.kpi_config.timing[period].interval;
    var timerange = perf.kpi_config.timing[period].x_axis;
    var count = timerange / interval;
    var selectDt = comutil.parseTime(time);
    time = (selectDt.getTime()/1000) - timerange + interval;

    var timeoff = comutil.parseDateTime(time, interval);
    var datestart = timeoff[0];
    var timeoffset = timeoff[1];

    var tSelected = parseInt(selectDt.getTime()/1000);
    var timeoffSelected = comutil.parseDateTime(tSelected, interval);

    if (datestart < timeoffSelected[0]) {
        datestart = timeoffSelected[0];
        timeoffset = 0;
    }
    var labels = [];
    for (var i = 0; i < count; i++) {
        var d = comutil.parseTimeOffset(datestart, timeoffset+i, interval);
        labels.push(comutil.formatTime(d));
    }

    step(function() {
            db.collection('kpidata', this);
        },  
        function(err, collection) {
            var condition = {'kpi': 'latency', 'api': api, 'module': module, 'config': period, 'date': datestart, 'time_offset':{$gte:timeoffset}};
            collection.find(condition, this);
        },
        function(err, cursor) {
            cursor.toArray(this);
        },  
        function(err, samples) {
            var max = [], min = [], mean = [], p50 = [], p90 = [], p95 = [], p99 = [];
            max.fill(0, 0, count);
            min.fill(0, 0, count);
            mean.fill(0, 0, count);
            p50.fill(0, 0, count);
            p90.fill(0, 0, count);
            p95.fill(0, 0, count);
            p99.fill(0, 0, count);

            if (samples) {
                samples.forEach(function(sample) {
                    var idx = sample.time_offset - timeoffset;
                    if (idx >= 0 && idx < count) {
                        max[idx] = sample.max;
                        min[idx] = sample.min;
                        mean[idx] = sample.mean;
                        p50[idx] = sample.p50;
                        p90[idx] = sample.p90;
                        p95[idx] = sample.p95;
                        p99[idx] = sample.p99;
                    }
                
                });
            }

            var series = [];
            series.push({ name:'Max', data: max });
            series.push({ name:'Min', data: min });
            series.push({ name:'Mean', data: mean });
            series.push({ name:'50%', data: p50 });
            series.push({ name:'90%', data: p90 });
            series.push({ name:'95%', data: p95 });
            series.push({ name:'99%', data: p99 });

            res.simpleJSON(200, { 'data': {'labels': labels, 'series': series } });
            return 0;
        }
    );

});

fu.get("/dispatch_qty", function (req, res) {
    var params = qs.parse(url.parse(req.url).query);
    var item = params.item;
    var city = params.city;
    var product_type = params.product_type;
    var car_type = params.car_type;
    var datetime = params.datetime;
    var d = comutil.parseTime(datetime);

    var period = 'min10';
    var interval = perf.kpi_config.timing[period].interval;
    var timerange = perf.kpi_config.timing[period].x_axis;
    var count = timerange / interval;
    var time = d.getTime()/1000;
    var timeoffnow = comutil.parseDateTime(time, interval);
    time = time - timerange + interval;
    var timeoff = comutil.parseDateTime(time, interval);
    var datestart = timeoff[0];
    var timeoffset = timeoff[1];
    if (datestart < timeoffnow[0]) {
        datestart = timeoffnow[0];
        timeoffset = 0;
    }

    var labels = [];
    for (var i = 0; i < count; i++) {
        var d = comutil.parseTimeOffset(datestart, timeoffset+i, interval);
        labels.push(comutil.formatTime(d));
    }

    //datestart = 1424880000;   //test
    //timeoffset = 60;
    var components = perf.kpi_components.dispatch_qty[item];
    var cond = {'kpi': 'dispatch_qty', 'item': {$in: components}, 'config': period, 'date': datestart, 'time_offset': {$gte:timeoffset}};
    var group_keys = {'item': '$item', 'time_offset': '$time_offset' };
    if (city && city != '' && city != 'null' && city != 'undefined') {
        cond.city = city;
        //group_keys.city = '$city';
    }
    if (product_type && product_type != '' && product_type != 'null' && product_type != 'undefined') {
        cond.product_type_id = parseInt(product_type);
        //group_keys.product_type_id = '$product_type_id';
    }
    if (item == 'driver_accept_ratio' && car_type && car_type != '' && car_type != 'null' && car_type != 'undefined') {
        cond.car_type_id = parseInt(car_type);
        //group_keys.car_type_id = '$car_type_id';
    }
    //console.log(cond);
    step(function() {
            db.collection('kpidata', this);
        },  
        function(err, collection) {
            collection.aggregate([{$match: cond}, {$group: {_id: group_keys, total: {$sum: '$count'}}}, {$sort:{_id:1}}], this);
        },
        function(err, samples) {
            console.log(samples);
            var comp0 = [], comp1 = [], ratio = [];
            comp0.fill(0, 0, count);
            comp1.fill(0, 0, count);
            ratio.fill(0, 0, count);

            if (samples) {
                samples.forEach(function(sample) {
                    var idx = sample._id.time_offset - timeoffset;
                    if (idx >= 0 && idx < count) {
                        if (sample._id.item == components[0]) {
                            comp0[idx] = sample.total;
                        } else {
                            comp1[idx] = sample.total;
                        }
                    }
                });
            }
            for (var i = 0; i < count; i++) {
                ratio[i] = (comp0[i] == 0 ? 0 : Number((comp1[i]*100.0/comp0[i]).toFixed(1)));
            }

            var series = [];
            series.push({ name:item.replace(/_/g, ' '), data: ratio });

            res.simpleJSON(200, { 'data': {'labels': labels, 'series': series } });
            return 0;
        }
    );

});

fu.get("/throughput", function (req, res) {
    var params = qs.parse(url.parse(req.url).query);
    var kpi = params.kpi;
    var api = params.api;
    var period = params.period;
    var datetime = params.datetime;
    var d = comutil.parseTime(datetime);

    var interval = perf.kpi_config.timing[period].interval;
    var timerange = perf.kpi_config.timing[period].x_axis;
    var count = timerange / interval;

    //if (!time || time == 'null') {
    time = parseInt(d.getTime()/1000) - timerange + interval;
    //}
    
    var timeoff = comutil.parseDateTime(time, interval);
    var datestart = timeoff[0];
    var timeoffset = timeoff[1];

    var tnow = parseInt(d.getTime()/1000);
    var timeoffnow = comutil.parseDateTime(tnow, interval);
    if (datestart < timeoffnow[0]) {
        datestart = timeoffnow[0];
        timeoffset = 0;
    }
    var labels = [];
    for (var i = 0; i < count; i++) {
        var d = comutil.parseTimeOffset(datestart, timeoffset+i, interval);
        labels.push(comutil.formatTime(d));
    }

    step(function() {
            db.collection('kpidata', this);
        },  
        function(err, collection) {
            var condition = {'kpi': kpi, 'api': api, 'config': period, 'date': datestart, 'time_offset':{$gte:timeoffset}};
            collection.find(condition, this);
        },
        function(err, cursor) {
            cursor.toArray(this);
        },  
        function(err, samples) {
            var cnt = [];
            cnt.fill(0, 0, count);

            if (samples) {
                samples.forEach(function(sample) {
                    var idx = sample.time_offset - timeoffset;
                    if (idx >= 0 && idx < count) {
                        cnt[idx] = sample.count;
                    }
                });
            }

            var series = [];
            var nm = '';
            if (kpi == 'slow_tranx') {
                nm = 'Slow Tranx';
            } else if (kpi == 'ops') {
                nm = '';
            }
            series.push({ name: nm, data: cnt });

            res.simpleJSON(200, { 'data': {'labels': labels, 'series': series } });
            return 0;
        }
    );

});

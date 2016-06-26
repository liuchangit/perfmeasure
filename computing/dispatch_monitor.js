
var config = require('../conf/sys.js');
var perf = require('../conf/perf.js');
var comutil = require('./comutil.js');

var LatencyCalculator = require('./calc/LatencyCalculator.js').LatencyCalculator;

var sys = require("sys"),
	util = require("util"),
	step = require('step');

process.on('uncaughtException', function(error){
    console.log('uncaught exception: ' + (error && error.stack ? error.stack : error));
});

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
var mongodb = new Db(config.mongodb.db_name, reps, {safe:true});
mongodb.open(function(err, db){ if(err){console.log('open mongodb ' + err);} /*init();*/ });

function savedata(data, callback) {
    //console.log(JSON.stringify(data));
	step(function() {
            mongodb.collection('kpidata', this);
        },  
        function(err, collection) {
            collection.insert(data, this);
        },
        function(err, result) {
            callback(err, result);
        }
	);
}

function savemeta(data, callback) {
	step(function() {
            mongodb.collection('metadata', this);
        },  
        function(err, collection) {
            collection.insert(data, this);
        },
        function(err, result) {
            callback(err, result);
        }
	);
}

/* query from mysql */
var mysql = require('mysql');

var connection = mysql.createConnection(config.mysql);

var tnow = comutil.now();
var conf = perf.kpi_config.timing.min10;
var interval = conf.interval;
var datetime = comutil.parseDateTime(tnow, interval);
var endTime = datetime[0] + interval*datetime[1];
var startTime = endTime - interval;

/* stats dispatch drivers */
var sql = 'select dsd.city, dsd.product_type_id, c.car_type_id, count(1) as count from '
    + '(select ds.*, dd.driver_id, dd.accept_status from '
    + '  (select s.service_order_id, s.city, s.product_type_id, d.round from yc_dispatch.dispatch_history d '
    + '    inner join yc_core.service_order s on d.round=1 and d.dispatch_time >= ? and d.dispatch_time < ? and s.product_type_id<9 and d.service_order_id=s.service_order_id) ds '
    + '  inner join (select driver_id,accept_status,service_order_id from yc_dispatch.dispatch_detail where round = 1 and dispatch_time >= ?) dd on ds.service_order_id=dd.service_order_id) dsd '
    + ' inner join yc_crm_common.device_driver_car c on dsd.driver_id=c.driver_id group by dsd.city, dsd.product_type_id, c.car_type_id;';
connection.query(sql, [startTime, endTime, startTime], function(err, rows) {
    if (err) {
        console.log('error querying mysql:' + err.stack);
    } else {
        var records = [];
        rows.forEach(function(row) {
            var city = row.city.toString();
            var product_type_id = row.product_type_id;
            var car_type_id = row.car_type_id;
            var count = row.count;
            var r = {'kpi': 'dispatch_qty', 'item': 'dispatch_drivers', 'config': 'min10', 'date': datetime[0], 'time_offset': datetime[1], 'city': city, 'product_type_id': product_type_id, 'car_type_id': car_type_id, 'count': count };
            records.push(r);
        });
        //console.log(records);
        savedata(records, function(err, result) {
            if (err) {
                console.log('error insert dispatch_drivers into mysql:' + err.stack);
            } else {
                console.log('insert ' + result.length + ' dispatch_drivers into mangodb');
            }
        });
    }
});

/* stats accept drivers */
var sql = 'select dsd.city, dsd.product_type_id, c.car_type_id, count(1) as count from '
    + '(select ds.*, dd.driver_id, dd.accept_status from '
    + '  (select s.service_order_id, s.city, s.product_type_id, d.round from yc_dispatch.dispatch_history d '
    + '    inner join yc_core.service_order s on d.round=1 and d.dispatch_time >= ? and d.dispatch_time < ? and s.product_type_id<9 and d.service_order_id=s.service_order_id) ds '
    + '  inner join (select * from yc_dispatch.dispatch_detail where round=1 and accept_status=1 and dispatch_time >= ?) dd on ds.round = dd.round and ds.service_order_id=dd.service_order_id) dsd '
    + ' inner join yc_crm_common.device_driver_car c on dsd.driver_id=c.driver_id group by dsd.city, dsd.product_type_id, c.car_type_id;';
connection.query(sql, [startTime, endTime, startTime], function(err, rows) {
    if (err) {
        console.log('error querying mysql:' + err);
    } else {
        var records = [];
        rows.forEach(function(row) {
            var city = row.city.toString();
            var product_type_id = row.product_type_id;
            var car_type_id = row.car_type_id;
            var count = row.count;
            var r = {'kpi': 'dispatch_qty', 'item': 'accept_drivers', 'config': 'min10', 'date': datetime[0], 'time_offset': datetime[1], 'city': city, 'product_type_id': product_type_id, 'car_type_id': car_type_id, 'count': count };
            records.push(r);
        });
        //console.log(records);
        savedata(records, function(err, result) {
            if (err) {
                console.log('error insert accept drivers into mysql:' + err.stack);
            } else {
                console.log('insert ' + result.length + ' accept drivers into mangodb');
            }
        });
    }
});

/* stats selection orders */
var sql = 'select s.city, s.product_type_id, count(1) as count '
        + ' from yc_dispatch.dispatch_history d, yc_core.service_order s '
        + ' where d.round=1 and d.dispatch_time >= ? and d.dispatch_time < ? and s.product_type_id<9 '
        + '  and d.service_order_id=s.service_order_id '
        + ' group by s.city, s.product_type_id;';
connection.query(sql, [startTime, endTime], function(err, rows) {
    if (err) {
        console.log('error querying mysql:' + err);
    } else {
        var records = [];
        rows.forEach(function(row) {
            var city = row.city.toString();
            var product_type_id = row.product_type_id;
            var count = row.count;
            var r = {'kpi': 'dispatch_qty', 'item': 'select_orders', 'config': 'min10', 'date': datetime[0], 'time_offset': datetime[1], 'city': city, 'product_type_id': product_type_id, 'count': count };
            records.push(r);
        });
        //console.log(records);
        savedata(records, function(err, result) {
            if (err) {
                console.log('error insert select orders into mysql:' + err.stack);
            } else {
                console.log('insert ' + result.length + ' select orders into mangodb');
            }
        });
    }
});

/* stats dispatch orders */
var sql = 'select s.city, s.product_type_id, count(1) as count '
        + ' from yc_dispatch.dispatch_history d, yc_core.service_order s '
        + ' where d.round=1 and d.dispatch_time >= ? and d.dispatch_time < ? and s.product_type_id<9 '
        + '  and d.service_order_id=s.service_order_id and d.dispatch_count>0 '
        + ' group by s.city, s.product_type_id;';
connection.query(sql, [startTime, endTime], function(err, rows) {
    if (err) {
        console.log('error querying mysql:' + err);
    } else {
        var records = [];
        rows.forEach(function(row) {
            var city = row.city.toString();
            var product_type_id = row.product_type_id;
            var count = row.count;
            var r = {'kpi': 'dispatch_qty', 'item': 'dispatch_orders', 'config': 'min10', 'date': datetime[0], 'time_offset': datetime[1], 'city': city, 'product_type_id': product_type_id, 'count': count };
            records.push(r);
        });
        //console.log(records);
        savedata(records, function(err, result) {
            if (err) {
                console.log('error insert dispatch orders into mysql:' + err.stack);
            } else {
                console.log('insert ' + result.length + ' dispatch orders into mangodb');
            }
        });
    }
});

/* stats accept orders */
var sql = 'select s.city, s.product_type_id, count(1) as count '
        + ' from yc_dispatch.dispatch_history d, yc_core.service_order s '
        + ' where d.round=1 and d.dispatch_time >= ? and d.dispatch_time < ? and s.product_type_id<9 '
        + '  and d.service_order_id=s.service_order_id and d.accept_count>0 '
        + ' group by s.city, s.product_type_id;';
connection.query(sql, [startTime, endTime], function(err, rows) {
    if (err) {
        console.log('error querying mysql:' + err);
    } else {
        var records = [];
        rows.forEach(function(row) {
            var city = row.city.toString();
            var product_type_id = row.product_type_id;
            var count = row.count;
            var r = {'kpi': 'dispatch_qty', 'item': 'accept_orders', 'config': 'min10', 'date': datetime[0], 'time_offset': datetime[1], 'city': city, 'product_type_id': product_type_id, 'count': count };
            records.push(r);
        });
        //console.log(records);
        savedata(records, function(err, result) {
            if (err) {
                console.log('error insert accept orders into mysql:' + err.stack);
            } else {
                console.log('insert ' + result.length + ' accept orders into mangodb');
            }
        });
    }
});

/* query city */
/*
var sql = "select cn, short from yc_crm_common.base_region where short is not null and short != '' and code!=710000 and parent_code!=710000;";
connection.query(sql, function(err, rows) {
    if (err) {
        console.log('error querying mysql:' + err);
    } else {
        var records = [];
        rows.forEach(function(row) {
            var city = row.short.toString();
            var name = row.cn.toString();
            var r = {'code': city, 'name': name };
            records.push(r);
        });
        //console.log(records);
        var citydata = { 'key': 'city', 'value': records };
        savemeta(citydata, function(err, result) {
            if (err) {
                console.log('error insert city data into mysql:' + err.stack);
            } else {
                console.log('insert ' + records.length + ' cities into mangodb');
            }
        });
    }
});
*/

/* stats escape orders */
var sql = 'select s.city, s.product_type_id, count(1) as count '
        + ' from yc_dispatch.dispatch_history d, yc_core.service_order s '
        + ' where d.round=1 and d.dispatch_time >= ? and d.dispatch_time < ? and s.product_type_id<9 '
        + '  and d.service_order_id=s.service_order_id and d.accept_count>0 and s.driver_id is null '
        + ' group by s.city, s.product_type_id;';
connection.query(sql, [startTime, endTime], function(err, rows) {
    if (err) {
        console.log('error querying mysql:' + err);
    } else {
        var records = [];
        rows.forEach(function(row) {
            var city = row.city.toString();
            var product_type_id = row.product_type_id;
            var count = row.count;
            var r = {'kpi': 'dispatch_qty', 'item': 'escape_orders', 'config': 'min10', 'date': datetime[0], 'time_offset': datetime[1], 'city': city, 'product_type_id': product_type_id, 'count': count };
            records.push(r);
        });
        //console.log(records);
        savedata(records, function(err, result) {
            if (err) {
                console.log('error insert escape orders into mysql:' + err.stack);
            } else {
                console.log('insert ' + result.length + ' escape orders into mangodb');
            }
        });
    }
});

var sql = 'select arrival_time-create_time as arrival_cost from yc_core.service_order where is_asap=1 and create_time >= ? and create_time < ? and create_time is not null and arrival_time is not null and arrival_time > create_time;'
connection.query(sql, [startTime, endTime], function(err, rows) {
    if (err) {
        console.log('error querying mysql:' + err);
    } else {
        var records = [];
        rows.forEach(function(row) {
            var arrival_cost = row.arrival_cost;
            records.push(arrival_cost);
        });

        var conf = 'min10';
        var interval = perf.kpi_config.timing[conf].interval;
        var config = { api: 'arrival_cost', field: 'arrival_cost', name: conf, interval: interval };
        var calc = new LatencyCalculator(config);
        var rs = calc.calc(records, endTime);
        //console.log(records);
        savedata(rs, function(err, result) {
            if (err) {
                console.log('error insert arrival cost into mysql:' + err.stack);
            } else {
                console.log('insert ' + result.length + ' arrival cost into mangodb');
            }
        });
    }
});

/* close db connection */
connection.end(function(){
    mongodb.close();
});



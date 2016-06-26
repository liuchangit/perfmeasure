var config = require('../conf/sys.js');

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
var db = new Db(config.mongodb.db_name, reps, {safe:true});
db.open(function(err, db){ if(err){console.log('open mongodb ' + err);} /*init();*/ });

function savedata(data) {
    //console.log(JSON.stringify(data));
	step(function() {
            db.collection('kpidata', this);
        },  
        function(err, collection) {
            collection.insert(data, function(err, c) {});
        	collection.count(function(err, count) { });
        }
	);
}


/** initialize rabbitmq, accept perf data, computing */
var perf = require('../conf/perf.js'),
    calcs = require('./calculator.js'),
    LatencyCalculator = calcs.LatencyCalculator,
    SlowTranxCalculator = calcs.SlowTranxCalculator,
    OPSCalculator = calcs.OPSCalculator;

function initCalculator() {
    var processors = new Object();
    var rules = perf.rules;
    var kpi_config = perf.kpi_config;
    for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        var precond = r.precond;
        var postcond = r.postcond;
        var api = precond.api;
        var kpi = precond.kpi;
        var fields = precond.field;
        var test = precond.test;
        var config_type = postcond.config_type;
        configs = postcond.configs;
        var fcalcs = new Object();
        for (var j = 0; j < fields.length; j++) {
            var f = fields[j];
            var calcs = new Array();
            for (var k = 0; k < configs.length; k++) {
                var conf = configs[k];
                var cfg = kpi_config[config_type][conf];
                var c = { 'api': precond.api, 'field': f, 'name': conf, 'interval': cfg.interval };
                var calc = getCalculator(kpi, c);
                if (calc != null) {
                    calcs.push({'test': test, 'calc': calc});
                }
            }
            fcalcs[f] = calcs;
        }
        if (!(api in processors)) {
            processors[api] = new Object();
        }
        processors[api][kpi] = fcalcs;
    }
    return processors;
}

function getCalculator(kpi, conf) {
    var calc = null;
    if (kpi == 'latency') {
        calc = new LatencyCalculator(conf, savedata);
    } else if (kpi == 'slow_tranx') {
        conf.threshold = 2000;
        calc = new SlowTranxCalculator(conf, savedata);
    } else if (kpi == 'ops') {
        calc = new OPSCalculator(conf, savedata);
    }
    return calc;
}

function msg_test(msg, test) {
    for (var k in test) {
        if (!msg[k] || msg[k] != test[k]) {
            return false;
        }
    }
    return true;
}

var processors = initCalculator();

var amqp = require('amqp');
var connection = amqp.createConnection(config.rabbitmq);
connection.on('ready', function() {
    console.log('amqp connection is ready');  
    connection.queue('perf.msg', { durable: true, autoDelete: false }, function (queue) {
        console.log('Queue ' + queue.name + ' is open!');  
        queue.subscribe({ ack: false }, function (message, header, deliveryInfo) {  
            if (message.data) {
                var messageText = message.data.toString();  
                //console.log(messageText);  
                var msg = JSON.parse(messageText);
                var api = msg.api;
                if (!processors[api]) {
                    console.log('doesnt config processer for api:' + api);
                    return;
                }
                var tmp = processors[api];
                for (kpi in tmp) {
                    for (var f in tmp[kpi]) {
                        if (msg[f] == null) {
                            continue;
                        }
                        var calcs = tmp[kpi][f];
                        for (var k = 0; k < calcs.length; k++) {
                            var calc = calcs[k].calc;
                            var test = calcs[k].test;
                            if (msg_test(msg, test)) {
                                calc.add(msg);
                            }
                        }
                    }
                }
            } 
        });
    });
});

connection.on('error', function(err) {
    console.log('connection error:' + err.stack);
});

connection.on('close', function(err) {
    console.log('connection is closed');
});


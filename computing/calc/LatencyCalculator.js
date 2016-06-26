var comutil = require('../comutil');

function LatencyCalculator(config, callback) {
    this.config = config;
    this.api = config.api;
    this.field = config.field;
    this.config_name = config.name;
    this.interval= config.interval;
    this.cb = callback;
    this.cleanup();
}

LatencyCalculator.prototype.cleanup = function() {
    this.arr = new Array();
    this.total = 0;
    this.time = comutil.now();
};

LatencyCalculator.prototype.calc = function(arr, tnow) {
    sort(arr);
    var count = arr.length;
    if (count == 0) {
        return null;
    }
    var max = arr[count - 1];
    var min = arr[0];
    var mean = parseInt(this.total/count);
    var p50 = arr[Math.round((count-1)*0.5)];
    var p90 = arr[Math.round((count-1)*0.9)];
    var p95 = arr[Math.round((count-1)*0.95)];
    var p99 = arr[Math.round((count-1)*0.99)];
    var dt = this.getDateTime(tnow);
    var rs = {
        'kpi': 'latency',
        'api': this.api,
        'module': this.field,
        'config': this.config_name,
        'date': dt[0],
        'time_offset': dt[1],
        'max': max,
        'min': min,
        'mean': mean,
        'p50': p50,
        'p90': p90,
        'p95': p95,
        'p99': p99,
    };
    return rs;
};

LatencyCalculator.prototype.getDateTime = function(tnow) {
    return comutil.parseDateTime(tnow, this.interval);
}

LatencyCalculator.prototype.add = function(data) {
    if(!data || !data[this.field]) {
        return;
    }
    var tnow = comutil.now();
    if (((tnow % this.interval) == 0 && tnow - this.time > 0) || (tnow - this.time >= this.interval)) {
        var kpidata = this.calc(this.arr, tnow);
        if (kpidata != null) {
            this.cb(kpidata);
        }
        this.cleanup();
        this.time = tnow;
    }
    var value = data[this.field];
    this.arr.push(value);
    this.total += value;
};

function sort(arr) {
    qsort(arr, 0 , arr.length-1);
}

function qsort(arr, start, end) {
    if (start >= end) {
        return;
    }
    var i = start, j = end, privot = arr[end];
    while (i<j) {
        while (i<j && arr[i] <= privot) { i++; }
        arr[j] = arr[i];
        while (i<j && arr[j] > privot) { j--; }
        arr[i] = arr[j];
    }
    arr[j] = privot;
    qsort(arr, start, i-1);
    qsort(arr, i+1, end);
}

exports.LatencyCalculator = LatencyCalculator;

/*
var time = comutil.now();
function sleep(s) {
    var a = 0;
    while(true) {
        if (comutil.now() - time >= s) {
            return a;
        }
        a++;
    }
    return a;
}

var config = { 'api': 'dispatch_auto', 'field': 'time', 'name': 'min5', 'interval': 5 };
var callback = function(data) {
    console.log(data);
};
var calc = new LatencyCalculator(config, callback);
for (var i = 1; i < 10000; i++) {
    calc.add({'time': i+200});
}
sleep(2);

*/


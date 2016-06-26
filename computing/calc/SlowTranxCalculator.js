var comutil = require('../comutil');

function SlowTranxCalculator(config, callback) {
    this.config = config;
    this.api = config.api;
    this.field = 'trans_time';
    this.threshold = config.threshold;
    this.config_name = config.name;
    this.interval= config.interval;
    this.cb = callback;
    this.cleanup();
}

SlowTranxCalculator.prototype.cleanup = function() {
    this.count = 0;
    this.time = comutil.now();
}

SlowTranxCalculator.prototype.add = function(data) {
    if(!data || !data[this.field]) {
        return;
    }
    var tnow = comutil.now();
    if (((tnow % this.interval) == 0 && tnow - this.time > 0) || (tnow - this.time >= this.interval)) {
        var kpidata = this.calc(this.count, tnow);
        console.log(kpidata);
        if (kpidata != null) {
            this.cb(kpidata);
        }
        this.cleanup();
        this.time = tnow;
    }
    var value = data[this.field];
    if (value >= this.threshold) {
        this.count++;
    }
};

SlowTranxCalculator.prototype.calc = function(count, tnow) {
    var dt = comutil.parseDateTime(tnow, this.interval);
    var rs = {
        'kpi': 'slow_tranx',
        'api': this.api,
        'config': this.config_name,
        'date': dt[0],
        'time_offset': dt[1],
        'count': count,
    };
    return rs;
};

exports.SlowTranxCalculator = SlowTranxCalculator;


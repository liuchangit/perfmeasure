var comutil = require('../comutil');

function OPSCalculator(config, callback) {
    this.config = config;
    this.api = config.api;
    this.field = 'trans_time';
    this.config_name = config.name;
    this.interval= config.interval;
    this.cb = callback;
    this.cleanup();
}

OPSCalculator.prototype.cleanup = function() {
    this.count = 0;
    this.time = comutil.now();
}

OPSCalculator.prototype.add = function(data) {
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
    this.count++;
};

OPSCalculator.prototype.calc = function(count, tnow) {
    var dt = comutil.parseDateTime(tnow, this.interval);
    var ops = count/this.interval; //the value is too small now
    var rs = {
        'kpi': 'ops',
        'api': this.api,
        'config': this.config_name,
        'date': dt[0],
        'time_offset': dt[1],
        'count': count,
        'ops': ops,
    };
    return rs;
};

exports.OPSCalculator = OPSCalculator;


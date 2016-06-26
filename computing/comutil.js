
exports.parseDateTime = function(t, interval) {
    var d = new Date();
    d.setTime(t*1000);
    d.setHours(0);
    d.setMinutes(0);
    d.setSeconds(0);
    var date_start = parseInt(d.getTime()/1000);
    var time_offset = parseInt(((t-date_start)/interval));
    return [date_start, time_offset];
}

exports.parseTimeOffset = function(date_start, time_offset, interval) {
    var time =  parseInt(date_start) + parseInt(time_offset)*parseInt(interval);
    var d = new Date();
    d.setTime(time*1000);
    return d;
}

exports.formatTime = function(date) {
    var hour = date.getHours();
    var minute = date.getMinutes();
    minute = (minute < 10 ? '0' : '') + minute;
    return hour + ":" + minute;
}

exports.parseTime = function(timeStr, pattern) {
    //pattern is hard code yyyy-MM-dd HH:mm
    var arr = timeStr.split(/[- :]/);
    var d = new Date(arr[0], parseInt(arr[1])-1, arr[2], arr[3], arr[4], 00);
    return d;
}

/* return timestamp by seconds */
exports.now = function() {
    var t = new Date().getTime();
    return parseInt(t / 1000);
}


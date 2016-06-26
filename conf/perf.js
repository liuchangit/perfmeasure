
var rules = [
    { precond: {'api':'selection_auto', 'kpi':'latency', test:{'success': true}, 'field':['total_time', 'select_time', 'filter_time', 'rank_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'selection_manually', 'kpi':'latency', test:{'success': true}, 'field':['total_time', 'select_time', 'filter_time', 'rank_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'dispatch_auto', 'kpi':'latency', test:{'success': true}, 'field':['total_time', 'init_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'dispatch_manually', 'kpi':'latency', test:{'success': true}, 'field':['total_time', 'init_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'decision_system', 'kpi':'latency', test:{'success': true}, 'field':['total_time', 'init_time', 'decision_time', 'callback_time', 'updateDispatch_time', 'insurance_time', 'addCalendar_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'decision_user', 'kpi':'latency', test:{'success': true}, 'field':['total_time', 'init_time', 'decision_time', 'bind_time', 'updateDispatch_time', 'insurance_time', 'addCalendar_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'arrival_cost', 'kpi':'latency', 'field':['arrival_cost']}, postcond: { 'config_type':'timing', 'configs':['min10']} },
    { precond: {'api':'selection_auto', 'kpi':'slow_tranx', 'field':['trans_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'dispatch_auto', 'kpi':'slow_tranx', 'field':['trans_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'decision_system', 'kpi':'slow_tranx', 'field':['trans_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'selection_auto', 'kpi':'ops', 'field':['trans_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'dispatch_auto', 'kpi':'ops', 'field':['trans_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
    { precond: {'api':'decision_system', 'kpi':'ops', 'field':['trans_time']}, postcond: { 'config_type':'timing', 'configs':['min1', 'min5', 'min60']} },
];

var kpi_menus = [
    { 'kpi': 'latency', 'text': '延时', 'items': [
        {'key': 'selection_auto', 'text': '自动选车', 'desc': '自动派车时，获取待派发车辆的耗时'}, 
        {'key':'selection_manually', 'text':'手动选车', 'desc': '手动派车时，获取候选车辆的耗时'}, 
        {'key':'dispatch_auto', 'text':'自动派车', 'desc': '自动派车时，为订单派发车辆的耗时'}, 
        {'key': 'dispatch_manually', 'text':'手动派车', 'desc': '手动派车的耗时'}, 
        {'key':'decision_system', 'text':'系统决策', 'desc': '系统决策的耗时'}, 
        {'key':'decision_user', 'text':'用户决策', 'desc': '用户决策的耗时'}, 
        {'key': 'arrival_cost', 'text': '派到时间距', 'desc': '从下单/派单开始时刻到司机到达时刻的时间差'}]},
    { 'kpi': 'throughput', 'text': '吞吐', 'items': [
        {'key': 'ops', 'text': '吞吐量', 'desc': '某时段内订单总量'}, 
        {'key': 'slow_tranx', 'text': '慢事务', 'desc': '耗时>2s的事务'}]},
    { 'kpi': 'dispatch_qty', 'text': '派单转化率', 'items': [
        {'key':'driver_accept_ratio', 'text':'派单响应率', 'desc': '接单司机数/派发司机数'}, 
        {'key':'order_dispatched_ratio', 'text': '派单成功率', 'desc': '(派发订单数 - 无车可派订单数)/派发订单数'}, 
        {'key':'order_accepted_ratio', 'text': '接单成功率', 'desc': '有司机接单的订单数/已派出车辆的订单数'}, 
        {'key':'user_escape_ratio', 'text':'用户逃单率', 'desc': '用户未选车的订单数/有司机接单的订单数'}]},
];

var kpi_config = {
    'timing': {
        min1: {
            'interval': 60,         //computing once per minute
            'x_axis': 20*60,    //show 20 minutes range on the x axis
            'y_axis': 100,    //show max value 100 on the y axis

        },
        min5: {
            'interval': 5*60,       //5 min
            'x_axis': 2*60*60,    //show 2 hours range on the x axis
            'y_axis': 100,    //show max value 100 on the y axis
        },
        min10: {
            'interval': 10*60,       //5 min
            'x_axis': 2*60*60,    //show 2 hours range on the x axis
            'y_axis': 100,    //show max value 100 on the y axis
        },
        min60: {
            'interval': 60*60,          //1 hour
            'x_axis': 24*60*60,    //show 24 hours range on the x axis
            'y_axis': 100,    //show max value 100 on the y axis
        },
    },
};

var product_types = {
    1:  '时租-包时',
    2:  '时租-包行程',
    3:  '整租-按日',
    4:  '整租-按周',
    5:  '整租-按月',
    6:  '整租-按年',
    7:  '定价-接机',
    8:  '定价-送机',
};

var car_types = {
    1: '经济车型',
    2: '舒适车型',
    3: '豪华车型',
    4: '奢华车型',
    5: '商务车型',
};

var kpi_components = {
    'dispatch_qty': {
       'driver_accept_ratio': ['dispatch_drivers', 'accept_drivers'], 
       'order_dispatched_ratio': ['select_orders', 'dispatch_orders'], 
       'order_accepted_ratio': ['dispatch_orders', 'accept_orders'], 
       'user_escape_ratio': ['accept_orders', 'escape_orders'], 
    },
};

exports.rules = rules;
exports.kpi_config = kpi_config;
exports.kpi_menus = kpi_menus;
exports.product_types = product_types;
exports.car_types = car_types;
exports.kpi_components = kpi_components;

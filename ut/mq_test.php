<?php

function __autoload($clazz) {
    $file = str_replace('_', '/', $clazz);
    if (is_file("/usr/share/pear/$file.php"))
        require "/usr/share/pear/$file.php";
}

$config = new Zend_Config(require(__DIR__ . '/config.inc.php'));
Zend_Registry::set('config', $config);

require_once(__DIR__ . '/../client/MessageQueue.php');

$perfmq = new Perf_MessageQueue($config->rabbitmq->perf->toArray());
$msg = array();
$msg['api'] = 'dispatch';
$msg['order_id'] = 1111;
$msg['city'] = 'bj';
$msg['time'] = time();
$msg['total_time'] = 111;

$perfmq->push(json_encode($msg));

$perfmq->consume(function($key, $msg){
    var_dump($msg);
});

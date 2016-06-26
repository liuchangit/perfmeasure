<?php


class Perf_Client {
    private $_connection;
    private $_enable;
    private $_msg;
    

    public function __construct($connection, $enable = true) {
        $this->_connection = $connection;
        $this->_enable = $enable;
    }

    public function perfMsgInit($api) {
        if (!$this->perfEnabled()) {
            return;
        }
        $this->_msg = array();
        $this->_msg['api'] = $api;
        $this->_msg['ip'] = $this->getHostIp();
        $this->_msg['timestamp'] = time();
        return $this->_msg;
    }

    public function perfMsgPut($key, $value) {
        if (!$this->perfEnabled()) {
            return;
        }
        $this->_msg[$key] = $value;
        return $this->_msg;
    }

    public function perfMsgSend() {
        if (!$this->perfEnabled()) {
            return;
        }
        
        $mq = new Perf_MessageQueue($this->_connection);
        return $mq->push(json_encode($this->_msg));
    }

    public function perfMsgGet() {
        return $this->_msg;
    }

    private function getHostIp() {
        //$ip = `/sbin/ifconfig -a | /bin/grep 'inet addr' | /bin/awk '{print $2}' | /bin/awk -F':' '{print $2}' | /bin/grep -v '127'`;
        //$ip = explode("\n", $ip)[0];
        $ip = gethostbyname(getenv('HOSTNAME'));
        return $ip;
    }

    private function perfEnabled() {
        return $this->_enable;
    }

}

/*
$client = new Perf_Client();
$client->perfMsgInit('dispatch');
$client->perfMsgPut('total_time', 113);
$client->perfMsgPut('city', 'bj');
$client->perfMsgPut('order_id', 11833);
$client->perfMsgPut('decision_time', 211);
$msg = $client->perfMsgGet();
echo json_encode($msg) . "\n";
*/


<?php

class Perf_MessageQueue {

    // 连接
    private $_connection = null;
    // 通道
    private $_channel = null;
    // 队列
    private $_queueList = null;

    private $_lastMsg = null;

    const MESSAGE_PERSISTENT_MODE = 2;
    const DEFAULT_PORT = 5672;

    private static $_queueName = 'perf.msg';
    private static $_routingKey = 'perf';


    public function __construct($connection) {
        $config = array(
            "connection" => $connection,
            "exchange" => array(
                "name" => "amq.direct",
                "type" => AMQP_EX_TYPE_DIRECT,
                "flag" => AMQP_DURABLE
            ),
            "queue" => array(
                array(
                    "name" => self::$_queueName,
                    'exchange_name' => 'amq.direct',
                    "routing_key" => array(
                        self::$_routingKey,
                    ),
                ),  
            ),  
        );

        $this->_initConnection($config['connection']);
        $this->_initExchange($config['exchange']);
        $this->_initQueue($config['queue']);
    }


    private function _initConnection($config) {
        if(!isset($config['host'])) {
            throw new Queue_Exception("connection config host is missing"); 
        }
        $hosts = is_array($config['host']) ? $config['host'] : array($config['host']);
        
        $is_connected = false;
        $connection = null;

        //轮询可用服务器
        foreach ($hosts as $host) {
            $options = array(
                'host' => $host,
                'port' => isset($config['port']) ? $config['port'] : self::DEFAULT_PORT,
                'login' => $config['login'],
                'password' => $config['password'],
                'vhost' => $config['vhost']
            );
            $connection = new AMQPConnection($options);
            try {
                $is_connected = $connection->connect();
                if ($is_connected) {
                    $this->_connection = $connection;
                    break;
                }           
            } catch(Exception $e) {
                error_log(__FILE__.":".__LINE__."-".$e->getMessage());
            }
        }

        if (!$is_connected) {
            throw new Queue_Exception("Connect to queue service failed");
        }

        //create a channel
        $this->_channel = new AMQPChannel($this->_connection);
    }

    private function _initExchange($config) {
        //only support 'direct' 'fanout' 'topic', not support 'headers'
        if ($config['type'] != AMQP_EX_TYPE_DIRECT
            && $config['type'] != AMQP_EX_TYPE_FANOUT
            && $config['type'] != AMQP_EX_TYPE_TOPIC) {
            throw new Queue_Exception("not support for {$config['type']} exchange type");
        }

        //config setting       
        $exchange = new AMQPExchange($this->_channel);
        $exchange->setName($config['name']);
        $exchange->setType($config['type']);
        $exchange->setFlags(AMQP_DURABLE);

        if (!$exchange->declareExchange()) {
            throw new Queue_Exception("Declare the exchange failed");
        }
        $this->_exchange = $exchange;
    }

    /**
    *
    * @param array $config , key can be: name, routing_key, exchange_name, delay
    *   name: string queue name
    *   routing_key: string | array 
    *   exchange_name : string 
    *   delay : int seconds to delay
    *
    * @return
    **/
    private function _initQueue($config) {
        foreach($config as $cfg) {
            if(!isset($cfg['name']) || !isset($cfg['routing_key']) || !isset($cfg['exchange_name'])) {
                throw new Queue_Exception("name/routing_key/exchange_name cannot be empty");
            }
            $queue = new AMQPQueue($this->_channel);

            //config setting
            $queue->setName($cfg['name']);
            $queue->setFlags(AMQP_DURABLE);
            $args = array('x-max-priority' => 100);
            $queue->declareQueue();

            $keys = isset($cfg['routing_key']) ? $cfg['routing_key'] : array();
            $keys = is_array($keys) ? $keys : array($keys);
            foreach($keys as $key) {
                $queue->bind($cfg['exchange_name'], $key);
            }

            $this->_queueList[$cfg['name']] = $queue;
        }
    }

    /**
    *
    * @param string $value
    *
    * @return
    *
    **/
    public function push($value) {
        if(!$this->_exchange instanceof AMQPExchange) {
            return false;
        }
        $options = array(
            'delivery_mode' => self::MESSAGE_PERSISTENT_MODE,
            );
        $routingKey = self::$_routingKey;
        try {
            return $this->_exchange->publish($value, $routingKey, AMQP_NOPARAM, $options);
        } catch (Exception $e) {
            error_log('push perf msg to rabbitmq failed:' . $e);
            return false;
        }
    }

    /**
    * pop key from the queue
    *
    * @param string $key  queue name
    *
    * @return mixed
    **/
    public function pop(){
        $this->_lastMsg = null;
        $key = self::$_queueName;
        $queue = $this->_queueList && isset($this->_queueList[$key]) ? $this->_queueList[$key] : null;

        if(!$queue) {
            throw new Queue_Exception("queue config is empty");
        }

        $msg = $queue->get(AMQP_AUTOACK);

        if(empty($msg)) {
            return false;
        }

        $this->_lastMsg = $msg;

        return $msg->getBody();
    }

    public function begin() {
        $this->_channel->startTransaction();
    }

    public function commit() {
        $this->_channel->commitTransaction();
    }

    public function rollback() {
        $this->_channel->rollbackTransaction();
    }

    /**
    *
    * @param callable $callback
    * @param array $options
    *
    * @return
    **/
    public function consume(callable $callback, $options = array()) {
        $key = self::$_queueName;
        $times = 0;
        $begin = time();
        $queue = $this->_queueList && isset($this->_queueList[$key]) ? $this->_queueList[$key] : null;

        if($queue === null) {
            throw new Queue_Exception("cann't find queue for $key in " . __FILE__);
        }

        $queue->consume(function($envelope, $q) use (&$times, $begin, $callback, $options) {
            $errorHandler = isset($options['error_handler']) ? $options['error_handler'] : '';
            $maxTimes = isset($options['max_times']) ? (int) $options['max_times'] : 0;
            $maxTimeLength = isset($options['max_time_length']) ? (int) $options['max_time_length'] : 0;
            $times ++;
            $key = $envelope->getRoutingKey();
            $data = $envelope->getBody();

            try {
                $callback($key, $data);
                $q->ack($envelope->getDeliveryTag());
            } catch (Exception $e) {
                $q->nack($envelope->getDeliveryTag());

                if($errorHandler && is_callable($errorHandler)) {
                    $errorHandler($key, $e);
                }
            }

            if($maxTimes > 0 && $times > $maxTimes) {
                return false;
            }
            if($maxTimeLength > 0 && time() - $begin > $maxTimeLength) {
                return false;
            }
        });
    }

}


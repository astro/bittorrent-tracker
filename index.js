var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;

var requestHTTP = require('./http');
var requestUDP = require('./udp');

inherits(TrackerGroup, process.EventEmitter);
function TrackerGroup(urls) {
    EventEmitter.call(this);
    this.trackers = urls.map(function(url) {
        return new Tracker(url);
    });
    this.info = {
        event: undefined,
        info_hash: undefined,
        peer_id: undefined,
        ip: undefined,
        port: 6881,
        uploaded: 0,
        downloaded: 0,
        left: 0
    };
}
module.exports.TrackerGroup = TrackerGroup;

/**
 * You may instantiiate earlier, but be sure to start() once 
 **/
TrackerGroup.prototype.start = function(cb) {
    this.info.event = 'started';
    this.request();
    if (this.info.event === 'started') {
        this.info.event = undefined;
    }
};

TrackerGroup.prototype.request = function(info) {
    this._clearTimer();

    this.nextReq = 'now';
    /* Let any data providers fill our info */
    this.emit('info', this.info);

    this.trackers[0].request(this.info, function(error, result) {
        if (result && result.peers && result.peers.length > 0) {
            this.emit('peers', result.peers);
        }

        /* Rotate in group */
        this.trackers.push(this.trackers.shift());


        this.interval = (result && result.interval || 30 + 30 * Math.random()) * 1000;
        this._clearTimer();
        if (this.info.event !== 'stopped') {
            this._setTimer();
            this.nextReq = Date.now() + this.interval;
        } else {
            this.nextReq = 'never';
        }

    }.bind(this));
};

TrackerGroup.prototype._clearTimer = function() {
    if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
    }
};

TrackerGroup.prototype._setTimer = function() {
    this.timeout = setTimeout(this.request.bind(this), Math.ceil(this.interval));
};

function Tracker(url) {
    this.url = url;
}
Tracker.prototype = {
    request: function(info, cb) {
        var m;

        if ((/^https?:\/\//.test(this.url)))
            return requestHTTP(this.url, info, cb);
        else if ((m = this.url.match(/^udp:\/\/([^:]+):(\d+)/)))
            return requestUDP(m[1], parseInt(m[2]), info, cb);
    },
};

var request = require('request');
var bncode = require('bncode');

function defaultInterval() {
    return Math.ceil(1800 + 600 * (Math.random() - 0.5));
}

module.exports = function(url, info, cb) {
    url = url + "?" + infoToQueryParam(info);
    request({
        url: url,
        encoding: null
    }, function(err, data) {
        console.log("tracker", url, arguments);
        var ip, port;

        if (err) {
            return cb(err);
        }

        var result = [];
        var response;
        try {
            response = bncode.decode(data.body);
        } catch (e) {
            console.log(url, "error parsing", data.body);
            return cb(e);
        }
        var peers = response && response.peers;
        if (peers && peers.__proto__ && peers.__proto__.constructor === Array) {
            /* Non-compact IPv4 */
            result = peers;
        }
        if (Buffer.isBuffer(response.peers)) {
            /* Compact IPv4 */
            for(var i = 0; i < peers.length - 5; i += 6) {
                ip = [0, 1, 2, 3].map(function(j) { return peers[i + j]; }).join(".");
                port = (peers[i + 4] << 8) | peers[i + 5];
                result.push({ ip: ip, port: port });
            }
        }

        var peers6 = response && response.peers6;
        if (peers6 && peers6.prototype && peers6.prototype.constructor === Array) {
            /* Non-compact IPv6 */
            result = result.concat(peers6);
        }
        if (Buffer.isBuffer(peers6)) {
            /* Compact IPv6 */
            for(var i = 0; i < peers6.length - 17; i += 18) {
                ip = [0, 1, 2, 3, 4, 5, 6, 7].map(function(j) {
                 return peers6.readUInt16BE(i + j * 2).toString(16);
                }).join(":");
                port = peers6.readUInt16BE(i + 16);
                result.push({ ip: ip, port: port });
            }
        }

        var interval  = response.interval || response['min interval'] || defaultInterval();
        var message;
        if (result.length < 1 &&
            (message = (result['failure reason'] || result['warning message']))) {
            cb(new Error(message));
        } else {
            cb(null, {
                peers: result,
                interval: interval
            });
        }
    });
};

function infoToQueryParam(info) {
    var query = {
        info_hash: info.infoHash,
        peer_id: info.peerId,
        port: info.port,
        uploaded: info.uploaded,
        downloaded: info.downloaded,
        left: info.left,
        compact: 1
    };
    if (info.ip) {
        query.ip = info.ip;
    }
    if (info.event) {
        query.event = info.event;
    }

    var queryStrs = [];
    for(var k in query) {
        var v = query[k];
        var e = (k === 'info_hash' || k === 'peer_id') ?
            urlencodeBuffer(v) :
            encodeQuery(v);
        queryStrs.push(k + "=" + e);
    }
    return queryStrs.join("&");
}

function encodeQuery(v) {
    if (Buffer.isBuffer(v)) {
        var r = "";
        for(var i = 0; i < v.length; i++) {
            r += "%";
            if (v[i] < 0x10)
                r += "0";
            r += v[i].toString(16);
        }
        return r;
    } else {
        return encodeURIComponent("" + v);
    }
}

function urlencodeBuffer(b) {
    console.log("urlencodeBuffer", b);
    if (!Buffer.isBuffer(b)) {
        b = new Buffer(b, 'hex');
    }

    var r = "";
    for(var i = 0; i < b.length; i++) {
        r += "%" + lpad(b[i].toString(16), 2, "0");
    }
    return r;
}

function lpad(s, len, pad) {
    if (typeof s !== 'string') {
        s = "" + s;
    }
    while(s.length < len) {
        s = pad + s;
    }
    return s;
}

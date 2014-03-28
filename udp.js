var dgram = require('dgram');

/* TODO: pool 1 sock, demux after parsing */

module.exports = function(address, port, info, cb) {
    var infoHash = info.infoHash,
        peerId = info.peerId;
    if (typeof infoHash === 'string')
        infoHash = new Buffer(infoHash, 'hex')
    if (typeof peerId === 'string')
        peerId = new Buffer(peerId, 'hex')

    var onData;
    var sock = dgram.createSocket('udp4', function(message) {
        if (onData)
            onData(message);
    });

    var tries = 0;
    function send(data, filterCb, doneCb) {
        tries++;
        sock.send(data, 0, data.length, port, address);
        onData = function(rData) {
            var result;
            if ((result = filterCb(rData))) {
                sock.onData = null;
                clearTimeout(timeout);
                tries = 0;
                doneCb(result);
            }
        };
        var timeout = setTimeout(function() {
            listeners = [];
            if (tries < 5) {
                send(data, filterCb, doneCb);
            } else {
                sock.close();
                cb(new Error("Timeout"));
            }
        }, 5000);
    }

    var transactionId = Math.floor(Math.pow(2,32) * Math.random());
    var connectReq = new Buffer([
        0, 0, 0x4, 0x17, 0x27, 0x10, 0x19, 0x80,  /* connection_id */
        0, 0, 0, 0,  /* action: connect */
        0, 0, 0, 0  /* transaction_id, see below */
    ]);
    connectReq.writeUInt32BE(transactionId, 12);

    send(connectReq, function(connectRes) {
        if (connectRes.length >= 16 &&
            connectRes.readUInt32BE(0) === 0 &&
            connectRes.readUInt32BE(4) === transactionId) {
            var connectionId = [connectRes.readUInt32BE(8), connectRes.readUInt32BE(12)];
            return connectionId;
        }
    }, function(connectionId) {
        transactionId = Math.floor(Math.pow(2,32) * Math.random());
        var announceReq = new Buffer([
            0, 0, 0, 0, 0, 0, 0, 0,  /* connection_id */
            0, 0, 0, 1,  /* action: announce */
            0, 0, 0, 0,  /* transaction_id, see below */
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  /* infoHash */
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  /* peer_id */
            0, 0, 0, 0, 0, 0, 0, 0,  /* downloaded */
            0, 0, 0, 0, 0, 0, 0, 0,  /* left */
            0, 0, 0, 0, 0, 0, 0, 0,  /* uploaded */
            0, 0, 0, 0,  /* event */
            0, 0, 0, 0,  /* ip */
            0, 0, 0, 0,  /* TODO: key */
            0xff, 0xff, 0xff, 0xff,  /* num_want */
            0x1a, 0xe1,  /* port */
            0, 0  /* extensions */
        ]);
        announceReq.writeUInt32BE(connectionId[0], 0);
        announceReq.writeUInt32BE(connectionId[1], 4);
        announceReq.writeUInt32BE(transactionId, 12);
        var i;
        var infoHash = Buffer.isBuffer(info.infoHash) ?
                info.infoHash :
                new Buffer(info.infoHash, 'hex');
        for(i = 0; i < 20; i++) {
            announceReq[16 + i] = infoHash[i];
        }
        for(i = 0; i < 20; i++) {
            announceReq[36 + i] = info.peerId[i];
        }
        announceReq.writeUInt32BE(info.downloaded >> 32, 56);
        announceReq.writeUInt32BE(info.downloaded & 0xffffffff, 60);
        announceReq.writeUInt32BE(info.left >> 32, 64);
        announceReq.writeUInt32BE(info.left & 0xffffffff, 68);
        announceReq.writeUInt32BE(info.uploaded >> 32, 72);
        announceReq.writeUInt32BE(info.uploaded & 0xffffffff, 76);
        var eventCode = 0;
        if (info.event === 'completed')
            eventCode = 1;
        else if (info.event === 'started')
            eventCode = 2;
        else if (info.event === 'stopped')
            eventCode = 3;
        announceReq.writeUInt32BE(eventCode, 80);
        announceReq.writeUInt16BE(info.port, 96);
        send(announceReq, function(announceRes) {
            if (announceRes.length >= 20 &&
                announceRes.readUInt32BE(0) === 1 &&
                announceRes.readUInt32BE(4) === transactionId) {
                var connectionId = [announceRes.readUInt32BE(8), announceRes.readUInt32BE(12)];

                console.log("UDP tracker", address+":"+port, "has", (announceRes.length - 20) / 6, "peers");
                var interval = announceRes.readUInt32BE(8);
                var peers = [];
                for(var i = 20; i < announceRes.length - 5; i += 6) {
                    var ip = [0, 1, 2, 3].map(function(j) {
                        return announceRes.readUInt8(i + j);
                    }).join(".");
                    var port1 = announceRes.readUInt16BE(i + 4);
                    peers.push({ ip: ip, port: port1 });
                }

                return {
                    interval: interval,
                    peers: peers
                };
            }
        }, function(result) {
            sock.close();
            cb(result ? new Error("Invalid result") : null, result);
        });
    });
};

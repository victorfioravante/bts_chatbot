const { encode, decode } = require("@msgpack/msgpack");
const { EventEmitter } = require("events");

// socket.io-client v4.7+ expects encode() to return the array directly (no callback)
class MsgpackEncoder {
  encode(packet) {
    const encoded = encode([packet.type, packet.nsp || "/", packet.data, packet.id]);
    return [encoded];
  }
}

// Extends EventEmitter so socket.io-client can call on/off/emit during cleanup
class MsgpackDecoder extends EventEmitter {
  add(data) {
    let decoded;
    if (data instanceof ArrayBuffer || Buffer.isBuffer(data)) {
      decoded = decode(data);
    } else {
      decoded = decode(Buffer.from(data));
    }

    const [type, nsp, body, id] = decoded;
    const packet = { type, nsp: nsp || "/", data: body };
    if (id !== undefined) packet.id = id;

    this.emit("decoded", packet);
  }

  destroy() {
    this.removeAllListeners();
  }
}

module.exports = { MsgpackEncoder, MsgpackDecoder };

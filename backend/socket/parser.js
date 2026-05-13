const { encode, decode } = require("@msgpack/msgpack");

// Custom Socket.io parser using MessagePack (mirrors the official Bitsler client)
class MsgpackEncoder {
  constructor() {
    this.encoding = false;
  }

  encode(packet, callback) {
    const encoded = encode([packet.type, packet.nsp || "/", packet.data, packet.id]);
    callback([encoded]);
  }
}

class MsgpackDecoder {
  constructor() {
    this.callbacks = {};
  }

  on(event, cb) {
    this.callbacks[event] = cb;
    return this;
  }

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

    if (this.callbacks["decoded"]) {
      this.callbacks["decoded"](packet);
    }
  }

  destroy() {}
}

module.exports = { MsgpackEncoder, MsgpackDecoder };

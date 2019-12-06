const crypto = require("crypto");
const config = require("../_config.json");

const key = crypto
  .createHash("sha256")
  .update(String(config.secret))
  .digest("hex")
  .slice(0, 16);

const crypt_iv = Buffer.from([
  0xd8,
  0xb1,
  0xd1,
  0xbc,
  0xdd,
  0x58,
  0x3b,
  0xdd,
  0x89,
  0x4f,
  0x33,
  0x6a,
  0x7b,
  0x4b,
  0x9e,
  0x1b
]);

function noop() {}

function encrypt(string) {
  const encryptor = crypto.createCipheriv("aes-128-cbc", key, crypt_iv);
  var hashed = encryptor.update(string, "utf8", "hex");
  hashed += encryptor.final("hex");
  return hashed;
}

function decrypt(hash) {
  const decryptor = crypto.createDecipheriv("aes-128-cbc", key, crypt_iv);
  var string = decryptor.update(hash, "hex", "utf8");
  string += decryptor.final("utf8");
  return string;
}

module.exports = {
  noop,
  encrypt,
  decrypt,
}

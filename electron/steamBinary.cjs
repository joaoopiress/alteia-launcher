// Leitura dos ficheiros binários da cache do cliente Steam:
//  - packageinfo.vdf: os pacotes (licenças) da conta, com as apps que cada um inclui;
//  - appinfo.vdf: nome e tipo (jogo, ferramenta, DLC…) de cada app.
// Formato: KeyValues binário (0x00 objeto, 0x01 texto, 0x02 int32, 0x07 uint64, 0x08 fim).
const fs = require('fs');

function readCString(buf, pos) {
  const end = buf.indexOf(0, pos);
  return [buf.toString('utf8', pos, end), end + 1];
}

// Lê um objeto KeyValues binário. `keyAt` lê a chave (texto ou índice na tabela de strings).
function readKV(buf, pos, keyAt) {
  const obj = {};
  while (pos < buf.length) {
    const type = buf[pos++];
    if (type === 0x08) return [obj, pos];
    let key;
    [key, pos] = keyAt(buf, pos);
    key = key.toLowerCase();
    switch (type) {
      case 0x00: {
        let child;
        [child, pos] = readKV(buf, pos, keyAt);
        obj[key] = child;
        break;
      }
      case 0x01: {
        let s;
        [s, pos] = readCString(buf, pos);
        obj[key] = s;
        break;
      }
      case 0x02:
      case 0x03:
      case 0x04:
      case 0x06:
        obj[key] = buf.readInt32LE(pos);
        pos += 4;
        break;
      case 0x07:
      case 0x0a:
        obj[key] = buf.readBigUInt64LE(pos).toString();
        pos += 8;
        break;
      default:
        throw new Error(`Tipo KeyValues desconhecido: ${type}`);
    }
  }
  return [obj, pos];
}

// Apps incluídas nas licenças da conta (packageinfo.vdf, versões 27 e 28).
function readOwnedAppIds(file) {
  const buf = fs.readFileSync(file);
  const magic = buf.readUInt32LE(0);
  const version = magic & 0xff;
  let pos = 8;
  const apps = new Set();
  while (pos < buf.length) {
    const packageId = buf.readUInt32LE(pos);
    pos += 4;
    if (packageId === 0xffffffff) break;
    pos += 20 + 4; // sha1 + changenumber
    if (version >= 0x28) pos += 8; // token
    let kv;
    [kv, pos] = readKV(buf, pos, readCString);
    const pkg = kv[String(packageId)] || Object.values(kv)[0] || {};
    for (const id of Object.values(pkg.appids || {})) apps.add(String(id));
  }
  return apps;
}

// Nome e tipo de cada app (appinfo.vdf, versões 28 e 29; a 29 usa uma tabela de strings).
function readAppInfo(file) {
  const buf = fs.readFileSync(file);
  const version = buf.readUInt32LE(0) & 0xff;
  let pos = 8;
  let keyAt = readCString;
  if (version >= 0x29) {
    const tableOffset = Number(buf.readBigInt64LE(8));
    pos = 16;
    const count = buf.readUInt32LE(tableOffset);
    const strings = [];
    let p = tableOffset + 4;
    for (let i = 0; i < count; i++) {
      let s;
      [s, p] = readCString(buf, p);
      strings.push(s);
    }
    keyAt = (b, q) => [strings[b.readUInt32LE(q)], q + 4];
  }
  const apps = new Map();
  while (pos < buf.length) {
    const appid = buf.readUInt32LE(pos);
    if (appid === 0) break;
    const size = buf.readUInt32LE(pos + 4);
    const next = pos + 8 + size;
    // infostate(4) lastupdated(4) token(8) sha1(20) changenumber(4) binary_sha1(20)
    const kvStart = pos + 8 + 4 + 4 + 8 + 20 + 4 + 20;
    try {
      const [kv] = readKV(buf, kvStart, keyAt);
      const common = kv.appinfo?.common || {};
      apps.set(String(appid), { name: common.name || '', type: String(common.type || '').toLowerCase() });
    } catch {}
    pos = next;
  }
  return apps;
}

module.exports = { readOwnedAppIds, readAppInfo };

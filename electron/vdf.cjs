// Parser mínimo para o formato KeyValues (VDF) da Valve.
// As chaves são guardadas em minúsculas para evitar diferenças como "apps"/"Apps".

function parseVdf(text) {
  let i = 0;
  const len = text.length;

  function skipWhitespaceAndComments() {
    while (i < len) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        i++;
      } else if (c === '/' && text[i + 1] === '/') {
        while (i < len && text[i] !== '\n') i++;
      } else {
        break;
      }
    }
  }

  function readString() {
    if (text[i] === '"') {
      i++;
      let out = '';
      while (i < len && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < len) {
          const n = text[i + 1];
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          i += 2;
        } else {
          out += text[i++];
        }
      }
      i++; // aspas de fecho
      return out;
    }
    let out = '';
    while (i < len && !/[\s{}"]/.test(text[i])) out += text[i++];
    return out;
  }

  function readObject() {
    const obj = {};
    while (true) {
      skipWhitespaceAndComments();
      if (i >= len) return obj;
      if (text[i] === '}') {
        i++;
        return obj;
      }
      const key = readString().toLowerCase();
      skipWhitespaceAndComments();
      if (text[i] === '{') {
        i++;
        obj[key] = readObject();
      } else {
        obj[key] = readString();
      }
    }
  }

  return readObject();
}

module.exports = { parseVdf };

"use strict";

/**
 * @param {number} code
 * @param {number} len
 */
function reprCode(code, len) {
    let rep = code.toString(2);
    return "0".repeat(len - rep.length) + rep;
}

/**
 * @param {number} maxSym
 * @param {Map<number, number>} freq
 * @returns {number[]}
 */
function freqToCodeLengths(maxSym, freq) {
    if (freq.size == 0) return [];
    // [weight, sub-branches or value]
    /**
     * @type any[][]
     */
    let branches = Array.from(freq.entries()).map(([v, w]) => [w, v]);
    while (branches.length > 1) {
        // sort in reverse order
        branches.sort(([wl, ], [wr, ]) => wr - wl);
        let [wr, r] = branches.pop();
        let [wl, l] = branches.pop();
        branches.push([wl + wr, [l, r]]);
    }

    let code_lengths = new Array(maxSym + 1);
    for (let i = 0; i <= maxSym; i++) {
        code_lengths[i] = 0;
    }

    //although we have a tree already, the codes need to be rearranged
    //in lexicograhic order per (per length), so just take the lengths from here
    function make_enc(v, len) {
        if (v.length === 2) {
            make_enc(v[0], len + 1);
            make_enc(v[1], len + 1);
        } else {
            code_lengths[v] = len;
        }
    }
    if (freq.size > 1) {
        make_enc(branches[0][1], 0);
    } else {
        code_lengths[freq.entries().next().value[0]] = 1;
    }
    return code_lengths;
}

/**
 * @param {number[]} code_len
 */
function* lengthsToHuffTree(code_len) {
    let code_len_freq = new Map();
    count(code_len_freq, code_len);
    code_len_freq.set(0, 0); // symbols that don't appear will have 0 length but don't count them
    let code = 0;
    let ml = Math.max(...code_len);
    let next_code = new Array(ml);
    next_code[0] = 0;
    for (let bits = 1; bits <= ml; bits++) {
        let prev_len = code_len_freq.has(bits - 1) ? code_len_freq.get(bits - 1) : 0;
        code = (code + prev_len) << 1;
        next_code[bits] = code;
    }
    for (let sym = 0; sym < code_len.length; sym++) {
        let len = code_len[sym];
        if (len > 0) {
            let code = next_code[len];
            yield [sym, code, len];
            next_code[len]++;
        }
    }
}

/**
 * @param {number[]} code_len
 * @returns {Map<number, number[]>}
 */
function lengthsToEncodingTree(code_len) {
    let out = new Map();
    for (let [sym, code, len] of lengthsToHuffTree(code_len)) {
        out.set(sym, [code, len]);
    }
    return out;
}

/**
 * @param {number[]} code_len
 * @returns {Map<number, number>}
 */
function lengthsToDencodingTree(code_len) {
    let out = new Map();
    let ml = Math.max(...code_len);
    for (let [sym, code, len] of lengthsToHuffTree(code_len)) {
        // include length in key to make it possible to disambiguate codes with matching prefixes
        out.set(code | (len << ml), sym);
    }
    return out;
}

/**
 * @param {Map<number, number[]>} dic
 * @param {number[]} vs
 * @returns {[number[], number]}
 */
function huffenc(dic, vs) {
    let out = [];
    let acc = 0;
    let acc_len = 0;
    let bits_out = 0;
    for (let v of vs) {
        if (!dic.has(v)) {
            throw "xx";
        }
        let [code, code_len] = dic.get(v);
        acc = (acc << code_len) | code;
        acc_len += code_len;
        bits_out += code_len;
        while (acc_len >= 8) {
            out.push(acc >> (acc_len - 8));
            acc_len -= 8;
            acc &= ((1 << acc_len) - 1);
        }
    }
    if (acc_len > 0) {
        out.push(acc << (8 - acc_len));
    }
    if (bits_out > out.length * 8) throw "generated too few bytes";
    return [out, bits_out];
}

/**
 * @param {Map<number, number>} dic
 * @param {number} max_len
 * @param {number} enc_bits
 * @param {number[]} data
 * @returns {number[]}
 */
function huffdec(dic, max_len, enc_bits, data) {
    let out = [];
    let acc = 0;
    let acc_len = 0;
    let bits_in = 0;
    for (let x of data) {
        for (let i = 0; i < 8; i++) {
            acc = (acc << 1) | ((x >> (7 - i)) & 1);
            acc_len += 1;
            let k = (acc_len << max_len) | acc;
            if (dic.has(k) && bits_in < enc_bits) {
                out.push(dic.get(k));
                bits_in += acc_len;
                acc = 0;
                acc_len = 0;
            }
        }
    }
    if (bits_in != enc_bits) {
        throw "huffman decode failed";
    }
    return out;
}

/**
 * @param {Map<number, number>} freq
 * @param {number[]} vs
 */
function count(freq, vs) {
    for (let v of vs) {
        if (freq.has(v)) {
            freq.set(v, freq.get(v) + 1);
        } else {
            freq.set(v, 1);
        }
    }
}

const b64alp = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
// @ts-ignore
const b64rev = new Map(Array.from(b64alp, c => [c, b64alp.indexOf(c)]).concat([
    ["=", 0]
]));

/**
 * @param {number[]} ar
 */
function b64enc(ar) {
    let out = '';
    let i = 0;
    for (; i < (ar.length - ar.length % 3); i += 3) {
        let ac = (ar[i] << 16) | (ar[i + 1] << 8) | (ar[i + 2]);
        out += b64alp.charAt(ac >> 18);
        out += b64alp.charAt((ac >> 12) & 0x3f);
        out += b64alp.charAt((ac >> 6) & 0x3f);
        out += b64alp.charAt(ac & 0x3f);
    }
    if (i < ar.length) {
        let ac = (ar[i] << 16) | ((i < ar.length - 1) ? (ar[i + 1] << 8) : 0);
        out += b64alp.charAt(ac >> 18);
        out += b64alp.charAt((ac >> 12) & 0x3f);
        if (i < ar.length - 1) {
            out += b64alp.charAt((ac >> 6) & 0x3f);
            out += "=";
        } else {
            out += "==";
        }
    }
    return out;
}

/**
 * @param {string} st
 */
function b64dec(st) {
    if (st.length & 0x3) throw "base64 string should be a multiple of 4 characters long";
    if (!st.match(/^[A-Za-z0-9+/]+={0,2}$/)) throw "bad base64 string";
    let out = [];
    for (let i = 0; i < st.length; i += 4) {
        let ac = ((b64rev.get(st.charAt(i)) << 18) | (b64rev.get(st.charAt(i + 1)) << 12) |
            (b64rev.get(st.charAt(i + 2)) << 6) | b64rev.get(st.charAt(i + 3)));
        out.push(ac >> 16);
        if (st.charAt(i + 2) !== "=") out.push((ac >> 8) & 0xff);
        if (st.charAt(i + 3) !== "=") out.push(ac & 0xff);
    }
    return out;
}

// binary compression format, base64 encoded, ranges inclusive:
// byte 0: size (as length of board, not data),
// bytes 1..size+1: huffman coded bit length for symbol 0..size,
// bytes size+2..size+3: enc_bits as U16 big endian
// bytes size+4..end: packed huffman coded sections concatenated with board

/**
 * @param {number} size
 * @param {number[]} sections
 * @param {number[]} board
 */
function encodeHash(size, sections, board) {
    if (size < 1 || size > 255 || (size | 0) !== size) throw "invalid size";
    let together = sections.concat(board);
    let freq = new Map();
    count(freq, together);

    let code_lengths = freqToCodeLengths(size, freq);
    let code_dict = lengthsToEncodingTree(code_lengths);
    let [enc, enc_bits] = huffenc(code_dict, together);
    if (enc_bits > 0xffff) throw "too many bits";

    //encode data
    let out = [size];
    out = out.concat(code_lengths);
    out.push(enc_bits >> 8);
    out.push(enc_bits & 0xff);
    out = out.concat(enc);
    return b64enc(out);
}

//returns [size, sections, board] or null on failure
/**
 * @param {string} b64
 * @returns {[number, number[], number[]]}
 */
function decodeHash(b64) {
    let ar = b64dec(b64);
    let size = ar[0];
    if (size < 1 || size > 255 || (size | 0) !== size) throw "invalid size";
    let code_lengths = ar.slice(1, 1 + size + 1);
    let enc_bits = (ar[1 + size + 1] << 8) | ar[1 + size + 2];
    let enc_data = ar.slice(1 + size + 3);
    if ((((enc_bits + 7) / 8) | 0) != enc_data.length) throw "invalid encoded data length";

    // decode data
    let dec_dict = lengthsToDencodingTree(code_lengths);
    let max_code_len = Math.max(...code_lengths);
    let together = huffdec(dec_dict, max_code_len, enc_bits, enc_data);
    if (together.length != 2 * size * size) throw "invalid decoded data length";
    let sections = together.slice(0, size * size);
    let board = together.slice(size * size);
    return [size, sections, board];
}

/**
 * @param {string} str
 * @returns {[number, number[], number[]]}
 */
function oldDecodeHash(str) {
    let m = str.match(/^#?([A-Za-z0-9]+)-([A-Za-z0-9]+)$/);
    if (m) {
        let sections = m[1].split("").map(s => Number.parseInt(s, maxSize));
        let board = m[2].split("").map(s => Number.parseInt(s, MaxCellBase));
        let size = Math.sqrt(sections.length) | 0;
        return [size, sections, board];
    }
    throw `failed to parse hash`;
}

function codingTest() {
    for (let ti = 0; ti < 10000; ti++) {
        let sz = 2 + ((Math.random() * 10) | 0);
        let sect = [];
        let board = [];
        for (let i = 0; i < sz * sz; i++) {
            sect.push((Math.random() * sz) | 0);
            board.push((Math.random() * (sz + 1)) | 0);
        }

        let b64 = b64enc(sect);
        let b64d = b64dec(b64);
        if (b64d.length != sect.length) {
            throw "base64 encoding test failed";
        }
        for (let i = 0; i < sz * sz; i++) {
            if (b64d[i] !== sect[i]) throw "bad base64 decoding";
        }

        let enc = encodeHash(sz, sect, board);
        let [s, se, be] = decodeHash(enc);

        if (s != sz) throw "bad size decoding";
        for (let i = 0; i < sz * sz; i++) {
            if (se[i] !== sect[i]) throw "bad sect decoding";
            if (be[i] !== board[i]) throw "bad sect decoding";
        }
    }
    console.log("finished encoding test");
}
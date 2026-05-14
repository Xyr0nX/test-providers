// ============================================================
//  MovieBox plugin for Nuvio
//  Original Script by xyr0nx
//  Author: Xyr0nX
//  Github: https://github.com/Xyr0nX
// ============================================================

if (typeof fetch === "undefined") {
  var _https = require("https");
  var _http  = require("http");
  var _url   = require("url");
  global.fetch = function(reqUrl, opts) {
    opts = opts || {};
    var method  = (opts.method || "GET").toUpperCase();
    var body    = opts.body || null;
    var headers = Object.assign({}, opts.headers || {});
    if (body) { headers["content-length"] = Buffer.byteLength(body).toString(); }
    return new Promise(function(resolve, reject) {
      var parsed  = new _url.URL(reqUrl);
      var lib     = parsed.protocol === "https:" ? _https : _http;
      var reqOpts = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path:     parsed.pathname + (parsed.search || ""),
        method:   method,
        headers:  headers,
      };
      var req = lib.request(reqOpts, function(res) {
        var chunks = [];
        res.on("data", function(c) { chunks.push(c); });
        res.on("end", function() {
          var text = Buffer.concat(chunks).toString("utf8");
          var raw  = res.headers;
          resolve({
            status: res.statusCode,
            ok:     res.statusCode >= 200 && res.statusCode < 300,
            headers: { get: function(k) { return raw[k.toLowerCase()] || null; } },
            text:    function() { return Promise.resolve(text); },
            json:    function() {
              try   { return Promise.resolve(JSON.parse(text)); }
              catch (e) { return Promise.reject(new Error("JSON parse failed: " + text.slice(0, 100))); }
            },
          });
        });
      });
      req.on("error", reject);
      if (body) { req.write(body); }
      req.end();
    });
  };
}

function proxyFetch(url, opts) {
  if (!PROXY_URL || url.indexOf("themoviedb.org") >= 0) {
    return fetch(url, opts);
  }
  var proxyTarget = PROXY_URL.replace(/\/$/, "") + "/proxy?url=" + encodeURIComponent(url);
  return fetch(proxyTarget, opts);
}

var PLUGIN_ID   = "moviebox";
var PLUGIN_NAME = "MovieBox";
var MAIN_URL    = "https://api3.aoneroom.com";
var TMDB_KEY    = "1865f43a0549ca50d341dd9ab8b29f49";

var PROXY_URL   = "https://xyr0nx-proxy.python-hacking19.workers.dev";

var SECRET_KEY_DEFAULT = [239,168,145,151,78,236,211,20,141,246,58,166,17,96,45,239,209,1,37,155,165,33,2,44,87,174,5,102,189,142];
var SECRET_KEY_ALT     = [94,169,246,158,115,184,215,242,253,218,141,98,185,120,82,44,116,219,94,246,56,103,150,89,235,105,188,153,34,192];

var BRAND_MODELS = {
  Samsung: ["SM-S918B", "SM-A528B", "SM-M336B"],
  Xiaomi:  ["2201117TI", "M2012K11AI", "Redmi Note 11"],
  OnePlus: ["LE2111", "CPH2449", "IN2023"],
  Google:  ["Pixel 6", "Pixel 7", "Pixel 8"],
  Realme:  ["RMX3085", "RMX3360", "RMX3551"],
};

var HOME_SECTIONS = [
  { id: "4516404531735022304",  name: "Trending" },
  { id: "5692654647815587592",  name: "Trending in Cinema" },
  { id: "414907768299210008",   name: "Bollywood" },
  { id: "3859721901924910512",  name: "South Indian" },
  { id: "8019599703232971616",  name: "Hollywood" },
  { id: "4741626294545400336",  name: "Top Series This Week" },
  { id: "8434602210994128512",  name: "Anime" },
  { id: "1255898847918934600",  name: "Reality TV" },
  { id: "4903182713986896328",  name: "Indian Drama" },
  { id: "7878715743607948784",  name: "Korean Drama" },
  { id: "8788126208987989488",  name: "Chinese Drama" },
  { id: "3910636007619709856",  name: "Western TV" },
  { id: "5177200225164885656",  name: "Turkish Drama" },
  { id: "1|1",                                          name: "Movies" },
  { id: "1|2",                                          name: "Series" },
  { id: "1|1006",                                       name: "Anime (List)" },
  { id: "1|1;country=India",                            name: "Indian (Movies)" },
  { id: "1|2;country=India",                            name: "Indian (Series)" },
  { id: "1|1;classify=Hindi dub;country=United States", name: "USA (Movies)" },
  { id: "1|2;classify=Hindi dub;country=United States", name: "USA (Series)" },
  { id: "1|1;country=Japan",                            name: "Japan (Movies)" },
  { id: "1|2;country=Japan",                            name: "Japan (Series)" },
  { id: "1|1;country=China",                            name: "China (Movies)" },
  { id: "1|2;country=China",                            name: "China (Series)" },
  { id: "1|1;country=Korea",                            name: "South Korean (Movies)" },
  { id: "1|2;country=Korea",                            name: "South Korean (Series)" },
  { id: "1|1;classify=Hindi dub;genre=Action",          name: "Action (Movies)" },
  { id: "1|1;classify=Hindi dub;genre=Crime",           name: "Crime (Movies)" },
  { id: "1|1;classify=Hindi dub;genre=Comedy",          name: "Comedy (Movies)" },
  { id: "1|2;classify=Hindi dub;genre=Crime",           name: "Crime (Series)" },
  { id: "1|2;classify=Hindi dub;genre=Comedy",          name: "Comedy (Series)" },
];

function md5Bytes(inputBytes) {
  function safe32(x, y) {
    var lsw = (x & 0xffff) + (y & 0xffff);
    return (((x >>> 16) + (y >>> 16) + (lsw >>> 16)) << 16) | (lsw & 0xffff);
  }
  function rotL(n, s) { return (n << s) | (n >>> (32 - s)); }
  function cmn(q, a, b, x, s, t) { return safe32(rotL(safe32(safe32(a, q), safe32(x, t)), s), b); }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d),  a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d),  a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d,           a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d),        a, b, x, s, t); }

  var msg  = inputBytes.slice();
  var len8 = msg.length;
  msg.push(0x80);
  while (msg.length % 64 !== 56) { msg.push(0); }
  var lo = (len8 * 8) & 0xffffffff;
  msg.push(lo & 0xff, (lo >>> 8) & 0xff, (lo >>> 16) & 0xff, (lo >>> 24) & 0xff, 0, 0, 0, 0);

  var W = [];
  for (var wi = 0; wi < msg.length; wi += 4) {
    W.push(msg[wi] | (msg[wi+1] << 8) | (msg[wi+2] << 16) | (msg[wi+3] << 24));
  }

  var a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (var bi = 0; bi < W.length; bi += 16) {
    var aa = a, bb = b, cc = c, dd = d;
    var M = W.slice(bi, bi + 16);
    a=ff(a,b,c,d,M[0],7,-680876936);   d=ff(d,a,b,c,M[1],12,-389564586);
    c=ff(c,d,a,b,M[2],17,606105819);   b=ff(b,c,d,a,M[3],22,-1044525330);
    a=ff(a,b,c,d,M[4],7,-176418897);   d=ff(d,a,b,c,M[5],12,1200080426);
    c=ff(c,d,a,b,M[6],17,-1473231341); b=ff(b,c,d,a,M[7],22,-45705983);
    a=ff(a,b,c,d,M[8],7,1770035416);   d=ff(d,a,b,c,M[9],12,-1958414417);
    c=ff(c,d,a,b,M[10],17,-42063);     b=ff(b,c,d,a,M[11],22,-1990404162);
    a=ff(a,b,c,d,M[12],7,1804603682);  d=ff(d,a,b,c,M[13],12,-40341101);
    c=ff(c,d,a,b,M[14],17,-1502002290);b=ff(b,c,d,a,M[15],22,1236535329);
    a=gg(a,b,c,d,M[1],5,-165796510);   d=gg(d,a,b,c,M[6],9,-1069501632);
    c=gg(c,d,a,b,M[11],14,643717713);  b=gg(b,c,d,a,M[0],20,-373897302);
    a=gg(a,b,c,d,M[5],5,-701558691);   d=gg(d,a,b,c,M[10],9,38016083);
    c=gg(c,d,a,b,M[15],14,-660478335); b=gg(b,c,d,a,M[4],20,-405537848);
    a=gg(a,b,c,d,M[9],5,568446438);    d=gg(d,a,b,c,M[14],9,-1019803690);
    c=gg(c,d,a,b,M[3],14,-187363961);  b=gg(b,c,d,a,M[8],20,1163531501);
    a=gg(a,b,c,d,M[13],5,-1444681467); d=gg(d,a,b,c,M[2],9,-51403784);
    c=gg(c,d,a,b,M[7],14,1735328473);  b=gg(b,c,d,a,M[12],20,-1926607734);
    a=hh(a,b,c,d,M[5],4,-378558);      d=hh(d,a,b,c,M[8],11,-2022574463);
    c=hh(c,d,a,b,M[11],16,1839030562); b=hh(b,c,d,a,M[14],23,-35309556);
    a=hh(a,b,c,d,M[1],4,-1530992060);  d=hh(d,a,b,c,M[4],11,1272893353);
    c=hh(c,d,a,b,M[7],16,-155497632);  b=hh(b,c,d,a,M[10],23,-1094730640);
    a=hh(a,b,c,d,M[13],4,681279174);   d=hh(d,a,b,c,M[0],11,-358537222);
    c=hh(c,d,a,b,M[3],16,-722521979);  b=hh(b,c,d,a,M[6],23,76029189);
    a=hh(a,b,c,d,M[9],4,-640364487);   d=hh(d,a,b,c,M[12],11,-421815835);
    c=hh(c,d,a,b,M[15],16,530742520);  b=hh(b,c,d,a,M[2],23,-995338651);
    a=ii(a,b,c,d,M[0],6,-198630844);   d=ii(d,a,b,c,M[7],10,1126891415);
    c=ii(c,d,a,b,M[14],15,-1416354905);b=ii(b,c,d,a,M[5],21,-57434055);
    a=ii(a,b,c,d,M[12],6,1700485571);  d=ii(d,a,b,c,M[3],10,-1894986606);
    c=ii(c,d,a,b,M[10],15,-1051523);   b=ii(b,c,d,a,M[1],21,-2054922799);
    a=ii(a,b,c,d,M[8],6,1873313359);   d=ii(d,a,b,c,M[15],10,-30611744);
    c=ii(c,d,a,b,M[6],15,-1560198380); b=ii(b,c,d,a,M[13],21,1309151649);
    a=ii(a,b,c,d,M[4],6,-145523070);   d=ii(d,a,b,c,M[11],10,-1120210379);
    c=ii(c,d,a,b,M[2],15,718787259);   b=ii(b,c,d,a,M[9],21,-343485551);
    a=safe32(a,aa); b=safe32(b,bb); c=safe32(c,cc); d=safe32(d,dd);
  }

  function w2h(w) {
    return ("0" + ( w        & 0xff).toString(16)).slice(-2) +
           ("0" + ((w >>  8) & 0xff).toString(16)).slice(-2) +
           ("0" + ((w >> 16) & 0xff).toString(16)).slice(-2) +
           ("0" + ((w >> 24) & 0xff).toString(16)).slice(-2);
  }
  return w2h(a) + w2h(b) + w2h(c) + w2h(d);
}

function md5Hex(str) { return md5Bytes(strToBytes(str)); }

function strToBytes(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if      (c < 0x80)  { out.push(c); }
    else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
    else                { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
  }
  return out;
}

function hexToBytes(hex) {
  var b = [];
  for (var i = 0; i < hex.length; i += 2) { b.push(parseInt(hex.substr(i, 2), 16)); }
  return b;
}

function bytesToBase64(bytes) {
  var C   = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = "";
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i], b1 = bytes[i+1] || 0, b2 = bytes[i+2] || 0;
    out += C[(b0 >> 2) & 0x3f];
    out += C[((b0 & 3) << 4) | ((b1 >> 4) & 0xf)];
    out += (i + 1 < bytes.length) ? C[((b1 & 0xf) << 2) | ((b2 >> 6) & 3)] : "=";
    out += (i + 2 < bytes.length) ? C[b2 & 0x3f] : "=";
  }
  return out;
}

function hmacMd5(keyBytes, msgBytes) {
  var BS   = 64;
  var k    = keyBytes.slice();
  while (k.length < BS) { k.push(0); }
  var ipad = k.map(function(b) { return b ^ 0x36; });
  var opad = k.map(function(b) { return b ^ 0x5c; });
  return hexToBytes(md5Bytes(opad.concat(hexToBytes(md5Bytes(ipad.concat(msgBytes))))));
}

function generateDeviceId() {
  var h = "";
  for (var i = 0; i < 32; i++) { h += Math.floor(Math.random() * 16).toString(16); }
  return h;
}

var DEVICE_ID = generateDeviceId();

function randomBrandModel() {
  var brands = Object.keys(BRAND_MODELS);
  var brand  = brands[Math.floor(Math.random() * brands.length)];
  var models = BRAND_MODELS[brand];
  return { brand: brand, model: models[Math.floor(Math.random() * models.length)] };
}

function generateXClientToken(ts) {
  var t = ts ? ts.toString() : Date.now().toString();
  return t + "," + md5Hex(t.split("").reverse().join(""));
}

function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
  var noScheme = url.replace(/^https?:\/\/[^/]+/, "");
  var qIdx     = noScheme.indexOf("?");
  var path     = qIdx >= 0 ? noScheme.slice(0, qIdx) : noScheme;
  var rawQuery = qIdx >= 0 ? noScheme.slice(qIdx + 1) : "";
  var queryStr = "";

  if (rawQuery) {
    var params = {};
    rawQuery.split("&").forEach(function(pair) {
      var eq = pair.indexOf("=");
      if (eq < 0) { return; }
      var k = pair.slice(0, eq);
      var v = pair.slice(eq + 1);
      if (!params[k]) { params[k] = []; }
      params[k].push(v);
    });
    queryStr = Object.keys(params).sort().map(function(k) {
      return params[k].map(function(v) { return k + "=" + v; }).join("&");
    }).join("&");
  }

  var canonicalUrl = queryStr ? path + "?" + queryStr : path;
  var bodyHash = "", bodyLength = "";
  if (body != null) {
    var bb = strToBytes(body);
    if (bb.length > 102400) { bb = bb.slice(0, 102400); }
    bodyHash   = md5Bytes(bb);
    bodyLength = bb.length.toString();
  }

  return method.toUpperCase() + "\n" +
    (accept || "")      + "\n" +
    (contentType || "") + "\n" +
    bodyLength          + "\n" +
    timestamp           + "\n" +
    bodyHash            + "\n" +
    canonicalUrl;
}

function generateXTrSignature(method, accept, contentType, url, body, useAltKey, ts) {
  var timestamp   = ts || Date.now();
  var canonical   = buildCanonicalString(method, accept, contentType, url, body || null, timestamp);
  var secretBytes = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
  var sigBytes    = hmacMd5(secretBytes, strToBytes(canonical));
  return timestamp + "|2|" + bytesToBase64(sigBytes);
}

function makeClientInfo_mbox(bm) {
  var model = bm ? bm.model : "sdk_gphone64_x86_64";
  return '{"package_name":"com.community.mbox.in","version_name":"3.0.03.0529.03","version_code":50020042,"os":"android","os_version":"16","device_id":"' + DEVICE_ID + '","install_store":"ps","gaid":"d7578036d13336cc","brand":"google","model":"' + model + '","system_language":"en","net":"NETWORK_WIFI","region":"IN","timezone":"Asia/Calcutta","sp_code":""}';
}

function makeClientInfo_oneroom(bm) {
  var brand = bm ? bm.model : "Pixel 7";
  var model = bm ? bm.brand : "Google";
  return '{"package_name":"com.community.oneroom","version_name":"3.0.13.0325.03","version_code":50020088,"os":"android","os_version":"13","install_ch":"ps","device_id":"' + DEVICE_ID + '","install_store":"ps","gaid":"1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d","brand":"' + brand + '","model":"' + model + '","system_language":"en","net":"NETWORK_WIFI","region":"US","timezone":"Asia/Calcutta","sp_code":"","X-Play-Mode":"1","X-Idle-Data":"1","X-Family-Mode":"0","X-Content-Mode":"0"}';
}

function buildPostHeaders(url, jsonBody) {
  var bm  = randomBrandModel();
  var ts  = Date.now();
  var xct = generateXClientToken(ts);
  var xtr = generateXTrSignature("POST", "application/json", "application/json; charset=utf-8", url, jsonBody, false, ts);
  return {
    "user-agent":      "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)",
    "accept":          "application/json",
    "content-type":    "application/json; charset=utf-8",
    "connection":      "keep-alive",
    "x-client-token":  xct,
    "x-tr-signature":  xtr,
    "x-client-info":   makeClientInfo_mbox(bm),
    "x-client-status": "0",
    "x-play-mode":     "2",
  };
}

function buildGetHeaders(url) {
  var ts  = Date.now();
  var xct = generateXClientToken(ts);
  var xtr = generateXTrSignature("GET", "application/json", "application/json", url, null, false, ts);
  return {
    "user-agent":      "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)",
    "accept":          "application/json",
    "content-type":    "application/json",
    "connection":      "keep-alive",
    "x-client-token":  xct,
    "x-tr-signature":  xtr,
    "x-client-info":   makeClientInfo_mbox(null),
    "x-client-status": "0",
  };
}

function buildPlayHeaders(url, token) {
  var bm  = randomBrandModel();
  var ts  = Date.now();
  var xct = generateXClientToken(ts);
  var xtr = generateXTrSignature("GET", "application/json", "application/json", url, null, false, ts);
  var hdrs = {
    "user-agent":      "com.community.oneroom/50020088 (Linux; U; Android 13; en_US; " + bm.brand + "; Build/TQ3A.230901.001; Cronet/145.0.7582.0)",
    "accept":          "application/json",
    "content-type":    "application/json",
    "connection":      "keep-alive",
    "x-client-token":  xct,
    "x-tr-signature":  xtr,
    "x-client-info":   makeClientInfo_oneroom(bm),
    "x-client-status": "0",
  };
  if (token) { hdrs["Authorization"] = "Bearer " + token; }
  return hdrs;
}

function getHighestQuality(resStr) {
  if (!resStr) { return 0; }
  var map = [["2160",2160],["1440",1440],["1080",1080],["720",720],["480",480],["360",360],["240",240]];
  for (var i = 0; i < map.length; i++) {
    if (resStr.indexOf(map[i][0]) >= 0) { return map[i][1]; }
  }
  return 0;
}

function inferStreamType(url, format) {
  var u = (url    || "").toLowerCase();
  var f = (format || "").toUpperCase();
  if (u.indexOf("magnet:") === 0)   { return "magnet"; }
  if (u.indexOf(".mpd")    >= 0)    { return "dash"; }
  if (u.slice(-8) === ".torrent")   { return "torrent"; }
  if (f === "HLS" || u.slice(-5) === ".m3u8") { return "hls"; }
  if (u.indexOf(".mp4") >= 0 || u.indexOf(".mkv") >= 0) { return "mp4"; }
  return "hls";
}

function mapSubjects(items) {
  return (items || []).map(function(item) {
    return {
      id:     item.subjectId,
      title:  (item.title || "").split("[")[0].trim(),
      poster: item.cover && item.cover.url,
      type:   item.subjectType === 2 ? "series" : "movie",
      rating: item.imdbRatingValue,
    };
  }).filter(function(i) { return i.id && i.title; });
}

function tmdbToSubjectId(tmdbId, type) {
  var tmdbType = (type === "tv") ? "tv" : "movie";
  var tmdbUrl  = "https://api.themoviedb.org/3/" + tmdbType + "/" + tmdbId +
                 "?api_key=" + TMDB_KEY + "&language=en-US";

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(tmdb) {
      var title   = tmdb.title || tmdb.name || tmdb.original_title || tmdb.original_name || "";
      var dateStr = tmdb.release_date || tmdb.first_air_date || "";
      var year    = dateStr ? parseInt(dateStr.slice(0, 4)) : null;

      if (!title) { throw new Error("TMDB: no title for id=" + tmdbId); }

      var searchUrl  = MAIN_URL + "/wefeed-mobile-bff/subject-api/search/v2";
      var searchBody = '{"page": 1, "perPage": 20, "keyword": "' + (title||'').replace(/"/g,'\\"') + '"}';
      var searchHdrs = buildPostHeaders(searchUrl, searchBody);

      return proxyFetch(searchUrl, { method: "POST", headers: searchHdrs, body: searchBody })
        .then(function(r) { return r.json(); })
        .then(function(root) {
          var results  = (root.data && root.data.results) || [];
          var best     = null;
          var bestScore = -1;

          results.forEach(function(result) {
            (result.subjects || []).forEach(function(subject) {
              if (!subject.subjectId) { return; }

              var isSeries = subject.subjectType === 2 || subject.subjectType === 7;
              if (type === "tv"    && !isSeries) { return; }
              if (type === "movie" &&  isSeries) { return; }

              var subTitle = (subject.title || "").split("[")[0].trim().toLowerCase();
              var srcTitle = title.toLowerCase();
              var score    = 0;

              if (subTitle === srcTitle) {
                score = 100;
              } else if (subTitle.indexOf(srcTitle) >= 0 || srcTitle.indexOf(subTitle) >= 0) {
                score = 70;
              } else {
                var wa = srcTitle.replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean);
                var wb = subTitle.replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean);
                var overlap = wa.filter(function(w) { return wb.indexOf(w) >= 0; }).length;
                score = Math.round(overlap / Math.max(wa.length, wb.length, 1) * 60);
              }

              if (year && subject.releaseDate) {
                var subYear = parseInt((subject.releaseDate + "").slice(0, 4));
                if (subYear === year) { score += 20; }
              }

              if (score > bestScore) { bestScore = score; best = subject; }
            });
          });

          if (!best || bestScore < 20) {
            throw new Error("MovieBox: no match for \"" + title + "\" (TMDB id=" + tmdbId + ")");
          }
          return best.subjectId;
        });
    });
}

var MovixPlugin = {
  id:          PLUGIN_ID,
  name:        PLUGIN_NAME,
  version:     "1.0.0",
  description: "MovieBox - Movies, Series & Anime for Nuvio.",
  language:    "hi",
  logo:        "https://raw.githubusercontent.com/Xyr0nX/gif-host/refs/heads/main/moviebox.png",

  getHomeSections: function(sectionCallback) {
    HOME_SECTIONS.forEach(function(sec) {
      sectionCallback({ id: sec.id, title: sec.name, items: [] });
    });
    return Promise.resolve();
  },

  getHomeItems: function(sectionId, page) {
    var data    = (sectionId !== null && typeof sectionId === "object")
      ? String(sectionId.id || sectionId.categoryId || "")
      : String(sectionId || "");
    var pg      = page || 1;
    var perPage = 15;

    if (data.indexOf("|") >= 0) {
      var url       = MAIN_URL + "/wefeed-mobile-bff/subject-api/list";
      var beforeSemi = data.split(";")[0];
      var channelId  = beforeSemi.split("|")[1] || null;
      var options    = {};
      data.split(";").slice(1).forEach(function(part) {
        var eq = part.indexOf("=");
        if (eq < 0) { return; }
        options[part.slice(0, eq)] = part.slice(eq + 1);
      });
      var classify = options["classify"] || "All";
      var country  = options["country"]  || "All";
      var year     = options["year"]     || "All";
      var genre    = options["genre"]    || "All";
      var sort     = options["sort"]     || "ForYou";
      var body = '{"page":' + pg + ',"perPage":' + perPage + ',"channelId":"' + channelId + '","classify":"' + classify + '","country":"' + country + '","year":"' + year + '","genre":"' + genre + '","sort":"' + sort + '"}';
      var headers = buildPostHeaders(url, body);
      return proxyFetch(url, { method: "POST", headers: headers, body: body })
        .then(function(r) { return r.json(); })
        .then(function(root) {
          var d = root.data || {};
          return mapSubjects(d.items || d.subjects || []);
        })
        .catch(function() { return []; });
    }

    var url     = MAIN_URL + "/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=" +
                  encodeURIComponent(data) + "&page=" + pg + "&perPage=" + perPage;
    var headers = buildGetHeaders(url);
    return proxyFetch(url, { method: "GET", headers: headers })
      .then(function(r) { return r.json(); })
      .then(function(root) {
        var d = root.data || {};
        return mapSubjects(d.items || d.subjects || []);
      })
      .catch(function() { return []; });
  },

  search: function(query, page) {
    var url     = MAIN_URL + "/wefeed-mobile-bff/subject-api/search/v2";
    var pg   = page || 1;
    var body = '{"page": ' + pg + ', "perPage": 20, "keyword": "' + (query||'').replace(/"/g,'\\"') + '"}';
    var headers = buildPostHeaders(url, body);
    return proxyFetch(url, { method: "POST", headers: headers, body: body })
      .then(function(r) { return r.json(); })
      .then(function(root) {
        var results = (root.data && root.data.results) || [];
        var list    = [];
        results.forEach(function(result) {
          (result.subjects || []).forEach(function(subject) {
            if (!subject.subjectId) { return; }
            list.push({
              id:     subject.subjectId,
              title:  (subject.title || "").split("[")[0].trim(),
              poster: subject.cover && subject.cover.url,
              type:   subject.subjectType === 2 ? "series" : "movie",
              rating: subject.imdbRatingValue,
            });
          });
        });
        return list;
      })
      .catch(function() { return []; });
  },

  getStreams: function(tmdbId, type, season, episode) {
    var se = season  ? parseInt(season)  : 0;
    var ep = episode ? parseInt(episode) : 0;

    return tmdbToSubjectId(tmdbId, type || "movie")
      .then(function(subjectId) {
        var subjectUrl = MAIN_URL + "/wefeed-mobile-bff/subject-api/get?subjectId=" + subjectId;
        var subHdrs    = buildPlayHeaders(subjectUrl, null);

        return proxyFetch(subjectUrl, { method: "GET", headers: subHdrs })
          .then(function(subResp) {
            var token = null;
            try {
              var xUser = subResp.headers.get("x-user");
              if (xUser) { token = JSON.parse(xUser).token || null; }
            } catch (e) {}

            return subResp.json().then(function(subRoot) {
              var subjectIds = [{ id: subjectId, lang: "Original" }];
              var dubs       = (subRoot.data && subRoot.data.dubs) || [];
              dubs.forEach(function(dub) {
                if (!dub.subjectId || !dub.lanName) { return; }
                if (dub.subjectId === subjectId) {
                  subjectIds[0].lang = dub.lanName;
                } else {
                  subjectIds.push({ id: dub.subjectId, lang: dub.lanName });
                }
              });
              return { subjectIds: subjectIds, token: token };
            });
          })
          .then(function(ctx) {
            var streams   = [];
            var subtitles = [];

            var playPromises = ctx.subjectIds.map(function(entry) {
              var sid   = entry.id;
              var lang  = (entry.lang || "Original").replace(/dub/gi, "Audio");
              var pUrl  = MAIN_URL + "/wefeed-mobile-bff/subject-api/play-info?subjectId=" + sid +
                          "&se=" + se + "&ep=" + ep;
              var pHdrs = buildPlayHeaders(pUrl, ctx.token);

              return proxyFetch(pUrl, { method: "GET", headers: pHdrs })
                .then(function(r) { return r.json(); })
                .then(function(root) {
                  var streamList = (root.data && root.data.streams) || [];

                  if (streamList.length) {
                    var subFetches = [];
                    streamList.forEach(function(stream) {
                      if (!stream.url) { return; }
                      var quality    = getHighestQuality(stream.resolutions || "");
                      var signCookie = stream.signCookie || null;
                      var streamId   = stream.id || (sid + "|" + se + "|" + ep);
                      var sType      = inferStreamType(stream.url, stream.format || "");
                      var hdrs       = { "Referer": MAIN_URL };
                      if (signCookie) { hdrs["Cookie"] = signCookie; }

                      var label = PLUGIN_NAME + " (" + lang + ")" + (quality ? " " + quality + "p" : "");
                      streams.push({
                        url:     stream.url,
                        quality: quality,
                        type:    sType,
                        label:   label,
                        title:   label,
                        name:    PLUGIN_NAME,
                        headers: hdrs,
                      });

                      var c1Url  = MAIN_URL + "/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=" + sid + "&streamId=" + streamId;
                      var ts1    = Date.now();
                      var c1Hdrs = Object.assign({}, buildPlayHeaders(c1Url, ctx.token), {
                        "Accept": "", "Content-Type": "",
                        "x-client-token": generateXClientToken(ts1),
                        "x-tr-signature": generateXTrSignature("GET", "", "", c1Url, null, false, ts1),
                      });
                      subFetches.push(
                        proxyFetch(c1Url, { method: "GET", headers: c1Hdrs })
                          .then(function(r) { return r.json(); })
                          .then(function(sr) {
                            ((sr.data && sr.data.extCaptions) || []).forEach(function(cap) {
                              if (!cap.url) { return; }
                              subtitles.push({
                                url:      cap.url,
                                language: (cap.language || cap.lanName || cap.lan || "Unknown") + " (" + lang + ")",
                              });
                            });
                          })
                          .catch(function() {})
                      );

                      var bm2    = randomBrandModel();
                      var ts2    = Date.now();
                      var c2Url  = MAIN_URL + "/wefeed-mobile-bff/subject-api/get-ext-captions?subjectId=" + sid + "&resourceId=" + streamId + "&episode=0";
                      var c2Hdrs = {
                        "Authorization":   "Bearer " + (ctx.token || ""),
                        "User-Agent":      "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; " + bm2.brand + "; Build/BP22.250325.006; Cronet/133.0.6876.3)",
                        "Accept":          "",
                        "Content-Type":    "",
                        "X-Client-Info":   makeClientInfo_mbox(bm2),
                        "X-Client-Status": "0",
                        "X-Client-Token":  generateXClientToken(ts2),
                        "x-tr-signature":  generateXTrSignature("GET", "", "", c2Url, null, false, ts2),
                      };
                      subFetches.push(
                        proxyFetch(c2Url, { method: "GET", headers: c2Hdrs })
                          .then(function(r) { return r.json(); })
                          .then(function(sr) {
                            ((sr.data && sr.data.extCaptions) || []).forEach(function(cap) {
                              if (!cap.url) { return; }
                              subtitles.push({
                                url:      cap.url,
                                language: (cap.lan || cap.lanName || cap.language || "Unknown") + " (" + lang + ")",
                              });
                            });
                          })
                          .catch(function() {})
                      );
                    });
                    return Promise.all(subFetches);
                  }

                  var fbUrl  = MAIN_URL + "/wefeed-mobile-bff/subject-api/get?subjectId=" + sid;
                  var fbHdrs = buildPlayHeaders(fbUrl, ctx.token);
                  return proxyFetch(fbUrl, { method: "GET", headers: fbHdrs })
                    .then(function(r) { return r.json(); })
                    .then(function(fbRoot) {
                      var detectors = (fbRoot.data && fbRoot.data.resourceDetectors) || [];
                      detectors.forEach(function(det) {
                        (det.resolutionList || []).forEach(function(video) {
                          if (!video.resourceLink) { return; }
                          var q     = video.resolution || 0;
                          var lbl   = PLUGIN_NAME + " S" + video.se + "E" + video.ep + " " + q + "p (" + lang + ")";
                          streams.push({
                            url:     video.resourceLink,
                            quality: q,
                            type:    "mp4",
                            label:   lbl,
                            title:   lbl,
                            name:    PLUGIN_NAME,
                            headers: { "Referer": MAIN_URL },
                          });
                        });
                      });
                    })
                    .catch(function() {});
                })
                .catch(function() {});
            });

            return Promise.all(playPromises).then(function() {
              var result = streams.slice();
              result.subtitles = subtitles;
              return result;
            });
          })
          .catch(function() {
            var empty = []; empty.subtitles = []; return empty;
          });
      })
      .catch(function(err) {
        var empty = []; empty.subtitles = []; empty.error = err && err.message; return empty;
      });
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = MovixPlugin;
} else if (typeof registerPlugin === "function") {
  registerPlugin(MovixPlugin);
}

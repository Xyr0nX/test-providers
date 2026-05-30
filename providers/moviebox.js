// ============================================================
//  MovieBox Multi Audio with Proxy, plugin for Nuvio
//  Author: Xyr0nX/Antonio-Ante
//  Github: https://github.com/Xyr0nX
// ============================================================

if (typeof fetch === "undefined") {
  // Node.js polyfill (untuk development/testing)
  var _https = require("https");
  var _http  = require("http");
  var _url   = require("url");
  var _Buffer = (typeof Buffer !== "undefined") ? Buffer : require("buffer").Buffer;
  
  global.fetch = function(reqUrl, opts) {
    opts = opts || {};
    var method  = (opts.method || "GET").toUpperCase();
    var body    = opts.body || null;
    var headers = Object.assign({}, opts.headers || {});
    if (body) headers["content-length"] = _Buffer.byteLength(body).toString();
    
    return new Promise(function(resolve, reject) {
      var parsed = new _url.URL(reqUrl);
      var lib    = parsed.protocol === "https:" ? _https : _http;
      var req    = lib.request({
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path:     parsed.pathname + (parsed.search || ""),
        method:   method,
        headers:  headers,
      }, function(res) {
        var chunks = [];
        res.on("data", function(c) { chunks.push(c); });
        res.on("end", function() {
          var text = _Buffer.concat(chunks).toString("utf8");
          var raw  = res.headers;
          resolve({
            status: res.statusCode,
            ok:     res.statusCode >= 200 && res.statusCode < 300,
            headers: { 
              get: function(k) { 
                return (raw[k.toLowerCase()] || raw[k] || null); 
              } 
            },
            text:    function() { return Promise.resolve(text); },
            json:    function() {
              try   { return Promise.resolve(JSON.parse(text)); }
              catch (e) { return Promise.reject(new Error("JSON parse error: " + text.slice(0,100))); }
            },
          });
        });
      });
      req.on("error", function(e) { reject(new Error("Network error: " + e.message)); });
      if (body) req.write(body);
      req.end();
    });
  };
}

var PLUGIN_ID   = "moviebox";
var PLUGIN_NAME = "MovieBox";
var WORKER_URL  = "https://moviebox-proxy-new.python-hacking19.workers.dev";

var HOME_SECTIONS = [
  { id: "trending",    name: "Trending" },
  { id: "cinema",      name: "Trending in Cinema" },
  { id: "bollywood",   name: "Bollywood" },
  { id: "south",       name: "South Indian" },
  { id: "hollywood",   name: "Hollywood" },
  { id: "series",      name: "Top Series This Week" },
  { id: "anime",       name: "Anime" },
  { id: "korean",      name: "Korean Drama" },
  { id: "chinese",     name: "Chinese Drama" },
  { id: "western",     name: "Western TV" },
];

var MovixPlugin = {
  id:          PLUGIN_ID,
  name:        PLUGIN_NAME,
  version:     "2.0.1",
  description: "MovieBox — Movies, Series & Anime.",
  language:    "hi",
  logo:        "https://h5-static.aoneroom.com/oneroomProject/icon/moviebox-official.jpg",

  getHomeSections: function(sectionCallback) {
    HOME_SECTIONS.forEach(function(sec) {
      sectionCallback({ id: sec.id, title: sec.name, items: [] });
    });
    return Promise.resolve();
  },

  getStreams: function(tmdbId, type, season, episode) {
    var mediaType = (type === "series") ? "tv" : (type || "movie");
    var isTv      = mediaType === "tv";
    var se        = isTv ? (season  ? parseInt(season)  : 1) : 0;
    var ep        = isTv ? (episode ? parseInt(episode) : 1) : 0;

    var url = WORKER_URL + "/streams"
      + "?tmdb_id=" + encodeURIComponent(tmdbId)
      + "&type="    + encodeURIComponent(mediaType);

    if (isTv) {
      url += "&se=" + se + "&ep=" + ep;
    }

    return fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Nuvio/1.0" },
    })
      .then(function(r) { 
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json().catch(function(e) { throw new Error("Invalid JSON"); });
      })
      .then(function(data) {
        var rawStreams = [];
        if (Array.isArray(data)) {
          rawStreams = data;
        } else if (data && Array.isArray(data.streams)) {
          rawStreams = data.streams;
        }

        if (!rawStreams.length) return [];

        var streams = rawStreams.map(function(s) {
          var streamUrl = (s.proxy_url || s.url || "").trim();
          if (!streamUrl) return null;

          var fmt        = (s.format || "").toUpperCase();
          var isDash     = fmt === "DASH" || streamUrl.indexOf(".mpd") >= 0;
          var streamType = isDash ? "dash" : fmt === "MP4" ? "mp4" : "hls";
          var quality    = s.resolution || "Auto";

          // Extract language from name if available, fallback to "Original"
          var lang = "Original";
          if (s.name) {
            var lm = s.name.match(/\(([^)]+)\)/);
            if (lm) lang = lm[1];
          }

          var label = PLUGIN_NAME + " (" + lang + ") - " + quality;
          var streamHeaders = Object.assign({}, s.headers || {});

          return {
            url:     streamUrl,
            quality: quality,
            type:    streamType,
            label:   label,
            title:   label,
            name:    label,
            headers: streamHeaders,
          };
        }).filter(Boolean);

        // Sort by numeric quality (descending)
        streams.sort(function(a, b) {
          var numA = parseInt((a.quality || "").match(/(\d+)/)) || 0;
          var numB = parseInt((b.quality || "").match(/(\d+)/)) || 0;
          return numB - numA;
        });

        return streams;
      })
      .catch(function(e) {
        // Log error safely
        if (typeof console !== "undefined" && console.error) {
          console.error("[MovieBox] Error:", e.message);
        }
        return [];
      });
  },
};

// Ekspor untuk Nuvio atau Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = MovixPlugin;
} else if (typeof registerPlugin === "function") {
  registerPlugin(MovixPlugin);
}

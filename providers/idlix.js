"use strict";

// ─── IDLIX PROVIDER FOR NUVIO ──────────────────────────────────────────────
// Format: Single-file Promise-based (Hermes-safe, no async/await)
// Providers: Majorplay + Jeniusplay
// ──────────────────────────────────────────────────────────────────────────

var BASE_URL   = "https://z1.idlixku.com";
var TMDB_KEY   = "b030404650f279792a8d3287232358e3";
var JENIUS_URL = "https://jeniusplay.com";
var UA         = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

var BASE_HEADERS = {
  "User-Agent":      UA,
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
  "Referer":         BASE_URL,
  "Origin":          BASE_URL,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fetchJson(url, options) {
  var opts    = options || {};
  var headers = Object.assign({}, BASE_HEADERS, opts.headers || {});
  return fetch(url, Object.assign({}, opts, { headers: headers }))
    .then(function(res) {
      return res.text().then(function(text) {
        if (!res.ok) { console.warn("[HTTP " + res.status + "] " + url); return null; }
        try { return JSON.parse(text); }
        catch(e) { console.error("[JSON] Parse error: " + text.substring(0, 150)); return null; }
      });
    })
    .catch(function(e) { console.error("[fetchJson] " + e.message); return null; });
}

function fetchText(url, referer) {
  return fetch(url, {
    headers: { "User-Agent": UA, "Referer": referer || BASE_URL }
  })
  .then(function(res) { return res.ok ? res.text() : null; })
  .catch(function(e) { console.warn("[fetchText] " + e.message); return null; });
}

function heightToQuality(h) {
  if (h >= 2160) return "4K";
  if (h >= 1080) return "1080p";
  if (h >= 720)  return "720p";
  if (h >= 480)  return "480p";
  if (h >= 360)  return "360p";
  return h + "p";
}

function bwToQuality(bw) {
  if (bw >= 5000000) return "1080p";
  if (bw >= 2500000) return "720p";
  if (bw >= 1000000) return "480p";
  return "360p";
}

function makeStream(provider, quality, url, subtitles, title, referer) {
  // Tentukan origin dari referer URL
  var origin = BASE_URL;
  try {
    var u = new URL(referer);
    origin = u.origin;
  } catch(e) {}

  return {
    name:      "Idlix | " + provider,
    title:     quality + " \u2022 " + title,
    url:       url,
    quality:   quality,
    subtitles: subtitles || [],
    headers: {
      "Referer":    referer,
      "Origin":     origin,
      "User-Agent": UA,
    }
  };
}

// ── M3u8 Parser ────────────────────────────────────────────────────────────

function parseM3u8(masterUrl, referer) {
  return fetchText(masterUrl, referer)
    .then(function(text) {
      if (!text) return null;

      // Deteksi kualitas tertinggi dari master playlist untuk label
      var maxHeight = 0;
      var reFindAll = function(s, p) {
        var re = new RegExp(p, "g"), out = [], m;
        while ((m = re.exec(s)) !== null) out.push(m);
        return out;
      };
      var resMatches = reFindAll(text, /RESOLUTION=\d+x(\d+)/ig);
      resMatches.forEach(function(m) {
        var h = parseInt(m[1]);
        if (h > maxHeight) maxHeight = h;
      });
      var topQuality = maxHeight > 0 ? heightToQuality(maxHeight) : "Auto";

      // SOLUSI: Selalu kirim master URL langsung ke Nuvio
      // Nuvio/player HLS sudah bisa handle master playlist dengan variant
      // Jangan resolve variant — karena token JWT per-segment berbeda
      // dan resolving URL dari server berbeda menyebabkan 403/404
      console.log("[M3u8] Master playlist → kirim langsung ke player (kualitas max: " + topQuality + ")");
      return [{ quality: topQuality, url: masterUrl }];
    })
    .catch(function(e) { console.warn("[M3u8] " + e.message); return null; });
}

// ── URL Resolver ────────────────────────────────────────────────────────────

function resolveUrl(base, relative) {
  if (!relative) return null;
  relative = relative.trim();
  if (relative.indexOf("http") === 0) return relative;
  if (relative.indexOf("//") === 0) return "https:" + relative;
  if (relative.indexOf("/") === 0) {
    try { var u = new URL(base); return u.origin + relative; } catch(e) {}
  }
  return base.substring(0, base.lastIndexOf("/") + 1) + relative;
}

// ── Config JSON Resolver ──────────────────────────────────────────────────────
// Beberapa film Majorplay return config-XXXXX.json, bukan master.m3u8 langsung
// Config JSON berisi path ke m3u8 yang sebenarnya
// Format config: { "sources": [{ "src": "playlist.m3u8", "type": "..." }] }
// atau: { "file": "...", "playlist": [...] }

function resolveMajorplayUrl(rawUrl, referer) {
  // Jika URL langsung ke .m3u8 atau .mp4 → tidak perlu resolve
  if (rawUrl.indexOf(".m3u8") >= 0 || rawUrl.indexOf(".mp4") >= 0) {
    return Promise.resolve(rawUrl);
  }

  // Jika URL ke config-XXXXX.json:
  // Dari debug: Content-Type = application/vnd.apple.mpegurl
  // Artinya config-XXXXX.json ADALAH m3u8 itu sendiri (bukan JSON)!
  // Cukup return URL apa adanya → parseM3u8 akan handle langsung
  if (rawUrl.indexOf(".json") >= 0 || rawUrl.indexOf("config-") >= 0) {
    console.log("[Majorplay] Config URL adalah M3U8 langsung: " + rawUrl.substring(0, 70));
    return Promise.resolve(rawUrl);
  }

  return Promise.resolve(rawUrl);
}

// ── Majorplay Extractor ────────────────────────────────────────────────────

function extractMajorplay(rawUrl, subtitles, title) {
  console.log("[Majorplay] URL: " + rawUrl.substring(0, 80));

  // Tentukan referer dari domain stream URL
  var majorReferer = BASE_URL;
  try { majorReferer = new URL(rawUrl.split("?")[0]).origin; } catch(e) {}

  // JANGAN fetch/parse m3u8 di sini — token JWT akan expired
  // Kirim URL langsung ke Nuvio, biarkan player handle HLS
  // Nuvio HLS player mendukung master playlist dan config-XXXXX.json
  console.log("[Majorplay] Kirim langsung ke player, referer: " + majorReferer);
  return Promise.resolve([
    makeStream("Majorplay", "Auto", rawUrl, subtitles, title, majorReferer)
  ]);
}

// ── Jeniusplay Extractor ───────────────────────────────────────────────────

function extractJeniusplay(embedUrl, subtitles, title) {
  console.log("[Jeniusplay] Extracting: " + embedUrl.substring(0, 70));

  var hashMatch = embedUrl.match(/[?&]data=([^&]+)/);
  if (!hashMatch) {
    console.warn("[Jeniusplay] Hash tidak ditemukan.");
    return Promise.resolve([]);
  }
  var hash = hashMatch[1];
  var pageHtml = "";

  return fetchText(embedUrl, BASE_URL)
    .then(function(html) {
      pageHtml = html || "";
      return fetch(
        JENIUS_URL + "/player/index.php?data=" + hash + "&do=getVideo",
        {
          method: "POST",
          headers: {
            "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Referer":           embedUrl,
            "Origin":            JENIUS_URL,
            "User-Agent":        UA,
          },
          body: "hash=" + encodeURIComponent(hash) + "&r=" + encodeURIComponent(BASE_URL)
        }
      );
    })
    .then(function(res) { return res.json(); })
    .then(function(json) {
      if (!json || !json.videoSource) {
        console.warn("[Jeniusplay] videoSource tidak ada.");
        return [];
      }

      var masterUrl = json.videoSource.replace(".txt", ".m3u8");
      console.log("[Jeniusplay] Master URL: " + masterUrl.substring(0, 70));

      // Parse subtitle dari packed JS
      var jeniusSubs = [];
      var packed = pageHtml.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\)\)/);
      if (packed) {
        var tracksM = packed[0].match(/"tracks":\[([\s\S]*?)\]/);
        if (tracksM) {
          var items = tracksM[1].match(/\{[^}]+\}/g) || [];
          items.forEach(function(item) {
            var labelM = item.match(/"label"\s*:\s*"([^"]+)"/);
            var fileM  = item.match(/"file"\s*:\s*"([^"]+)"/);
            if (fileM) {
              jeniusSubs.push({
                lang:  labelM && labelM[1].toLowerCase().indexOf("indo") >= 0 ? "id" : "en",
                label: labelM ? labelM[1] : "Unknown",
                url:   fileM[1],
              });
            }
          });
        }
      }

      var allSubs = subtitles.concat(jeniusSubs);

      // Kirim langsung ke player tanpa fetch m3u8
      console.log("[Jeniusplay] Kirim langsung ke player");
      return [ makeStream("Jeniusplay", "Auto", masterUrl, allSubs, title, JENIUS_URL) ];
    })
    .catch(function(e) {
      console.error("[Jeniusplay] Error: " + e.message);
      return [];
    });
}

// ── MAIN getStreams ────────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  var title = "";
  var isMovie = mediaType === "movie";

  // STEP 1: Judul dari TMDB
  return fetchJson(
    "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_KEY
  )
  .then(function(tmdb) {
    if (!tmdb) return Promise.reject(new Error("TMDB gagal"));
    title = tmdb.title || tmdb.name;
    console.log("[Idlix] Mencari: \"" + title + "\"");

    // STEP 2: Search
    return fetchJson(
      BASE_URL + "/api/search?q=" + encodeURIComponent(title) + "&page=1&limit=8"
    );
  })
  .then(function(search) {
    if (!search || !search.results || !search.results.length) {
      console.warn("[Idlix] Tidak ada hasil.");
      return Promise.reject(new Error("Tidak ditemukan"));
    }

    var typeKeys = isMovie ? ["movie"] : ["tv_series", "series", "tv"];
    var match = null;
    for (var i = 0; i < search.results.length; i++) {
      if (typeKeys.indexOf(search.results[i].contentType) >= 0) { match = search.results[i]; break; }
    }
    if (!match) match = search.results[0];
    console.log("[Idlix] Match: \"" + match.title + "\" slug: " + match.slug);

    // STEP 3: Content ID
    if (isMovie) {
      return fetchJson(BASE_URL + "/api/movies/" + match.slug)
        .then(function(detail) {
          if (!detail || !detail.id) return Promise.reject(new Error("Detail tidak valid"));
          return { id: detail.id, type: "movie" };
        });
    } else {
      return fetchJson(BASE_URL + "/api/series/" + match.slug)
        .then(function(detail) {
          var ep = null;
          if (detail && detail.firstSeason && detail.firstSeason.seasonNumber === season) {
            var eps = detail.firstSeason.episodes || [];
            for (var i = 0; i < eps.length; i++) {
              if (eps[i].episodeNumber === episode) { ep = eps[i]; break; }
            }
          }
          if (ep) return { id: ep.id, type: "episode" };
          return fetchJson(BASE_URL + "/api/series/" + match.slug + "/season/" + season)
            .then(function(sr) {
              var list = (sr && (sr.season && sr.season.episodes || sr.episodes)) || [];
              for (var i = 0; i < list.length; i++) {
                if (list[i].episodeNumber === episode) return { id: list[i].id, type: "episode" };
              }
              return Promise.reject(new Error("Episode S" + season + "E" + episode + " tidak ditemukan"));
            });
        });
    }
  })
  .then(function(content) {
    console.log("[Idlix] " + content.type + " ID: " + content.id);
    // STEP 4: play-info
    return fetchJson(BASE_URL + "/api/watch/play-info/" + content.type + "/" + content.id);
  })
  .then(function(playInfo) {
    if (!playInfo || !playInfo.claim || !playInfo.redeemUrl) {
      return Promise.reject(new Error("play-info tidak valid: " + JSON.stringify(playInfo)));
    }
    var claim      = playInfo.claim;
    var redeemUrl  = playInfo.redeemUrl;
    var isJenius   = redeemUrl.indexOf("jeniusplay") >= 0;
    var origin     = "";
    try { origin = new URL(redeemUrl).origin; } catch(e) { origin = BASE_URL; }
    console.log("[Idlix] redeemUrl: " + redeemUrl);

    // STEP 5: Redeem
    return fetchJson(redeemUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Referer":       BASE_URL,
        "Origin":        origin,
        "User-Agent":    UA,
        "Accept":        "application/json, */*",
      },
      body: JSON.stringify({ claim: claim })
    }).then(function(redeem) {
      if (!redeem) return Promise.reject(new Error("Redeem gagal"));
      console.log("[Idlix] Redeem OK: " + JSON.stringify(redeem).substring(0, 150));

      var subtitles = (redeem.subtitles || []).map(function(s) {
        return { lang: s.lang || "id", label: s.label || "Indonesian", url: s.path || s.url || s.src };
      });

      var promises = [];

      // Majorplay
      if (!isJenius && redeem.url) {
        promises.push(extractMajorplay(redeem.url, subtitles, title));
      }

      // Jeniusplay
      var jeniusEmbed = redeem.embedUrl || redeem.code
        || (isJenius ? redeem.url : null);
      if (jeniusEmbed && jeniusEmbed.indexOf("jeniusplay") >= 0) {
        promises.push(extractJeniusplay(jeniusEmbed, subtitles, title));
      }

      return Promise.all(promises).then(function(results) {
        var streams = [];
        results.forEach(function(arr) { streams = streams.concat(arr); });
        console.log("[Idlix] BERHASIL! " + streams.length + " stream.");
        return streams;
      });
    });
  })
  .catch(function(e) {
    console.error("[Idlix] Error: " + e.message);
    return [];
  });
}

module.exports = { getStreams };

"use strict";

// ─── IDLIX PROVIDER FOR NUVIO ──────────────────────────────────────────────
// Versi Perbaikan (berdasarkan analisis IdlixProvider.kt)
// Fix playback error pada beberapa film
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
    headers: {
      "User-Agent": UA,
      "Referer":    referer || BASE_URL,
      "Accept":     "text/html,application/xhtml+xml,*/*;q=0.9"
    },
    redirect: "follow"
  })
  .then(function(res) {
    if (!res.ok) {
      console.warn("[fetchText] HTTP " + res.status + " " + url.substring(0,60));
      return null;
    }
    return res.text();
  })
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
  return {
    name:      "Idlix | " + provider,
    title:     quality + " \u2022 " + title,
    url:       url,
    quality:   quality,
    subtitles: subtitles || [],
    headers: {
      "Referer":    referer,
      "User-Agent": UA,
    }
  };
}

// ── M3u8 Parser ────────────────────────────────────────────────────────────

function resolveUrl(base, relative) {
  if (!relative) return null;
  if (relative.indexOf("http") === 0) return relative;
  if (relative.indexOf("//") === 0) return "https:" + relative;
  if (relative.indexOf("/") === 0) {
    try { var u = new URL(base); return u.origin + relative; } catch(e) {}
  }
  return base.substring(0, base.lastIndexOf("/") + 1) + relative;
}

function parseM3u8(masterUrl, referer) {
  return fetchText(masterUrl, referer)
    .then(function(text) {
      if (!text) return null;

      if (text.indexOf("#EXT-X-STREAM-INF") === -1) {
        if (text.indexOf("#EXTINF") !== -1 || text.indexOf("#EXT-X-TARGETDURATION") !== -1) {
          console.log("[M3u8] Media playlist langsung, pakai sebagai Auto.");
          return [{ quality: "Auto", url: masterUrl }];
        }
        return null;
      }

      var lines   = text.split("\n").map(function(l) { return l.trim(); }).filter(Boolean);
      var streams = [];
      var ORDER   = { "4K": 0, "1080p": 1, "720p": 2, "480p": 3, "360p": 4, "Auto": 5 };

      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("#EXT-X-STREAM-INF") !== 0) continue;
        var resM = lines[i].match(/RESOLUTION=(\d+)x(\d+)/i);
        var bwM  = lines[i].match(/BANDWIDTH=(\d+)/i);
        var q    = resM ? heightToQuality(parseInt(resM[2]))
                 : bwM  ? bwToQuality(parseInt(bwM[1]))
                 : "Auto";
        var next = lines[i + 1];
        if (next && next.indexOf("#") !== 0) {
          var resolvedUrl = resolveUrl(masterUrl, next);
          if (resolvedUrl) streams.push({ quality: q, url: resolvedUrl });
        }
      }
      streams.sort(function(a, b) {
        return (ORDER[a.quality] !== undefined ? ORDER[a.quality] : 99)
             - (ORDER[b.quality] !== undefined ? ORDER[b.quality] : 99);
      });
      return streams.length ? streams : null;
    })
    .catch(function(e) { console.warn("[M3u8] " + e.message); return null; });
}

// ── Helper: Ekstrak URL M3U8 dari halaman web ─────────────────────────────

function extractM3u8FromPage(html, pageUrl) {
  var patterns = [
    /(?:source|file|src)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)/i,
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/,
    /(?:url|videoSrc)\s*=\s*["']([^"']+\.m3u8[^"']*)/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = html.match(patterns[i]);
    if (match && match[1]) {
      var found = match[1];
      if (found.indexOf("http") !== 0) found = resolveUrl(pageUrl, found);
      return found;
    }
  }
  // Coba cari iframe
  var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeMatch) return resolveUrl(pageUrl, iframeMatch[1]);
  return null;
}

// ── Majorplay Extractor (diperbaiki) ───────────────────────────────────────

function extractMajorplay(urlOrM3u8, subtitles, title) {
  console.log("[Majorplay] Input: " + urlOrM3u8.substring(0, 70));

  // Jika sudah m3u8, langsung parse
  if (urlOrM3u8.indexOf(".m3u8") > -1 || urlOrM3u8.indexOf("m3u8") > -1) {
    console.log("[Majorplay] URL sudah m3u8.");
    return parseM3u8(urlOrM3u8, BASE_URL)
      .then(function(qualities) {
        if (qualities && qualities.length) {
          return qualities.map(function(q) {
            return makeStream("Majorplay", q.quality, q.url, subtitles, title, BASE_URL);
          });
        }
        return [ makeStream("Majorplay", "Auto", urlOrM3u8, subtitles, title, BASE_URL) ];
      });
  }

  // Jika bukan m3u8, mungkin halaman web, coba ekstrak
  var referer = BASE_URL;
  try { var u = new URL(urlOrM3u8); referer = u.origin; } catch(e) {}

  return fetchText(urlOrM3u8, BASE_URL)
    .then(function(html) {
      if (!html) {
        console.warn("[Majorplay] Halaman kosong, fallback Auto.");
        return [ makeStream("Majorplay", "Auto", urlOrM3u8, subtitles, title, BASE_URL) ];
      }

      var m3u8Url = extractM3u8FromPage(html, urlOrM3u8);
      if (!m3u8Url) {
        console.warn("[Majorplay] M3U8 tidak ditemukan, fallback Auto.");
        return [ makeStream("Majorplay", "Auto", urlOrM3u8, subtitles, title, BASE_URL) ];
      }

      console.log("[Majorplay] Ditemukan M3U8: " + m3u8Url.substring(0, 70));
      return parseM3u8(m3u8Url, referer)
        .then(function(qualities) {
          if (qualities && qualities.length) {
            return qualities.map(function(q) {
              return makeStream("Majorplay", q.quality, q.url, subtitles, title, referer);
            });
          }
          return [ makeStream("Majorplay", "Auto", m3u8Url, subtitles, title, referer) ];
        });
    })
    .catch(function(e) {
      console.error("[Majorplay] Error: " + e.message);
      return [ makeStream("Majorplay", "Auto", urlOrM3u8, subtitles, title, BASE_URL) ];
    });
}

// ── Jeniusplay Extractor (tetap) ───────────────────────────────────────────

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

      var rawSource = json.videoSource;
      var masterUrl = rawSource.indexOf(".m3u8") >= 0
        ? rawSource
        : rawSource.replace(/\.txt$/, ".m3u8");
      if (masterUrl.indexOf("http") !== 0) {
        masterUrl = JENIUS_URL + "/" + masterUrl.replace(/^\//, "");
      }
      console.log("[Jeniusplay] Master URL: " + masterUrl.substring(0, 70));

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

      return parseM3u8(masterUrl, JENIUS_URL)
        .then(function(qualities) {
          if (qualities && qualities.length) {
            console.log("[Jeniusplay] Kualitas: " + qualities.map(function(q) { return q.quality; }).join(", "));
            return qualities.map(function(q) {
              return makeStream("Jeniusplay", q.quality, q.url, allSubs, title, JENIUS_URL);
            });
          }
          return [ makeStream("Jeniusplay", "Auto", masterUrl, allSubs, title, JENIUS_URL) ];
        });
    })
    .catch(function(e) {
      console.error("[Jeniusplay] Error: " + e.message);
      return [];
    });
}

// ── MAIN getStreams (diperbaiki pada pemrosesan redeem) ──────────────────

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
      console.log("[Idlix] Redeem OK: " + JSON.stringify(redeem).substring(0, 200));

      var subtitles = (redeem.subtitles || []).map(function(s) {
        return { lang: s.lang || "id", label: s.label || "Indonesian", url: s.path || s.url || s.src };
      });

      // ── PERBAIKAN UTAMA: Pemrosesan URL multi-sumber ─────────────────
      var streamsPromise = Promise.resolve([]);

      // 1. Cek redeem.url (biasanya Majorplay langsung atau halaman)
      if (redeem.url) {
        var streamUrl = redeem.url;
        console.log("[Idlix] redeem.url ditemukan: " + streamUrl.substring(0, 60));
        // Jika mp4 langsung, buat stream langsung
        if (streamUrl.indexOf(".mp4") >= 0) {
          var q = streamUrl.indexOf("1080") >= 0 ? "1080p"
                : streamUrl.indexOf("720")  >= 0 ? "720p"
                : streamUrl.indexOf("480")  >= 0 ? "480p" : "Auto";
          streamsPromise = Promise.resolve([ makeStream("Direct", q, streamUrl, subtitles, title, BASE_URL) ]);
        } else {
          // Jika bukan mp4, anggap bisa m3u8/halaman → Majorplay extractor
          streamsPromise = extractMajorplay(streamUrl, subtitles, title);
        }
      }

      // 2. Cek redeem.code (bisa berisi URL ke player eksternal atau iframe)
      var code = redeem.code || redeem.embedUrl;
      if (code) {
        console.log("[Idlix] redeem.code/embedUrl ditemukan: " + code.substring(0, 60));
        // Jika mengandung jeniusplay, proses khusus
        if (code.indexOf("jeniusplay") >= 0) {
          streamsPromise = streamsPromise.then(function(existing) {
            return extractJeniusplay(code, subtitles, title).then(function(jeniusStreams) {
              return existing.concat(jeniusStreams);
            });
          });
        } else {
          // Mungkin URL Majorplay tersembunyi di code
          streamsPromise = streamsPromise.then(function(existing) {
            return extractMajorplay(code, subtitles, title).then(function(majorStreams) {
              return existing.concat(majorStreams);
            });
          });
        }
      }

      // 3. Fallback ke redeem.videoUrl jika ada dan berbeda
      if (redeem.videoUrl && redeem.videoUrl !== redeem.url) {
        streamsPromise = streamsPromise.then(function(existing) {
          return extractMajorplay(redeem.videoUrl, subtitles, title).then(function(fallbackStreams) {
            return existing.concat(fallbackStreams);
          });
        });
      }

      return streamsPromise;
    });
  })
  .then(function(streams) {
    console.log("[Idlix] BERHASIL! " + streams.length + " stream.");
    return streams;
  })
  .catch(function(e) {
    console.error("[Idlix] Error: " + e.message);
    return [];
  });
}

module.exports = { getStreams };

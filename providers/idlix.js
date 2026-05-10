"use strict";

var BASE_URL   = "https://z1.idlixku.com";
var TMDB_KEY   = "b030404650f279792a8d3287232358e3";
var UA         = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

var BASE_HEADERS = {
  "User-Agent":      UA,
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
  "Referer":         BASE_URL,
  "Origin":          BASE_URL,
};

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

function getStreams(tmdbId, mediaType, season, episode) {
  var title = "";
  var isMovie = mediaType === "movie";

  return fetchJson(
    "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_KEY
  )
  .then(function(tmdb) {
    if (!tmdb) return Promise.reject(new Error("TMDB gagal"));
    title = tmdb.title || tmdb.name;
    console.log("[Idlix] Mencari: \"" + title + "\"");
    return fetchJson(BASE_URL + "/api/search?q=" + encodeURIComponent(title) + "&page=1&limit=8");
  })
  .then(function(search) {
    if (!search || !search.results || !search.results.length) return Promise.reject(new Error("Tidak ditemukan"));
    var typeKeys = isMovie ? ["movie"] : ["tv_series", "series", "tv"];
    var match = null;
    for (var i = 0; i < search.results.length; i++) {
      if (typeKeys.indexOf(search.results[i].contentType) >= 0) { match = search.results[i]; break; }
    }
    if (!match) match = search.results[0];
    console.log("[Idlix] Match: \"" + match.title + "\" slug: " + match.slug);

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
              return Promise.reject(new Error("Episode tidak ditemukan"));
            });
        });
    }
  })
  .then(function(content) {
    console.log("[Idlix] " + content.type + " ID: " + content.id);
    return fetchJson(BASE_URL + "/api/watch/play-info/" + content.type + "/" + content.id);
  })
  .then(function(playInfo) {
    if (!playInfo || !playInfo.claim || !playInfo.redeemUrl) return Promise.reject(new Error("play-info tidak valid"));
    var claim     = playInfo.claim;
    var redeemUrl = playInfo.redeemUrl;
    var redeemDomain = "";
    try { redeemDomain = new URL(redeemUrl).origin; } catch(e) { redeemDomain = BASE_URL; }
    console.log("[Idlix] Redeem URL: " + redeemUrl);

    return fetchJson(redeemUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Referer":       BASE_URL,
        "Origin":        redeemDomain,
        "User-Agent":    UA,
        "Accept":        "application/json, */*",
      },
      body: JSON.stringify({ claim: claim })
    }).then(function(redeem) {
      if (!redeem) return Promise.reject(new Error("Redeem gagal"));
      var streamUrl = redeem.url || redeem.code || redeem.embedUrl;
      if (!streamUrl) return Promise.reject(new Error("Tidak ada URL stream"));

      var subtitles = (redeem.subtitles || []).map(function(s) {
        return { lang: s.lang || "id", label: s.label || "Indonesian", url: s.path || s.url || s.src };
      });

      var stream = {
        name:      "Idlix",
        title:     "Auto \u2022 " + title,
        url:       streamUrl,
        quality:   "Auto",
        subtitles: subtitles,
        headers: {
          "Referer":    redeemDomain,
          "Origin":     redeemDomain,
          "User-Agent": UA,
        }
      };

      console.log("[Idlix] BERHASIL! URL: " + streamUrl.substring(0, 80));
      return [stream];
    });
  })
  .catch(function(e) {
    console.error("[Idlix] Error: " + e.message);
    return [];
  });
}

module.exports = { getStreams };

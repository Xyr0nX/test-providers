// 4khdhub provider/resolver:
// mencari halaman konten dari TMDB ID, mengekstrak link movie/episode,
// lalu me-resolve sumber seperti HubCloud/HubDrive menjadi stream final
// dengan metadata yang dibersihkan, diprioritaskan, dan divalidasi.

var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "4khdhub";
var DOMAINS_URL = "https://raw.githubusercontent.com/Xyr0nX/NGEX/refs/heads/main/manifest.json";
var DEFAULT_MAIN_URL = "https://4khdhub.dad";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var DEBUG = false;

var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1"
};

var cachedDomains = null;
var domainCacheTs = 0;
var DOMAIN_CACHE_TTL = 60 * 60 * 1000;

function dbg() {
  if (!DEBUG) return;
  console.log.apply(console, arguments);
}

function assign(target, source) {
  var out = {};
  var k;
  target = target || {};
  source = source || {};
  for (k in target) out[k] = target[k];
  for (k in source) out[k] = source[k];
  return out;
}

function fetchText(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: assign(DEFAULT_HEADERS, options.headers || {}),
    body: options.body
  }).then(function (res) {
    if (!res.ok && res.status !== 301 && res.status !== 302) {
      throw new Error("HTTP " + res.status + " -> " + url);
    }
    return res.text();
  });
}

function fetchJson(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: assign(DEFAULT_HEADERS, options.headers || {}),
    body: options.body
  }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status + " -> " + url);
    return res.json();
  });
}

function fetchResponse(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: assign(DEFAULT_HEADERS, options.headers || {}),
    body: options.body
  });
}

function fixUrl(url, baseUrl) {
  if (!url) return "";
  if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
  if (url.indexOf("//") === 0) return "https:" + url;
  try {
    return new URL(url, baseUrl).toString();
  } catch (e) {
    return url;
  }
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function decodeBase64(value) {
  try {
    return Buffer.from(value, "base64").toString("binary");
  } catch (e) {
    return "";
  }
}

function rot13(value) {
  return String(value || "").replace(/[A-Za-z]/g, function (char) {
    var base = char <= "Z" ? 65 : 97;
    return String.fromCharCode((char.charCodeAt(0) - base + 13) % 26 + base);
  });
}

function levenshteinDistance(s, t) {
  if (s === t) return 0;
  var n = s.length;
  var m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;

  var d = [];
  var i, j, cost;

  for (i = 0; i <= n; i += 1) {
    d[i] = [];
    d[i][0] = i;
  }
  for (j = 0; j <= m; j += 1) d[0][j] = j;

  for (i = 1; i <= n; i += 1) {
    for (j = 1; j <= m; j += 1) {
      cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }

  return d[n][m];
}

function parseBytes(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  var match = String(val).match(/^([0-9.]+)\s*([a-zA-Z]+)$/);
  if (!match) return 0;
  var num = parseFloat(match[1]);
  var unit = match[2].toLowerCase();
  var multiplier = 1;
  if (unit.indexOf("k") === 0) multiplier = 1024;
  else if (unit.indexOf("m") === 0) multiplier = 1024 * 1024;
  else if (unit.indexOf("g") === 0) multiplier = 1024 * 1024 * 1024;
  else if (unit.indexOf("t") === 0) multiplier = 1024 * 1024 * 1024 * 1024;
  return num * multiplier;
}

function formatBytes(val) {
  if (!val) return "0 B";
  var k = 1024;
  var sizes = ["B", "KB", "MB", "GB", "TB"];
  var i = Math.floor(Math.log(val) / Math.log(k));
  if (i < 0) i = 0;
  return parseFloat((val / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function detectQualityFromSources(parts) {
  var sources = Array.isArray(parts) ? parts : [parts];
  var i, text, m;

  for (i = 0; i < sources.length; i += 1) {
    text = String(sources[i] || "").toLowerCase();
    m = text.match(/\b(2160p|1440p|1080p|720p|480p)\b/);
    if (m) return m[1];
    if (/\b4k\b|\buhd\b/.test(text) && !/\b1080p\b/.test(text)) return "2160p";
  }

  return "Auto";
}

function inferLang(text) {
  var t = String(text || "").toLowerCase();
  var langs = [];

  if (t.indexOf("hindi") !== -1) langs.push("Hindi");
  if (t.indexOf("tamil") !== -1) langs.push("Tamil");
  if (t.indexOf("telugu") !== -1) langs.push("Telugu");
  if (t.indexOf("malayalam") !== -1) langs.push("Malayalam");
  if (t.indexOf("kannada") !== -1) langs.push("Kannada");
  if (t.indexOf("bengali") !== -1) langs.push("Bengali");
  if (t.indexOf("punjabi") !== -1) langs.push("Punjabi");
  if (t.indexOf("english") !== -1 || /\beng\b/.test(t)) langs.push("English");

  langs = uniqueBy(langs, function (x) { return x; });

  if (langs.length > 2) return "Multi Audio";
  if (langs.length === 2) return langs.join("-");
  if (langs.length === 1) return langs[0];
  if (t.indexOf("dual audio") !== -1 || t.indexOf("dual") !== -1) return "Dual Audio";

  return "EN";
}

function cleanTech(title) {
  var normalized = String(title || "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/WEB[-_. ]?DL/gi, "WEB-DL")
    .replace(/WEB[-_. ]?RIP/gi, "WEBRIP")
    .replace(/H[ .]?265/gi, "H265")
    .replace(/H[ .]?264/gi, "H264")
    .replace(/DDP[ .]?([0-9]\.[0-9])/gi, "DDP$1")
    .replace(/DTS[-_. ]?HD[-_. ]?MA/gi, "DTSHDMA")
    .replace(/DOLBY[-_. ]?VISION/gi, "DOLBYVISION");

  var allowed = {
    "WEB-DL": 1, "WEBRIP": 1, "BLURAY": 1, "HDRIP": 1, "DVDRIP": 1, "HDTV": 1,
    "CAM": 1, "TS": 1, "BRRIP": 1, "BDRIP": 1, "REMUX": 1,
    "H264": 1, "H265": 1, "X264": 1, "X265": 1, "HEVC": 1, "AVC": 1,
    "AAC": 1, "AC3": 1, "DTS": 1, "DTSHDMA": 1, "TRUEHD": 1, "ATMOS": 1,
    "DD": 1, "HDR": 1, "HDR10": 1, "HDR10+": 1, "DV": 1, "DOLBYVISION": 1,
    "NF": 1, "CR": 1, "SDR": 1
  };

  var parts = normalized.split(/[ ._()\[\]+-]+/);
  var out = [];
  var seen = {};
  var i, part;

  for (i = 0; i < parts.length; i += 1) {
    part = String(parts[i] || "").toUpperCase();
    if (!part) continue;
    if (allowed[part] || /^DDP\d\.\d$/.test(part)) {
      if (!seen[part]) {
        seen[part] = 1;
        out.push(part);
      }
    }
  }

  return out.join(" ");
}

function cleanLabelText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/Download HubDrive/gi, "")
    .replace(/Download HubCloud/gi, "")
    .replace(/Download PixelDrain/gi, "")
    .replace(/Download BuzzServer/gi, "")
    .replace(/4kHDHub\.Com/gi, "")
    .replace(/4kHdHub\.com/gi, "")
    .trim();
}

function extractSize(text) {
  var m = String(text || "").match(/\b(\d+(?:\.\d+)?)\s*(GB|MB)\b/i);
  return m ? (m[1] + " " + m[2].toUpperCase()) : "";
}

function safeDecodeURIComponent(str) {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str;
  }
}

function rebuildMetaFromFinal(url, fallbackLabel) {
  var raw = safeDecodeURIComponent(String(url || ""));
  return {
    quality: detectQualityFromSources([raw, fallbackLabel]),
    size: extractSize(raw) || extractSize(fallbackLabel),
    tech: cleanTech(raw + " " + fallbackLabel)
  };
}

function buildMeta(label, quality, size, tech, langHint) {
  var cleanedLabel = cleanLabelText(label);
  var lang = inferLang((langHint || "") + " " + cleanedLabel);
  var parts = [];

  if (quality && quality !== "Auto") parts.push(quality);
  if (lang) parts.push(lang);
  if (size) parts.push(size);
  if (tech) parts.push(tech);

  return {
    name: PROVIDER_NAME + " - " + lang,
    title: (/^S\d+\s*E\d+/i.test(cleanedLabel) ? cleanedLabel + " | " : "") + (parts.join(" | ") || "Stream")
  };
}

function buildStream(label, url, quality, headers, size, tech, langHint) {
  var finalUrl = String(url || "").trim();
  var rebuilt = rebuildMetaFromFinal(finalUrl, label);
  var finalQuality = rebuilt.quality !== "Auto" ? rebuilt.quality : (quality || "Auto");
  var finalSize = rebuilt.size || size || extractSize(label);
  var finalTech = rebuilt.tech || tech || cleanTech(label);
  var cleanedLabel = cleanLabelText(label);
  var meta = buildMeta(cleanedLabel, finalQuality, finalSize, finalTech, langHint);

  return {
    name: meta.name,
    title: meta.title,
    url: finalUrl,
    quality: finalQuality,
    headers: headers && Object.keys(headers).length ? headers : undefined,
    behaviorHints: {
      bingeGroup: "4khdhub-" + String(finalQuality || "auto").toLowerCase()
    }
  };
}

function uniqueBy(list, keyFn) {
  var seen = {};
  var out = [];
  var i, key;
  for (i = 0; i < list.length; i += 1) {
    key = keyFn(list[i]);
    if (seen[key]) continue;
    seen[key] = 1;
    out.push(list[i]);
  }
  return out;
}

function dedupeStreams(streams) {
  return uniqueBy(streams, function (item) {
    return String(item.url || "").split("#")[0].toLowerCase() + "|" + String(item.quality || "").toLowerCase();
  });
}

function isPlayableMediaUrl(url) {
  var u = String(url || "").toLowerCase();

  if (!u) return false;
  if (/\.(mkv|mp4|m3u8)(\?|$)/.test(u)) return true;
  if (u.indexOf("video-downloads.googleusercontent.com/") !== -1) return true;
  if (u.indexOf(".r2.dev/") !== -1) return true;
  if (u.indexOf(".workers.dev/") !== -1) return true;
  if (u.indexOf("hub.lotuscdn.club/") !== -1) return true;

  if (/\/drive\/admin(?:[/?#]|$)/.test(u)) return false;
  if (/^https?:\/\/(?:www\.)?google\.com\/search\?/i.test(u)) return false;
  if (/^https?:\/\/t\.me\//i.test(u)) return false;
  if (/^https?:\/\/one\.one\.one\.one\/?$/i.test(u)) return false;
  if (/^https?:\/\/(?:www\.)?hdhub4u\./i.test(u)) return false;
  if (/tinyurl\.com\/unblock-ban-site/i.test(u)) return false;
  if (/hubcloud\.[^\/]+\/tg\/go\?/i.test(u)) return false;
  if (/hubcloud\.[^\/]+\/drive\/[^\/?#]+$/i.test(u)) return false;

  return false;
}

function validateResolvedStreams(streams) {
  var valid = [];
  var i, s;

  for (i = 0; i < (streams || []).length; i += 1) {
    s = streams[i];
    if (!s || !s.url) continue;
    if (!isPlayableMediaUrl(s.url)) continue;
    valid.push(s);
  }

  return valid;
}

function hostConfidence(url) {
  var u = String(url || "").toLowerCase();
  if (u.indexOf("hubcloud") !== -1) return 100;
  if (u.indexOf("pixeldrain") !== -1) return 90;
  if (u.indexOf("hubcdn") !== -1) return 80;
  if (u.indexOf("10gbps") !== -1 || u.indexOf("rohitkiskk.workers.dev") !== -1) return 75;
  if (u.indexOf("lotuscdn") !== -1) return 70;
  if (u.indexOf(".r2.dev") !== -1) return 68;
  if (u.indexOf(".workers.dev") !== -1) return 66;
  if (u.indexOf("hblinks") !== -1) return 60;
  if (u.indexOf("hubdrive") !== -1) return 30;
  return 10;
}

function sortLinksByPriority(links) {
  return (links || []).slice().sort(function (a, b) {
    return hostConfidence(b.url) - hostConfidence(a.url);
  });
}

function getDomains() {
  var now = Date.now();
  if (cachedDomains && now - domainCacheTs < DOMAIN_CACHE_TTL) {
    return Promise.resolve(cachedDomains);
  }

  return fetchJson(DOMAINS_URL).then(function (json) {
    cachedDomains = json || {};
    domainCacheTs = now;
    return cachedDomains;
  }).catch(function () {
    cachedDomains = cachedDomains || {};
    domainCacheTs = now;
    return cachedDomains;
  });
}

function getMainUrl() {
  return getDomains().then(function (domains) {
    return domains["4khdhub"] || domains.n4khdhub || DEFAULT_MAIN_URL;
  });
}

function getTmdbNames(tmdbId, mediaType) {
  var type = mediaType === "movie" ? "movie" : "tv";
  var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  return fetchJson(url).then(function (data) {
    var title = data.name || data.title || "";
    var original = data.original_name || data.original_title || title;
    var alt = "";
    var year = 0;

    if (mediaType === "movie" && data.release_date) {
      year = parseInt(String(data.release_date).split("-")[0], 10) || 0;
    } else if (mediaType !== "movie" && data.first_air_date) {
      year = parseInt(String(data.first_air_date).split("-")[0], 10) || 0;
    }

    if (original && (original.indexOf(":") !== -1 || / and /i.test(original))) {
      alt = original.split(":")[0].split(/ and /i)[0].trim();
    }

    return {
      title: title,
      original: original,
      alt: alt,
      year: year
    };
  }).catch(function () {
    return { title: "", original: "", alt: "", year: 0 };
  });
}

function searchContent(query, mediaType, year) {
  return getMainUrl().then(function (mainUrl) {
    var searchUrl = mainUrl + "/?s=" + encodeURIComponent(query);

    return fetchText(searchUrl).then(function (html) {
      var $ = cheerio.load(html);
      var results = [];

      $("div.card-grid a, div.card-grid-small a, a.movie-card").each(function (_, el) {
        var href = fixUrl($(el).attr("href"), mainUrl);
        var title = $(el).find("h3").first().text().trim() ||
          $(el).attr("title") ||
          $(el).attr("aria-label") ||
          $(el).find("img").attr("alt") ||
          $(el).text().trim();

        var text = $(el).text().trim();
        var yearMatch = text.match(/\b(19|20)\d{2}\b/);
        var itemYear = yearMatch ? parseInt(yearMatch[0], 10) : 0;

        if (!href || !title) return;
        if (href.indexOf("/category/") !== -1 || href.indexOf("/tag/") !== -1) return;

        var isSeriesCard = /series/i.test(text) || /-series-/i.test(href);
        var wantSeries = mediaType !== "movie";

        if (wantSeries && !isSeriesCard && /-movie-/i.test(href)) return;
        if (!wantSeries && isSeriesCard) return;

        var cleanedTitle = String(title).replace(/[.*?]/g, "").replace(/\s+details$/i, "").trim();
        var distance = levenshteinDistance(normalizeTitle(cleanedTitle), normalizeTitle(query));
        var yearDistance = 0;
        if (year && itemYear) yearDistance = Math.abs(itemYear - year);

        var exactBoost = normalizeTitle(cleanedTitle) === normalizeTitle(query) ? -100 : 0;
        var includesBoost = normalizeTitle(cleanedTitle).indexOf(normalizeTitle(query)) !== -1 ? -10 : 0;

        results.push({
          href: href,
          title: cleanedTitle,
          year: itemYear,
          distance: distance,
          yearDistance: yearDistance,
          score: distance + yearDistance + exactBoost + includesBoost
        });
      });

      if (!results.length) return null;

      results = results.filter(function (item) {
        if (!year || !item.year) return true;
        return item.yearDistance <= 1;
      });

      if (!results.length) return null;

      results.sort(function (a, b) {
        return a.score - b.score || a.distance - b.distance || a.yearDistance - b.yearDistance;
      });

      return results[0].href || null;
    });
  });
}

function collectMovieLinks($, pageUrl) {
  var links = [];

  $("div.download-item, div[data-file-id]").each(function (_, el) {
    var root = $(el);
    var href = fixUrl(root.find("a[href]").first().attr("href"), pageUrl);
    var label = cleanLabelText(root.text().trim() || "Movie");
    var fileTitle = cleanLabelText(root.find(".file-title").first().text().trim() || "");

    if (!href) return;

    links.push({
      url: href,
      label: label,
      fileTitle: fileTitle,
      rawHtml: root.html() || ""
    });
  });

  return uniqueBy(links, function (item) {
    return String(item.url || "").toLowerCase();
  });
}

function collectEpisodeLinks($, pageUrl, season, episode) {
  var sNum = Number(season);
  var eNum = Number(episode);
  var label = "S" + sNum + " E" + eNum;
  var found = [];

  $("div.episodes-list div.season-item").each(function (_, seasonEl) {
    var seasonText = $(seasonEl).find("div.episode-number").first().text();
    var seasonMatch = seasonText.match(/S(?:eason)?\s*([0-9]+)/i);
    if (!seasonMatch || Number(seasonMatch[1]) !== sNum) return;

    $(seasonEl).find("div.episode-download-item").each(function (__, episodeEl) {
      var epText = $(episodeEl).text();
      var epMatch = epText.match(/Episode-?\s*0*([0-9]+)/i) || epText.match(/\bE\s*0*([0-9]+)/i);
      if (!epMatch || Number(epMatch[1]) !== eNum) return;

      $(episodeEl).find("a[href]").each(function (___, a) {
        var href = fixUrl($(a).attr("href"), pageUrl);
        if (!href) return;

        found.push({
          url: href,
          label: label,
          fileTitle: cleanLabelText($(episodeEl).find(".file-title, .episode-file-title").first().text().trim() || ""),
          rawHtml: $(episodeEl).html() || ""
        });
      });
    });
  });

  if (!found.length) {
    $("div.episode-download-item").each(function (_, item) {
      var text = $(item).text();
      if (!new RegExp("Episode-?\\s*0*" + eNum + "\\b", "i").test(text) &&
          !new RegExp("\\bE\\s*0*" + eNum + "\\b", "i").test(text)) {
        return;
      }

      $(item).find("a[href]").each(function (__, a) {
        var href = fixUrl($(a).attr("href"), pageUrl);
        if (!href) return;

        found.push({
          url: href,
          label: label,
          fileTitle: cleanLabelText($(item).find(".file-title, .episode-file-title").first().text().trim() || ""),
          rawHtml: $(item).html() || ""
        });
      });
    });
  }

  return uniqueBy(found, function (item) {
    return String(item.url || "").toLowerCase();
  });
}

function getRedirectLinks(url) {
  var REDIRECT_REGEX = /s\('o','([A-Za-z0-9+/=]+)'\)|ck\('_wp_http_\d+','([^']+)'\)/g;

  return fetchText(url).then(function (html) {
    var combined = "";
    var match;

    while ((match = REDIRECT_REGEX.exec(html)) !== null) {
      combined += match[1] || match[2] || "";
    }

    if (!combined) return "";

    try {
      var decoded = decodeBase64(rot13(decodeBase64(decodeBase64(combined))));
      var json = JSON.parse(decoded);
      var direct = decodeBase64(json.o || "").trim();

      if (direct) return direct;

      var data = decodeBase64(json.data || "");
      var blogUrl = json.blog_url || "";
      if (!data || !blogUrl) return "";

      return fetchText(blogUrl + "?re=" + encodeURIComponent(data)).then(function (txt) {
        return String(txt || "").trim();
      }).catch(function () {
        return "";
      });
    } catch (e) {
      return "";
    }
  }).catch(function () {
    return "";
  });
}

function resolvePixeldrain(url, label, quality, referer, size, tech, langHint) {
  try {
    var parsed = new URL(url);
    var parts = parsed.pathname.split("/");
    var id = parts[parts.length - 1] || parts[parts.length - 2] || "";
    if (!id) return Promise.resolve([]);

    return Promise.resolve([
      buildStream(label + " Pixeldrain", "https://pixeldrain.com/api/file/" + id + "?download", quality, referer ? { Referer: referer } : {}, size, tech, langHint)
    ]);
  } catch (e) {
    return Promise.resolve([]);
  }
}

function resolveHubcdn(url, label, quality, size, tech, langHint) {
  return fetchText(url, { headers: { Referer: url } }).then(function (html) {
    var encoded = "";
    var match1 = html.match(/r=([A-Za-z0-9+/=]+)/);
    var match2 = html.match(/reurl\s*=\s*"([^"]+)"/);

    if (match1 && match1[1]) encoded = match1[1];
    else if (match2 && match2[1]) encoded = match2[1].split("?r=").pop();

    if (!encoded) return [];

    var decoded = decodeBase64(encoded);
    if (!decoded) return [];

    var finalUrl = decoded.split("link=").pop();
    if (!finalUrl || finalUrl === encoded) return [];

    return [
      buildStream(label + " HUBCDN", finalUrl, quality, { Referer: url }, size, tech, langHint)
    ];
  }).catch(function () {
    return [];
  });
}

function resolveHubdrive(url, label, quality) {
  return fetchText(url, { headers: { Referer: url } }).then(function (html) {
    var $ = cheerio.load(html);
    var title = $("title").first().text().trim();
    var fileId = (String(url).match(/\/file\/(\d+)/i) || [])[1] || "";

    var genericLanding =
      /HubDrive | G-Drive File Sharing Site/i.test(title) &&
      html.indexOf("drive.google") === -1 &&
      html.indexOf("googleusercontent") === -1 &&
      (!fileId || html.indexOf(fileId) === -1);

    if (genericLanding) return [];

    var href =
      fixUrl($("a.btn.btn-primary.btn-user.btn-success1.m-1").attr("href"), url) ||
      fixUrl($("a[href*='download']").first().attr("href"), url) ||
      fixUrl($("a[href*='drive.google']").first().attr("href"), url) ||
      fixUrl($("a[href*='googleusercontent']").first().attr("href"), url);

    if (!href) return [];
    return resolveLink(href, label, url, quality);
  }).catch(function () {
    return [];
  });
}

function resolve10Gbps(url, label, quality, size, tech, langHint) {
  function step(current, depth) {
    if (depth >= 4) return Promise.resolve([]);

    return fetchResponse(current, {
      redirect: "manual",
      headers: { Referer: current }
    }).then(function (res) {
      var finalUrl = res.url || current;
      var contentType = String(res.headers.get("content-type") || "").toLowerCase();
      var location = res.headers.get("location") || "";

      if (
        finalUrl.indexOf("video-downloads.googleusercontent.com/") !== -1 ||
        finalUrl.indexOf(".r2.dev/") !== -1 ||
        finalUrl.indexOf(".workers.dev/") !== -1 ||
        finalUrl.indexOf("hub.lotuscdn.club/") !== -1 ||
        finalUrl.indexOf("rohitkiskk.workers.dev/") !== -1 ||
        contentType.indexOf("video/") !== -1 ||
        contentType.indexOf("octet-stream") !== -1
      ) {
        return [
          buildStream(label + " 10Gbps", finalUrl, quality, { Referer: current }, size, tech, langHint)
        ];
      }

      if (location) {
        return step(fixUrl(location, current), depth + 1);
      }

      return [];
    }).catch(function () {
      return [];
    });
  }

  return step(url, 0);
}

function isTrustedDirectCandidate(link) {
  var u = String(link || "").toLowerCase();

  if (!u) return false;
  if (u.indexOf("video-downloads.googleusercontent.com/") !== -1) return true;
  if (u.indexOf(".r2.dev/") !== -1) return true;
  if (u.indexOf(".workers.dev/") !== -1) return true;
  if (u.indexOf("hub.lotuscdn.club/") !== -1) return true;
  if (/\.(mkv|mp4|m3u8)(\?|$)/.test(u)) return true;

  return false;
}

function resolveHubcloud(url, label, referer, quality, langHintFromCaller) {
  var baseHeaders = referer ? { Referer: referer } : {};

  function parseEntry(entryUrl, sourceReferer) {
    return fetchText(entryUrl, {
      headers: assign(baseHeaders, { Referer: sourceReferer || url })
    }).then(function (html) {
      var $ = cheerio.load(html);
      var sizeText = $("i#size").first().text().trim() ||
        $("#size").first().text().trim() ||
        $("#file-size").first().text().trim();

      var size = sizeText || "";
      var sizeBytes = parseBytes(sizeText);
      if (sizeBytes && !size) size = formatBytes(sizeBytes);

      var header = $("div.card-header").first().text().trim() || $("title").first().text().trim();
      var tech = cleanTech(header);
      var finalQuality = detectQualityFromSources([header, quality, langHintFromCaller]);
      var directStreams = [];
      var asyncTasks = [];

      $("a.btn[href], a[href]").each(function (_, el) {
        var link = fixUrl($(el).attr("href"), entryUrl);
        var text = $(el).text().trim().toLowerCase();

        if (!link) return;

        if (text.indexOf("buzzserver") !== -1) {
          asyncTasks.push(
            fetchResponse(link + "/download", {
              headers: { Referer: link },
              redirect: "manual"
            }).then(function (res) {
              var redirected =
                res.headers.get("hx-redirect") ||
                res.headers.get("HX-Redirect") ||
                res.headers.get("location") ||
                "";

              if (!redirected) return [];
              return [
                buildStream(label + " BuzzServer", redirected, finalQuality, { Referer: link }, size, tech, header || langHintFromCaller)
              ];
            }).catch(function () {
              return [];
            })
          );
          return;
        }

        if (text.indexOf("pixel") !== -1 || link.indexOf("pixeldrain") !== -1) {
          asyncTasks.push(resolvePixeldrain(link, label, finalQuality, entryUrl, size, tech, header || langHintFromCaller));
          return;
        }

        if (text.indexOf("10gbps") !== -1) {
          asyncTasks.push(resolve10Gbps(link, label, finalQuality, size, tech, header || langHintFromCaller));
          return;
        }

        if (isTrustedDirectCandidate(link)) {
          directStreams.push(
            buildStream(label, link, finalQuality, { Referer: entryUrl }, size, tech, header || langHintFromCaller)
          );
        }
      });

      if (!asyncTasks.length) return directStreams;

      return Promise.all(asyncTasks).then(function (groups) {
        var all = directStreams.slice();
        var i;
        for (i = 0; i < groups.length; i += 1) all = all.concat(groups[i] || []);
        return all;
      });
    });
  }

  if (/hubcloud\.php/i.test(url)) {
    return parseEntry(url, url).catch(function () {
      return [];
    });
  }

  return fetchText(url, { headers: baseHeaders }).then(function (html) {
    var $ = cheerio.load(html);
    var raw = $("#download").attr("href") ||
      $("a[href*='hubcloud.php']").attr("href") ||
      $("iframe").attr("src");
    var entryUrl = fixUrl(raw, url);

    if (!entryUrl) return [];
    return parseEntry(entryUrl, url);
  }).catch(function () {
    return [];
  });
}

function resolveHblinks(url, label, referer, quality, langHint) {
  return fetchText(url).then(function (html) {
    var $ = cheerio.load(html);
    var hrefs = [];

    $("h3 a, h5 a, div.entry-content p a, a[href]").each(function (_, el) {
      var href = fixUrl($(el).attr("href"), url);
      if (!href) return;
      if (!/hubcloud|hubdrive|pixeldrain|10gbps|hubcdn/i.test(href)) return;
      hrefs.push(href);
    });

    hrefs = uniqueBy(hrefs, function (x) { return x; });

    return Promise.all(hrefs.map(function (href) {
      return resolveLink(href, label, referer || url, quality, langHint).catch(function () {
        return [];
      });
    })).then(function (groups) {
      var out = [];
      var i;
      for (i = 0; i < groups.length; i += 1) out = out.concat(groups[i] || []);
      return out;
    });
  }).catch(function () {
    return [];
  });
}

function resolveLink(rawUrl, label, referer, quality, langHint) {
  if (!rawUrl) return Promise.resolve([]);
  quality = quality || "Auto";
  referer = referer || "";

  function finalize(streams) {
    return Promise.resolve(validateResolvedStreams(streams));
  }

  function next(url) {
    var lower = String(url || "").toLowerCase();

    if (/\.(m3u8|mp4|mkv)(\?|$)/i.test(url)) {
      return finalize([
        buildStream(label, url, quality, referer ? { Referer: referer } : {}, "", "", langHint)
      ]);
    }

    if (lower.indexOf("hubcloud") !== -1) {
      return resolveHubcloud(url, label, referer, quality, langHint).then(finalize);
    }
    if (lower.indexOf("pixeldrain") !== -1) {
      return resolvePixeldrain(url, label, quality, referer, "", "", langHint).then(finalize);
    }
    if (lower.indexOf("hubcdn") !== -1) {
      return resolveHubcdn(url, label, quality, "", "", langHint).then(finalize);
    }
    if (lower.indexOf("hblinks") !== -1) {
      return resolveHblinks(url, label, referer, quality, langHint).then(finalize);
    }
    if (lower.indexOf("hubdrive") !== -1) {
      return resolveHubdrive(url, label, quality).then(finalize);
    }

    return finalize([
      buildStream(label, url, quality, referer ? { Referer: referer } : {}, "", "", langHint)
    ]);
  }

  if (rawUrl.indexOf("id=") !== -1 || rawUrl.indexOf("/id/") !== -1) {
    return getRedirectLinks(rawUrl).then(function (redirected) {
      return next(redirected || rawUrl);
    }).catch(function () {
      return next(rawUrl);
    });
  }

  return next(rawUrl);
}

function extractCandidateQuality(item) {
  return detectQualityFromSources([
    item.fileTitle || "",
    item.label || "",
    item.rawHtml || ""
  ]);
}

function extractLangHint(item) {
  return [
    item.fileTitle || "",
    item.label || "",
    item.rawHtml || ""
  ].join(" ");
}

function extractFromPage(contentUrl, mediaType, season, episode) {
  return fetchText(contentUrl).then(function (html) {
    var $ = cheerio.load(html);
    var isMoviePage = $("div.episodes-list").length === 0;
    var links = (mediaType === "movie" || isMoviePage)
      ? collectMovieLinks($, contentUrl)
      : collectEpisodeLinks($, contentUrl, season, episode);

    if (!links.length) return [];

    links = sortLinksByPriority(links);

    return Promise.all(links.map(function (item) {
      var quality = extractCandidateQuality(item);
      var label = cleanLabelText(item.fileTitle || item.label || PROVIDER_NAME);
      var langHint = extractLangHint(item);

      return resolveLink(item.url, label, contentUrl, quality, langHint).catch(function () {
        return [];
      });
    })).then(function (groups) {
      var streams = [];
      var i;

      for (i = 0; i < groups.length; i += 1) {
        streams = streams.concat(groups[i] || []);
      }

      streams.sort(function (a, b) {
        return hostConfidence(b.url) - hostConfidence(a.url);
      });

      streams = dedupeStreams(streams);
      return streams;
    });
  });
}

function findContentUrl(tmdbId, mediaType) {
  return getTmdbNames(tmdbId, mediaType).then(function (names) {
    if (!names.title && !names.original) return null;

    return searchContent(names.title, mediaType, names.year).then(function (found) {
      if (found) return found;

      if (names.original && names.original !== names.title) {
        return searchContent(names.original, mediaType, names.year).then(function (found2) {
          if (found2) return found2;
          if (names.alt) return searchContent(names.alt, mediaType, names.year);
          return null;
        });
      }

      if (names.alt) return searchContent(names.alt, mediaType, names.year);
      return null;
    });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return findContentUrl(tmdbId, mediaType).then(function (contentUrl) {
    if (!contentUrl) return [];
    return extractFromPage(contentUrl, mediaType, season, episode);
  }).catch(function () {
    return [];
  });
}

module.exports = {
  getStreams: getStreams
};

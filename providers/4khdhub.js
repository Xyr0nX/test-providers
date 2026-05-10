// the script is just for testing
var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "4khdhub";
var DOMAINS_URL = "https://raw.githubusercontent.com/Xyr0nX/NGEX/refs/heads/main/manifest.json";
var DEFAULT_MAIN_URL = "https://4khdhub.dad";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1"
};

var cachedDomains = null;

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

function parseQuality(text) {
  var value = String(text || "").toLowerCase();
  var m = value.match(/\b(\d{3,4}p)\b/);
  if (m) return m[1];
  if (/2160p|4k|uhd/.test(value)) return "2160p";
  if (/1440p|qhd/.test(value)) return "1440p";
  if (/1080p|fullhd/.test(value)) return "1080p";
  if (/720p/.test(value)) return "720p";
  if (/480p/.test(value)) return "480p";
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
  if (t.indexOf("english") !== -1) langs.push("English");

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
    .replace(/DDP[ .]?([0-9]\.[0-9])/gi, "DDP$1");

  var allowed = {
    "WEB-DL": 1, "WEBRIP": 1, "BLURAY": 1, "HDRIP": 1, "DVDRIP": 1, "HDTV": 1,
    "CAM": 1, "TS": 1, "BRRIP": 1, "BDRIP": 1, "H264": 1, "H265": 1, "X264": 1,
    "X265": 1, "HEVC": 1, "AVC": 1, "AAC": 1, "AC3": 1, "DTS": 1, "MP3": 1,
    "FLAC": 1, "DD": 1, "ATMOS": 1, "HDR": 1, "HDR10": 1, "HDR10+": 1,
    "DV": 1, "DOLBYVISION": 1, "NF": 1, "CR": 1, "SDR": 1
  };

  var parts = normalized.split(/[ ._]+/);
  var out = [];
  var seen = {};
  var i;
  var part;

  for (i = 0; i < parts.length; i += 1) {
    part = String(parts[i] || "").toUpperCase();
    if (!part) continue;
    if (part === "DV") part = "DOLBYVISION";

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
    .trim();
}

function extractSize(text) {
  var m = String(text || "").match(/\b(\d+(?:\.\d+)?)\s*(GB|MB)\b/i);
  return m ? (m[1] + " " + m[2].toUpperCase()) : "";
}

function buildMeta(label, quality, size, tech) {
  var cleanedLabel = cleanLabelText(label);
  var lang = inferLang(cleanedLabel);
  var parts = [];

  if (quality && quality !== "Auto") parts.push(quality);
  if (lang) parts.push(lang);
  if (size) parts.push(size);
  if (tech) parts.push(tech);

  return {
    name: PROVIDER_NAME + " - " + lang,
    title: (/^S\d+\s+E\d+/i.test(cleanedLabel) ? cleanedLabel + " | " : "") + (parts.join(" | ") || "Stream")
  };
}

function buildStream(label, url, quality, headers, size, tech) {
  var finalUrl = url;
  if (!/\.(m3u8|mp4|mkv)(?:#|$)/i.test(finalUrl) && finalUrl.indexOf("#") === -1) {
    finalUrl += "#.mkv";
  }

  var cleanedLabel = cleanLabelText(label);
  var finalSize = size || extractSize(cleanedLabel);
  var finalTech = tech || cleanTech(cleanedLabel);
  var meta = buildMeta(cleanedLabel, quality || "Auto", finalSize, finalTech);

  return {
    name: meta.name,
    title: meta.title,
    url: finalUrl,
    quality: quality || "Auto",
    headers: headers && Object.keys(headers).length ? headers : undefined
  };
}

function uniqueBy(list, keyFn) {
  var seen = {};
  var out = [];
  var i;
  var key;

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

function scoreLink(url) {
  var lower = String(url || "").toLowerCase();
  if (lower.indexOf("hubcloud") !== -1) return 100;
  if (lower.indexOf("pixeldrain") !== -1) return 90;
  if (lower.indexOf("hubcdn") !== -1) return 80;
  if (lower.indexOf("10gbps") !== -1) return 70;
  if (lower.indexOf("hblinks") !== -1) return 60;
  if (lower.indexOf("hubdrive") !== -1) return 10;
  return 1;
}

function sortLinksByPriority(links) {
  return (links || []).slice().sort(function (a, b) {
    return scoreLink(b.url) - scoreLink(a.url);
  });
}

function getDomains() {
  if (cachedDomains) return Promise.resolve(cachedDomains);

  return fetchJson(DOMAINS_URL).then(function (json) {
    cachedDomains = json || {};
    return cachedDomains;
  }).catch(function () {
    cachedDomains = {};
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

    if (original && (original.indexOf(":") !== -1 || / and /i.test(original))) {
      alt = original.split(":")[0].split(/ and /i)[0].trim();
    }

    return { title: title, original: original, alt: alt };
  }).catch(function () {
    return { title: "", original: "", alt: "" };
  });
}

function searchContent(query) {
  return getMainUrl().then(function (mainUrl) {
    return fetchText(mainUrl + "/?s=" + encodeURIComponent(query)).then(function (html) {
      var $ = cheerio.load(html);
      var results = [];

      $("div.card-grid a, div.card-grid-small a").each(function (_, el) {
        var href = fixUrl($(el).attr("href"), mainUrl);
        var title = $(el).find("h3").first().text().trim() ||
          $(el).attr("title") ||
          $(el).find("img").attr("alt") ||
          $(el).text().trim();

        if (!href || !title) return;
        if (href.indexOf("/category/") !== -1 || href.indexOf("/tag/") !== -1) return;

        results.push({ title: title, href: href });
      });

      if (!results.length) return null;

      var q = normalizeTitle(query);
      var exact = null;
      var starts = null;
      var includes = null;
      var i;
      var current;

      for (i = 0; i < results.length; i += 1) {
        current = normalizeTitle(results[i].title);
        if (!exact && current === q) exact = results[i].href;
        if (!starts && current.indexOf(q) === 0) starts = results[i].href;
        if (!includes && current.indexOf(q) !== -1) includes = results[i].href;
      }

      return exact || starts || includes || null;
    });
  });
}

function collectMovieLinks($, pageUrl) {
  var links = [];

  $("div.download-item").each(function (_, el) {
    var href = fixUrl($(el).find("a[href]").first().attr("href"), pageUrl);
    if (!href) return;

    links.push({
      url: href,
      label: cleanLabelText($(el).text().trim() || "Movie"),
      rawHtml: $(el).html() || ""
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
          rawHtml: $(episodeEl).html() || ""
        });
      });
    });
  });

  if (found.length) {
    return uniqueBy(found, function (item) {
      return String(item.url || "").toLowerCase();
    });
  }

  $("div.download-item").each(function (_, item) {
    var text = $(item).text();
    if (!new RegExp("S(?:eason)?\\s*0*" + sNum + "\\b", "i").test(text)) return;

    $(item).find("a[href]").each(function (__, a) {
      var href = fixUrl($(a).attr("href"), pageUrl);
      if (!href) return;

      found.push({
        url: href,
        label: "S" + sNum + " Pack",
        rawHtml: $(item).html() || ""
      });
    });
  });

  return uniqueBy(found, function (item) {
    return String(item.url || "").toLowerCase();
  });
}

function getRedirectLinks(url) {
  var REDIRECT_REGEX = /s\('o','([A-Za-z0-9+/=]+)'\)|ck\('_wp_http_d+','([^']+)'\)/g;

  return fetchText(url).then(function (html) {
    var combined = "";
    var match;

    while ((match = REDIRECT_REGEX.exec(html)) !== null) {
      var part = match[1] || match[2] || "";
      combined += part;
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

function resolvePixeldrain(url, label, quality, referer) {
  try {
    var parsed = new URL(url);
    var parts = parsed.pathname.split("/");
    var id = parts[parts.length - 1] || parts[parts.length - 2] || "";
    if (!id) return Promise.resolve([]);

    return Promise.resolve([
      buildStream(
        label + " Pixeldrain",
        "https://pixeldrain.com/api/file/" + id + "?download",
        quality,
        referer ? { Referer: referer } : {}
      )
    ]);
  } catch (e) {
    return Promise.resolve([]);
  }
}

function resolveHubcdn(url, label, quality) {
  return fetchText(url, {
    headers: { Referer: url }
  }).then(function (html) {
    var encoded = "";
    var match1 = html.match(/r=([A-Za-z0-9+/=]+)/);
    var match2 = html.match(/reurls*=s*"([^"]+)"/);

    if (match1 && match1[1]) encoded = match1[1];
    else if (match2 && match2[1]) encoded = match2[1].split("?r=").pop();

    if (!encoded) return [];

    var decoded = decodeBase64(encoded);
    if (!decoded) return [];

    var finalUrl = decoded.split("link=").pop();
    if (!finalUrl || finalUrl === encoded) return [];

    return [buildStream(label + " HUBCDN", finalUrl, quality, { Referer: url })];
  }).catch(function () {
    return [];
  });
}

function resolveHubdrive(url, label, quality) {
  return fetchText(url, {
    headers: { Referer: url }
  }).then(function (html) {
    var $ = cheerio.load(html);
    var title = $("title").first().text().trim();
    var fileId = (String(url).match(/\/file\/(\d+)/i) || [])[1] || "";

    var genericLanding =
      /HubDrive|G-Drive File Sharing Site/i.test(title) &&
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
    return resolveLink(href, label + " HubDrive", url, quality);
  }).catch(function () {
    return [];
  });
}

function resolve10Gbps(url, label, quality, size, tech) {
  function step(current, depth) {
    if (depth >= 3) return Promise.resolve([]);

    return fetchResponse(current, {
      redirect: "manual"
    }).then(function (res) {
      var location = res.headers.get("location") || "";
      if (!location) return [];
      if (location.indexOf("link=") !== -1) {
        return [
          buildStream(
            label + " 10Gbps",
            location.split("link=").pop(),
            quality,
            { Referer: current },
            size,
            tech
          )
        ];
      }
      return step(fixUrl(location, current), depth + 1);
    }).catch(function () {
      return [];
    });
  }

  return step(url, 0);
}

function resolveHubcloud(url, label, referer, quality) {
  var baseHeaders = referer ? { Referer: referer } : {};

  function parseEntry(entryUrl, sourceReferer) {
    return fetchText(entryUrl, {
      headers: assign(baseHeaders, { Referer: sourceReferer || url })
    }).then(function (html) {
      var $ = cheerio.load(html);
      var size = $("i#size").first().text().trim();
      var header = $("div.card-header").first().text().trim();
      var tech = cleanTech(header);
      var finalQuality = quality !== "Auto" ? quality : parseQuality(header);
      var directStreams = [];
      var asyncTasks = [];

      $("a.btn[href]").each(function (_, el) {
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
              return [buildStream(label + " BuzzServer", redirected, finalQuality, { Referer: link }, size, tech)];
            }).catch(function () {
              return [];
            })
          );
          return;
        }

        if (text.indexOf("pixel") !== -1) {
          asyncTasks.push(resolvePixeldrain(link, label, finalQuality, entryUrl));
          return;
        }

        if (text.indexOf("10gbps") !== -1) {
          asyncTasks.push(resolve10Gbps(link, label, finalQuality, size, tech));
          return;
        }

        directStreams.push(
          buildStream(label, link, finalQuality, { Referer: entryUrl }, size, tech)
        );
      });

      if (!asyncTasks.length) return directStreams;

      return Promise.all(asyncTasks).then(function (groups) {
        var all = directStreams.slice();
        var i;
        for (i = 0; i < groups.length; i += 1) {
          all = all.concat(groups[i] || []);
        }
        return all;
      });
    });
  }

  if (/hubcloud\.php/i.test(url)) {
    return parseEntry(url, url).catch(function () {
      return [];
    });
  }

  return fetchText(url, {
    headers: baseHeaders
  }).then(function (html) {
    var $ = cheerio.load(html);
    var raw = $("#download").attr("href");
    var entryUrl = fixUrl(raw, url);
    if (!entryUrl) return [];
    return parseEntry(entryUrl, url);
  }).catch(function () {
    return [];
  });
}

function resolveHblinks(url, label) {
  return fetchText(url).then(function (html) {
    var $ = cheerio.load(html);
    var hrefs = [];

    $("h3 a, h5 a, div.entry-content p a").each(function (_, el) {
      var href = fixUrl($(el).attr("href"), url);
      if (href) hrefs.push(href);
    });

    hrefs = uniqueBy(hrefs, function (x) { return x; });

    return Promise.all(hrefs.map(function (href) {
      return resolveLink(href, label, url, "Auto").catch(function () {
        return [];
      });
    })).then(function (groups) {
      var out = [];
      var i;
      for (i = 0; i < groups.length; i += 1) {
        out = out.concat(groups[i] || []);
      }
      return out;
    });
  }).catch(function () {
    return [];
  });
}

function resolveLink(rawUrl, label, referer, quality) {
  if (!rawUrl) return Promise.resolve([]);
  quality = quality || "Auto";
  referer = referer || "";

  function next(url) {
    var lower = String(url || "").toLowerCase();
    if (/\.(m3u8|mp4|mkv)(?:#|$)/i.test(url)) {
      return Promise.resolve([
        buildStream(label, url, quality, referer ? { Referer: referer } : {})
      ]);
    }

    if (lower.indexOf("hubcloud") !== -1) return resolveHubcloud(url, label, referer, quality);
    if (lower.indexOf("pixeldrain") !== -1) return resolvePixeldrain(url, label, quality, referer);
    if (lower.indexOf("hubcdn") !== -1) return resolveHubcdn(url, label, quality);
    if (lower.indexOf("hblinks") !== -1) return resolveHblinks(url, label);
    if (lower.indexOf("hubdrive") !== -1) return resolveHubdrive(url, label, quality);

    return Promise.resolve([
      buildStream(label, url, quality, referer ? { Referer: referer } : {})
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
      var mergedText = cleanLabelText((item.label || "") + " " + (item.rawHtml || ""));
      var quality = parseQuality(mergedText);
      var label = cleanLabelText(item.label || PROVIDER_NAME);

      return resolveLink(item.url, label, contentUrl, quality).catch(function () {
        return [];
      });
    })).then(function (groups) {
      var streams = [];
      var i;
      for (i = 0; i < groups.length; i += 1) {
        streams = streams.concat(groups[i] || []);
      }
      return dedupeStreams(streams);
    });
  });
}

function findContentUrl(tmdbId, mediaType) {
  return getTmdbNames(tmdbId, mediaType).then(function (names) {
    if (!names.title && !names.original) return null;

    return searchContent(names.title).then(function (found) {
      if (found) return found;

      if (names.original && names.original !== names.title) {
        return searchContent(names.original).then(function (found2) {
          if (found2) return found2;
          if (names.alt) return searchContent(names.alt);
          return null;
        });
      }

      if (names.alt) return searchContent(names.alt);
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

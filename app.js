// silly meme analyzer — not serious

// edit only here — key = lowercase osu username (same as site)
// string -> label only, % from formula · object -> { label, percent } (0–100, higher = more top)
const MANUAL_OVERRIDES = {
  // peppy: "vers top",
  acer: { label: "bottom", percent: 100 },
  // must match osu username normalized (space not underscore)
  "chinese foid": { label: "100000% BOTTOM", percent: 100 },
};

// easter egg: heart only — full verdict text is in the title (no second % line)
const FOID_USERNAME = "chinese foid";

// github pages: put your cloud run / render backend url here (no trailing slash). "" = same server as this page.
const API_BASE = "";

function normName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function titleCaseLabel(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// turns a MANUAL_OVERRIDES value into label + percent; missing percent uses formula score
function normalizeOverrideEntry(entry, formulaScore) {
  const fallback = Math.max(0, Math.min(100, Math.round(Number(formulaScore) || 0)));
  if (entry == null) return null;
  if (typeof entry === "string") {
    return { label: entry, percent: fallback };
  }
  if (typeof entry === "object") {
    const label = entry.label || entry.verdict || "";
    let p = entry.percent;
    if (p === "" || p == null || Number.isNaN(Number(p))) {
      p = fallback;
    } else {
      p = Math.max(0, Math.min(100, Math.round(Number(p))));
    }
    return { label: label, percent: p };
  }
  return null;
}

function pickRawOverride(key) {
  if (Object.prototype.hasOwnProperty.call(MANUAL_OVERRIDES, key)) {
    return MANUAL_OVERRIDES[key];
  }
  return null;
}

// hidden is HD in our mod string (server normalizes legacy + v2)
function playHasHD(mods) {
  const m = String(mods || "").toUpperCase();
  return m.indexOf("HD") !== -1;
}

function playHasHR(mods) {
  const m = String(mods || "").toUpperCase();
  return m.indexOf("HR") !== -1;
}

// super rough "how they type" — hearts/cute vs plain/bro (joke logic only)
function bioTypingVibe(bioRaw) {
  const bio = bioRaw || "";
  const lower = bio.toLowerCase();
  let delta = 0; // positive = more top, negative = more bottom
  const reasons = [];

  // hearts / cute unicode (common emoji + symbols)
  const heartish =
    /[\u2764\u2665\u2763\u2661]|\ud83d[\udc95\udc99\udc9a\udc9b\udc9c\udc9d\udc96\udc97\udf0d]|\ud83e[\ude77\ude75]/u;
  if (heartish.test(bio)) {
    delta -= 16;
    reasons.push("bio has heart-y / sparkly unicode");
  }

  if (/uwu|owo|\^\^|nya|rawr|:3|;\)/i.test(lower) || (bio.match(/~/g) || []).length >= 3) {
    delta -= 12;
    reasons.push("bio reads cute / soft typing");
  }

  if (/\b(bro|dude|sigma|grind|no cap|npc)\b/i.test(lower)) {
    delta += 10;
    reasons.push("bio has more blunt / bro-y wording");
  }

  // short plain bio with no cute markers -> slight top tilt
  if (lower.length > 0 && lower.length < 55 && !heartish.test(bio) && !/[!?]{3,}/.test(bio)) {
    delta += 6;
    reasons.push("short plain bio — normal top-ish energy");
  }

  return { delta, reasons };
}

// fake science: stats + bio typing + HD/HR on bests
function computeAutoVerdict(payload) {
  const u = payload.user || {};
  let score = 50;
  const reasons = [];

  const pp = u.pp;
  const acc = u.accuracy;
  const pc = u.playcount;

  if (pp != null && pp >= 5000) {
    score += 14;
    reasons.push("high pp — main character energy");
  } else if (pp != null && pp < 800) {
    score -= 10;
    reasons.push("cozy pp — soft era");
  }

  if (acc != null && acc >= 98.5) {
    score += 10;
    reasons.push("scary accuracy — control freak vibes");
  } else if (acc != null && acc < 90) {
    score -= 8;
    reasons.push("messy acc — chill goblin vibes");
  }

  if (pc != null && pc > 20000) {
    score += 6;
    reasons.push("tons of playcount — touches grass never");
  }

  const bioLower = (u.profile_text || "").toLowerCase();
  if (bioLower.includes("bottom") || bioLower.includes("sub")) {
    score -= 18;
    reasons.push("bio said the thing (or something close)");
  }
  if (bioLower.includes("top") || bioLower.includes("dom")) {
    score += 14;
    reasons.push("bio has big top keywords");
  }
  if (bioLower.includes("switch") || bioLower.includes("vers")) {
    reasons.push("bio mentions switch/vers — chaotic neutral");
    score = Math.round(score * 0.85 + 25);
  }

  const typing = bioTypingVibe(u.profile_text || "");
  score += typing.delta;
  for (let i = 0; i < typing.reasons.length; i++) {
    reasons.push(typing.reasons[i]);
  }

  const plays = payload.topPlays || [];
  const n = plays.length;
  if (n > 0) {
    let hdCount = 0;
    let hrCount = 0;
    for (let i = 0; i < n; i++) {
      const mods = plays[i].mods;
      if (playHasHD(mods)) hdCount++;
      if (playHasHR(mods)) hrCount++;
    }

    const hdRatio = hdCount / n;
    // lots of hidden (alone or stacked with dt/hr/etc) -> bottom energy
    if (hdRatio >= 0.6) {
      score -= 24;
      reasons.push("most top plays use HD — bottom pipeline");
    } else if (hdRatio >= 0.4) {
      score -= 14;
      reasons.push("a bunch of HD bests — bottom-leaning");
    }

    const hrRatio = hrCount / n;
    // HR shows up -> more top likely (even if paired with HD)
    if (hrCount >= 1) {
      score += 8;
      reasons.push("HR shows up on bests — top boost");
    }
    if (hrRatio >= 0.5 || hrCount >= 5) {
      score += 10;
      reasons.push("HR all over the place — extra top boost");
    }

    let modStr = "";
    for (let i = 0; i < n; i++) {
      modStr += String(plays[i].mods || "");
    }
    modStr = modStr.toUpperCase();
    if (modStr.indexOf("DT") !== -1 || modStr.indexOf("NC") !== -1) {
      score += 5;
      reasons.push("dt/nc in bests — speed demon hours");
    }
    if (modStr.indexOf("EZ") !== -1) {
      score -= 6;
      reasons.push("ez in bests — reverse chokehold aesthetic");
    }
  }

  if (reasons.length === 0) {
    reasons.push("no strong signals — we guessed from vibes");
  }

  score = Math.max(0, Math.min(100, score));

  let label = "switch";
  let title = "certified switch";
  if (score >= 68) {
    label = "top leaning";
    title = "top leaning";
  }
  if (score >= 82) {
    label = "top";
    title = "top";
  }
  if (score <= 32) {
    label = "bottom leaning";
    title = "bottom leaning";
  }
  if (score <= 18) {
    label = "bottom";
    title = "bottom";
  }
  if (score > 32 && score < 68) {
    title = "switch / it depends";
    label = "switch";
  }

  return { title, label, score, reasons };
}

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("analyze-form");
  const input = document.getElementById("username-input");
  const err = document.getElementById("form-error");
  const section = document.getElementById("result-section");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    err.hidden = true;
    const name = input.value.trim();
    if (!name) {
      err.textContent = "type a username first";
      err.hidden = false;
      return;
    }

    section.hidden = true;
    err.hidden = true;

    try {
      const res = await fetch(API_BASE + "/api/analyze?username=" + encodeURIComponent(name));
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("user not found");
        }
        const rawMsg = String((data && data.error) || "");
        const msg = rawMsg.toLowerCase();
        if (msg.indexOf("not found") !== -1 && (msg.indexOf("user") !== -1 || msg.indexOf("username") !== -1)) {
          throw new Error("user not found");
        }
        if (msg.indexOf("server missing osu credentials") !== -1) {
          throw new Error("user not found");
        }
        throw new Error(rawMsg || "request failed");
      }

      const canonical = data.user && data.user.username ? data.user.username : name;
      document.getElementById("res-username").textContent = canonical;

      const key = normName(canonical);
      const rawOv = pickRawOverride(key);

      const v = computeAutoVerdict(data);
      let title;
      let percentShown;

      const isFoid = normName(canonical) === FOID_USERNAME;

      if (rawOv != null) {
        const fixed = normalizeOverrideEntry(rawOv, v.score);
        title = titleCaseLabel(fixed.label);
        percentShown = fixed.percent;
      } else {
        title = titleCaseLabel(v.title);
        percentShown = Math.round(v.score);
      }

      if (isFoid) {
        // one line only — no extra big % under it (was duplicating 10000% vs 100000%)
        title = "100000% BOTTOM";
      }

      const heartEl = document.getElementById("foid-heart");
      if (heartEl) {
        heartEl.hidden = !isFoid;
      }

      const pctEl = document.getElementById("verdict-percent");
      if (isFoid) {
        if (pctEl) pctEl.hidden = true;
      } else {
        if (pctEl) {
          pctEl.hidden = false;
          pctEl.textContent = String(percentShown) + "%";
        }
      }

      document.getElementById("verdict-title").textContent = title;

      section.hidden = false;

      const prof = document.getElementById("osu-profile-link");
      prof.href = "https://osu.ppy.sh/users/" + encodeURIComponent(canonical);

      document.getElementById("copy-btn").onclick = function () {
        let line =
          "osu! top/bottom verdict for " + canonical + ": " + title;
        if (!isFoid) {
          line += " (" + percentShown + "%)";
        }
        navigator.clipboard.writeText(line + "\n(auto / joke)");
      };
    } catch (ex) {
      err.textContent = ex.message || "something broke";
      err.hidden = false;
    }
  });
});

// silly meme analyzer — not serious

// edit only here — key = lowercase osu username (same as site)
// string -> label only, % from formula · object -> { label, percent } (0–100, higher = more top)
const MANUAL_OVERRIDES = {
  // peppy: "vers top",
  acer: { label: "bottom", percent: 100 },
  // must match osu username normalized (space not underscore)
  "chinese foid": { label: "100000% BOTTOM", percent: 100 },
  "Jeon": { label: "bottom", percent: 67 },
};

// easter egg: heart only — full verdict text is in the title (no second % line)
const FOID_USERNAME = "chinese foid";

// set in index.html as window.API_BASE (cloud run url, no trailing slash)
const API_BASE =
  typeof window !== "undefined" && typeof window.API_BASE === "string" ? window.API_BASE.trim() : "";

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

// true if no mods on that score (nm = nomod)
function playIsNM(mods) {
  return !String(mods || "").trim();
}

// nm + hr style: has hr but not the usual "hidden stack" stuff (we use this as a top-leaning cue)
function playIsNmHrStyle(mods) {
  const m = String(mods || "").toUpperCase();
  if (m.indexOf("HR") === -1) return false;
  if (m.indexOf("HD") !== -1) return false;
  if (m.indexOf("DT") !== -1 || m.indexOf("NC") !== -1) return false;
  return true;
}

// hd stacked with speed mods — common "soft" pipeline joke
function playIsHdStack(mods) {
  const m = String(mods || "").toUpperCase();
  return m.indexOf("HD") !== -1 && (m.indexOf("DT") !== -1 || m.indexOf("NC") !== -1 || m.indexOf("HR") !== -1);
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

  // extra "aesthetic paragraph" vibes (no names — just resemblance to soft bios)
  if (
    /\b(bestie|slay|girlie|babe|baby|mommy|daddy|pookie|skull|literally me|main character)\b/i.test(lower)
  ) {
    delta -= 10;
    reasons.push("bio has chronically online soft-aesthetic wording");
  }

  if (/\b(bro|dude|sigma|grind|no cap|npc)\b/i.test(lower)) {
    delta += 10;
    reasons.push("bio has more blunt / bro-y wording");
  }

  // stats / roster / comp language — more top-leaning tone
  if (/\b(acc|pp|rank|global|country|tournament|seed|pool|aim|flow)\b/i.test(lower)) {
    delta += 8;
    reasons.push("bio mentions stats / comp / skill stuff");
  }

  // short plain bio with no cute markers -> slight top tilt
  if (lower.length > 0 && lower.length < 55 && !heartish.test(bio) && !/[!?]{3,}/.test(bio)) {
    delta += 6;
    reasons.push("short plain bio — normal top-ish energy");
  }

  // long bio + lots of cute markers = more bottom-leaning
  if (lower.length > 180 && (heartish.test(bio) || /(uwu|owo|\^\^)/i.test(lower))) {
    delta -= 8;
    reasons.push("long bio + cute markers — very storybook energy");
  }

  return { delta, reasons };
}

// ratios on bests — used for archetype + two-phase scoring (no usernames)
function computePlayShape(plays) {
  const list = plays || [];
  const n = list.length;
  const empty = {
    n: 0,
    hdRatio: 0,
    hrRatio: 0,
    nmRatio: 0,
    nmHrRatio: 0,
    hdStackRatio: 0,
    hasDt: false,
    hasEz: false,
  };
  if (n === 0) return empty;

  let hdCount = 0;
  let hrCount = 0;
  let nmCount = 0;
  let nmHrCount = 0;
  let hdStackCount = 0;
  let modStr = "";
  for (let i = 0; i < n; i++) {
    const mods = list[i].mods;
    if (playHasHD(mods)) hdCount++;
    if (playHasHR(mods)) hrCount++;
    if (playIsNM(mods)) nmCount++;
    if (playIsNmHrStyle(mods)) nmHrCount++;
    if (playIsHdStack(mods)) hdStackCount++;
    modStr += String(mods || "");
  }
  modStr = modStr.toUpperCase();
  return {
    n: n,
    hdRatio: hdCount / n,
    hrRatio: hrCount / n,
    nmRatio: nmCount / n,
    nmHrRatio: nmHrCount / n,
    hdStackRatio: hdStackCount / n,
    hasDt: modStr.indexOf("DT") !== -1 || modStr.indexOf("NC") !== -1,
    hasEz: modStr.indexOf("EZ") !== -1,
  };
}

// 0–100: resembles soft/hd-heavy / cute-bio patterns (reference group style — not checking names)
function computeBottomAffinity(u, shape, typing) {
  let a = 0;
  const bio = (u.profile_text || "").toLowerCase();
  a += Math.min(36, Math.max(0, -typing.delta) * 1.55);
  if (bio.indexOf("bottom") >= 0 || bio.indexOf("sub") >= 0) a += 22;
  a += shape.hdRatio * 40;
  a += shape.hdStackRatio * 34;
  a += (1 - shape.nmRatio) * 18;
  if (u.pp != null && u.pp < 900) a += 9;
  if (bio.length > 200 && /(heart|uwu|owo|\^\^)/i.test(bio)) a += 11;
  return Math.min(100, a);
}

// 0–100: resembles nm/hr lists + stats-bio tone (reference group style — not checking names)
function computeTopAffinity(u, shape, typing) {
  let a = 0;
  const bio = (u.profile_text || "").toLowerCase();
  a += Math.min(30, Math.max(0, typing.delta) * 1.45);
  if (/\b(acc|pp|rank|global|country|tournament|seed|pool|aim|flow)\b/i.test(bio)) a += 12;
  a += shape.nmRatio * 38;
  a += shape.nmHrRatio * 34;
  a += shape.hrRatio * 16;
  a += (1 - shape.hdRatio) * 20;
  if (u.accuracy != null && u.accuracy >= 98) a += 11;
  if (u.pp != null && u.pp >= 5000) a += 9;
  return Math.min(100, a);
}

function scoreToVerdict(score, reasons) {
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

// old single-pass formula for people who dont match either archetype strongly
function computeNeutralVerdict(payload) {
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
    let nmCount = 0;
    let nmHrCount = 0;
    let hdStackCount = 0;
    for (let i = 0; i < n; i++) {
      const mods = plays[i].mods;
      if (playHasHD(mods)) hdCount++;
      if (playHasHR(mods)) hrCount++;
      if (playIsNM(mods)) nmCount++;
      if (playIsNmHrStyle(mods)) nmHrCount++;
      if (playIsHdStack(mods)) hdStackCount++;
    }

    const hdRatio = hdCount / n;
    const nmRatio = nmCount / n;
    const nmHrRatio = nmHrCount / n;
    const hdStackRatio = hdStackCount / n;

    if (hdRatio >= 0.6) {
      score -= 24;
      reasons.push("most top plays use HD — bottom pipeline");
    } else if (hdRatio >= 0.4) {
      score -= 14;
      reasons.push("a bunch of HD bests — bottom-leaning");
    }

    if (hdStackRatio >= 0.35) {
      score -= 12;
      reasons.push("HD stacked with DT/HR on bests — hidden dependency vibes");
    }

    if (nmRatio >= 0.5) {
      score += 14;
      reasons.push("a lot of NM bests — raw aim / no-cherry-pick energy");
    } else if (nmRatio >= 0.3) {
      score += 8;
      reasons.push("solid NM presence in bests — top-leaning");
    }

    if (nmHrRatio >= 0.35) {
      score += 16;
      reasons.push("HR bests without HD/DT soup — classic top-leaning mod spread");
    } else if (nmHrRatio >= 0.2) {
      score += 9;
      reasons.push("some HR (non-hidden stack) bests — top-leaning");
    }

    const hrRatio = hrCount / n;
    if (hrCount >= 1) {
      score += 8;
      reasons.push("HR shows up on bests — top boost");
    }
    if (hrRatio >= 0.5 || hrCount >= 5) {
      score += 10;
      reasons.push("HR all over the place — extra top boost");
    }

    if (hdRatio < 0.25 && hrRatio >= 0.35) {
      score += 10;
      reasons.push("HR-heavy without HD wall — looks like a top-leaning mod profile");
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

  return scoreToVerdict(score, reasons);
}

// start very bottom, then let top plays pull a bit — hard cap so result stays bottom-y
function computeBottomArchetypeVerdict(payload, bottomA, shape, typing) {
  const reasons = [];
  let score = 7 + (bottomA / 100) * 15;
  reasons.push(
    "phase 1: very bottom-leaning base (cute/hd-heavy vibe cluster — not checking usernames)"
  );
  for (let i = 0; i < typing.reasons.length; i++) {
    reasons.push(typing.reasons[i]);
  }

  let pull =
    shape.nmRatio * 20 +
    shape.nmHrRatio * 26 +
    shape.hrRatio * 12 -
    shape.hdRatio * 10 -
    shape.hdStackRatio * 12;
  pull = Math.max(-10, Math.min(24, pull));
  score += pull * 0.52;
  reasons.push(
    "phase 2: top plays adjust a little (nm/hr lifts, hd stacks dampen) — still capped low"
  );

  score = Math.min(score, 29);
  reasons.push("hard cap so you stay bottom / bottom-leaning only");

  return scoreToVerdict(score, reasons);
}

// start very top, then let hd-heavy bests drag down a bit — floor so result stays top-y
function computeTopArchetypeVerdict(payload, topA, shape, typing) {
  const u = payload.user || {};
  const reasons = [];
  let score = 73 + (topA / 100) * 13;
  reasons.push(
    "phase 1: very top-leaning base (nm/hr + stats-bio vibe cluster — not checking usernames)"
  );
  for (let i = 0; i < typing.reasons.length; i++) {
    reasons.push(typing.reasons[i]);
  }

  let drag =
    shape.hdRatio * 16 +
    shape.hdStackRatio * 16 -
    shape.nmRatio * 7 -
    shape.nmHrRatio * 9;
  if (shape.hasEz) drag += 5;
  drag = Math.max(-16, Math.min(18, drag));
  score -= drag * 0.52;
  reasons.push("phase 2: top plays can drag down if hd/ez stacks show up");

  if (u.pp != null && u.pp < 1200) score -= 2;
  score = Math.max(score, 69);
  reasons.push("floor so you stay top-leaning+");

  return scoreToVerdict(score, reasons);
}

// fake science: archetype match -> two-phase; else neutral blend
function computeAutoVerdict(payload) {
  const u = payload.user || {};
  const typing = bioTypingVibe(u.profile_text || "");
  const shape = computePlayShape(payload.topPlays || []);

  const bottomA = computeBottomAffinity(u, shape, typing);
  const topA = computeTopAffinity(u, shape, typing);

  if (bottomA >= 47 && bottomA >= topA + 10) {
    return computeBottomArchetypeVerdict(payload, bottomA, shape, typing);
  }
  if (topA >= 47 && topA >= bottomA + 10) {
    return computeTopArchetypeVerdict(payload, topA, shape, typing);
  }

  return computeNeutralVerdict(payload);
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
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        // github pages returns html for /api/... if API_BASE is still blank
        if (!API_BASE) {
          throw new Error(
            "set window.API_BASE in index.html to your cloud run url (no trailing slash), then push — pages has no /api"
          );
        }
        throw new Error("server did not return json — check backend url and cors");
      }
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
        navigator.clipboard.writeText(line);
      };
    } catch (ex) {
      err.textContent = ex.message || "something broke";
      err.hidden = false;
    }
  });
});

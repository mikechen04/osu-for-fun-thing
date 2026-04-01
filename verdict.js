const MANUAL_OVERRIDES = {
  acer: { label: "bottom", percent: 100 },
  "chinese foid": { label: "100000% BOTTOM", percent: 100 },
  jeon: { label: "bottom", percent: 67 },
  "ethan jeon": { label: "bottom", percent: 67 },
  sigge: { label: "top", percent: 67 },
  arkyter: { label: "definitely a top", percent: 420 },
  "stupid dog": { label: "bottom", percent: 420 },
  nuzz: { label: "bottom", percent: 67 },
  hydrole: { label: "bottom", percent: 100 },
  "8581210": { label: "sweet 16", percent: 100 },
};

const FOID_USERNAME = "chinese foid";

function normName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function titleCaseLabel(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

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
      p = Math.max(0, Math.round(Number(p)));
    }
    return { label: label, percent: p };
  }
  return null;
}

function pickRawOverride(key) {
  const k = normName(key);
  if (Object.prototype.hasOwnProperty.call(MANUAL_OVERRIDES, k)) {
    return MANUAL_OVERRIDES[k];
  }
  return null;
}

function playHasHD(mods) {
  const m = String(mods || "").toUpperCase();
  return m.indexOf("HD") !== -1;
}

function playHasHR(mods) {
  const m = String(mods || "").toUpperCase();
  return m.indexOf("HR") !== -1;
}

function playIsNM(mods) {
  return !String(mods || "").trim();
}

function playIsNmHrStyle(mods) {
  const m = String(mods || "").toUpperCase();
  if (m.indexOf("HR") === -1) return false;
  if (m.indexOf("HD") !== -1) return false;
  if (m.indexOf("DT") !== -1 || m.indexOf("NC") !== -1) return false;
  return true;
}

function playIsHdStack(mods) {
  const m = String(mods || "").toUpperCase();
  return m.indexOf("HD") !== -1 && (m.indexOf("DT") !== -1 || m.indexOf("NC") !== -1 || m.indexOf("HR") !== -1);
}

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

function computeBottomAffinity(u, shape) {
  let a = 0;
  const bio = (u.profile_text || "").toLowerCase();
  if (bio.indexOf("bottom") >= 0 || bio.indexOf("sub") >= 0) a += 22;
  a += shape.hdRatio * 40;
  a += shape.hdStackRatio * 34;
  a += (1 - shape.nmRatio) * 18;
  if (u.pp != null && u.pp < 900) a += 9;
  return Math.min(100, a);
}

function computeTopAffinity(u, shape) {
  let a = 0;
  const bio = (u.profile_text || "").toLowerCase();
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

function computeBottomArchetypeVerdict(payload, bottomA, shape) {
  const reasons = [];
  let score = 7 + (bottomA / 100) * 15;
  reasons.push(
    "phase 1: very bottom-leaning base (cute/hd-heavy vibe cluster — not checking usernames)"
  );

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

function computeTopArchetypeVerdict(payload, topA, shape) {
  const u = payload.user || {};
  const reasons = [];
  let score = 73 + (topA / 100) * 13;
  reasons.push(
    "phase 1: very top-leaning base (nm/hr + stats-bio vibe cluster — not checking usernames)"
  );

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

function computeAutoVerdict(payload) {
  const u = payload.user || {};
  const shape = computePlayShape(payload.topPlays || []);

  const bottomA = computeBottomAffinity(u, shape);
  const topA = computeTopAffinity(u, shape);

  if (bottomA >= 47 && bottomA >= topA + 10) {
    return computeBottomArchetypeVerdict(payload, bottomA, shape);
  }
  if (topA >= 47 && topA >= bottomA + 10) {
    return computeTopArchetypeVerdict(payload, topA, shape);
  }

  return computeNeutralVerdict(payload);
}

function buildVerdictDisplay(payload) {
  const canonical = payload.user && payload.user.username ? payload.user.username : "";
  const key = normName(canonical);
  const rawOv = pickRawOverride(key);
  const v = computeAutoVerdict(payload);
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
    title = "100000% BOTTOM";
  }

  return {
    title,
    percentShown,
    isFoid,
    hidePercent: isFoid,
  };
}

module.exports = { buildVerdictDisplay };

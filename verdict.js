const MANUAL_OVERRIDES = {
  acer: { label: "bottom", percent: 100 },
  "chinese foid": { label: "💜 bottom", percent: 676767 },
  jeon: { label: "bottom", percent: 67 },
  "ethan jeon": { label: "bottom", percent: 67 },
  sigge: { label: "top", percent: 67 },
  arkyter: { label: "definitely a top", percent: 420 },
  "stupid dog": { label: "bottom", percent: 420 },
  nuzz: { label: "bottom", percent: 67 },
  hydrole: { label: "bottom", percent: 100 },
  8581210: { label: "sweet 16", percent: 100 },
  utami: { label: "i cum too fast >~<", percent: 100 },
  kimchisshi: { label: "diddy", percent: 6767 },
  eriko: { label: "🚫 👕 bottom", percent: 100 },
  "hidden on osu": { label: "bottom", percent: 67 },
};

function normName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function titleCaseLabel(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeOverrideEntry(entry, formulaScore) {
  // fallback only when override doesnt set a percent — stays 0–100 for formula score
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
      // manual percent: exact number, can be above 100 (no cap)
      p = Math.round(Number(p));
      if (p < 0) p = 0;
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

function scoreToVerdict(score) {
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
    title = "switch";
    label = "switch";
  }
  return { title, label, score };
}

function computeNeutralVerdict(payload) {
  const u = payload.user || {};
  let score = 50;

  const pp = u.pp;
  const acc = u.accuracy;
  const pc = u.playcount;

  if (pp != null && pp >= 5000) {
    score += 14;
  } else if (pp != null && pp < 800) {
    score -= 10;
  }

  if (acc != null && acc >= 98.5) {
    score += 10;
  } else if (acc != null && acc < 90) {
    score -= 8;
  }

  if (pc != null && pc > 20000) {
    score += 6;
  }

  const bioLower = (u.profile_text || "").toLowerCase();
  if (bioLower.includes("bottom") || bioLower.includes("sub")) {
    score -= 18;
  }
  if (bioLower.includes("top") || bioLower.includes("dom")) {
    score += 14;
  }
  if (bioLower.includes("switch") || bioLower.includes("vers")) {
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
    } else if (hdRatio >= 0.4) {
      score -= 14;
    }

    if (hdStackRatio >= 0.35) {
      score -= 12;
    }

    if (nmRatio >= 0.5) {
      score += 14;
    } else if (nmRatio >= 0.3) {
      score += 8;
    }

    if (nmHrRatio >= 0.35) {
      score += 16;
    } else if (nmHrRatio >= 0.2) {
      score += 9;
    }

    const hrRatio = hrCount / n;
    if (hrCount >= 1) {
      score += 8;
    }
    if (hrRatio >= 0.5 || hrCount >= 5) {
      score += 10;
    }

    if (hdRatio < 0.25 && hrRatio >= 0.35) {
      score += 10;
    }

    let modStr = "";
    for (let i = 0; i < n; i++) {
      modStr += String(plays[i].mods || "");
    }
    modStr = modStr.toUpperCase();
    if (modStr.indexOf("DT") !== -1 || modStr.indexOf("NC") !== -1) {
      score += 5;
    }
    if (modStr.indexOf("EZ") !== -1) {
      score -= 6;
    }
  }

  // spread scores away from the middle so fewer people land on the same %
  score = 50 + (score - 50) * 1.38;

  return scoreToVerdict(score);
}

function computeBottomArchetypeVerdict(payload, bottomA, shape) {
  // wider base range so bottom % isnt stuck around the same few numbers
  let score = 2 + (bottomA / 100) * 28;

  let pull =
    shape.nmRatio * 20 +
    shape.nmHrRatio * 26 +
    shape.hrRatio * 12 -
    shape.hdRatio * 10 -
    shape.hdStackRatio * 12;
  pull = Math.max(-10, Math.min(24, pull));
  score += pull * 0.88;

  score = Math.min(score, 36);

  return scoreToVerdict(score);
}

function computeTopArchetypeVerdict(payload, topA, shape) {
  const u = payload.user || {};
  // was clustering ~86: base was too narrow (73–86); stretch + stronger drag
  let score = 54 + (topA / 100) * 42;

  let drag =
    shape.hdRatio * 16 +
    shape.hdStackRatio * 16 -
    shape.nmRatio * 7 -
    shape.nmHrRatio * 9;
  if (shape.hasEz) drag += 5;
  drag = Math.max(-16, Math.min(18, drag));
  score -= drag * 0.95;

  if (u.pp != null && u.pp < 1200) score -= 4;
  score = Math.max(score, 52);

  return scoreToVerdict(score);
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

  if (rawOv != null) {
    const fixed = normalizeOverrideEntry(rawOv, v.score);
    title = titleCaseLabel(fixed.label);
    percentShown = fixed.percent;
  } else {
    title = titleCaseLabel(v.title);
    percentShown = Math.round(v.score);
  }

  return {
    title,
    percentShown,
  };
}

module.exports = { buildVerdictDisplay };

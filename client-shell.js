const API_BASE =
  typeof window !== "undefined" && typeof window.API_BASE === "string" ? window.API_BASE.trim() : "";

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

      const vd = data.verdict;
      if (!vd || typeof vd.title !== "string") {
        throw new Error("update your backend — needs verdict in /api/analyze");
      }

      const title = vd.title;
      const percentShown = vd.percentShown;
      const isFoid = !!vd.isFoid;
      const hidePercent = !!vd.hidePercent;

      const heartEl = document.getElementById("foid-heart");
      if (heartEl) {
        heartEl.hidden = !isFoid;
      }

      const pctEl = document.getElementById("verdict-percent");
      if (hidePercent) {
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
        let line = "osu! top/bottom verdict for " + canonical + ": " + title;
        if (!hidePercent) {
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

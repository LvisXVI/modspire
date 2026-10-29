/* Shared GitHub Pages runtime. The content and navigation also work without JS. */
(() => {
  "use strict";
  const links = [...document.querySelectorAll(".section-nav a")];
  if ("IntersectionObserver" in window && links.length) {
    const byId = new Map(links.map((link) => [link.hash.slice(1), link]));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          links.forEach((link) => link.removeAttribute("aria-current"));
          byId.get(entry.target.id)?.setAttribute("aria-current", "location");
        }
      },
      { rootMargin: "-12% 0px -65% 0px" },
    );
    byId.forEach((link, id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }

  const repo = document.body.dataset.repo;
  if (!repo) return;
  const status = document.querySelector("[data-release-status]");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) throw new Error("Release lookup failed");
      return response.json();
    })
    .then((release) => {
      // A missing/malformed response must never replace the working fallback links.
      if (
        typeof release.tag_name !== "string" ||
        !Array.isArray(release.assets)
      )
        throw new Error("Invalid release");
      const pattern = new RegExp(document.body.dataset.asset, "i");
      const asset = release.assets.find(
        (item) => typeof item.name === "string" && pattern.test(item.name),
      );
      if (!asset) throw new Error("No matching Windows asset");
      const url = new URL(asset.browser_download_url);
      if (
        url.origin !== "https://github.com" ||
        !url.pathname.startsWith(`/${repo}/releases/download/`)
      )
        throw new Error("Invalid download URL");
      const date = new Date(release.published_at);
      const values = {
        version: release.tag_name.replace(/^v/, ""),
        name: asset.name,
        size:
          Number.isFinite(asset.size) && asset.size > 0
            ? `${Math.round(asset.size / 1048576)} MB`
            : null,
        date: Number.isNaN(date.getTime())
          ? null
          : new Intl.DateTimeFormat("de", { dateStyle: "medium" }).format(date),
      };
      for (const [key, value] of Object.entries(values)) {
        if (value)
          document.querySelectorAll(`[data-release-${key}]`).forEach((node) => {
            node.textContent = value;
          });
      }
      document.querySelectorAll("[data-release-download]").forEach((link) => {
        link.href = url.href;
      });
      if (status)
        status.textContent =
          "Aktuelles Release von GitHub. Prüfsummen stehen bei den Releases.";
    })
    .catch(() => {
      if (status)
        status.textContent =
          "Live-Abfrage nicht verfügbar. Der Download führt zu den aktuellen GitHub-Releases.";
    })
    .finally(() => clearTimeout(timeout));
})();

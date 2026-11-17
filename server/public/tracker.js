const token = location.hash.slice(1);
// Keep the bearer capability out of URLs, referrers, and server access logs.
history.replaceState(null, "", "/track");
const el = (id) => document.getElementById(id);
let stopped = false;
function clearLocation() {
  el("coordinates").textContent = "";
  el("accuracy").textContent = "";
  el("map").hidden = true;
  el("map").removeAttribute("href");
}
async function refresh() {
  try {
    const response = await fetch("/api/shared", {
      headers: { "X-Share-Token": token },
      cache: "no-store",
    });
    if (!response.ok) {
      clearLocation();
      el("title").textContent = "Location unavailable";
      el("status").textContent =
        response.status === 410
          ? "Sharing has ended or the link has expired."
          : "This link is invalid or cannot be accessed.";
      if ([404, 410].includes(response.status)) stopped = true;
      return;
    }
    const data = await response.json();
    el("title").textContent = `${data.name} activated an SOS`;
    el("mode").textContent =
      data.mode === "test"
        ? "TEST MODE — no emergency texts or police alerts were sent."
        : "An SOS is active. This page does not confirm that help is on the way.";
    if (!data.location) {
      clearLocation();
      el("status").textContent =
        "Waiting for a location fix. The phone may be offline or location access may be unavailable.";
      return;
    }
    const p = data.location,
      age = Math.max(0, Math.floor((Date.now() - p.timestamp) / 1000));
    el("status").textContent =
      `Last location: ${new Date(p.timestamp).toLocaleString()} · ${age} seconds ago${age > 60 ? " · STALE — not a current position" : ""}`;
    el("status").className = age > 60 ? "stale" : "";
    el("coordinates").textContent =
      `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`;
    el("accuracy").textContent =
      `Reported accuracy: approximately ${Math.round(p.accuracy)} metres. Opening maps shares this coordinate with the map provider.`;
    el("map").href =
      `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
    el("map").hidden = false;
  } catch {
    clearLocation();
    el("status").textContent =
      "Connection lost. Current location cannot be confirmed. Retrying…";
  } finally {
    if (!stopped) setTimeout(refresh, 5000);
  }
}
void refresh();

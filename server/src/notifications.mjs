const oneLine = (text) =>
  String(text)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function notification(incident, publicUrl, phase = "sos", place = null) {
  const location = incident.location;
  const coordinates = location
    ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    : "Not available yet";
  const mapsUrl = location
    ? `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`
    : "Not available yet";
  const trackingUrl = `${publicUrl}/track#${incident.shareToken}`;
  const recordedAt = location
    ? new Date(location.timestamp).toISOString()
    : "Not available yet";
  const placeName =
    (place ?? location?.placeName)
      ? oneLine(place ?? location.placeName).slice(0, 180)
      : "Place name unavailable";
  const name = oneLine(incident.name);
  return {
    containsLocation: Boolean(location),
    message: `${name} ${phase === "location" ? "SOS location update." : "needs your help. SOS activated."} Coordinates: ${coordinates}. Place: ${placeName}. Recorded: ${recordedAt}${location ? `; accuracy approximately ${Math.round(location.accuracy)}m` : ""}. Map: ${mapsUrl} . Private live updates: ${trackingUrl} . Link expires ${new Date(incident.expiresAt).toISOString()}.`,
    // Matches the approved text template documented in docs/MESSAGING.md.
    variables: {
      1: name,
      2:
        phase === "location"
          ? "SOS location update"
          : "SOS activated; help requested",
      3: coordinates,
      4: placeName,
      5: location
        ? `${recordedAt}; accuracy approximately ${Math.round(location.accuracy)}m`
        : recordedAt,
      6: mapsUrl,
      7: trackingUrl,
      8: new Date(incident.expiresAt).toISOString(),
    },
  };
}

export async function reverseGeocode(location, endpoint) {
  if (!location || !endpoint) return null;
  try {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(location.latitude));
    url.searchParams.set("lon", String(location.longitude));
    const response = await fetch(url, {
      headers: {
        "User-Agent": "WomenSafetySoftware/0.2 (operator-configured geocoder)",
      },
      signal: AbortSignal.timeout(2000),
      redirect: "error",
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.display_name === "string"
      ? oneLine(data.display_name).slice(0, 180)
      : null;
  } catch {
    return null;
  }
}

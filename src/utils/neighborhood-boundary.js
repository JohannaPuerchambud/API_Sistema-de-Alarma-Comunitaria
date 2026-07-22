export const parseNeighborhoodBoundary = (boundary) => {
  let value = boundary;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) return [];

  return value
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
};

export const isPointInsideNeighborhood = (lat, lng, boundary) => {
  const points = parseNeighborhoodBoundary(boundary);
  if (points.length < 3) return true;

  let inside = false;
  for (
    let current = 0, previous = points.length - 1;
    current < points.length;
    previous = current++
  ) {
    const [currentLat, currentLng] = points[current];
    const [previousLat, previousLng] = points[previous];

    if (
      isPointOnSegment(
        lat,
        lng,
        previousLat,
        previousLng,
        currentLat,
        currentLng,
      )
    ) {
      return true;
    }

    const crossesLatitude = currentLat > lat !== previousLat > lat;
    const intersectionLng =
      ((previousLng - currentLng) * (lat - currentLat)) /
        (previousLat - currentLat || Number.EPSILON) +
      currentLng;

    if (crossesLatitude && lng < intersectionLng) inside = !inside;
  }

  return inside;
};

const isPointOnSegment = (
  lat,
  lng,
  startLat,
  startLng,
  endLat,
  endLng,
) => {
  const epsilon = 1e-10;
  const cross =
    (lng - startLng) * (endLat - startLat) -
    (lat - startLat) * (endLng - startLng);
  if (Math.abs(cross) > epsilon) return false;

  return (
    lat >= Math.min(startLat, endLat) - epsilon &&
    lat <= Math.max(startLat, endLat) + epsilon &&
    lng >= Math.min(startLng, endLng) - epsilon &&
    lng <= Math.max(startLng, endLng) + epsilon
  );
};

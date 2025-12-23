export const searchGeocode = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);

    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `format=json&limit=5&addressdetails=1&q=${encodeURIComponent(q)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "AlarmaComunitariaWeb/1.0 (contacto: admin@local.app)",
        "Accept-Language": "es"
      }
    });

    if (!response.ok) {
      return res.status(500).json({ message: "Error consultando Nominatim" });
    }

    const data = await response.json();
    res.json(Array.isArray(data) ? data : []);

  } catch (error) {
    console.error("Geocode error:", error);
    res.status(500).json({ message: "Error de geocodificación" });
  }
};

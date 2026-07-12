/**
 * Location Intelligence Engine for AUM
 * Respects user privacy, maps location precision tiers, and applies time-based location logic.
 */

/**
 * Gets the active location context for the user based on profile setting and virtual/system time
 * @param {Object} db - The user's database
 * @param {Date} [timeOverride] - Optional time override
 * @returns {Object} { city: string, zone: string, is_traveling: boolean, comfort_radius: number }
 */
export function getLocationContext(db, timeOverride = null) {
  const profile = db.profile || {};
  const currentCity = profile.city || "Gurgaon";
  const locationProfile = profile.location_profile || {
    home_base: { city: "Gurgaon", neighborhood: "DLF Phase 3", lat: 28.49, lng: 77.09 },
    work_base: { city: "Gurgaon", neighborhood: "Cyber City" },
    comfort_radius: 30, // Default to 30 mins
    travel_mode: false,
    travel_city: ""
  };

  const now = timeOverride || (db.virtual_time ? new Date(db.virtual_time) : new Date());
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = (day === 0 || day === 6);

  let activeCity = locationProfile.home_base?.city || currentCity;
  let activeNeighborhood = locationProfile.home_base?.neighborhood || "";
  let zone = "Home Base";
  let isTraveling = !!locationProfile.travel_mode;

  // If in Travel Mode, override active city
  if (isTraveling && locationProfile.travel_city) {
    activeCity = locationProfile.travel_city;
    activeNeighborhood = "Traveling Area";
    zone = "Travel Zone";
  } else {
    // Time-based location logic:
    // Weekdays (Monday-Friday) between 9 AM and 6 PM are assumed to be spent at Work Base
    if (!isWeekend && hour >= 9 && hour < 18) {
      if (locationProfile.work_base?.city) {
        activeCity = locationProfile.work_base.city;
        activeNeighborhood = locationProfile.work_base.neighborhood || "Office";
        zone = "Work Base";
      }
    }
  }

  return {
    city: activeCity,
    neighborhood: activeNeighborhood,
    zone,
    is_traveling: isTraveling,
    comfort_radius: locationProfile.comfort_radius || 30
  };
}

/**
 * Filters the available local places in recommendations based on location context
 * @param {Object} db - The user's database
 * @param {Array} places - Array of local places
 * @param {Object} locationContext - Resolved location context from getLocationContext
 * @returns {Array} Filtered and scored places
 */
export function filterPlacesByContext(db, places, locationContext) {
  return places.filter(place => {
    // Exact city match
    if (place.city.toLowerCase() !== locationContext.city.toLowerCase()) {
      return false;
    }
    
    // Additional domain-specific filters can go here (e.g. comfort radius, category filters)
    return true;
  });
}

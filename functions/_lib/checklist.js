// The standard weekly vehicle check items. `key` is stored on each answer
// row; `label` is snapshotted onto the row too, so relabeling this list
// later never rewrites history.
export const CHECKLIST_ITEMS = [
  { key: "tyres", label: "Tyres — tread, pressure, cuts/damage, obvious uneven wear" },
  { key: "wheels", label: "Wheels — no visible damage or loose/missing wheel nuts" },
  { key: "headlights", label: "Headlights — low/high beam working" },
  { key: "indicators", label: "Indicators & hazards — all working" },
  { key: "brake_lights", label: "Brake/rear lights — working" },
  { key: "windscreen", label: "Windscreen — no significant cracks/damage" },
  { key: "wipers", label: "Wipers & washers — working and washer fluid available" },
  { key: "mirrors", label: "Mirrors — secure, clean and undamaged" },
  { key: "brakes", label: "Brakes — no unusual noise, vibration or poor braking" },
  { key: "steering", label: "Steering — no unusual looseness/noises" },
  { key: "seatbelts", label: "Seatbelts — working and undamaged" },
  { key: "reversing_camera", label: "Reversing camera — working and clear" },
  { key: "horn", label: "Horn — working" },
  { key: "warning_lights", label: "Warning lights — no unexplained dashboard warning lights" },
  { key: "oil_coolant", label: "Oil/coolant — no warning/obvious low level or leaks" },
  { key: "fluid_leaks", label: "Fluid leaks — check underneath vehicle" },
  { key: "body", label: "Body — new dents/damage recorded" },
  { key: "doors", label: "Doors — driver, passenger, side and rear doors operate correctly" },
  { key: "cargo_area", label: "Cargo area — clean, safe and no loose equipment" },
  { key: "registration_plate", label: "Registration plate — secure and readable" },
  { key: "cleanliness", label: "General cleanliness — cabin and cargo area reasonably clean" },
];

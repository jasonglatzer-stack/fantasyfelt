// Public settings. The publishable key is safe in the browser: it can only
// call the functions granted in supabase/schema.sql. Never put a secret or
// service_role key in this file.
window.FF_CONFIG = {
  supabaseUrl: "https://rxeiacxqwruzztgdabrb.supabase.co",
  supabaseKey: "sb_publishable_KpZsegto0gTHzwSzioffhQ_L9MzaePX",
  contest: "wsop-paradise-2026",
  lockAt: "2026-12-02T16:00:00Z", // Event #1, 11:00 AM Nassau
  cap: 2500,
  rosterSize: 8, // maximum picks; 1 to 8 allowed
  // Sponsor slot: hidden while null. Example:
  // sponsor: { name: "Brand", url: "https://brand.com", logo: "/assets/sponsor.svg" }
  sponsor: null
};

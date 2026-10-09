// config.js - മൾട്ടി-ഷോപ്പ് കോൺഫിഗറേഷൻ & വിഷ്വൽ തീം

// 1. സൂപ്പർ അഡ്മിൻ / മാസ്റ്റർ പിൻ
window.MASTER_PIN = '0000';

// 2. സ്റ്റാഫിന് ഡിലീറ്റ് ചെയ്യാവുന്ന പരമാവധി ദിവസങ്ങൾ
window.STAFF_DELETE_LIMIT_DAYS = 2;

// 3. ഷോപ്പുകളുടെ പൂർണ്ണ കോൺഫിഗറേഷൻ ലിസ്റ്റ് (4 ഷോപ്പുകൾ)
window.SHOPS_CONFIG = [
  {
    id: 'shop1',
    name: 'NASSER BIN EID ALMAHMADI',
    tagline: 'Main Supermarket Branch',
    url: 'https://elubqoicerkldrufqcbj.supabase.co',
    key: 'sb_publishable_zsEKreCmounELozZ5EQ3Lg_aXyut9EK',
    pin: '1234',
    themeGradient: 'from-emerald-950 via-slate-900 to-teal-950',
    accentColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    logo: 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png'
  },
  {
    id: 'shop2',
    name: 'BOOFIYA',
    tagline: 'Boofiya Restaurant & Cafeteria',
    url: 'https://qkjcviszzdptssvpguwc.supabase.co',
    key: 'sb_publishable_J0Z4b7NoP3VuDKdbC0WeIg_OQAlpnLQ',
    pin: '1111',
    themeGradient: 'from-amber-950 via-slate-900 to-orange-950',
    accentColor: 'text-amber-400',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    logo: 'https://cdn-icons-png.flaticon.com/512/1046/1046784.png'
  },
  {
    id: 'shop3',
    name: 'MUSAD',
    tagline: 'Musad Sports',
    url: 'https://garpkohthpeirdhcwthk.supabase.co',
    key: 'sb_publishable_TNhOZnpYuthYHmSJSlyhaw_R6RS1jcY',
    pin: '3333', // MUSAD ഷോപ്പിന്റെ സ്റ്റാഫ് പിൻ
    themeGradient: 'from-cyan-950 via-slate-900 to-blue-950',
    accentColor: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    logo: 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png'
  },
  {
    id: 'shop4',
    name: 'TAJ',
    tagline: 'Taj Sports',
    url: 'https://mwxbakqoipcwblhukrfs.supabase.co',
    key: 'sb_publishable_OfuR1PeffNa4NWUhpwV3gg_pwqovQZT',
    pin: '4444', // TAJ ഷോപ്പിന്റെ സ്റ്റാഫ് പിൻ
    themeGradient: 'from-rose-950 via-slate-900 to-pink-950',
    accentColor: 'text-rose-400',
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    logo: 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png'
  }
];

// ബാക്ക്-അപ്പ് ഗ്ലോബൽ കണക്ഷൻ
window.GLOBAL_CONFIG = {
  supabaseUrl: 'https://elubqoicerkldrufqcbj.supabase.co',
  supabaseKey: 'sb_publishable_zsEKreCmounELozZ5EQ3Lg_aXyut9EK'
};

// 4. സൗദി ബിസിനസ് തീയതി കണക്കുകൂട്ടൽ (രാവിലെ 6:00 AM കട്ട്-ഓഫ്)
window.getSaudiBusinessDate = function() {
  const now = new Date();
  const saudiTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Riyadh" });
  const saudiDate = new Date(saudiTimeStr);
  if (saudiDate.getHours() < 6) {
    saudiDate.setDate(saudiDate.getDate() - 1);
  }
  const year = saudiDate.getFullYear();
  const month = String(saudiDate.getMonth() + 1).padStart(2, '0');
  const day = String(saudiDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

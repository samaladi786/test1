// config.js - മൾട്ടി-ഷോപ്പ് കോൺഫിഗറേഷൻ & വിഷ്വൽ തീം

// 1. സൂപ്പർ അഡ്മിൻ / മാസ്റ്റർ പിൻ (എല്ലാ ഷോപ്പുകളിലേക്കും പ്രവേശിക്കാനും ഡിലീറ്റ് ചെയ്യാനും)
window.MASTER_PIN = '0000'; // നിങ്ങൾക്ക് ഇഷ്ടമുള്ള 4-അക്ക മാസ്റ്റർ പിൻ ഇവിടെ നൽകാം

// 2. ഷോപ്പുകളുടെ വിവരങ്ങൾ
window.SHOPS_CONFIG = [
  {
    id: 'shop1',
    name: 'NASSER BIN EID ALMAHMADI',
    tagline: 'Main Supermarket Branch',
    url: 'https://elubqoicerkldrufqcbj.supabase.co',
    key: 'sb_publishable_zsEKreCmounELozZ5EQ3Lg_aXyut9EK',
    pin: '1234', // ഈ ഷോപ്പിന്റെ ലോഗിൻ & ഡിലീറ്റ് പിൻ
    // തീം & ലോഗോ
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
    pin: '1111', // ഈ ഷോപ്പിന്റെ ലോഗിൻ & ഡിലീറ്റ് പിൻ
    // തീം & ലോഗോ
    themeGradient: 'from-amber-950 via-slate-900 to-orange-950',
    accentColor: 'text-amber-400',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    logo: 'https://cdn-icons-png.flaticon.com/512/1046/1046784.png'
  }
];

// സൗദി ബിസിനസ് തീയതി (രാവിലെ 6:00 AM കട്ട്-ഓഫ്)
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

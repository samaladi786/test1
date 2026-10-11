// ========================================================
// ALNASSR QUICK POS - CORE LOGIC ENGINE (pos-core.js)
// ========================================================

function getShopsList() {
  if (window.SHOPS_CONFIG && Array.isArray(window.SHOPS_CONFIG) && window.SHOPS_CONFIG.length > 0) return window.SHOPS_CONFIG;
  if (window.SHOPS && Array.isArray(window.SHOPS) && window.SHOPS.length > 0) return window.SHOPS;
  try {
    if (typeof SHOPS_CONFIG !== 'undefined' && Array.isArray(SHOPS_CONFIG) && SHOPS_CONFIG.length > 0) return SHOPS_CONFIG;
    if (typeof SHOPS !== 'undefined' && Array.isArray(SHOPS) && SHOPS.length > 0) return SHOPS;
  } catch(e) {}
  return [];
}

function getMasterPin() {
  if (window.MASTER_PIN !== undefined && window.MASTER_PIN !== null) return String(window.MASTER_PIN).trim();
  try {
    if (typeof MASTER_PIN !== 'undefined' && MASTER_PIN !== null) return String(MASTER_PIN).trim();
  } catch(e) {}
  return null;
}

var SHOPS = getShopsList();
var currentShopId = null;
var currentShop = null;
var supabaseClient = null;

var customersList = [];
var vendorsList = [];
var employeesList = [];
var expensesMasterList = [];
var transactionsList = [];
var agentsList = [];
var openingSettings = { openingCash: 0, openingBank: 0 };

var pendingAction = null;
var pendingTxnId = null;
var deferredPrompt = null;
var currentMasterTab = 'customer';

// PREVENT BACK-FORWARD CACHE (BFCACHE)
window.addEventListener('pageshow', function (event) {
  if (event.persisted) {
    window.location.reload();
  }
});

// PWA INSTALL PROMPT
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById("pwaInstallBtn");
  if (installBtn) installBtn.classList.remove("hidden");
});

function triggerPwaInstall() {
  if (!deferredPrompt) return alert("ആപ്പ് ഇതിനകം ഇൻസ്റ്റാൾ ചെയ്തിട്ടുണ്ട് അല്ലെങ്കിൽ ബ്രൗസർ സപ്പോർട്ട് ചെയ്യുന്നില്ല.");
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      const installBtn = document.getElementById("pwaInstallBtn");
      if (installBtn) installBtn.classList.add("hidden");
    }
    deferredPrompt = null;
  });
}

// SAUDI BUSINESS DATE (6:00 AM CUT-OFF SYNC)
function getSaudiBusinessDate() {
  try {
    const now = new Date();
    const saudiTime = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000);
    if (saudiTime.getHours() < 6) {
      saudiTime.setDate(saudiTime.getDate() - 1);
    }
    const y = saudiTime.getFullYear();
    const m = String(saudiTime.getMonth() + 1).padStart(2, '0');
    const d = String(saudiTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch(e) {
    return new Date().toISOString().split('T')[0];
  }
}

function getSelectedDate() {
  const dt = document.getElementById("mobileFilterDate");
  return (dt && dt.value) ? dt.value : getSaudiBusinessDate();
}

function setTodayDate() {
  const today = getSaudiBusinessDate();
  const dt = document.getElementById("mobileFilterDate");
  if (dt) dt.value = today;
  renderQuickTotalsAndRecent();
}

function onDateChanged(val) {
  if (!val) {
    const dt = document.getElementById("mobileFilterDate");
    if (dt) dt.value = getSaudiBusinessDate();
  }
  renderQuickTotalsAndRecent();
}

function changeBusinessDate(delta) {
  const dtInput = document.getElementById("mobileFilterDate");
  let currentStr = (dtInput && dtInput.value) ? dtInput.value : getSaudiBusinessDate();
  let d = parseToDateObj(currentStr);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const newDateStr = `${y}-${m}-${day}`;
  if (dtInput) dtInput.value = newDateStr;
  renderQuickTotalsAndRecent();
}

function cleanPartyName(str) {
  if (!str) return '';
  return String(str).split(' (')[0].replace(/^Staff:\s*/i, '').trim().toLowerCase();
}

function cleanDate(d) {
  if (!d) return '';
  return String(d).split('T')[0].split(' ')[0].replace(/\//g, '-').trim();
}

function parseToDateObj(dStr) {
  if (!dStr) return new Date("2026-01-01");
  if (dStr instanceof Date) return dStr;
  let s = String(dStr).split('T')[0].trim();
  if (s.includes('/')) {
    let parts = s.split('/');
    if (parts[0].length === 4) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else if (parts[2].length === 4) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  }
  let parts = s.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function updateNetworkStatus() {
  const badge = document.getElementById("networkStatusBadge");
  if (!badge) return;
  if (navigator.onLine) {
    badge.className = "font-extrabold text-emerald-400";
    badge.innerText = "🟢 ഓൺലൈൻ";
    syncOfflineQueue();
  } else {
    badge.className = "font-extrabold text-amber-400";
    badge.innerText = "⚠️ ഓഫ്‍ലൈൻ";
  }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// 4-DIGIT BINDING ENFORCER
function setup4DigitPinInputs() {
  const loginInp = document.getElementById("loginPasswordInput");
  if (loginInp) {
    loginInp.setAttribute("maxlength", "4");
    loginInp.setAttribute("inputmode", "numeric");
    loginInp.setAttribute("pattern", "[0-9]*");
    loginInp.oninput = function() {
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 4);
      if (this.value.length === 4) {
        verifyLogin();
      }
    };
    loginInp.onfocus = function() { this.select(); };
    loginInp.onclick = function() { this.select(); };
  }

  const secPinInp = document.getElementById("pinInput");
  if (secPinInp) {
    secPinInp.setAttribute("maxlength", "4");
    secPinInp.setAttribute("inputmode", "numeric");
    secPinInp.setAttribute("pattern", "[0-9]*");
    secPinInp.oninput = function() {
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 4);
      if (this.value.length === 4) {
        verifyPinAndExecute();
      }
    };
    secPinInp.onfocus = function() { this.select(); };
    secPinInp.onclick = function() { this.select(); };
  }
}

function initAppEngine() {
  SHOPS = getShopsList();
  setup4DigitPinInputs();

  const isLogged = sessionStorage.getItem("ALNASSR_LOGGED_IN") === "true";
  const userRole = sessionStorage.getItem("ALNASSR_MOBILE_ROLE") || sessionStorage.getItem("ALNASSR_USER_ROLE");

  const dtInput = document.getElementById("mobileFilterDate");
  if (dtInput) dtInput.value = getSaudiBusinessDate();

  if (isLogged) {
    const loginEl = document.getElementById("loginScreen");
    if (loginEl) {
      loginEl.style.setProperty("display", "none", "important");
      loginEl.classList.add("hidden");
    }
    applyRolePermissions(userRole);
    initMultiShopSystem();
  } else {
    const loginEl = document.getElementById("loginScreen");
    if (loginEl) loginEl.classList.remove("hidden");
    setTimeout(() => {
      const inp = document.getElementById("loginPasswordInput");
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 300);
  }

  renderSaleInputs('cash');
  renderPurchaseInputs('cash');

  updateNetworkStatus();
  checkOfflineQueueUI();

  if (window.lucide) lucide.createIcons();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAppEngine);
} else {
  initAppEngine();
}

// LOGIN LOGIC
function verifyLogin() {
  try {
    const input = document.getElementById("loginPasswordInput");
    if (!input) return;
    const enteredPin = String(input.value).trim();

    if (!enteredPin) return alert("പിൻ നൽകുക!");

    const masterPin = getMasterPin();
    const shopsArr = getShopsList();
    SHOPS = shopsArr;

    const isMaster = (masterPin && enteredPin === masterPin);
    const matchedShop = (shopsArr || []).find(s => String(s.pin).trim() === enteredPin);

    if (!isMaster && !matchedShop) {
      alert("പാസ്‌വേഡ് തെറ്റാണ്!");
      input.value = "";
      input.focus();
      return;
    }

    sessionStorage.setItem("ALNASSR_LOGGED_IN", "true");
    sessionStorage.setItem("ALNASSR_ACTIVE_PIN", enteredPin);

    if (isMaster) {
      sessionStorage.setItem("ALNASSR_USER_ROLE", "admin");
      sessionStorage.setItem("ALNASSR_MOBILE_ROLE", "admin");
    } else {
      sessionStorage.setItem("ALNASSR_USER_ROLE", "shop");
      sessionStorage.setItem("ALNASSR_MOBILE_ROLE", "shop");
      sessionStorage.setItem("ALNASSR_ACTIVE_SHOP_ID", matchedShop.id);
    }

    const loginEl = document.getElementById("loginScreen");
    if (loginEl) {
      loginEl.style.setProperty("display", "none", "important");
      loginEl.classList.add("hidden");
      loginEl.classList.remove("flex");
    }

    if (isMaster) {
      applyRolePermissions("admin");
      initMultiShopSystem();
    } else {
      applyRolePermissions("shop");
      initMultiShopSystem(matchedShop.id);
    }

    setTimeout(() => {
      if (window.lucide) lucide.createIcons();
      renderQuickTotalsAndRecent();
    }, 50);

  } catch (err) {
    console.error("Login Error:", err);
    alert("ലോഗിൻ പിശക്: " + err.message);
  }
}

function applyRolePermissions(role) {
  const switcher = document.getElementById("shopSelectorWrapper");
  const staticTitle = document.getElementById("shopStaticTitle");
  if (role === 'admin') {
    if (switcher) switcher.classList.remove("hidden");
    if (staticTitle) staticTitle.classList.add("hidden");
  } else {
    if (switcher) switcher.classList.add("hidden");
    if (staticTitle) staticTitle.classList.remove("hidden");
  }
}

function logoutApp() {
  sessionStorage.clear();
  window.location.replace(window.location.pathname);
}

function goToDesktopPortal() {
  const userRole = sessionStorage.getItem("ALNASSR_MOBILE_ROLE") || sessionStorage.getItem("ALNASSR_USER_ROLE");
  if (userRole === 'admin') {
    window.open("index.html", "_blank");
    return;
  }
  pendingAction = 'open_desktop_portal';
  document.getElementById("pinSubText").innerText = "ഡെസ്ക്ടോപ്പ് പോർട്ടലിലേക്ക് പോകാൻ അഡ്മിൻ മാസ്റ്റർ പിൻ നൽകുക";
  const pInp = document.getElementById("pinInput");
  if (pInp) {
    pInp.value = "";
    document.getElementById("pinModal").classList.remove("hidden");
    pInp.focus();
    pInp.select();
  }
}

// MULTI-SHOP SYSTEM
function initMultiShopSystem(forceShopId = null) {
  SHOPS = getShopsList();
  const sel = document.getElementById("shopSelector");
  if (sel) sel.innerHTML = "";

  if (!SHOPS || SHOPS.length === 0) return alert("config.js ഫയലിൽ വിവരങ്ങൾ ഇല്ല!");

  SHOPS.forEach(shop => {
    const opt = document.createElement("option");
    opt.value = shop.id;
    opt.textContent = shop.name;
    if (sel) sel.appendChild(opt);
  });

  const role = sessionStorage.getItem("ALNASSR_MOBILE_ROLE") || sessionStorage.getItem("ALNASSR_USER_ROLE");
  if (role === 'shop') {
    currentShopId = forceShopId || sessionStorage.getItem("ALNASSR_ACTIVE_SHOP_ID") || SHOPS[0].id;
  } else {
    const savedShopId = localStorage.getItem("ALNASSR_SELECTED_SHOP_ID");
    const matched = SHOPS.find(s => s.id === savedShopId);
    currentShopId = matched ? matched.id : SHOPS[0].id;
  }

  if (sel) sel.value = currentShopId;
  connectActiveShop();
}

function connectActiveShop() {
  SHOPS = getShopsList();
  currentShop = SHOPS.find(s => s.id === currentShopId) || SHOPS[0];
  if (!currentShop) return;

  currentShopId = currentShop.id;
  localStorage.setItem("ALNASSR_SELECTED_SHOP_ID", currentShopId);

  document.getElementById("shopStaticTitle").innerText = currentShop.name;
  const repShop = document.getElementById("reportPageShopName");
  if (repShop) repShop.innerText = currentShop.name.toUpperCase();
  const stShop = document.getElementById("statementShopName");
  if (stShop) stShop.innerText = currentShop.name.toUpperCase();
  
  const logoImg = document.getElementById("shopLogoImg");
  const defaultIcon = document.getElementById("shopDefaultIcon");
  if (currentShop.logo) {
    logoImg.src = currentShop.logo;
    logoImg.style.display = 'block';
    if (defaultIcon) defaultIcon.classList.add("hidden");
  } else {
    logoImg.style.display = 'none';
    if (defaultIcon) defaultIcon.classList.remove("hidden");
  }

  const header = document.getElementById("mobileAppHeader");
  if (header) {
    header.className = `bg-gradient-to-r ${currentShop.themeGradient || 'from-slate-900 via-slate-800 to-slate-900'} text-white sticky top-0 z-40 shadow-md border-b border-white/10 px-3 py-2.5 transition-all duration-300`;
  }

  if (window.supabase && currentShop.url && currentShop.key) {
    supabaseClient = window.supabase.createClient(currentShop.url, currentShop.key);
  }

  const dtInput = document.getElementById("mobileFilterDate");
  if (dtInput && !dtInput.value) dtInput.value = getSaudiBusinessDate();

  loadLocalCacheData();
  fetchAllData();
}

function onShopChanged(newId) {
  currentShopId = newId;
  connectActiveShop();
}

function switchMobileTab(tabId) {
  document.querySelectorAll('.tab-view').forEach(el => el.classList.add('hidden'));
  document.getElementById(`view-${tabId}`).classList.remove('hidden');

  const tabs = ['purchase', 'expense', 'sale'];
  tabs.forEach(t => {
    const btn = document.getElementById(`mTab-${t}`);
    const iconWrap = btn ? btn.querySelector('div') : null;
    if (btn && iconWrap) {
      if (t === tabId) {
        btn.className = `flex flex-col items-center gap-1 font-extrabold text-xs touch-btn cursor-pointer ${t === 'sale' ? 'text-emerald-600' : t === 'purchase' ? 'text-blue-600' : 'text-amber-600'}`;
        iconWrap.className = `p-1.5 rounded-xl ${t === 'sale' ? 'bg-emerald-100' : t === 'purchase' ? 'bg-blue-100' : 'bg-amber-100'}`;
      } else {
        btn.className = "flex flex-col items-center gap-1 text-slate-400 font-bold text-xs touch-btn cursor-pointer";
        iconWrap.className = "p-1.5 rounded-xl bg-slate-50";
      }
    }
  });
  if (window.lucide) lucide.createIcons();
}

function clearCustomerInput() {
  const inp = document.getElementById("saleCustomerInput");
  if (inp) {
    inp.value = "";
    inp.focus();
    onCustomerSelected();
  }
}

function clearVendorInput() {
  const inp = document.getElementById("purchaseVendorInput");
  if (inp) {
    inp.value = "";
    inp.focus();
    onVendorSelected();
  }
}

function clearUnifiedInput() {
  const inp = document.getElementById("unifiedPartyInput");
  if (inp) {
    inp.value = "";
    inp.focus();
    onUnifiedPartySelected();
  }
}

function loadLocalCacheData() {
  try {
    customersList = JSON.parse(localStorage.getItem(`ALNASSR_${currentShopId}_CUSTOMERS`)) || [];
    vendorsList = JSON.parse(localStorage.getItem(`ALNASSR_${currentShopId}_VENDORS`)) || [];
    employeesList = JSON.parse(localStorage.getItem(`ALNASSR_${currentShopId}_EMPLOYEES`)) || [];
    expensesMasterList = JSON.parse(localStorage.getItem(`ALNASSR_${currentShopId}_EXPENSES`)) || [];
    transactionsList = JSON.parse(localStorage.getItem(`ALNASSR_${currentShopId}_TRANSACTIONS`)) || [];
    agentsList = JSON.parse(localStorage.getItem(`ALNASSR_${currentShopId}_AGENTS`)) || [];

    populateDropdowns();
    renderQuickTotalsAndRecent();
  } catch (err) {
    console.warn("Local cache load error:", err);
  }
}

async function fetchAllData(manual = false) {
  if (!navigator.onLine || !supabaseClient) {
    if (manual) alert("ഓഫ്‍ലൈൻ മോഡിലാണ്! സേവ് ചെയ്ത ഡാറ്റ കാണിക്കുന്നു.");
    return;
  }

  try {
    const [cRes, vRes, eRes, expRes, tRes, agRes, sRes] = await Promise.all([
      supabaseClient.from('customers').select('*').order('name'),
      supabaseClient.from('vendors').select('*').order('name'),
      supabaseClient.from('employees').select('*').order('name'),
      supabaseClient.from('expenses_master').select('*').order('name'),
      supabaseClient.from('transactions').select('*').order('date', { ascending: false }).limit(2500),
      supabaseClient.from('agents').select('*').order('name'),
      supabaseClient.from('app_settings').select('*')
    ]);

    customersList = cRes.data || [];
    vendorsList = vRes.data || [];
    employeesList = eRes.data || [];
    expensesMasterList = expRes.data || [];
    transactionsList = tRes.data || [];
    agentsList = agRes.data || [];

    if (sRes.data && sRes.data[0]) {
      openingSettings.openingCash = parseFloat(sRes.data[0].opening_cash) || 0;
      openingSettings.openingBank = parseFloat(sRes.data[0].opening_bank) || 0;
    }

    localStorage.setItem(`ALNASSR_${currentShopId}_CUSTOMERS`, JSON.stringify(customersList));
    localStorage.setItem(`ALNASSR_${currentShopId}_VENDORS`, JSON.stringify(vendorsList));
    localStorage.setItem(`ALNASSR_${currentShopId}_EMPLOYEES`, JSON.stringify(employeesList));
    localStorage.setItem(`ALNASSR_${currentShopId}_EXPENSES`, JSON.stringify(expensesMasterList));
    localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));
    localStorage.setItem(`ALNASSR_${currentShopId}_AGENTS`, JSON.stringify(agentsList));

    populateDropdowns();
    renderQuickTotalsAndRecent();
    checkOfflineQueueUI();
    if (manual) alert("ഡാറ്റ റിഫ്രഷ് ചെയ്തു!");
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

function populateDropdowns() {
  const cDL = document.getElementById("customerListOptions");
  if (cDL) {
    cDL.innerHTML = "";
    customersList.forEach(c => cDL.innerHTML += `<option value="${c.name.toUpperCase()}">`);
  }
  const vDL = document.getElementById("vendorListOptions");
  if (vDL) {
    vDL.innerHTML = "";
    vendorsList.forEach(v => vDL.innerHTML += `<option value="${v.name.toUpperCase()}">`);
  }
  const uDL = document.getElementById("unifiedPartyOptions");
  if (uDL) {
    uDL.innerHTML = "";
    expensesMasterList.forEach(e => uDL.innerHTML += `<option value="${e.name.toUpperCase()}">`);
    employeesList.forEach(em => uDL.innerHTML += `<option value="${em.name.toUpperCase()}">`);
  }
  const agDL = document.getElementById("agentListOptions");
  if (agDL) {
    agDL.innerHTML = "";
    agentsList.forEach(a => agDL.innerHTML += `<option value="${a.name.toUpperCase()}">`);
  }
}

// SALE INPUTS & CREDIT LIMIT CHECK
function renderSaleInputs(type) {
  const box = document.getElementById("saleAmountsContainer");
  if (!box) return;

  if (type === 'credit') {
    box.innerHTML = `
      <div class="grid grid-cols-3 gap-1.5">
        <div class="bg-emerald-50/80 p-2 rounded-2xl border border-emerald-200">
          <label class="block text-[10px] font-black text-emerald-900 mb-0.5 text-center truncate">💵 ക്യാഷ് റസീറ്റ്</label>
          <input type="number" step="any" inputmode="decimal" id="saleCash" placeholder="0.00" class="w-full text-center text-sm font-black p-2 rounded-xl border bg-white outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-700" />
        </div>
        <div class="bg-blue-50/80 p-2 rounded-2xl border border-blue-200">
          <label class="block text-[10px] font-black text-blue-900 mb-0.5 text-center truncate">🏦 ബാങ്ക് റസീറ്റ്</label>
          <input type="number" step="any" inputmode="decimal" id="saleBank" placeholder="0.00" class="w-full text-center text-sm font-black p-2 rounded-xl border bg-white outline-none focus:ring-2 focus:ring-blue-500 text-blue-700" />
        </div>
        <div class="bg-amber-50/80 p-2 rounded-2xl border border-amber-200">
          <label class="block text-[10px] font-black text-amber-900 mb-0.5 text-center truncate">🛒 ക്രെഡിറ്റ് സെയിൽ</label>
          <input type="number" step="any" inputmode="decimal" id="saleCredit" oninput="liveCheckCreditLimit()" placeholder="0.00" class="w-full text-center text-sm font-black p-2 rounded-xl border bg-white outline-none focus:ring-2 focus:ring-amber-500 text-amber-700" />
        </div>
      </div>
    `;
  } else {
    box.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div class="bg-emerald-50/80 p-2.5 rounded-2xl border border-emerald-200">
          <label class="block text-xs font-black text-emerald-900 mb-0.5 text-center">💵 ക്യാഷ് സെയിൽ</label>
          <input type="number" step="any" inputmode="decimal" id="saleCash" placeholder="0.00" class="w-full text-center text-base font-black p-2.5 rounded-xl border bg-white outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-700" />
        </div>
        <div class="bg-blue-50/80 p-2.5 rounded-2xl border border-blue-200">
          <label class="block text-xs font-black text-blue-900 mb-0.5 text-center">🏦 ബാങ്ക് സെയിൽ</label>
          <input type="number" step="any" inputmode="decimal" id="saleBank" placeholder="0.00" class="w-full text-center text-base font-black p-2.5 rounded-xl border bg-white outline-none focus:ring-2 focus:ring-blue-500 text-blue-700" />
        </div>
      </div>
    `;
  }
}

function onCustomerSelected() {
  const val = document.getElementById("saleCustomerInput").value.trim();
  const cleanName = cleanPartyName(val);
  const cust = customersList.find(c => cleanPartyName(c.name) === cleanName);
  const info = document.getElementById("custOpeningInfo");
  const warn = document.getElementById("custCreditLimitWarning");
  if (warn) warn.classList.add("hidden");

  if (cust && (cust.type || '').toLowerCase() === 'credit') {
    let liveBal = parseFloat(cust.opening_balance) || 0;
    transactionsList.forEach(t => {
      if (t && cleanPartyName(t.party_name) === cleanName && t.type === 'sale') {
        liveBal += (parseFloat(t.credit_amount) || 0) - (parseFloat(t.cash_amount) || 0) - (parseFloat(t.bank_amount) || 0);
      }
    });
    let agStr = cust.agent_name ? ` | ഏജന്റ്: ${cust.agent_name}` : '';
    let limitStr = (cust.credit_limit && parseFloat(cust.credit_limit) > 0) ? ` | ലിമിറ്റ്: ${cust.credit_limit}` : '';
    info.innerText = `ലൈവ് ബാലൻസ്: ${liveBal.toLocaleString('en-IN')}${limitStr}${agStr}`;
    renderSaleInputs('credit');
  } else {
    info.innerText = cust ? "ക്യാഷ് കസ്റ്റമർ" : "പുതിയ കസ്റ്റമർ (ക്യാഷ് ആയി സേവ് ആകും)";
    renderSaleInputs('cash');
  }
}

function liveCheckCreditLimit() {
  const val = document.getElementById("saleCustomerInput").value.trim();
  const cleanName = cleanPartyName(val);
  const cust = customersList.find(c => cleanPartyName(c.name) === cleanName);
  const warn = document.getElementById("custCreditLimitWarning");
  if (!cust || !cust.credit_limit || parseFloat(cust.credit_limit) <= 0 || !warn) return;

  const limit = parseFloat(cust.credit_limit);
  const enteredCr = parseFloat(document.getElementById("saleCredit")?.value) || 0;

  let liveBal = parseFloat(cust.opening_balance) || 0;
  transactionsList.forEach(t => {
    if (t && cleanPartyName(t.party_name) === cleanName && t.type === 'sale') {
      liveBal += (parseFloat(t.credit_amount) || 0) - (parseFloat(t.cash_amount) || 0) - (parseFloat(t.bank_amount) || 0);
    }
  });

  const projectedTotal = liveBal + enteredCr;
  if (projectedTotal > limit) {
    warn.classList.remove("hidden");
    warn.innerText = `⚠️ ക്രെഡിറ്റ് ലിമിറ്റ് കവിഞ്ഞു! (ലിമിറ്റ്: ${limit} | പുതിയ കടം: ${projectedTotal.toLocaleString('en-IN')})`;
  } else {
    warn.classList.add("hidden");
  }
}

// PURCHASE INPUTS
function renderPurchaseInputs(type) {
  const box = document.getElementById("purAmountsContainer");
  if (!box) return;

  if (type === 'credit') {
    box.innerHTML = `
      <div class="grid grid-cols-3 gap-1.5">
        <div class="bg-blue-50/80 p-2 rounded-2xl border border-blue-200">
          <label class="block text-[10px] font-black text-blue-900 mb-0.5 text-center truncate">💵 ക്യാഷ് നൽകിയത്</label>
          <input type="number" step="any" inputmode="decimal" id="purCash" placeholder="0.00" class="w-full text-center text-sm font-black p-2 rounded-xl border bg-white outline-none focus:ring-2 focus:ring-blue-500 text-blue-700" />
        </div>
        <div class="bg-indigo-50/80 p-2 rounded-2xl border border-indigo-200">
          <label class="block text-[10px] font-black text-indigo-900 mb-0.5 text-center truncate">🏦 ബാങ്ക് നൽകിയത്</label>
          <input type="number" step="any" inputmode="decimal" id="purBank" placeholder="0.00" class="w-full text-center text-sm font-black p-2 rounded-xl border bg-white outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-700" />
        </div>
        <div class="bg-amber-50/80 p-2 rounded-2xl border border-amber-200">
          <label class="block text-[10px] font-black text-amber-900 mb-0.5 text-center truncate">🚚 ക്രെഡിറ്റ് പർച്ചേസ്</label>
          <input type="number" step="any" inputmode="decimal" id="purCredit" placeholder="0.00" class="w-full text-center text-sm font-black p-2 rounded-xl border bg-white outline-none focus:ring-2 focus:ring-amber-500 text-amber-700" />
        </div>
      </div>
    `;
  } else {
    box.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div class="bg-blue-50/80 p-2.5 rounded-2xl border border-blue-200">
          <label class="block text-xs font-black text-blue-900 mb-0.5 text-center">💵 ക്യാഷ് പർച്ചേസ്</label>
          <input type="number" step="any" inputmode="decimal" id="purCash" placeholder="0.00" class="w-full text-center text-base font-black p-2.5 rounded-xl border bg-white outline-none focus:ring-2 focus:ring-blue-500 text-blue-700" />
        </div>
        <div class="bg-indigo-50/80 p-2.5 rounded-2xl border border-indigo-200">
          <label class="block text-xs font-black text-indigo-900 mb-0.5 text-center">🏦 ബാങ്ക് പർച്ചേസ്</label>
          <input type="number" step="any" inputmode="decimal" id="purBank" placeholder="0.00" class="w-full text-center text-base font-black p-2.5 rounded-xl border bg-white outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-700" />
        </div>
      </div>
    `;
  }
}

function onVendorSelected() {
  const val = document.getElementById("purchaseVendorInput").value.trim();
  const cleanName = cleanPartyName(val);
  const vend = vendorsList.find(v => cleanPartyName(v.name) === cleanName);
  const info = document.getElementById("vendorOpeningInfo");

  if (vend && (vend.type || '').toLowerCase() === 'credit') {
    let liveBal = parseFloat(vend.opening_balance) || 0;
    transactionsList.forEach(t => {
      if (t && cleanPartyName(t.party_name) === cleanName && t.type === 'purchase') {
        liveBal += (parseFloat(t.credit_amount) || 0) - Math.abs(parseFloat(t.cash_amount) || 0) - Math.abs(parseFloat(t.bank_amount) || 0);
      }
    });
    info.innerText = `ലൈവ് ബാലൻസ്: ${liveBal.toLocaleString('en-IN')}`;
    renderPurchaseInputs('credit');
  } else {
    info.innerText = vend ? "ക്യാഷ് വെണ്ടർ" : "പുതിയ വെണ്ടർ (ക്യാഷ് ആയി സേവ് ആകും)";
    renderPurchaseInputs('cash');
  }
}

// SALARY & UTILITY BILLS LOGIC
function getCycleStartDate(joinDate, cycleIndex) {
  let d = new Date(joinDate.getFullYear(), joinDate.getMonth() + cycleIndex, joinDate.getDate());
  let expectedMonth = (joinDate.getMonth() + cycleIndex) % 12;
  if (expectedMonth < 0) expectedMonth += 12;
  while (d.getMonth() !== expectedMonth) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function calculateEmployeeAccruedSalary(emp, asOfDateStr) {
  if (!emp) return 0;
  const monthlySalary = parseFloat(emp.monthly_salary) || 0;
  const baseAdv = parseFloat(emp.opening_advance || emp.opening_balance) || 0;
  if (!monthlySalary || !emp.joining_date) return baseAdv;

  try {
    const joinD = parseToDateObj(emp.joining_date);
    if (isNaN(joinD.getTime())) return baseAdv;

    const refStr = asOfDateStr ? cleanDate(asOfDateStr) : (document.getElementById("mobileFilterDate")?.value || getSaudiBusinessDate());
    let targetD = parseToDateObj(refStr);
    if (isNaN(targetD.getTime())) targetD = new Date();

    const isStopped = (emp.status === 'stopped' || emp.status === 'left');
    let stopD = null;
    if (isStopped && emp.stop_date) {
      stopD = parseToDateObj(emp.stop_date);
      if (!isNaN(stopD.getTime()) && stopD < targetD) targetD = stopD;
    }

    if (targetD < joinD) return baseAdv;

    let monthsDiff = (targetD.getFullYear() - joinD.getFullYear()) * 12 + (targetD.getMonth() - joinD.getMonth());
    if (targetD.getDate() < joinD.getDate()) monthsDiff--;
    let k = Math.max(0, monthsDiff);
    let safeGuard = 0;
    while (k < 360 && safeGuard < 400) {
      safeGuard++;
      let nextCycleStart = getCycleStartDate(joinD, k + 1);
      if (targetD >= nextCycleStart) k++;
      else break;
    }

    let totalSalary = baseAdv + (k * monthlySalary);

    if (isStopped) {
      let currentCycleStart = getCycleStartDate(joinD, k);
      let nextCycleStart = getCycleStartDate(joinD, k + 1);
      let currentCycleEnd = new Date(nextCycleStart);
      currentCycleEnd.setDate(currentCycleEnd.getDate() - 1);

      if (targetD >= currentCycleStart && targetD <= currentCycleEnd) {
        if (targetD.getTime() === currentCycleEnd.getTime()) {
          totalSalary += monthlySalary;
        } else {
          let diffMs = targetD.getTime() - currentCycleStart.getTime();
          let daysWorked = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
          let year = targetD.getFullYear();
          let month = targetD.getMonth() + 1;
          let daysInMonth = new Date(year, month, 0).getDate();
          let dailyRate = monthlySalary / daysInMonth;
          let proRataAmt = Math.round(dailyRate * daysWorked * 100) / 100;
          totalSalary += proRataAmt;
        }
      }
    }
    return totalSalary;
  } catch (e) {
    return baseAdv;
  }
}

function calculateEmployeePendingBalance(emp, asOfDateStr) {
  if (!emp) return 0;
  const refDate = asOfDateStr || (document.getElementById("mobileFilterDate")?.value || getSaudiBusinessDate());
  const totalAccrued = calculateEmployeeAccruedSalary(emp, refDate);

  let allTx = Array.isArray(transactionsList) ? [...transactionsList] : [];
  const offlineQueue = getOfflineQueue();
  offlineQueue.forEach(item => { 
    const record = item.payload ? item.payload : item;
    allTx.unshift(record); 
  });

  const empClean = cleanPartyName(emp.name);
  let totalPaid = 0;

  allTx.forEach(t => {
    if (t && t.type === 'salary') {
      let staffClean = cleanPartyName(t.party_name);
      if (staffClean.includes(empClean)) {
        let tDate = cleanDate(t.date);
        if (refDate && tDate > refDate) return;
        let cAmt = parseFloat(t.cash_amount) || 0;
        let bAmt = parseFloat(t.bank_amount) || 0;
        totalPaid += (-cAmt - bAmt);
      }
    }
  });

  return totalAccrued - totalPaid;
}

function calculateUtilityExpenseLiveBalance(expItem) {
  if (!expItem) return 0;
  let bal = parseFloat(expItem.opening_balance) || 0;
  const cleanExp = cleanPartyName(expItem.name);

  transactionsList.forEach(t => {
    if (!t) return;
    const tPartyClean = cleanPartyName(t.party_name);
    if (tPartyClean.startsWith(cleanExp) || tPartyClean === cleanExp) {
      if (t.type === 'expense_bill') {
        bal += (parseFloat(t.credit_amount) || 0);
      } else if (t.type === 'expense') {
        bal -= (Math.abs(parseFloat(t.cash_amount) || 0) + Math.abs(parseFloat(t.bank_amount) || 0));
      }
    }
  });
  return bal;
}

// UNIFIED PARTY SELECTED
function onUnifiedPartySelected() {
  const val = document.getElementById("unifiedPartyInput").value.trim();
  const cleanVal = cleanPartyName(val);
  const emp = employeesList.find(e => cleanPartyName(e.name) === cleanVal);
  const expItem = expensesMasterList.find(ex => cleanPartyName(ex.name) === cleanVal);

  const badge = document.getElementById("currentExpTypeBadge");
  const btn = document.getElementById("btnSaveUnified");
  const info = document.getElementById("unifiedPartyInfo");
  const staffDepBtn = document.getElementById("btnStaffDepositTrigger");
  const addBillBtn = document.getElementById("btnAddUtilityBillTrigger");

  if (emp) {
    badge.className = "text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold";
    badge.innerText = "സാലറി";
    if (staffDepBtn) staffDepBtn.classList.remove("hidden");
    if (addBillBtn) addBillBtn.classList.add("hidden");

    btn.className = "w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-sm font-black shadow-lg shadow-purple-600/30 touch-btn cursor-pointer flex items-center justify-center gap-1.5 transition";
    btn.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> സാലറി സേവ് ചെയ്യുക`;

    const busDate = document.getElementById("mobileFilterDate")?.value || getSaudiBusinessDate();
    const liveBal = calculateEmployeePendingBalance(emp, busDate);
    info.className = "text-xs font-black text-purple-700 block mt-1 truncate";
    info.innerText = `ലൈവ് സാലറി ബാക്കി: ${liveBal.toLocaleString('en-IN')} (ശമ്പളം: ${emp.monthly_salary || 0} | ജോയിനിങ്: ${emp.joining_date || '-'})`;
  } else {
    badge.className = "text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold";
    badge.innerText = "ചിലവ്";
    if (staffDepBtn) staffDepBtn.classList.add("hidden");

    if (expItem && expItem.type === 'utility') {
      if (addBillBtn) addBillBtn.classList.remove("hidden");
      const liveBal = calculateUtilityExpenseLiveBalance(expItem);
      if (liveBal > 0) {
        info.className = "text-xs font-black text-rose-700 block mt-1 truncate";
        info.innerText = `⚠️ അടയ്ക്കാനുള്ള ലൈവ് കുടിശ്ശിക: ${liveBal.toLocaleString('en-IN')}`;
      } else if (liveBal < 0) {
        info.className = "text-xs font-black text-emerald-700 block mt-1 truncate";
        info.innerText = `🟢 അഡ്വാൻസ് / കൂടുതൽ നൽകിയത്: ${liveBal.toLocaleString('en-IN')}`;
      } else {
        info.className = "text-xs font-black text-slate-600 block mt-1 truncate";
        info.innerText = `കുടിശ്ശികയില്ല (0.00)`;
      }
    } else {
      if (addBillBtn) addBillBtn.classList.add("hidden");
      info.innerText = "";
    }

    btn.className = "w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-sm font-black shadow-lg shadow-amber-600/30 touch-btn cursor-pointer flex items-center justify-center gap-1.5 transition";
    btn.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> ചിലവ് സേവ് ചെയ്യുക`;
  }
  if (window.lucide) lucide.createIcons();
}

// DYNAMIC OPENING BALANCE TOGGLE
function toggleNewExpenseOpeningField(type) {
  const cont = document.getElementById("newExpOpeningContainer");
  if (!cont) return;
  if (type === 'regular') {
    cont.classList.add("hidden");
    document.getElementById("newExpOpening").value = "";
  } else {
    cont.classList.remove("hidden");
  }
}

function toggleEditExpenseOpeningField(type) {
  const openingBox = document.getElementById("editMasterOpeningBox");
  if (!openingBox) return;
  if (type === 'regular') {
    openingBox.classList.add("hidden");
    document.getElementById("editMasterOpening").value = "0";
  } else {
    openingBox.classList.remove("hidden");
  }
}

// UTILITY BILL MODAL (+BILL)
function openAddUtilityBillModal() {
  const currentVal = document.getElementById("unifiedPartyInput").value.trim().toUpperCase();
  const cleanVal = cleanPartyName(currentVal);
  const expItem = expensesMasterList.find(e => cleanPartyName(e.name) === cleanVal);

  if (!expItem) return alert("ദയവായി ആദ്യം ചിലവ് ഇനം തിരഞ്ഞെടുക്കുക!");

  document.getElementById("billExpNameDisplay").value = expItem.name;
  document.getElementById("billExpNewAmount").value = "";
  document.getElementById("billExpNote").value = "";
  document.getElementById("expenseBillModal").classList.remove("hidden");
  document.getElementById("billExpNewAmount").focus();
}

function closeAddUtilityBillModal() {
  document.getElementById("expenseBillModal").classList.add("hidden");
}

async function saveUtilityBillAddition() {
  const name = document.getElementById("billExpNameDisplay").value.trim();
  const amt = parseFloat(document.getElementById("billExpNewAmount").value) || 0;
  const note = document.getElementById("billExpNote").value.trim();

  if (amt <= 0) return alert("ബില്ല് തുക നൽകുക!");

  const payload = {
    date: getSelectedDate(),
    type: 'expense_bill',
    party_name: `${name} (പുതിയ ബില്ല്: ${note || amt})`,
    cash_amount: 0,
    bank_amount: 0,
    credit_amount: amt
  };

  const tempId = 'temp_bill_' + Date.now();
  const localRecord = { ...payload, id: tempId };
  transactionsList.unshift(localRecord);
  localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));

  if (!navigator.onLine || !supabaseClient) {
    pushToOfflineQueue(payload);
    renderQuickTotalsAndRecent();
    alert("⚠️ ഓഫ്‍ലൈൻ മോഡ്: പുതിയ ബില്ല് ഫോണിൽ സേവ് ചെയ്തു!");
  } else {
    const { data, error } = await supabaseClient.from('transactions').insert([payload]).select();
    if (error) {
      console.error("Supabase Bill Error:", error);
      alert("⚠️ ക്ലൗഡ് കണക്ഷൻ പിശക്! ബില്ല് ഫോണിൽ താൽക്കാലികമായി സൂക്ഷിച്ചിട്ടുണ്ട്.");
      pushToOfflineQueue(payload);
    } else if (data && data[0]) {
      localRecord.id = data[0].id;
      localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));
      alert("പുതിയ ബില്ല് തുക വിജയകരമായി ചേർത്തു!");
    }
    renderQuickTotalsAndRecent();
  }

  closeAddUtilityBillModal();
  onUnifiedPartySelected();
}

// OPENING FUNDS MODAL
function openOpeningFundModal() {
  document.getElementById("setOpeningCashInput").value = openingSettings.openingCash;
  document.getElementById("setOpeningBankInput").value = openingSettings.openingBank;
  document.getElementById("openingFundModal").classList.remove("hidden");
}

function closeOpeningFundModal() {
  document.getElementById("openingFundModal").classList.add("hidden");
}

async function requestSaveOpeningFunds() {
  const cash = parseFloat(document.getElementById("setOpeningCashInput").value) || 0;
  const bank = parseFloat(document.getElementById("setOpeningBankInput").value) || 0;

  const enteredPin = prompt("തുടക്ക ഫണ്ട് മാറ്റാൻ അഡ്മിൻ മാസ്റ്റർ പിൻ നൽകുക:");
  const masterPin = getMasterPin();
  if (enteredPin !== masterPin) return alert("അഡ്മിൻ മാസ്റ്റർ പിൻ തെറ്റാണ്!");

  openingSettings.openingCash = cash;
  openingSettings.openingBank = bank;

  if (navigator.onLine && supabaseClient) {
    try {
      const { data } = await supabaseClient.from('app_settings').select('*');
      if (data && data[0]) {
        await supabaseClient.from('app_settings').update({ opening_cash: cash, opening_bank: bank }).eq('id', data[0].id);
      } else {
        await supabaseClient.from('app_settings').insert([{ opening_cash: cash, opening_bank: bank }]);
      }
    } catch (e) {
      console.warn("Settings update error:", e);
    }
  }

  renderQuickTotalsAndRecent();
  closeOpeningFundModal();
  alert("തുടക്ക ഫണ്ട് അപ്‌ഡേറ്റ് ചെയ്തു!");
}

// BACKUP MODAL
function openBackupModal() { document.getElementById("backupModal").classList.remove("hidden"); }
function closeBackupModal() { document.getElementById("backupModal").classList.add("hidden"); }

// EMPLOYEE STOP & FINAL SETTLEMENT
function openEmployeeStopModal(empName) {
  const emp = employeesList.find(e => e.name === empName);
  if (!emp) return alert("ജീവനക്കാരനെ കണ്ടെത്താനായില്ല!");

  document.getElementById("stopEmpOriginalName").value = emp.name;
  document.getElementById("stopEmpNameDisplay").value = emp.name;
  document.getElementById("stopEmpSalaryDisplay").value = emp.monthly_salary || 0;
  document.getElementById("stopEmpJoinDisplay").value = emp.joining_date || '-';

  const stopInput = document.getElementById("stopEmpDateInput");
  stopInput.value = (emp.status === 'stopped' && emp.stop_date) ? cleanDate(emp.stop_date) : getSaudiBusinessDate();

  const btn = document.getElementById("btnConfirmEmpStop");
  if (emp.status === 'stopped') {
    btn.innerText = "വീണ്ടും ആക്ടീവാക്കുക (Re-activate)";
    btn.className = "flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow cursor-pointer";
  } else {
    btn.innerText = "ജോലി നിർത്തുക (Stop)";
    btn.className = "flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow cursor-pointer";
  }

  calculateLiveStopSettlement();
  document.getElementById("employeeStopModal").classList.remove("hidden");
}

function closeEmployeeStopModal() {
  document.getElementById("employeeStopModal").classList.add("hidden");
}

function calculateLiveStopSettlement() {
  const empName = document.getElementById("stopEmpOriginalName").value;
  const emp = employeesList.find(e => e.name === empName);
  if (!emp) return;

  const stopDateStr = document.getElementById("stopEmpDateInput").value || getSaudiBusinessDate();
  const monthlySalary = parseFloat(emp.monthly_salary) || 0;
  const joinD = parseToDateObj(emp.joining_date);
  const targetD = parseToDateObj(stopDateStr);

  let monthsDiff = (targetD.getFullYear() - joinD.getFullYear()) * 12 + (targetD.getMonth() - joinD.getMonth());
  if (targetD.getDate() < joinD.getDate()) monthsDiff--;
  let k = Math.max(0, monthsDiff);
  while (k < 360) {
    let nextCycleStart = getCycleStartDate(joinD, k + 1);
    if (targetD >= nextCycleStart) k++;
    else break;
  }

  let currentCycleStart = getCycleStartDate(joinD, k);
  let diffMs = targetD.getTime() - currentCycleStart.getTime();
  let daysWorked = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);

  let daysInMonth = new Date(targetD.getFullYear(), targetD.getMonth() + 1, 0).getDate();
  let dailyRate = monthlySalary > 0 ? (monthlySalary / daysInMonth) : 0;
  let proRata = Math.round(dailyRate * daysWorked * 100) / 100;

  const tempEmp = { ...emp, status: 'stopped', stop_date: stopDateStr };
  const totalAccrued = calculateEmployeeAccruedSalary(tempEmp, stopDateStr);
  const finalDue = calculateEmployeePendingBalance(tempEmp, stopDateStr);
  const totalPaid = totalAccrued - finalDue;

  document.getElementById("calcWorkedDays").innerText = `${daysWorked} ദിവസം`;
  document.getElementById("calcDailyRate").innerText = dailyRate.toFixed(2);
  document.getElementById("calcProRata").innerText = proRata.toLocaleString('en-IN');
  document.getElementById("calcTotalAccrued").innerText = totalAccrued.toLocaleString('en-IN');
  document.getElementById("calcTotalPaid").innerText = totalPaid.toLocaleString('en-IN');
  document.getElementById("calcFinalDue").innerText = finalDue.toLocaleString('en-IN');
}

async function saveEmployeeStopSettlement() {
  const empName = document.getElementById("stopEmpOriginalName").value;
  const emp = employeesList.find(e => e.name === empName);
  if (!emp) return;

  const isCurrentlyStopped = (emp.status === 'stopped');
  const stopDate = document.getElementById("stopEmpDateInput").value;

  let payload = {};
  if (isCurrentlyStopped) {
    if (!confirm(`'${emp.name}' എന്ന ജീവനക്കാരനെ വീണ്ടും ജോലിയിൽ തിരികെ പ്രവേശിപ്പിക്കണമോ?`)) return;
    payload = { status: 'active', stop_date: null };
  } else {
    if (!confirm(`'${emp.name}' എന്ന ജീവനക്കാരന്റെ ജോലി ${stopDate} തീയതിയിൽ അവസാനിപ്പിക്കണമോ?`)) return;
    payload = { status: 'stopped', stop_date: stopDate };
  }

  if (navigator.onLine && supabaseClient) {
    if (emp.id) await supabaseClient.from('employees').update(payload).eq('id', emp.id);
    else await supabaseClient.from('employees').update(payload).eq('name', emp.name);
  }

  Object.assign(emp, payload);
  localStorage.setItem(`ALNASSR_${currentShopId}_EMPLOYEES`, JSON.stringify(employeesList));

  closeEmployeeStopModal();
  renderActiveMasterList();
  alert("വിവരങ്ങൾ അപ്‌ഡേറ്റ് ചെയ്തു!");
}

// TRANSFER & STAFF DEPOSIT
function openTransferModal() {
  document.getElementById("depositAmount").value = "";
  document.getElementById("withdrawalAmount").value = "";
  document.getElementById("transferModal").classList.remove("hidden");
}
function closeTransferModal() { document.getElementById("transferModal").classList.add("hidden"); }

async function saveDeposit() {
  let amt = parseFloat(document.getElementById("depositAmount").value) || 0;
  let date = getSelectedDate();
  if (amt <= 0) return alert("തുക നൽകുക!");

  let payload = {
    date: date,
    type: 'transfer',
    party_name: 'Deposit (Cash to Bank)',
    cash_amount: -amt,
    bank_amount: amt,
    credit_amount: 0
  };

  const tempRecord = { ...payload, id: 'temp_' + Date.now() };
  transactionsList.unshift(tempRecord);
  localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));

  if (!navigator.onLine || !supabaseClient) {
    pushToOfflineQueue(payload);
    renderQuickTotalsAndRecent();
    alert("ബാങ്കിലേക്ക് നിക്ഷേപിച്ച തുക സേവ് ചെയ്തു!");
  } else {
    const { data, error } = await supabaseClient.from('transactions').insert([payload]).select();
    if (!error && data && data[0]) tempRecord.id = data[0].id;
    alert("ബാങ്കിലേക്ക് നിക്ഷേപിച്ചു!");
    fetchAllData();
  }
  closeTransferModal();
}

async function saveWithdrawal() {
  let amt = parseFloat(document.getElementById("withdrawalAmount").value) || 0;
  let date = getSelectedDate();
  if (amt <= 0) return alert("തുക നൽകുക!");

  let payload = {
    date: date,
    type: 'transfer',
    party_name: 'Withdrawal (Bank to Cash)',
    cash_amount: amt,
    bank_amount: -amt,
    credit_amount: 0
  };

  const tempRecord = { ...payload, id: 'temp_' + Date.now() };
  transactionsList.unshift(tempRecord);
  localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));

  if (!navigator.onLine || !supabaseClient) {
    pushToOfflineQueue(payload);
    renderQuickTotalsAndRecent();
    alert("കയ്യിലേക്ക് എടുത്ത തുക സേവ് ചെയ്തു!");
  } else {
    const { data, error } = await supabaseClient.from('transactions').insert([payload]).select();
    if (!error && data && data[0]) tempRecord.id = data[0].id;
    alert("കയ്യിലേക്ക് പിൻവലിച്ചു!");
    fetchAllData();
  }
  closeTransferModal();
}

function openStaffDepositModal() {
  const currentVal = document.getElementById("unifiedPartyInput").value.trim().toUpperCase();
  const cleanVal = cleanPartyName(currentVal);
  const emp = employeesList.find(e => cleanPartyName(e.name) === cleanVal);

  if (!emp) return alert("ദയവായി ആദ്യം ജീവനക്കാരന്റെ പേര് തിരഞ്ഞെടുക്കുക!");

  document.getElementById("staffDepositEmpName").value = emp.name;
  document.getElementById("staffDepositCash").value = "";
  document.getElementById("staffDepositBank").value = "";
  document.getElementById("staffDepositNote").value = "";
  document.getElementById("staffDepositModal").classList.remove("hidden");
  document.getElementById("staffDepositCash").focus();
}

function closeStaffDepositModal() { document.getElementById("staffDepositModal").classList.add("hidden"); }

async function saveStaffDepositEntry() {
  const empName = document.getElementById("staffDepositEmpName").value.trim().toUpperCase();
  const cash = parseFloat(document.getElementById("staffDepositCash").value) || 0;
  const bank = parseFloat(document.getElementById("staffDepositBank").value) || 0;
  const note = document.getElementById("staffDepositNote").value.trim();

  if (!empName) return alert("ജീവനക്കാരന്റെ പേര് തിരഞ്ഞെടുക്കുക!");
  if (cash <= 0 && bank <= 0) return alert("തുക നൽകുക!");

  const finalNote = note ? `കടത്തിലേക്ക് തന്നത് (${note})` : 'കടത്തിലേക്ക് തന്നത്';
  const payload = {
    date: getSelectedDate(),
    type: 'salary',
    party_name: `Staff: ${empName} - ${finalNote}`,
    cash_amount: cash,
    bank_amount: bank,
    credit_amount: 0
  };

  const tempRecord = { ...payload, id: 'temp_' + Date.now() };
  transactionsList.unshift(tempRecord);
  localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));

  if (!navigator.onLine || !supabaseClient) {
    pushToOfflineQueue(payload);
    renderQuickTotalsAndRecent();
    alert("⚠️ ഓഫ്‍ലൈൻ മോഡ്: സ്റ്റാഫ് തന്ന വരവ് സേവ് ചെയ്തു!");
  } else {
    const { data, error } = await supabaseClient.from('transactions').insert([payload]).select();
    if (!error && data && data[0]) tempRecord.id = data[0].id;
    alert("സ്റ്റാഫ് തന്ന വരവ് വിജയകരമായി സേവ് ചെയ്തു!");
    fetchAllData();
  }
  closeStaffDepositModal();
  onUnifiedPartySelected();
}

// OFFLINE QUEUE LOGIC
function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(`ALNASSR_${currentShopId}_OFFLINE_TXNS`)) || []; }
  catch (e) { return []; }
}

function pushToOfflineQueue(payload) {
  const queue = getOfflineQueue();
  queue.push({ ...payload, _timestamp: Date.now() });
  localStorage.setItem(`ALNASSR_${currentShopId}_OFFLINE_TXNS`, JSON.stringify(queue));
  checkOfflineQueueUI();
}

function checkOfflineQueueUI() {
  const queue = getOfflineQueue();
  const bar = document.getElementById("offlineSyncBar");
  const msg = document.getElementById("offlineSyncMsg");
  if (!bar) return;
  if (queue.length > 0) {
    bar.classList.remove("hidden");
    if (msg) msg.innerText = `${queue.length} ഓഫ്‍ലൈൻ എൻട്രികൾ സേവ് ചെയ്തിട്ടുണ്ട്. സിങ്ക് ചെയ്യാൻ ഇവിടെ ക്ലിക്ക് ചെയ്യുക.`;
  } else {
    bar.classList.add("hidden");
  }
}

async function syncOfflineQueue() {
  if (!navigator.onLine || !supabaseClient) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    checkOfflineQueueUI();
    return;
  }

  let successCount = 0;
  const remaining = [];
  let lastErrorMsg = "";

  for (const item of queue) {
    const raw = item.payload ? item.payload : item;
    
    const cleanPayload = {
      date: raw.date || getSaudiBusinessDate(),
      type: raw.type || 'sale',
      party_name: raw.party_name || 'UNKNOWN',
      cash_amount: parseFloat(raw.cash_amount) || 0,
      bank_amount: parseFloat(raw.bank_amount) || 0,
      credit_amount: parseFloat(raw.credit_amount) || 0
    };

    try {
      const { error } = await supabaseClient.from('transactions').insert([cleanPayload]);
      if (error) {
        console.error("Sync item error:", error);
        lastErrorMsg = error.message;
        remaining.push(item);
      } else {
        successCount++;
      }
    } catch (e) {
      console.error("Sync item exception:", e);
      lastErrorMsg = e.message;
      remaining.push(item);
    }
  }

  localStorage.setItem(`ALNASSR_${currentShopId}_OFFLINE_TXNS`, JSON.stringify(remaining));
  checkOfflineQueueUI();

  if (successCount > 0) {
    fetchAllData();
  }

  if (remaining.length > 0) {
    const force = confirm(`⚠️ ${remaining.length} ഓഫ്‍ലൈൻ എൻട്രികൾ ക്ലൗഡിലേക്ക് കയറാതെ തടസ്സപ്പെട്ടിരിക്കുന്നു!\nകാരണം: ${lastErrorMsg || 'ഡാറ്റാബേസ് കണക്ഷൻ എറർ'}\n\nഈ എൻട്രികൾ ഒഴിവാക്കി മഞ്ഞ ബാർ മാറ്റണമോ?`);
    if (force) {
      localStorage.removeItem(`ALNASSR_${currentShopId}_OFFLINE_TXNS`);
      checkOfflineQueueUI();
      alert("തടസ്സപ്പെട്ട എൻട്രികൾ ഒഴിവാക്കി മഞ്ഞ ബാർ മാറ്റി!");
    }
  }
}

// TRANSACTIONS SAVING
async function saveSaleEntry() {
  let rawName = document.getElementById("saleCustomerInput").value.trim().toUpperCase();
  if (!rawName) return alert("കസ്റ്റമർ പേര് നൽകുക!");
  let name = rawName.split(' (')[0].trim();

  let cust = customersList.find(c => cleanPartyName(c.name) === cleanPartyName(name));
  if (!cust) {
    const newCust = { name: name, type: 'cash', opening_balance: 0 };
    if (navigator.onLine && supabaseClient) {
      try { 
        const { data } = await supabaseClient.from('customers').insert([newCust]).select(); 
        if (data && data[0]) newCust.id = data[0].id;
      } catch (e) {}
    }
    customersList.push(newCust);
    localStorage.setItem(`ALNASSR_${currentShopId}_CUSTOMERS`, JSON.stringify(customersList));
    populateDropdowns();
  }

  const cash = parseFloat(document.getElementById("saleCash")?.value) || 0;
  const bank = parseFloat(document.getElementById("saleBank")?.value) || 0;
  const credit = parseFloat(document.getElementById("saleCredit")?.value) || 0;

  if (cash <= 0 && bank <= 0 && credit <= 0) return alert("തുക നൽകുക!");

  if (cust && cust.credit_limit && parseFloat(cust.credit_limit) > 0 && credit > 0) {
    const limit = parseFloat(cust.credit_limit);
    let liveBal = parseFloat(cust.opening_balance) || 0;
    transactionsList.forEach(t => {
      if (t && cleanPartyName(t.party_name) === cleanPartyName(name) && t.type === 'sale') {
        liveBal += (parseFloat(t.credit_amount) || 0) - (parseFloat(t.cash_amount) || 0) - (parseFloat(t.bank_amount) || 0);
      }
    });
    if (liveBal + credit > limit) {
      if (!confirm(`⚠️ ശ്രദ്ധിക്കുക: ഈ കസ്റ്റമറുടെ ക്രെഡിറ്റ് ലിമിറ്റ് (${limit} SR) കവിയുന്നു!\nപുതിയ ആകെ കടം: ${(liveBal + credit).toLocaleString('en-IN')} SR ആകും.\n\nഎങ്കിലും ഈ ബില്ല് സേവ് ചെയ്യണമോ?`)) {
        return;
      }
    }
  }

  const payload = {
    date: getSelectedDate(),
    type: 'sale',
    party_name: name,
    cash_amount: cash,
    bank_amount: bank,
    credit_amount: credit
  };

  const tempRecord = { ...payload, id: 'temp_' + Date.now() };
  transactionsList.unshift(tempRecord);
  localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));

  if (!navigator.onLine || !supabaseClient) {
    pushToOfflineQueue(payload);
    renderQuickTotalsAndRecent();
    alert("⚠️ ഓഫ്‍ലൈൻ മോഡ്: സെയിൽ ഫോണിൽ സേവ് ചെയ്തു!");
  } else {
    const { data, error } = await supabaseClient.from('transactions').insert([payload]).select();
    if (error) {
      console.error("Supabase Error:", error);
      pushToOfflineQueue(payload);
      alert("⚠️ ക്ലൗഡ് കണക്ഷൻ പിശക്! സെയിൽ ഫോണിൽ സൂക്ഷിച്ചിട്ടുണ്ട്.");
    } else if (data && data[0]) {
      tempRecord.id = data[0].id;
      localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));
      alert("സെയിൽ സേവ് ചെയ്തു!");
    }
    renderQuickTotalsAndRecent();
  }

  document.getElementById("saleCustomerInput").value = "SHOPE";
  onCustomerSelected();
}

async function savePurchaseEntry() {
  let rawName = document.getElementById("purchaseVendorInput").value.trim().toUpperCase();
  if (!rawName) return alert("വെണ്ടർ പേര് നൽകുക!");
  let name = rawName.split(' (')[0].trim();

  let vend = vendorsList.find(v => cleanPartyName(v.name) === cleanPartyName(name));
  if (!vend) {
    const newVend = { name: name, type: 'cash', opening_balance: 0 };
    if (navigator.onLine && supabaseClient) {
      try { 
        const { data } = await supabaseClient.from('vendors').insert([newVend]).select(); 
        if (data && data[0]) newVend.id = data[0].id;
      } catch (e) {}
    }
    vendorsList.push(newVend);
    localStorage.setItem(`ALNASSR_${currentShopId}_VENDORS`, JSON.stringify(vendorsList));
    populateDropdowns();
  }

  const cash = parseFloat(document.getElementById("purCash")?.value) || 0;
  const bank = parseFloat(document.getElementById("purBank")?.value) || 0;
  const credit = parseFloat(document.getElementById("purCredit")?.value) || 0;

  if (cash <= 0 && bank <= 0 && credit <= 0) return alert("തുക നൽകുക!");

  const payload = {
    date: getSelectedDate(),
    type: 'purchase',
    party_name: name,
    cash_amount: -cash,
    bank_amount: -bank,
    credit_amount: credit
  };

  const tempRecord = { ...payload, id: 'temp_' + Date.now() };
  transactionsList.unshift(tempRecord);
  localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));

  if (!navigator.onLine || !supabaseClient) {
    pushToOfflineQueue(payload);
    renderQuickTotalsAndRecent();
    alert("⚠️ ഓഫ്‍ലൈൻ മോഡ്: പർച്ചേസ് ഫോണിൽ സേവ് ചെയ്തു!");
  } else {
    const { data, error } = await supabaseClient.from('transactions').insert([payload]).select();
    if (error) {
      console.error("Supabase Error:", error);
      pushToOfflineQueue(payload);
      alert("⚠️ ക്ലൗഡ് കണക്ഷൻ പിശക്! പർച്ചേസ് ഫോണിൽ സൂക്ഷിച്ചിട്ടുണ്ട്.");
    } else if (data && data[0]) {
      tempRecord.id = data[0].id;
      localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));
      alert("പർച്ചേസ് സേവ് ചെയ്തു!");
    }
    renderQuickTotalsAndRecent();
  }

  document.getElementById("purchaseVendorInput").value = "";
  onVendorSelected();
}

async function saveUnifiedExpSalEntry() {
  let rawVal = document.getElementById("unifiedPartyInput").value.trim().toUpperCase();
  if (!rawVal) return alert("ഇനം അല്ലെങ്കിൽ ജീവനക്കാരന്റെ പേര് നൽകുക!");

  const cash = parseFloat(document.getElementById("expSalCashAmt").value) || 0;
  const bank = parseFloat(document.getElementById("expSalBankAmt").value) || 0;
  const note = document.getElementById("expSalNote").value.trim();

  if (cash <= 0 && bank <= 0) return alert("തുക നൽകുക!");

  const emp = employeesList.find(e => cleanPartyName(e.name) === cleanPartyName(rawVal));
  let payload = {};

  if (emp) {
    payload = {
      date: getSelectedDate(),
      type: 'salary',
      party_name: `Staff: ${emp.name} - ${note || 'സാലറി/അഡ്വാൻസ്'}`,
      cash_amount: -cash,
      bank_amount: -bank,
      credit_amount: 0
    };
  } else {
    let expName = rawVal.split(' (')[0].trim();
    let exp = expensesMasterList.find(e => cleanPartyName(e.name) === cleanPartyName(expName));

    if (!exp) {
      const newExp = { name: expName, type: 'regular', opening_balance: 0 };
      if (navigator.onLine && supabaseClient) {
        try { 
          const { data } = await supabaseClient.from('expenses_master').insert([newExp]).select(); 
          if (data && data[0]) newExp.id = data[0].id;
        } catch (e) {}
      }
      expensesMasterList.push(newExp);
      localStorage.setItem(`ALNASSR_${currentShopId}_EXPENSES`, JSON.stringify(expensesMasterList));
      populateDropdowns();
    }

    payload = {
      date: getSelectedDate(),
      type: 'expense',
      party_name: `${expName} (${note || expName})`,
      cash_amount: -cash,
      bank_amount: -bank,
      credit_amount: 0
    };
  }

  const tempRecord = { ...payload, id: 'temp_' + Date.now() };
  transactionsList.unshift(tempRecord);
  localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));

  if (!navigator.onLine || !supabaseClient) {
    pushToOfflineQueue(payload);
    renderQuickTotalsAndRecent();
    alert("⚠️ ഓഫ്‍ലൈൻ മോഡ്: ചിലവ് ഫോണിൽ സേവ് ചെയ്തു!");
  } else {
    const { data, error } = await supabaseClient.from('transactions').insert([payload]).select();
    if (error) {
      console.error("Supabase Error:", error);
      pushToOfflineQueue(payload);
      alert("⚠️ ക്ലൗഡ് കണക്ഷൻ പിശക്! ചിലവ് ഫോണിൽ സൂക്ഷിച്ചിട്ടുണ്ട്.");
    } else if (data && data[0]) {
      tempRecord.id = data[0].id;
      localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));
      alert("ചിലവ് സേവ് ചെയ്തു!");
    }
    renderQuickTotalsAndRecent();
  }

  document.getElementById("expSalCashAmt").value = "";
  document.getElementById("expSalBankAmt").value = "";
  document.getElementById("expSalNote").value = "";
  document.getElementById("unifiedPartyInput").value = "";
  onUnifiedPartySelected();
}

// HOME DASHBOARD TOTALS
function renderQuickTotalsAndRecent() {
  const selectedDate = getSelectedDate();
  let saleTotal = 0, purTotal = 0, expTotal = 0;

  let curCash = openingSettings.openingCash;
  let curBank = openingSettings.openingBank;

  let modalCashSales = [];
  let modalCreditSales = [];
  let modalCashPurchases = [];
  let modalCreditPurchases = [];
  let modalSalaries = [];
  let modalExpenses = [];

  const selClean = cleanDate(selectedDate);

  transactionsList.forEach(t => {
    if (!t) return;
    curCash += (parseFloat(t.cash_amount) || 0);
    curBank += (parseFloat(t.bank_amount) || 0);

    const tClean = cleanDate(t.date);
    const isSelectedDate = (tClean === selClean);

    if (isSelectedDate) {
      const cAmt = Math.abs(parseFloat(t.cash_amount) || 0);
      const bAmt = Math.abs(parseFloat(t.bank_amount) || 0);
      const crAmt = parseFloat(t.credit_amount) || 0;

      if (t.type === 'sale') {
        const cleanN = cleanPartyName(t.party_name);
        const cust = customersList.find(c => cleanPartyName(c.name) === cleanN);
        const isCreditCust = cust && (cust.type || '').toLowerCase() === 'credit';

        if (isCreditCust) {
          saleTotal += crAmt;
          modalCreditSales.push({ id: t.id, name: t.party_name, cash: cAmt, bank: bAmt, cr: crAmt });
        } else {
          saleTotal += (cAmt + bAmt + crAmt);
          modalCashSales.push({ id: t.id, name: t.party_name, cash: cAmt, bank: bAmt, total: (cAmt + bAmt + crAmt) });
        }
      } else if (t.type === 'purchase') {
        const cleanN = cleanPartyName(t.party_name);
        const vend = vendorsList.find(v => cleanPartyName(v.name) === cleanN);
        const isCreditVend = vend && (vend.type || '').toLowerCase() === 'credit';

        if (isCreditVend) {
          purTotal += crAmt;
          modalCreditPurchases.push({ id: t.id, name: t.party_name, cash: cAmt, bank: bAmt, cr: crAmt });
        } else {
          purTotal += (cAmt + bAmt + crAmt);
          modalCashPurchases.push({ id: t.id, name: t.party_name, cash: cAmt, bank: bAmt, total: (cAmt + bAmt + crAmt) });
        }
      } else if (t.type === 'salary') {
        let rawC = parseFloat(t.cash_amount) || 0;
        let rawB = parseFloat(t.bank_amount) || 0;
        if (rawC > 0 || rawB > 0) {
          modalSalaries.push({ 
            id: t.id, 
            name: `${t.party_name} (📥 വരവ്)`, 
            cash: rawC, 
            bank: rawB, 
            total: `+${rawC + rawB}`,
            isInflow: true 
          });
        } else {
          let posC = Math.abs(rawC);
          let posB = Math.abs(rawB);
          expTotal += (posC + posB);
          modalSalaries.push({ 
            id: t.id, 
            name: t.party_name, 
            cash: posC, 
            bank: posB, 
            total: posC + posB,
            isInflow: false 
          });
        }
      } else if (t.type === 'expense') {
        expTotal += (cAmt + bAmt);
        modalExpenses.push({ id: t.id, name: t.party_name, cash: cAmt, bank: bAmt, total: (cAmt + bAmt), isInflow: false });
      }
    }
  });

  document.getElementById("quickSaleTotal").innerText = `${saleTotal.toLocaleString('en-IN')}`;
  document.getElementById("quickPurTotal").innerText = `${purTotal.toLocaleString('en-IN')}`;
  document.getElementById("quickExpTotal").innerText = `${expTotal.toLocaleString('en-IN')}`;

  const totalLiq = curCash + curBank;
  document.getElementById("liveTotalLiquid").innerText = `${totalLiq.toLocaleString('en-IN')}`;
  document.getElementById("liveHandCash").innerText = `💵 ക്യാഷ്: ${curCash.toLocaleString('en-IN')}`;
  document.getElementById("liveBankCash").innerText = `🏦 ബാങ്ക്: ${curBank.toLocaleString('en-IN')}`;

  renderModalTable("modalCashSalesList", modalCashSales, ["കസ്റ്റമർ", "ക്യാഷ്", "ബാങ്ക്", "ആകെ"], 'cash_sale');
  renderModalTable("modalCreditSalesList", modalCreditSales, ["കസ്റ്റമർ", "ക്യാഷ് റസീറ്റ്", "ബാങ്ക് റസീറ്റ്", "ക്രെഡിറ്റ് സെയിൽ"], 'credit_sale');
  renderModalTable("modalCashPurchasesList", modalCashPurchases, ["വെണ്ടർ", "ക്യാഷ്", "ബാങ്ക്", "ആകെ"], 'cash_pur');
  renderModalTable("modalCreditPurchasesList", modalCreditPurchases, ["വെണ്ടർ", "ക്യാഷ് നൽകിയത്", "ബാങ്ക് നൽകിയത്", "ക്രെഡിറ്റ് ബില്ല്"], 'credit_pur');
  renderModalTable("modalSalariesList", modalSalaries, ["സ്റ്റാഫ്", "ക്യാഷ്", "ബാങ്ക്", "ആകെ"], 'salary');
  renderModalTable("modalExpensesList", modalExpenses, ["ചിലവ് ഇനം", "ക്യാഷ്", "ബാങ്ക്", "ആകെ"], 'expense');
}

function renderModalTable(containerId, dataList, headers, type) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!dataList || dataList.length === 0) {
    container.innerHTML = `<div class="p-2 text-center text-slate-400 text-xs font-bold">ഇടപാടുകൾ ഇല്ല</div>`;
    return;
  }

  let total1 = 0, total2 = 0, total3 = 0;

  let html = `
    <table class="w-full text-[11px] text-center border-collapse border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <thead>
        <tr class="bg-slate-100 text-slate-900 font-black border-b border-slate-200">
          <th class="p-1.5 text-left">${headers[0]}</th>
          <th class="p-1.5">${headers[1]}</th>
          <th class="p-1.5">${headers[2]}</th>
          <th class="p-1.5">${headers[3]}</th>
          <th class="p-1.5 text-right">⚙️</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 font-bold">
  `;

  dataList.forEach(row => {
    let col1 = row.cash || 0;
    let col2 = row.bank || 0;
    let col3 = (row.cr !== undefined) ? row.cr : (row.total || 0);

    if (!row.isInflow) {
      total1 += col1;
      total2 += col2;
      total3 += (typeof col3 === 'number') ? col3 : 0;
    }

    html += `
      <tr class="hover:bg-slate-50 ${row.isInflow ? 'bg-emerald-50/40 text-emerald-900' : ''}">
        <td class="p-1.5 text-left font-black truncate max-w-[110px]" title="${row.name}">
          ${row.name}
        </td>
        <td class="p-1.5">${col1}</td>
        <td class="p-1.5">${col2}</td>
        <td class="p-1.5 font-black ${row.isInflow ? 'text-emerald-700 font-extrabold' : 'text-slate-950'}">${col3}</td>
        <td class="p-1.5 text-right whitespace-nowrap">
          <button onclick="requestEdit('${row.id}')" title="തിരുത്തുക" class="text-blue-600 hover:text-blue-800 p-1 cursor-pointer">✏️</button>
          <button onclick="requestDelete('${row.id}')" title="ഡിലീറ്റ്" class="text-rose-600 hover:text-rose-800 p-1 cursor-pointer">🗑️</button>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
      <tfoot>
        <tr class="bg-slate-200 text-slate-950 font-black border-t-2 border-slate-300">
          <td class="p-1.5 text-left uppercase">ആകെ:</td>
          <td class="p-1.5">${total1}</td>
          <td class="p-1.5">${total2}</td>
          <td class="p-1.5 font-black">${total3}</td>
          <td class="p-1.5"></td>
        </tr>
      </tfoot>
    </table>
  `;

  container.innerHTML = html;
}

// EDIT & DELETE TRANSACTIONS
function requestEdit(id) {
  if (String(id).startsWith('temp_')) {
    alert("ഓഫ്‍ലൈനിൽ എടുത്ത എൻട്രിയാണിത്. ഇത് നെറ്റ് വരുമ്പോൾ സിങ്ക് ആകും.");
    return;
  }

  const txn = (transactionsList || []).find(t => String(t.id) === String(id));
  if (!txn) return alert("ഇടപാട് കണ്ടെത്താനായില്ല!");

  const todayStr = getSaudiBusinessDate();
  let isOlderThanLimit = false;

  if (txn.date) {
    const txnDateStr = cleanDate(txn.date);
    const limitDays = window.STAFF_DELETE_LIMIT_DAYS || 2;
    const dToday = new Date(todayStr);
    const dTxn = new Date(txnDateStr);
    const diffDays = Math.floor((dToday - dTxn) / (1000 * 60 * 60 * 24));
    if (diffDays > limitDays) isOlderThanLimit = true;
  }

  if (isOlderThanLimit) {
    pendingAction = 'edit';
    pendingTxnId = id;
    document.getElementById("pinSubText").innerText = "⚠️ 2 ദിവസത്തിൽ കൂടുതൽ പഴക്കമുള്ളതാണ്! എഡിറ്റ് ചെയ്യാൻ സൂപ്പർ അഡ്മിൻ മാസ്റ്റർ പിൻ നൽകുക.";
    const pInp = document.getElementById("pinInput");
    if (pInp) {
      pInp.value = "";
      document.getElementById("pinModal").classList.remove("hidden");
      pInp.focus();
      pInp.select();
    }
  } else {
    openEditModal(txn);
  }
}

function openEditModal(txn) {
  document.getElementById("editTxnId").value = txn.id;
  document.getElementById("editTxnDate").value = cleanDate(txn.date);
  document.getElementById("editTxnParty").value = txn.party_name || "";
  document.getElementById("editTxnCash").value = Math.abs(parseFloat(txn.cash_amount) || 0);
  document.getElementById("editTxnBank").value = Math.abs(parseFloat(txn.bank_amount) || 0);
  
  const crBox = document.getElementById("editCreditContainer");
  if (txn.type === 'expense' || txn.type === 'salary') {
    crBox.classList.add("hidden");
  } else {
    crBox.classList.remove("hidden");
    document.getElementById("editTxnCredit").value = parseFloat(txn.credit_amount) || 0;
  }

  document.getElementById("editTransactionModal").classList.remove("hidden");
}

function closeEditModal() { document.getElementById("editTransactionModal").classList.add("hidden"); }

async function saveEditedTransaction() {
  const id = document.getElementById("editTxnId").value;
  const txn = (transactionsList || []).find(t => String(t.id) === String(id));
  if (!txn) return;

  const newDate = document.getElementById("editTxnDate").value;
  const newParty = document.getElementById("editTxnParty").value.trim().toUpperCase();
  let cashAmt = parseFloat(document.getElementById("editTxnCash").value) || 0;
  let bankAmt = parseFloat(document.getElementById("editTxnBank").value) || 0;
  let creditAmt = parseFloat(document.getElementById("editTxnCredit").value) || 0;

  if (cashAmt <= 0 && bankAmt <= 0 && creditAmt <= 0) return alert("തുക നൽകുക!");

  const isStaffInflow = (txn.type === 'salary' && (parseFloat(txn.cash_amount) > 0 || parseFloat(txn.bank_amount) > 0));

  if ((txn.type === 'purchase' || txn.type === 'expense' || txn.type === 'salary') && !isStaffInflow) {
    cashAmt = -cashAmt;
    bankAmt = -bankAmt;
  }

  const updatePayload = {
    date: newDate,
    party_name: newParty,
    cash_amount: cashAmt,
    bank_amount: bankAmt,
    credit_amount: creditAmt
  };

  if (navigator.onLine && supabaseClient) {
    const { error } = await supabaseClient.from('transactions').update(updatePayload).eq('id', id);
    if (error) return alert("അപ്‌ഡേറ്റ് പരാജയപ്പെട്ടു: " + error.message);
  }

  Object.assign(txn, updatePayload);
  localStorage.setItem(`ALNASSR_${currentShopId}_TRANSACTIONS`, JSON.stringify(transactionsList));
  renderQuickTotalsAndRecent();
  closeEditModal();
  alert("ഇടപാട് വിജയകരമായി തിരുത്തി!");
}

function requestDelete(id) {
  if (String(id).startsWith('temp_')) {
    alert("ഓഫ്‍ലൈനിൽ എടുത്ത എൻട്രിയാണിത്. നെറ്റ് വരുമ്പോൾ സിങ്ക് ആകും.");
    return;
  }
  pendingAction = 'delete';
  pendingTxnId = id;
  
  const txn = (transactionsList || []).find(t => String(t.id) === String(id));
  const todayStr = getSaudiBusinessDate();
  let isOlderThanLimit = false;

  if (txn && txn.date) {
    const txnDateStr = cleanDate(txn.date);
    const limitDays = window.STAFF_DELETE_LIMIT_DAYS || 2;
    const dToday = new Date(todayStr);
    const dTxn = new Date(txnDateStr);
    const diffDays = Math.floor((dToday - dTxn) / (1000 * 60 * 60 * 24));
    if (diffDays > limitDays) isOlderThanLimit = true;
  }

  const subTitle = document.getElementById("pinSubText");
  if (subTitle) {
    subTitle.innerText = isOlderThanLimit 
      ? "⚠️ 2 ദിവസത്തിൽ കൂടുതൽ പഴക്കമുള്ളതാണ്! ഡിലീറ്റ് ചെയ്യാൻ സൂപ്പർ അഡ്മിൻ മാസ്റ്റർ പിൻ നൽകുക." 
      : "ഡിലീറ്റ് ചെയ്യാൻ ലോഗിൻ പിൻ നൽകുക";
  }

  const pInp = document.getElementById("pinInput");
  if (pInp) {
    pInp.value = "";
    document.getElementById("pinModal").classList.remove("hidden");
    pInp.focus();
    pInp.select();
  }
}

function closePinModal() {
  document.getElementById("pinModal").classList.add("hidden");
  pendingTxnId = null;
  pendingAction = null;
}

async function verifyPinAndExecute() {
  const pinVal = document.getElementById("pinInput").value.trim();
  const sessionPin = sessionStorage.getItem("ALNASSR_ACTIVE_PIN");
  const masterPin = getMasterPin();
  const currentShopPin = currentShop ? String(currentShop.pin).trim() : null;

  if (pendingAction === 'open_desktop_portal') {
    const shopsArr = getShopsList();
    const isMaster = (masterPin && pinVal === masterPin);
    const matchedShop = (shopsArr || []).find(s => String(s.pin).trim() === pinVal);

    if (isMaster) {
      // മാസ്റ്റർ പിൻ ആണെങ്കിൽ ഫുൾ അഡ്മിൻ ആക്സസോടെ തുറക്കുന്നു
      sessionStorage.setItem("ALNASSR_LOGGED_IN", "true");
      sessionStorage.setItem("ALNASSR_USER_ROLE", "admin");
      closePinModal();
      window.open("index.html", "_blank");
    } else if (matchedShop) {
      // ഷോപ്പ് പിൻ ആണെങ്കിൽ ആ ഷോപ്പ് മാത്രം സെലക്ട് ചെയ്ത് തുറക്കുന്നു
      sessionStorage.setItem("ALNASSR_LOGGED_IN", "true");
      sessionStorage.setItem("ALNASSR_USER_ROLE", "shop");
      sessionStorage.setItem("ALNASSR_ACTIVE_SHOP_ID", matchedShop.id);
      localStorage.setItem("ALNASSR_SELECTED_SHOP_ID", matchedShop.id);
      closePinModal();
      window.open("index.html", "_blank");
    } else {
      alert("പിൻ തെറ്റാണ്!");
      document.getElementById("pinInput").value = "";
    }
    return;
  }

  if (pendingTxnId) {
    const id = pendingTxnId;
    const txn = (transactionsList || []).find(t => String(t.id) === String(id));
    const todayStr = getSaudiBusinessDate();
    let isOlderThanLimit = false;

    if (txn && txn.date) {
      const txnDateStr = cleanDate(txn.date);
      const limitDays = window.STAFF_DELETE_LIMIT_DAYS || 2;
      const dToday = new Date(todayStr);
      const dTxn = new Date(txnDateStr);
      const diffDays = Math.floor((dToday - dTxn) / (1000 * 60 * 60 * 24));
      if (diffDays > limitDays) isOlderThanLimit = true;
    }

    if (isOlderThanLimit) {
      if (pinVal !== masterPin) {
        alert("⚠️ 2 ദിവസത്തിൽ കൂടുതൽ പഴക്കമുള്ള എൻട്രികൾ തിരുത്താനും ഡിലീറ്റ് ചെയ്യാനും സൂപ്പർ അഡ്മിൻ മാസ്റ്റർ പിൻ തന്നെ വേണം!");
        document.getElementById("pinInput").value = "";
        return;
      }
    } else {
      const isValidPin = (pinVal === sessionPin) || (pinVal === masterPin) || (pinVal === currentShopPin);
      if (!isValidPin) {
        alert("പിൻ തെറ്റാണ്!");
        document.getElementById("pinInput").value = "";
        return;
      }
    }

    const action = pendingAction;
    closePinModal();

    if (action === 'delete') {
      const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
      if (error) alert("ഡിലീറ്റ് ചെയ്യാൻ സാധിച്ചില്ല: " + error.message);
      else {
        alert("വിജയകരമായി ഡിലീറ്റ് ചെയ്തു!");
        fetchAllData();
      }
    } else if (action === 'edit') {
      openEditModal(txn);
    }
  }
}

// MASTER RECORDS MANAGEMENT
function openMasterModal() {
  document.getElementById("masterModal").classList.remove("hidden");
  switchMasterTab(currentMasterTab || 'customer');
  if (window.lucide) lucide.createIcons();
}

function closeMasterModal() { document.getElementById("masterModal").classList.add("hidden"); }

function switchMasterTab(tab) {
  currentMasterTab = tab;
  const tabs = ['customer', 'vendor', 'employee', 'agent', 'expense'];
  tabs.forEach(t => {
    const btn = document.getElementById(`mTabBtn-${t}`);
    if (btn) {
      if (t === tab) btn.className = "flex-1 py-1.5 px-2 rounded-xl bg-emerald-600 text-white shadow font-black whitespace-nowrap cursor-pointer";
      else btn.className = "flex-1 py-1.5 px-2 rounded-xl text-slate-600 font-bold whitespace-nowrap cursor-pointer";
    }
  });
  document.getElementById("masterSearchInput").value = "";
  renderActiveMasterList();
}

function triggerMasterAdd() {
  if (currentMasterTab === 'customer') openNewCustomerModal();
  else if (currentMasterTab === 'vendor') openNewVendorModal();
  else if (currentMasterTab === 'employee') openNewEmployeeModal();
  else if (currentMasterTab === 'agent') quickAddAgentPrompt();
  else if (currentMasterTab === 'expense') openNewExpenseModal();
}

async function quickAddAgentPrompt() {
  let name = prompt("പുതിയ റൂട്ട് ഏജന്റിന്റെ പേര് നൽകുക:");
  if (!name || !name.trim()) return;
  name = name.trim().toUpperCase();

  const newAg = { name: name };
  if (navigator.onLine && supabaseClient) {
    const { data } = await supabaseClient.from('agents').insert([newAg]).select();
    if (data && data[0]) newAg.id = data[0].id;
  } else {
    newAg.id = 'ag_' + Date.now();
  }
  agentsList.push(newAg);
  localStorage.setItem(`ALNASSR_${currentShopId}_AGENTS`, JSON.stringify(agentsList));
  populateDropdowns();
  renderActiveMasterList();
  alert("പുതിയ ഏജന്റിനെ ചേർത്തു!");
}

function renderActiveMasterList() {
  const container = document.getElementById("masterListContainer");
  const search = (document.getElementById("masterSearchInput")?.value || "").trim().toLowerCase();
  let html = "";

  if (currentMasterTab === 'customer') {
    let list = customersList.filter(c => !search || (c.name || '').toLowerCase().includes(search));
    html = `
      <table class="w-full text-xs text-left border-collapse">
        <thead>
          <tr class="bg-emerald-100/70 text-slate-900 font-black border-b">
            <th class="p-2">കസ്റ്റമർ പേര്</th>
            <th class="p-2 text-center">ലിമിറ്റ്</th>
            <th class="p-2 text-center">വിഭാഗം</th>
            <th class="p-2 text-right">പഴയ കടം</th>
            <th class="p-2 text-right">⚙️ നടപടി</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-bold">
    `;
    if (list.length === 0) html += `<tr><td colspan="5" class="p-4 text-center text-slate-400">കസ്റ്റമർമാർ ആരും ഇല്ല</td></tr>`;
    else {
      list.forEach(c => {
        html += `
          <tr class="hover:bg-slate-100/60">
            <td class="p-2 font-black text-slate-900">${c.name}</td>
            <td class="p-2 text-center text-rose-700 font-black">${c.credit_limit || '-'}</td>
            <td class="p-2 text-center"><span class="px-2 py-0.5 rounded text-[10px] ${c.type === 'credit' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">${c.type === 'credit' ? 'ക്രെഡിറ്റ്' : 'ക്യാഷ്'}</span></td>
            <td class="p-2 text-right text-slate-800">${(parseFloat(c.opening_balance) || 0).toLocaleString('en-IN')}</td>
            <td class="p-2 text-right whitespace-nowrap">
              <button onclick="openEditMasterItem('customer', '${c.name}')" class="p-1 text-blue-600 cursor-pointer">✏️</button>
              <button onclick="deleteMasterItem('customer', '${c.name}')" class="p-1 text-rose-600 cursor-pointer">🗑️</button>
            </td>
          </tr>
        `;
      });
    }
    html += `</tbody></table>`;
  } else if (currentMasterTab === 'vendor') {
    let list = vendorsList.filter(v => !search || (v.name || '').toLowerCase().includes(search));
    html = `
      <table class="w-full text-xs text-left border-collapse">
        <thead>
          <tr class="bg-blue-100/70 text-slate-900 font-black border-b">
            <th class="p-2">വെണ്ടർ പേര്</th>
            <th class="p-2 text-center">വിഭാഗം</th>
            <th class="p-2 text-right">കൊടുക്കാനുള്ള ബാക്കി</th>
            <th class="p-2 text-right">⚙️ നടപടി</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-bold">
    `;
    if (list.length === 0) html += `<tr><td colspan="4" class="p-4 text-center text-slate-400">വെണ്ടർമാർ ആരും ഇല്ല</td></tr>`;
    else {
      list.forEach(v => {
        html += `
          <tr class="hover:bg-slate-100/60">
            <td class="p-2 font-black text-slate-900">${v.name}</td>
            <td class="p-2 text-center"><span class="px-2 py-0.5 rounded text-[10px] ${v.type === 'cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">${v.type === 'cash' ? 'ക്യാഷ്' : 'ക്രെഡിറ്റ്'}</span></td>
            <td class="p-2 text-right text-slate-800">${(parseFloat(v.opening_balance) || 0).toLocaleString('en-IN')}</td>
            <td class="p-2 text-right whitespace-nowrap">
              <button onclick="openEditMasterItem('vendor', '${v.name}')" class="p-1 text-blue-600 cursor-pointer">✏️</button>
              <button onclick="deleteMasterItem('vendor', '${v.name}')" class="p-1 text-rose-600 cursor-pointer">🗑️</button>
            </td>
          </tr>
        `;
      });
    }
    html += `</tbody></table>`;
  } else if (currentMasterTab === 'employee') {
    let list = employeesList.filter(e => !search || (e.name || '').toLowerCase().includes(search));
    html = `
      <table class="w-full text-xs text-left border-collapse">
        <thead>
          <tr class="bg-purple-100/70 text-slate-900 font-black border-b">
            <th class="p-2">സ്റ്റാഫ് പേര്</th>
            <th class="p-2 text-center">ശമ്പളം</th>
            <th class="p-2 text-center">സ്റ്റാറ്റസ്</th>
            <th class="p-2 text-right">തുടക്ക ബാക്കി</th>
            <th class="p-2 text-right">⚙️ നടപടി</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-bold">
    `;
    if (list.length === 0) html += `<tr><td colspan="5" class="p-4 text-center text-slate-400">ജീവനക്കാർ ആരും ഇല്ല</td></tr>`;
    else {
      list.forEach(e => {
        const isStopped = (e.status === 'stopped');
        html += `
          <tr class="hover:bg-slate-100/60 ${isStopped ? 'bg-rose-50/60' : ''}">
            <td class="p-2 font-black text-slate-900">${e.name}</td>
            <td class="p-2 text-center text-purple-900">${(parseFloat(e.monthly_salary) || 0).toLocaleString('en-IN')}</td>
            <td class="p-2 text-center text-[10px]"><span class="px-2 py-0.5 rounded ${isStopped ? 'bg-rose-100 text-rose-800 font-black' : 'bg-emerald-100 text-emerald-800'}">${isStopped ? 'സ്റ്റോപ്പ്' : 'ആക്ടീവ്'}</span></td>
            <td class="p-2 text-right text-slate-800">${(parseFloat(e.opening_advance || e.opening_balance) || 0).toLocaleString('en-IN')}</td>
            <td class="p-2 text-right whitespace-nowrap">
              <button onclick="openEmployeeStopModal('${e.name}')" class="p-1 text-rose-600 cursor-pointer font-black">🛑</button>
              <button onclick="openEditMasterItem('employee', '${e.name}')" class="p-1 text-blue-600 cursor-pointer">✏️</button>
              <button onclick="deleteMasterItem('employee', '${e.name}')" class="p-1 text-rose-600 cursor-pointer">🗑️</button>
            </td>
          </tr>
        `;
      });
    }
    html += `</tbody></table>`;
  } else if (currentMasterTab === 'agent') {
    let list = agentsList.filter(a => !search || (a.name || '').toLowerCase().includes(search));
    html = `
      <table class="w-full text-xs text-left border-collapse">
        <thead>
          <tr class="bg-indigo-100/70 text-slate-900 font-black border-b">
            <th class="p-2">റൂട്ട് ഏജന്റ് പേര്</th>
            <th class="p-2 text-right">⚙️ നടപടി</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-bold">
    `;
    if (list.length === 0) html += `<tr><td colspan="2" class="p-4 text-center text-slate-400">ഏജന്റുമാർ ആരും ഇല്ല</td></tr>`;
    else {
      list.forEach(a => {
        html += `
          <tr class="hover:bg-slate-100/60">
            <td class="p-2 font-black text-slate-900">${a.name}</td>
            <td class="p-2 text-right whitespace-nowrap">
              <button onclick="openEditMasterItem('agent', '${a.name}')" class="p-1 text-blue-600 cursor-pointer">✏️</button>
              <button onclick="deleteMasterItem('agent', '${a.name}')" class="p-1 text-rose-600 cursor-pointer">🗑️</button>
            </td>
          </tr>
        `;
      });
    }
    html += `</tbody></table>`;
  } else if (currentMasterTab === 'expense') {
    let list = expensesMasterList.filter(ex => !search || (ex.name || '').toLowerCase().includes(search));
    html = `
      <table class="w-full text-xs text-left border-collapse">
        <thead>
          <tr class="bg-amber-100/70 text-slate-900 font-black border-b">
            <th class="p-2">ചിലവ് ഇനം</th>
            <th class="p-2 text-center">തരം (Type)</th>
            <th class="p-2 text-right">കുടിശ്ശിക</th>
            <th class="p-2 text-right">⚙️ നടപടി</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-bold">
    `;
    if (list.length === 0) html += `<tr><td colspan="4" class="p-4 text-center text-slate-400">ചിലവ് ഇനങ്ങൾ ഇല്ല</td></tr>`;
    else {
      list.forEach(ex => {
        const isUtil = (ex.type === 'utility');
        html += `
          <tr class="hover:bg-slate-100/60">
            <td class="p-2 font-black text-slate-900">${ex.name}</td>
            <td class="p-2 text-center"><span class="px-2 py-0.5 rounded text-[10px] ${isUtil ? 'bg-indigo-100 text-indigo-800 font-black' : 'bg-slate-200 text-slate-800'}">${isUtil ? 'മാസ ബില്ല്' : 'സാധാരണ'}</span></td>
            <td class="p-2 text-right font-black ${isUtil ? 'text-amber-900' : 'text-slate-400'}">${isUtil ? (parseFloat(ex.opening_balance) || 0).toLocaleString('en-IN') : '-'}</td>
            <td class="p-2 text-right whitespace-nowrap">
              <button onclick="openEditMasterItem('expense', '${ex.name}')" class="p-1 text-blue-600 cursor-pointer">✏️</button>
              <button onclick="deleteMasterItem('expense', '${ex.name}')" class="p-1 text-rose-600 cursor-pointer">🗑️</button>
            </td>
          </tr>
        `;
      });
    }
    html += `</tbody></table>`;
  }

  container.innerHTML = html;
}

function openEditMasterItem(type, originalName) {
  document.getElementById("editMasterType").value = type;
  document.getElementById("editMasterOriginalId").value = originalName;

  const title = document.getElementById("editMasterModalTitle");
  const nameInp = document.getElementById("editMasterName");
  const partyTypeBox = document.getElementById("editMasterPartyTypeBox");
  const partyTypeSel = document.getElementById("editMasterPartyType");
  const expTypeBox = document.getElementById("editMasterExpenseTypeBox");
  const expTypeSel = document.getElementById("editMasterExpenseType");
  const agentBox = document.getElementById("editMasterAgentBox");
  const agentInp = document.getElementById("editMasterAgent");
  const openingBox = document.getElementById("editMasterOpeningBox");
  const openingLabel = document.getElementById("editMasterOpeningLabel");
  const openingInp = document.getElementById("editMasterOpening");
  const creditLimitBox = document.getElementById("editMasterCreditLimitBox");
  const creditLimitInp = document.getElementById("editMasterCreditLimit");
  const salaryBox = document.getElementById("editMasterSalaryBox");
  const salaryInp = document.getElementById("editMasterSalary");
  const joinBox = document.getElementById("editMasterJoinDateBox");
  const joinInp = document.getElementById("editMasterJoinDate");

  nameInp.value = originalName;
  if (expTypeBox) expTypeBox.classList.add("hidden");

  if (type === 'customer') {
    const item = customersList.find(c => c.name === originalName);
    title.innerText = "🛒 കസ്റ്റമർ വിവരങ്ങൾ തിരുത്തുക";
    partyTypeBox.classList.remove("hidden");
    partyTypeSel.value = item ? (item.type || 'credit') : 'credit';
    agentBox.classList.remove("hidden");
    agentInp.value = item ? (item.agent_name || '') : '';
    openingBox.classList.remove("hidden");
    openingLabel.innerText = "പഴയ കടം / ബാലൻസ്:";
    openingInp.value = item ? (item.opening_balance || 0) : 0;
    creditLimitBox.classList.remove("hidden");
    creditLimitInp.value = item ? (item.credit_limit || 0) : 0;
    salaryBox.classList.add("hidden");
    joinBox.classList.add("hidden");
  } else if (type === 'vendor') {
    const item = vendorsList.find(v => v.name === originalName);
    title.innerText = "🚚 വെണ്ടർ തിരുത്തുക";
    partyTypeBox.classList.remove("hidden");
    partyTypeSel.value = item ? (item.type || 'credit') : 'credit';
    agentBox.classList.add("hidden");
    creditLimitBox.classList.add("hidden");
    openingBox.classList.remove("hidden");
    openingLabel.innerText = "കൊടുക്കാനുള്ള ബാക്കി തുക:";
    openingInp.value = item ? (item.opening_balance || 0) : 0;
    salaryBox.classList.add("hidden");
    joinBox.classList.add("hidden");
  } else if (type === 'employee') {
    const item = employeesList.find(e => e.name === originalName);
    title.innerText = "👥 ജീവനക്കാരന്റെ വിവരങ്ങൾ തിരുത്തുക";
    partyTypeBox.classList.add("hidden");
    agentBox.classList.add("hidden");
    creditLimitBox.classList.add("hidden");
    openingBox.classList.remove("hidden");
    openingLabel.innerText = "തുടക്ക ബാക്കി / അഡ്വാൻസ്:";
    openingInp.value = item ? (item.opening_advance || item.opening_balance || 0) : 0;
    salaryBox.classList.remove("hidden");
    salaryInp.value = item ? (item.monthly_salary || 0) : 0;
    joinBox.classList.remove("hidden");
    joinInp.value = item ? (item.joining_date || '') : '';
  } else if (type === 'agent') {
    title.innerText = "👤 റൂട്ട് ഏജന്റ് തിരുത്തുക";
    partyTypeBox.classList.add("hidden");
    agentBox.classList.add("hidden");
    creditLimitBox.classList.add("hidden");
    openingBox.classList.add("hidden");
    salaryBox.classList.add("hidden");
    joinBox.classList.add("hidden");
  } else if (type === 'expense') {
    const item = expensesMasterList.find(ex => ex.name === originalName);
    title.innerText = "⚡ ചിലവ് / ബില്ല് ഇനം തിരുത്തുക";
    partyTypeBox.classList.add("hidden");
    agentBox.classList.add("hidden");
    creditLimitBox.classList.add("hidden");
    salaryBox.classList.add("hidden");
    joinBox.classList.add("hidden");

    if (expTypeBox && expTypeSel) {
      expTypeBox.classList.remove("hidden");
      expTypeSel.value = item ? (item.type || 'utility') : 'utility';
      toggleEditExpenseOpeningField(expTypeSel.value);
    }

    openingLabel.innerText = "പഴയ കുടിശ്ശിക / തുടക്ക ബാക്കി:";
    openingInp.value = item ? (item.opening_balance || 0) : 0;
  }

  document.getElementById("editMasterModal").classList.remove("hidden");
  nameInp.focus();
}

function closeEditMasterModal() { document.getElementById("editMasterModal").classList.add("hidden"); }

async function saveEditedMasterItem() {
  const type = document.getElementById("editMasterType").value;
  const originalName = document.getElementById("editMasterOriginalId").value;
  const newName = document.getElementById("editMasterName").value.trim().toUpperCase();
  const opening = parseFloat(document.getElementById("editMasterOpening").value) || 0;

  if (!newName) return alert("പേര് നൽകുക!");

  if (type === 'customer') {
    const item = customersList.find(c => c.name === originalName);
    if (!item) return;
    const selectedPartyType = document.getElementById("editMasterPartyType").value;
    const agentName = document.getElementById("editMasterAgent").value.trim().toUpperCase();
    const creditLimit = parseFloat(document.getElementById("editMasterCreditLimit").value) || 0;
    const matchedAg = agentsList.find(a => a.name.toUpperCase() === agentName);

    const payload = { 
      name: newName, 
      type: selectedPartyType,
      opening_balance: opening,
      credit_limit: creditLimit,
      agent_name: agentName,
      agent_id: matchedAg ? matchedAg.id : null
    };

    if (navigator.onLine && supabaseClient) {
      const { error } = item.id 
        ? await supabaseClient.from('customers').update(payload).eq('id', item.id)
        : await supabaseClient.from('customers').update(payload).eq('name', originalName);
      if (error) return alert("ക്ലൗഡിലേക്ക് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + error.message);
    }
    Object.assign(item, payload);
    localStorage.setItem(`ALNASSR_${currentShopId}_CUSTOMERS`, JSON.stringify(customersList));
  } else if (type === 'vendor') {
    const item = vendorsList.find(v => v.name === originalName);
    if (!item) return;
    const selectedPartyType = document.getElementById("editMasterPartyType").value;
    const payload = { name: newName, type: selectedPartyType, opening_balance: opening };
    if (navigator.onLine && supabaseClient) {
      const { error } = item.id 
        ? await supabaseClient.from('vendors').update(payload).eq('id', item.id)
        : await supabaseClient.from('vendors').update(payload).eq('name', originalName);
      if (error) return alert("ക്ലൗഡിലേക്ക് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + error.message);
    }
    Object.assign(item, payload);
    localStorage.setItem(`ALNASSR_${currentShopId}_VENDORS`, JSON.stringify(vendorsList));
  } else if (type === 'employee') {
    const item = employeesList.find(e => e.name === originalName);
    if (!item) return;
    const salary = parseFloat(document.getElementById("editMasterSalary").value) || 0;
    const joinDate = document.getElementById("editMasterJoinDate").value || item.joining_date;
    const payload = { name: newName, monthly_salary: salary, opening_advance: opening, joining_date: joinDate };
    if (navigator.onLine && supabaseClient) {
      const { error } = item.id 
        ? await supabaseClient.from('employees').update(payload).eq('id', item.id)
        : await supabaseClient.from('employees').update(payload).eq('name', originalName);
      if (error) return alert("ക്ലൗഡിലേക്ക് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + error.message);
    }
    Object.assign(item, payload);
    localStorage.setItem(`ALNASSR_${currentShopId}_EMPLOYEES`, JSON.stringify(employeesList));
  } else if (type === 'agent') {
    const item = agentsList.find(a => a.name === originalName);
    if (!item) return;
    const payload = { name: newName };
    if (navigator.onLine && supabaseClient) {
      const { error } = item.id 
        ? await supabaseClient.from('agents').update(payload).eq('id', item.id)
        : await supabaseClient.from('agents').update(payload).eq('name', originalName);
      if (error) return alert("ക്ലൗഡിലേക്ക് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + error.message);
    }
    item.name = newName;
    localStorage.setItem(`ALNASSR_${currentShopId}_AGENTS`, JSON.stringify(agentsList));
  } else if (type === 'expense') {
    const item = expensesMasterList.find(ex => ex.name === originalName);
    if (!item) return;
    const expType = document.getElementById("editMasterExpenseType")?.value || 'utility';
    const finalOpening = (expType === 'regular') ? 0 : opening;
    const payload = { name: newName, type: expType, opening_balance: finalOpening };
    if (navigator.onLine && supabaseClient) {
      const { error } = item.id 
        ? await supabaseClient.from('expenses_master').update(payload).eq('id', item.id)
        : await supabaseClient.from('expenses_master').update(payload).eq('name', originalName);
      if (error) return alert("ക്ലൗഡിലേക്ക് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + error.message);
    }
    Object.assign(item, payload);
    localStorage.setItem(`ALNASSR_${currentShopId}_EXPENSES`, JSON.stringify(expensesMasterList));
  }

  populateDropdowns();
  renderActiveMasterList();
  closeEditMasterModal();
  alert("വിവരങ്ങൾ വിജയകരമായി സേവ് ചെയ്തു!");
}

async function deleteMasterItem(type, name) {
  if (!confirm(`'${name}' എന്ന റെക്കോർഡ് ഡിലീറ്റ് ചെയ്യണമെന്ന് ഉറപ്പാണോ?`)) return;

  if (type === 'customer') {
    const item = customersList.find(c => c.name === name);
    if (navigator.onLine && supabaseClient && item) {
      if (item.id) await supabaseClient.from('customers').delete().eq('id', item.id);
      else await supabaseClient.from('customers').delete().eq('name', name);
    }
    customersList = customersList.filter(c => c.name !== name);
    localStorage.setItem(`ALNASSR_${currentShopId}_CUSTOMERS`, JSON.stringify(customersList));
  } else if (type === 'vendor') {
    const item = vendorsList.find(v => v.name === name);
    if (navigator.onLine && supabaseClient && item) {
      if (item.id) await supabaseClient.from('vendors').delete().eq('id', item.id);
      else await supabaseClient.from('vendors').delete().eq('name', name);
    }
    vendorsList = vendorsList.filter(v => v.name !== name);
    localStorage.setItem(`ALNASSR_${currentShopId}_VENDORS`, JSON.stringify(vendorsList));
  } else if (type === 'employee') {
    const item = employeesList.find(e => e.name === name);
    if (navigator.onLine && supabaseClient && item) {
      if (item.id) await supabaseClient.from('employees').delete().eq('id', item.id);
      else await supabaseClient.from('employees').delete().eq('name', name);
    }
    employeesList = employeesList.filter(e => e.name !== name);
    localStorage.setItem(`ALNASSR_${currentShopId}_EMPLOYEES`, JSON.stringify(employeesList));
  } else if (type === 'agent') {
    const item = agentsList.find(a => a.name === name);
    if (navigator.onLine && supabaseClient && item) {
      if (item.id) await supabaseClient.from('agents').delete().eq('id', item.id);
      else await supabaseClient.from('agents').delete().eq('name', name);
    }
    agentsList = agentsList.filter(a => a.name !== name);
    localStorage.setItem(`ALNASSR_${currentShopId}_AGENTS`, JSON.stringify(agentsList));
  } else if (type === 'expense') {
    const item = expensesMasterList.find(ex => ex.name === name);
    if (navigator.onLine && supabaseClient && item) {
      if (item.id) await supabaseClient.from('expenses_master').delete().eq('id', item.id);
      else await supabaseClient.from('expenses_master').delete().eq('name', name);
    }
    expensesMasterList = expensesMasterList.filter(ex => ex.name !== name);
    localStorage.setItem(`ALNASSR_${currentShopId}_EXPENSES`, JSON.stringify(expensesMasterList));
  }

  populateDropdowns();
  renderActiveMasterList();
  alert("ഡിലീറ്റ് ചെയ്തു!");
}

async function saveNewCustomerMaster() {
  const name = document.getElementById("newCustName").value.trim().toUpperCase();
  const type = document.getElementById("newCustType")?.value || 'credit';
  const opening = parseFloat(document.getElementById("newCustOpening").value) || 0;
  const creditLimit = parseFloat(document.getElementById("newCustCreditLimit").value) || 0;
  const agentName = (document.getElementById("newCustAgent")?.value || '').trim().toUpperCase();
  if (!name) return alert("കസ്റ്റമർ പേര് നൽകുക!");

  const matchedAg = agentsList.find(a => a.name.toUpperCase() === agentName);
  const newCust = { 
    name: name, 
    type: type, 
    opening_balance: opening,
    credit_limit: creditLimit,
    agent_name: agentName,
    agent_id: matchedAg ? matchedAg.id : null
  };

  if (!navigator.onLine || !supabaseClient) {
    alert("⚠️ ശ്രദ്ധിക്കുക: നിങ്ങൾ ഇപ്പോൾ ഓഫ്‍ലൈനിലാണ്! നെറ്റ് വരുമ്പോൾ മാത്രമേ ഈ കസ്റ്റമറെ ക്ലൗഡിലേക്ക് സ്ഥിരമായി അപ്‌ലോഡ് ചെയ്യാൻ കഴിയൂ.");
  } else {
    const { data, error } = await supabaseClient.from('customers').insert([newCust]).select();
    if (error) {
      console.error("Customer Save Error:", error);
      return alert("ക്ലൗഡിലേക്ക് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + error.message);
    }
    if (data && data[0]) newCust.id = data[0].id;
  }

  customersList.push(newCust);
  localStorage.setItem(`ALNASSR_${currentShopId}_CUSTOMERS`, JSON.stringify(customersList));
  populateDropdowns();

  document.getElementById("saleCustomerInput").value = name;
  onCustomerSelected();
  closeNewCustomerModal();
  renderActiveMasterList();
  alert("പുതിയ കസ്റ്റമറെ വിജയകരമായി ചേർത്തു!");
}

async function saveNewVendorMaster() {
  const name = document.getElementById("newVendName").value.trim().toUpperCase();
  const type = document.getElementById("newVendType")?.value || 'credit';
  const opening = parseFloat(document.getElementById("newVendOpening").value) || 0;
  if (!name) return alert("വെണ്ടർ പേര് നൽകുക!");

  const newVend = { name: name, type: type, opening_balance: opening };

  if (!navigator.onLine || !supabaseClient) {
    alert("⚠️ ശ്രദ്ധിക്കുക: നിങ്ങൾ ഇപ്പോൾ ഓഫ്‍ലൈനിലാണ്! നെറ്റ് വരുമ്പോൾ മാത്രമേ വെണ്ടറെ ക്ലൗഡിലേക്ക് അപ്‌ലോഡ് ചെയ്യാൻ കഴിയൂ.");
  } else {
    const { data, error } = await supabaseClient.from('vendors').insert([newVend]).select();
    if (error) {
      console.error("Vendor Save Error:", error);
      return alert("ക്ലൗഡിലേക്ക് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + error.message);
    }
    if (data && data[0]) newVend.id = data[0].id;
  }

  vendorsList.push(newVend);
  localStorage.setItem(`ALNASSR_${currentShopId}_VENDORS`, JSON.stringify(vendorsList));
  populateDropdowns();

  document.getElementById("purchaseVendorInput").value = name;
  onVendorSelected();
  closeNewVendorModal();
  renderActiveMasterList();
  alert("പുതിയ വെണ്ടറെ വിജയകരമായി ചേർത്തു!");
}

async function saveNewEmployeeMaster() {
  const name = document.getElementById("newEmpName").value.trim().toUpperCase();
  const salary = parseFloat(document.getElementById("newEmpSalary").value) || 0;
  const advance = parseFloat(document.getElementById("newEmpAdvance").value) || 0;
  const joinDate = document.getElementById("newEmpJoinDate").value || getSaudiBusinessDate();
  if (!name) return alert("ജീവനക്കാരന്റെ പേര് നൽകുക!");

  let newEmp = {
    name: name,
    monthly_salary: salary,
    opening_advance: advance,
    joining_date: joinDate,
    status: 'active',
    created_at: new Date().toISOString()
  };

  if (!navigator.onLine || !supabaseClient) {
    newEmp.id = 'emp_' + Date.now();
    alert("⚠️ ശ്രദ്ധിക്കുക: നിങ്ങൾ ഓഫ്‍ലൈനിലാണ്! നെറ്റ് ഉള്ളപ്പോൾ മാത്രമേ സ്റ്റാഫിനെ ക്ലൗഡിലേക്ക് അപ്‌ലോഡ് ചെയ്യാൻ കഴിയൂ.");
  } else {
    const { data, error } = await supabaseClient.from('employees').insert([newEmp]).select();
    if (error) {
      console.error("Staff Save Error:", error);
      return alert("ക്ലൗഡിലേക്ക് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + error.message);
    }
    if (data && data[0]) newEmp.id = data[0].id;
  }

  employeesList.push(newEmp);
  localStorage.setItem(`ALNASSR_${currentShopId}_EMPLOYEES`, JSON.stringify(employeesList));
  populateDropdowns();

  document.getElementById("unifiedPartyInput").value = name;
  onUnifiedPartySelected();
  closeNewEmployeeModal();
  renderActiveMasterList();
  alert("പുതിയ ജീവനക്കാരനെ വിജയകരമായി ചേർത്തു!");
}

// NEW EXPENSE / UTILITY MASTER
function openNewExpenseModal() {
  document.getElementById("newExpName").value = "";
  document.getElementById("newExpOpening").value = "";
  document.getElementById("newExpType").value = "utility";
  toggleNewExpenseOpeningField("utility");
  document.getElementById("newExpenseModal").classList.remove("hidden");
  document.getElementById("newExpName").focus();
}

function closeNewExpenseModal() {
  document.getElementById("newExpenseModal").classList.add("hidden");
}

async function saveNewExpenseMaster() {
  const name = document.getElementById("newExpName").value.trim().toUpperCase();
  const type = document.getElementById("newExpType").value;
  const opening = (type === 'regular') ? 0 : (parseFloat(document.getElementById("newExpOpening").value) || 0);
  if (!name) return alert("ചിലവ് ഇനത്തിന്റെ പേര് നൽകുക!");

  const newExp = { name: name, type: type, opening_balance: opening };

  if (!navigator.onLine || !supabaseClient) {
    newExp.id = 'exp_' + Date.now();
    alert("⚠️ ശ്രദ്ധിക്കുക: നിങ്ങൾ ഓഫ്‍ലൈനിലാണ്! നെറ്റ് വരുമ്പോൾ മാത്രമേ ചിലവ് ഇനം ക്ലൗഡിലേക്ക് സേവ് ചെയ്യാൻ കഴിയൂ.");
  } else {
    const { data, error } = await supabaseClient.from('expenses_master').insert([newExp]).select();
    if (error) {
      console.error("Expense Save Error:", error);
      return alert("ക്ലൗഡിലേക്ക് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + error.message);
    }
    if (data && data[0]) newExp.id = data[0].id;
  }

  expensesMasterList.push(newExp);
  localStorage.setItem(`ALNASSR_${currentShopId}_EXPENSES`, JSON.stringify(expensesMasterList));
  populateDropdowns();

  document.getElementById("unifiedPartyInput").value = name;
  onUnifiedPartySelected();
  closeNewExpenseModal();
  renderActiveMasterList();
  alert("പുതിയ ചിലവ് ഇനം വിജയകരമായി ചേർത്തു!");
}

function quickAddExpensePrompt() {
  openNewExpenseModal();
}

// MODALS CONTROLLER HELPERS
function openNewCustomerModal() {
  document.getElementById("newCustName").value = "";
  if (document.getElementById("newCustAgent")) document.getElementById("newCustAgent").value = "";
  document.getElementById("newCustOpening").value = "";
  document.getElementById("newCustCreditLimit").value = "";
  document.getElementById("newCustomerModal").classList.remove("hidden");
  document.getElementById("newCustName").focus();
}
function closeNewCustomerModal() { document.getElementById("newCustomerModal").classList.add("hidden"); }

function openNewVendorModal() {
  document.getElementById("newVendName").value = "";
  document.getElementById("newVendOpening").value = "";
  document.getElementById("newVendorModal").classList.remove("hidden");
  document.getElementById("newVendName").focus();
}
function closeNewVendorModal() { document.getElementById("newVendorModal").classList.add("hidden"); }

function openNewEmployeeModal() {
  document.getElementById("newEmpName").value = "";
  document.getElementById("newEmpSalary").value = "";
  document.getElementById("newEmpAdvance").value = "";
  document.getElementById("newEmpJoinDate").value = getSaudiBusinessDate();
  document.getElementById("newEmployeeModal").classList.remove("hidden");
  document.getElementById("newEmpName").focus();
}
function closeNewEmployeeModal() { document.getElementById("newEmployeeModal").classList.add("hidden"); }

function openTodaySalesModal() { document.getElementById("todaySalesModal").classList.remove("hidden"); if (window.lucide) lucide.createIcons(); }
function closeTodaySalesModal() { document.getElementById("todaySalesModal").classList.add("hidden"); }

function openTodayPurchaseModal() { document.getElementById("todayPurchaseModal").classList.remove("hidden"); if (window.lucide) lucide.createIcons(); }
function closeTodayPurchaseModal() { document.getElementById("todayPurchaseModal").classList.add("hidden"); }

function openTodayExpenseModal() { document.getElementById("todayExpenseModal").classList.remove("hidden"); if (window.lucide) lucide.createIcons(); }
function closeTodayExpenseModal() { document.getElementById("todayExpenseModal").classList.add("hidden"); }

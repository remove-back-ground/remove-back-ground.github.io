
/**
 * ClearCut AI – script.js
 * Simple & Clean Version
 */

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = 'https://rhnahtyjrnpnrtjrnocp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_H19x6_h9zIKPkbCSxGC6JQ_eGcM4e8m';
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// BACKGROUND REMOVAL LIBRARY
// ============================================================
const LIBRARY_URL = "https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm";
let imglyLib = null;

async function loadLibrary() {
  if (imglyLib) return imglyLib;
  imglyLib = await import(LIBRARY_URL);
  return imglyLib;
}

// ============================================================
// STATE
// ============================================================
const MAX_FREE = 3;

let state = {
  user: null,
  profile: null,
  currentFile: null,
  resultBlob: null,
  processing: false,
  paymentPolling: null,
};

let selectedPlan = null;
let paymentSessionId = localStorage.getItem('cc_payment_session') || null;

// ============================================================
// INIT
// ============================================================
async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    state.user = session.user;
    await loadProfile();
  }

  updateAuthUI();
  updateUsageUI();
  setupKeyboardShortcuts();
  checkCookieBanner();

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      state.user = session.user;
      await loadProfile();
      if (!state.profile) await createProfile(session.user);
      updateAuthUI();
      updateUsageUI();
    } else if (event === 'SIGNED_OUT') {
      state.user = null;
      state.profile = null;
      updateAuthUI();
      updateUsageUI();
    }
  });
}

// ============================================================
// PROFILE
// ============================================================
async function loadProfile() {
  if (!state.user) return;
  const { data } = await db.from('profiles').select('*').eq('id', state.user.id).single();
  state.profile = data;
}

async function createProfile(user) {
  const { data } = await db.from('profiles').insert({
    id: user.id,
    email: user.email,
    credits: MAX_FREE,
    free_used: 0,
    created_at: new Date().toISOString()
  }).select().single();
  state.profile = data;
}

async function saveProfile() {
  if (!state.user || !state.profile) return;
  await db.from('profiles').update({
    credits: state.profile.credits,
    free_used: state.profile.free_used,
  }).eq('id', state.user.id);
}

// ============================================================
// AUTH UI
// ============================================================
function updateAuthUI() {
  const authBtn = document.getElementById('authNavBtn');
  if (!authBtn) return;

  if (state.user) {
    const initial = (state.user.email || 'U').charAt(0).toUpperCase();
    authBtn.innerHTML = `<div class="user-avatar" onclick="toggleUserMenu()">${initial}</div>`;
  } else {
    authBtn.innerHTML = `<button class="btn-nav-cta" onclick="window.location.href='auth.html'">Sign In</button>`;
  }
const heroAuthBtns = document.getElementById('heroAuthBtns');
if (heroAuthBtns) {
  if (state.user) {
    heroAuthBtns.innerHTML = '';
  } else {
    heroAuthBtns.innerHTML = `
      <button class="btn-nav-cta" onclick="window.location.href='auth.html'">Sign In</button>
      <button class="btn-nav-cta" style="background:transparent;border:2px solid white;color:white;" onclick="window.location.href='auth.html'">Sign Up</button>
    `;
  }
}
}
function toggleUserMenu() {
  const existing = document.getElementById('userDropdown');
  if (existing) { existing.remove(); return; }

  const email = state.user?.email || '';
  const initial = email.charAt(0).toUpperCase();
  const credits = getCreditsDisplay();

  const menu = document.createElement('div');
  menu.id = 'userDropdown';
  menu.className = 'user-dropdown';
  menu.innerHTML = `
    <div class="user-dropdown-header">
      <div class="user-dropdown-avatar">${initial}</div>
      <div class="user-dropdown-info">
        <div class="user-dropdown-name">${email.split('@')[0]}</div>
        <div class="user-dropdown-email">${email}</div>
      </div>
    </div>
    <div class="user-dropdown-credits">
      💳 <span>${credits} credits remaining</span>
    </div>
    <hr/>
    <button class="user-dropdown-logout" onclick="doSignOut()">
      🚪 Sign Out
    </button>
  `;
  document.body.appendChild(menu);

  const avatar = document.querySelector('.user-avatar');
  if (avatar) {
    const rect = avatar.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.bottom + 8) + 'px';
    menu.style.right = '20px';
    menu.style.zIndex = '9999';
  }

  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target) && !e.target.closest('.user-avatar')) {
        menu.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 100);
}

async function doSignOut() {
  await db.auth.signOut();
  document.getElementById('userDropdown')?.remove();
  showToast('Signed out', 'info');
}

// ============================================================
// CREDITS
// ============================================================
function getCreditsDisplay() {
  if (!state.user) {
    const freeUsed = parseInt(localStorage.getItem('cc_free_used') || '0');
    return Math.max(0, MAX_FREE - freeUsed);
  }
  return state.profile?.credits ?? 0;
}

function canProcess() {
  if (!state.user) {
    const freeUsed = parseInt(localStorage.getItem('cc_free_used') || '0');
    return freeUsed < MAX_FREE;
  }
  return (state.profile?.credits ?? 0) > 0;
}

// ============================================================
// USAGE UI
// ============================================================
function updateUsageUI() {
  const remaining = getCreditsDisplay();
  const usageCount = document.getElementById('usageCount');
  const usageFill = document.getElementById('usageFill');
  const usageLabel = document.querySelector('.usage-label');
  const processBtn = document.getElementById('processBtn');

  if (usageCount) usageCount.textContent = remaining;
  if (usageLabel) usageLabel.textContent = state.user ? 'Credits remaining' : 'Free images remaining';

  const pct = state.user ? Math.min(100, (remaining / 10) * 100) : (remaining / MAX_FREE) * 100;
  if (usageFill) usageFill.style.width = `${Math.max(0, pct)}%`;

  if (!state.user) {
    for (let i = 0; i < 3; i++) {
      const dot = document.getElementById(`dot${i}`);
      if (dot) dot.classList.toggle('active', i < remaining);
    }
  }

  if (processBtn) {
    processBtn.disabled = !canProcess() || !state.currentFile || state.processing;
  }
}

// ============================================================
// FILE HANDLING
// ============================================================
function triggerUpload() {
  document.getElementById('fileInput').click();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) processFile(file);
  event.target.value = '';
}

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('uploadZone').classList.add('drag-over');
}

function handleDragLeave(event) {
  document.getElementById('uploadZone').classList.remove('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('uploadZone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file) processFile(file);
}

async function pasteFromClipboard() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        processFile(new File([blob], 'pasted-image.png', { type: imageType }));
        return;
      }
    }
    showToast('No image found in clipboard', 'warning');
  } catch (e) {
    showToast('Could not read clipboard.', 'warning');
  }
}

function processFile(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showToast('Please upload a JPEG, PNG, or WEBP image', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('Image must be under 10MB', 'error');
    return;
  }
  state.currentFile = file;
  state.resultBlob = null;
  showProcessingArea(file);
}

function showProcessingArea(file) {
  const url = URL.createObjectURL(file);
  const originalImg = document.getElementById('originalImg');
  originalImg.src = url;
  originalImg.onload = () => {
    const { naturalWidth: w, naturalHeight: h } = originalImg;
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    document.getElementById('imageMeta').textContent = `${w} × ${h}px · ${sizeMB}MB · ${file.type.split('/')[1].toUpperCase()}`;
  };

  document.getElementById('uploadArea').classList.add('hidden');
  document.getElementById('processingArea').classList.remove('hidden');
  document.getElementById('resultActions').classList.add('hidden');
  document.getElementById('resultImgWrap').classList.add('hidden');
  document.getElementById('resultPlaceholder').classList.remove('hidden');
  updateUsageUI();
}

// ============================================================
// BACKGROUND REMOVAL
// ============================================================
async function processImage() {
  if (!state.currentFile || state.processing) return;

  if (!canProcess()) {
    checkAndShowWall();
    return;
  }

  state.processing = true;
  updateUsageUI();
  setProcessingUI(true);

  try {
    const lib = await loadLibrary();
    document.getElementById('modelProgress').classList.remove('hidden');

    const blob = await lib.removeBackground(state.currentFile, {
      model: 'medium',
      debug: false,
      proxyToWorker: true,
      fetchArgs: { mode: 'cors', cache: 'force-cache' },
      progress: (key, current, total) => {
        if (total > 0) {
          const pct = Math.round((current / total) * 100);
          document.getElementById('modelProgressFill').style.width = `${pct}%`;
          document.getElementById('modelProgressLabel').textContent = `Loading AI model… ${pct}%`;
        }
      },
    });

    document.getElementById('modelProgress').classList.add('hidden');
    state.resultBlob = blob;
    displayResult(blob);

    // Deduct credit
    if (state.user && state.profile) {
      state.profile.credits = Math.max(0, (state.profile.credits || 0) - 1);
      await saveProfile();
    } else {
      const freeUsed = parseInt(localStorage.getItem('cc_free_used') || '0');
      localStorage.setItem('cc_free_used', freeUsed + 1);
    }

    updateUsageUI();
    showToast('Background removed! ✨', 'success');
    setTimeout(() => { if (!canProcess()) checkAndShowWall(); }, 1500);

  } catch (err) {
    console.error(err);
    showToast('Processing failed. Please try again.', 'error');
    document.getElementById('modelProgress').classList.add('hidden');
  } finally {
    state.processing = false;
    setProcessingUI(false);
    updateUsageUI();
  }
}

function setProcessingUI(loading) {
  const btn = document.getElementById('processBtn');
  btn.querySelector('.btn-process-text').classList.toggle('hidden', loading);
  btn.querySelector('.btn-process-loading').classList.toggle('hidden', !loading);
  btn.disabled = loading;
}

function displayResult(blob) {
  document.getElementById('resultImg').src = URL.createObjectURL(blob);
  document.getElementById('resultPlaceholder').classList.add('hidden');
  document.getElementById('resultImgWrap').classList.remove('hidden');
  document.getElementById('resultActions').classList.remove('hidden');
}

// ============================================================
// DOWNLOAD & CLIPBOARD
// ============================================================
function downloadResult() {
  if (!state.resultBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(state.resultBlob);
  a.download = `${(state.currentFile?.name || 'result').replace(/\.[^.]+$/, '')}-clearcut.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Downloading!', 'success');
}

async function copyToClipboard() {
  if (!state.resultBlob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': state.resultBlob })]);
    showToast('Copied!', 'success');
  } catch (e) {
    showToast('Copy failed. Try downloading.', 'error');
  }
}

// ============================================================
// RESET
// ============================================================
function resetApp() {
  state.currentFile = null;
  state.resultBlob = null;
  state.processing = false;

  document.getElementById('uploadArea').classList.remove('hidden');
  document.getElementById('processingArea').classList.add('hidden');
  document.getElementById('resultActions').classList.add('hidden');
  document.getElementById('modelProgress').classList.add('hidden');
  document.getElementById('resultImgWrap').classList.add('hidden');
  document.getElementById('resultPlaceholder').classList.remove('hidden');

  const btn = document.getElementById('processBtn');
  if (btn) {
    btn.querySelector('.btn-process-text').classList.remove('hidden');
    btn.querySelector('.btn-process-loading').classList.add('hidden');
    btn.disabled = true;
  }
  updateUsageUI();
}

// ============================================================
// ACCESS WALL
// ============================================================
function checkAndShowWall() {
  if (canProcess()) return;
  if (!state.user) {
    showSignupWall();
  } else {
    document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
  }
}

function showSignupWall() {
  const modal = document.getElementById('adModal');
  if (!modal) return;
  modal.querySelector('.modal-title').textContent = "You've used your 3 free images!";
  modal.querySelector('.modal-desc').innerHTML = `<strong>Create a free account</strong> to get more credits.`;
  const actions = modal.querySelector('.modal-actions');
  actions.innerHTML = `
    <button class="btn-primary" onclick="window.location.href='auth.html'">🔐 Sign Up Free</button>
    <button class="btn-secondary" onclick="closeAdModal()">Maybe later</button>
  `;
  modal.classList.remove('hidden');
}

// ============================================================
// PAYMENT
// ============================================================
function openPaymentModal(plan) {
  if (!state.user) {
    showToast('Please sign in first', 'warning');
    setTimeout(() => window.location.href = 'auth.html', 1200);
    return;
  }
  selectedPlan = plan;
  document.getElementById('paymentModal').classList.remove('hidden');
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.add('hidden');
  stopPaymentPolling();
  // Reset modal UI
  const modal = document.getElementById('paymentModal');
  const methods = modal.querySelector('.payment-methods');
  if (methods) methods.style.display = '';
  modal.querySelector('.modal-desc').textContent = 'Choose your preferred payment method';
}

function payBinance() {
  const url = selectedPlan === 'pro'
    ? "https://s.binance.com/yVwuf5uT"
    : "https://s.binance.com/uA7xJblU";
  startPayment(url);
}

function payNexa() {
  const url = selectedPlan === 'pro'
    ? "https://nexapay.one/checkout/order_264b5b1168862f013b3a98ac4b9ee7bd?sig=plsig_7c7d4c7c2652638bf96f17a0c991196277bdb10e1a45a003ec5e52e48ed6b24c"
    : "https://nexapay.one/checkout/order_97e23449f4632a11d858866e4618709c?sig=plsig_2135dcefcd4a1beb7b0fd9cf94f92023194de07ea0079dd9fa07c32856b837b4";
  startPayment(url);
}

function payLemon() {
  const url = selectedPlan === 'pro'
    ? "https://snipix-ai.lemonsqueezy.com/checkout/buy/5890d74c-8965-4456-a0f2-355bb5b34d6b"
    : "https://snipix-ai.lemonsqueezy.com/checkout/buy/517140d4-72c1-497b-97f4-48d2dd856634";
  
  const email = state.user?.email || '';
  window.open(url + '?checkout[email]=' + encodeURIComponent(email), '_blank');
  
  showToast('Complete payment in the opened tab', 'info');
  closePaymentModal();
}

async function startPayment(url) {
  // Generate session ID
  paymentSessionId = 'ps_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('cc_payment_session', paymentSessionId);

  // Save to Supabase
  await db.from('payment_sessions').insert({
    id: paymentSessionId,
    user_id: state.user.id,
    plan: selectedPlan,
    credits: selectedPlan === 'pro' ? 500 : 100,
    status: 'pending',
    created_at: new Date().toISOString()
  });

  // Open payment page
  window.open(url, '_blank');

  // Show pending UI
  showPaymentPendingUI();

  // Start polling
  startPaymentPolling();
}

function showPaymentPendingUI() {
  const modal = document.getElementById('paymentModal');
  const methods = modal.querySelector('.payment-methods');
  if (methods) methods.style.display = 'none';

  const credits = selectedPlan === 'pro' ? 500 : 100;
  const price = selectedPlan === 'pro' ? '$6.95' : '$2.95';

  modal.querySelector('.modal-desc').innerHTML = `
    <div style="text-align:center;padding:16px 0;">
      <div style="font-size:2.5rem;margin-bottom:12px;">⏳</div>
      <p style="font-weight:700;color:#0f0f17;margin-bottom:6px;">Waiting for payment…</p>
      <p style="color:#6b7280;font-size:0.85rem;margin-bottom:4px;">Plan: <strong>${selectedPlan === 'pro' ? 'Pro' : 'Starter'}</strong> · ${credits} credits · ${price}</p>
      <p style="color:#6b7280;font-size:0.85rem;">Complete payment in the opened tab.</p>
      <div style="margin:16px 0;color:#4F8EF7;font-size:1.2rem;letter-spacing:4px;">● ● ●</div>
      <p style="color:#6b7280;font-size:0.82rem;">After paying, click below:</p>
      <button onclick="confirmPaymentManual()" style="
        margin-top:12px;background:linear-gradient(135deg,#4F8EF7,#7C3AED);
        color:white;border:none;padding:12px 28px;border-radius:100px;
        font-weight:700;cursor:pointer;font-size:0.95rem;font-family:inherit;
      ">✅ I've Paid – Add Credits</button>
      <br/>
      <button onclick="closePaymentModal()" style="
        margin-top:10px;background:none;border:none;
        color:#6b7280;font-size:0.85rem;cursor:pointer;
      ">Cancel</button>
    </div>
  `;
}

async function confirmPaymentManual() {
  if (!state.user || !paymentSessionId) return;
  await db.from('payment_sessions').update({
    status: 'user_confirmed',
    confirmed_at: new Date().toISOString()
  }).eq('id', paymentSessionId);
  showToast('Payment submitted! Waiting for verification...', 'info');
}

// ============================================================
// PAYMENT POLLING — checks every 5s if admin confirmed
// ============================================================
function startPaymentPolling() {
  stopPaymentPolling();
  if (!paymentSessionId || !state.user) return;

  let attempts = 0;
  state.paymentPolling = setInterval(async () => {
    attempts++;
    if (attempts > 72) { // max 6 minutes
      stopPaymentPolling();
      return;
    }

    const { data } = await db
      .from('payment_sessions')
      .select('status, credits')
      .eq('id', paymentSessionId)
      .single();

    if (data?.status === 'confirmed') {
      stopPaymentPolling();
      await grantCredits(data.credits);
    }
  }, 5000);
}

function stopPaymentPolling() {
  if (state.paymentPolling) {
    clearInterval(state.paymentPolling);
    state.paymentPolling = null;
  }
}

async function grantCredits(credits) {
  if (!state.user) return;
  
  await loadProfile(); // reload profile first
  
  if (!state.profile) {
    await createProfile(state.user);
  }
  
  state.profile.credits = (state.profile.credits || 0) + credits;
  await saveProfile();

  localStorage.removeItem('cc_payment_session');
  paymentSessionId = null;

  document.getElementById('paymentModal').classList.add('hidden');
  updateUsageUI();
  showToast(`🎉 ${credits} credits added!`, 'success');
}

// ============================================================
// AD MODAL (for guests)
// ============================================================
function showAdModal() {
  document.getElementById('adModal').classList.remove('hidden');
}

let adInterval;
function startAd() {
  const adTimer = document.getElementById('adTimer');
  const adFill = document.getElementById('adProgressFill');
  const adCountdown = document.getElementById('adCountdown');
  const adActions = document.querySelector('#adModal .modal-actions');

  adTimer.classList.remove('hidden');
  if (adActions) adActions.style.display = 'none';

  let seconds = 5;
  adCountdown.textContent = seconds;
  adInterval = setInterval(() => {
    seconds--;
    adCountdown.textContent = seconds;
    adFill.style.width = `${((5 - seconds) / 5) * 100}%`;
    if (seconds <= 0) { clearInterval(adInterval); completeAd(); }
  }, 1000);
}

function closeAdModal() {
  clearInterval(adInterval);
  document.getElementById('adModal').classList.add('hidden');
  document.getElementById('adTimer').classList.add('hidden');
  const adActions = document.querySelector('#adModal .modal-actions');
  if (adActions) adActions.style.display = '';
}

function completeAd() {
  if (localStorage.getItem('cc_ad_watched') !== 'true') {
    const freeUsed = parseInt(localStorage.getItem('cc_free_used') || '0');
    localStorage.setItem('cc_free_used', Math.max(0, freeUsed - 3));
    localStorage.setItem('cc_ad_watched', 'true');
  }
  closeAdModal();
  updateUsageUI();
  showToast('🎉 3 more free removals!', 'success');
}

// ============================================================
// LEGAL MODALS
// ============================================================
const legalContent = {
  tos: `<h2 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;margin-bottom:16px;">Terms of Service</h2>
    <p style="color:var(--mid);font-size:0.85rem;margin-bottom:20px;">Last updated: December 2024</p>
    <h3 style="margin-bottom:8px;">1. Acceptance</h3><p>By using ClearCut AI, you agree to these terms.</p>
    <h3 style="margin:16px 0 8px;">2. Service</h3><p>AI background removal processed on-device. Images never uploaded to our servers.</p>
    <h3 style="margin:16px 0 8px;">3. Payments</h3><p>One-time payments. Credits do not expire. 30-day refund guarantee.</p>
    <h3 style="margin:16px 0 8px;">4. Liability</h3><p>Service provided as-is. We are not liable for any damages.</p>`,
  privacy: `<h2 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;margin-bottom:16px;">Privacy Policy</h2>
    <p style="color:var(--mid);font-size:0.85rem;margin-bottom:20px;">Last updated: December 2024 · GDPR Compliant</p>
    <h3 style="margin-bottom:8px;">Your Images</h3><p>Never uploaded to our servers. All processing is local in your browser.</p>
    <h3 style="margin:16px 0 8px;">Data We Store</h3><p>Email and credit balance in Supabase (encrypted). No payment data stored by us.</p>
    <h3 style="margin:16px 0 8px;">GDPR</h3><p>You can request deletion at privacy@clearcut.ai.</p>`,
  refund: `<h2 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;margin-bottom:16px;">Refund Policy</h2>
    <h3 style="margin-bottom:8px;">30-Day Money Back</h3><p>Not satisfied? Email support@clearcut.ai within 30 days for a full refund.</p>`,
  dmca: `<h2 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;margin-bottom:16px;">DMCA Notice</h2>
    <p>Send DMCA notices to: dmca@clearcut.ai</p>`,
};

function showModal(type, event) {
  event?.preventDefault();
  if (type === 'contact') {
    document.getElementById('contactModal').classList.remove('hidden');
    return;
  }
  const content = legalContent[type];
  if (!content) return;
  document.getElementById('infoModalContent').innerHTML = content;
  document.getElementById('infoModal').classList.remove('hidden');
}

function closeInfoModal() {
  document.getElementById('infoModal').classList.add('hidden');
}

// ============================================================
// FAQ
// ============================================================
function toggleFaq(index) {
  const item = document.querySelectorAll('.faq-item')[index];
  if (item) item.classList.toggle('open');
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================
// COOKIE BANNER
// ============================================================
function checkCookieBanner() {
  if (localStorage.getItem('cc_cookieConsent')) {
    document.getElementById('cookieBanner').style.display = 'none';
  }
}
function acceptCookies() {
  localStorage.setItem('cc_cookieConsent', 'accepted');
  document.getElementById('cookieBanner').style.display = 'none';
  showToast('Preferences saved', 'success');
}
function declineCookies() {
  localStorage.setItem('cc_cookieConsent', 'declined');
  document.getElementById('cookieBanner').style.display = 'none';
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      if (!document.getElementById('processingArea').classList.contains('hidden')) return;
      await pasteFromClipboard();
    }
    if (e.key === 'Escape') {
      closeAdModal();
      closePaymentModal();
      closeInfoModal();
      document.getElementById('contactModal').classList.add('hidden');
    }
  });
}

// ============================================================
// NAVIGATION
// ============================================================
function scrollToApp() {
  document.getElementById('app').scrollIntoView({ behavior: 'smooth' });
}

function toggleMobileMenu() {
  document.getElementById('mobileMenu').classList.toggle('open');
}

// ============================================================
// CONTACT FORM
// ============================================================
function submitContact() {
  const name = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const msg = document.getElementById('contactMsg').value.trim();

  if (!name || !email || !msg) return showToast('Please fill in all fields', 'warning');
  if (!email.includes('@')) return showToast('Please enter a valid email', 'error');

  document.getElementById('contactModal').classList.add('hidden');
  showToast("Message sent! We'll get back to you soon.", 'success');
  document.getElementById('contactName').value = '';
  document.getElementById('contactEmail').value = '';
  document.getElementById('contactMsg').value = '';
}

// ============================================================
// START
// ============================================================
document.addEventListener('DOMContentLoaded', init);

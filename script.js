/**
 * ClearCut AI – script.js (نسخة مصلحة)
 */

// ============================================================
// STATE
// ============================================================
const MAX_FREE = 3;
const AD_BONUS = 3;
const MAX_TOTAL_FREE = 6;

let state = { 
  removeCount: 0,
  adWatched: false,
  adWatchedAt: null,
  totalFreeUsed: 0,
  paidCredits: 0,
  currentFile: null,
  resultBlob: null,
  processing: false,
  libraryReady: false, 
};

// localStorage keys
const KEYS = {
  removeCount: 'cc_removeCount',
  adWatched: 'cc_adWatched',
  adWatchedAt: 'cc_adWatchedAt',
  totalFreeUsed: 'cc_totalFreeUsed',
  paidCredits: 'cc_paidCredits',
  cookieConsent: 'cc_cookieConsent',
};

// ============================================================
// INIT
// ============================================================
function init() {
  loadState();
  updateUsageUI();
  setupKeyboardShortcuts();
  checkCookieBanner();

  const today = new Date().toDateString();
  const lastVisit = localStorage.getItem('cc_lastVisit');
  if (lastVisit !== today) {
    localStorage.setItem('cc_lastVisit', today);
  }

  // التحقق من المكتبة كل 200ms
  const checkLibrary = setInterval(() => {
    if (window.removeBackground) {
      state.libraryReady = true;
      updateUsageUI();
      console.log('✅ Library ready');
      clearInterval(checkLibrary);
    }
  }, 200);
}

window.removeBackground = removeBackground;

function loadState() {
  state.removeCount = parseInt(localStorage.getItem(KEYS.removeCount) || '0');
  state.adWatched = localStorage.getItem(KEYS.adWatched) === 'true';
  state.adWatchedAt = localStorage.getItem(KEYS.adWatchedAt);
  state.totalFreeUsed = parseInt(localStorage.getItem(KEYS.totalFreeUsed) || '0');
  state.paidCredits = parseInt(localStorage.getItem(KEYS.paidCredits) || '0');
}

function saveState() {
  localStorage.setItem(KEYS.removeCount, state.removeCount);
  localStorage.setItem(KEYS.adWatched, state.adWatched);
  localStorage.setItem(KEYS.adWatchedAt, state.adWatchedAt || '');
  localStorage.setItem(KEYS.totalFreeUsed, state.totalFreeUsed);
  localStorage.setItem(KEYS.paidCredits, state.paidCredits);
}

function getRemainingFree() {
  const threshold = state.adWatched ? MAX_TOTAL_FREE : MAX_FREE;
  return Math.max(0, threshold - state.totalFreeUsed);
}

function canProcess() {
  if (state.paidCredits > 0) return true;
  return getRemainingFree() > 0;
}

function getUsageFraction() {
  if (state.paidCredits > 0) return 1;
  const threshold = state.adWatched ? MAX_TOTAL_FREE : MAX_FREE;
  const used = state.totalFreeUsed;
  return Math.max(0, (threshold - used) / threshold);
}

function updateUsageUI() {
  const remaining = state.paidCredits > 0 ? state.paidCredits : getRemainingFree();
  const fraction = getUsageFraction();

  const usageCount = document.getElementById('usageCount');
  const usageFill = document.getElementById('usageFill');
  const usageLabel = document.querySelector('.usage-label');
  const processBtn = document.getElementById('processBtn');

  if (state.paidCredits > 0) {
    usageCount.textContent = state.paidCredits;
    if (usageLabel) usageLabel.textContent = 'Paid credits remaining';
    usageFill.style.width = '100%';
    updateDots(state.paidCredits > 10 ? 3 : Math.min(3, state.paidCredits));
  } else {
    usageCount.textContent = remaining;
    if (usageLabel) usageLabel.textContent = 'Free images remaining';
    usageFill.style.width = `${fraction * 100}%`;
    updateDots(remaining);
  }

  if (processBtn) {
  processBtn.disabled = !canProcess() || !state.currentFile || state.processing || !state.libraryReady;
}
}

function updateDots(count) {
  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById(`dot${i}`);
    if (dot) {
      dot.classList.toggle('active', i < Math.min(count, 3));
    }
  }
}

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
        const file = new File([blob], 'pasted-image.png', { type: imageType });
        processFile(file);
        return;
      }
    }
    showToast('No image found in clipboard', 'warning');
  } catch (e) {
    showToast('Could not read clipboard. Try Ctrl+V in the upload zone.', 'warning');
  }
}

function processFile(file) {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
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
  console.log('File selected:', file.name);
}

function showProcessingArea(file) {
  const uploadArea = document.getElementById('uploadArea');
  const processingArea = document.getElementById('processingArea');
  const originalImg = document.getElementById('originalImg');
  const imageMeta = document.getElementById('imageMeta');
  const resultActions = document.getElementById('resultActions');
  const resultImgWrap = document.getElementById('resultImgWrap');
  const resultPlaceholder = document.getElementById('resultPlaceholder');

  const url = URL.createObjectURL(file);
  originalImg.src = url;

  originalImg.onload = () => {
    const { naturalWidth: w, naturalHeight: h } = originalImg;
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    imageMeta.textContent = `${w} × ${h}px · ${sizeMB}MB · ${file.type.split('/')[1].toUpperCase()}`;
  };

  uploadArea.classList.add('hidden');
  processingArea.classList.remove('hidden');
  resultActions.classList.add('hidden');
  resultImgWrap.classList.add('hidden');
  resultPlaceholder.classList.remove('hidden');

  updateUsageUI();
}

// ============================================================
// BACKGROUND REMOVAL (باستعمال window.removeBackground)
// ============================================================
async function processImage() {
  console.log('processImage called', { currentFile: state.currentFile, processing: state.processing, libraryReady: state.libraryReady });
  
  if (!state.currentFile || state.processing) {
    console.log('Returning early:', { currentFile: state.currentFile, processing: state.processing });
    return;
  }

  if (!canProcess()) {
    checkAndShowWall();
    return;
  }

  if (!state.libraryReady) {
    showToast('AI library not loaded yet. Please wait...', 'info');
    return;
  }

  // تأكد أن المكتبة محملة
  if (typeof window.removeBackground === 'undefined') {
    showToast('AI library not loaded yet. Please wait or refresh.', 'error');
    return;
  }

  state.processing = true;
  updateUsageUI();
  setProcessingUI(true);

  try {
    const modelProgress = document.getElementById('modelProgress');
    modelProgress.classList.remove('hidden');

    const config = {
      model: 'medium',
      debug: false,
      proxyToWorker: true,
      fetchArgs: {
        mode: 'cors',
        cache: 'force-cache',
      },
      progress: (key, current, total) => {
        const progressFill = document.getElementById('modelProgressFill');
        const progressLabel = document.getElementById('modelProgressLabel');
        if (total > 0) {
          const pct = Math.round((current / total) * 100);
          progressFill.style.width = `${pct}%`;
          progressLabel.textContent = `Loading AI model… ${pct}%`;
        }
      },
    };

    const blob = await window.removeBackground(state.currentFile);

    modelProgress.classList.add('hidden');

    state.resultBlob = blob;
    displayResult(blob);

    state.removeCount++;
    state.totalFreeUsed = state.paidCredits > 0 ? state.totalFreeUsed : state.totalFreeUsed + 1;
    if (state.paidCredits > 0) {
      state.paidCredits--;
    }
    saveState();
    updateUsageUI();

    showToast('Background removed successfully! ✨', 'success');

    setTimeout(() => {
      if (!canProcess()) {
        checkAndShowWall();
      }
    }, 1500);

  } catch (err) {
    console.error('Processing error:', err);
    showToast('Processing failed: ' + (err.message || 'unknown error'), 'error');
    document.getElementById('modelProgress').classList.add('hidden');
  } finally {
    state.processing = false;
    setProcessingUI(false);
    updateUsageUI();
  }
}

function setProcessingUI(loading) {
  const processBtn = document.getElementById('processBtn');
  const btnText = processBtn.querySelector('.btn-process-text');
  const btnLoading = processBtn.querySelector('.btn-process-loading');

  if (loading) {
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
    processBtn.disabled = true;
  } else {
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    processBtn.disabled = !canProcess() || !state.currentFile;
  }
}

function displayResult(blob) {
  const resultPlaceholder = document.getElementById('resultPlaceholder');
  const resultImgWrap = document.getElementById('resultImgWrap');
  const resultImg = document.getElementById('resultImg');
  const resultActions = document.getElementById('resultActions');

  const url = URL.createObjectURL(blob);
  resultImg.src = url;
  resultPlaceholder.classList.add('hidden');
  resultImgWrap.classList.remove('hidden');
  resultActions.classList.remove('hidden');
}

function downloadResult() {
  if (!state.resultBlob) return;
  const url = URL.createObjectURL(state.resultBlob);
  const a = document.createElement('a');
  a.href = url;
  const name = state.currentFile ? state.currentFile.name.replace(/\.[^.]+$/, '') : 'result';
  a.download = `${name}-clearcut.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Downloading your image!', 'success');
}

async function copyToClipboard() {
  if (!state.resultBlob) return;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': state.resultBlob })
    ]);
    showToast('Image copied to clipboard!', 'success');
  } catch (e) {
    showToast('Copy failed. Try downloading instead.', 'error');
  }
}

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

  const processBtn = document.getElementById('processBtn');
  if (processBtn) {
    processBtn.querySelector('.btn-process-text').classList.remove('hidden');
    processBtn.querySelector('.btn-process-loading').classList.add('hidden');
    processBtn.disabled = true;
  }

  updateUsageUI();
}

function checkAndShowWall() {
  if (canProcess()) return;

  if (!state.adWatched) {
    showAdModal();
  } else {
    showPricingModal();
  }
}

function showAdModal() {
  document.getElementById('adModal').classList.remove('hidden');
}

function closeAdModal() {
  document.getElementById('adModal').classList.add('hidden');
  const adTimer = document.getElementById('adTimer');
  adTimer.classList.add('hidden');
}

function startAd() {
  const adTimer = document.getElementById('adTimer');
  const adFill = document.getElementById('adProgressFill');
  const adCountdown = document.getElementById('adCountdown');
  const adActions = document.querySelector('#adModal .modal-actions');

  adTimer.classList.remove('hidden');
  if (adActions) adActions.style.display = 'none';

  let seconds = 5;
  adCountdown.textContent = seconds;

  const interval = setInterval(() => {
    seconds--;
    adCountdown.textContent = seconds;
    adFill.style.width = `${((5 - seconds) / 5) * 100}%`;

    if (seconds <= 0) {
      clearInterval(interval);
      completeAd();
    }
  }, 1000);
}

function completeAd() {
  state.adWatched = true;
  state.adWatchedAt = new Date().toISOString();
  saveState();

  closeAdModal();
  updateUsageUI();
  showToast('🎉 You earned 3 more free removals!', 'success');

  if (adActions) adActions.style.display = '';
}

function showPricingModal() {
  document.getElementById('paymentModal').classList.remove('hidden');
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.add('hidden');
}

function purchasePlan(plan) {
  const credits = plan === 'pro' ? 500 : 100;
  const price = plan === 'pro' ? '$6.95' : '$2.95';

  showToast(`Processing payment of ${price}…`, 'info');

  setTimeout(() => {
    state.paidCredits += credits;
    saveState();
    closePaymentModal();
    updateUsageUI();
    showToast(`✅ ${credits} credits added! Happy removing!`, 'success');
    showInfoModal('purchase-success', credits, price);
  }, 1500);
}

const legalContent = { /* ... (نفس المحتوى) ... */ };

function showModal(type) {
  event && event.preventDefault();
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

function showInfoModal(type, ...args) {
  if (type === 'purchase-success') {
    const [credits, price] = args;
    document.getElementById('infoModalContent').innerHTML = `
      <div style="text-align:center;padding:20px 0;">
        <div style="font-size:3rem;margin-bottom:16px;">🎉</div>
        <h2 style="font-family:var(--font-display);font-size:1.6rem;font-weight:800;color:var(--dark);margin-bottom:10px;">Payment Successful!</h2>
        <p style="color:var(--mid);margin-bottom:20px;">${credits} credits have been added to your account.</p>
        <button onclick="closeInfoModal()" style="background:var(--gradient);color:white;border:none;padding:12px 28px;border-radius:100px;font-size:0.95rem;font-weight:600;cursor:pointer;font-family:var(--font);">Start Removing →</button>
      </div>
    `;
    document.getElementById('infoModal').classList.remove('hidden');
  }
}

function toggleFaq(index) {
  const items = document.querySelectorAll('.faq-item');
  const item = items[index];
  if (!item) return;
  item.classList.toggle('open');
}

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

function checkCookieBanner() {
  const consent = localStorage.getItem(KEYS.cookieConsent);
  if (consent) {
    document.getElementById('cookieBanner').style.display = 'none';
  }
}

function acceptCookies() {
  localStorage.setItem(KEYS.cookieConsent, 'accepted');
  document.getElementById('cookieBanner').style.display = 'none';
  showToast('Preferences saved', 'success');
}

function declineCookies() {
  localStorage.setItem(KEYS.cookieConsent, 'declined');
  document.getElementById('cookieBanner').style.display = 'none';
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      const processingArea = document.getElementById('processingArea');
      if (!processingArea.classList.contains('hidden')) return;
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

function scrollToApp() {
  document.getElementById('app').scrollIntoView({ behavior: 'smooth' });
}

function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  menu.classList.toggle('open');
}

function submitContact() {
  const name = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const msg = document.getElementById('contactMsg').value.trim();

  if (!name || !email || !msg) {
    showToast('Please fill in all fields', 'warning');
    return;
  }
  if (!email.includes('@')) {
    showToast('Please enter a valid email', 'error');
    return;
  }

  console.log('Contact form:', { name, email, msg });

  document.getElementById('contactModal').classList.add('hidden');
  showToast('Message sent! We\'ll get back to you soon.', 'success');

  document.getElementById('contactName').value = '';
  document.getElementById('contactEmail').value = '';
  document.getElementById('contactMsg').value = '';
}

function trackEvent(name, params = {}) {
  console.log(`[Analytics] ${name}`, params);
}

const adActionsRef = () => document.querySelector('#adModal .modal-actions');

function completeAd() {
  state.adWatched = true;
  state.adWatchedAt = new Date().toISOString();
  saveState();

  closeAdModal();
  updateUsageUI();

  const actions = adActionsRef();
  if (actions) actions.style.display = '';

  trackEvent('ad_completed');
  showToast('🎉 You earned 3 more free removals!', 'success');
}

document.addEventListener('DOMContentLoaded', init);

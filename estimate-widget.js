(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  var scriptTag = document.currentScript || document.querySelector('script[data-client-id][src*="estimate"]');

  var CONFIG = {
    clientId:    scriptTag?.getAttribute('data-client-id') || '',
    ga4Id:       scriptTag?.getAttribute('data-ga4-id') || '',
    apiUrl:      scriptTag?.getAttribute('data-api-url') || '',
    logoUrl:     scriptTag?.getAttribute('data-logo-url') || '',
    containerId: scriptTag?.getAttribute('data-container') || 'tt-estimate-widget',
  };

  // ═══════════════════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════════════════

  var state = {
    currentStep: 1,
    photos: [null, null, null],       // { file, preview, uploading, url }
    description: '',
    isEmergency: false,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    honeypot: '',
    consentEstimate: false,
    consentContact: false,
    submitting: false,
    errors: {},
    result: null,
  };

  var container = null;

  // ═══════════════════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════════════════

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function $(sel, ctx) { return (ctx || container).querySelector(sel); }
  function $$(sel, ctx) { return (ctx || container).querySelectorAll(sel); }

  function formatPrice(n) {
    return '$' + n.toLocaleString('en-US');
  }

  // ═══════════════════════════════════════════════════════════════
  //  GA4 ANALYTICS
  // ═══════════════════════════════════════════════════════════════

  function loadGA4() {
    if (!CONFIG.ga4Id || window.gtag) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + CONFIG.ga4Id;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', CONFIG.ga4Id);
  }

  function trackEvent(name, params) {
    if (window.gtag) {
      window.gtag('event', name, Object.assign({ client_id: CONFIG.clientId }, params || {}));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  IMAGE PROCESSING
  // ═══════════════════════════════════════════════════════════════

  function processImage(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          var maxDim = 2048;
          var w = img.width;
          var h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
            else { w = Math.round(w * (maxDim / h)); h = maxDim; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          var base64 = dataUrl.split(',')[1];
          resolve({
            base64: base64,
            preview: dataUrl,
            contentType: 'image/jpeg',
            filename: file.name,
          });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  API CALLS
  // ═══════════════════════════════════════════════════════════════

  function uploadPhoto(photoData) {
    return fetch(CONFIG.apiUrl + '/api/upload/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: photoData.base64,
        contentType: photoData.contentType,
        filename: photoData.filename,
      }),
    }).then(function(r) { return r.json(); });
  }

  function submitEstimate(payload) {
    return fetch(CONFIG.apiUrl + '/api/estimate/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Request failed'); });
      return r.json();
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  FONT LOADING
  // ═══════════════════════════════════════════════════════════════

  function loadFonts() {
    if (!document.querySelector('link[href*="fonts.googleapis.com"][rel="preconnect"]')) {
      var pc1 = document.createElement('link'); pc1.rel = 'preconnect'; pc1.href = 'https://fonts.googleapis.com'; document.head.appendChild(pc1);
      var pc2 = document.createElement('link'); pc2.rel = 'preconnect'; pc2.href = 'https://fonts.gstatic.com'; pc2.crossOrigin = ''; document.head.appendChild(pc2);
    }
    if (!document.querySelector('link[href*="Montserrat"]')) {
      var l = document.createElement('link'); l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap';
      document.head.appendChild(l);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  CSS STYLES
  // ═══════════════════════════════════════════════════════════════

  function getStyles() {
    return '\
.tt-widget *{box-sizing:border-box;margin:0;padding:0}\
.tt-widget{--green-dark:#021D05;--green-mid:#096034;--green-light:#86B43C;--orange:#FF6600;--white:#FFFFFF;--off-white:#f7f9f4;--gray-light:#e8ebe4;--gray-mid:#888;--gray-dark:#333;--line:rgba(2,29,5,0.1);\
display:grid;grid-template-columns:280px 1fr;min-height:680px;border-radius:16px;overflow:hidden;\
box-shadow:0 20px 60px -20px rgba(2,29,5,0.3),0 8px 24px -12px rgba(2,29,5,0.15);\
font-family:"Montserrat",system-ui,-apple-system,sans-serif;color:var(--gray-dark);line-height:1.55;position:relative}\
\
.tt-sidebar{background:var(--green-dark);color:var(--white);padding:36px 28px;display:flex;flex-direction:column;position:relative;overflow:hidden}\
.tt-sidebar::before{content:"";position:absolute;inset:0;\
background:radial-gradient(ellipse at 80% 10%,rgba(134,180,60,0.08),transparent 50%),radial-gradient(ellipse at 10% 90%,rgba(255,102,0,0.06),transparent 60%);\
pointer-events:none}\
.tt-sidebar>*{position:relative;z-index:1}\
.tt-logo{max-width:160px;height:auto;margin-bottom:24px;display:block}\
.tt-sidebar-tagline{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--green-light);margin-bottom:24px;font-weight:600}\
.tt-sidebar-title{font-weight:700;font-size:22px;line-height:1.25;margin-bottom:10px;letter-spacing:-0.3px}\
.tt-sidebar-intro{font-size:13px;opacity:0.65;line-height:1.7;margin-bottom:32px}\
\
.tt-steps{list-style:none;display:flex;flex-direction:column;gap:4px}\
.tt-step{display:flex;align-items:flex-start;gap:14px;padding:12px;border-radius:8px;transition:background 0.25s;cursor:default}\
.tt-step.tt-active{background:rgba(134,180,60,0.12)}\
.tt-step-num{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;\
background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4);transition:all 0.25s}\
.tt-step.tt-done .tt-step-num{background:var(--orange);color:var(--white)}\
.tt-step.tt-active .tt-step-num{background:var(--green-light);color:var(--green-dark)}\
.tt-step-info{min-width:0}\
.tt-step-title{font-size:13px;font-weight:600;line-height:1.4}\
.tt-step-desc{font-size:11px;opacity:0.5;margin-top:2px}\
.tt-step:not(.tt-active):not(.tt-done) .tt-step-title{opacity:0.5}\
\
.tt-sidebar-footer{margin-top:auto;font-size:11px;opacity:0.35;line-height:1.6;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08)}\
\
.tt-main{background:var(--off-white);padding:48px 44px;display:flex;flex-direction:column;overflow-y:auto}\
.tt-main-title{font-size:22px;font-weight:700;color:var(--green-dark);margin-bottom:6px}\
.tt-main-subtitle{font-size:14px;color:var(--gray-mid);margin-bottom:28px}\
\
.tt-upload-area{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}\
.tt-upload-slot{width:180px;height:180px;border:2px dashed var(--gray-light);border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;\
cursor:pointer;transition:all 0.2s;background:var(--white);position:relative;overflow:hidden}\
.tt-upload-slot:hover{border-color:var(--green-light);background:rgba(134,180,60,0.04)}\
.tt-upload-slot.tt-required{border-color:var(--green-mid);border-style:solid}\
.tt-upload-slot.tt-has-photo{border-color:var(--green-light);border-style:solid;padding:0}\
.tt-upload-slot.tt-has-photo img{width:100%;height:100%;object-fit:cover}\
.tt-upload-icon{width:36px;height:36px;margin-bottom:8px;opacity:0.3;color:var(--gray-dark)}\
.tt-upload-label{font-size:12px;color:var(--gray-mid);text-align:center;line-height:1.4}\
.tt-upload-label strong{color:var(--green-mid);display:block;font-weight:600}\
.tt-upload-badge{position:absolute;top:8px;right:8px;background:var(--orange);color:white;font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;z-index:2}\
.tt-upload-remove{position:absolute;top:6px;left:6px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;z-index:2;transition:background 0.2s}\
.tt-upload-remove:hover{background:rgba(200,40,40,0.8)}\
\
.tt-field-group{margin-bottom:20px}\
.tt-field-label{font-size:13px;font-weight:600;color:var(--green-dark);margin-bottom:6px;display:block}\
.tt-field-hint{font-size:11px;color:var(--gray-mid);margin-bottom:8px;display:block}\
.tt-textarea{width:100%;min-height:100px;padding:14px 16px;border:1px solid var(--gray-light);border-radius:10px;font-family:inherit;font-size:14px;line-height:1.5;resize:vertical;background:var(--white);color:var(--gray-dark);transition:border-color 0.2s}\
.tt-textarea:focus{outline:none;border-color:var(--green-light);box-shadow:0 0 0 3px rgba(134,180,60,0.12)}\
.tt-textarea::placeholder{color:#bbb}\
\
.tt-checkbox-row{display:flex;align-items:flex-start;gap:10px;margin-bottom:16px;cursor:pointer}\
.tt-checkbox-row input[type="checkbox"]{width:18px;height:18px;border-radius:4px;border:2px solid var(--gray-light);cursor:pointer;accent-color:var(--orange);flex-shrink:0;margin-top:2px}\
.tt-checkbox-label{font-size:13px;color:var(--gray-dark);line-height:1.5}\
.tt-checkbox-label.tt-emergency-label{color:var(--orange);font-weight:600}\
\
.tt-input-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}\
.tt-input{width:100%;padding:12px 16px;border:1px solid var(--gray-light);border-radius:10px;font-family:inherit;font-size:14px;background:var(--white);color:var(--gray-dark);transition:border-color 0.2s}\
.tt-input:focus{outline:none;border-color:var(--green-light);box-shadow:0 0 0 3px rgba(134,180,60,0.12)}\
.tt-input::placeholder{color:#bbb}\
.tt-input.tt-error{border-color:#d32f2f}\
.tt-error-msg{font-size:11px;color:#d32f2f;margin-top:4px;display:block}\
\
.tt-consent-section{background:var(--white);border:1px solid var(--gray-light);border-radius:12px;padding:20px;margin-top:8px;margin-bottom:24px}\
.tt-consent-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-mid);margin-bottom:14px}\
.tt-consent-section .tt-checkbox-row{margin-bottom:12px}\
.tt-consent-section .tt-checkbox-row:last-child{margin-bottom:0}\
.tt-consent-section .tt-checkbox-label{font-size:12px;color:#666}\
\
.tt-btn-row{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:24px}\
.tt-btn{padding:14px 32px;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;border:none;letter-spacing:0.3px}\
.tt-btn-primary{background:var(--green-mid);color:var(--white)}\
.tt-btn-primary:hover{background:#07502b;box-shadow:0 4px 16px rgba(9,96,52,0.25)}\
.tt-btn-primary:disabled,.tt-btn-submit:disabled{background:#ccc;cursor:not-allowed;box-shadow:none}\
.tt-btn-secondary{background:transparent;color:var(--gray-mid);border:1px solid var(--gray-light)}\
.tt-btn-secondary:hover{background:var(--white);color:var(--gray-dark)}\
.tt-btn-submit{background:var(--orange);color:var(--white)}\
.tt-btn-submit:hover{background:#e55c00;box-shadow:0 4px 16px rgba(255,102,0,0.3)}\
\
.tt-review-card{background:var(--white);border:1px solid var(--gray-light);border-radius:12px;padding:20px;margin-bottom:16px}\
.tt-review-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}\
.tt-review-card-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-mid)}\
.tt-review-edit{font-size:12px;color:var(--green-mid);cursor:pointer;font-weight:600;background:none;border:none;font-family:inherit;transition:color 0.2s}\
.tt-review-edit:hover{color:var(--orange)}\
.tt-review-photos{display:flex;gap:10px}\
.tt-review-photo{width:80px;height:80px;border-radius:8px;object-fit:cover;border:1px solid var(--line)}\
.tt-review-text{font-size:14px;color:var(--gray-dark);line-height:1.6}\
.tt-review-text strong{color:var(--green-dark)}\
.tt-emergency-tag{display:inline-flex;align-items:center;gap:5px;background:rgba(255,102,0,0.1);color:var(--orange);font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;margin-top:8px;text-transform:uppercase;letter-spacing:0.5px}\
\
.tt-loading-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;padding:40px 20px}\
.tt-loading-spinner{width:56px;height:56px;border:3px solid var(--gray-light);border-top-color:var(--green-mid);border-radius:50%;animation:ttSpin 0.8s linear infinite;margin-bottom:28px}\
@keyframes ttSpin{to{transform:rotate(360deg)}}\
.tt-loading-title{font-size:20px;font-weight:700;color:var(--green-dark);margin-bottom:10px}\
.tt-loading-subtitle{font-size:14px;color:var(--gray-mid);max-width:340px;line-height:1.6}\
.tt-loading-steps{margin-top:28px;display:flex;flex-direction:column;gap:10px;text-align:left}\
.tt-loading-step{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--gray-mid);transition:color 0.3s}\
.tt-loading-step.tt-l-active{color:var(--green-dark);font-weight:600}\
.tt-loading-step.tt-l-done{color:var(--green-light)}\
.tt-loading-dot{width:8px;height:8px;border-radius:50%;background:var(--gray-light);flex-shrink:0;transition:background 0.3s}\
.tt-loading-step.tt-l-active .tt-loading-dot{background:var(--orange);animation:ttPulse 1s ease-in-out infinite}\
.tt-loading-step.tt-l-done .tt-loading-dot{background:var(--green-light)}\
@keyframes ttPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:0.6}}\
\
.tt-result-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:20px}\
.tt-badge-standard{background:rgba(134,180,60,0.15);color:#5a8a1c}\
.tt-badge-complex{background:rgba(255,102,0,0.12);color:#cc5200}\
.tt-badge-high-complexity{background:rgba(200,40,40,0.1);color:#a02828}\
.tt-price-label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:var(--gray-mid);margin-bottom:6px}\
.tt-price-range{font-size:42px;font-weight:700;color:var(--green-dark);letter-spacing:-1px;margin-bottom:28px}\
.tt-price-dash{color:var(--gray-light);margin:0 4px}\
.tt-result-note{font-size:12px;color:var(--gray-mid);background:rgba(255,102,0,0.06);border-left:3px solid var(--orange);padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:28px;line-height:1.6}\
.tt-result-details{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}\
.tt-detail-card{background:var(--white);border:1px solid var(--gray-light);border-radius:10px;padding:16px}\
.tt-detail-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gray-mid);margin-bottom:4px}\
.tt-detail-value{font-size:16px;font-weight:700;color:var(--green-dark)}\
.tt-detail-sub{font-size:11px;color:var(--gray-mid);margin-top:2px}\
.tt-factors-title{font-size:13px;font-weight:700;color:var(--green-dark);margin-bottom:12px}\
.tt-factor-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px}\
.tt-factor-row:last-child{border-bottom:none}\
.tt-factor-name{color:var(--gray-dark)}\
.tt-factor-impact{font-weight:600;font-size:12px;padding:3px 10px;border-radius:12px}\
.tt-impact-low{background:rgba(134,180,60,0.12);color:#5a8a1c}\
.tt-impact-medium{background:rgba(255,170,0,0.12);color:#b37700}\
.tt-impact-high{background:rgba(255,102,0,0.12);color:#cc5200}\
.tt-result-cta{background:var(--green-dark);border-radius:12px;padding:24px;text-align:center;color:var(--white);margin-top:28px}\
.tt-result-cta p{font-size:14px;margin-bottom:14px;opacity:0.8;line-height:1.6}\
.tt-result-cta .tt-btn{background:var(--orange);color:var(--white)}\
.tt-result-cta .tt-btn:hover{background:#e55c00}\
\
.tt-error-banner{background:#FFF3F3;border:1px solid #f5c6c6;border-radius:10px;padding:16px 20px;margin-bottom:20px;font-size:13px;color:#c62828;line-height:1.5}\
\
.tt-step-content{display:none;flex-direction:column;flex:1}\
.tt-step-content.tt-visible{display:flex;animation:ttFadeIn 0.35s ease}\
@keyframes ttFadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}\
\
.tt-mobile-progress{display:none}\
.tt-hp{position:absolute;left:-9999px;opacity:0;height:0;width:0;pointer-events:none}\
\
@media(max-width:768px){\
.tt-widget{grid-template-columns:1fr;min-height:auto;border-radius:12px}\
.tt-sidebar{padding:24px 20px 20px}\
.tt-steps,.tt-sidebar-intro,.tt-sidebar-footer{display:none}\
.tt-sidebar-title{font-size:18px}\
.tt-mobile-progress{display:flex;gap:6px;margin-top:16px}\
.tt-mobile-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.2);transition:background 0.3s}\
.tt-mobile-dot.tt-m-active{background:var(--green-light)}\
.tt-mobile-dot.tt-m-done{background:var(--orange)}\
.tt-main{padding:28px 20px}\
.tt-upload-area{flex-direction:column;align-items:stretch}\
.tt-upload-slot{width:100%;height:140px}\
.tt-input-row{grid-template-columns:1fr}\
.tt-result-details{grid-template-columns:1fr}\
.tt-price-range{font-size:32px}\
}';
  }

  // ═══════════════════════════════════════════════════════════════
  //  DEFAULT LOGO (base64 fallback — small tree icon)
  // ═══════════════════════════════════════════════════════════════

  var UPLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="tt-upload-icon"><path d="M12 16v-8m-4 4l4-4 4 4"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';

  // ═══════════════════════════════════════════════════════════════
  //  RENDER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  function renderSidebar() {
    var logoSrc = CONFIG.logoUrl || '';
    var logoHtml = logoSrc ? '<img src="' + esc(logoSrc) + '" alt="TeleTree Bros" class="tt-logo">' : '<div class="tt-sidebar-title" style="margin-bottom:24px;color:var(--green-light);">TeleTree Bros</div>';

    return '\
<div class="tt-sidebar">\
' + logoHtml + '\
<div class="tt-sidebar-tagline">Higher Reach. Lower Risk.</div>\
<div class="tt-sidebar-title">Tree Removal<br>Estimate</div>\
<div class="tt-sidebar-intro">Upload a photo of your tree and receive an instant estimate powered by advanced analysis.</div>\
<ul class="tt-steps">\
  <li class="tt-step tt-active" data-step="1"><div class="tt-step-num">1</div><div class="tt-step-info"><div class="tt-step-title">Your Tree</div><div class="tt-step-desc">Photos &amp; description</div></div></li>\
  <li class="tt-step" data-step="2"><div class="tt-step-num">2</div><div class="tt-step-info"><div class="tt-step-title">Contact Info</div><div class="tt-step-desc">How to reach you</div></div></li>\
  <li class="tt-step" data-step="3"><div class="tt-step-num">3</div><div class="tt-step-info"><div class="tt-step-title">Review &amp; Submit</div><div class="tt-step-desc">Confirm &amp; get estimate</div></div></li>\
</ul>\
<div class="tt-mobile-progress">\
  <div class="tt-mobile-dot tt-m-active" data-dot="1"></div>\
  <div class="tt-mobile-dot" data-dot="2"></div>\
  <div class="tt-mobile-dot" data-dot="3"></div>\
</div>\
<div class="tt-sidebar-footer">TeleTree Bros LLC &middot; Gainesville, GA<br>Licensed &amp; Insured &middot; (770) 652-4249</div>\
</div>';
  }

  function renderStep1() {
    var slots = '';
    for (var i = 0; i < 3; i++) {
      var p = state.photos[i];
      var isFirst = i === 0;
      var hasPhoto = p && p.preview;

      if (hasPhoto) {
        slots += '<div class="tt-upload-slot tt-has-photo" data-slot="' + i + '">' +
          '<button class="tt-upload-remove" data-remove="' + i + '">&times;</button>' +
          (isFirst ? '<div class="tt-upload-badge">Required</div>' : '') +
          '<img src="' + p.preview + '" alt="Tree photo">' +
          '</div>';
      } else {
        slots += '<div class="tt-upload-slot' + (isFirst ? ' tt-required' : '') + '" data-slot="' + i + '">' +
          (isFirst ? '<div class="tt-upload-badge">Required</div>' : '') +
          UPLOAD_ICON +
          '<div class="tt-upload-label"><strong>' + (isFirst ? 'Upload Photo' : 'Add Photo') + '</strong>' + (isFirst ? 'Clear view of your tree' : 'Additional angle') + '</div>' +
          '</div>';
      }
    }

    return '\
<div class="tt-step-content tt-visible" data-content="1">\
<div class="tt-main-title">Tell Us About Your Tree</div>\
<div class="tt-main-subtitle">Upload a clear photo of the tree and describe the situation.</div>\
<div class="tt-upload-area">' + slots + '</div>\
<input type="file" accept="image/*" class="tt-hp" id="tt-file-input">\
<div class="tt-field-group">\
  <label class="tt-field-label">Describe the situation</label>\
  <span class="tt-field-hint">What\'s going on with the tree? Any concerns about nearby structures, power lines, or access?</span>\
  <textarea class="tt-textarea" id="tt-description" placeholder="e.g., Large oak in the backyard, leaning toward the house. Fence on one side, power lines nearby...">' + esc(state.description) + '</textarea>\
</div>\
<label class="tt-checkbox-row">\
  <input type="checkbox" id="tt-emergency"' + (state.isEmergency ? ' checked' : '') + '>\
  <span class="tt-checkbox-label tt-emergency-label">⚠ This is an emergency or dangerous situation</span>\
</label>\
' + (state.errors.step1 ? '<div class="tt-error-banner">' + esc(state.errors.step1) + '</div>' : '') + '\
<div class="tt-btn-row"><div></div><button class="tt-btn tt-btn-primary" id="tt-next-1">Continue →</button></div>\
</div>';
  }

  function renderStep2() {
    return '\
<div class="tt-step-content" data-content="2">\
<div class="tt-main-title">Your Contact Information</div>\
<div class="tt-main-subtitle">So we can follow up with any additional questions about your tree.</div>\
<div class="tt-input-row">\
  <div class="tt-field-group"><label class="tt-field-label">First Name</label><input type="text" class="tt-input' + (state.errors.firstName ? ' tt-error' : '') + '" id="tt-fname" placeholder="John" value="' + esc(state.firstName) + '">' + (state.errors.firstName ? '<span class="tt-error-msg">' + esc(state.errors.firstName) + '</span>' : '') + '</div>\
  <div class="tt-field-group"><label class="tt-field-label">Last Name</label><input type="text" class="tt-input' + (state.errors.lastName ? ' tt-error' : '') + '" id="tt-lname" placeholder="Smith" value="' + esc(state.lastName) + '">' + (state.errors.lastName ? '<span class="tt-error-msg">' + esc(state.errors.lastName) + '</span>' : '') + '</div>\
</div>\
<div class="tt-input-row">\
  <div class="tt-field-group"><label class="tt-field-label">Email</label><input type="email" class="tt-input' + (state.errors.email ? ' tt-error' : '') + '" id="tt-email" placeholder="john@example.com" value="' + esc(state.email) + '">' + (state.errors.email ? '<span class="tt-error-msg">' + esc(state.errors.email) + '</span>' : '') + '</div>\
  <div class="tt-field-group"><label class="tt-field-label">Phone</label><input type="tel" class="tt-input' + (state.errors.phone ? ' tt-error' : '') + '" id="tt-phone" placeholder="(770) 555-1234" value="' + esc(state.phone) + '">' + (state.errors.phone ? '<span class="tt-error-msg">' + esc(state.errors.phone) + '</span>' : '') + '</div>\
</div>\
<input type="text" class="tt-hp" id="tt-hp" tabindex="-1" autocomplete="off" aria-hidden="true" value="">\
<div class="tt-btn-row"><button class="tt-btn tt-btn-secondary" id="tt-back-2">← Back</button><button class="tt-btn tt-btn-primary" id="tt-next-2">Continue →</button></div>\
</div>';
  }

  function renderStep3() {
    var photosHtml = state.photos
      .filter(function(p) { return p && p.preview; })
      .map(function(p) { return '<img class="tt-review-photo" src="' + p.preview + '" alt="Tree photo">'; })
      .join('');

    return '\
<div class="tt-step-content" data-content="3">\
<div class="tt-main-title">Review &amp; Submit</div>\
<div class="tt-main-subtitle">Please confirm your details before we generate your estimate.</div>\
<div class="tt-review-card">\
  <div class="tt-review-card-header"><span class="tt-review-card-title">Photos &amp; Description</span><button class="tt-review-edit" data-goto="1">Edit</button></div>\
  <div class="tt-review-photos" style="margin-bottom:12px">' + photosHtml + '</div>\
  <div class="tt-review-text">' + esc(state.description) + '</div>\
  ' + (state.isEmergency ? '<div class="tt-emergency-tag">⚠ Emergency / Dangerous</div>' : '') + '\
</div>\
<div class="tt-review-card">\
  <div class="tt-review-card-header"><span class="tt-review-card-title">Contact Information</span><button class="tt-review-edit" data-goto="2">Edit</button></div>\
  <div class="tt-review-text"><strong>' + esc(state.firstName) + ' ' + esc(state.lastName) + '</strong><br>' + esc(state.email) + '<br>' + esc(state.phone) + '</div>\
</div>\
<div class="tt-consent-section">\
  <div class="tt-consent-title">Before We Continue</div>\
  <label class="tt-checkbox-row"><input type="checkbox" id="tt-consent-1"' + (state.consentEstimate ? ' checked' : '') + '><span class="tt-checkbox-label">I understand that the estimate provided is preliminary and that actual pricing is subject to change based on an on-site evaluation by TeleTree Bros.</span></label>\
  <label class="tt-checkbox-row"><input type="checkbox" id="tt-consent-2"' + (state.consentContact ? ' checked' : '') + '><span class="tt-checkbox-label">I agree to be contacted by TeleTree Bros regarding this estimate and related tree removal services.</span></label>\
</div>\
' + (state.errors.step3 ? '<div class="tt-error-banner">' + esc(state.errors.step3) + '</div>' : '') + '\
<div class="tt-btn-row"><button class="tt-btn tt-btn-secondary" id="tt-back-3">← Back</button><button class="tt-btn tt-btn-submit" id="tt-submit">Get My Estimate →</button></div>\
</div>';
  }

  function renderStep4() {
    return '\
<div class="tt-step-content" data-content="4">\
<div class="tt-loading-screen">\
  <div class="tt-loading-spinner"></div>\
  <div class="tt-loading-title">Analyzing Your Tree</div>\
  <div class="tt-loading-subtitle">Our system is reviewing your photos and generating a detailed estimate. This usually takes 15–30 seconds.</div>\
  <div class="tt-loading-steps">\
    <div class="tt-loading-step tt-l-active"><div class="tt-loading-dot"></div><span>Uploading photos</span></div>\
    <div class="tt-loading-step"><div class="tt-loading-dot"></div><span>Identifying tree species &amp; size</span></div>\
    <div class="tt-loading-step"><div class="tt-loading-dot"></div><span>Evaluating removal complexity</span></div>\
    <div class="tt-loading-step"><div class="tt-loading-dot"></div><span>Calculating estimate</span></div>\
  </div>\
</div>\
</div>';
  }

  function renderStep5() {
    var r = state.result;
    if (!r) return '<div class="tt-step-content" data-content="5"></div>';

    var badgeClass = r.difficultyRating === 'standard' ? 'tt-badge-standard' :
      r.difficultyRating === 'complex' ? 'tt-badge-complex' : 'tt-badge-high-complexity';
    var badgeLabel = r.difficultyRating === 'standard' ? 'Standard Removal' :
      r.difficultyRating === 'complex' ? 'Complex Removal' : 'High-Complexity Removal';

    var conditionLabel = r.treeCondition || '';
    conditionLabel = conditionLabel.charAt(0).toUpperCase() + conditionLabel.slice(1);

    var factorsHtml = (r.factors || []).map(function(f) {
      var impactClass = f.impact === 'high' ? 'tt-impact-high' : f.impact === 'medium' ? 'tt-impact-medium' : 'tt-impact-low';
      var impactLabel = f.impact.charAt(0).toUpperCase() + f.impact.slice(1) + ' Impact';
      return '<div class="tt-factor-row"><span class="tt-factor-name">' + esc(f.name) + (f.description ? ' — ' + esc(f.description) : '') + '</span><span class="tt-factor-impact ' + impactClass + '">' + esc(impactLabel) + '</span></div>';
    }).join('');

    return '\
<div class="tt-step-content" data-content="5">\
<div class="tt-result-badge ' + badgeClass + '">\
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>\
  ' + esc(badgeLabel) + '\
</div>\
<div class="tt-price-label">Estimated Cost</div>\
<div class="tt-price-range">' + formatPrice(r.priceLow) + '<span class="tt-price-dash">–</span>' + formatPrice(r.priceHigh) + '</div>\
<div class="tt-result-note">This estimate is based on photo analysis and may change after an on-site evaluation. A TeleTree Bros team member will reach out within 1 business day to schedule a visit and provide a final quote.</div>\
<div class="tt-result-details">\
  <div class="tt-detail-card"><div class="tt-detail-label">Species</div><div class="tt-detail-value">' + esc(r.species || 'Unknown') + '</div><div class="tt-detail-sub">' + esc((r.speciesType || '') + (r.canopyDescription ? ' · ' + r.canopyDescription : '')) + '</div></div>\
  <div class="tt-detail-card"><div class="tt-detail-label">Estimated Height</div><div class="tt-detail-value">' + (r.estimatedHeightFt || '?') + ' ft</div><div class="tt-detail-sub">' + esc(r.heightTier || '') + ' tree classification</div></div>\
  <div class="tt-detail-card"><div class="tt-detail-label">Estimated Time</div><div class="tt-detail-value">' + r.estimatedTimeLow + '–' + r.estimatedTimeHigh + ' hours</div><div class="tt-detail-sub">Full crew with equipment</div></div>\
  <div class="tt-detail-card"><div class="tt-detail-label">Condition</div><div class="tt-detail-value">' + esc(conditionLabel) + '</div><div class="tt-detail-sub">' + esc(badgeLabel) + '</div></div>\
</div>\
<div style="margin-bottom:28px"><div class="tt-factors-title">Factors Affecting Your Estimate</div>' + factorsHtml + '</div>\
<div class="tt-result-cta"><p>A member of our team will review your submission and reach out within 1 business day to schedule an on-site evaluation.</p><a href="tel:7706524249" class="tt-btn" style="display:inline-block;text-decoration:none;">Call Us: (770) 652-4249</a></div>\
</div>';
  }

  // ═══════════════════════════════════════════════════════════════
  //  RENDER MAIN
  // ═══════════════════════════════════════════════════════════════

  function render() {
    container.innerHTML = '<div class="tt-widget">' +
      renderSidebar() +
      '<div class="tt-main">' +
        renderStep1() + renderStep2() + renderStep3() + renderStep4() + renderStep5() +
      '</div></div>';

    showStep(state.currentStep);
    bindEvents();
  }

  function showStep(step) {
    state.currentStep = step;
    var contents = $$('[data-content]');
    contents.forEach(function(el) {
      var s = parseInt(el.getAttribute('data-content'));
      el.classList.toggle('tt-visible', s === step);
    });

    var sidebarSteps = $$('.tt-step');
    sidebarSteps.forEach(function(el) {
      var s = parseInt(el.getAttribute('data-step'));
      el.classList.remove('tt-active', 'tt-done');
      if (step >= 4) { el.classList.add('tt-done'); }
      else if (s === step) { el.classList.add('tt-active'); }
      else if (s < step) { el.classList.add('tt-done'); }
    });

    var dots = $$('.tt-mobile-dot');
    dots.forEach(function(el) {
      var d = parseInt(el.getAttribute('data-dot'));
      el.classList.remove('tt-m-active', 'tt-m-done');
      if (step >= 4) { el.classList.add('tt-m-done'); }
      else if (d === step) { el.classList.add('tt-m-active'); }
      else if (d < step) { el.classList.add('tt-m-done'); }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  VALIDATION
  // ═══════════════════════════════════════════════════════════════

  function validateStep1() {
    state.description = ($('#tt-description') || {}).value || '';
    state.isEmergency = ($('#tt-emergency') || {}).checked || false;

    if (!state.photos[0]) {
      state.errors.step1 = 'Please upload at least one photo of your tree.';
      return false;
    }
    if (!state.description.trim()) {
      state.errors.step1 = 'Please describe the tree and situation.';
      return false;
    }
    state.errors.step1 = '';
    return true;
  }

  function validateStep2() {
    state.firstName = ($('#tt-fname') || {}).value || '';
    state.lastName = ($('#tt-lname') || {}).value || '';
    state.email = ($('#tt-email') || {}).value || '';
    state.phone = ($('#tt-phone') || {}).value || '';
    state.honeypot = ($('#tt-hp') || {}).value || '';

    state.errors = {};
    var valid = true;

    if (!state.firstName.trim()) { state.errors.firstName = 'Required'; valid = false; }
    if (!state.lastName.trim()) { state.errors.lastName = 'Required'; valid = false; }
    if (!state.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) { state.errors.email = 'Valid email required'; valid = false; }
    if (!state.phone.trim()) { state.errors.phone = 'Required'; valid = false; }

    return valid;
  }

  // ═══════════════════════════════════════════════════════════════
  //  LOADING ANIMATION
  // ═══════════════════════════════════════════════════════════════

  var loadingInterval = null;

  function startLoadingAnimation() {
    var steps = $$('[data-content="4"] .tt-loading-step');
    var idx = 0;
    steps.forEach(function(s) { s.classList.remove('tt-l-done', 'tt-l-active'); });
    if (steps[0]) steps[0].classList.add('tt-l-active');

    loadingInterval = setInterval(function() {
      if (idx < steps.length) {
        steps[idx].classList.remove('tt-l-active');
        steps[idx].classList.add('tt-l-done');
      }
      idx++;
      if (idx < steps.length) {
        steps[idx].classList.add('tt-l-active');
      } else {
        clearInterval(loadingInterval);
      }
    }, 3000);
  }

  function stopLoadingAnimation() {
    if (loadingInterval) clearInterval(loadingInterval);
    var steps = $$('[data-content="4"] .tt-loading-step');
    steps.forEach(function(s) { s.classList.remove('tt-l-active'); s.classList.add('tt-l-done'); });
  }

  // ═══════════════════════════════════════════════════════════════
  //  SUBMISSION FLOW
  // ═══════════════════════════════════════════════════════════════

  async function handleSubmit() {
    state.consentEstimate = ($('#tt-consent-1') || {}).checked || false;
    state.consentContact = ($('#tt-consent-2') || {}).checked || false;

    if (!state.consentEstimate || !state.consentContact) {
      state.errors.step3 = 'Please check both boxes to continue.';
      render();
      showStep(3);
      return;
    }

    state.errors = {};
    state.submitting = true;
    render();
    showStep(4);
    startLoadingAnimation();

    trackEvent('estimate_submitted', {
      is_emergency: state.isEmergency,
      photo_count: state.photos.filter(function(p) { return p; }).length,
    });

    try {
      // Upload photos
      var photoUrls = [];
      var photosToUpload = state.photos.filter(function(p) { return p && p.base64; });

      for (var i = 0; i < photosToUpload.length; i++) {
        var result = await uploadPhoto(photosToUpload[i]);
        if (result.error) throw new Error(result.error);
        photoUrls.push(result.url);
      }

      // Advance loading steps
      var steps = $$('[data-content="4"] .tt-loading-step');
      if (steps[0]) { steps[0].classList.remove('tt-l-active'); steps[0].classList.add('tt-l-done'); }
      if (steps[1]) { steps[1].classList.add('tt-l-active'); }

      // Submit for analysis
      var estimateResult = await submitEstimate({
        firstName: state.firstName,
        lastName: state.lastName,
        email: state.email,
        phone: state.phone,
        description: state.description,
        isEmergency: state.isEmergency,
        photoUrls: photoUrls,
        honeypot: state.honeypot,
      });

      stopLoadingAnimation();
      state.result = estimateResult;
      state.submitting = false;

      trackEvent('estimate_received', {
        difficulty: estimateResult.difficultyRating,
        price_low: estimateResult.priceLow,
        price_high: estimateResult.priceHigh,
        species: estimateResult.species,
      });

      if (state.isEmergency) {
        trackEvent('estimate_emergency_flagged');
      }

      render();
      showStep(5);

    } catch (err) {
      stopLoadingAnimation();
      state.submitting = false;
      state.errors.step3 = err.message || 'Something went wrong. Please try again or call us at (770) 652-4249.';
      render();
      showStep(3);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  EVENT BINDING
  // ═══════════════════════════════════════════════════════════════

  var activeSlot = 0;

  function bindEvents() {
    // Photo slots
    $$('.tt-upload-slot').forEach(function(slot) {
      slot.addEventListener('click', function(e) {
        if (e.target.closest('.tt-upload-remove')) return;
        activeSlot = parseInt(slot.getAttribute('data-slot'));
        var input = $('#tt-file-input');
        if (input) { input.value = ''; input.click(); }
      });
    });

    // Photo remove buttons
    $$('.tt-upload-remove').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-remove'));
        state.photos[idx] = null;
        render();
      });
    });

    // File input
    var fileInput = $('#tt-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
          processImage(this.files[0]).then(function(data) {
            state.photos[activeSlot] = data;
            render();
          });
        }
      });
    }

    // Step 1 next
    var next1 = $('#tt-next-1');
    if (next1) {
      next1.addEventListener('click', function() {
        state.description = ($('#tt-description') || {}).value || '';
        state.isEmergency = ($('#tt-emergency') || {}).checked || false;
        if (validateStep1()) {
          trackEvent('estimate_step_complete', { step: 1 });
          render();
          showStep(2);
        } else {
          render();
        }
      });
    }

    // Step 2 nav
    var back2 = $('#tt-back-2');
    if (back2) back2.addEventListener('click', function() { saveStep2Fields(); render(); showStep(1); });

    var next2 = $('#tt-next-2');
    if (next2) {
      next2.addEventListener('click', function() {
        if (validateStep2()) {
          trackEvent('estimate_step_complete', { step: 2 });
          render();
          showStep(3);
        } else {
          render();
          showStep(2);
        }
      });
    }

    // Step 3 nav
    var back3 = $('#tt-back-3');
    if (back3) back3.addEventListener('click', function() { render(); showStep(2); });

    // Submit
    var submitBtn = $('#tt-submit');
    if (submitBtn) submitBtn.addEventListener('click', handleSubmit);

    // Edit buttons on review
    $$('.tt-review-edit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var goto = parseInt(btn.getAttribute('data-goto'));
        render();
        showStep(goto);
      });
    });
  }

  function saveStep2Fields() {
    state.firstName = ($('#tt-fname') || {}).value || state.firstName;
    state.lastName = ($('#tt-lname') || {}).value || state.lastName;
    state.email = ($('#tt-email') || {}).value || state.email;
    state.phone = ($('#tt-phone') || {}).value || state.phone;
  }

  // ═══════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════

  function init() {
    container = document.getElementById(CONFIG.containerId);
    if (!container) {
      console.error('[TeleTree Estimate] Container #' + CONFIG.containerId + ' not found.');
      return;
    }

    loadFonts();
    loadGA4();

    // Inject styles
    if (!document.getElementById('tt-estimate-styles')) {
      var style = document.createElement('style');
      style.id = 'tt-estimate-styles';
      style.textContent = getStyles();
      document.head.appendChild(style);
    }

    render();
    console.log('[TeleTree Estimate] Widget initialized', CONFIG.clientId ? '(client: ' + CONFIG.clientId + ')' : '');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

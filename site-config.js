/* 모든 공개 페이지의 공통 연락처 설정입니다. */
window.SITE_CONFIG = {
  brandName: '클린EV',
  // site-config.js의 apiUrl을 실제 배포 URL로 채워야 동작함. GitHub Pages 등 웹서버에서 테스트하세요.
  apiUrl: 'https://script.google.com/macros/s/AKfycbz0qmWqV50uK5eEeN4Wu_zwql9RYJ1Y4TVPx6NwE3M67aJ37bZI5zTUpbm4Y-_mdKA/exec',
  contactEmail: 'jdlee.electric@gmail.com',
  legalBusinessName: 'PASTE_CSLB_BUSINESS_NAME_HERE',
  licenseText: '캘리포니아 계약자 면허 C-10 #1059763 (CSLB)',
  serviceNote: '현재 LA시(LADWP 전력 지역) 충전기 설치 지원부터 서비스를 시작했습니다',
  metaPixelId: 'PASTE_META_PIXEL_ID_HERE',
  paymentsOpen: false,
  pricing: {
    vehicleOnly: 99,
    chargerOnly: 149,
    bundle: 199,
    creditNote: '충전기 시공을 진행하시면 이 이용료는 시공비에서 차감됩니다.'
  },
  stripe: {
    testMode: true,
    test: {
      paymentLinkVehicleOnly: 'https://buy.stripe.com/test_dRm14naVd1eeb9qdzM2kw00',
      paymentLinkChargerOnly: 'https://buy.stripe.com/test_dRm6oHaVd8GG4L21R42kw01',
      paymentLinkBundle: 'https://buy.stripe.com/test_7sY14n5ATg987XeanA2kw02'
    },
    live: {
      paymentLinkVehicleOnly: 'PASTE_STRIPE_LINK_VEHICLE_ONLY_HERE',
      paymentLinkChargerOnly: 'PASTE_STRIPE_LINK_CHARGER_ONLY_HERE',
      paymentLinkBundle: 'PASTE_STRIPE_LINK_BUNDLE_HERE'
    }
  },
  images: {
    hero: 'assets/clean-ev-hero.png',
    about: 'assets/clean-ev-family.png'
  }
};

/* 광고 추적 공통 도우미: UTM은 현재 브라우저 세션의 최초 유입값만 보존합니다. */
window.SITE_TRACKING = {
  captureUtm: function () {
    var names = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
    try {
      var params = new URLSearchParams(window.location.search);
      names.forEach(function (name) {
        var key = 'cleanEv_' + name;
        if (sessionStorage.getItem(key) === null && params.has(name)) sessionStorage.setItem(key, params.get(name) || '');
      });
    } catch (error) {}
  },
  getUtm: function () {
    var result = {}, fields = {utm_source: 'source', utm_medium: 'medium', utm_campaign: 'campaign', utm_content: 'content'};
    try { Object.keys(fields).forEach(function (name) { result[fields[name]] = sessionStorage.getItem('cleanEv_' + name) || ''; }); } catch (error) {}
    return result;
  },
  initMetaPixel: function (sendPageView) {
    var id = String(window.SITE_CONFIG && SITE_CONFIG.metaPixelId || '').trim();
    if (!id || id.indexOf('PASTE_') === 0) return false;
    if (!window.fbq) {
      var fbq = window.fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
      fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
      var script = document.createElement('script'); script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      var first = document.getElementsByTagName('script')[0]; first.parentNode.insertBefore(script, first);
      fbq('init', id);
    }
    if (sendPageView) window.fbq('track', 'PageView');
    return true;
  },
  trackMeta: function (eventName, data) {
    if (!this.initMetaPixel(false) || !window.fbq) return false;
    window.fbq('track', eventName, data || {}); return true;
  }
};

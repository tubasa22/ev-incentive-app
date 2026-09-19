/* 모든 공개 페이지의 공통 연락처 설정입니다. */
window.SITE_CONFIG = {
  brandName: '클린EV',
  // site-config.js의 apiUrl을 실제 배포 URL로 채워야 동작함. GitHub Pages 등 웹서버에서 테스트하세요.
  apiUrl: 'https://script.google.com/macros/s/AKfycbz0qmWqV50uK5eEeN4Wu_zwql9RYJ1Y4TVPx6NwE3M67aJ37bZI5zTUpbm4Y-_mdKA/exec',
  contactEmail: 'jdlee.electric@gmail.com',
  pricing: {
    vehicleOnly: 99,
    chargerOnly: 149,
    bundle: 199,
    creditNote: '충전기 시공을 진행하시면 이 이용료는 시공비에서 차감됩니다.'
  },
  stripe: {
    paymentLinkVehicleOnly: 'PASTE_STRIPE_LINK_VEHICLE_ONLY_HERE',
    paymentLinkChargerOnly: 'PASTE_STRIPE_LINK_CHARGER_ONLY_HERE',
    paymentLinkBundle: 'PASTE_STRIPE_LINK_BUNDLE_HERE'
  },
  images: {
    hero: 'assets/clean-ev-hero.png',
    about: 'assets/clean-ev-family.png'
  }
};

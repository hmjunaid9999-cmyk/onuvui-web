// তৃতীয় পক্ষের স্ক্রিপ্ট লোড না হলেও যেন service worker নষ্ট না হয়
try {
  self.options = {
    "domain": "5gvci.com",
    "zoneId": 11750677
  };
  self.lary = "";
  importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw');
} catch (e) {}

// PWA install-এর জন্য দরকারি
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

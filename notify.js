// ============================================================================
// notify.js — Onuvuti নোটিফিকেশন ইঞ্জিন (সব পেজে একই ফাইল ব্যবহার হয়)
//   • অন্য পেজগুলো window.OnuNotify.xxx(...) ডাক দেয় (সব ডাক try/catch-এ, তাই এই ফাইল
//     না থাকলেও বা এরর হলেও পেজের আগের কোনো কাজ আটকাবে না)
//   • notifications.html ও notification-admin.html এই ফাইল থেকেই import করে
//   • ডেটা: Firestore collection "notifications" + সেটিং "settings/notifications"
//   • শুধু কালো-সাদা: রং আসে পেজের থিম ভেরিয়েবল থেকে (--text-color / --bg-color)
// ============================================================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
  onSnapshot, getDocs, writeBatch, serverTimestamp, increment, limit
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBi5nb_B_ymD5dR-jGh_RMYMWLrtnHTOCA",
  authDomain: "onuvuti-5c9e3.firebaseapp.com",
  projectId: "onuvuti-5c9e3",
  storageBucket: "onuvuti-5c9e3.firebasestorage.app",
  messagingSenderId: "846713879232",
  appId: "1:846713879232:web:538c47101eade3e2df8b25",
  measurementId: "G-2K2L45CMWR"
};
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------------------------------------------------------------------------
// সেকশন (গ্রুপ) ও নোটিফিকেশনের ধরন — notifications.html ও অ্যাডমিন প্যানেল এখান থেকেই পড়ে
// ---------------------------------------------------------------------------
export const GROUPS = [
  { k: 'post',    icon: '📝', label: 'পোস্ট' },
  { k: 'profile', icon: '👤', label: 'প্রোফাইল' },
  { k: 'message', icon: '💬', label: 'মেসেজ ও কল' },
  { k: 'video',   icon: '🎬', label: 'ভিডিও' },
  { k: 'live',    icon: '🔴', label: 'লাইভ' },
  { k: 'quiz',    icon: '🧠', label: 'কুইজ' },
  { k: 'radio',   icon: '📻', label: 'রেডিও' },
  { k: 'system',  icon: '📢', label: 'সিস্টেম ও অ্যাডমিন' }
];

// flags: dedup = একই কাজ বারবার করলে নতুন নোটিফিকেশন হবে না | collapse = একই জনের পর পর কাজ এক লাইনে জমা
//        fanout = সাবস্ক্রাইবারদের সবাইকে | self = নিজেকেও পাঠানো যাবে | admin = অ্যাডমিন ইনবক্সে যায়
export const TYPES = {
  // ----- পোস্ট -----
  post_react:      { group: 'post', icon: '❤️', label: 'আপনার পোস্টে লাইক/রিঅ্যাকশন', title: '{name} আপনার পোস্টে রিঅ্যাক্ট করেছেন', body: '{text}', dedup: true },
  post_comment:    { group: 'post', icon: '💬', label: 'আপনার পোস্টে কমেন্ট', title: '{name} আপনার পোস্টে কমেন্ট করেছেন', body: '{text}' },
  comment_reply:   { group: 'post', icon: '↩️', label: 'আপনার কমেন্টে রিপ্লাই', title: '{name} আপনার কমেন্টে উত্তর দিয়েছেন', body: '{text}' },
  comment_like:    { group: 'post', icon: '👍', label: 'আপনার কমেন্টে লাইক', title: '{name} আপনার কমেন্ট পছন্দ করেছেন', body: '{text}', dedup: true },
  new_post:        { group: 'post', icon: '📝', label: 'সাবস্ক্রাইব করা কারো নতুন পোস্ট', title: '{name} নতুন পোস্ট করেছেন', body: '{text}', fanout: true },
  // ----- প্রোফাইল -----
  new_subscriber:  { group: 'profile', icon: '👤', label: 'নতুন সাবস্ক্রাইবার', title: '{name} আপনাকে সাবস্ক্রাইব করেছেন', body: '', dedup: true },
  // ----- মেসেজ ও কল -----
  new_message:     { group: 'message', icon: '✉️', label: 'নতুন মেসেজ', title: '{name} আপনাকে মেসেজ পাঠিয়েছেন', body: '{text}', collapse: true },
  new_voice:       { group: 'message', icon: '🎙️', label: 'নতুন ভয়েস মেসেজ', title: '{name} আপনাকে ভয়েস মেসেজ পাঠিয়েছেন', body: '{text}', collapse: true },
  new_attachment:  { group: 'message', icon: '📎', label: 'নতুন ছবি/ফাইল', title: '{name} আপনাকে একটি ফাইল পাঠিয়েছেন', body: '{text}', collapse: true },
  missed_call:     { group: 'message', icon: '📞', label: 'মিস কল', title: '{name}-এর {text} মিস কল', body: '', collapse: true },
  // ----- ভিডিও -----
  video_react:     { group: 'video', icon: '❤️', label: 'আপনার ভিডিওতে লাইক/রিঅ্যাকশন', title: '{name} আপনার ভিডিওতে রিঅ্যাক্ট করেছেন', body: '{title}', dedup: true },
  video_comment:   { group: 'video', icon: '💬', label: 'আপনার ভিডিওতে কমেন্ট', title: '{name} আপনার ভিডিওতে কমেন্ট করেছেন', body: '{text}' },
  video_reply:     { group: 'video', icon: '↩️', label: 'ভিডিওর কমেন্টে রিপ্লাই', title: '{name} আপনার কমেন্টে উত্তর দিয়েছেন', body: '{text}' },
  video_comment_like: { group: 'video', icon: '👍', label: 'ভিডিওর কমেন্টে লাইক', title: '{name} আপনার কমেন্ট পছন্দ করেছেন', body: '{text}', dedup: true },
  video_published: { group: 'video', icon: '🎬', label: 'সাবস্ক্রাইব করা কারো নতুন ভিডিও', title: '{name} নতুন ভিডিও যুক্ত করেছেন', body: '{title}', fanout: true },
  // ----- লাইভ -----
  live_started:    { group: 'live', icon: '🔴', label: 'সাবস্ক্রাইব করা কেউ লাইভে এসেছেন', title: '{name} এখন লাইভে আছেন', body: '', fanout: true },
  live_gift:       { group: 'live', icon: '🎁', label: 'লাইভে গিফট পাওয়া', title: '{name} আপনাকে {text} গিফট পাঠিয়েছেন', body: '🪙 {coins}' },
  // ----- কুইজ -----
  quiz_reward:     { group: 'quiz', icon: '🪙', label: 'কুইজে কয়েন জেতা', title: 'কুইজে {coins} কয়েন পেয়েছেন', body: 'সঠিক উত্তরের জন্য অভিনন্দন!', self: true },
  // ----- রেডিও (অ্যাডমিন প্যানেল থেকে পাঠানো) -----
  radio_update:    { group: 'radio', icon: '📻', label: 'রেডিও আপডেট', title: '{title}', body: '{text}', adminSend: true },
  // ----- সিস্টেম -----
  broadcast:       { group: 'system', icon: '📢', label: 'অ্যাডমিনের ঘোষণা', title: '{title}', body: '{text}', adminSend: true },
  account_notice:  { group: 'system', icon: '⚠️', label: 'একাউন্ট নোটিশ/সতর্কতা', title: '{title}', body: '{text}', adminSend: true },
  coin_added:      { group: 'system', icon: '🪙', label: 'কয়েন যোগ/অনুমোদন', title: '{title}', body: '{text}', adminSend: true },
  welcome:         { group: 'system', icon: '👋', label: 'স্বাগতম বার্তা', title: '{title}', body: '{text}', adminSend: true },
  // ----- অ্যাডমিন ইনবক্স (শুধু অ্যাডমিন প্যানেলে দেখা যায়) -----
  report_received: { group: 'system', icon: '🚩', label: '[অ্যাডমিন] নতুন রিপোর্ট', title: 'নতুন রিপোর্ট: {text}', body: '{name} রিপোর্ট করেছেন', admin: true },
  payment_request: { group: 'system', icon: '💳', label: '[অ্যাডমিন] কয়েন কেনার রিকোয়েস্ট', title: '{name} {coins} কয়েন চেয়েছেন', body: '{text}', admin: true }
};

export const DEFAULT_SETTINGS = {
  enabled: true, toast: true, browserNotif: true, retentionDays: 30, maxFanout: 300, types: {}, adminEmails: []
};
export const ADMIN_BOX = '__admin__';

// ---------------------------------------------------------------------------
// ছোট সহায়ক ফাংশন
// ---------------------------------------------------------------------------
const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
export function fillTemplate(t, vars) {
  return String(t == null ? '' : t).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : '')).trim();
}
export function timeAgo(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const bn = n => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
  if (s < 45) return 'এইমাত্র';
  if (s < 3600) return bn(Math.floor(s / 60) || 1) + ' মিনিট আগে';
  if (s < 86400) return bn(Math.floor(s / 3600)) + ' ঘণ্টা আগে';
  if (s < 86400 * 30) return bn(Math.floor(s / 86400)) + ' দিন আগে';
  return new Date(ms).toLocaleDateString('bn-BD');
}
const tsMs = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : (v && v.seconds ? v.seconds * 1000 : 0);

// ---------------------------------------------------------------------------
// সেটিং (settings/notifications) — লাইভ
// ---------------------------------------------------------------------------
let settings = Object.assign({}, DEFAULT_SETTINGS);
let settingsLoaded = false;
let settingsResolve;
const settingsReady = new Promise(r => { settingsResolve = r; });
try {
  onSnapshot(doc(db, 'settings', 'notifications'), snap => {
    settings = Object.assign({}, DEFAULT_SETTINGS, snap.exists() ? snap.data() : {});
    settingsLoaded = true; settingsResolve();
    emit();
  }, () => { settingsLoaded = true; settingsResolve(); });
} catch (e) { settingsResolve(); }
setTimeout(() => settingsResolve(), 2500);

// ---------------------------------------------------------------------------
// ইউজারের নিজস্ব পছন্দ (কোন সেকশন/ধরন মিউট) — এই ডিভাইসে সংরক্ষিত
// ---------------------------------------------------------------------------
const LS_MUTE = 'onuNfMuted', LS_SEEN = 'onuNfSeen', LS_HIDE = 'onuNfHidden';
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
export function getMuted() { return lsGet(LS_MUTE, { groups: {}, types: {} }); }
export function setMuted(m) { lsSet(LS_MUTE, m); emit(); }
function isMuted(item) {
  const m = getMuted();
  return !!((m.groups || {})[item.group] || (m.types || {})[item.type]);
}

// ---------------------------------------------------------------------------
// পাঠানো
// ---------------------------------------------------------------------------
function me() { return auth.currentUser; }

async function send(type, o) {
  try {
    o = o || {};
    const T = TYPES[type]; if (!T) return;
    await settingsReady;
    if (settings.enabled === false) return;
    const ts = (settings.types || {})[type] || {};
    if (ts.enabled === false) return;
    const u = me();
    let targets = o.to == null ? [] : (Array.isArray(o.to) ? o.to : [o.to]);
    targets = [...new Set(targets.filter(Boolean))];
    if (u && !T.self) targets = targets.filter(x => x !== u.uid);
    if (!targets.length) return;
    const vars = Object.assign({
      name: o.fromName || (u && (u.displayName || '')) || 'কেউ',
      text: clip(o.text, 120), title: clip(o.title, 80), coins: o.coins != null ? o.coins : ''
    }, o.vars || {});
    const title = fillTemplate(ts.title != null && ts.title !== '' ? ts.title : T.title, vars);
    const body = fillTemplate(ts.body != null ? ts.body : T.body, vars);
    const base = {
      fromUid: u ? u.uid : '', fromName: vars.name, fromPhoto: (u && u.photoURL) || '',
      type, group: T.group, icon: T.icon, title, body, link: o.link || '', ref: o.ref || ''
    };
    const col = collection(db, 'notifications');
    for (const t of targets) {
      const data = Object.assign({}, base, { toUid: t, read: false, createdAt: serverTimestamp() });
      if (T.dedup && u) {
        const id = `${type}_${u.uid}_${o.ref || 'x'}_${t}`.replace(/[\/\s]/g, '_');
        const ref = doc(db, 'notifications', id);
        const ex = await getDoc(ref).catch(() => null);
        if (ex && ex.exists()) continue;
        await setDoc(ref, data);
      } else if (T.collapse && u) {
        const id = `${type}_${u.uid}_${t}`.replace(/[\/\s]/g, '_');
        await setDoc(doc(db, 'notifications', id), Object.assign({}, data, { count: increment(1) }), { merge: true });
      } else if (o.docId) {
        await setDoc(doc(db, 'notifications', o.docId), data);
      } else {
        await addDoc(col, data);
      }
    }
  } catch (e) { console.warn('notify.send', e); }
}

// সাবস্ক্রাইবারদের সবাইকে (পোস্ট/ভিডিও/লাইভ)
async function sendToSubscribers(type, o) {
  try {
    const u = me(); if (!u) return;
    await settingsReady;
    if (settings.enabled === false) return;
    if (((settings.types || {})[type] || {}).enabled === false) return;
    const snap = await getDoc(doc(db, 'publicProfiles', u.uid));
    const subs = (snap.exists() && snap.data().subscribers) || [];
    const cap = Number(settings.maxFanout) || 300;
    const list = subs.filter(x => x && x !== u.uid).slice(-cap);
    if (!list.length) return;
    const T = TYPES[type]; if (!T) return;
    const ts = (settings.types || {})[type] || {};
    const vars = { name: u.displayName || 'কেউ', text: clip(o.text, 120), title: clip(o.title, 80) };
    const title = fillTemplate(ts.title ? ts.title : T.title, vars);
    const body = fillTemplate(ts.body != null ? ts.body : T.body, vars);
    for (let i = 0; i < list.length; i += 400) {
      const b = writeBatch(db);
      list.slice(i, i + 400).forEach(t => {
        const id = `${type}_${o.ref || Date.now()}_${t}`.replace(/[\/\s]/g, '_');
        b.set(doc(db, 'notifications', id), {
          toUid: t, fromUid: u.uid, fromName: vars.name, fromPhoto: u.photoURL || '',
          type, group: T.group, icon: T.icon, title, body, link: o.link || '', ref: o.ref || '',
          read: false, createdAt: serverTimestamp()
        });
      });
      await b.commit();
    }
  } catch (e) { console.warn('notify.fanout', e); }
}

// ---------------------------------------------------------------------------
// ঘটনা-ভিত্তিক সহজ ডাক (পেজগুলো শুধু এগুলোই ডাকে)
// ---------------------------------------------------------------------------
const OnuNotify = {
  send, sendToSubscribers,

  // পোস্ট
  async postReact(postId, type) {
    try {
      if (type === null) return;
      const s = await getDoc(doc(db, 'posts', postId)); if (!s.exists()) return;
      const d = s.data();
      await send('post_react', { to: d.authorUid, ref: postId, text: d.text, link: 'index.html#post-' + postId });
    } catch (e) {}
  },
  async postComment(postId, text, replyToId) {
    try {
      const s = await getDoc(doc(db, 'posts', postId)); if (!s.exists()) return;
      const owner = s.data().authorUid;
      const link = 'index.html#post-' + postId;
      let parentUid = null;
      if (replyToId) {
        const c = await getDoc(doc(db, 'posts', postId, 'comments', replyToId));
        if (c.exists()) parentUid = c.data().uid;
        if (parentUid) await send('comment_reply', { to: parentUid, ref: postId, text, link });
      }
      if (owner && owner !== parentUid) await send('post_comment', { to: owner, ref: postId, text, link });
    } catch (e) {}
  },
  async commentLike(postId, commentId, nowLiked) {
    try {
      if (nowLiked) return; // লাইক সরানোর সময় কিছু হবে না
      const c = await getDoc(doc(db, 'posts', postId, 'comments', commentId)); if (!c.exists()) return;
      await send('comment_like', { to: c.data().uid, ref: commentId, text: c.data().text, link: 'index.html#post-' + postId });
    } catch (e) {}
  },
  async newPost(postId, text) {
    try { await sendToSubscribers('new_post', { ref: postId, text, link: 'index.html#post-' + postId }); } catch (e) {}
  },

  // প্রোফাইল
  async subscribed(targetUid) {
    try {
      const u = me(); if (!u) return;
      await send('new_subscriber', { to: targetUid, ref: targetUid, link: 'profile.html?uid=' + encodeURIComponent(u.uid) });
    } catch (e) {}
  },

  // মেসেজ/কল
  async message(otherUid, kind, text, otherName) {
    try {
      const u = me(); if (!u) return;
      const type = kind === 'voice' ? 'new_voice' : (kind === 'attach' ? 'new_attachment' : 'new_message');
      const link = 'messages.html?uid=' + encodeURIComponent(u.uid) + '&name=' + encodeURIComponent(u.displayName || '') + '&avatar=' + encodeURIComponent(u.photoURL || '');
      await send(type, { to: otherUid, text, link });
    } catch (e) {}
  },
  async missedCall(otherUid, callType) {
    try {
      const u = me(); if (!u) return;
      const link = 'messages.html?uid=' + encodeURIComponent(u.uid) + '&name=' + encodeURIComponent(u.displayName || '') + '&avatar=' + encodeURIComponent(u.photoURL || '');
      await send('missed_call', { to: otherUid, text: callType === 'video' ? 'ভিডিও' : 'অডিও', link });
    } catch (e) {}
  },

  // ভিডিও
  async videoReact(videoId, type) {
    try {
      if (type === null) return;
      const s = await getDoc(doc(db, 'videos', videoId)); if (!s.exists()) return;
      const d = s.data();
      await send('video_react', { to: d.ownerUid, ref: videoId, title: d.title, link: 'video.html?v=' + encodeURIComponent(videoId) });
    } catch (e) {}
  },
  async videoComment(videoId, text, replyToId) {
    try {
      const s = await getDoc(doc(db, 'videos', videoId)); if (!s.exists()) return;
      const owner = s.data().ownerUid;
      const link = 'video.html?v=' + encodeURIComponent(videoId);
      let parentUid = null;
      if (replyToId) {
        const c = await getDoc(doc(db, 'videos', videoId, 'comments', replyToId));
        if (c.exists()) parentUid = c.data().uid;
        if (parentUid) await send('video_reply', { to: parentUid, ref: videoId, text, link });
      }
      if (owner && owner !== parentUid) await send('video_comment', { to: owner, ref: videoId, text, link });
    } catch (e) {}
  },
  async videoCommentLike(videoId, commentId, nowLiked) {
    try {
      if (nowLiked) return;
      const c = await getDoc(doc(db, 'videos', videoId, 'comments', commentId)); if (!c.exists()) return;
      await send('video_comment_like', { to: c.data().uid, ref: commentId, text: c.data().text, link: 'video.html?v=' + encodeURIComponent(videoId) });
    } catch (e) {}
  },
  async videoPublished(videoTitle) {
    try { await sendToSubscribers('video_published', { ref: 'v' + Date.now(), title: videoTitle, link: 'video.html' }); } catch (e) {}
  },

  // লাইভ
  async liveStarted(streamId) {
    try { await sendToSubscribers('live_started', { ref: streamId, link: 'live.html' }); } catch (e) {}
  },
  async liveGift(hostUid, giftName, coins) {
    try { await send('live_gift', { to: hostUid, text: giftName, coins, link: 'live.html' }); } catch (e) {}
  },

  // কুইজ
  async quizReward(coins) {
    try {
      const u = me(); if (!u || !(coins > 0)) return;
      await send('quiz_reward', { to: u.uid, coins, link: 'quiz.html' });
    } catch (e) {}
  },

  // অ্যাডমিনের জন্য (রিপোর্ট / পেমেন্ট রিকোয়েস্ট)
  async toAdmin(type, o) {
    try { await send(type, Object.assign({}, o || {}, { to: ADMIN_BOX })); } catch (e) {}
  },

  // ---- নোটিফিকেশন পেজ ও বেল ব্যাজের জন্য ----
  subscribe(fn) { listeners.add(fn); try { fn(state); } catch (e) {} return () => listeners.delete(fn); },
  get state() { return state; },
  getSettings() { return settings; },
  async markRead(item) {
    try {
      if (item.source === 'all') { const s = new Set(lsGet(LS_SEEN, [])); s.add(item.id); lsSet(LS_SEEN, [...s].slice(-300)); rebuild(); return; }
      await updateDoc(doc(db, 'notifications', item.id), { read: true, count: 0 });
    } catch (e) {}
  },
  async markAllRead(items) {
    try {
      const seen = new Set(lsGet(LS_SEEN, []));
      const mine = [];
      (items || state.items).forEach(it => { if (!it.unread) return; if (it.source === 'all') seen.add(it.id); else mine.push(it); });
      lsSet(LS_SEEN, [...seen].slice(-300));
      for (let i = 0; i < mine.length; i += 400) {
        const b = writeBatch(db);
        mine.slice(i, i + 400).forEach(it => b.update(doc(db, 'notifications', it.id), { read: true, count: 0 }));
        await b.commit();
      }
      rebuild();
    } catch (e) {}
  },
  async remove(item) {
    try {
      if (item.source === 'all') { const h = new Set(lsGet(LS_HIDE, [])); h.add(item.id); lsSet(LS_HIDE, [...h].slice(-300)); rebuild(); return; }
      await deleteDoc(doc(db, 'notifications', item.id));
    } catch (e) {}
  },
  async removeMany(items) {
    try {
      const h = new Set(lsGet(LS_HIDE, [])); const mine = [];
      items.forEach(it => { if (it.source === 'all') h.add(it.id); else mine.push(it); });
      lsSet(LS_HIDE, [...h].slice(-300));
      for (let i = 0; i < mine.length; i += 400) {
        const b = writeBatch(db);
        mine.slice(i, i + 400).forEach(it => b.delete(doc(db, 'notifications', it.id)));
        await b.commit();
      }
      rebuild();
    } catch (e) {}
  },
  // খুলে দেখার সময় নিজের পুরোনো নোটিফিকেশন মুছে ফেলা (ধরে রাখার দিন অ্যাডমিন সেটিং থেকে)
  async pruneMine() {
    try {
      const days = Number(settings.retentionDays) || 30;
      const cutoff = Date.now() - days * 86400000;
      const old = state.items.filter(it => it.source !== 'all' && it.ms && it.ms < cutoff).slice(0, 200);
      if (!old.length) return;
      const b = writeBatch(db);
      old.forEach(it => b.delete(doc(db, 'notifications', it.id)));
      await b.commit();
    } catch (e) {}
  },
  async requestBrowserPermission() {
    try { if ('Notification' in window) return await Notification.requestPermission(); } catch (e) {}
    return 'denied';
  },
  timeAgo, GROUPS, TYPES
};

// ---------------------------------------------------------------------------
// লাইভ শোনা: আমার নোটিফিকেশন + সবার জন্য ঘোষণা
// ---------------------------------------------------------------------------
const state = { user: null, items: [], unread: 0, unreadMsg: 0, byGroup: {}, loading: true };
const listeners = new Set();
const ON_MESSAGES_PAGE = /\/messages(\.html)?\/?$/i.test(location.pathname);
let mineDocs = [], allDocs = [], unsubMine = null, unsubAll = null, firstMine = true, firstAll = true;

function emit() { listeners.forEach(fn => { try { fn(state); } catch (e) {} }); paintBadges(); }

function rebuild() {
  const seen = new Set(lsGet(LS_SEEN, [])), hidden = new Set(lsGet(LS_HIDE, []));
  const items = [];
  mineDocs.forEach(d => {
    const x = d.data();
    if (x.type && TYPES[x.type] && TYPES[x.type].admin) return;
    items.push(Object.assign({ id: d.id, source: 'user' }, x, { ms: tsMs(x.createdAt) || Date.now(), unread: x.read === false }));
  });
  allDocs.forEach(d => {
    if (hidden.has(d.id)) return;
    const x = d.data();
    items.push(Object.assign({ id: d.id, source: 'all' }, x, { ms: tsMs(x.createdAt) || Date.now(), unread: !seen.has(d.id) }));
  });
  items.sort((a, b) => b.ms - a.ms);
  state.items = items;
  const vis = items.filter(it => !isMuted(it));
  // বেলের সংখ্যা: মেসেজ ছাড়া বাকি নোটিফিকেশন; মেসেজের সংখ্যা আলাদা (হোমের মেসেজ বাটনের জন্য)
  state.unread = vis.filter(it => it.unread && it.group !== 'message').length;
  const bg = {};
  vis.forEach(it => { if (it.unread) bg[it.group] = (bg[it.group] || 0) + 1; });
  state.byGroup = bg;
  state.unreadMsg = bg.message || 0;
  state.loading = false;
  emit();
  // মেসেজ পেজে ঢুকলেই মেসেজের নতুন নোটিফিকেশন সাথে সাথে পড়া হয়ে যায়
  if (ON_MESSAGES_PAGE && state.unreadMsg > 0) {
    const fresh = items.filter(it => it.unread && it.group === 'message');
    setTimeout(() => { try { OnuNotify.markAllRead(fresh); } catch (e) {} }, 0);
  }
}

function startListening(u) {
  if (unsubMine) { unsubMine(); unsubMine = null; }
  if (unsubAll) { unsubAll(); unsubAll = null; }
  mineDocs = []; allDocs = []; firstMine = true; firstAll = true;
  state.user = u || null;
  if (!u) { state.items = []; state.unread = 0; state.unreadMsg = 0; state.byGroup = {}; state.loading = false; emit(); return; }
  state.loading = true;
  unsubMine = onSnapshot(query(collection(db, 'notifications'), where('toUid', '==', u.uid)), snap => {
    mineDocs = snap.docs;
    if (!firstMine) snap.docChanges().forEach(ch => { if (ch.type === 'added' || ch.type === 'modified') popup(ch.doc); });
    firstMine = false; rebuild();
  }, e => { console.warn('notify listen', e); state.loading = false; emit(); });
  unsubAll = onSnapshot(query(collection(db, 'notifications'), where('toUid', '==', 'all'), limit(60)), snap => {
    allDocs = snap.docs;
    if (!firstAll) snap.docChanges().forEach(ch => { if (ch.type === 'added') popup(ch.doc); });
    firstAll = false; rebuild();
  }, () => {});
}
onAuthStateChanged(auth, startListening);

// ---------------------------------------------------------------------------
// পপআপ (পেজ খোলা থাকলে) + ব্রাউজার নোটিফিকেশন (ট্যাব লুকানো থাকলে)
// ---------------------------------------------------------------------------
function popup(d) {
  try {
    const x = d.data();
    if (!x || x.read === true) return;
    const ms = tsMs(x.createdAt);
    if (ms && Date.now() - ms > 120000) return;
    const item = { group: x.group, type: x.type };
    if (isMuted(item)) return;
    if (/notifications\.html$/.test(location.pathname)) return;
    if (settings.toast !== false) showToast(x);
    if (settings.browserNotif !== false && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(x.title || 'নোটিফিকেশন', { body: x.body || '', icon: x.fromPhoto || undefined, tag: d.id });
      n.onclick = () => { window.focus(); if (x.link) location.href = x.link; n.close(); };
    }
  } catch (e) {}
}
let toastTimer = null;
function showToast(x) {
  let el = document.getElementById('onuToast');
  if (!el) {
    el = document.createElement('div'); el.id = 'onuToast'; el.className = 'onuToast';
    el.innerHTML = '<span class="onuToastIcon"></span><span class="onuToastText"><b></b><i></i></span><button type="button" class="onuToastX" aria-label="বন্ধ">✕</button>';
    document.body.appendChild(el);
    el.querySelector('.onuToastX').addEventListener('click', ev => { ev.stopPropagation(); el.classList.remove('show'); });
  }
  el.querySelector('.onuToastIcon').textContent = x.icon || '🔔';
  el.querySelector('b').textContent = x.title || '';
  el.querySelector('i').textContent = x.body || '';
  el.onclick = () => { el.classList.remove('show'); try { sessionStorage.setItem('onuNfFrom', location.href); } catch (e) {} location.href = x.link || 'notifications.html'; };
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

// ---------------------------------------------------------------------------
// বেল আইকনের ব্যাজ ও স্টাইল (সব পেজে একই, শুধু কালো-সাদা)
// ---------------------------------------------------------------------------
function injectCss() {
  if (document.getElementById('onuNfCss')) return;
  const st = document.createElement('style'); st.id = 'onuNfCss';
  st.textContent = `
.onuBell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:transparent;border:1px solid var(--line,rgba(128,128,128,.4));color:var(--text-color,#fff);text-decoration:none;cursor:pointer;flex:0 0 auto;padding:0;-webkit-tap-highlight-color:transparent;z-index:5}
.onuBell:active{background:var(--surface-active,rgba(128,128,128,.25))}
.onuBell.abs{position:absolute;right:14px;top:50%;transform:translateY(-50%)}
.onuBell.absL{position:absolute;left:58px;top:50%;transform:translateY(-50%)}
.onuBell svg{display:block}
a.onuBell.onuNew{background:#16a34a!important;border-color:#16a34a!important;color:#fff!important}
a.onuBell.onuNew:active{background:#15803d!important}
a.onuMsgNew{color:#22c55e!important;box-shadow:inset 0 0 0 1px #22c55e!important}
a.onuMsgNew *{color:#22c55e!important}
.onuMsgCnt{color:#22c55e!important;font-weight:700;margin-left:4px}
.onuBadge{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--text-color,#fff);color:var(--bg-color,#000);border:2px solid var(--bg-color,#000);font-size:10px;font-weight:700;line-height:13px;text-align:center;box-sizing:border-box;display:none}
#headerCenter:not(.inbox) ~ .onuBell.absL{display:none}
.onuToast{position:fixed;left:50%;top:10px;transform:translate(-50%,-160%);width:min(92vw,420px);box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:14px;background:var(--bg-color,#000);color:var(--text-color,#fff);border:1px solid var(--text-color,#fff);box-shadow:0 6px 24px rgba(0,0,0,.35);z-index:2147483000;cursor:pointer;transition:transform .35s ease;font-family:inherit}
.onuToast.show{transform:translate(-50%,0)}
.onuToastIcon{font-size:22px;flex:0 0 auto}
.onuToastText{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.onuToastText b{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.onuToastText i{font-style:normal;font-size:12px;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.onuToastX{background:none;border:0;color:inherit;font-size:14px;cursor:pointer;padding:4px;flex:0 0 auto}`;
  document.head.appendChild(st);
}
function paintBadges() {
  const n = state.unread;
  document.querySelectorAll('.onuBell').forEach(a => a.classList.toggle('onuNew', n > 0));
  document.querySelectorAll('.onuBadge').forEach(b => {
    const t = n > 99 ? '99+' : String(n);
    if (b.textContent !== t) b.textContent = t;
    b.style.display = n > 0 ? 'block' : 'none';
  });
  paintMsgButtons();
}
function bnDigits(x) { return String(x).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]); }
// হোমের মেনুর "Messages" ও "Notifications" বাটন: নতুন কিছু থাকলে সবুজ + সবুজ (সংখ্যা), না থাকলে কিছুই না
// বাটন চেনা হয় লিংক (messages / notifications) অথবা বাটনের লেখা দেখে
const MSG_LABELS = ['messages', 'message', 'মেসেজ', 'মেসেজ ও কল'];
const NF_LABELS = ['notifications', 'notification', 'নোটিফিকেশন', 'নোটিফিকেশনসমূহ', 'নোটিফিকেশন সমূহ'];
function menuKind(a) {
  if (a.classList.contains('onuBell') || a.closest('.item') || a.closest('.onuToast')) return null;
  if (a.hasAttribute('data-onu-msg')) return 'msg';
  if (a.hasAttribute('data-onu-nf')) return 'nf';
  const h = (a.getAttribute('href') || '').split('#')[0].split('?')[0];
  if (/^(\.\/|\/)?messages(\.html)?\/?$/i.test(h)) return 'msg';
  if (/^(\.\/|\/)?notifications(\.html)?\/?$/i.test(h)) return 'nf';
  const label = Array.from(a.childNodes).filter(x => x.nodeType === 3).map(x => x.textContent).join('').trim().toLowerCase();
  if (MSG_LABELS.includes(label)) return 'msg';
  if (NF_LABELS.includes(label)) return 'nf';
  return null;
}
function paintMsgButtons() {
  document.querySelectorAll('a').forEach(a => {
    const kind = menuKind(a);
    if (!kind) return;
    const n = kind === 'msg' ? (state.unreadMsg || 0) : (state.unread || 0);
    a.classList.toggle('onuMsgNew', n > 0);
    let c = null;
    for (const k of a.children) if (k.classList && k.classList.contains('onuMsgCnt')) { c = k; break; }
    if (n > 0) {
      const t = '(' + n + ')';
      if (!c) { c = document.createElement('span'); c.className = 'onuMsgCnt'; a.appendChild(c); }
      if (c.textContent !== t) c.textContent = t;
    } else if (c) c.remove();
  });
}
let paintTimer = null;
function wireBells() {
  document.querySelectorAll('.onuBell').forEach(a => {
    if (a.dataset.onuWired) return;
    a.dataset.onuWired = '1';
    a.addEventListener('click', () => { try { sessionStorage.setItem('onuNfFrom', location.href); } catch (e) {} });
  });
  paintBadges();
}
injectCss();
// মেনু আবার আঁকা হলে (index.html) বাটনের সংখ্যা ও রং ফিরিয়ে আনতে
try { new MutationObserver(() => { clearTimeout(paintTimer); paintTimer = setTimeout(paintBadges, 120); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireBells); else wireBells();

window.OnuNotify = OnuNotify;
export { OnuNotify, db, auth, tsMs, clip };

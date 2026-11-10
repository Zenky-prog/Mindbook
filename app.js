import { auth, db, configured } from "./firebase.js";
import { LOGO } from "./logo.js";
import {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, query, where, orderBy, onSnapshot, addDoc, doc, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove, increment, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $app = document.getElementById("app");
const MAX = 280;

let user = null;
let appToken = 0;
let view = "feed";
let unsubs = [];
let posts = [];
let myFriends = [];
let incoming = [];
let outgoing = [];
const profiles = new Map();
const adding = new Set();
const openComments = new Set();
const commentUnsubs = new Map();
const commentsByPost = new Map();

/* ---------- أدوات صغيرة ---------- */
const ERR = {
  "auth/invalid-email": "اسم المستخدم مش صالح",
  "auth/missing-password": "اكتب الباسورد",
  "auth/weak-password": "الباسورد ضعيف (6 حروف على الأقل)",
  "auth/email-already-in-use": "اسم المستخدم ده مأخوذ، جرّب غيره",
  "auth/invalid-credential": "اسم المستخدم أو الباسورد غلط",
  "auth/user-not-found": "اسم المستخدم أو الباسورد غلط",
  "auth/wrong-password": "اسم المستخدم أو الباسورد غلط",
  "auth/too-many-requests": "محاولات كتير، استنى شوية",
  "auth/popup-closed-by-user": "",
  "auth/cancelled-popup-request": "",
  "auth/network-request-failed": "مشكلة في الإنترنت",
  "permission-denied": "مش مسموحلك بالعملية دي",
};
const errMsg = e => ERR[e?.code] ?? "حصلت مشكلة، حاول تاني";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const myUsername = () => (user?.email || "").split("@")[0];
const displayName = u => u.displayName || (u.email ? u.email.split("@")[0] : "مستخدم");
const avatar = name => `<div class="avatar">${esc((name || "?")[0])}</div>`;

function ago(ts) {
  if (!ts) return "دلوقتي";
  const s = Math.floor((Date.now() - ts.toDate().getTime()) / 1000);
  if (s < 60) return "دلوقتي";
  if (s < 3600) return Math.floor(s / 60) + " د";
  if (s < 86400) return Math.floor(s / 3600) + " س";
  return Math.floor(s / 86400) + " يوم";
}

function toast(msg) {
  if (!msg) return;
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove("show"), 3000);
}

function teardown() {
  appToken++;
  unsubs.forEach(u => u()); unsubs = [];
  commentUnsubs.forEach(u => u());
  commentUnsubs.clear(); commentsByPost.clear(); openComments.clear();
  posts = []; myFriends = []; incoming = []; outgoing = [];
  profiles.clear(); adding.clear();
  view = "feed";
}

/* ---------- شاشة الإعداد (لو Firebase لسه متظبطش) ---------- */
function showSetup() {
  $app.innerHTML = `
    <div class="setup card">
      <h2 class="grad">Mindbook: باقي خطوة الإعداد</h2>
      <p>افتح الملف <code>firebase.js</code> والصق إعدادات مشروعك من Firebase بدل القيم اللي شكلها <code>YOUR_...</code>.</p>
      <p>الخطوات كاملة في ملف <code>README.md</code>.</p>
    </div>`;
}

/* ---------- شاشة الدخول (اسم مستخدم + باسورد) ---------- */
// Firebase بيشتغل بالإيميل، فبنحوّل اسم المستخدم لإيميل داخلي شكله ثابت.
// الإيميل ده مش حقيقي ومفيش رسائل بتتبعت عليه.
const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
const toEmail = u => u.toLowerCase() + "@mindbook.example.com";

function showAuth(mode = "login") {
  teardown();
  const signup = mode === "signup";
  $app.innerHTML = `
    <div class="auth">
      ${LOGO}
      <h2 class="grad">Mindbook</h2>
      <p>شارك أفكارك، ونوّر عقول غيرك</p>
      <form id="authForm" class="card">
        <input type="text" id="username" placeholder="اسم المستخدم (إنجليزي وأرقام)" maxlength="20"
               required autocapitalize="none" autocorrect="off" autocomplete="username" dir="ltr">
        ${signup ? `<input type="text" id="name" placeholder="الاسم الظاهر (اختياري)" maxlength="30">` : ""}
        <input type="password" id="pass" placeholder="الباسورد" required minlength="6"
               autocomplete="${signup ? "new-password" : "current-password"}">
        <button type="submit" id="submitBtn">${signup ? "إنشاء حساب" : "دخول"}</button>
        <div class="switch">${signup ? "عندك حساب؟" : "مفيش حساب؟"}
          <a href="#" id="switch">${signup ? "سجّل دخول" : "أنشئ حساب"}</a></div>
      </form>
    </div>`;

  document.getElementById("switch").onclick = e => { e.preventDefault(); showAuth(signup ? "login" : "signup"); };

  document.getElementById("authForm").onsubmit = async e => {
    e.preventDefault();
    const username = document.getElementById("username").value.trim();
    const pass = document.getElementById("pass").value;
    if (!USERNAME_RE.test(username)) {
      toast("اسم المستخدم: حروف إنجليزي وأرقام و _ فقط، من 3 لـ 20 حرف");
      return;
    }
    const btn = document.getElementById("submitBtn");
    btn.disabled = true;
    try {
      if (signup) {
        const name = document.getElementById("name").value.trim() || username;
        const cred = await createUserWithEmailAndPassword(auth, toEmail(username), pass);
        await updateProfile(cred.user, { displayName: name });
        showApp(); // نعيد الرسم عشان الاسم الظاهر يتحدّث
      } else {
        await signInWithEmailAndPassword(auth, toEmail(username), pass);
      }
    } catch (err) {
      toast(errMsg(err));
    } finally {
      btn.disabled = false;
    }
  };
}

/* ---------- تجهيز بيانات المستخدم في قاعدة البيانات ---------- */
async function ensureProfile(u) {
  const name = displayName(u);
  const uref = doc(db, "users", u.uid);
  const fref = doc(db, "friendLists", u.uid);
  const [us, fs] = await Promise.all([getDoc(uref), getDoc(fref)]);
  if (!us.exists()) {
    await setDoc(uref, { username: (u.email || "").split("@")[0], displayName: name, createdAt: serverTimestamp() });
  } else if (us.data().displayName !== name) {
    await updateDoc(uref, { displayName: name });
  }
  if (!fs.exists()) await setDoc(fref, { friends: [] });
}

/* ---------- التطبيق الرئيسي ---------- */
async function showApp() {
  teardown();
  const token = appToken;
  user = auth.currentUser;
  if (!user) return showAuth();
  try { await ensureProfile(user); } catch (err) { toast(errMsg(err)); }
  if (token !== appToken) return; // اتفتحت شاشة تانية في الأثناء

  $app.innerHTML = `
    <header>
      <div class="brand">${LOGO}<h1 class="grad">Mindbook</h1></div>
      <span class="who">${esc(displayName(user))} · <a href="#" id="logout">خروج</a></span>
    </header>
    <nav class="tabs">
      <button class="tab on" data-view="feed">الرئيسية</button>
      <button class="tab" data-view="friends">الأصدقاء <span class="badge" id="badge" hidden></span></button>
    </nav>
    <main id="main"></main>`;

  document.getElementById("logout").onclick = e => { e.preventDefault(); signOut(auth); };

  document.querySelectorAll(".tab").forEach(t => {
    t.onclick = () => {
      view = t.dataset.view;
      document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x === t));
      renderMain();
    };
  });

  const main = document.getElementById("main");
  main.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.act) onFeedClick(b);
    else if (b.dataset.fact) onFriendAction(b);
    else if (b.id === "addFriend") sendRequest(document.getElementById("friendName").value);
  });
  main.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    if (e.target.matches("input[data-draft]")) sendComment(e.target.closest(".card"));
    else if (e.target.id === "friendName") sendRequest(e.target.value);
  });

  startListeners();
  renderMain();
}

function startListeners() {
  const uid = user.uid;
  const fail = err => toast(errMsg(err));

  unsubs.push(onSnapshot(doc(db, "friendLists", uid), s => {
    myFriends = s.data()?.friends ?? [];
    loadProfiles(myFriends);
    if (view === "feed") renderFeed(); else renderFriends();
  }, fail));

  // بنجيب بوستات اللي أنا في الـ audience بتاعها، وبنرتبها هنا عند الجهاز
  unsubs.push(onSnapshot(query(collection(db, "posts"), where("audience", "array-contains", uid)), snap => {
    const t = p => p.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    posts = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => t(b) - t(a));
    if (view === "feed") renderFeed();
  }, fail));

  unsubs.push(onSnapshot(query(collection(db, "requests"), where("to", "==", uid)), snap => {
    incoming = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    reconcile(); updateBadge();
    if (view === "friends") renderFriends();
  }, fail));

  unsubs.push(onSnapshot(query(collection(db, "requests"), where("from", "==", uid)), snap => {
    outgoing = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    reconcile();
    if (view === "friends") renderFriends();
  }, fail));
}

// لما حد يقبل طلبي، بضيفه في قائمة أصدقائي أنا كمان
function reconcile() {
  const want = [
    ...outgoing.filter(r => r.status === "accepted").map(r => r.to),
    ...incoming.filter(r => r.status === "accepted").map(r => r.from),
  ];
  want.forEach(f => {
    if (myFriends.includes(f) || adding.has(f)) return;
    adding.add(f);
    updateDoc(doc(db, "friendLists", user.uid), { friends: arrayUnion(f) })
      .catch(() => {})
      .finally(() => adding.delete(f));
  });
}

function updateBadge() {
  const el = document.getElementById("badge");
  if (!el) return;
  const n = incoming.filter(r => r.status === "pending").length;
  el.textContent = n;
  el.hidden = n === 0;
}

async function loadProfiles(uids) {
  const need = uids.filter(u => !profiles.has(u));
  if (!need.length) return;
  await Promise.all(need.map(async u => {
    try {
      const s = await getDoc(doc(db, "users", u));
      profiles.set(u, s.exists() ? s.data() : { displayName: "مستخدم", username: "" });
    } catch { profiles.set(u, { displayName: "مستخدم", username: "" }); }
  }));
  if (view === "friends") renderFriends();
}

function renderMain() {
  if (view === "friends") { renderFriends(); return; }

  document.getElementById("main").innerHTML = `
    <div class="card">
      <textarea id="postText" placeholder="إيه اللي في عقلك يا ${esc(displayName(user))}؟" maxlength="${MAX}"></textarea>
      <div class="row">
        <span class="count" id="count">0/${MAX}</span>
        <button id="postBtn" disabled>نشر</button>
      </div>
    </div>
    <div id="feed"></div>`;

  const ta = document.getElementById("postText");
  const btn = document.getElementById("postBtn");
  ta.oninput = () => {
    document.getElementById("count").textContent = ta.value.length + "/" + MAX;
    btn.disabled = !ta.value.trim();
  };
  btn.onclick = async () => {
    const text = ta.value.trim();
    if (!text) return;
    btn.disabled = true;
    try {
      await addDoc(collection(db, "posts"), {
        uid: user.uid, author: displayName(user), text,
        createdAt: serverTimestamp(), likes: [], commentCount: 0,
        audience: [user.uid, ...myFriends], // أنا وأصدقائي وقت النشر
      });
      ta.value = "";
      document.getElementById("count").textContent = "0/" + MAX;
    } catch (err) {
      toast(errMsg(err));
      btn.disabled = false;
    }
  };
  renderFeed();
}

/* ---------- الرئيسية ---------- */
function renderFeed() {
  const $feed = document.getElementById("feed");
  if (!$feed) return;

  // نحفظ اللي المستخدم بيكتبه في خانات التعليق عشان ما يضيعش مع التحديث
  const drafts = {};
  $feed.querySelectorAll("input[data-draft]").forEach(i => { drafts[i.dataset.draft] = i.value; });
  const active = document.activeElement;
  const focusId = active?.matches?.("input[data-draft]") ? active.dataset.draft : null;

  // بوستاتي وبوستات أصحابي بس
  const visible = posts.filter(p => p.uid === user.uid || myFriends.includes(p.uid));

  if (!visible.length) {
    $feed.innerHTML = `<div class="empty">${myFriends.length
      ? "لسه مفيش أفكار. شارك أول واحدة!"
      : "لسه مفيش أفكار. شارك أول واحدة، وضيف أصدقاء من تبويب «الأصدقاء» عشان تشوف أفكارهم."}</div>`;
    return;
  }

  $feed.innerHTML = visible.map(p => {
    const likes = p.likes ?? [];
    const liked = likes.includes(user.uid);
    const open = openComments.has(p.id);
    const comments = commentsByPost.get(p.id) ?? [];
    return `
    <div class="card" data-id="${esc(p.id)}">
      <div class="meta">
        ${avatar(p.author)}
        <div><div class="name">${esc(p.author)}</div><div class="time">${ago(p.createdAt)}</div></div>
      </div>
      <div class="text">${esc(p.text)}</div>
      <div class="actions">
        <button class="ghost ${liked ? "on" : ""}" data-act="like">💡 ${likes.length}</button>
        <button class="ghost" data-act="comments">💬 ${p.commentCount ?? 0}</button>
        ${p.uid === user.uid ? `<button class="ghost del" data-act="delete">🗑️ حذف</button>` : ""}
      </div>
      ${open ? `
      <div class="comments">
        ${comments.map(c => `
          <div class="comment">
            <span><b>${esc(c.author)}</b>${esc(c.text)}</span>
            ${c.uid === user.uid ? `<button data-act="delComment" data-cid="${esc(c.id)}" title="حذف">✕</button>` : ""}
          </div>`).join("")}
        <div class="row">
          <input type="text" placeholder="اكتب تعليق..." maxlength="140" data-draft="${esc(p.id)}">
          <button data-act="addComment">إرسال</button>
        </div>
      </div>` : ""}
    </div>`;
  }).join("");

  $feed.querySelectorAll("input[data-draft]").forEach(i => { if (drafts[i.dataset.draft]) i.value = drafts[i.dataset.draft]; });
  if (focusId) {
    const el = $feed.querySelector(`input[data-draft="${focusId}"]`);
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }
}

async function onFeedClick(b) {
  const card = b.closest(".card");
  const id = card.dataset.id;
  const ref = doc(db, "posts", id);
  try {
    switch (b.dataset.act) {
      case "like": {
        const p = posts.find(x => x.id === id);
        const liked = (p.likes ?? []).includes(user.uid);
        await updateDoc(ref, { likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
        break;
      }
      case "comments":
        toggleComments(id);
        break;
      case "delete":
        if (!confirm("تحذف البوست؟")) return;
        closeComments(id);
        await deleteDoc(ref);
        break;
      case "addComment":
        await sendComment(card);
        break;
      case "delComment": {
        const batch = writeBatch(db);
        batch.delete(doc(db, "posts", id, "comments", b.dataset.cid));
        batch.update(ref, { commentCount: increment(-1) });
        await batch.commit();
        break;
      }
    }
  } catch (err) {
    toast(errMsg(err));
  }
}

function toggleComments(id) {
  if (openComments.has(id)) { closeComments(id); renderFeed(); return; }
  openComments.add(id);
  const q = query(collection(db, "posts", id, "comments"), orderBy("createdAt", "asc"));
  commentUnsubs.set(id, onSnapshot(q, snap => {
    commentsByPost.set(id, snap.docs.map(d => ({ id: d.id, ...d.data() })));
    if (view === "feed") renderFeed();
  }, err => toast(errMsg(err))));
  renderFeed();
}

function closeComments(id) {
  commentUnsubs.get(id)?.();
  commentUnsubs.delete(id); commentsByPost.delete(id); openComments.delete(id);
}

async function sendComment(card) {
  const id = card.dataset.id;
  const input = card.querySelector("input[data-draft]");
  const text = input?.value.trim();
  if (!text) return;
  input.value = "";
  try {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "posts", id, "comments")), {
      uid: user.uid, author: displayName(user), text, createdAt: serverTimestamp(),
    });
    batch.update(doc(db, "posts", id), { commentCount: increment(1) });
    await batch.commit();
  } catch (err) {
    input.value = text;
    toast(errMsg(err));
  }
}

/* ---------- الأصدقاء ---------- */
function renderFriends() {
  const main = document.getElementById("main");
  if (!main || view !== "friends") return;

  const kept = document.getElementById("friendName")?.value ?? "";
  const hadFocus = document.activeElement?.id === "friendName";
  const inPending = incoming.filter(r => r.status === "pending");
  const outPending = outgoing.filter(r => r.status === "pending");

  const item = (name, sub, buttons) => `
    <div class="item">
      ${avatar(name)}
      <div class="grow"><div class="name">${esc(name)}</div><div class="time">${sub ? "@" + esc(sub) : ""}</div></div>
      ${buttons}
    </div>`;

  main.innerHTML = `
    <div class="card">
      <h3>إضافة صديق</h3>
      <div class="row">
        <input type="text" id="friendName" dir="ltr" placeholder="اسم المستخدم" maxlength="20"
               autocapitalize="none" autocorrect="off">
        <button id="addFriend">إرسال طلب</button>
      </div>
    </div>

    ${inPending.length ? `<div class="card"><h3>طلبات واردة</h3>
      ${inPending.map(r => item(r.fromName, r.fromUsername,
        `<button data-fact="accept" data-id="${esc(r.id)}">قبول</button>
         <button class="ghost" data-fact="decline" data-id="${esc(r.id)}">رفض</button>`)).join("")}
    </div>` : ""}

    ${outPending.length ? `<div class="card"><h3>طلبات مرسلة</h3>
      ${outPending.map(r => item(r.toName, r.toUsername,
        `<button class="ghost" data-fact="cancel" data-id="${esc(r.id)}">إلغاء</button>`)).join("")}
    </div>` : ""}

    <div class="card"><h3>أصدقائي (${myFriends.length})</h3>
      ${myFriends.length ? myFriends.map(f => {
        const p = profiles.get(f);
        return item(p?.displayName ?? "...", p?.username ?? "",
          `<button class="ghost del" data-fact="unfriend" data-id="${esc(f)}">حذف</button>`);
      }).join("") : `<div class="empty small">لسه معندكش أصدقاء. ابعت طلب باسم المستخدم.</div>`}
    </div>`;

  const input = document.getElementById("friendName");
  input.value = kept;
  if (hadFocus) { input.focus(); input.setSelectionRange(kept.length, kept.length); }
}

async function sendRequest(raw) {
  const uname = (raw || "").trim().toLowerCase().replace(/^@/, "");
  if (!USERNAME_RE.test(uname)) return toast("اكتب اسم مستخدم صحيح (إنجليزي وأرقام)");
  try {
    const snap = await getDocs(query(collection(db, "users"), where("username", "==", uname)));
    if (snap.empty) return toast("مفيش مستخدم بالاسم ده");
    const other = snap.docs[0];
    const oid = other.id;
    if (oid === user.uid) return toast("ده حسابك إنت 😄");
    if (myFriends.includes(oid)) return toast("هو صديقك بالفعل");
    if (incoming.some(r => r.from === oid && r.status === "pending"))
      return toast("هو باعتلك طلب، اقبله من الطلبات الواردة");
    if (outgoing.some(r => r.to === oid)) return toast("الطلب اتبعت قبل كده");

    await setDoc(doc(db, "requests", `${user.uid}_${oid}`), {
      from: user.uid, to: oid,
      fromName: displayName(user), fromUsername: myUsername(),
      toName: other.data().displayName, toUsername: uname,
      status: "pending", createdAt: serverTimestamp(),
    });
    const input = document.getElementById("friendName");
    if (input) input.value = "";
    toast("اتبعت الطلب ✅");
  } catch (err) {
    toast(errMsg(err));
  }
}

async function onFriendAction(b) {
  const id = b.dataset.id;
  try {
    switch (b.dataset.fact) {
      case "accept": {
        const r = incoming.find(x => x.id === id);
        if (!r) return;
        const batch = writeBatch(db);
        batch.update(doc(db, "requests", id), { status: "accepted" });
        batch.update(doc(db, "friendLists", user.uid), { friends: arrayUnion(r.from) });
        await batch.commit();
        toast("بقيتوا أصدقاء 🎉");
        break;
      }
      case "decline":
      case "cancel":
        await deleteDoc(doc(db, "requests", id));
        break;
      case "unfriend": {
        if (!confirm("تحذف الصديق ده؟")) return;
        // نمسح الطلبات الأول (لو لسه موجودة)، وبعدين نشيله من القائمة
        const mine = [...incoming, ...outgoing].filter(r => r.from === id || r.to === id);
        for (const r of mine) await deleteDoc(doc(db, "requests", r.id));
        await updateDoc(doc(db, "friendLists", user.uid), { friends: arrayRemove(id) });
        break;
      }
    }
  } catch (err) {
    toast(errMsg(err));
  }
}

/* ---------- التشغيل ---------- */
if (!configured) showSetup();
else onAuthStateChanged(auth, u => (u ? showApp() : showAuth()));

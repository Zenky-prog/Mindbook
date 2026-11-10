# Mindbook

شارك أفكارك، ونوّر عقول غيرك. تطبيق تواصل مصغّر: حسابات حقيقية، بوستات لحظية، 💡 لايك، وتعليقات.

**التقنيات:** HTML + CSS + JavaScript (من غير build)، و Firebase (Authentication + Firestore).

## هيكل المشروع

```
mindbook/
├── index.html      الصفحة الرئيسية
├── style.css       التصميم
├── app.js          منطق التطبيق والواجهة
├── firebase.js     إعدادات Firebase
├── logo.js         الشعار (للكود)
├── logo.svg        الشعار (ملف مستقل)
├── firestore.rules قواعد الأمان
└── README.md
```

## الإعداد (مرة واحدة)

1. **أنشئ مشروع** على [Firebase Console](https://console.firebase.google.com) باسم Mindbook.
2. **فعّل تسجيل الدخول:** Build ← Authentication ← Get started ← Sign-in method، وفعّل **Email/Password** بس (التطبيق بيدخّل المستخدمين باسم مستخدم وباسورد، وبيحوّل الاسم داخلياً لإيميل وهمي).
3. **أنشئ قاعدة البيانات:** Build ← Firestore Database ← Create database (اختار أقرب منطقة).
4. **الصق قواعد الأمان:** Firestore ← Rules، امسح اللي موجود والصق محتوى `firestore.rules`، ثم Publish.
5. **سجّل تطبيق ويب:** Project settings (علامة الترس) ← Your apps ← أيقونة `</>` ← سمّيه ← انسخ كائن `firebaseConfig`.
6. **الصقه** في `firebase.js` بدل القيم اللي شكلها `YOUR_...` (الحقول الأربعة: apiKey و authDomain و projectId و appId).

## التشغيل المحلي

لازم يتفتح من سيرفر مش بالضغط المزدوج على الملف (عشان الـ ES modules):

```
python3 -m http.server 8000
```

وافتح `http://localhost:8000`.

## النشر على GitHub Pages

1. ارفع كل الملفات على ريبو `mindbook`.
2. Settings ← Pages ← Source: **Deploy from a branch** ← `main` / root.
3. هيطلعلك لينك زي `https://USERNAME.github.io/mindbook/`.
4. **مهم:** في Firebase ← Authentication ← Settings ← **Authorized domains** ← Add domain، وضيف `USERNAME.github.io`، وإلا تسجيل الدخول مش هيشتغل على الموقع المنشور.

## ملاحظات أمان

- مفتاح `apiKey` في الكود الأمامي مش سري، الحماية الفعلية من `firestore.rules`.
- القواعد بتمنع: الكتابة من غير تسجيل دخول، انتحال هوية مستخدم تاني، تعديل أو حذف بوست غيرك، وبوستات أطول من 280 حرف.
- مفيش استرجاع للباسورد لأن مفيش إيميل حقيقي. لو حد نسي باسورده لازم تعمله حساب جديد (أو تمسح حسابه من Firebase Console).
- نظام الأصدقاء: طلب وقبول من الطرفين، والبوست بيظهر لأصحاب صاحبه وقت النشر بس. حذف صديق بيخفي بوستاته عنك، لكن الطرف التاني ممكن لسه يشوفك في قائمته.
- البوستات القديمة (قبل نظام الأصدقاء) مش هتظهر.
- عداد التعليقات (`commentCount`) ممكن مستخدم متمرس يغيّره بمقدار ±1، وده تأثيره شكلي بس. للحماية الكاملة محتاج Cloud Functions.
- حذف بوست بيسيب تعليقاته في قاعدة البيانات من غير ما تظهر. تنضيفها يتم بـ Cloud Functions أو يدوي.

## خطوات جاية مقترحة

- صور الأفكار والبروفايل (Firebase Storage)
- متابعة المستخدمين وصفحة شخصية
- إشعارات
- تحميل المزيد من البوستات (pagination)

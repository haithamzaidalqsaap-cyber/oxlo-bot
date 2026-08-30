# OXLO Notify Bot

بوت Telegram لإشعارات OXLO الفورية.

**مبدأ العمل:** البوت لا يعدّل ولا يحذف أي شي من كودك القديم — فقط:
1. يربط حساب العضو بتيليجرام عند ضغطه Start (يكتب `telegramChatId` بمستند المستخدم فقط، ولا شي غيره)
2. يقرأ (قراءة فقط) مجموعة `notifications` الموجودة أصلاً بقاعدتك — وكل عملية بمنصتك (مهمة، إيداع، سحب، دعم ترقية، عمولة، انضمام عضو...) تكتب فيها أصلاً عبر `createNotification()` الموجودة بكودك. فور ما يظهر إشعار جديد لعضو رابط حسابه، يوصله كرسالة تيليجرام تلقائيًا — بنفس النص المُنسّق أصلاً بكودك، بدون أي تعديل إضافي على `firebaseService.ts` أو `AdminPanel.tsx`.

## قبل الرفع على Railway، تحتاج شيئين

1. **توكن البوت** — من محادثتك مع `@BotFather` بعد `/newbot` (خذته سابقاً عند إنشاء `@OXLO_Notify_bot`).

2. **Service Account Key** (مختلف عن `firebase-applet-config.json` المستخدم بالموقع):
   - افتح [Firebase Console](https://console.firebase.google.com) → مشروعك
   - ⚙️ Project settings → تبويب **Service accounts**
   - اضغط **Generate new private key** → يُنزَّل ملف JSON
   - افتح الملف وانسخ محتواه بالكامل (سطر واحد أو كامل، لا يهم)

   ⚠️ هذا الملف يعطي صلاحية كاملة (قراءة/كتابة) على قاعدة بياناتك بالكامل بدون قيود —
   لا تشاركه مع أي أحد ولا ترفعه لأي مكان عام (لا GitHub عام، لا هنا بالمحادثة).

## الرفع على Railway

1. ادفع مجلد `oxlo-bot` هذا إلى مستودع GitHub خاص بك (أو استخدم `railway up` من الطرفية مباشرة بدون GitHub)
2. بمشروع Railway: **New Project** → **Deploy from GitHub repo** (أو Empty Project ثم اربط المستودع)
3. من تبويب **Variables** بالمشروع، أضف:
   - `TELEGRAM_BOT_TOKEN` = التوكن من BotFather
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = محتوى ملف الـ JSON كاملاً (الصقه كقيمة واحدة)
   - `FIRESTORE_DATABASE_ID` = `arbah-main` (أو اسم قاعدتك الفعلي إن كان مختلفاً)
4. Railway يكتشف `package.json` تلقائياً وينفّذ `npm install && npm run build && npm start`
5. راقب تبويب **Deployments → Logs** — إذا شفت `🤖 OXLO Notify Bot يعمل الآن...` فكل شي تمام

## اختبار سريع

1. افتح `https://t.me/OXLO_Notify_bot?start=9647801234567` (رقم هاتف عضو حقيقي مسجل بالمنصة بدون +)
2. اضغط Start
3. لازم يوصلك رد "تم ربط حسابك بنجاح"
4. تحقق من Firestore → users → (رقم الهاتف) → لازم تلقى حقل `telegramChatId` انكتب

## للتطوير محلياً

```bash
npm install
cp .env.example .env   # وعبّي القيم
npm run dev
```

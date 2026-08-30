import 'dotenv/config';
import { Telegraf } from 'telegraf';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// ============================================================
// ⚠️ هذا البوت لا يقرأ ولا يعدّل ولا يحذف أي شي من كود منصتك القديم.
// هو عملية Node.js منفصلة كليًا، تتصل بنفس قاعدة بيانات Firestore
// وتقرأ منها فقط (باستثناء سطر واحد: كتابة telegramChatId عند
// الربط داخل مستند المستخدم نفسه — لا شي غيره).
// ============================================================

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON غير موجود في متغيرات البيئة');
}
const app = admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
});

// ⚠️ مهم جدًا: قاعدة بياناتك اسمها "arbah-main" وليست القاعدة
// الافتراضية — لازم نحدد اسمها صراحة، وإلا يتصل Firebase Admin
// بقاعدة فاضية تمامًا ويفشل كل استعلام بصمت (هذا كان سبب فشل
// الربط بالتجربة السابقة).
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'arbah-main';
const db = getFirestore(app, FIRESTORE_DATABASE_ID);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN غير موجود في متغيرات البيئة');
}

const bot = new Telegraf(BOT_TOKEN);
const OXLO_SIGNATURE = '\n\n— OXLO —';

// معرّف تيليجرام الشخصي بتاعك (Chat ID) — يحدد مين يقدر يستخدم أمر
// /stats. لو تركته فاضي، أي شخص يقدر يشوف العداد (مو خطير جدًا لكن
// الأفضل تقييده). احصل عليه بسهولة: كلّم @userinfobot بتيليجرام
// وبيرد عليك برقمك مباشرة.
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '';

// وقت إقلاع البوت — نستخدمه لتجاهل كل الإشعارات القديمة الموجودة
// أصلاً بقاعدة البيانات عند أول تشغيل، ونرسل فقط ما هو جديد فعلاً
// من هذه اللحظة فصاعدًا.
const BOOT_TIME = Date.now();

// تسجيل كل شخص فريد فتح محادثة مع البوت (حتى لو ما أكمل الربط) —
// مجموعة منفصلة تمامًا، بس لعدّ الزوار، ما تتقاطع مع بيانات المنصة.
async function recordVisitor(chatId: string, tgUsername: string) {
  const ref = db.collection('bot_visitors').doc(chatId);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      telegramUsername: tgUsername,
      firstSeenAt: new Date().toISOString(),
    });
  }
}

// ============================================================
// 1) ربط الحساب: /start <رقم الهاتف بدون +>
//    (الشاشة بالموقع تفتح هذا الرابط تلقائيًا؛ لا يحتاج العضو
//    يكتب أي شي يدويًا — فقط يضغط Start)
// ============================================================
bot.start(async (ctx) => {
  const payload = (ctx.startPayload || '').trim();
  const chatId = String(ctx.chat.id);
  const tgUsername = ctx.from?.username ? `@${ctx.from.username}` : '';

  recordVisitor(chatId, tgUsername).catch(() => {});

  if (!payload) {
    // تحقق: هل هذا الشات مربوط بحساب (أو أكثر) أصلاً؟
    const linkedSnap = await db.collection('users').where('telegramChatId', '==', chatId).get();
    if (!linkedSnap.empty) {
      const names = linkedSnap.docs
        .map((d) => d.data()?.username || d.data()?.phone || d.id)
        .join('، ');
      await ctx.reply(`✅ أنت مربوط أصلاً بـ: ${names}\n\nراح توصلك إشعاراتك هنا تلقائيًا — ما تحتاج تسوي شي إضافي.`);
      return;
    }
    await ctx.reply('مرحباً بك في بوت OXLO 👋\nلربط حسابك، افتح هذا البوت من داخل تطبيق OXLO عبر زر "ربط Telegram".');
    return;
  }

  const phone = `+${payload.replace(/\D/g, '')}`;

  try {
    const userRef = db.collection('users').doc(phone);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      await ctx.reply('⚠️ لم يتم العثور على حساب مطابق. تأكد أنك فتحت هذا الرابط من داخل تطبيق OXLO مباشرة.');
      return;
    }

    // التعديل الوحيد الذي يلمسه هذا البوت على قاعدة بياناتك:
    // حقل telegramChatId (وحقلين مساعدين اختياريين) داخل مستند
    // هذا المستخدم فقط — لا شي آخر يتغيّر بأي مستند آخر بالنظام.
    await userRef.update({
      telegramChatId: chatId,
      telegramUsername: tgUsername,
      telegramLinkedAt: new Date().toISOString(),
    });

    const userData = userSnap.data();
    const username = userData?.username || '';
    const balance = Number(userData?.earnings || 0).toFixed(2);
    await ctx.reply(
      `✅ تم ربط حسابك بنجاح${username ? '، ' + username : ''}!\n\n💰 رصيدك الحالي: ${balance} USDT\n\nمن الآن فصاعداً، راح توصلك كل إشعاراتك (مهام، إيداع، سحب، عمولات، وغيرها) هنا فورًا.${OXLO_SIGNATURE}`
    );
  } catch (err) {
    console.error('start handler error:', err);
    await ctx.reply('حدث خطأ أثناء الربط، حاول مرة أخرى بعد قليل.');
  }
});

bot.catch((err) => {
  console.error('Telegraf error:', err);
});

// ============================================================
// عرض الرصيد: أمر /balance، أو ببساطة كتابة "رصيد" أو "رصيدي"
// يعرض رصيد كل الحسابات المربوطة بنفس محادثة تيليجرام هذي —
// قراءة فقط، بدون أي تعديل على قاعدة البيانات.
// ============================================================
async function handleBalance(ctx: any) {
  const chatId = String(ctx.chat.id);
  try {
    const snap = await db.collection('users').where('telegramChatId', '==', chatId).get();
    if (snap.empty) {
      await ctx.reply('لا يوجد حساب مربوط بهذا الرقم بعد. افتح رابط "ربط Telegram" من داخل تطبيق OXLO أول.');
      return;
    }

    const lines = snap.docs.map((d) => {
      const u = d.data();
      const name = u.username || u.phone || d.id;
      const balance = Number(u.earnings || 0).toFixed(2);
      return `👤 ${name}\n💰 رصيدك الحالي: ${balance} USDT`;
    });

    await ctx.reply(`${lines.join('\n\n')}${OXLO_SIGNATURE}`);
  } catch (err) {
    console.error('balance command error:', err);
    await ctx.reply('تعذّر جلب الرصيد حاليًا، حاول بعد قليل.');
  }
}
bot.command('balance', handleBalance);
bot.hears(['رصيد', 'رصيدي', 'الرصيد'], handleBalance);

// ============================================================
// إلغاء الربط: أمر /unlink، أو كتابة "الغاء الربط" / "فك الربط"
// يمسح telegramChatId من كل حساب مربوط بهذي المحادثة. بعدها
// شاشة الربط الإجبارية بالموقع ترجع تلقائيًا (لأنها أصلاً تتفعّل
// كل ما يكون هذا الحقل فاضيًا) — بدون أي تعديل إضافي مطلوب.
// ============================================================
async function handleUnlink(ctx: any) {
  const chatId = String(ctx.chat.id);
  try {
    const snap = await db.collection('users').where('telegramChatId', '==', chatId).get();
    if (snap.empty) {
      await ctx.reply('ما عندك أي حساب مربوط حاليًا.');
      return;
    }

    const names = snap.docs.map((d) => d.data()?.username || d.data()?.phone || d.id);

    const batch = db.batch();
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        telegramChatId: admin.firestore.FieldValue.delete(),
        telegramUsername: admin.firestore.FieldValue.delete(),
        telegramLinkedAt: admin.firestore.FieldValue.delete(),
      });
    });
    await batch.commit();

    await ctx.reply(
      `✅ تم إلغاء الربط لـ: ${names.join('، ')}\n\nلن تصلك إشعارات بعد الآن. عند فتح تطبيق OXLO مرة ثانية، بيُطلب منك ربط حساب Telegram من جديد.`
    );
  } catch (err) {
    console.error('unlink command error:', err);
    await ctx.reply('تعذّر إلغاء الربط حاليًا، حاول بعد قليل.');
  }
}
bot.command('unlink', handleUnlink);
bot.hears(['الغاء الربط', 'إلغاء الربط', 'فك الربط'], handleUnlink);

// ============================================================
// أمر /stats: يعرض عدد زوار البوت وعدد الحسابات المربوطة فعليًا.
// محصور على ADMIN_TELEGRAM_ID فقط.
// ============================================================
bot.command('stats', async (ctx) => {
  const senderId = String(ctx.from?.id || '');
  if (!ADMIN_TELEGRAM_ID || senderId !== ADMIN_TELEGRAM_ID) {
    return; // تجاهل تام لأي شخص غير مصرّح له — بدون أي رد يفضح وجود الأمر
  }

  try {
    const [visitorsSnap, linkedUsersSnap] = await Promise.all([
      db.collection('bot_visitors').count().get(),
      db.collection('users').where('telegramChatId', '!=', null).get(),
    ]);

    const totalVisitors = visitorsSnap.data().count;
    const linkedDocs = linkedUsersSnap.docs;

    let listText = '';
    if (linkedDocs.length > 0) {
      listText = linkedDocs
        .map((d, i) => {
          const u = d.data();
          const name = u.username || '—';
          const phone = u.phone || d.id;
          const tg = u.telegramUsername || '—';
          return `${i + 1}. ${name}\n   📱 ${phone}\n   💬 ${tg}`;
        })
        .join('\n\n');
    } else {
      listText = 'لا يوجد حسابات مربوطة بعد.';
    }

    await ctx.reply(
      `📊 إحصائيات بوت OXLO\n\n` +
      `👥 إجمالي من فتح البوت: ${totalVisitors}\n` +
      `🔗 حسابات مربوطة فعليًا: ${linkedDocs.length}\n\n` +
      `— القائمة —\n\n${listText}`
    );
  } catch (err) {
    console.error('stats command error:', err);
    await ctx.reply('تعذّر جلب الإحصائيات حاليًا.');
  }
});

// ============================================================
// 2) مرسِل الإشعارات: يستمع لمجموعة "notifications" فقط (قراءة بحتة)
//
//    كل عملية بمنصتك (إتمام مهمة، إيداع، سحب، دعم ترقية، عمولة
//    إحالة، انضمام عضو جديد...) تكتب أصلاً بهذه المجموعة عبر دالة
//    createNotification() الموجودة بكودك — بدون أي تعديل منّا.
//    البوت فقط يقرأ كل مستند جديد يُضاف هنا، ويحوّله لرسالة تيليجرام
//    لنفس صاحب الحساب إن كان قد ربط حسابه.
// ============================================================
db.collection('notifications').onSnapshot(
  (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type !== 'added') return;

      const data = change.doc.data();
      const createdAtMs = data.createdAt ? new Date(data.createdAt).getTime() : 0;

      // تجاهل أي إشعار قديم (موجود من قبل تشغيل البوت) لتفادي إرسال
      // دفعة ضخمة من الرسائل القديمة عند كل إعادة تشغيل على Railway
      if (!createdAtMs || createdAtMs < BOOT_TIME) return;

      const target = data.userId as string | undefined; // غالبًا رقم الهاتف، أو 'admin'
      const message = data.message as string | undefined;
      if (!target || !message) return;

      // 'admin' ليس رقم هاتف — لا يوجد مستند مستخدم مطابق له، فيُتجاهل
      // تلقائيًا بأمان (لا يوجد telegramChatId لإرساله إليه).
      try {
        const userSnap = await db.collection('users').doc(target).get();
        if (!userSnap.exists) return;
        const userData = userSnap.data();
        const chatId = userData?.telegramChatId;
        if (!chatId) return; // العضو لسا ما ربط حسابه بتيليجرام

        // لو نفس رقم تيليجرام مربوط بأكثر من حساب بالمنصة (شخص واحد
        // عنده أكثر من حساب)، نوضح اسم/رقم صاحب الحساب أول كل رسالة
        // حتى ما يصير لخبطة بين الحسابات.
        const ownerLabel = userData?.username || userData?.phone || target;
        const header = `👤 <b>الحساب: ${ownerLabel}</b>\n\n`;

        await bot.telegram.sendMessage(chatId, `${header}${message}${OXLO_SIGNATURE}`, {
          parse_mode: 'HTML',
        });
      } catch (err) {
        console.error('فشل إرسال إشعار تيليجرام:', err);
      }
    });
  },
  (err) => console.error('notifications listener error:', err)
);

bot.launch().then(() => {
  console.log('🤖 OXLO Notify Bot يعمل الآن...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

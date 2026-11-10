# MORTI///STYLE — نسخهٔ وب (PWA)

همان اپ، با همان Supabase و همان حساب‌ها. به اپ iOS هیچ دست‌زده نشده.

## ۱) انتشار با GitHub Pages (رایگان)
1. در github.com یک Repository جدید بساز (مثلاً `morti-web`)، Public.
2. همهٔ محتوای این پوشه (index.html، sw.js، manifest.webmanifest، پوشه‌های js / css / icons) را آپلود کن (Add file → Upload files).
3. Settings → Pages → Source: «Deploy from a branch» → Branch: `main` / root → Save.
4. بعد از ۱–۲ دقیقه لینک: `https://<username>.github.io/morti-web/`

## ۲) تنظیم Supabase (لازم است)
Authentication → URL Configuration:
- **Site URL**: لینک بالا
- **Redirect URLs**: همان لینک را اضافه کن.

Authentication → Email Templates: در قالب‌های «Reset Password» و «Change Email Address» از `{{ .Token }}` (کد ۶ رقمی) استفاده کن، مثل اپ iOS.

اگر قبلاً SQL فایل `account-events.sql` را اجرا نکرده‌ای، یک بار اجرا کن.

## ۳) استفاده
- Safari/Chrome: لینک را باز کن.
- آیفون: Share ← Add to Home Screen → مثل اپ.
- ادمین: با همان ایمیل ادمین وارد شو؛ منوی مدیریت خودکار نشان داده می‌شود.

## تفاوت‌های وب با اپ iOS
- معلم هوشمند (Apple Intelligence)، یادآور روزانه و ویجت فقط در iOS هستند.
- پیشرفت مرور هوشمند/XP روی هر دستگاه جدا ذخیره می‌شود.
- تلفظ و صدا به پشتیبانی مرورگر بستگی دارد (Safari و Chrome خوب هستند).
- ضبط صدا در چت با فرمت سازگار با اپ iOS انجام می‌شود.

کلید `sb_publishable` در js/config.js عمومی است و مشکلی ندارد؛ کلید secret را هرگز اینجا نگذار.

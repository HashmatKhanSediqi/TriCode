import mongoose from "mongoose";

// این ماژول برای اتصال به پایگاه داده MongoDB با استفاده از Mongoose طراحی شده است. URI اتصال از متغیر محیطی MONGODB_URI خوانده می‌شود و قبل از استفاده، مقادیر اضافی مانند کاراکترهای خط جدید یا فاصله‌ها حذف می‌شوند تا از خطاهای احتمالی جلوگیری شود. همچنین، در صورت اجرای برنامه در محیط Vercel، اگر URI به localhost اشاره کند، یک خطا پرتاب می‌شود تا توسعه‌دهندگان را مجبور به استفاده از یک URI معتبر (مانند MongoDB Atlas) کنند. این ماژول همچنین از کشینگ اتصال استفاده می‌کند تا در صورت وجود اتصال فعال یا در حال برقراری، همان اتصال را بازگرداند و از ایجاد اتصالات جدید غیرضروری جلوگیری کند. در صورت بروز خطا در اتصال، کشینگ پاک می‌شود تا تلاش‌های بعدی بتوانند دوباره سعی کنند.
const MONGODB_URI = String(process.env.MONGODB_URI || "")
  .replace(/\\r\\n/g, "")
  .replace(/\\n/g, "")
  .replace(/\r\n/g, "")
  .trim();


  // برای جلوگیری از ایجاد چندین اتصال به MongoDB در محیط توسعه که ممکن است باعث مشکلات عملکردی شود، از یک کشینگ ساده استفاده می‌کنیم. این کشینگ در حافظه جهانی (globalThis) نگهداری می‌شود تا بین بارهای مختلف ماژول حفظ شود. اگر اتصال فعال یا در حال برقراری وجود داشته باشد، همان اتصال بازگردانده می‌شود. در صورت بروز خطا در اتصال، کشینگ پاک می‌شود تا تلاش‌های بعدی بتوانند دوباره سعی کنند.
let cached = globalThis.__mongooseConn;
if (!cached) {
  cached = globalThis.__mongooseConn = { conn: null, promise: null };
}


// این تابع برای اتصال به MongoDB استفاده می‌شود. اگر اتصال فعال یا در حال برقراری وجود داشته باشد، همان اتصال بازگردانده می‌شود. در صورت بروز خطا در اتصال، کشینگ پاک می‌شود تا تلاش‌های بعدی بتوانند دوباره سعی کنند.
export async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  if (!/^mongodb(\+srv)?:\/\//i.test(MONGODB_URI)) {
    throw new Error(
      'Invalid MONGODB_URI format. It must start with "mongodb://" or "mongodb+srv://".',
    );
  }

  if (process.env.VERCEL && /(localhost|127\.0\.0\.1)/i.test(MONGODB_URI)) {
    throw new Error(
      "MONGODB_URI points to localhost. Use a cloud MongoDB URI (Atlas) on Vercel.",
    );
  }

  if (cached.conn || mongoose.connection.readyState >= 1) {
    cached.conn = mongoose.connection;
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      maxPoolSize: 10,
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
}

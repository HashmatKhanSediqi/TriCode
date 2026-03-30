import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { getClientLang, setClientLang } from "../lib/lang";
import {
  getClientTemplate,
  getTemplateTheme,
  setClientTemplate,
} from "../lib/template";

const LANGS = {
  fa: {
    badge: "نسخه ۱.۰",
    hero: "دستیار هوشمند\nبرنامه‌نویسی",
    sub: "با بیش از ۲۰ مدل هوش مصنوعی، کدنویسی را ساده‌تر کنید",
    cta: "شروع کنید",
    login: "ورود",
    templatesNav: "قالب‌ها",
    templatesTitle: "قالب دلخواه را انتخاب کنید",
    templatesSub: "ظاهر کل برنامه را با یک کلیک تغییر دهید.",
    templatesUse: "استفاده از قالب",
    templatesActive: "فعال",
    features: [
      {
        icon: "⚡",
        title: "۲۰+ مدل AI",
        desc: "از Llama تا GPT-4o، بهترین مدل را انتخاب کنید",
      },
      { icon: "🌐", title: "سه‌زبانه", desc: "پاسخ به دری، پشتو و انگلیسی" },
      {
        icon: "💾",
        title: "حافظه چت",
        desc: "تاریخچه کامل مکالمات با تاریخ شمسی",
      },
      {
        icon: "🖼️",
        title: "بارگذاری تصویر",
        desc: "تصویر و فایل تا ۳۱MB ارسال کنید",
      },
      { icon: "🔒", title: "امن و خصوصی", desc: "تأیید هویت دو مرحله‌ای" },
      {
        icon: "👑",
        title: "پنل مدیریت",
        desc: "کنترل کامل کاربران و محدودیت‌ها",
      },
    ],
    models: "مدل‌های پشتیبانی شده",
  },
  ps: {
    badge: "نسخه ۱.۰",
    hero: "د برنامه نویسۍ\nهوشمند مرستیال",
    sub: "د ۲۰+ AI ماډلونو سره، کوډ لیکل اسانه کړئ",
    cta: "پیل کړئ",
    login: "ننوتل",
    templatesNav: "ټيمپلېټونه",
    templatesTitle: "خپل ټيمپلېټ وټاکئ",
    templatesSub: "د ټول اپ بڼه په يو کليک بدله کړئ.",
    templatesUse: "ټيمپلېټ وکاروه",
    templatesActive: "فعال",
    features: [
      { icon: "⚡", title: "۲۰+ AI ماډل", desc: "له Llama نه تر GPT-4o پورې" },
      { icon: "🌐", title: "درې ژبې", desc: "دري، پښتو او انګلیسي" },
      {
        icon: "💾",
        title: "د چت حافظه",
        desc: "د لرغوني خبرو اترو بشپړ تاریخ",
      },
      { icon: "🖼️", title: "انځور بارول", desc: "تر ۳۱MB پورې فایل ولیږئ" },
      { icon: "🔒", title: "خوندي", desc: "دوه مرحلې تصدیق" },
      { icon: "👑", title: "اداري پینل", desc: "د کاروونکو بشپړ کنترول" },
    ],
    models: "ملاتړ شوي ماډلونه",
  },
  en: {
    badge: "Version 1.0",
    hero: "TriCode AI\nCoding Assistant",
    sub: "Built for Afghan developers. Supports only Dari, Pashto, and English.",
    cta: "Get Started",
    login: "Login",
    templatesNav: "Templates",
    templatesTitle: "Choose your template",
    templatesSub: "Pick a visual style for the entire app.",
    templatesUse: "Use template",
    templatesActive: "Active",
    features: [
      {
        icon: "⚡",
        title: "20+ AI Models",
        desc: "From Llama to GPT-4o, pick the best model",
      },
      {
        icon: "🌐",
        title: "Multilingual",
        desc: "Dari, Pashto & English responses",
      },
      {
        icon: "💾",
        title: "Chat Memory",
        desc: "Full history with Afghan calendar dates",
      },
      {
        icon: "🖼️",
        title: "File Upload",
        desc: "Send images & files up to 31MB",
      },
      { icon: "🔒", title: "Secure", desc: "Two-factor email verification" },
      {
        icon: "👑",
        title: "Admin Panel",
        desc: "Full user management & limits",
      },
    ],
    models: "Supported Models",
  },
};

const SHOWCASE_MODELS = [
  { name: "Llama 3 70B", color: "#10d9a0", tier: "free" },
  { name: "DeepSeek R1", color: "#06b6d4", tier: "free" },
  { name: "Gemma 3 12B", color: "#fbbf24", tier: "free" },
  { name: "Qwen 2.5 Coder", color: "#f97316", tier: "free" },
  { name: "GPT-4o", color: "#3b82f6", tier: "limited" },
  { name: "Gemini Pro", color: "#f59e0b", tier: "limited" },
  { name: "Claude 3 Haiku", color: "#f472b6", tier: "limited" },
  { name: "Mistral Large", color: "#f43f5e", tier: "limited" },
];

const TEMPLATE_LIST = [
  {
    key: "neo-dark",
    theme: "dark",
    name: { fa: "نئو دارک", ps: "نيو ډارک", en: "Neo Dark" },
    desc: {
      fa: "سینمایی تیره با درخشش نئون",
      ps: "توره سينمايي بڼه د نيون رڼا سره",
      en: "Cinematic dark with neon glow",
    },
    preview: {
      from: "#0a0f1a",
      to: "#131a2c",
      glow: "rgba(110,168,254,0.45)",
      card: "rgba(255,255,255,0.08)",
      line: "rgba(255,255,255,0.12)",
    },
    image: "/templates/neo-dark.svg",
  },
  {
    key: "mind-light",
    theme: "light",
    name: { fa: "مایند لایت", ps: "ماینډ لایټ", en: "Mind Light" },
    desc: {
      fa: "روشن و نرم، مناسب خواندن",
      ps: "روښانه او نرم، د لوستلو لپاره ښه",
      en: "Bright, soft, and easy to read",
    },
    preview: {
      from: "#f8f6fb",
      to: "#efe8ff",
      glow: "rgba(249,115,22,0.35)",
      card: "rgba(0,0,0,0.06)",
      line: "rgba(0,0,0,0.08)",
    },
    image: "/templates/mind-light.svg",
  },
  {
    key: "violet-soft",
    theme: "light",
    name: { fa: "ویولت سافت", ps: "وایلېټ سافټ", en: "Violet Soft" },
    desc: {
      fa: "لاوندر آرام با حس SaaS",
      ps: "ارام بنفش ټون د SaaS احساس سره",
      en: "Lavender calm with SaaS vibes",
    },
    preview: {
      from: "#f6f3ff",
      to: "#e9e2ff",
      glow: "rgba(139,92,246,0.35)",
      card: "rgba(0,0,0,0.06)",
      line: "rgba(0,0,0,0.08)",
    },
    image: "/templates/violet-soft.svg",
  },
  {
    key: "carbon-dark",
    theme: "dark",
    name: { fa: "کاربن دارک", ps: "کاربن ډارک", en: "Carbon Dark" },
    desc: {
      fa: "مینیمال تیره با کنتراست بالا",
      ps: "مينيمال توره بڼه د لوړ کونتراسټ سره",
      en: "Minimal dark with crisp contrast",
    },
    preview: {
      from: "#0b0b0d",
      to: "#1a1a20",
      glow: "rgba(255,255,255,0.2)",
      card: "rgba(255,255,255,0.06)",
      line: "rgba(255,255,255,0.12)",
    },
    image: "/templates/carbon-dark.svg",
  },
];

export default function Landing() {
  const [lang, setLang] = useState("fa");
  const [theme, setTheme] = useState("dark");
  const [template, setTemplate] = useState("neo-dark");
  const router = useRouter();
  const t = LANGS[lang];
  const rtl = lang !== "en";

  useEffect(() => {
    const stored = getClientLang();
    setLang(stored);
  }, []);

  useEffect(() => {
    const stored = getClientTemplate();
    const nextTheme = getTemplateTheme(stored);
    setTemplate(stored);
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-template", stored);
    document.documentElement.setAttribute("data-theme", nextTheme);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
  }, [lang, rtl]);

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!targets.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.18 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [lang, template]);

  const applyTemplate = (key) => {
    const next = setClientTemplate(key);
    const nextTheme = getTemplateTheme(next);
    setTemplate(next);
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-template", next);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const fallback = nextTheme === "dark" ? "neo-dark" : "mind-light";
    applyTemplate(fallback);
  };

  return (
    <>
      <Head>
        <title>TriCode AI | Afghan AI Coding Assistant</title>
        <meta
          name="description"
          content="TriCode AI is a multilingual coding assistant built for Afghan developers. Explore 20+ AI models with secure, fast, and reliable workflows."
        />
        <meta name="robots" content="index,follow" />
        <meta property="og:title" content="TriCode AI" />
        <meta
          property="og:description"
          content="Multilingual AI coding assistant for Afghan developers. Try 20+ models with secure OTP login."
        />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/tricode-mark.svg" />
      </Head>

      <div
        dir={rtl ? "rtl" : "ltr"}
        style={{
          height: "var(--app-height)",
          minHeight: "var(--app-height)",
          background: "var(--bg-base)",
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
        }}
      >
      {/* Animated background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "10%",
            width: "clamp(320px, 80vw, 600px)",
            height: "clamp(320px, 80vw, 600px)",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, var(--hero-glow-1) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "10%",
            right: "5%",
            width: "clamp(220px, 60vw, 400px)",
            height: "clamp(220px, 60vw, 400px)",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, var(--hero-glow-2) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Navbar */}
      <nav
        className="landing-nav"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "var(--nav-bg)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "var(--nav-pad-y) var(--nav-pad)",
          height: "var(--nav-height)",
          display: "flex",
          alignItems: "var(--nav-align)",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img
            src="/tricode-mark.svg"
            alt="TriCode AI"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "#fff",
              padding: "2px",
            }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: "16px",
              color: "var(--text-1)",
              letterSpacing: "-0.3px",
            }}
          >
            TriCode AI
          </span>
        </div>

        <div
          className="landing-nav-actions"
          style={{ display: "flex", alignItems: "center", gap: "var(--nav-gap)" }}
        >
          {/* Lang switcher */}
          {["fa", "ps", "en"].map((l) => (
            <button
              key={l}
              onClick={() => {
                const next = setClientLang(l);
                setLang(next);
              }}
              style={{
                padding: "var(--nav-lang-pad)",
                borderRadius: "6px",
                border: "1px solid",
                borderColor:
                  lang === l ? "var(--accent)" : "var(--border-default)",
                background: lang === l ? "var(--accent-muted)" : "transparent",
                color: lang === l ? "var(--accent)" : "var(--text-2)",
                fontSize: "var(--nav-lang-size)",
                fontWeight: lang === l ? 600 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}

          {/* Theme */}
          <button
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "8px",
              border: "1px solid var(--border-default)",
              background: "transparent",
              color: "var(--text-2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {theme === "dark" ? (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => {
              const node = document.getElementById("templates");
              if (node) node.scrollIntoView({ behavior: "smooth" });
            }}
            className="btn-ghost"
            style={{ fontSize: "var(--nav-btn-size)", padding: "var(--nav-btn-pad)" }}
          >
            {t.templatesNav}
          </button>

          <button
            onClick={() => router.push("/login")}
            className="btn-ghost"
            style={{ fontSize: "var(--nav-btn-size)", padding: "var(--nav-btn-pad)" }}
          >
            {t.login}
          </button>
          <button
            onClick={() => router.push("/register")}
            className="btn-primary"
            style={{ fontSize: "var(--nav-btn-size)", padding: "var(--nav-cta-pad)" }}
          >
            {t.cta}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding:
            "clamp(56px, 10vw, 90px) var(--page-pad) clamp(44px, 8vw, 70px)",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          className="fade-in reveal"
          data-reveal
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--accent-muted)",
            border: "1px solid var(--border-strong)",
            borderRadius: "99px",
            padding: "5px 16px",
            marginBottom: "28px",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--green)",
              display: "inline-block",
              animation: "pulse 2s infinite",
            }}
          />
          <span
            style={{
              fontSize: "12px",
              color: "var(--accent)",
              fontWeight: 600,
            }}
          >
            {t.badge}
          </span>
        </div>

        <h1
          className="fade-up reveal"
          data-reveal
          style={{
            fontSize: "clamp(40px,6vw,72px)",
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: "-1.5px",
            marginBottom: "20px",
            whiteSpace: "pre-line",
          }}
        >
          <span className="g-text">{t.hero}</span>
        </h1>

        <p
          className="fade-up reveal"
          data-reveal
          style={{
            animationDelay: ".1s",
            fontSize: "clamp(15px, 2.6vw, 18px)",
            color: "var(--text-2)",
            maxWidth: "520px",
            margin: "0 auto 36px",
            lineHeight: 1.7,
          }}
        >
          {t.sub}
        </p>

        <div
          className="fade-up reveal"
          data-reveal
          style={{
            animationDelay: ".2s",
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => router.push("/register")}
            className="btn-primary"
            style={{
              padding: "clamp(12px, 3vw, 13px) clamp(22px, 6vw, 32px)",
              fontSize: "clamp(14px, 3vw, 15px)",
              borderRadius: "12px",
            }}
          >
            {t.cta} →
          </button>
          <button
            onClick={() => router.push("/login")}
            className="btn-ghost"
            style={{
              padding: "clamp(12px, 3vw, 13px) clamp(20px, 6vw, 28px)",
              fontSize: "clamp(14px, 3vw, 15px)",
              borderRadius: "12px",
            }}
          >
            {t.login}
          </button>
        </div>

        {/* Hero preview card */}
        <div
          className="fade-up reveal"
          data-reveal
          style={{
            animationDelay: ".3s",
            maxWidth: "720px",
            margin: "clamp(36px, 8vw, 60px) auto 0",
            position: "relative",
            perspective: "1400px",
            overflow: "visible",
          }}
        >
          <div
            className="tilt-card"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "22px",
              overflow: "hidden",
              boxShadow: "var(--sh3)",
            }}
          >
          <div
            style={{
              background: "var(--bg-elevated)",
              borderBottom: "1px solid var(--border-subtle)",
              padding: "12px 20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {["#f87171", "#fbbf24", "#34d399"].map((c) => (
              <span
                key={c}
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: c,
                }}
              />
            ))}
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-3)",
                marginRight: "auto",
              }}
            >
              TriCode AI · Llama 3 70B
            </span>
          </div>
          <div
            style={{
              padding: "clamp(16px, 4vw, 24px)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div
                style={{
                  background: "var(--user-bg)",
                  border: "1px solid var(--user-br)",
                  borderRadius: "14px 14px 4px 14px",
                  padding: "10px 16px",
                  fontSize: "13px",
                  maxWidth: "80%",
                  direction: "rtl",
                  textAlign: "right",
                }}
              >
                یک تابع Python بنویس که لیست را مرتب کند
              </div>
            </div>
            <div
              style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}
            >
              <img
                src="/tricode-mark.svg"
                alt="TriCode AI"
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "#fff",
                  padding: "2px",
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  background: "var(--ai-bg)",
                  border: "1px solid var(--ai-br)",
                  borderRadius: "14px 14px 14px 4px",
                  padding: "10px 16px",
                  fontSize: "12px",
                  maxWidth: "85%",
                  direction: "rtl",
                  textAlign: "right",
                  lineHeight: 1.7,
                }}
              >
                البته! این تابع با Quicksort پیاده‌سازی شده:
                <br />
                <code
                  style={{
                    background: "var(--bg-overlay)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    color: "var(--green)",
                    fontFamily: "var(--font-mono), monospace",
                    fontSize: "11px",
                  }}
                >
                  def sort_list(arr): return sorted(arr)
                </code>
              </div>
            </div>
          </div>
          </div>

          <img
            src="/templates/neo-dark.svg"
            alt="Preview card"
            className="float-slow hero-float"
            style={{
              position: "absolute",
              right: "-70px",
              top: "-40px",
              width: "clamp(120px, 28vw, 200px)",
              borderRadius: "18px",
              boxShadow: "0 18px 40px rgba(0,0,0,.35)",
              transform: "rotate(8deg)",
              pointerEvents: "none",
            }}
          />
          <img
            src="/templates/violet-soft.svg"
            alt="Preview card"
            className="float-fast hero-float"
            style={{
              position: "absolute",
              left: "-60px",
              bottom: "-50px",
              width: "clamp(110px, 26vw, 180px)",
              borderRadius: "16px",
              boxShadow: "0 18px 40px rgba(0,0,0,.28)",
              transform: "rotate(-10deg)",
              pointerEvents: "none",
            }}
          />
          <div
            className="float-fast hero-float"
            style={{
              position: "absolute",
              right: "40px",
              bottom: "-60px",
              width: "clamp(100px, 22vw, 140px)",
              height: "clamp(100px, 22vw, 140px)",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, var(--accent-glow), transparent 70%)",
              filter: "blur(6px)",
              opacity: 0.8,
              pointerEvents: "none",
            }}
          />
        </div>
      </section>

      {/* TEMPLATES */}
      <section
        id="templates"
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding:
            "clamp(18px, 6vw, 30px) var(--page-pad) clamp(40px, 8vw, 60px)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          className="reveal"
          data-reveal
          style={{
            textAlign: "center",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "8px",
            }}
          >
            {t.templatesNav}
          </div>
          <div
            style={{
              fontSize: "clamp(22px,3vw,34px)",
              fontWeight: 700,
              marginBottom: "10px",
            }}
          >
            {t.templatesTitle}
          </div>
          <div style={{ color: "var(--text-2)", fontSize: "14px" }}>
            {t.templatesSub}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: "16px",
          }}
        >
          {TEMPLATE_LIST.map((tpl, i) => {
            const gradient = `radial-gradient(120px 90px at 15% 20%, ${tpl.preview.glow}, transparent 70%), linear-gradient(140deg, ${tpl.preview.from}, ${tpl.preview.to})`;
            return (
              <div
                key={tpl.key}
                className="reveal"
                data-reveal="scale"
                style={{
                  transitionDelay: `${i * 0.05}s`,
                }}
              >
                <div
                  className="tilt-card"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid",
                    borderColor:
                      template === tpl.key
                        ? "var(--accent)"
                        : "var(--border-default)",
                    borderRadius: "16px",
                    overflow: "hidden",
                    boxShadow:
                      template === tpl.key
                        ? "0 0 0 1px var(--accent), var(--sh2)"
                        : "var(--sh1)",
                  }}
                >
                  <div
                    style={{
                      height: "120px",
                      background: gradient,
                      padding: "14px",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <img
                      src={tpl.image}
                      alt={`${tpl.name[lang] || tpl.name.en} preview`}
                      style={{
                        position: "absolute",
                        inset: "12px",
                        width: "calc(100% - 24px)",
                        height: "calc(100% - 24px)",
                        borderRadius: "12px",
                        objectFit: "cover",
                        boxShadow: "0 12px 30px rgba(0,0,0,.28)",
                        transform: "translateZ(18px)",
                      }}
                    />
                    <div
                      style={{
                        height: "12px",
                        width: "60%",
                        borderRadius: "999px",
                        background: tpl.preview.card,
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: "52px",
                          borderRadius: "10px",
                          background: tpl.preview.card,
                          border: `1px solid ${tpl.preview.line}`,
                        }}
                      />
                      <div
                        style={{
                          width: "52px",
                          height: "52px",
                          borderRadius: "10px",
                          background: tpl.preview.card,
                          border: `1px solid ${tpl.preview.line}`,
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ padding: "16px" }}>
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>{tpl.name[lang] || tpl.name.en}</span>
                      <span
                        className={
                          tpl.theme === "dark" ? "badge-free" : "badge-limited"
                        }
                      >
                        {tpl.theme === "dark" ? "Dark" : "Light"}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-2)",
                        lineHeight: 1.6,
                        minHeight: "36px",
                      }}
                    >
                      {tpl.desc[lang] || tpl.desc.en}
                    </div>
                    <button
                      onClick={() => applyTemplate(tpl.key)}
                      className={
                        template === tpl.key ? "btn-primary" : "btn-ghost"
                      }
                      style={{
                        marginTop: "12px",
                        width: "100%",
                        fontSize: "12px",
                        padding: "8px 12px",
                      }}
                    >
                      {template === tpl.key ? t.templatesActive : t.templatesUse}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FEATURES */}
      <section
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "clamp(36px, 8vw, 60px) var(--page-pad)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
            gap: "16px",
          }}
        >
          {t.features.map((f, i) => (
            <div
              key={i}
              className="reveal"
              data-reveal="scale"
              style={{
                transitionDelay: `${i * 0.05}s`,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "16px",
                padding: "24px",
                transition: "all .2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "var(--glow)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-subtle)";
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "12px" }}>
                {f.icon}
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "15px",
                  marginBottom: "6px",
                }}
              >
                {f.title}
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-2)",
                  lineHeight: 1.65,
                }}
              >
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MODELS */}
      <section
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding:
            "clamp(16px, 5vw, 20px) var(--page-pad) clamp(48px, 10vw, 80px)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            className="reveal"
            data-reveal
            style={{
              fontSize: "11px",
              color: "var(--text-3)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "8px",
            }}
          >
            {t.models}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            justifyContent: "center",
          }}
        >
          {SHOWCASE_MODELS.map((m, i) => (
            <div
              key={i}
              className="reveal"
              data-reveal="scale"
              style={{
                transitionDelay: `${i * 0.03}s`,
                display: "flex",
                alignItems: "center",
                gap: "7px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "99px",
                padding: "6px 14px",
                fontSize: "12px",
              }}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: m.color,
                }}
              />
              <span style={{ color: "var(--text-1)", fontWeight: 500 }}>
                {m.name}
              </span>
              <span
                className={m.tier === "free" ? "badge-free" : "badge-limited"}
              >
                {m.tier === "free" ? "رایگان" : "محدود"}
              </span>
            </div>
          ))}
          <div
            className="reveal"
            data-reveal="scale"
            style={{
              transitionDelay: `${SHOWCASE_MODELS.length * 0.03}s`,
              display: "flex",
              alignItems: "center",
              gap: "7px",
              background: "var(--bg-elevated)",
              border: "1px dashed var(--border-default)",
              borderRadius: "99px",
              padding: "6px 14px",
              fontSize: "12px",
              color: "var(--text-3)",
            }}
          >
            +12 مدل دیگر
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "clamp(18px, 5vw, 24px) var(--page-pad)",
          textAlign: "center",
          color: "var(--text-3)",
          fontSize: "12px",
          position: "relative",
          zIndex: 1,
        }}
      >
        TriCode AI · Built for Afghan developers 🇦🇫
      </footer>
      </div>
    </>
  );
}

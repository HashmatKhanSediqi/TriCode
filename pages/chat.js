import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Message from "../components/Message";
import Sidebar from "../components/Sidebar";
import { MODELS } from "../lib/chatModels";
import { csrfFetch } from "../lib/csrf-client";
import { verifyToken } from "../lib/auth";
import { DEFAULT_WELCOME_PROMPTS } from "../lib/prompts";
import {
  getClientLang,
  getLangFromCookieHeader,
  normalizeLang,
  setClientLang,
  LANGUAGE_KEY,
} from "../lib/lang";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 24 * 1024 * 1024;
const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
const MAX_TOTAL_UPLOAD_MB = Math.round(MAX_TOTAL_UPLOAD_BYTES / (1024 * 1024));
const MAX_ATTACHMENTS_CLIENT = 200;
const IMAGE_SUGGEST_DEBOUNCE_MS = 900;
const VISION_MODEL_KEY = "llama-3.2-11b";
const FILE_MODEL_KEY = "qwen-2.5-coder";
const TEXT_EXT_ALLOWLIST = [
  ".txt",
  ".md",
  ".json",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".csv",
  ".html",
  ".css",
  ".xml",
  ".yml",
  ".yaml",
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
];
const BINARY_EXT_ALLOWLIST = [".pdf", ".zip"];
const TEXT_MIME_ALLOWLIST = [
  "text/",
  "application/json",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/xml",
];
const BINARY_MIME_ALLOWLIST = ["application/pdf", "application/zip"];

const UI_TEXT = {
  fa: {
    online: "آنلاین",
    welcomeBack: (name) => `خوش آمدید، ${name}`,
    usageToday: "امروز",
    smartLabel: "پیشنهاد هوشمند",
    smartUse: "استفاده",
    smartRefresh: "تازه‌سازی",
    imagePlaceholder: "یک تصویر توصیف کنید...",
    imageSuggestLabel: "پیشنهاد پرامپت تصویر",
    imageSuggestRefresh: "تازه‌سازی",
    typing: "هوش مصنوعی در حال نوشتن است...",
    cancel: "لغو",
    activeTool: "ابزار فعال",
    manualHint: "می‌توانید دستورها را دستی هم بنویسید",
    tools: {
      normal: "چت",
      expert: "Expert Coding",
      image: "تولید تصویر",
      video: "تولید ویدیو",
      web: "جستجوی وب",
      think: "تفکر",
      deep: "جستجوی عمیق",
    },
    uploadTitle: "بارگذاری فایل",
    connectFolderTitle: "اتصال پوشه (نیاز به اجازه)",
    sendTitle: "ارسال (Enter)",
    fileTooLarge: (name, mb) => `فایل ${name} بیش از ${mb}MB است`,
    fileAccessTitle: "اجازه خواندن فایل‌ها",
    fileAccessBody: "به TriCode AI اجازه می‌دهید فایل‌های انتخاب‌شده را بخواند؟",
    folderAccessTitle: "اجازه دسترسی به پوشه",
    folderAccessBody:
      "به TriCode AI اجازه می‌دهید فایل‌های پوشه انتخاب‌شده را بخواند؟ فقط همان پوشه خوانده می‌شود.",
    unsupportedFile: (name) => `نوع فایل ${name} پشتیبانی نمی‌شود.`,
    tooManyFiles: (max) => `حداکثر ${max} فایل می‌توانید اضافه کنید.`,
    totalTooLarge: (mb) => `مجموع فایل‌ها نباید بیشتر از ${mb}MB باشد.`,
    modelSwitchPhoto: (model) =>
      `ما مدل را به "${model}" تغییر دادیم چون برای تحلیل تصویر عالی است.`,
    modelSwitchFile: (model) =>
      `ما مدل را به "${model}" تغییر دادیم چون برای تحلیل فایل‌ها بهتر است.`,
    modalOk: "باشه",
    modalConfirm: "اجازه می‌دهم",
    folderNotSupported: "دسترسی پوشه در این مرورگر پشتیبانی نمی‌شود.",
    folderConfirm:
      "به هوش مصنوعی اجازه می‌دهید فایل‌های پوشه انتخاب‌شده را بخواند؟ فقط همان پوشه خوانده می‌شود.",
    noFilesFound: "فایل متنی قابل خواندن پیدا نشد.",
    packageError: "⚠️ در حال حاضر امکان ساخت بسته وجود ندارد.",
    packageReady: (count, name) =>
      `بسته ZIP شما آماده است (${count} فایل). از کارت دانلود استفاده کنید.`,
    errorShort: "خطا",
    networkError: "⚠️ خطای شبکه. لطفاً دوباره تلاش کنید.",
    welcomeTitle: "دستیار هوشمند برنامه‌نویسی",
    welcomeSubtitle:
      "سوالات برنامه‌نویسی خود را بپرسید — به دری، پشتو یا انگلیسی",
    placeholder: "سوال برنامه‌نویسی بپرسید...",
    generationStopped: "تولید متوقف شد",
  },
  ps: {
    online: "آنلاین",
    welcomeBack: (name) => `ښه راغلاست، ${name}`,
    usageToday: "نن",
    smartLabel: "هوښیار وړاندیز",
    smartUse: "وکاروه",
    smartRefresh: "تازه کول",
    imagePlaceholder: "د انځور تشريح وليکئ...",
    imageSuggestLabel: "د انځور پرامپټ وړاندیز",
    imageSuggestRefresh: "تازه کول",
    typing: "AI لیکي...",
    cancel: "لغوه",
    activeTool: "فعال وسیله",
    manualHint: "لا هم کولای شئ قوماندې په لاس ولیکئ",
    tools: {
      normal: "چټ",
      expert: "Expert Coding",
      image: "انځور جوړول",
      video: "ویډیو جوړول",
      web: "ویب لټون",
      think: "فکر",
      deep: "ژور لټون",
    },
    uploadTitle: "فایل پورته کول",
    connectFolderTitle: "فولډر نښلول (اجازه پکار ده)",
    sendTitle: "لېږل (Enter)",
    fileTooLarge: (name, mb) => `فایل ${name} له ${mb}MB څخه لوی دی`,
    fileAccessTitle: "د فایل لوستلو اجازه",
    fileAccessBody: "TriCode AI ته اجازه ورکوئ چې ټاکل شوي فایلونه ولولي؟",
    folderAccessTitle: "د فولډر لاسرسي اجازه",
    folderAccessBody:
      "TriCode AI ته اجازه ورکوئ چې د ټاکل شوي فولډر فایلونه ولولي؟ یوازې هماغه فولډر لوستل کېږي.",
    unsupportedFile: (name) => `د ${name} فایل ډول نه ملاتړ کېږي.`,
    tooManyFiles: (max) => `تر ${max} فایلونه زیات نه شي کېدای.`,
    totalTooLarge: (mb) => `د فایلونو ټول حجم باید له ${mb}MB زیات نه وي.`,
    modelSwitchPhoto: (model) =>
      `موږ موډل "${model}" ته واړوو ځکه د انځور شننې لپاره ډېر ښه دی.`,
    modelSwitchFile: (model) =>
      `موږ موډل "${model}" ته واړوو ځکه د فایلونو تحلیل لپاره ښه دی.`,
    modalOk: "سمه ده",
    modalConfirm: "اجازه ورکوم",
    folderNotSupported: "په دې براوزر کې فولډر ته لاسرسی نشته.",
    folderConfirm:
      "AI ته اجازه ورکوئ چې د ټاکل شوي فولډر فایلونه ولوستل شي؟ یوازې هماغه فولډر لوستل کېږي.",
    noFilesFound: "د لوستلو وړ متني فایلونه ونه موندل شول.",
    packageError: "⚠️ اوس مهال بسته جوړول ممکن نه دي.",
    packageReady: (count, name) =>
      `ستاسې ZIP بسته چمتو ده (${count} فایلونه). د ډاونلوډ کارت وکاروئ.`,
    errorShort: "تېروتنه",
    networkError: "⚠️ د شبکې تېروتنه. بیا هڅه وکړئ.",
    welcomeTitle: "هوښیار برنامه‌نویسي مرستندوی",
    welcomeSubtitle:
      "خپل د برنامه‌نویسۍ پوښتنې وکړئ — په دري، پښتو یا انګلیسي",
    placeholder: "د برنامه‌نویسۍ پوښتنه ولیکئ...",
    generationStopped: "جوړول ودرول شول",
  },
  en: {
    online: "Online",
    welcomeBack: (name) => `Welcome back, ${name}`,
    usageToday: "today",
    smartLabel: "Smart Suggestion",
    smartUse: "Use",
    smartRefresh: "Refresh",
    imagePlaceholder: "Describe the image you want...",
    imageSuggestLabel: "Image prompt suggestions",
    imageSuggestRefresh: "Refresh",
    typing: "AI is typing...",
    cancel: "Cancel",
    activeTool: "Active Tool",
    manualHint: "You can still type commands manually",
    tools: {
      normal: "Chat",
      expert: "Expert Coding",
      image: "Image Generator",
      video: "Video Generator",
      web: "Web Search",
      think: "Think",
      deep: "Deep Search",
    },
    uploadTitle: "Upload file",
    connectFolderTitle: "Connect folder (permission required)",
    sendTitle: "Send (Enter)",
    fileTooLarge: (name, mb) => `File ${name} is larger than ${mb}MB`,
    fileAccessTitle: "Allow file access",
    fileAccessBody: "Allow TriCode AI to read the selected files?",
    folderAccessTitle: "Allow folder access",
    folderAccessBody:
      "Allow TriCode AI to read files from the selected folder? Only that folder will be read.",
    unsupportedFile: (name) => `File type not supported: ${name}.`,
    tooManyFiles: (max) => `You can add up to ${max} files.`,
    totalTooLarge: (mb) => `Total uploads must be under ${mb}MB.`,
    modelSwitchPhoto: (model) =>
      `We switched to "${model}" because it's great for analyzing photos.`,
    modelSwitchFile: (model) =>
      `We switched to "${model}" because it's great for analyzing files.`,
    modalOk: "OK",
    modalConfirm: "Allow",
    folderNotSupported: "Folder access is not supported in this browser.",
    folderConfirm:
      "Allow AI to scan files from a selected folder? Only the selected folder will be read.",
    noFilesFound: "No readable text files found.",
    packageError: "⚠️ Could not package files right now.",
    packageReady: (count, name) =>
      `Your ZIP package is ready (${count} files). Use the download card below.`,
    errorShort: "Error",
    networkError: "⚠️ Network error. Please try again.",
    welcomeTitle: "AI Coding Assistant",
    welcomeSubtitle:
      "Ask your coding questions — in Dari, Pashto, or English",
    placeholder: "Ask a coding question...",
    generationStopped: "Generation stopped",
  },
};

function randomWelcome(items, count = 4) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(count, arr.length));
}

function getModelLabel(activeKey, fallbackKey) {
  if (MODELS[activeKey]?.name) return MODELS[activeKey].name;
  if (typeof activeKey === "string" && activeKey.startsWith("media/")) {
    const parts = activeKey.split("/");
    const type = parts[1] || "media";
    const name = parts.slice(2).join("/") || "default";
    return `${type.toUpperCase()} - ${name}`;
  }
  if (MODELS[fallbackKey]?.name) return MODELS[fallbackKey].name;
  return activeKey || fallbackKey || "Unknown";
}

function isAllowedTextFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (TEXT_MIME_ALLOWLIST.some((p) => type.startsWith(p))) return true;
  return TEXT_EXT_ALLOWLIST.some((ext) => name.endsWith(ext));
}

function isAllowedBinaryFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (BINARY_MIME_ALLOWLIST.includes(type)) return true;
  return BINARY_EXT_ALLOWLIST.some((ext) => name.endsWith(ext));
}

function isAllowedUpload(file) {
  if (file?.type?.startsWith("image/")) return true;
  return isAllowedTextFile(file) || isAllowedBinaryFile(file);
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStoredLang() {
  if (typeof window === "undefined") return "";
  let local = "";
  try {
    local = normalizeLang(window.localStorage?.getItem(LANGUAGE_KEY));
  } catch {}
  if (local) return local;
  const cookieLang = normalizeLang(
    getLangFromCookieHeader(document.cookie || ""),
  );
  return cookieLang || "";
}

function getTotalAttachmentBytes(list = []) {
  return list.reduce((sum, item) => sum + (item?.size || 0), 0);
}

function normalizeAttachmentName(name, max = 140) {
  const raw = String(name || "");
  if (raw.length <= max) return raw;
  const keep = Math.max(0, max - 3);
  return `...${raw.slice(-keep)}`;
}

export default function Chat() {
  const [theme, setTheme] = useState("dark");
  const [user, setUser] = useState(null);
  const [convs, setConvs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [model, setModel] = useState("deepseek-v3");
  const [lang, setLang] = useState("fa");
  const [loadingConv, setLoadingConv] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [insight, setInsight] = useState(null);
  const [awaitingInsightReply, setAwaitingInsightReply] = useState(false);
  const [serverModelLabel, setServerModelLabel] = useState("");
  const [quickMode, setQuickMode] = useState("normal");
  const [imageSuggestions, setImageSuggestions] = useState([]);
  const [imageSuggestLoading, setImageSuggestLoading] = useState(false);
  const [imageSuggestError, setImageSuggestError] = useState("");
  const [availableModels, setAvailableModels] = useState({});
  const [welcomePool, setWelcomePool] = useState(DEFAULT_WELCOME_PROMPTS);
  const [welcomeItems, setWelcomeItems] = useState(() =>
    randomWelcome(DEFAULT_WELCOME_PROMPTS, 4),
  );
  const [insightLoading, setInsightLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modal, setModal] = useState(null);

  const router = useRouter();
  const endRef = useRef(null);
  const listRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const abortRef = useRef(null);
  const intervalRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const imageSuggestAbortRef = useRef(null);
  const imageSuggestTimerRef = useRef(null);
  const lastImageSuggestRef = useRef("");
  const latestImageInputRef = useRef("");
  const themeSyncRef = useRef(false);

  const t = UI_TEXT[lang] || UI_TEXT.en;
  const rtl = lang !== "en";
  const smartLabel = t.smartLabel;
  const smartCta = t.smartUse;
  const smartRefresh = t.smartRefresh;
  const activeToolLabel = t.tools?.[quickMode] || t.tools.normal;

  const showAlert = useCallback((opts) => {
    return new Promise((resolve) => {
      setModal({
        type: "alert",
        title: opts.title || "",
        message: opts.message || "",
        confirmText: opts.confirmText || t.modalOk,
        resolve,
      });
    });
  }, [t.modalOk]);

  const showConfirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setModal({
        type: "confirm",
        title: opts.title || "",
        message: opts.message || "",
        confirmText: opts.confirmText || t.modalConfirm,
        cancelText: opts.cancelText || t.cancel,
        resolve,
      });
    });
  }, [t.cancel, t.modalConfirm]);

  const closeModal = (result) => {
    if (modal?.resolve) modal.resolve(result);
    setModal(null);
  };

  const loadConvs = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) setConvs(await res.json());
    } catch {}
  }, []);

  const loadWelcomePrompts = useCallback(async () => {
    try {
      const res = await fetch(`/api/system/prompts?limit=16&t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data?.prompts) ? data.prompts : [];
      const cleaned = list
        .map((item) => ({
          fa: typeof item?.fa === "string" ? item.fa.trim() : "",
          ps: typeof item?.ps === "string" ? item.ps.trim() : "",
          en: typeof item?.en === "string" ? item.en.trim() : "",
        }))
        .filter((item) => item.fa || item.ps || item.en);

      if (cleaned.length) {
        setWelcomePool(cleaned);
        setWelcomeItems(randomWelcome(cleaned, 4));
      }
    } catch {}
  }, []);

  const refreshInsight = useCallback(
    async (active = true) => {
      try {
        setInsightLoading(true);
        const res = await fetch(
          `/api/user/insights?lang=${lang}&t=${Date.now()}`,
          { cache: "no-store" },
        );
        if (!res.ok || !active) return;
        const data = await res.json();
        if (!active) return;
        setInsight(data);
        setAwaitingInsightReply(Boolean(data));
      } catch {
        if (!active) return;
      } finally {
        if (active) setInsightLoading(false);
      }
    },
    [lang],
  );

  const normalizeImagePrompt = useCallback(
    (value) => String(value || "").trim().replace(/^\/image\s+/i, ""),
    [],
  );

  const fetchImageSuggestions = useCallback(
    async (prompt, { force = false } = {}) => {
      const trimmed = normalizeImagePrompt(prompt);
      if (quickMode !== "image") return;
      if (trimmed.length < 4) {
        setImageSuggestions([]);
        setImageSuggestError("");
        return;
      }

      if (!force && trimmed === lastImageSuggestRef.current) return;
      lastImageSuggestRef.current = trimmed;

      if (imageSuggestAbortRef.current) imageSuggestAbortRef.current.abort();
      const controller = new AbortController();
      imageSuggestAbortRef.current = controller;
      setImageSuggestLoading(true);
      setImageSuggestError("");

      try {
        const res = await csrfFetch("/api/prompt/enhance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed, language: lang }),
          signal: controller.signal,
        });
        if (!res.ok) {
          let data = {};
          try {
            data = await res.json();
          } catch {}
          throw new Error(data.message || "Failed to enhance prompt");
        }
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (latestImageInputRef.current !== trimmed) return;
        const suggestions = Array.isArray(data?.suggestions)
          ? data.suggestions.filter(Boolean)
          : [];
        setImageSuggestions(suggestions);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (latestImageInputRef.current !== trimmed) return;
        setImageSuggestions([]);
        setImageSuggestError(err?.message || "Failed to enhance prompt");
      } finally {
        if (latestImageInputRef.current === trimmed) {
          setImageSuggestLoading(false);
        }
      }
    },
    [lang, quickMode, normalizeImagePrompt],
  );

  useEffect(() => {
    if (!themeSyncRef.current) {
      themeSyncRef.current = true;
      const current = document.documentElement.getAttribute("data-theme");
      if (current && current !== theme) {
        setTheme(current);
        return;
      }
    }
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const stored = getClientLang();
    setLang(stored);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
  }, [lang, rtl]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    loadWelcomePrompts();
  }, [loadWelcomePrompts]);

  useEffect(() => {
    if (!welcomePool.length) return;
    setWelcomeItems(randomWelcome(welcomePool, 4));
  }, [welcomePool, lang]);

  useEffect(() => {
    if (!user) return;
    refreshInsight(true);
  }, [user, lang, refreshInsight]);

  useEffect(() => {
    if (!user) return;
    if (quickMode !== "image") {
      if (imageSuggestAbortRef.current) imageSuggestAbortRef.current.abort();
      setImageSuggestions([]);
      setImageSuggestError("");
      setImageSuggestLoading(false);
      lastImageSuggestRef.current = "";
      latestImageInputRef.current = "";
      return;
    }
    const trimmed = normalizeImagePrompt(input);
    latestImageInputRef.current = trimmed;
    if (imageSuggestTimerRef.current)
      clearTimeout(imageSuggestTimerRef.current);
    if (loading || trimmed.length < 4) {
      if (imageSuggestAbortRef.current) imageSuggestAbortRef.current.abort();
      setImageSuggestions([]);
      setImageSuggestError("");
      setImageSuggestLoading(false);
      return;
    }

    imageSuggestTimerRef.current = setTimeout(() => {
      fetchImageSuggestions(trimmed);
    }, IMAGE_SUGGEST_DEBOUNCE_MS);

    return () => {
      if (imageSuggestTimerRef.current)
        clearTimeout(imageSuggestTimerRef.current);
    };
  }, [
    input,
    quickMode,
    loading,
    user,
    fetchImageSuggestions,
    normalizeImagePrompt,
  ]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) {
          router.push("/login");
          return null;
        }
        return r.json();
      })
      .then((u) => {
        if (!u || !active) return;
        setUser(u);
        const storedLang = getStoredLang();
        const userLang = normalizeLang(u.language) || "";
        const resolvedLang = storedLang || userLang || "fa";
        setLang(resolvedLang);
        if (storedLang) {
          setClientLang(storedLang);
          if (storedLang !== userLang) {
            csrfFetch("/api/user/preferences", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ language: storedLang }),
            }).catch(() => {});
          }
        } else if (userLang) {
          setClientLang(userLang);
        } else {
          setClientLang(resolvedLang);
        }
        setModel(u.preferredModel || "deepseek-v3");
        setServerModelLabel(u.preferredModel || "deepseek-v3");
        fetch("/api/system/public")
          .then((r) => (r.ok ? r.json() : null))
          .then((cfg) => {
            if (!cfg) return;
            if (!active) return;
            setAvailableModels(cfg.availableModels || {});
          })
          .catch(() => {});
        loadConvs();
      })
      .catch(() => router.push("/login"));
    return () => {
      active = false;
    };
  }, [router, loadConvs]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const scroll = useCallback(() => {
    if (!shouldAutoScrollRef.current) return;
    setTimeout(
      () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
      40,
    );
  }, []);

  useEffect(() => {
    scroll();
  }, [messages, streamText]);

  const onListWheel = (e) => {
    if (e.deltaY < 0) shouldAutoScrollRef.current = false;
  };

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    shouldAutoScrollRef.current = nearBottom;
  };

  const loadConv = async (id) => {
    if (id === activeId) return;
    setLoadingConv(true);
    setMessages([]);
    setStreamText("");
    setStreaming(false);
    try {
      const res = await fetch(`/api/conversation/${id}`);
      if (res.ok) {
        const d = await res.json();
        setMessages(d.messages || []);
        setActiveId(id);
      }
    } catch {}
    setLoadingConv(false);
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setStreamText("");
    setStreaming(false);
    setInput("");
    setAttachments([]);
    setWelcomeItems(randomWelcome(welcomePool, 4));
  };

  const applyInsight = () => {
    if (!insight?.updateQuery) return;
    const text = `/deep ${insight.updateQuery}`;
    setInput(text);
    if (taRef.current) {
      taRef.current.focus();
      taRef.current.style.height = "auto";
      taRef.current.style.height =
        Math.min(taRef.current.scrollHeight, 180) + "px";
    }
  };

  const applyImageSuggestion = (text) => {
    const next = String(text || "").trim();
    if (!next) return;
    setInput(next);
    if (taRef.current) {
      taRef.current.focus();
      taRef.current.style.height = "auto";
      taRef.current.style.height =
        Math.min(taRef.current.scrollHeight, 180) + "px";
    }
  };

  const deleteConv = async (id) => {
    const res = await csrfFetch(`/api/conversations?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    if (activeId === id) newChat();
    setConvs((p) => p.filter((c) => c._id !== id));
  };

  const handleModelChange = async (nextModel) => {
    if (availableModels?.[nextModel] === false) return;
    setModel(nextModel);
    setServerModelLabel(nextModel);
    try {
      await csrfFetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredModel: nextModel }),
      });
    } catch {}
  };

  const cancel = () => {
    const partial = streamText;
    if (abortRef.current) abortRef.current.abort();
    if (intervalRef.current) clearInterval(intervalRef.current);
    setLoading(false);
    setStreaming(false);
    setStreamText("");
    if (partial?.trim()) {
      setMessages((p) => [
        ...p,
        {
          _id: "a_cancel_" + Date.now(),
          role: "assistant",
          content: `${partial}\n\n[${t.generationStopped}]`,
          createdAt: new Date(),
        },
      ]);
    }
  };

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const allow = await showConfirm({
      title: t.fileAccessTitle,
      message: t.fileAccessBody,
    });
    if (!allow) {
      e.target.value = "";
      return;
    }

    const remainingSlots = Math.max(
      0,
      MAX_ATTACHMENTS_CLIENT - attachments.length,
    );
    if (remainingSlots === 0) {
      await showAlert({
        title: t.errorShort,
        message: t.tooManyFiles(MAX_ATTACHMENTS_CLIENT),
      });
      e.target.value = "";
      return;
    }
    if (files.length > remainingSlots) {
      await showAlert({
        title: t.errorShort,
        message: t.tooManyFiles(MAX_ATTACHMENTS_CLIENT),
      });
    }
    const queue = files.slice(0, remainingSlots);
    let totalBytes = getTotalAttachmentBytes(attachments);
    let totalLimitShown = false;

    for (const f of queue) {
      if (f.size > MAX_UPLOAD_BYTES) {
        await showAlert({
          title: t.errorShort,
          message: t.fileTooLarge(f.name, MAX_UPLOAD_MB),
        });
        continue;
      }
      if (!isAllowedUpload(f)) {
        await showAlert({
          title: t.errorShort,
          message: t.unsupportedFile(f.name),
        });
        continue;
      }
      if (totalBytes + f.size > MAX_TOTAL_UPLOAD_BYTES) {
        if (!totalLimitShown) {
          await showAlert({
            title: t.errorShort,
            message: t.totalTooLarge(MAX_TOTAL_UPLOAD_MB),
          });
          totalLimitShown = true;
        }
        continue;
      }
      totalBytes += f.size;
      const isImg = f.type.startsWith("image/");
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments((p) => [
          ...p,
          {
            type: isImg ? "image" : "file",
            name: f.name,
            url: ev.target.result,
            mimeType: f.type,
            size: f.size,
          },
        ]);
      };
      reader.readAsDataURL(f);
    }
    e.target.value = "";
  };

  const isPositive = (txt) =>
    /^(yes|y|ok|okay|sure|yeah|yes please|بله|بلی|آره|اره|باشه|هو|ها)$/i.test(
      (txt || "").trim(),
    );

  const shouldPackage = (txt) => {
    const t = (txt || "").toLowerCase();
    return (
      (t.includes("package") ||
        t.includes("zip") ||
        t.includes("bundle") ||
        t.includes("archive") ||
        t.includes("بسته") ||
        t.includes("زیپ") ||
        t.includes("پکیج") ||
        t.includes("بنډل")) &&
      isPositive(t)
    );
  };

  const confirmedPackagingReply = (txt) => {
    if (!isPositive(txt)) return false;
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const last = (lastAssistant?.content || "").toLowerCase();
    return (
      last.includes("package") ||
      last.includes("zip") ||
      last.includes("bundle") ||
      last.includes("archive") ||
      last.includes("بسته") ||
      last.includes("زیپ") ||
      last.includes("پکیج") ||
      last.includes("بنډل")
    );
  };

  const packageConversation = async (conversationId = null) => {
    const convId = conversationId || activeId;
    if (!convId) return null;
    const res = await csrfFetch("/api/package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: convId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const bytes = Uint8Array.from(atob(data.zipBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    return { url, fileName: data.fileName, fileCount: data.fileCount };
  };

  const connectFolderAndSearch = async () => {
    if (typeof window === "undefined" || !window.showDirectoryPicker) {
      await showAlert({ title: t.errorShort, message: t.folderNotSupported });
      return;
    }
    const allow = await showConfirm({
      title: t.folderAccessTitle,
      message: t.folderAccessBody,
    });
    if (!allow) return;

    let dir;
    try {
      dir = await window.showDirectoryPicker();
    } catch {
      return;
    }
    const found = [];
    const maxFiles = Math.max(
      0,
      MAX_ATTACHMENTS_CLIENT - attachments.length,
    );
    if (maxFiles === 0) {
      await showAlert({
        title: t.errorShort,
        message: t.tooManyFiles(MAX_ATTACHMENTS_CLIENT),
      });
      return;
    }

    const toDataUrl = async (file) => {
      if (isAllowedTextFile(file)) {
        const text = await file.text();
        const b64 = btoa(unescape(encodeURIComponent(text)));
        return `data:${file.type || "text/plain"};base64,${b64}`;
      }
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);
      return `data:${file.type || "application/octet-stream"};base64,${b64}`;
    };

    let totalBytes = getTotalAttachmentBytes(attachments);
    let totalLimitHit = false;

    const walk = async (handle, prefix = "") => {
      if (found.length >= maxFiles) return;
      if (totalBytes >= MAX_TOTAL_UPLOAD_BYTES) {
        totalLimitHit = true;
        return;
      }
      for await (const [name, entry] of handle.entries()) {
        if (found.length >= maxFiles) break;
        if (entry.kind === "directory") {
          await walk(entry, `${prefix}${name}/`);
          continue;
        }
        const file = await entry.getFile();
        if (file.size > MAX_UPLOAD_BYTES) continue;
        if (!isAllowedUpload(file)) continue;
        if (totalBytes + file.size > MAX_TOTAL_UPLOAD_BYTES) {
          totalLimitHit = true;
          continue;
        }
        const url = await toDataUrl(file);
        found.push({
          type: file.type.startsWith("image/") ? "image" : "file",
          name: `${prefix}${name}`,
          url,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          source: "folder",
        });
        totalBytes += file.size;
      }
    };

    const rootPrefix = `${dir.name}/`;
    await walk(dir, rootPrefix);
    if (found.length === 0) {
      await showAlert({ title: t.errorShort, message: t.noFilesFound });
      return;
    }
    if (totalLimitHit) {
      await showAlert({
        title: t.errorShort,
        message: t.totalTooLarge(MAX_TOTAL_UPLOAD_MB),
      });
    }
    setAttachments((p) => [...p, ...found]);
  };

  const send = async () => {
    let msg = input.trim();
    if ((!msg && !attachments.length) || loading) return;

    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";

    if ((shouldPackage(msg) || confirmedPackagingReply(msg)) && activeId) {
      setLoading(true);
      try {
        const packed = await packageConversation();
        if (!packed) throw new Error("package failed");
        const reply = t.packageReady(packed.fileCount, packed.fileName);
        setMessages((p) => [
          ...p,
          {
            _id: "u_temp_" + Date.now(),
            role: "user",
            content: msg,
            attachments: [],
            createdAt: new Date(),
          },
          {
            _id: "a_" + Date.now(),
            role: "assistant",
            content: reply,
            model: "packager",
            attachments: [
              {
                type: "download",
                name: packed.fileName,
                url: packed.url,
                mimeType: "application/zip",
              },
            ],
            createdAt: new Date(),
          },
        ]);
      } catch {
        setMessages((p) => [
          ...p,
          {
            _id: "e_" + Date.now(),
            role: "assistant",
            content: t.packageError,
            createdAt: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (awaitingInsightReply && isPositive(msg) && insight?.updateQuery) {
      msg = `/deep ${insight.updateQuery}`;
      setAwaitingInsightReply(false);
    } else if (awaitingInsightReply && !isPositive(msg)) {
      setAwaitingInsightReply(false);
    }

    if (msg && !msg.startsWith("/")) {
      const prefixes = {
        web: "/web",
        deep: "/deep",
        think: "/think",
        image: "/image",
        video: "/video",
      };
      let modeToUse = quickMode;
      if (quickMode === "normal") {
        const lower = msg.toLowerCase();
        const naturalImage =
          /(generate|create|make|draw)\s+(an?\s+)?(image|photo|phote|pic|picture)\b|photo of|image of|تصویر\s*(بساز|بسازید|تولید کن|تولید کنید)|عکس\s*(بساز|بسازید|تولید کن|تولید کنید)|انځور\s*(جوړ|جوړ کړه|جوړ کړئ)|عکس\s*(جوړ|جوړ کړه|جوړ کړئ)/i.test(
            lower,
          );
        const naturalVideo =
          /(generate|create|make)\s+(an?\s+)?video\b|text to video|video of|ویدیو\s*(بساز|بسازید|تولید کن|تولید کنید)|انیمیشن\s*(بساز|بسازید)|ویډیو\s*(جوړ|جوړ کړه|جوړ کړئ)/i.test(
            lower,
          );
        if (naturalImage) modeToUse = "image";
        else if (naturalVideo) modeToUse = "video";
      }

      const prefix = prefixes[modeToUse];
      if (prefix) msg = `${prefix} ${msg}`;
    }

    const hasImageAttachment = attachments.some((a) => a?.type === "image");
    const hasFileAttachment = attachments.some((a) => a?.type === "file");
    let activeModelKey = model;
    let noticeMessage = "";

    if (
      autoOptimize &&
      (hasImageAttachment || hasFileAttachment) &&
      !msg.startsWith("/image") &&
      !msg.startsWith("/video")
    ) {
      const targetKey = hasImageAttachment
        ? VISION_MODEL_KEY
        : hasFileAttachment
          ? FILE_MODEL_KEY
          : null;
      if (
        targetKey &&
        MODELS[targetKey] &&
        availableModels?.[targetKey] !== false &&
        targetKey !== model
      ) {
        activeModelKey = targetKey;
        const label = getModelLabel(targetKey, model);
        noticeMessage = hasImageAttachment
          ? t.modelSwitchPhoto(label)
          : t.modelSwitchFile(label);
        setModel(targetKey);
        setServerModelLabel(targetKey);
      }
    }

    const now = Date.now();
    const tempId = "u_temp_" + now;
    const userMsg = {
      _id: tempId,
      role: "user",
      content: msg,
      attachments,
      createdAt: new Date(),
    };
    setMessages((p) => {
      if (!noticeMessage) return [...p, userMsg];
      return [
        ...p,
        {
          _id: "notice_" + now,
          role: "assistant",
          content: noticeMessage,
          createdAt: new Date(),
        },
        userMsg,
      ];
    });
    const sentAttachments = attachments.map((a) => ({
      type: a.type,
      name: normalizeAttachmentName(a.name),
      url: a.url,
      mimeType: String(a.mimeType || "").slice(0, 140),
      size: a.size,
    }));
    setAttachments([]);
    setLoading(true);
    setStreaming(false);
    setStreamText("");
    shouldAutoScrollRef.current = true;
    scroll();
    try {
      abortRef.current = new AbortController();
      const res = await csrfFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          conversationId: activeId,
          language: lang,
          modelKey: activeModelKey,
          attachments: sentAttachments,
          autoOptimize,
          stream: true,
          taskType: quickMode,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        let data = null;
        try {
          data = await res.clone().json();
        } catch {}

        if (res.status === 401 && (data?.message || "") === "Unauthorized") {
          router.push("/login");
          return;
        }

        const contentType = res.headers.get("content-type") || "";
        const serverMessage = String(data?.message || "").trim();
        const displayMessage =
          serverMessage ||
          (contentType.includes("application/json")
            ? ""
            : `${t.errorShort} (${res.status})`);

        setMessages((p) => [
          ...p.filter((m) => m._id !== tempId),
          {
            _id: "e_" + Date.now(),
            role: "assistant",
            content: `⚠️ ${displayMessage || t.errorShort}`,
            createdAt: new Date(),
          },
        ]);
        setLoading(false);
        return;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const data = await res.json();
        if (data.conversationId && data.conversationId !== activeId)
          setActiveId(data.conversationId);
        if (data.modelKey) setServerModelLabel(data.modelKey);
        const replyText = data.fullReply || data.reply || "";
        setMessages((p) => [
          ...p,
          {
            _id: "a_" + Date.now(),
            role: "assistant",
            content: replyText,
            model: data.model,
            attachments: data.attachments || [],
            createdAt: new Date(),
          },
        ]);
        setLoading(false);
        if (data.zipBase64) {
          try {
            const bytes = Uint8Array.from(atob(data.zipBase64), (c) =>
              c.charCodeAt(0),
            );
            const blob = new Blob([bytes], { type: "application/zip" });
            const url = URL.createObjectURL(blob);
            const reply = t.packageReady(
              data.fileCount || 0,
              data.fileName || "project.zip",
            );
            setMessages((p) => [
              ...p,
              {
                _id: "p_" + Date.now(),
                role: "assistant",
                content: reply,
                model: "packager",
                attachments: [
                  {
                    type: "download",
                    name: data.fileName || "project.zip",
                    url,
                    mimeType: "application/zip",
                  },
                ],
                createdAt: new Date(),
              },
            ]);
          } catch {
            setMessages((p) => [
              ...p,
              {
                _id: "p_err_" + Date.now(),
                role: "assistant",
                content: t.packageError,
                createdAt: new Date(),
              },
            ]);
          }
        } else if (data.autoPackage && data.conversationId) {
          try {
            const packed = await packageConversation(data.conversationId);
            if (packed) {
            const reply = t.packageReady(packed.fileCount, packed.fileName);
            setMessages((p) => [
              ...p,
              {
                _id: "p_" + Date.now(),
                role: "assistant",
                content: reply,
                model: "packager",
                attachments: [
                  {
                    type: "download",
                    name: packed.fileName,
                    url: packed.url,
                    mimeType: "application/zip",
                  },
                ],
                createdAt: new Date(),
              },
            ]);
            }
          } catch {
            setMessages((p) => [
              ...p,
              {
                _id: "p_err_" + Date.now(),
                role: "assistant",
                content: t.packageError,
                createdAt: new Date(),
              },
            ]);
          }
        }
        loadConvs();
        return;
      }

      setStreaming(true);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Streaming reader unavailable");
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let built = "";
      let finalModel = "";
      let finalAttachments = [];
      let finalConversationId = activeId;
      let autoPackage = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const rawEvent of chunks) {
          const lines = rawEvent.split("\n");
          const eventLine = lines.find((line) => line.startsWith("event:"));
          const dataLine = lines.find((line) => line.startsWith("data:"));
          if (!eventLine || !dataLine) continue;

          const eventName = eventLine.slice(6).trim();
          let payload = {};
          try {
            payload = JSON.parse(dataLine.slice(5).trim());
          } catch {}

          if (eventName === "start") {
            if (payload.conversationId && payload.conversationId !== activeId)
              setActiveId(payload.conversationId);
            if (payload.modelKey) setServerModelLabel(payload.modelKey);
            if (payload.model) finalModel = payload.model;
            if (payload.conversationId) finalConversationId = payload.conversationId;
          } else if (eventName === "delta") {
            const text = payload.text || "";
            if (text) {
              built += text;
              setStreamText(built);
            }
          } else if (eventName === "done") {
            if (payload.modelKey) setServerModelLabel(payload.modelKey);
            if (payload.model) finalModel = payload.model;
            if (payload.reply) built = payload.reply;
            if (Array.isArray(payload.attachments))
              finalAttachments = payload.attachments;
            if (payload.conversationId) finalConversationId = payload.conversationId;
            autoPackage = Boolean(payload.autoPackage);
          } else if (eventName === "error") {
            throw new Error(payload.message || "Streaming failed");
          }
        }
      }

      setStreaming(false);
      setStreamText("");
      if (built.trim()) {
        setMessages((p) => [
          ...p,
          {
            _id: "a_" + Date.now(),
            role: "assistant",
            content: built,
            model: finalModel || undefined,
            attachments: finalAttachments,
            createdAt: new Date(),
          },
        ]);
      }
      setLoading(false);
      if (autoPackage && finalConversationId) {
        try {
          const packed = await packageConversation(finalConversationId);
          if (packed) {
            const reply = t.packageReady(packed.fileCount, packed.fileName);
            setMessages((p) => [
              ...p,
              {
                _id: "p_" + Date.now(),
                role: "assistant",
                content: reply,
                model: "packager",
                attachments: [
                  {
                    type: "download",
                    name: packed.fileName,
                    url: packed.url,
                    mimeType: "application/zip",
                  },
                ],
                createdAt: new Date(),
              },
            ]);
          }
        } catch {
          setMessages((p) => [
            ...p,
            {
              _id: "p_err_" + Date.now(),
              role: "assistant",
              content: t.packageError,
              createdAt: new Date(),
            },
          ]);
        }
      }
      loadConvs();
    } catch (err) {
      if (err.name === "AbortError") {
        // Keep the user message and streamed partial output when cancelled.
      } else {
        setMessages((p) => [
          ...p,
          {
            _id: "e_" + Date.now(),
            role: "assistant",
            content: t.networkError,
            createdAt: new Date(),
          },
        ]);
      }
      setLoading(false);
      setStreaming(false);
    }
  };

  const logout = async () => {
    await csrfFetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const isRTL = (t) => /[\u0600-\u06FF]/.test(t?.slice(0, 50));
  const ph =
    quickMode === "image"
      ? t.imagePlaceholder || t.placeholder
      : t.placeholder;
  const groupedAttachments = (() => {
    const folders = new Map();
    const files = [];
    attachments.forEach((a, idx) => {
      const name = String(a.name || "");
      if (name.includes("/")) {
        const [root, ...rest] = name.split("/");
        if (!folders.has(root)) {
          folders.set(root, { name: root, items: [], size: 0, indexes: [] });
        }
        const entry = folders.get(root);
        entry.items.push({
          ...a,
          displayName: rest.join("/") || name,
          idx,
        });
        entry.indexes.push(idx);
        entry.size += a.size || 0;
      } else {
        files.push({ ...a, idx });
      }
    });
    return { folders: Array.from(folders.values()), files };
  })();

  if (!user)
    return (
      <div
        style={{
          height: "var(--app-height)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-base)",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            border: "3px solid var(--border-default)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
            animation: "spin .7s linear infinite",
          }}
        />
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: rtl ? "row-reverse" : "row",
        height: "var(--app-height)",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <Sidebar
        conversations={convs}
        activeId={activeId}
        onNewChat={newChat}
        onSelect={loadConv}
        onDelete={deleteConv}
        model={model}
        onModelChange={handleModelChange}
        availableModels={availableModels}
        autoOptimize={autoOptimize}
        onToggleAutoOptimize={() => setAutoOptimize((v) => !v)}
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        language={lang}
        user={user}
        onLogout={logout}
        onAdmin={() => router.push("/admin")}
        isMobile={isMobile}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {isMobile && mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            zIndex: 19,
          }}
        />
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
          direction: rtl ? "rtl" : "ltr",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: isMobile ? "52px" : "56px",
            padding: isMobile ? "0 10px" : "0 24px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-surface)",
            display: "flex",
            flexDirection: rtl ? "row-reverse" : "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {isMobile && (
              <button
                onClick={() => setMobileSidebarOpen(true)}
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
            )}
            <img
              src="/tricode-mark.svg"
              alt="TriCode AI"
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "9px",
                background: "#fff",
                padding: "2px",
                boxShadow: "var(--glow)",
              }}
            />
            <div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-1)",
                  letterSpacing: "-0.2px",
                }}
              >
                TriCode AI
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--green)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  maxWidth: isMobile ? "160px" : "none",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "var(--green)",
                    display: "inline-block",
                  }}
                />
                {t.online} · {getModelLabel(serverModelLabel, model)}
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobile ? "6px" : "10px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-3)",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {!isMobile && <>{t.welcomeBack(user.name)}</>}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-3)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: "99px",
                padding: "2px 10px",
              }}
            >
              {user.usageToday || 0}/{user.dailyLimit} {t.usageToday}
            </div>
          </div>
        </div>

        {insight && (
          <div
            style={{
              padding: isMobile ? "10px 12px" : "10px 24px",
              borderBottom: "1px solid var(--border-subtle)",
              background: "var(--bg-surface)",
            }}
            dir={rtl ? "rtl" : "ltr"}
          >
            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: "14px",
                padding: "10px 14px",
                boxShadow: "var(--sh1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "10px",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flex: "1 1 auto",
                    minWidth: "220px",
                    textAlign: rtl ? "right" : "left",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--accent)",
                      background: "var(--accent-muted)",
                      border: "1px solid var(--border-strong)",
                      padding: "2px 10px",
                      borderRadius: "999px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {smartLabel}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--text-2)",
                      lineHeight: 1.7,
                    }}
                  >
                    {insight.suggestion}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  <button
                    className="btn-ghost"
                    onClick={applyInsight}
                    disabled={!insight?.updateQuery}
                    style={{ padding: "6px 12px", fontSize: "12px" }}
                  >
                    {smartCta}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => refreshInsight(true)}
                    disabled={insightLoading}
                    style={{ padding: "6px 12px", fontSize: "12px" }}
                  >
                    {insightLoading ? "..." : smartRefresh}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div
          ref={listRef}
          onScroll={onListScroll}
          onWheel={onListWheel}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? "12px 10px" : "28px 32px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {/* Welcome */}
          {messages.length === 0 && !loadingConv && (
            <div
              className="fade-up"
              style={{
                margin: "auto",
                maxWidth: "580px",
                textAlign: "center",
                padding: "20px 0",
              }}
              dir={rtl ? "rtl" : "ltr"}
            >
              <img
                src="/tricode-logo.svg"
                alt="TriCode AI"
                style={{
                  width: "160px",
                  height: "auto",
                  margin: "0 auto 18px",
                  display: "block",
                  filter: "drop-shadow(0 8px 20px var(--accent-glow))",
                }}
              />
              <h2
                style={{
                  fontSize: "23px",
                  fontWeight: 700,
                  letterSpacing: "-0.5px",
                  marginBottom: "10px",
                }}
              >
                <span className="g-text">{t.welcomeTitle}</span>
              </h2>
              <p
                style={{
                  color: "var(--text-2)",
                  fontSize: "14px",
                  marginBottom: "30px",
                  lineHeight: 1.75,
                }}
              >
                {t.welcomeSubtitle}
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  justifyContent: "center",
                }}
              >
                {welcomeItems.map((w, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(w[lang] || w.en)}
                    style={{
                      padding: "9px 16px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-2)",
                      fontSize: "13px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all .18s",
                      direction: isRTL(w[lang]) ? "rtl" : "ltr",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.color = "var(--accent)";
                      e.currentTarget.style.background = "var(--accent-muted)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor =
                        "var(--border-default)";
                      e.currentTarget.style.color = "var(--text-2)";
                      e.currentTarget.style.background = "var(--bg-elevated)";
                    }}
                  >
                    {w[lang] || w.en}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loadingConv && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "10px",
                    justifyContent: i % 2 === 0 ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    className="skel"
                    style={{
                      width: i % 2 === 0 ? "45%" : "62%",
                      height: "64px",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {!loadingConv &&
            messages.map((m, idx) => (
              <div key={m._id || idx} style={{ marginBottom: "6px" }}>
                <Message
                  role={m.role}
                  content={m.content}
                  model={m.model}
                  attachments={m.attachments}
                  theme={theme}
                  compact={isMobile}
                  language={lang}
                />
              </div>
            ))}

          {/* Streaming */}
          {streaming && streamText && (
            <div style={{ marginBottom: "6px" }}>
              <Message
                role="assistant"
                content={streamText}
                isStreaming
                theme={theme}
                compact={isMobile}
                language={lang}
              />
            </div>
          )}

          {/* Typing */}
          {loading && !streaming && (
            <div
              className="slide-l"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "6px",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  background:
                    "linear-gradient(135deg,var(--accent),var(--green))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                AI
              </div>
              <div
                style={{
                  background: "var(--ai-bg)",
                  border: "1px solid var(--ai-br)",
                  borderRadius: "18px 18px 18px 4px",
                  padding: "13px 18px",
                  display: "flex",
                  gap: "5px",
                  alignItems: "center",
                }}
              >
                <span className="t-dot" />
                <span className="t-dot" />
                <span className="t-dot" />
              </div>
            </div>
          )}

          {/* Typing status text */}
          {loading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontSize: "12px",
                color: "var(--text-3)",
                marginBottom: "8px",
              }}
            >
              <span
                style={{
                  width: "13px",
                  height: "13px",
                  border: "2px solid var(--border-default)",
                  borderTopColor: "var(--accent)",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin .7s linear infinite",
                }}
              />
              <span>{t.typing}</span>
            </div>
          )}

          {/* Cancel button */}
          {loading && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "8px",
              }}
            >
              <button
                onClick={cancel}
                style={{
                  padding: "6px 20px",
                  borderRadius: "8px",
                  border: "1px solid var(--danger)",
                  background: "transparent",
                  color: "var(--danger)",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all .15s",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(248,113,113,.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                {t.cancel}
              </button>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div
            style={{
              padding: isMobile ? "8px 10px 0" : "8px 24px 0",
              display: "grid",
              gap: "10px",
              gridTemplateColumns: isMobile
                ? "1fr"
                : "repeat(auto-fit, minmax(220px, 1fr))",
              background: "var(--bg-surface)",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {groupedAttachments.folders.map((folder) => (
              <div
                key={folder.name}
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "12px",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    marginBottom: "6px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "10px",
                        background: "var(--accent-muted)",
                        color: "var(--accent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "16px",
                      }}
                    >
                      📁
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-1)",
                          fontWeight: 600,
                        }}
                      >
                        {folder.name}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-3)" }}>
                        {folder.items.length} files · {formatBytes(folder.size)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setAttachments((p) =>
                        p.filter((_, i) => !folder.indexes.includes(i)),
                      )
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--danger)",
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    fontSize: "11px",
                    color: "var(--text-3)",
                    maxHeight: "120px",
                    overflowY: "auto",
                  }}
                >
                  {folder.items.slice(0, 6).map((f) => (
                    <div
                      key={f.idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span>•</span>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {f.displayName}
                      </span>
                    </div>
                  ))}
                  {folder.items.length > 6 && (
                    <div style={{ color: "var(--text-4)" }}>
                      +{folder.items.length - 6} more
                    </div>
                  )}
                </div>
              </div>
            ))}

            {groupedAttachments.files.map((a) => (
              <div
                key={`${a.name}-${a.idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "12px",
                  padding: "10px",
                }}
              >
                {a.type === "image" ? (
                  <img
                    src={a.url}
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "8px",
                      objectFit: "cover",
                      border: "1px solid var(--border-subtle)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "8px",
                      background: "var(--bg-overlay)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-2)",
                      fontSize: "16px",
                    }}
                  >
                    {String(a.name || "").toLowerCase().endsWith(".pdf")
                      ? "📄"
                      : String(a.name || "").toLowerCase().endsWith(".zip")
                        ? "🗜️"
                        : "📄"}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-1)",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {a.name}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-3)" }}>
                    {formatBytes(a.size || 0)}
                  </div>
                </div>
                <button
                  onClick={() =>
                    setAttachments((p) => p.filter((_, j) => j !== a.idx))
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-3)",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div
          style={{
            padding: isMobile ? "8px 10px 12px" : "12px 24px 18px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-surface)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              maxWidth: "820px",
              margin: "0 auto 8px",
              display: "flex",
              gap: "6px",
              flexWrap: "nowrap",
              overflowX: "auto",
              paddingBottom: isMobile ? "2px" : "0",
            }}
          >
            {[
              ["normal", t.tools.normal],
              ["expert", t.tools.expert],
              ["image", t.tools.image],
              ["video", t.tools.video],
              ["web", t.tools.web],
              ["think", t.tools.think],
              ["deep", t.tools.deep],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setQuickMode(key)}
                style={{
                  border: "1px solid",
                  borderColor:
                    quickMode === key
                      ? "var(--accent)"
                      : "var(--border-default)",
                  background:
                    quickMode === key
                      ? "var(--accent-muted)"
                      : "var(--bg-elevated)",
                  color: quickMode === key ? "var(--accent)" : "var(--text-2)",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  fontSize: "11px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            style={{
              maxWidth: "820px",
              margin: "0 auto",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: "14px",
              padding: "10px 12px",
              display: "flex",
              gap: "8px",
              alignItems: "flex-end",
              transition: "border-color .2s,box-shadow .2s",
            }}
            onFocusCapture={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-muted)";
            }}
            onBlurCapture={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {/* File upload */}
            <button
              onClick={() => fileRef.current?.click()}
              title={t.uploadTitle}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "9px",
                border: "none",
                background: "var(--bg-overlay)",
                color: "var(--text-2)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.background = "var(--accent-muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-2)";
                e.currentTarget.style.background = "var(--bg-overlay)";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button
              onClick={connectFolderAndSearch}
              title={t.connectFolderTitle}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "9px",
                border: "none",
                background: "var(--bg-overlay)",
                color: "var(--text-2)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.background = "var(--accent-muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-2)";
                e.currentTarget.style.background = "var(--bg-overlay)";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 7h5l2 2h11v11H3z" />
                <path d="M3 7V5h6" />
              </svg>
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.csv,.html,.css,.xml,.yml,.yaml,.env,.env.local,.env.production,.env.development,.pdf,.zip"
              onChange={handleFile}
              style={{ display: "none" }}
            />

            <textarea
              ref={taRef}
              className="inp"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 180) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={ph}
              disabled={loading}
              style={{
                minHeight: "24px",
                maxHeight: "180px",
                direction: isRTL(input) ? "rtl" : "ltr",
              }}
            />

            <button
              className="btn-send"
              onClick={send}
              disabled={loading || (!input.trim() && !attachments.length)}
              title={t.sendTitle}
            >
              {loading ? (
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  style={{ animation: "spin .8s linear infinite" }}
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              ) : (
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                >
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
                </svg>
              )}
            </button>
          </div>
          {quickMode === "image" &&
            (imageSuggestLoading ||
              imageSuggestions.length > 0 ||
              input.trim()) && (
            <div
              style={{
                maxWidth: "820px",
                margin: "8px auto 0",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: "12px",
                padding: "8px 10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  marginBottom: "6px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-2)",
                  }}
                >
                  {t.imageSuggestLabel}
                </span>
                <button
                  className="btn-ghost"
                  onClick={() => fetchImageSuggestions(input, { force: true })}
                  disabled={imageSuggestLoading || !input.trim()}
                  style={{ padding: "4px 10px", fontSize: "11px" }}
                >
                  {imageSuggestLoading ? "..." : t.imageSuggestRefresh}
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                }}
              >
                {imageSuggestions.map((s, i) => (
                  <button
                    key={`${i}-${s.slice(0, 24)}`}
                    onClick={() => applyImageSuggestion(s)}
                    style={{
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-overlay)",
                      color: "var(--text-1)",
                      borderRadius: "999px",
                      padding: "4px 10px",
                      fontSize: "11px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    title={s}
                  >
                    {s}
                  </button>
                ))}
                {!imageSuggestLoading &&
                  !imageSuggestions.length &&
                  input.trim().length >= 4 && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--text-3)",
                      }}
                    >
                      {imageSuggestError || "..."}
                    </span>
                  )}
              </div>
            </div>
          )}
          <div
            style={{
              textAlign: "center",
              marginTop: "7px",
              fontSize: "11px",
              color: "var(--text-3)",
            }}
          >
            {t.activeTool}: {activeToolLabel} - {t.manualHint}
          </div>
        </div>
      </div>

      {modal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "20px",
          }}
        >
          <div
            dir={rtl ? "rtl" : "ltr"}
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: "14px",
              boxShadow: "var(--sh3)",
              padding: "16px",
            }}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "var(--text-1)",
                marginBottom: "8px",
              }}
            >
              {modal.title}
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "var(--text-2)",
                lineHeight: 1.7,
                marginBottom: "14px",
              }}
            >
              {modal.message}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
                flexDirection: rtl ? "row-reverse" : "row",
              }}
            >
              {modal.type === "confirm" && (
                <button
                  onClick={() => closeModal(false)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-default)",
                    background: "transparent",
                    color: "var(--text-2)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "12px",
                  }}
                >
                  {modal.cancelText || t.cancel}
                </button>
              )}
              <button
                onClick={() => closeModal(true)}
                style={{
                  padding: "7px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--accent)",
                  background: "var(--accent-muted)",
                  color: "var(--accent)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                {modal.confirmText || t.modalOk}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export async function getServerSideProps({ req }) {
  const token = req.cookies?.token || "";
  const user = verifyToken(token);

  if (!user || user.scope !== "user" || user.stage || !user.jti) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  return { props: {} };
}





import "@/styles/globals.css";
import { useEffect } from "react";
import { Fira_Code, Plus_Jakarta_Sans, Vazirmatn } from "next/font/google";
import { getClientTemplate, getTemplateTheme } from "../lib/template";

const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-vazirmatn",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export default function App({ Component, pageProps }) {
  useEffect(() => {
    const template = getClientTemplate();
    document.documentElement.setAttribute("data-template", template);
    document.documentElement.setAttribute("data-theme", getTemplateTheme(template));
  }, []);
  return (
    <div className={`${vazirmatn.variable} ${jakarta.variable} ${firaCode.variable}`}>
      <Component {...pageProps} />
    </div>
  );
}

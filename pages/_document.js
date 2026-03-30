import { Html, Head, Main, NextScript } from "next/document";
export default function Document() {
  return (
    <Html lang="fa" dir="rtl">
      <Head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta name="theme-color" content="#020202" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

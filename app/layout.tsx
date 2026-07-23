import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Sites Relay · API 中继与静态网页镜像";
const description =
  "A policy-constrained, fixed-upstream relay for ChatGPT Sites, with JSON/SSE streaming and an optional sanitized static web mirror.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const baseUrl = getRequestBaseUrl(requestHeaders);
  const socialImage = baseUrl
    ? new URL("/og.png", baseUrl).toString()
    : undefined;

  return {
    title,
    description,
    applicationName: "Sites Relay",
    category: "developer tools",
    keywords: [
      "ChatGPT Sites",
      "API relay",
      "JSON API",
      "Server-Sent Events",
      "SSE",
      "static web mirror",
      "fixed upstream",
    ],
    metadataBase: baseUrl,
    openGraph: {
      title,
      description,
      siteName: "Sites Relay",
      images: socialImage
        ? [
            {
              url: socialImage,
              width: 1731,
              height: 909,
              alt: "Sites Relay · API 中继与静态网页镜像",
            },
          ]
        : undefined,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: socialImage ? [socialImage] : undefined,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}

function getRequestBaseUrl(requestHeaders: Headers): URL | undefined {
  const forwardedHost = requestHeaders
    .get("x-forwarded-host")
    ?.split(",", 1)[0]
    .trim();
  const host = forwardedHost ?? requestHeaders.get("host")?.trim();
  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) {
    return undefined;
  }

  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    .trim()
    .toLowerCase();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";

  try {
    return new URL(`${protocol}://${host}`);
  } catch {
    return undefined;
  }
}

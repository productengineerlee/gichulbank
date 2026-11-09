import type { MetadataRoute } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gichulbank.vercel.app").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/auth", "/mypage", "/dashboard", "/review", "/practice"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

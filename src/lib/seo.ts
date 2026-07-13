export const SITE_NAME = "EdgeTrace";
export const SITE_URL = "https://www.edgetrace.app";
export const SOCIAL_IMAGE_PATH = "/brand/edgetrace-marketing-hero-v2.png";
export const SOCIAL_IMAGE_WIDTH = "1804";
export const SOCIAL_IMAGE_HEIGHT = "872";
export const SOCIAL_IMAGE_ALT = "EdgeTrace trade history diagnostics illustration";

export type SeoRoute = {
  path: string;
  title: string;
  description: string;
  robots: "index,follow" | "noindex,follow" | "noindex,nofollow,noarchive";
  canonical?: string;
  structuredData?: "home" | "software";
};

export const indexedSeoRoutes: SeoRoute[] = [
  {
    path: "/",
    title: "Trade Performance Analytics & Diagnostics | EdgeTrace",
    description:
      "Import completed trades from a broker or generic CSV to analyze expectancy, cost drag, R-capture, weak segments, and changes between reports.",
    robots: "index,follow",
    canonical: SITE_URL,
    structuredData: "home"
  },
  {
    path: "/pricing",
    title: "EdgeTrace Pricing | Free Trade Analytics & Pro Reviews",
    description:
      "Compare EdgeTrace Free and Pro for completed-trade reports, broker CSV imports, strategy comparison, drilldowns, heatmaps, and recurring reviews.",
    robots: "index,follow",
    canonical: `${SITE_URL}/pricing`,
    structuredData: "software"
  },
  {
    path: "/privacy",
    title: "Privacy Policy | EdgeTrace",
    description: "How EdgeTrace handles account, billing, analytics, feedback, and uploaded trade data.",
    robots: "index,follow",
    canonical: `${SITE_URL}/privacy`
  },
  {
    path: "/terms",
    title: "Terms of Service | EdgeTrace",
    description: "Terms for using the EdgeTrace completed-trade analytics service.",
    robots: "index,follow",
    canonical: `${SITE_URL}/terms`
  },
  {
    path: "/disclaimer",
    title: "Trading and Financial Disclaimer | EdgeTrace",
    description: "Important limitations for EdgeTrace completed-trade analytics and diagnostic output.",
    robots: "index,follow",
    canonical: `${SITE_URL}/disclaimer`
  }
];

export const noindexSeoRoutes: SeoRoute[] = [
  {
    path: "/login",
    title: "Log In | EdgeTrace",
    description: "Log in to your EdgeTrace trade analytics workspace.",
    robots: "noindex,follow"
  },
  {
    path: "/signup",
    title: "Create an EdgeTrace Account",
    description: "Create an account to import completed trades and build an EdgeTrace diagnostic report.",
    robots: "noindex,follow"
  }
];

const privateSeoRoute: SeoRoute = {
  path: "/app",
  title: "EdgeTrace Workspace",
  description: "Private EdgeTrace trade analytics workspace.",
  robots: "noindex,nofollow,noarchive"
};

export const notFoundSeoRoute: SeoRoute = {
  path: "/404",
  title: "Page Not Found | EdgeTrace",
  description: "The requested EdgeTrace page could not be found.",
  robots: "noindex,follow"
};

export function resolveSeoRoute(pathname: string): SeoRoute {
  const exactRoute = [...indexedSeoRoutes, ...noindexSeoRoutes].find((route) => route.path === pathname);
  if (exactRoute) return exactRoute;
  if (pathname === "/app" || pathname.startsWith("/app/")) return privateSeoRoute;
  if (pathname.startsWith("/login/")) return noindexSeoRoutes.find((route) => route.path === "/login")!;
  if (pathname.startsWith("/signup/")) return noindexSeoRoutes.find((route) => route.path === "/signup")!;
  return notFoundSeoRoute;
}

export function structuredDataForRoute(route: SeoRoute) {
  if (!route.structuredData) return undefined;

  const application = {
    "@type": "WebApplication",
    name: SITE_NAME,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description:
      "Post-trade performance analytics for completed broker and CSV trade history, including expectancy, cost drag, R-capture, and segment diagnostics."
  };

  if (route.structuredData === "software") {
    return {
      "@context": "https://schema.org",
      ...application
    };
  }

  const graph: Array<Record<string, unknown>> = [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/brand/edgetrace-logo-horizontal.svg`
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` }
    },
    application
  ];

  return {
    "@context": "https://schema.org",
    "@graph": graph
  };
}

export function applySeoMetadata(pathname: string) {
  if (typeof document === "undefined") return;
  const route = resolveSeoRoute(pathname);
  document.title = route.title;
  setMeta("name", "description", route.description);
  setMeta("name", "robots", route.robots);
  setMeta("property", "og:site_name", SITE_NAME);
  setMeta("property", "og:type", "website");
  setMeta("property", "og:title", route.title);
  setMeta("property", "og:description", route.description);
  setMeta("property", "og:url", route.canonical ?? `${SITE_URL}${route.path}`);
  setMeta("property", "og:image", `${SITE_URL}${SOCIAL_IMAGE_PATH}`);
  setMeta("property", "og:image:type", "image/png");
  setMeta("property", "og:image:width", SOCIAL_IMAGE_WIDTH);
  setMeta("property", "og:image:height", SOCIAL_IMAGE_HEIGHT);
  setMeta("property", "og:image:alt", SOCIAL_IMAGE_ALT);
  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", route.title);
  setMeta("name", "twitter:description", route.description);
  setMeta("name", "twitter:image", `${SITE_URL}${SOCIAL_IMAGE_PATH}`);
  setMeta("name", "twitter:image:alt", SOCIAL_IMAGE_ALT);
  setCanonical(route.canonical);
  setStructuredData(structuredDataForRoute(route));
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonical(href: string | undefined) {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    existing?.remove();
    return;
  }
  const element = existing ?? document.createElement("link");
  element.rel = "canonical";
  element.href = href;
  if (!existing) document.head.appendChild(element);
}

function setStructuredData(data: ReturnType<typeof structuredDataForRoute>) {
  const existing = document.getElementById("edgetrace-structured-data");
  if (!data) {
    existing?.remove();
    return;
  }
  const element = existing ?? document.createElement("script");
  element.id = "edgetrace-structured-data";
  element.setAttribute("type", "application/ld+json");
  element.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
  if (!existing) document.head.appendChild(element);
}

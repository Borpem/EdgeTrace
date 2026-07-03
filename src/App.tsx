import { useEffect, useRef, useState } from "react";
import { UserButton } from "@clerk/clerk-react";
import {
  LogOut,
  Menu,
  UserCircle
} from "lucide-react";
import { useAuth } from "./context/AuthContext";
import { FeatureIntroPrompt } from "./components/FeatureIntroPrompt";
import { ProFeaturePrompt } from "./components/ProFeaturePrompt";
import { trackEvent } from "./lib/analytics";
import type { BreakdownDimension } from "./lib/breakdowns";
import { canUseFeature, getPlanConfig } from "./lib/entitlements";
import {
  featureIntros,
  hideFeatureIntroForUser,
  isFeatureIntroHidden,
  type FeatureIntroId
} from "./lib/featureIntros";
import type { FeatureKey } from "./lib/plans";
import { buildProFeaturePrompt, type ProFeaturePromptState } from "./lib/proFeaturePrompts";
import {
  getMe,
  getReport,
  listReports,
  setApiAuth
} from "./lib/api";
import { AccountPage } from "./pages/AccountPage";
import { AdminFeedbackPage } from "./pages/AdminFeedbackPage";
import { ComparePage } from "./pages/ComparePage";
import { CompareDrilldownPage } from "./pages/CompareDrilldownPage";
import { CollectionAttributionPage } from "./pages/CollectionAttributionPage";
import { CollectionDetailPage } from "./pages/CollectionDetailPage";
import { CollectionReviewWorkspacePage } from "./pages/CollectionReviewWorkspacePage";
import { CollectionsPage } from "./pages/CollectionsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DrilldownPage } from "./pages/DrilldownPage";
import { FeatureEducationPage } from "./pages/FeatureEducationPage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { LoginPage } from "./pages/LoginPage";
import { PricingPage } from "./pages/PricingPage";
import { ReconstructionAuditPage } from "./pages/ReconstructionAuditPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SignupPage } from "./pages/SignupPage";
import { StrategyDashboardPage } from "./pages/StrategyDashboardPage";
import { UploadPage } from "./pages/UploadPage";
import type { DiagnosticsResult, ReportSummary, UserProfile } from "./types";

type Page = "home" | "pricing" | "login" | "signup" | "strategyDashboard" | "upload" | "reports" | "collections" | "collectionDetail" | "collectionAttribution" | "collectionReviewWorkspace" | "compare" | "features" | "feedback" | "adminFeedback" | "account" | "dashboard" | "drilldown" | "compareDrilldown" | "reconstructionAudit";
type DrilldownSelection = { dimension: BreakdownDimension; group: string };
type CompareDrilldownSelection = {
  reportA: DiagnosticsResult;
  reportB: DiagnosticsResult;
  dimension: BreakdownDimension;
  group: string;
};
type CollectionAttributionSelection = { dimension: BreakdownDimension; group: string };

export function App() {
  const { authMode, user, isAuthenticated, isLoading: authLoading, login, signup, logout, getAccessToken } = useAuth();
  const [page, setPage] = useState<Page>("home");
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [drilldownSelection, setDrilldownSelection] = useState<DrilldownSelection | null>(null);
  const [compareDrilldownSelection, setCompareDrilldownSelection] =
    useState<CompareDrilldownSelection | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [collectionAttributionSelection, setCollectionAttributionSelection] =
    useState<CollectionAttributionSelection | null>(null);
  const [initialComparePair, setInitialComparePair] = useState<{ reportAId?: string; reportBId?: string } | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [createdReportId, setCreatedReportId] = useState<string | null>(null);
  const [isRouteResolving, setIsRouteResolving] = useState(true);
  const [proFeaturePrompt, setProFeaturePrompt] = useState<ProFeaturePromptState | null>(null);
  const [activeFeatureIntro, setActiveFeatureIntro] = useState<FeatureIntroId | null>(null);
  const [sessionDismissedFeatureIntros, setSessionDismissedFeatureIntros] = useState<FeatureIntroId[]>([]);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    page,
    result?.id,
    collectionId,
    drilldownSelection?.dimension,
    drilldownSelection?.group,
    compareDrilldownSelection?.dimension,
    compareDrilldownSelection?.group,
    collectionAttributionSelection?.dimension,
    collectionAttributionSelection?.group
  ]);

  const defaultPathForPage = (target: Page) => {
    switch (target) {
      case "home":
        return "/";
      case "pricing":
        return "/pricing";
      case "login":
        return "/login";
      case "signup":
        return "/signup";
      case "strategyDashboard":
        return "/app/dashboard";
      case "upload":
        return "/app/upload";
      case "reports":
        return "/app/reports";
      case "collections":
        return "/app/collections";
      case "compare":
        return "/app/compare";
      case "features":
        return "/app/how-it-works";
      case "feedback":
        return "/app/feedback";
      case "adminFeedback":
        return "/app/admin/feedback";
      case "account":
        return "/app/account";
      default:
        return "/app/dashboard";
    }
  };

  const navigate = (target: Page, path = defaultPathForPage(target), replace = false) => {
    setPage(target);
    if (window.location.pathname + window.location.search !== path) {
      window.history[replace ? "replaceState" : "pushState"](null, "", path);
    }
  };

  const showProFeaturePrompt = (prompt: ProFeaturePromptState) => {
    setProFeaturePrompt(prompt);
    trackEvent("plan_feature_prompt_opened", { feature: prompt.feature, requiredPlan: "pro" });
  };

  const requireFeature = (
    feature: FeatureKey,
    override?: Partial<Omit<ProFeaturePromptState, "feature">>
  ) => {
    if (canUseFeature(getPlanConfig(userProfile?.planId), feature)) return true;
    showProFeaturePrompt(buildProFeaturePrompt(feature, override));
    return false;
  };

  const closeProFeaturePrompt = () => {
    setProFeaturePrompt(null);
  };

  const upgradeFromProFeaturePrompt = () => {
    if (proFeaturePrompt) {
      trackEvent("plan_feature_cta_clicked", {
        feature: proFeaturePrompt.feature,
        requiredPlan: "pro",
        source: "pro_feature_prompt"
      });
    }
    setProFeaturePrompt(null);
    navigate("pricing", "/pricing");
  };

  const learnFromProFeaturePrompt = () => {
    if (!proFeaturePrompt) return;
    trackEvent("paywall_learn_more_clicked", {
      feature: proFeaturePrompt.feature,
      requiredPlan: "pro",
      source: "pro_feature_prompt"
    });
    const path = `/app/how-it-works?feature=${encodeURIComponent(proFeaturePrompt.learnPath)}`;
    setProFeaturePrompt(null);
    navigate("features", path);
  };

  const closeFeatureIntroPrompt = (doNotShowAgain: boolean) => {
    if (!activeFeatureIntro) return;
    const introId = activeFeatureIntro;
    if (doNotShowAgain && user?.id) hideFeatureIntroForUser(user.id, introId);
    setSessionDismissedFeatureIntros((current) =>
      current.includes(introId) ? current : [...current, introId]
    );
    setActiveFeatureIntro(null);
    trackEvent("feature_intro_closed", { feature: introId, doNotShowAgain });
  };

  const signIntoApp = (fallbackPath = "/app/dashboard", mode: "login" | "signup" = "login") => {
    if (authMode === "clerk") {
      if (mode === "signup") signup();
      else login();
      return;
    }

    if (mode === "signup") signup();
    else login();
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || fallbackPath;
    void routeToPath(next, true, true);
  };

  const handleSignOut = () => {
    logout();
    setResult(null);
    setDrilldownSelection(null);
    setCompareDrilldownSelection(null);
    setCollectionId(null);
    setCollectionAttributionSelection(null);
    setInitialComparePair(null);
    navigate("home", "/", true);
  };

  useEffect(() => {
    setApiAuth({ userId: user?.id, authMode, getAccessToken });
    if (!isAuthenticated) {
      setUserProfile(null);
      return;
    }

    void getMe()
      .then(({ profile }) => setUserProfile(profile))
      .catch(() => setUserProfile(null));
  }, [authMode, getAccessToken, isAuthenticated, user?.id]);

  useEffect(() => {
    setActiveFeatureIntro(null);
    setSessionDismissedFeatureIntros([]);
  }, [user?.id]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user?.id) {
      setActiveFeatureIntro(null);
      return;
    }

    const introId = featureIntroForPage(page);
    if (!introId || sessionDismissedFeatureIntros.includes(introId) || isFeatureIntroHidden(user.id, introId)) {
      setActiveFeatureIntro(null);
      return;
    }

    setActiveFeatureIntro(introId);
    trackEvent("feature_intro_opened", { feature: introId });
  }, [authLoading, isAuthenticated, page, sessionDismissedFeatureIntros, user?.id]);

  const applyReportSummary = (summary: ReportSummary) => {
    setResult((current) =>
      current && current.id === summary.id
        ? {
            ...current,
            name: summary.name,
            updatedAt: summary.updatedAt,
            notes: summary.notes ?? "",
            tags: summary.tags ?? [],
            strategyLabel: summary.strategyLabel ?? "",
            reportType: summary.reportType
          }
        : current
    );
  };

  const openCompare = (reportAId?: string, reportBId?: string) => {
    const pair = reportAId || reportBId ? { reportAId, reportBId } : null;
    setInitialComparePair(pair);
    const params = new URLSearchParams();
    if (reportAId) params.set("reportAId", reportAId);
    if (reportBId) params.set("reportBId", reportBId);
    const query = params.toString();
    navigate("compare", query ? `/app/compare?${query}` : "/app/compare");
  };

  const openLatestReportDashboard = async (replace = false) => {
    if (result) {
      navigate("dashboard", `/app/dashboard/report/${result.id}`, replace);
      return true;
    }

    try {
      const reportsResponse = await listReports();
      const latest = [...(reportsResponse.reports ?? [])].sort(
        (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
      )[0];
      if (latest) {
        const report = await getReport(latest.id);
        setResult(report);
        setCreatedReportId(null);
        navigate("dashboard", `/app/dashboard/report/${report.id}`, replace);
        return true;
      }
    } catch {
      setResult(null);
    }

    navigate("strategyDashboard", "/app/dashboard", replace);
    return false;
  };

  const routeToPath = async (rawPath: string, replace = false, authOverride = isAuthenticated) => {
    const dimensions: BreakdownDimension[] = ["symbol", "strategy", "timeOfDay"];
    const url = new URL(rawPath, window.location.origin);
    let pathname = url.pathname;
    let search = url.search;

    const legacyPath =
      pathname === "/dashboard"
        ? "/app/dashboard"
        : pathname.startsWith("/dashboard/report/")
          ? `/app${pathname}`
          : pathname === "/upload"
            ? "/app/upload"
            : pathname === "/reports"
              ? "/app/reports"
              : pathname === "/collections"
                ? "/app/collections"
                : pathname.startsWith("/collections/")
                  ? `/app${pathname}`
                  : pathname === "/compare"
                    ? "/app/compare"
                    : pathname.startsWith("/compare/")
                      ? `/app${pathname}`
                      : "";

    if (legacyPath) {
      pathname = legacyPath;
      const nextUrl = `${pathname}${search}`;
      window.history.replaceState(null, "", nextUrl);
    } else if (window.location.pathname + window.location.search !== `${pathname}${search}`) {
      window.history[replace ? "replaceState" : "pushState"](null, "", `${pathname}${search}`);
    }

    const isPrivateRoute = pathname === "/app" || pathname.startsWith("/app/");
    if (isPrivateRoute && !authOverride) {
      const next = encodeURIComponent(`${pathname}${search}`);
      setPage("login");
      window.history.replaceState(null, "", `/login?next=${next}`);
      return;
    }

    if (authOverride && pathname === "/") {
      await openLatestReportDashboard(true);
      return;
    }

    if (pathname === "/") {
      setPage("home");
      return;
    }
    if (pathname === "/pricing") {
      setPage("pricing");
      return;
    }
    if (pathname === "/how-it-works") {
      navigate("home", "/", true);
      return;
    }
    if (pathname === "/demo") {
      navigate("home", "/", true);
      return;
    }
    if (pathname === "/login") {
      if (authOverride) {
        const next = new URLSearchParams(search).get("next");
        await routeToPath(next && next.startsWith("/app") ? next : "/app/dashboard", true, true);
        return;
      }
      setPage("login");
      return;
    }
    if (pathname === "/signup") {
      if (authOverride) {
        const next = new URLSearchParams(search).get("next");
        await routeToPath(next && next.startsWith("/app") ? next : "/app/dashboard", true, true);
        return;
      }
      setPage("signup");
      return;
    }

    if (pathname === "/app" || pathname === "/app/dashboard") {
      await openLatestReportDashboard(replace);
      return;
    }
    if (pathname === "/app/upload") {
      setPage("upload");
      return;
    }
    if (pathname === "/app/reports") {
      setPage("reports");
      return;
    }
    if (pathname === "/app/collections") {
      setPage("collections");
      return;
    }
    if (pathname === "/app/compare") {
      const params = new URLSearchParams(search);
      const reportAId = params.get("reportAId");
      const reportBId = params.get("reportBId");
      setInitialComparePair(reportAId || reportBId ? { reportAId: reportAId ?? undefined, reportBId: reportBId ?? undefined } : null);
      setPage("compare");
      return;
    }
    if (pathname === "/app/how-it-works" || pathname === "/app/features") {
      setPage("features");
      return;
    }
    if (pathname === "/app/feedback") {
      setPage("feedback");
      return;
    }
    if (pathname === "/app/admin/feedback") {
      setPage("adminFeedback");
      return;
    }
    if (pathname === "/app/account") {
      setPage("account");
      return;
    }

    const compareParams = new URLSearchParams(search);
    const reportAId = compareParams.get("reportAId");
    const reportBId = compareParams.get("reportBId");
    const compareDimension = compareParams.get("dimension") as BreakdownDimension | null;
    const compareGroup = compareParams.get("group");
    if (
      pathname === "/app/compare/drilldown" &&
      reportAId &&
      reportBId &&
      compareDimension &&
      compareGroup &&
      dimensions.includes(compareDimension)
    ) {
      try {
        const [reportA, reportB] = await Promise.all([getReport(reportAId), getReport(reportBId)]);
        setCompareDrilldownSelection({
          reportA,
          reportB,
          dimension: compareDimension,
          group: compareGroup
        });
        setPage("compareDrilldown");
      } catch {
        setPage("compare");
      }
      return;
    }

    const collectionAttributionMatch = pathname.match(/^\/app\/collections\/([^/]+)\/attribution$/);
    const collectionDimension = compareParams.get("dimension") as BreakdownDimension | null;
    const collectionGroup = compareParams.get("group");
    if (
      collectionAttributionMatch &&
      collectionDimension &&
      collectionGroup &&
      dimensions.includes(collectionDimension)
    ) {
      setCollectionId(collectionAttributionMatch[1]);
      setCollectionAttributionSelection({ dimension: collectionDimension, group: collectionGroup });
      setPage("collectionAttribution");
      return;
    }

    const collectionReviewMatch = pathname.match(/^\/app\/collections\/([^/]+)\/review-workspace$/);
    if (collectionReviewMatch) {
      setCollectionId(collectionReviewMatch[1]);
      setPage("collectionReviewWorkspace");
      return;
    }

    const collectionDetailMatch = pathname.match(/^\/app\/collections\/([^/]+)$/);
    if (collectionDetailMatch) {
      setCollectionId(collectionDetailMatch[1]);
      setPage("collectionDetail");
      return;
    }

    const auditMatch = pathname.match(/^\/app\/dashboard\/report\/([^/]+)\/reconstruction-audit$/);
    if (auditMatch) {
      try {
        const report = await getReport(auditMatch[1]);
        setResult(report);
        setCreatedReportId(null);
        setPage("reconstructionAudit");
      } catch {
        setPage("reports");
      }
      return;
    }

    const drilldownMatch = pathname.match(/^\/app\/dashboard\/report\/([^/]+)\/drilldown$/);
    const dimension = compareParams.get("dimension") as BreakdownDimension | null;
    const group = compareParams.get("group");
    if (drilldownMatch && dimension && group && dimensions.includes(dimension)) {
      try {
        const report = await getReport(drilldownMatch[1]);
        setResult(report);
        setCreatedReportId(null);
        setDrilldownSelection({ dimension, group });
        setPage("drilldown");
      } catch {
        setPage("reports");
      }
      return;
    }

    const reportMatch = pathname.match(/^\/app\/dashboard\/report\/([^/]+)$/);
    if (reportMatch) {
      try {
        const report = await getReport(reportMatch[1]);
        setResult(report);
        setCreatedReportId(null);
        setPage("dashboard");
      } catch {
        setPage("reports");
      }
      return;
    }

    navigate(authOverride ? "strategyDashboard" : "home", authOverride ? "/app/dashboard" : "/", true);
  };

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    const resolveCurrentRoute = async () => {
      setIsRouteResolving(true);
      try {
        await routeToPath(`${window.location.pathname}${window.location.search}`, true);
      } finally {
        if (!cancelled) setIsRouteResolving(false);
      }
    };

    void resolveCurrentRoute();
    const handlePopState = () => {
      void resolveCurrentRoute();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    if (page === "dashboard" || page === "strategyDashboard") trackEvent("dashboard_opened", { reportId: result?.id ?? "" });
    if (page === "drilldown") trackEvent("drilldown_opened", { reportId: result?.id ?? "" });
    if (page === "compareDrilldown") trackEvent("drilldown_opened", { source: "compare" });
    if (page === "reconstructionAudit") trackEvent("reconstruction_audit_opened", { reportId: result?.id ?? "" });
    if (page === "collectionReviewWorkspace") trackEvent("review_workspace_opened", { collectionId: collectionId ?? "" });
  }, [authLoading, collectionId, isAuthenticated, page, result?.id]);

  const activeNavPage =
    page === "dashboard" || page === "drilldown" || page === "reconstructionAudit" || page === "strategyDashboard"
      ? "strategyDashboard"
      : page === "collectionDetail" || page === "collectionAttribution" || page === "collectionReviewWorkspace"
        ? "collections"
        : page === "compareDrilldown"
          ? "compare"
          : page;

  const appNavItems: Array<{ target: Page; label: string }> = [
    { target: "strategyDashboard", label: "Dashboard" },
    { target: "upload", label: "Import Trades" },
    { target: "reports", label: "Reports" },
    { target: "collections", label: "Strategy Sets" },
    { target: "compare", label: "Compare" },
    { target: "features", label: "How It Works" },
    { target: "feedback", label: "Feedback" }
  ];
  const useReportDashboardShell = page === "dashboard" && Boolean(result);
  const useAuthenticatedAppShell = isAuthenticated && !useReportDashboardShell && isAuthenticatedAppPage(page);

  const rootClassName = [
    "EdgeTrace-contours min-h-screen text-ink",
    useAuthenticatedAppShell ? "EdgeTrace-auth-framed EdgeTrace-command-dashboard" : "",
    !useAuthenticatedAppShell && !useReportDashboardShell ? "EdgeTrace-public-framed" : ""
  ]
    .filter(Boolean)
    .join(" ");

  if (authLoading || isRouteResolving) {
    return <RouteLoadingShell isAuthenticated={isAuthenticated} />;
  }

  return (
    <div className={rootClassName}>
      {useAuthenticatedAppShell && (
        <AuthenticatedTopbar
          activeNavPage={activeNavPage}
          activeLabel={labelForPage(activeNavPage)}
          userName={user?.name}
          profile={userProfile}
          authMode={authMode}
          onDashboard={() => void openLatestReportDashboard()}
          onAnalyze={() => navigate("upload")}
          onReports={() => navigate("reports")}
          onCollections={() => navigate("collections")}
          onCompare={() => {
            setInitialComparePair(null);
            navigate("compare");
          }}
          onFeatures={() => navigate("features", "/app/how-it-works")}
          onFeedback={() => navigate("feedback")}
          onAccount={() => navigate("account")}
          onSignOut={handleSignOut}
        />
      )}

      {!useReportDashboardShell && !useAuthenticatedAppShell && (
      <header className={`EdgeTrace-topbar sticky top-0 z-40 ${!isAuthenticated ? "EdgeTrace-public-topbar" : ""}`}>
        <div className="EdgeTrace-shell EdgeTrace-public-topbar-inner relative flex h-auto flex-col items-center gap-4 py-4 lg:h-16 lg:flex-row lg:justify-end lg:py-0">
          <button
            className="EdgeTrace-public-logo-button flex shrink-0 items-center justify-center lg:justify-start"
            onClick={() => {
              if (isAuthenticated) {
                void openLatestReportDashboard();
              } else {
                navigate("home", "/");
              }
            }}
            aria-label="EdgeTrace home"
          >
            <span className="flex items-center justify-center gap-4">
              <img
                src="/brand/edgetrace_icon_monochrome_white_transparent.png"
                alt="EdgeTrace"
                className="h-7 w-auto object-contain opacity-85"
              />
              <img
                src="/brand/edgetrace_wordmark_monochrome_white.png"
                alt=""
                aria-hidden="true"
                className="h-[26px] w-auto object-contain opacity-85"
              />
            </span>
          </button>
          {isAuthenticated ? (
            <nav className="flex flex-wrap items-center justify-center gap-4 text-sm lg:flex-1 lg:justify-start xl:pl-2">
              {appNavItems.map(({ target, label }) => {
                const isActive = activeNavPage === target;
                return (
                  <button
                    key={target}
                    className={`EdgeTrace-nav-link ${isActive ? "EdgeTrace-nav-link-active" : ""}`}
                    onClick={() => {
                      if (target === "strategyDashboard") {
                        void openLatestReportDashboard();
                        return;
                      }
                      if (target === "compare") setInitialComparePair(null);
                      navigate(target);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>
          ) : (
            <nav className="EdgeTrace-public-nav flex flex-wrap items-center justify-center gap-6 text-sm lg:ml-auto lg:justify-end">
              <button
                className={`EdgeTrace-nav-link ${page === "home" ? "EdgeTrace-nav-link-active" : ""}`}
                onClick={() => navigate("home", "/")}
              >
                How It Works
              </button>
              <button
                className={`EdgeTrace-nav-link ${page === "pricing" ? "EdgeTrace-nav-link-active" : ""}`}
                onClick={() => navigate("pricing")}
              >
                Pricing
              </button>
              <button
                className={`EdgeTrace-nav-link ${page === "login" ? "EdgeTrace-nav-link-active" : ""}`}
                onClick={() => navigate("login")}
              >
                Login
              </button>
              <button
                className={`EdgeTrace-secondary-button px-4 py-2 ${page === "signup" ? "border-cyan/70" : ""}`}
                onClick={() => navigate("signup")}
              >
                Sign Up
              </button>
            </nav>
          )}
          {isAuthenticated ? (
            <div className="flex flex-wrap items-center justify-center gap-3 xl:ml-auto">
              <button className="EdgeTrace-compact-primary" onClick={() => navigate("upload")}>
                Import Trades
              </button>
              {userProfile?.planId === "free" && (
                <button className="EdgeTrace-secondary-button px-3 py-2 text-sm" onClick={() => navigate("account")}>
                  Upgrade to Pro
                </button>
              )}
              <div className="hidden items-center gap-2 text-xs text-muted xl:flex">
                <UserCircle size={16} />
                <span>{user?.name ?? "Account"}</span>
                {userProfile && <span className="text-cyan">{userProfile.planId.toUpperCase()}</span>}
              </div>
              <button
                className={`border border-white/[0.1] px-3 py-2 text-sm font-semibold text-muted hover:border-cyan/45 hover:text-ink ${
                  page === "account" ? "border-cyan/50 text-cyan" : ""
                }`}
                onClick={() => navigate("account")}
              >
                My Account{userProfile ? ` · ${userProfile.planId.toUpperCase()}` : ""}
              </button>
              {authMode === "clerk" ? (
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "h-8 w-8 border border-white/15"
                    }
                  }}
                />
              ) : (
                <button
                  className="inline-flex items-center gap-2 border-b border-transparent py-1.5 text-sm font-semibold text-muted hover:border-white/20 hover:text-ink"
                  onClick={handleSignOut}
                >
                  Sign out <LogOut size={15} />
                </button>
              )}
            </div>
          ) : null}
        </div>
      </header>
      )}

      {page === "home" && (
        <FeatureEducationPage
          profile={userProfile}
          isAuthenticated={isAuthenticated}
          onAnalyze={() => navigate(isAuthenticated ? "upload" : "signup", isAuthenticated ? "/app/upload" : "/signup?next=/app/upload")}
          onPricing={() => navigate("pricing", "/pricing")}
          onSignup={() => navigate("signup", "/signup?next=/app/upload")}
          onOpenReport={async (reportId) => {
            try {
              const report = await getReport(reportId);
              setResult(report);
              setCreatedReportId(null);
              navigate("dashboard", `/app/dashboard/report/${report.id}`);
            } catch {
              navigate("reports");
            }
          }}
          onCreateStrategySet={() => navigate("collections")}
        />
      )}
      {page === "pricing" && (
        <PricingPage
          profile={userProfile}
          isAuthenticated={isAuthenticated}
          onStart={() => navigate(isAuthenticated ? "upload" : "signup", isAuthenticated ? "/app/upload" : "/signup?next=/app/upload")}
          onPlanChanged={setUserProfile}
        />
      )}
      {page === "account" && isAuthenticated && (
        <AccountPage
          profile={userProfile}
          user={user}
          onPlanChanged={setUserProfile}
          onAnalyze={() => navigate("upload")}
          onPricing={() => navigate("pricing", "/pricing")}
        />
      )}
      {page === "feedback" && isAuthenticated && (
        <FeedbackPage profile={userProfile} />
      )}
      {page === "adminFeedback" && isAuthenticated && (
        <AdminFeedbackPage />
      )}
      {page === "login" && (
        <LoginPage
          nextPath={new URLSearchParams(window.location.search).get("next") ?? undefined}
          onContinue={() => signIntoApp()}
          onSignup={() => navigate("signup")}
        />
      )}
      {page === "signup" && (
        <SignupPage
          onCreateAccount={() => signIntoApp("/app/dashboard", "signup")}
          onLogin={() => navigate("login")}
        />
      )}
      {page === "strategyDashboard" && (
        <StrategyDashboardPage
          selectedReport={result}
          onOpenReport={(diagnostics) => {
            setResult(diagnostics);
            setCreatedReportId(null);
            navigate("dashboard", `/app/dashboard/report/${diagnostics.id}`);
          }}
          onDrillDown={(diagnostics, selection) => {
            if (!requireFeature("full_drilldowns")) return;
            setResult(diagnostics);
            setCreatedReportId(null);
            setDrilldownSelection(selection);
            const params = new URLSearchParams({
              dimension: selection.dimension,
              group: selection.group
            });
            navigate("drilldown", `/app/dashboard/report/${diagnostics.id}/drilldown?${params.toString()}`);
          }}
          onUpload={() => navigate("upload")}
          onReports={() => navigate("reports")}
        />
      )}
      {page === "upload" && (
        <UploadPage
          profile={userProfile}
          onViewPricing={() => navigate("pricing", "/pricing")}
          onComplete={(diagnostics) => {
            setResult(diagnostics);
            setCreatedReportId(diagnostics.id);
            navigate("dashboard", `/app/dashboard/report/${diagnostics.id}`);
          }}
        />
      )}
      {page === "reports" && (
        <ReportsPage
          profile={userProfile}
          onOpen={(diagnostics) => {
            setResult(diagnostics);
            setCreatedReportId(null);
            navigate("dashboard", `/app/dashboard/report/${diagnostics.id}`);
          }}
          onAnalyze={() => navigate("upload")}
          onCompare={(reportId) => openCompare(reportId)}
        />
      )}
      {page === "collections" && (
        <CollectionsPage
          profile={userProfile}
          onOpen={(collection) => {
            setCollectionId(collection.id);
            navigate("collectionDetail", `/app/collections/${collection.id}`);
          }}
          onAnalyze={() => navigate("upload")}
        />
      )}
      {page === "collectionDetail" && collectionId && (
        <CollectionDetailPage
          collectionId={collectionId}
          profile={userProfile}
          onBack={() => navigate("collections")}
          onOpenReport={(diagnostics) => {
            setResult(diagnostics);
            setCreatedReportId(null);
            navigate("dashboard", `/app/dashboard/report/${diagnostics.id}`);
          }}
          onCompare={(reportAId, reportBId) => {
            openCompare(reportAId, reportBId);
          }}
          onAttribution={(selection) => {
            if (!requireFeature("collection_attribution")) return;
            setCollectionAttributionSelection(selection);
            if (collectionId) {
              const params = new URLSearchParams({ dimension: selection.dimension, group: selection.group });
              navigate("collectionAttribution", `/app/collections/${collectionId}/attribution?${params.toString()}`);
            }
          }}
          onReviewWorkspace={() => {
            if (collectionId) navigate("collectionReviewWorkspace", `/app/collections/${collectionId}/review-workspace`);
          }}
        />
      )}
      {page === "collectionReviewWorkspace" && collectionId && (
        <CollectionReviewWorkspacePage
          collectionId={collectionId}
          onBack={() => {
            navigate("collectionDetail", `/app/collections/${collectionId}`);
          }}
          onCompare={(reportAId, reportBId) => {
            openCompare(reportAId, reportBId);
          }}
          onOpenReport={(diagnostics) => {
            setResult(diagnostics);
            setCreatedReportId(null);
            navigate("dashboard", `/app/dashboard/report/${diagnostics.id}`);
          }}
          onAttribution={(selection) => {
            if (!requireFeature("collection_attribution")) return;
            setCollectionAttributionSelection(selection);
            const params = new URLSearchParams({ dimension: selection.dimension, group: selection.group });
            navigate("collectionAttribution", `/app/collections/${collectionId}/attribution?${params.toString()}`);
          }}
        />
      )}
      {page === "collectionAttribution" && collectionId && collectionAttributionSelection && (
        <CollectionAttributionPage
          collectionId={collectionId}
          {...collectionAttributionSelection}
          profile={userProfile}
          onBack={() => {
            navigate("collectionDetail", `/app/collections/${collectionId}`);
          }}
        />
      )}
      {page === "compare" && (
        <ComparePage
          profile={userProfile}
          onAnalyze={() => navigate("upload")}
          onReports={() => navigate("reports")}
          initialReportAId={initialComparePair?.reportAId}
          initialReportBId={initialComparePair?.reportBId}
          onDrillDown={(selection) => {
            if (!requireFeature("full_drilldowns", {
              title: "Upgrade to Pro to unlock comparison drilldowns.",
              description: "Pro shows the exact segment and trade-level changes between two diagnostic reports."
            })) return;
            setCompareDrilldownSelection(selection);
            const params = new URLSearchParams({
              reportAId: selection.reportA.id,
              reportBId: selection.reportB.id,
              dimension: selection.dimension,
              group: selection.group
            });
            navigate("compareDrilldown", `/app/compare/drilldown?${params.toString()}`);
          }}
        />
      )}
      {page === "features" && (
        <FeatureEducationPage
          profile={userProfile}
          isAuthenticated={isAuthenticated}
          onAnalyze={() => navigate(isAuthenticated ? "upload" : "signup", isAuthenticated ? "/app/upload" : "/signup?next=/app/upload")}
          onPricing={() => navigate("pricing", "/pricing")}
          onSignup={() => navigate("signup", "/signup?next=/app/upload")}
          onOpenReport={async (reportId) => {
            try {
              const report = await getReport(reportId);
              setResult(report);
              setCreatedReportId(null);
              navigate("dashboard", `/app/dashboard/report/${report.id}`);
            } catch {
              navigate("reports");
            }
          }}
          onCreateStrategySet={() => navigate("collections")}
        />
      )}
      {page === "dashboard" && result && (
        <DashboardPage
          result={result}
          profile={userProfile}
          reportJustCreated={createdReportId === result.id}
          onDismissCreatedBanner={() => setCreatedReportId(null)}
          onDrillDown={(selection) => {
            if (!requireFeature("full_drilldowns")) return;
            setDrilldownSelection(selection);
            const params = new URLSearchParams({
              dimension: selection.dimension,
              group: selection.group
            });
            navigate("drilldown", `/app/dashboard/report/${result.id}/drilldown?${params.toString()}`);
          }}
          onReconstructionAudit={() => {
            navigate("reconstructionAudit", `/app/dashboard/report/${result.id}/reconstruction-audit`);
          }}
          onReportUpdated={applyReportSummary}
          onCompareReport={(reportId) => openCompare(reportId)}
          onSelectReport={async (reportId) => {
            const report = await getReport(reportId);
            setResult(report);
            setCreatedReportId(null);
            navigate("dashboard", `/app/dashboard/report/${report.id}`);
          }}
          onViewReports={() => navigate("reports")}
          onCreateReport={() => navigate("upload")}
          onOpenDashboard={() => navigate("dashboard", `/app/dashboard/report/${result.id}`)}
          onOpenCollections={() => navigate("collections")}
          onOpenFeatures={() => navigate("features")}
          onFeedback={() => navigate("feedback")}
          onLockedFeature={(prompt) => showProFeaturePrompt(buildProFeaturePrompt(prompt.feature, prompt))}
          accountControl={
            <AccountUtility
              userName={user?.name}
              profile={userProfile}
              authMode={authMode}
              onAccount={() => navigate("account")}
              onSignOut={handleSignOut}
            />
          }
        />
      )}
      {page === "dashboard" && !result && (
        <main className="EdgeTrace-shell py-10">
          <section className="rounded-lg border border-line bg-panel p-8">
            <p className="text-sm uppercase tracking-[0.22em] text-accent">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold">No report selected</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Open a saved diagnostic report from Reports, or upload a CSV and run diagnostics to create a new dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="EdgeTrace-primary-button" onClick={() => navigate("reports")}>
                Open Reports
              </button>
              <button className="rounded-md border border-line px-5 py-2.5 font-semibold text-ink hover:border-accent" onClick={() => navigate("upload")}>
                Import Trades
              </button>
            </div>
          </section>
        </main>
      )}
      {page === "drilldown" && result && drilldownSelection && (
        <DrilldownPage
          result={result}
          dimension={drilldownSelection.dimension}
          group={drilldownSelection.group}
          profile={userProfile}
          onBack={() => {
            navigate("dashboard", `/app/dashboard/report/${result.id}`);
          }}
        />
      )}
      {page === "compareDrilldown" && compareDrilldownSelection && (
        <CompareDrilldownPage
          {...compareDrilldownSelection}
          profile={userProfile}
          onBack={() => {
            navigate("compare");
          }}
        />
      )}
      {page === "reconstructionAudit" && result && (
        <ReconstructionAuditPage
          result={result}
          onBack={() => {
            navigate("dashboard", `/app/dashboard/report/${result.id}`);
          }}
        />
      )}
      {proFeaturePrompt && (
        <ProFeaturePrompt
          feature={proFeaturePrompt.feature}
          title={proFeaturePrompt.title}
          description={proFeaturePrompt.description}
          onClose={closeProFeaturePrompt}
          onUpgrade={upgradeFromProFeaturePrompt}
          onLearn={learnFromProFeaturePrompt}
        />
      )}
      {activeFeatureIntro && (
        <FeatureIntroPrompt intro={featureIntros[activeFeatureIntro]} onClose={closeFeatureIntroPrompt} />
      )}
    </div>
  );
}

function featureIntroForPage(page: Page): FeatureIntroId | null {
  if (page === "upload") return "upload";
  if (page === "reports") return "reports";
  if (page === "collections") return "collections";
  if (page === "compare") return "compare";
  return null;
}

function AuthenticatedTopbar({
  activeNavPage,
  activeLabel,
  userName,
  profile,
  authMode,
  onDashboard,
  onAnalyze,
  onReports,
  onCollections,
  onCompare,
  onFeatures,
  onFeedback,
  onAccount,
  onSignOut
}: {
  activeNavPage: Page;
  activeLabel: string;
  userName?: string;
  profile?: UserProfile | null;
  authMode: "clerk" | "mock";
  onDashboard: () => void;
  onAnalyze: () => void;
  onReports: () => void;
  onCollections: () => void;
  onCompare: () => void;
  onFeatures: () => void;
  onFeedback: () => void;
  onAccount: () => void;
  onSignOut: () => void;
}) {
  const navItems: Array<{ target: Page; label: string; action: () => void }> = [
    { target: "strategyDashboard", label: "Dashboard", action: onDashboard },
    { target: "upload", label: "Import Trades", action: onAnalyze },
    { target: "reports", label: "Reports", action: onReports },
    { target: "collections", label: "Strategy Sets", action: onCollections },
    { target: "compare", label: "Compare", action: onCompare },
    { target: "features", label: "How It Works", action: onFeatures },
    { target: "feedback", label: "Feedback", action: onFeedback }
  ];

  return (
    <div className="EdgeTrace-auth-topbar-shell EdgeTrace-command-shell">
      <header className="EdgeTrace-auth-topbar EdgeTrace-command-nav">
        <button className="EdgeTrace-command-brand" onClick={onDashboard} aria-label="EdgeTrace dashboard">
          <img src="/brand/edgetrace_icon_monochrome_white_transparent.png" alt="" aria-hidden="true" />
          <img src="/brand/edgetrace_wordmark_monochrome_white.png" alt="EdgeTrace" />
        </button>
        <nav aria-label="Application navigation" className="EdgeTrace-auth-command-nav">
          {navItems.map(({ target, label, action }) => (
            <button key={label} className={activeNavPage === target ? "active" : ""} onClick={action}>
              {label}
            </button>
          ))}
        </nav>
        <div className="EdgeTrace-auth-topbar-actions EdgeTrace-command-nav-actions">
          <button className="EdgeTrace-auth-topbar-primary EdgeTrace-command-primary" onClick={onAnalyze}>
            + New Report
          </button>
          <AccountUtility
            userName={userName}
            profile={profile}
            authMode={authMode}
            onAccount={onAccount}
            onSignOut={onSignOut}
          />
        </div>
        <div className="EdgeTrace-auth-topbar-context" aria-hidden="true">
          <p>{activeLabel}</p>
          <span>{profile?.planId ? `${profile.planId.toUpperCase()} plan` : "Workspace"}</span>
        </div>
      </header>
    </div>
  );
}

function AccountUtility({
  userName,
  profile,
  onAccount,
  onSignOut
}: {
  userName?: string;
  profile?: UserProfile | null;
  authMode: "clerk" | "mock";
  onAccount: () => void;
  onSignOut: () => void;
}) {
  const planLabel = profile?.planId ? profile.planId.toUpperCase() : "FREE";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const accountLabel = userName ?? "Account";
  const openAccount = () => {
    setMenuOpen(false);
    onAccount();
  };
  const signOut = () => {
    setMenuOpen(false);
    onSignOut();
  };

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <div className="EdgeTrace-account-utility" data-open={menuOpen ? "true" : "false"} ref={menuRef}>
      <button
        className="EdgeTrace-account-utility-menu-button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Open account menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      {menuOpen && (
        <div className="EdgeTrace-account-utility-menu" role="menu">
          <div className="EdgeTrace-account-utility-menu-head">
            <span className="EdgeTrace-account-utility-avatar">
              {userName ? initials(userName) : <UserCircle size={16} aria-hidden="true" />}
            </span>
            <span className="EdgeTrace-account-utility-copy">
              <strong>{accountLabel}</strong>
              <small>{planLabel} plan</small>
            </span>
          </div>
          <button className="EdgeTrace-account-utility-link" type="button" role="menuitem" onClick={openAccount}>
            Account <UserCircle size={14} aria-hidden="true" />
          </button>
          <button className="EdgeTrace-account-utility-link" type="button" role="menuitem" onClick={signOut}>
            Log out <LogOut size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function RouteLoadingShell({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className={`EdgeTrace-contours min-h-screen text-ink ${isAuthenticated ? "EdgeTrace-auth-framed" : "EdgeTrace-public-framed"}`}>
      <main className="EdgeTrace-shell py-10">
        <section className="EdgeTrace-command-card p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky">
            {isAuthenticated ? "Loading workspace" : "Loading EdgeTrace"}
          </p>
        </section>
      </main>
    </div>
  );
}

function isAuthenticatedAppPage(page: Page) {
  return [
    "strategyDashboard",
    "upload",
    "reports",
    "collections",
    "collectionDetail",
    "collectionAttribution",
    "collectionReviewWorkspace",
    "compare",
    "features",
    "feedback",
    "adminFeedback",
    "account",
    "dashboard",
    "drilldown",
    "compareDrilldown",
    "reconstructionAudit"
  ].includes(page);
}

function labelForPage(page: Page) {
  const labels: Partial<Record<Page, string>> = {
    strategyDashboard: "Dashboard",
    upload: "Import Trades",
    reports: "Reports",
    collections: "Strategy Sets",
    collectionDetail: "Strategy Set",
    collectionAttribution: "Attribution",
    collectionReviewWorkspace: "Review Workspace",
    compare: "Compare",
    features: "How It Works",
    feedback: "Feedback",
    adminFeedback: "Admin Feedback",
    account: "Account",
    dashboard: "Dashboard",
    drilldown: "Drilldown",
    compareDrilldown: "Compare Drilldown",
    reconstructionAudit: "Reconstruction Audit"
  };
  return labels[page] ?? "Workspace";
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

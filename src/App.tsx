import { useEffect, useState } from "react";
import { UserButton } from "@clerk/clerk-react";
import {
  FileText,
  FolderOpen,
  HelpCircle,
  Home,
  Layers3,
  LogOut,
  Plus,
  Scale,
  TrendingUp,
  Upload,
  UserCircle
} from "lucide-react";
import Papa from "papaparse";
import { useAuth } from "./context/AuthContext";
import { useOnboarding } from "./context/OnboardingContext";
import { OnboardingOverlay } from "./components/onboarding/OnboardingOverlay";
import { trackEvent } from "./lib/analytics";
import type { BreakdownDimension } from "./lib/breakdowns";
import {
  addReportToCollection,
  cleanupDemoData,
  createCollection,
  createSavedComparison,
  getMe,
  getReport,
  listReports,
  runTradeDiagnostics,
  setApiAuth,
  updateReportDetails,
  uploadTrades
} from "./lib/api";
import { AccountPage } from "./pages/AccountPage";
import { ComparePage } from "./pages/ComparePage";
import { CompareDrilldownPage } from "./pages/CompareDrilldownPage";
import { CollectionAttributionPage } from "./pages/CollectionAttributionPage";
import { CollectionDetailPage } from "./pages/CollectionDetailPage";
import { CollectionReviewWorkspacePage } from "./pages/CollectionReviewWorkspacePage";
import { CollectionsPage } from "./pages/CollectionsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DrilldownPage } from "./pages/DrilldownPage";
import { FeatureEducationPage } from "./pages/FeatureEducationPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PricingPage } from "./pages/PricingPage";
import { PublicDemoPage } from "./pages/PublicDemoPage";
import { ReconstructionAuditPage } from "./pages/ReconstructionAuditPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SignupPage } from "./pages/SignupPage";
import { StrategyDashboardPage } from "./pages/StrategyDashboardPage";
import { UploadPage } from "./pages/UploadPage";
import type { DiagnosticsResult, ReportSummary, UserProfile } from "./types";

type Page = "home" | "pricing" | "login" | "signup" | "demo" | "strategyDashboard" | "upload" | "reports" | "collections" | "collectionDetail" | "collectionAttribution" | "collectionReviewWorkspace" | "compare" | "features" | "account" | "dashboard" | "drilldown" | "compareDrilldown" | "reconstructionAudit";
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
  const { restart: restartOnboarding } = useOnboarding();
  const [page, setPage] = useState<Page>("home");
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [drilldownSelection, setDrilldownSelection] = useState<DrilldownSelection | null>(null);
  const [compareDrilldownSelection, setCompareDrilldownSelection] =
    useState<CompareDrilldownSelection | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [collectionAttributionSelection, setCollectionAttributionSelection] =
    useState<CollectionAttributionSelection | null>(null);
  const [initialComparePair, setInitialComparePair] = useState<{ reportAId?: string; reportBId?: string } | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [fullDemoLoading, setFullDemoLoading] = useState(false);
  const [fullDemoStatus, setFullDemoStatus] = useState("");
  const [demoError, setDemoError] = useState("");
  const [demoCleanupMessage, setDemoCleanupMessage] = useState("");
  const [collectionDemoMode, setCollectionDemoMode] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [createdReportId, setCreatedReportId] = useState<string | null>(null);

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
      case "demo":
        return "/demo";
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

  const launchDemo = async () => {
    setDemoLoading(true);
    setDemoError("");
    try {
      const response = await fetch("/sample-trades-breakdown.csv");
      if (!response.ok) throw new Error("Unable to load bundled demo dataset");
      const csv = await response.text();
      const parsed = Papa.parse<unknown[]>(csv, { header: false, skipEmptyLines: true });
      const upload = await uploadTrades(parsed.data);
      const diagnostics = await runTradeDiagnostics(upload.normalizedTrades, "Demo Report - Cost Drag Breakdown", {
        brokerId: "generic_csv",
        isDemo: true
      });
      setResult({
        ...diagnostics,
        strategyLabel: diagnostics.strategyLabel || "Demo Strategy",
        tags: [...(diagnostics.tags ?? []), "demo"]
      });
      setCreatedReportId(null);
      setDemoMode(true);
      if (authMode === "mock") login();
      navigate("dashboard", `/app/dashboard/report/${diagnostics.id}`);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Unable to launch demo");
    } finally {
      setDemoLoading(false);
    }
  };

  const launchFullDemo = async () => {
    setFullDemoLoading(true);
    setFullDemoStatus("Creating demo reports");
    setDemoError("");
    try {
      const specs: Array<{ name: string; file: string; tags: string[]; transform?: "regression" }> = [
        {
          name: "ORB Demo V1 - Baseline",
          file: "/sample-trades-breakdown.csv",
          tags: ["demo", "ORB", "baseline"]
        },
        {
          name: "ORB Demo V2 - Lower Costs",
          file: "/sample-trades-improved.csv",
          tags: ["demo", "ORB", "cost-reduction"]
        },
        {
          name: "ORB Demo V3 - Higher Selectivity",
          file: "/sample-trades.csv",
          tags: ["demo", "ORB", "selectivity"]
        },
        {
          name: "ORB Demo V4 - Regression Test",
          file: "/sample-trades-improved.csv",
          tags: ["demo", "ORB", "regression"],
          transform: "regression"
        }
      ];

      const reports: DiagnosticsResult[] = [];
      for (const spec of specs) {
        const response = await fetch(spec.file);
        if (!response.ok) throw new Error(`Unable to load ${spec.file}`);
        const parsed = Papa.parse<unknown[]>(await response.text(), { header: false, skipEmptyLines: true });
        const upload = await uploadTrades(parsed.data);
        const trades =
          spec.transform === "regression"
            ? upload.normalizedTrades.map((trade, index) => ({
                ...trade,
                grossPnl: index % 3 === 0 ? trade.grossPnl - 180 : trade.grossPnl - 45,
                estimatedCosts: trade.estimatedCosts + 8,
                netPnl: index % 3 === 0 ? trade.netPnl - 188 : trade.netPnl - 53
              }))
            : upload.normalizedTrades;
        const report = await runTradeDiagnostics(trades, spec.name, { brokerId: "generic_csv", isDemo: true });
        await updateReportDetails(report.id, {
          name: spec.name,
          strategyLabel: "ORB Demo Strategy",
          reportType: "backtest",
          tags: [...spec.tags]
        });
        reports.push({
          ...report,
          name: spec.name,
          strategyLabel: "ORB Demo Strategy",
          reportType: "backtest",
          tags: [...spec.tags]
        });
      }

      setFullDemoStatus("Building collection");
      const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const collection = await createCollection({
        name: `ORB Demo Strategy Iterations - ${timestamp}`,
        description: "A curated demo collection showing how EdgeTrace tracks strategy changes across iterations.",
        tags: ["demo", "ORB", "strategy-iteration"]
      });
      for (const report of reports) {
        await addReportToCollection(collection.id, report.id);
      }

      setFullDemoStatus("Saving comparison");
      if (reports[0] && reports[2]) {
        await createSavedComparison({
          name: "ORB Demo V1 vs V3",
          description: "Shows how the improved iteration changed expectancy, costs, and R capture.",
          reportAId: reports[0].id,
          reportBId: reports[2].id
        });
      }

      setFullDemoStatus("Opening demo workspace");
      if (authMode === "mock") login();
      setCollectionId(collection.id);
      setCollectionDemoMode(true);
      navigate("collectionDetail", `/app/collections/${collection.id}`);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Unable to launch full demo");
    } finally {
      setFullDemoLoading(false);
      setFullDemoStatus("");
    }
  };

  const cleanUpDemoData = async () => {
    const confirmed = window.confirm(
      "This will delete generated demo reports, demo collections, and demo comparisons. Your non-demo reports will not be affected."
    );
    if (!confirmed) return;
    setDemoError("");
    setDemoCleanupMessage("");
    try {
      const result = await cleanupDemoData();
      setDemoCleanupMessage(
        `Deleted ${result.deletedReports} demo reports, ${result.deletedCollections} demo collections, and ${result.deletedSavedComparisons} demo comparisons.`
      );
      if (demoMode) setDemoMode(false);
      if (collectionDemoMode) setCollectionDemoMode(false);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Unable to clean up demo data");
    }
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
        setDemoMode(false);
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
      setPage("features");
      return;
    }
    if (pathname === "/demo") {
      setPage("demo");
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
      setCollectionDemoMode(false);
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

    void routeToPath(`${window.location.pathname}${window.location.search}`, true);
    const handlePopState = () => {
      void routeToPath(`${window.location.pathname}${window.location.search}`, true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
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
    { target: "upload", label: "Analyze Trades" },
    { target: "reports", label: "Reports" },
    { target: "collections", label: "Strategy Sets" },
    { target: "compare", label: "Compare" },
    { target: "features", label: "How It Works" }
  ];
  const useReportDashboardShell = page === "dashboard" && Boolean(result);
  const useAuthenticatedAppShell = isAuthenticated && !useReportDashboardShell && isAuthenticatedAppPage(page);

  return (
    <div className={`EdgeTrace-contours min-h-screen text-ink ${useAuthenticatedAppShell ? "EdgeTrace-auth-framed" : ""}`}>
      {useAuthenticatedAppShell && (
        <AuthenticatedSidebar
          activeNavPage={activeNavPage}
          userName={user?.name}
          userEmail={user?.email}
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
          onAccount={() => navigate("account")}
          onGuide={() => {
            trackEvent("guide_restarted");
            restartOnboarding();
          }}
          onSignOut={handleSignOut}
        />
      )}

      {!useReportDashboardShell && !useAuthenticatedAppShell && (
      <header className="EdgeTrace-topbar sticky top-0 z-40">
        <div className="EdgeTrace-shell relative flex h-auto flex-col items-center gap-4 py-4 lg:h-16 lg:flex-row lg:justify-between lg:py-0">
          <button
            className="flex shrink-0 items-center justify-center lg:justify-start"
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
            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm lg:ml-auto lg:justify-end">
              <button
                className={`EdgeTrace-nav-link ${page === "home" ? "EdgeTrace-nav-link-active" : ""}`}
                onClick={() => navigate("home")}
              >
                Product
              </button>
              <button
                className={`EdgeTrace-nav-link ${page === "features" ? "EdgeTrace-nav-link-active" : ""}`}
                onClick={() => navigate("features", "/how-it-works")}
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
                + New Report
              </button>
              {userProfile?.planId === "free" && (
                <button className="EdgeTrace-secondary-button px-3 py-2 text-sm" onClick={() => navigate("account")}>
                  Upgrade to Pro
                </button>
              )}
              <div className="hidden items-center gap-2 text-xs text-muted xl:flex">
                <UserCircle size={16} />
                <span>{user?.name ?? "Demo Account"}</span>
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
              <button
                className="border-b border-transparent py-1.5 text-sm font-semibold text-muted hover:border-white/20 hover:text-ink"
                onClick={() => {
                  trackEvent("guide_restarted");
                  restartOnboarding();
                }}
              >
                Guide
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

      {isAuthenticated && !useReportDashboardShell && (
        <OnboardingOverlay
          onStart={() => navigate("upload")}
          onLearn={() => {
            trackEvent("onboarding_learn_workflow_clicked");
            navigate("features", "/app/how-it-works");
          }}
        />
      )}

      {page === "home" && (
        <>
          <HomePage
            onStart={() => navigate(isAuthenticated ? "upload" : "signup", isAuthenticated ? "/app/upload" : "/signup?next=/app/upload")}
            onLearn={() => navigate("features", "/how-it-works")}
            onFullDemo={() => navigate("demo", "/demo")}
            onCleanupDemo={() => void cleanUpDemoData()}
            showDemoCleanup={isAuthenticated}
            fullDemoLoading={fullDemoLoading}
            fullDemoStatus={fullDemoStatus}
          />
          {demoError && (
              <div className="EdgeTrace-shell">
              <div className="rounded-md border border-loss/60 bg-loss/10 p-4 text-loss">{demoError}</div>
            </div>
          )}
          {demoCleanupMessage && (
              <div className="EdgeTrace-shell">
              <div className="rounded-md border border-accent/60 bg-accent/10 p-4 text-accent">{demoCleanupMessage}</div>
            </div>
          )}
        </>
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
      {page === "demo" && (
        <PublicDemoPage
          isAuthenticated={isAuthenticated}
          onAnalyze={() => navigate(isAuthenticated ? "upload" : "signup", isAuthenticated ? "/app/upload" : "/signup?next=/app/upload")}
          onSignup={() => navigate("signup", "/signup?next=/app/upload")}
          onPricing={() => navigate("pricing", "/pricing")}
          onHowItWorks={() => navigate("features", "/how-it-works")}
        />
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
            setDemoMode(false);
            setCreatedReportId(null);
            navigate("dashboard", `/app/dashboard/report/${diagnostics.id}`);
          }}
          onDrillDown={(diagnostics, selection) => {
            setResult(diagnostics);
            setDemoMode(false);
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
            setDemoMode(false);
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
            setDemoMode(false);
            setCreatedReportId(null);
            navigate("dashboard", `/app/dashboard/report/${diagnostics.id}`);
          }}
          onAnalyze={() => navigate("upload")}
          onCompare={(reportId) => openCompare(reportId)}
          onExploreDemo={() => void launchFullDemo()}
        />
      )}
      {page === "collections" && (
        <CollectionsPage
          profile={userProfile}
          onOpen={(collection) => {
            setCollectionId(collection.id);
            setCollectionDemoMode(false);
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
            setDemoMode(false);
            setCreatedReportId(null);
            navigate("dashboard", `/app/dashboard/report/${diagnostics.id}`);
          }}
          onCompare={(reportAId, reportBId) => {
            openCompare(reportAId, reportBId);
          }}
          onAttribution={(selection) => {
            setCollectionAttributionSelection(selection);
            if (collectionId) {
              const params = new URLSearchParams({ dimension: selection.dimension, group: selection.group });
              navigate("collectionAttribution", `/app/collections/${collectionId}/attribution?${params.toString()}`);
            }
          }}
          onReviewWorkspace={() => {
            if (collectionId) navigate("collectionReviewWorkspace", `/app/collections/${collectionId}/review-workspace`);
          }}
          demoMode={collectionDemoMode}
          onExitDemo={() => setCollectionDemoMode(false)}
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
            setDemoMode(false);
            setCreatedReportId(null);
            navigate("dashboard", `/app/dashboard/report/${diagnostics.id}`);
          }}
          onAttribution={(selection) => {
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
          onDemo={() => navigate("demo", "/demo")}
          onSignup={() => navigate("signup", "/signup?next=/app/upload")}
          onOpenReport={async (reportId) => {
            try {
              const report = await getReport(reportId);
              setResult(report);
              setDemoMode(false);
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
          demoMode={demoMode}
          onExitDemo={() => setDemoMode(false)}
          onDrillDown={(selection) => {
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
          onViewReports={() => navigate("reports")}
          onCreateReport={() => navigate("upload")}
          onOpenDashboard={() => navigate("dashboard", `/app/dashboard/report/${result.id}`)}
          onOpenCollections={() => navigate("collections")}
          onOpenFeatures={() => navigate("features")}
          onOpenAccount={() => navigate("account")}
          userName={user?.name}
          userEmail={user?.email}
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
                Analyze Trades
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
          onBack={() => {
            navigate("dashboard", `/app/dashboard/report/${result.id}`);
          }}
        />
      )}
      {page === "compareDrilldown" && compareDrilldownSelection && (
        <CompareDrilldownPage
          {...compareDrilldownSelection}
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
    </div>
  );
}

function AuthenticatedSidebar({
  activeNavPage,
  userName,
  userEmail,
  profile,
  authMode,
  onDashboard,
  onAnalyze,
  onReports,
  onCollections,
  onCompare,
  onFeatures,
  onAccount,
  onGuide,
  onSignOut
}: {
  activeNavPage: Page;
  userName?: string;
  userEmail?: string;
  profile?: UserProfile | null;
  authMode: "clerk" | "mock";
  onDashboard: () => void;
  onAnalyze: () => void;
  onReports: () => void;
  onCollections: () => void;
  onCompare: () => void;
  onFeatures: () => void;
  onAccount: () => void;
  onGuide: () => void;
  onSignOut: () => void;
}) {
  const navItems: Array<{ target: Page; label: string; icon: typeof Home; action: () => void }> = [
    { target: "strategyDashboard", label: "Dashboard", icon: Home, action: onDashboard },
    { target: "upload", label: "Analyze Trades", icon: TrendingUp, action: onAnalyze },
    { target: "reports", label: "Reports", icon: FileText, action: onReports },
    { target: "collections", label: "Strategy Sets", icon: Layers3, action: onCollections },
    { target: "compare", label: "Compare", icon: Scale, action: onCompare },
    { target: "features", label: "How It Works", icon: HelpCircle, action: onFeatures }
  ];

  return (
    <aside className="EdgeTrace-dashboard-sidebar EdgeTrace-auth-sidebar">
      <button className="EdgeTrace-sidebar-brand" onClick={onDashboard} aria-label="EdgeTrace dashboard">
        <img src="/brand/edgetrace_icon_monochrome_white_transparent.png" alt="" aria-hidden="true" />
        <span>EDGETRACE</span>
      </button>

      <nav aria-label="Application navigation" className="EdgeTrace-sidebar-nav">
        {navItems.map(({ target, label, icon: Icon, action }) => (
          <button key={label} className={activeNavPage === target ? "active" : ""} onClick={action}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="EdgeTrace-sidebar-quick">
        <p>Quick Actions</p>
        <button onClick={onAnalyze}>
          <Plus size={17} aria-hidden="true" />
          New Report
        </button>
        <button onClick={onAnalyze}>
          <Upload size={17} aria-hidden="true" />
          Upload Trades
        </button>
        <button onClick={onReports}>
          <FolderOpen size={17} aria-hidden="true" />
          Open Reports
        </button>
      </div>

      <div className="EdgeTrace-auth-sidebar-footer">
        <button className="EdgeTrace-sidebar-user" onClick={onAccount}>
          <span className="EdgeTrace-sidebar-avatar">
            {userName ? initials(userName) : <UserCircle size={18} aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="EdgeTrace-sidebar-name">
              {userName ?? "Demo Analyst"}
              {profile?.planId && <small>{profile.planId.toUpperCase()}</small>}
            </span>
            <span className="EdgeTrace-sidebar-email">{userEmail ?? "demo@edgetrace.local"}</span>
          </span>
        </button>

        <div className="EdgeTrace-auth-sidebar-tools">
          <button onClick={onGuide}>Guide</button>
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
            <button onClick={onSignOut}>
              Sign out <LogOut size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </aside>
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
    "account",
    "dashboard",
    "drilldown",
    "compareDrilldown",
    "reconstructionAudit"
  ].includes(page);
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

import Link from "next/link";
import styles from "./UltronHero.module.css";

type IconName =
  | "arrow"
  | "chevron"
  | "moon"
  | "play"
  | "telemetry"
  | "ai"
  | "cloud"
  | "clock"
  | "shield"
  | "chart"
  | "search"
  | "bell"
  | "settings";

const navigation = [
  { label: "Features", href: "#features", dropdown: true },
  { label: "Dashboard", href: "#dashboard" },
  { label: "Platform", href: "#platform", dropdown: true },
  { label: "Industries", href: "#industries", dropdown: true },
  { label: "Resources", href: "#resources", dropdown: true },
  { label: "Contact", href: "#contact" },
];

const platformFeatures = [
  {
    icon: "telemetry" as IconName,
    title: "Real-time Telemetry",
    subtitle: "<200ms latency",
  },
  {
    icon: "ai" as IconName,
    title: "AI-Powered Insights",
    subtitle: "Predict failures early",
  },
  {
    icon: "cloud" as IconName,
    title: "Edge to Cloud",
    subtitle: "Secure & scalable",
  },
  {
    icon: "clock" as IconName,
    title: "99.9% Uptime",
    subtitle: "Enterprise grade",
  },
];

const heroBenefits = [
  {
    icon: "shield" as IconName,
    title: "Secure by Design",
    subtitle: "End-to-end encryption",
  },
  {
    icon: "chart" as IconName,
    title: "AI Predictive",
    subtitle: "Smart anomaly detection",
  },
  {
    icon: "clock" as IconName,
    title: "Real-time Alerts",
    subtitle: "Instant notifications",
  },
];

function Icon({
  name,
  size = 22,
}: {
  name: IconName;
  size?: number;
}) {
  const properties = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "arrow":
      return (
        <svg {...properties}>
          <path d="M5 12h14" />
          <path d="m14 7 5 5-5 5" />
        </svg>
      );

    case "chevron":
      return (
        <svg {...properties}>
          <path d="m8 10 4 4 4-4" />
        </svg>
      );

    case "moon":
      return (
        <svg {...properties}>
          <path d="M20.5 15.1A8.5 8.5 0 0 1 8.9 3.5a8.5 8.5 0 1 0 11.6 11.6Z" />
        </svg>
      );

    case "play":
      return (
        <svg {...properties}>
          <circle cx="12" cy="12" r="9" />
          <path d="m10 8 6 4-6 4Z" />
        </svg>
      );

    case "shield":
      return (
        <svg {...properties}>
          <path d="M12 3 5 6v5c0 4.8 2.8 8.1 7 10 4.2-1.9 7-5.2 7-10V6l-7-3Z" />
          <path d="m9.2 12 1.8 1.8 3.8-4" />
        </svg>
      );

    case "chart":
      return (
        <svg {...properties}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
          <path d="m7 15 3-3 3 2 4-5" />
        </svg>
      );

    case "clock":
      return (
        <svg {...properties}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );

    case "telemetry":
      return (
        <svg {...properties}>
          <path d="M12 3v7" />
          <path d="M9.4 6.4a6 6 0 1 0 5.2 0" />
          <path d="M12 13v3" />
          <path d="M9 16h6" />
        </svg>
      );

    case "ai":
      return (
        <svg {...properties}>
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <path d="M9 2v3M15 2v3M9 19v3M15 19v3" />
          <path d="M2 9h3M2 15h3M19 9h3M19 15h3" />
          <path d="m9 14 2-5 2 5 2-5" />
        </svg>
      );

    case "cloud":
      return (
        <svg {...properties}>
          <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11.5 3.3 3.3 0 0 0 7 18Z" />
          <path d="M12 8v7" />
          <path d="m9.5 12.5 2.5 2.5 2.5-2.5" />
        </svg>
      );

    case "search":
      return (
        <svg {...properties}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );

    case "bell":
      return (
        <svg {...properties}>
          <path d="M18 9a6 6 0 1 0-12 0c0 6-3 7-3 7h18s-3-1-3-7" />
          <path d="M10 20h4" />
        </svg>
      );

    case "settings":
      return (
        <svg {...properties}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
          <path d="m5.3 5.3 2.1 2.1M16.6 16.6l2.1 2.1" />
          <path d="m18.7 5.3-2.1 2.1M7.4 16.6l-2.1 2.1" />
        </svg>
      );
  }
}

function DashboardMetric({
  label,
  value,
  status,
  trend,
  critical = false,
}: {
  label: string;
  value: string;
  status: string;
  trend: string;
  critical?: boolean;
}) {
  return (
    <article className={styles.metricCard}>
      <span className={styles.metricLabel}>{label}</span>
      <strong>{value}</strong>

      <div
        className={
          critical ? styles.metricStatusCritical : styles.metricStatusHealthy
        }
      >
        <span>{status}</span>
        <span>{trend}</span>
      </div>
    </article>
  );
}

function DashboardPresentation() {
  return (
    <div className={styles.dashboardPresentation} id="dashboard">
      <div className={styles.dashboardGlow} />

      <div className={styles.dashboardScreen}>
        <div className={styles.dashboardToolbar}>
          <div className={styles.dashboardLogo}>ULTRON</div>

          <div className={styles.dashboardIcons}>
            <Icon name="search" size={15} />
            <Icon name="bell" size={15} />
            <Icon name="settings" size={15} />
          </div>
        </div>

        <div className={styles.dashboardTitleRow}>
          <h2>Overview</h2>

          <button type="button">
            Last 24 hours
            <Icon name="chevron" size={14} />
          </button>
        </div>

        <div className={styles.metricsGrid}>
          <DashboardMetric
            label="Machines"
            value="128"
            status="Active"
            trend="↑ 6%"
          />

          <DashboardMetric
            label="Health Score"
            value="96%"
            status="Excellent"
            trend="↑ 4%"
          />

          <DashboardMetric
            label="Active Alarms"
            value="2"
            status="Critical"
            trend="↓ 1"
            critical
          />

          <DashboardMetric
            label="MTBF"
            value="512h"
            status="Improving"
            trend="↑ 8%"
          />
        </div>

        <div className={styles.dashboardCharts}>
          <article className={styles.chartPanel}>
            <div className={styles.panelHeading}>Health Trend</div>

            <div className={styles.healthChart}>
              <div className={styles.chartGrid} />

              <svg
                viewBox="0 0 420 180"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient
                    id="health-area"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#e8b55f"
                      stopOpacity=".3"
                    />
                    <stop
                      offset="100%"
                      stopColor="#e8b55f"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>

                <path
                  className={styles.healthArea}
                  d="
                    M0 136
                    C40 103 67 112 92 83
                    C117 55 147 114 178 92
                    C208 69 227 39 258 63
                    C292 89 314 93 342 58
                    C368 25 391 40 420 12
                    L420 180
                    L0 180
                    Z
                  "
                />

                <path
                  className={styles.healthLine}
                  d="
                    M0 136
                    C40 103 67 112 92 83
                    C117 55 147 114 178 92
                    C208 69 227 39 258 63
                    C292 89 314 93 342 58
                    C368 25 391 40 420 12
                  "
                />

                <circle
                  className={styles.healthPoint}
                  cx="420"
                  cy="12"
                  r="5"
                />
              </svg>

              <div className={styles.chartTimes}>
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00</span>
              </div>
            </div>
          </article>

          <article className={styles.mapPanel}>
            <div className={styles.panelHeading}>Machine Map</div>

            <div className={styles.machineMap}>
              <div className={styles.machineMapGrid} />

              <span
                className={`${styles.mapNode} ${styles.nodeOne} ${styles.nodeHealthy}`}
              />
              <span
                className={`${styles.mapNode} ${styles.nodeTwo} ${styles.nodeHealthy}`}
              />
              <span
                className={`${styles.mapNode} ${styles.nodeThree} ${styles.nodeWarning}`}
              />
              <span
                className={`${styles.mapNode} ${styles.nodeFour} ${styles.nodeCritical}`}
              />
              <span
                className={`${styles.mapNode} ${styles.nodeFive} ${styles.nodeCritical}`}
              />
            </div>
          </article>
        </div>
      </div>

      <div className={styles.machineryPlatform} aria-hidden="true">
        <div className={styles.platformBase} />

        <div className={`${styles.motor} ${styles.motorOne}`}>
          <span />
          <span />
          <span />
        </div>

        <div className={`${styles.motor} ${styles.motorTwo}`}>
          <span />
          <span />
          <span />
        </div>

        <div className={`${styles.motor} ${styles.motorThree}`}>
          <span />
          <span />
          <span />
        </div>

        <div className={styles.platformPipe} />
      </div>
    </div>
  );
}

export default function UltronHero() {
  return (
    <section className={styles.hero}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/" className={styles.brand} aria-label="ULTRON home">
            <span className={styles.brandName}>ULTRON</span>
            <span className={styles.brandTagline}>
              MACHINE HEALTH, IN REAL TIME
            </span>
          </Link>

          <nav className={styles.navigation} aria-label="Primary navigation">
            {navigation.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={styles.navigationLink}
              >
                {item.label}

                {item.dropdown && (
                  <Icon name="chevron" size={14} />
                )}
              </Link>
            ))}
          </nav>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.themeButton}
              aria-label="Toggle appearance"
            >
              <Icon name="moon" size={20} />
            </button>

            <Link href="/login" className={styles.signInButton}>
              Sign in
            </Link>

            <Link
              href="/signup"
              className={styles.requestDemoButton}
            >
              Request Demo
              <Icon name="arrow" size={18} />
            </Link>
          </div>
        </div>
      </header>

      <div className={styles.featureStrip}>
        <div className={styles.featureStripContent}>
          {platformFeatures.map((feature, index) => (
            <div className={styles.platformFeature} key={feature.title}>
              <span className={styles.platformFeatureIcon}>
                <Icon name={feature.icon} size={23} />
              </span>

              <span className={styles.platformFeatureText}>
                <strong>{feature.title}</strong>
                <small>{feature.subtitle}</small>
              </span>

              {index < platformFeatures.length - 1 && (
                <span className={styles.featureDivider} />
              )}
            </div>
          ))}

          <div className={styles.systemStatus}>
            <span className={styles.systemStatusDot} />
            All Systems Operational
          </div>
        </div>
      </div>

      <div className={styles.backgroundImage} aria-hidden="true" />
      <div className={styles.backgroundPattern} aria-hidden="true" />

      <div className={styles.heroContent}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            INDUSTRIAL IOT
            <span className={styles.eyebrowSeparator}>·</span>
            PREDICTIVE MAINTENANCE
          </div>

          <h1>
            MACHINE HEALTH,
            <span>IN REAL TIME</span>
          </h1>

          <div className={styles.headingDecoration}>
            <span />
          </div>

          <p>
            ULTRON turns raw sensor telemetry into live dashboards and
            AI-driven failure prediction—so you fix machines before they
            break, not after.
          </p>

          <div className={styles.heroActions}>
            <Link href="/" className={styles.primaryButton}>
              Launch console
              <Icon name="arrow" size={20} />
            </Link>

            <Link href="#dashboard" className={styles.secondaryButton}>
              <Icon name="play" size={21} />
              See it live
            </Link>
          </div>

          <div className={styles.benefits}>
            {heroBenefits.map((benefit, index) => (
              <div className={styles.benefit} key={benefit.title}>
                <Icon name={benefit.icon} size={24} />

                <span>
                  <strong>{benefit.title}</strong>
                  <small>{benefit.subtitle}</small>
                </span>

                {index < heroBenefits.length - 1 && (
                  <span className={styles.benefitDivider} />
                )}
              </div>
            ))}
          </div>
        </div>

        <DashboardPresentation />
      </div>

      <div className={styles.partnerBar}>
        <span className={styles.partnerHeading}>
          TRUSTED BY INDUSTRY LEADERS
        </span>

        <span>VEDANTA</span>
        <span>TATA STEEL</span>
        <span>HINDALCO</span>
        <span>JSW</span>
        <span>SAIL</span>
        <span>HINDUSTAN ZINC</span>
      </div>

      <button
        type="button"
        className={styles.chatButton}
        aria-label="Open support chat"
      >
        <span />
      </button>
    </section>
  );
}
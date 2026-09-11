import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Compass,
  Info,
  QrCode,
  ShieldCheck,
  TicketCheck,
} from "lucide-react";
import { getProfile } from "@/lib/auth";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Regulated visitor access",
  description:
    "PRAVAAH lets visitors browse regulated destinations, request a entry permit and carry a QR pass, while the department controls capacity, quotas and approvals.",
};

/**
 * Public landing page (Phase 13 "Landing").
 *
 * The root used to auto-redirect every visitor, which meant an anonymous tourist
 * never saw an entry point and an operator had no idea what the product was before
 * signing in. It now presents the two audiences explicitly and lets each choose.
 *
 * The choice is a link, not a client-side role claim: which surface the visitor
 * lands on is decided by the server from the `profiles` row (AGENTS.md rule 6 —
 * a role is never taken from the browser). If a session already exists, the same
 * card simply points at the surface that session belongs to, so nobody has to
 * sign in twice to get where they were going.
 */
export default async function LandingPage() {
  const profile = await getProfile();
  const isOperator = profile?.role === "DEPARTMENT_OPERATOR";
  const displayName = profile?.full_name?.trim() || null;

  const operatorHref = isOperator ? "/overview" : "/login";
  const operatorCta = isOperator ? "Open the console" : "Operator sign in";
  const visitorCta = profile ? "Continue to visitor home" : "Continue as visitor";

  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>

      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Link href="/" className={styles.brand}>
            <Image
              src="/logo.jpeg"
              width={40}
              height={40}
              alt=""
              className={styles.logo}
              preload
            />
            <span className={styles.brandText}>
              <strong>PRAVAAH</strong>
              <small>Regulated visitor access</small>
            </span>
          </Link>

          <div className={styles.barActions}>
            {profile ? (
              <Link href="/logout" className={styles.ghost}>
                Sign out{displayName ? ` (${displayName.split(" ")[0]})` : ""}
              </Link>
            ) : (
              <>
                <Link href="/login" className={styles.ghost}>
                  Sign in
                </Link>
                <Link href="/register" className={styles.barCta}>
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className={styles.main} tabIndex={-1}>
        <section className={styles.hero}>
          <Image
            src="/logo.jpeg"
            width={68}
            height={68}
            alt="PRAVAAH emblem"
            className={styles["logo--hero"]}
            preload
          />
          <p className={styles["hero__eyebrow"]}>
            <ShieldCheck size={14} aria-hidden="true" /> Department of tourism
          </p>
          <h1 className={styles["hero__title"]}>
            Plan a protected visit, carry a verified permit
          </h1>
          <p className={styles["hero__desc"]}>
            PRAVAAH keeps fragile destinations within their carrying capacity. Visitors see live
            capacity and access status, request a permit for the day they want to go, and present a
            QR pass at the checkpoint. The department decides approvals against capacity and the
            daily quota.
          </p>
          <div className={styles["hero__actions"]}>
            <Link href="/visitor" className={styles.cta}>
              {visitorCta} <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link href={operatorHref} className={styles.ctaAlt}>
              {operatorCta}
            </Link>
          </div>
          <p className={styles["hero__note"]}>
            <Info size={15} aria-hidden="true" />
            Browsing destinations is open to everyone. Requesting a permit needs an account, and
            approval is always a department decision.
          </p>
        </section>

        <section className={styles.choice} aria-labelledby="choose-heading">
          <div>
            <h2 id="choose-heading" className={styles["choice__heading"]}>
              Choose how you are using PRAVAAH
            </h2>
            <p className={styles["choice__sub"]}>
              Visitors and department staff use different surfaces. Pick the one that describes you.
            </p>
          </div>

          <article className={styles.card}>
            <span className={styles["card__icon"]}>
              <Compass size={23} aria-hidden="true" />
            </span>
            <div>
              <p className={styles["card__eyebrow"]}>For visitors</p>
              <h3 className={styles["card__title"]}>Tourist access</h3>
            </div>
            <p className={styles["card__desc"]}>
              Everything a traveller needs to plan and complete a regulated visit.
            </p>
            <ul className={styles["card__list"]}>
              <li>
                <BadgeCheck size={16} aria-hidden="true" />
                <span>Browse destinations with live capacity and access status</span>
              </li>
              <li>
                <TicketCheck size={16} aria-hidden="true" />
                <span>Request an entry permit and track its decision</span>
              </li>
              <li>
                <QrCode size={16} aria-hidden="true" />
                <span>Show your QR pass at the checkpoint on the day of the visit</span>
              </li>
            </ul>
            <Link href="/visitor" className={styles["card__go"]}>
              {visitorCta} <ArrowRight size={16} aria-hidden="true" />
            </Link>
            {profile && !isOperator ? (
              <p className={styles["card__foot"]}>
                Signed in as {displayName || profile.id}.
              </p>
            ) : !profile ? (
              <p className={styles["card__foot"]}>
                No account yet? <Link href="/register">Create one</Link> — new accounts are
                visitors.
              </p>
            ) : null}
          </article>

          <article className={`${styles.card} ${styles["card--staff"]}`}>
            <span className={styles["card__icon"]}>
              <Building2 size={23} aria-hidden="true" />
            </span>
            <div>
              <p className={styles["card__eyebrow"]}>For department staff</p>
              <h3 className={styles["card__title"]}>Operations console</h3>
            </div>
            <p className={styles["card__desc"]}>
              The control surface for capacity, permits and field checkpoints.
            </p>
            <ul className={styles["card__list"]}>
              <li>
                <BadgeCheck size={16} aria-hidden="true" />
                <span>Monitor occupancy against carrying capacity in real time</span>
              </li>
              <li>
                <TicketCheck size={16} aria-hidden="true" />
                <span>Review, approve, restrict or reject permit requests</span>
              </li>
              <li>
                <QrCode size={16} aria-hidden="true" />
                <span>Scan passes at the checkpoint and run check-in / check-out</span>
              </li>
            </ul>
            <Link href={operatorHref} className={styles["card__go"]}>
              {operatorCta} <ArrowRight size={16} aria-hidden="true" />
            </Link>
            {isOperator ? (
              <p className={styles["card__foot"]}>
                Signed in as {displayName || profile?.id}.
              </p>
            ) : (
              <p className={styles["card__foot"]}>
                Operator access is granted by an administrator.
              </p>
            )}
          </article>
        </section>

        <section className={styles.steps} aria-labelledby="how-heading">
          <h2 id="how-heading" className={styles["choice__heading"]}>
            How a visit works
          </h2>
          <p className={styles["choice__sub"]}>
            Four steps, from choosing a destination to leaving it.
          </p>
          <ol className={styles["steps__list"]}>
            {[
              {
                title: "Choose a destination",
                body: "See live capacity, remaining daily quota and any access restriction before you plan.",
              },
              {
                title: "Request a permit",
                body: "Submit your visit date and group size. Your request reserves nothing until it is approved.",
              },
              {
                title: "Department decision",
                body: "The department approves against carrying capacity and quota. You follow the status in My permits.",
              },
              {
                title: "Show your QR pass",
                body: "An approved permit carries a QR pass that staff scan at the checkpoint on arrival.",
              },
            ].map((step, index) => (
              <li key={step.title}>
                <span className={styles["steps__num"]}>{index + 1}</span>
                <span className={styles["steps__body"]}>
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>PRAVAAH — regulated visitor access</span>
          <span className={styles.footNote}>
            Capacity, quotas and permit decisions are owned by the department and enforced
            server-side. PRAVAAH does not make safety or medical judgements.
          </span>
        </div>
      </footer>
    </div>
  );
}

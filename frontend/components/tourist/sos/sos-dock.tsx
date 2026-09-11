"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Phone, Siren, X } from "lucide-react";
import {
  EMERGENCY_SERVICES_NUMBER,
  telHref,
  type EmergencyContact,
} from "@/lib/emergency-contacts";
import styles from "./sos.module.css";

/**
 * Floating SOS for tourists (visitor shell).
 *
 * Scope is deliberately narrow, and it matches what the PRD can support without
 * inventing a dispatch system it never specified (§4 places SOS out of MVP
 * scope): tapping the button reveals the pan-India emergency line and the
 * emergency contacts already saved on the visitor's permits, each as a `tel:`
 * link. Nothing is sent, filed, or auto-dialled — a human taps a number. The
 * contacts arrive as props from the server shell, so no client-side Supabase read
 * and no new endpoint is needed here.
 *
 * The control is a disclosure, not a modal: it never traps the rest of the page,
 * because in an emergency a visitor may need to keep scrolling to their permit.
 * Escape or a click outside closes it, and focus is returned to the button.
 */
export function SosDock({
  contacts,
  signedIn,
}: {
  contacts: EmergencyContact[];
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the control the visitor opened it from, so a keyboard or
    // screen-reader user is not dropped at the top of the document.
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    // Move focus into the panel so it is reachable immediately after opening.
    panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  const servicesHref = telHref(EMERGENCY_SERVICES_NUMBER) ?? "tel:112";

  return (
    <div className={styles.dock} ref={rootRef}>
      {open ? (
        <div
          className={styles.panel}
          id="prv-sos-panel"
          ref={panelRef}
          role="region"
          aria-label="Emergency help"
        >
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Emergency help</h2>
            <button
              type="button"
              className={styles.close}
              onClick={close}
              aria-label="Close emergency help"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <a className={styles.primaryCall} href={servicesHref}>
            <Phone size={20} aria-hidden="true" />
            <span>
              <strong>Call {EMERGENCY_SERVICES_NUMBER}</strong>
              <small>Police · Fire · Ambulance</small>
            </span>
          </a>

          {contacts.length > 0 ? (
            <div className={styles.contacts}>
              <p className={styles.contactsLabel}>Your emergency contact</p>
              <ul className={styles.contactList}>
                {contacts.map((contact) => (
                  <li key={contact.phone}>
                    <a className={styles.contact} href={`tel:${contact.phone}`}>
                      <span className={styles.contactWho}>
                        <strong>{contact.name ?? "Saved contact"}</strong>
                        {contact.relationship ? (
                          <small>{contact.relationship}</small>
                        ) : null}
                      </span>
                      <span className={styles.contactPhone}>
                        <Phone size={15} aria-hidden="true" />
                        {contact.phone}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className={styles.empty}>
              {signedIn
                ? "No emergency contact saved yet. It appears here once you add one to a permit request."
                : "Sign in and request a permit to show your own emergency contact here."}
            </p>
          )}

          <p className={styles.note}>
            <Info size={13} aria-hidden="true" />
            <span>
              PRAVAAH does not call anyone for you. Use these numbers to reach help
              yourself.
            </span>
          </p>
        </div>
      ) : null}

      <button
        type="button"
        ref={toggleRef}
        className={styles.fab}
        aria-expanded={open}
        aria-controls={open ? "prv-sos-panel" : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <X size={22} aria-hidden="true" />
        ) : (
          <Siren size={22} aria-hidden="true" />
        )}
        <span>{open ? "Close" : "SOS"}</span>
      </button>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Anchor, BriefcaseBusiness, Building2, Moon, Sun } from "lucide-react";
import { FormRenderer, LocalStorageDraftAdapter, attachmentPlugin, auditTrailPlugin, formAnalyticsPlugin, type FormPlatformContext, type OptionDataSource, type SelectOption } from "@admiral/form-platform";
import { bookingInitialValues, employeeInitialValues, employeeOnboardingForm, shipmentBookingForm } from "./forms";
import "./styles.css";

function App(): JSX.Element {
  const [form, setForm] = useState<"booking" | "employee">("booking");
  const [tenant, setTenant] = useState("tenant-a");
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());
  const [dark, setDarkState] = useState(() => readStoredTheme() === "dark");
  const setLocale = (nextLocale: Locale): void => {
    setLocaleState(nextLocale);
    localStorage.setItem(localeStorageKey, nextLocale);
  };
  const toggleTheme = (): void => {
    setDarkState((value) => {
      const nextTheme = value ? "light" : "dark";
      localStorage.setItem(themeStorageKey, nextTheme);
      return nextTheme === "dark";
    });
  };
  const draftAdapter = useMemo(() => new LocalStorageDraftAdapter(), []);
  const dataSources = useMemo(() => createShowcaseDataSources(), []);
  const auditEvents = useMemo<Array<{ event: string; timestamp: string }>>(() => [], []);
  const context: FormPlatformContext = {
    tenantId: tenant,
    userId: "user-42",
    locale,
    timezone: "Asia/Tehran",
    permissions: tenant === "tenant-a" ? ["booking.discount.write", "payroll.salary.read", "payroll.salary.write"] : ["payroll.salary.read"],
    correlationId: `corr-${tenant}-${locale}`
  };
  const definition = form === "booking" ? shipmentBookingForm : employeeOnboardingForm;
  const initialValues = form === "booking" ? bookingInitialValues : employeeInitialValues;
  const copy = appCopy[locale];
  return (
    <div className={dark ? "app app-dark" : "app"}>
      <div className="dashboard-shell" dir={locale === "fa" ? "rtl" : "ltr"}>
        <aside className="shell-sidebar">
          <div className="brand">
            <div className="brand-mark"><Anchor size={22} /></div>
          </div>
          <button className={form === "booking" ? "nav-item nav-item-active" : "nav-item"} onClick={() => setForm("booking")}><Building2 size={19} /> <span>{copy.booking}</span></button>
          <button className={form === "employee" ? "nav-item nav-item-active" : "nav-item"} onClick={() => setForm("employee")}><BriefcaseBusiness size={19} /> <span>{copy.onboarding}</span></button>
          <div className="sidebar-spacer" />
          <button className="round-action button-theme-sticky" aria-label={copy.theme} onClick={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        </aside>

        <main className="workspace">
          <header className="workspace-header">
            <div>
              <h1>{copy.dashboard}</h1>
              <p>{form === "booking" ? copy.bookingSubtitle : copy.onboardingSubtitle}</p>
            </div>
            <div className="top-actions">
              <select className="context-select" aria-label="Tenant" value={tenant} onChange={(event) => setTenant(event.currentTarget.value)}>
                <option value="tenant-a">{copy.tenantA}</option>
                <option value="tenant-b">{copy.tenantB}</option>
              </select>
              <div className="segmented header-segmented">
                <button className={locale === "en" ? "selected" : ""} onClick={() => setLocale("en")}>EN</button>
                <button className={locale === "fa" ? "selected" : ""} onClick={() => setLocale("fa")}>FA</button>
              </div>
            </div>
          </header>

          <div className="dashboard-grid">
            <div className="dashboard-main">
              <section className="form-board">
                <FormRenderer
                  key={`${definition.id}-${tenant}-${locale}`}
                  definition={definition}
                  initialValues={initialValues}
                  context={context}
                  draftAdapter={draftAdapter}
                  dataSources={dataSources}
                  plugins={[attachmentPlugin(), auditTrailPlugin(auditEvents), formAnalyticsPlugin(1)]}
                />
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

type Locale = "en" | "fa";
type Theme = "light" | "dark";

const localeStorageKey = "admiral-showcase-locale";
const themeStorageKey = "admiral-showcase-theme";

function readStoredLocale(): Locale {
  const value = localStorage.getItem(localeStorageKey);
  return value === "fa" || value === "en" ? value : "en";
}

function readStoredTheme(): Theme {
  const value = localStorage.getItem(themeStorageKey);
  return value === "dark" || value === "light" ? value : "light";
}

function createShowcaseDataSources(): Record<string, OptionDataSource<SelectOption>> {
  return {
    voyages: {
      async search(query, context, signal) {
        await delay(180, signal);
        const loading = String(query.dependencies?.portOfLoading ?? "");
        const discharge = String(query.dependencies?.portOfDischarge ?? "");
        const tenantPrefix = context.tenantId === "tenant-a" ? "A" : "B";
        const allItems = loading && discharge ? [
          { value: "VOY-881", label: { en: `${tenantPrefix} VOY-881 / July Express`, fa: `${tenantPrefix} VOY-881 / اکسپرس جولای` } },
          { value: "VOY-914", label: { en: `${tenantPrefix} VOY-914 / Caspian Link`, fa: `${tenantPrefix} VOY-914 / لینک کاسپین` } },
          { value: "VOY-102", label: { en: `${tenantPrefix} VOY-102 / Gulf Feeder`, fa: `${tenantPrefix} VOY-102 / فیدر خلیج` } },
          { value: "VOY-330", label: { en: `${tenantPrefix} VOY-330 / Northern Star`, fa: `${tenantPrefix} VOY-330 / ستاره شمالی` } }
        ] : [];
        const filtered = filterOptions(allItems, query.query);
        return pageOptions(filtered, query.cursor);
      }
    },
    managers: {
      async search(query, context, signal) {
        await delay(160, signal);
        const department = String(query.dependencies?.department ?? "");
        const tenantSuffix = context.tenantId === "tenant-a" ? "" : " - B";
        const byDepartment: Record<string, SelectOption[]> = {
          ops: [{ value: "m-smith", label: { en: `Mina Smith${tenantSuffix}`, fa: `مینا اسمیت${tenantSuffix}` } }],
          finance: [{ value: "a-kazemi", label: { en: `Arman Kazemi${tenantSuffix}`, fa: `آرمان کاظمی${tenantSuffix}` } }],
          engineering: [{ value: "s-nouri", label: { en: `Sara Nouri${tenantSuffix}`, fa: `سارا نوری${tenantSuffix}` } }]
        };
        return { items: filterOptions(byDepartment[department] ?? [], query.query) };
      }
    }
  };
}

function filterOptions(items: SelectOption[], query: string): SelectOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => {
    const labels = typeof item.label === "string" ? [item.label] : Object.values(item.label);
    return [item.value, ...labels].some((value) => String(value ?? "").toLowerCase().includes(normalized));
  });
}

function pageOptions(items: SelectOption[], cursor: string | undefined): { items: SelectOption[]; nextCursor?: string } {
  const pageSize = 2;
  const start = cursor ? Number(cursor) : 0;
  const safeStart = Number.isFinite(start) ? start : 0;
  const page = items.slice(safeStart, safeStart + pageSize);
  const next = safeStart + pageSize < items.length ? String(safeStart + pageSize) : undefined;
  return { items: page, ...(next ? { nextCursor: next } : {}) };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("Request aborted", "AbortError"));
    }, { once: true });
  });
}

const appCopy = {
  en: {
    dashboard: "Dashboard",
    booking: "Booking",
    onboarding: "Onboarding",
    bookingSubtitle: "Shipment booking form operations",
    onboardingSubtitle: "Employee onboarding workflow",
    tenantA: "Tenant A",
    tenantB: "Tenant B",
    theme: "Theme"
  },
  fa: {
    dashboard: "داشبورد",
    booking: "رزرو حمل",
    onboarding: "شروع همکاری",
    bookingSubtitle: "عملیات فرم رزرو حمل کانتینری",
    onboardingSubtitle: "فرآیند شروع همکاری کارمند",
    tenantA: "مستاجر الف",
    tenantB: "مستاجر ب",
    theme: "تغییر پوسته"
  }
} as const;

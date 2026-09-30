"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Guard = { dirty: boolean; save: () => Promise<void> };
type Pending = { kind: "route"; href: string; scroll?: boolean } | { kind: "back" };
type NavigationContext = {
  register: (guard: Guard | null) => void;
  navigate: (href: string, options?: { scroll?: boolean; bypass?: boolean }) => void;
};

const Context = createContext<NavigationContext | null>(null);

export function useProductionNavigation() {
  const value = useContext(Context);
  if (!value) throw new Error("ProductionNavigationGuard is missing");
  return value;
}

export default function ProductionNavigationGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const guardRef = useRef<Guard | null>(null);
  const leavingRef = useRef(false);
  const pendingRef = useRef<Pending | null>(null);
  const sentinelRef = useRef(false);
  const allowBackRef = useRef(false);
  const [pending, setPending] = useState<Pending | null>(null);
  pendingRef.current = pending;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { leavingRef.current = false; }, [pathname]);

  const register = useCallback((guard: Guard | null) => {
    if (leavingRef.current) return;
    guardRef.current = guard;
    if (guard?.dirty && !sentinelRef.current && !pendingRef.current) {
      window.history.pushState({ ...window.history.state, productionDraftGuard: true }, "", window.location.href);
      sentinelRef.current = true;
    }
    if (!guard?.dirty && sentinelRef.current && !pendingRef.current) {
      allowBackRef.current = true;
      sentinelRef.current = false;
      window.history.back();
    }
  }, []);

  const pushRoute = useCallback((href: string, scroll?: boolean) => {
    if (!sentinelRef.current) { router.push(href, { scroll }); return; }
    sentinelRef.current = false;
    allowBackRef.current = true;
    window.addEventListener("popstate", () => router.push(href, { scroll }), { once: true });
    window.history.back();
  }, [router]);

  const navigate = useCallback((href: string, options?: { scroll?: boolean; bypass?: boolean }) => {
    if (!options?.bypass && guardRef.current?.dirty) {
      setError("");
      setPending({ kind: "route", href, scroll: options?.scroll });
      return;
    }
    if (options?.bypass) { guardRef.current = null; leavingRef.current = true; }
    pushRoute(href, options?.scroll);
  }, [pushRoute]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!guardRef.current?.dirty || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      setError("");
      setPending({ kind: "route", href: `${destination.pathname}${destination.search}${destination.hash}` });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!guardRef.current?.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onPopState = () => {
      if (allowBackRef.current) { allowBackRef.current = false; return; }
      if (!guardRef.current?.dirty) return;
      sentinelRef.current = false;
      setError("");
      setPending({ kind: "back" });
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  function finishNavigation(target: Pending) {
    guardRef.current = null;
    leavingRef.current = true;
    setPending(null);
    if (target.kind === "back") {
      allowBackRef.current = true;
      window.history.back();
    } else {
      pushRoute(target.href, target.scroll);
    }
  }

  async function saveAndLeave() {
    if (!pending || !guardRef.current) return;
    setSaving(true);
    setError("");
    try {
      await guardRef.current.save();
      finishNavigation(pending);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (pending?.kind === "back" && !sentinelRef.current) {
      window.history.pushState({ ...window.history.state, productionDraftGuard: true }, "", window.location.href);
      sentinelRef.current = true;
    }
    setPending(null);
    setError("");
  }

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        event.preventDefault();
        if (pending.kind === "back" && !sentinelRef.current) {
          window.history.pushState({ ...window.history.state, productionDraftGuard: true }, "", window.location.href);
          sentinelRef.current = true;
        }
        setPending(null);
        setError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, saving]);

  return <Context.Provider value={{ register, navigate }}>
    {children}
    {pending && <div className="production-leave-backdrop" role="presentation">
      <section className="production-leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="production-leave-title" aria-describedby="production-leave-description">
        <span className="section-kicker">未保存的商品资料</span>
        <h2 id="production-leave-title">离开前是否保存？</h2>
        <p id="production-leave-description">当前表单修改尚未保存。已上传的图片会保留；选择“不保存”只放弃未保存的表单修改。</p>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="production-leave-actions">
          <button type="button" className="secondary" disabled={saving} onClick={cancel}>取消</button>
          <button type="button" className="secondary" disabled={saving} onClick={() => finishNavigation(pending)}>不保存并离开</button>
          <button type="button" className="primary" disabled={saving} onClick={() => void saveAndLeave()} autoFocus>{saving ? "保存中…" : "保存并离开"}</button>
        </div>
      </section>
    </div>}
  </Context.Provider>;
}

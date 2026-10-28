import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";

// Keeps a piece of screen state (which tab, which section) in the page URL
// (?tab=budget) instead of in memory only.
//
// Why: this app is a single page, so the browser/phone Back button steps
// through *URL changes*. Tabs that lived only in React state never changed the
// URL, so Back skipped straight past them and left the whole department.
// With the state in the URL, every tab/section change is one history step and
// Back returns to exactly where the person just was.
//
// Setting a value:
//  - pushes a new history entry (so Back works), unless the URL wouldn't change
//  - drops the key when it equals the default (keeps URLs clean)
//  - clears every deeper key (see ORDER) so a stale ?section= from one tab
//    can't leak into another
// Other query params (e.g. a payment return reference) are always preserved.

// Outer -> inner. Changing one clears everything after it.
const ORDER = ["tab", "rtab", "corps", "section", "sub", "view", "sec", "sec2"];

export default function useUrlState(key, defaultValue = null) {
  const [params, setParams] = useSearchParams();
  // Always read the latest default (it can change between renders, e.g. the
  // first visible section of a dropdown), not the one from when the setter was made.
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;
  const resolveDefault = () => (typeof defaultRef.current === "function" ? defaultRef.current() : defaultRef.current);
  const raw = params.get(key);
  const value = raw === null || raw === "" ? resolveDefault() : raw;

  const setValue = useCallback(
    (next, { replace = false } = {}) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const def = resolveDefault();
          if (next === null || next === undefined || next === def) p.delete(key);
          else p.set(key, String(next));
          const at = ORDER.indexOf(key);
          if (at >= 0) ORDER.slice(at + 1).forEach((k) => p.delete(k));
          return p;
        },
        { replace }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, setParams]
  );

  return [value, setValue];
}

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Drop-in replacement for <input type="password" ... /> — same props,
// same global `.field input` styling (border/rounded/padding come from
// index.css, which targets `input` regardless of nesting depth, so
// wrapping it here doesn't break that). Adds a click-to-reveal eye icon
// so people can check what they typed before submitting. Only the
// padding-right is overridden inline (so the icon never sits on top of
// typed text) — inline style is used specifically because `.field input`
// has higher CSS specificity than a plain utility class and would
// otherwise win over it.
export default function PasswordInput({ className = "", style, ...props }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={className}
        style={{ paddingRight: "2.5rem", ...style }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-500 hover:text-ink-800"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

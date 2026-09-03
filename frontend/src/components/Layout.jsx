import { useLocation } from "react-router-dom";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";

// Once someone is inside their account (any /dashboard/* or /admin/* room),
// the public site chrome (top nav with Home/Products/About/Contact, footer)
// should disappear entirely — the whole page is "their account" now, with
// navigation happening through the room's own sidebar instead.
function isDashboardRoute(pathname) {
  return pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const inDashboard = isDashboardRoute(pathname);

  if (inDashboard) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

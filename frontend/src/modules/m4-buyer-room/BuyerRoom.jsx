import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, ShoppingBasket, History, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import BuyerProfileCard from "./BuyerProfileCard.jsx";
import StandardPriceList from "./StandardPriceList.jsx";
import StandingCommitmentCard from "./StandingCommitmentCard.jsx";
import ProductCatalog from "./ProductCatalog.jsx";
import ProductDetailPanel from "./ProductDetailPanel.jsx";
import CartBar from "./CartBar.jsx";
import CartReview from "./CartReview.jsx";
import CheckoutForm from "./CheckoutForm.jsx";
import PaymentPlaceholder from "./PaymentPlaceholder.jsx";
import OrderConfirmation from "./OrderConfirmation.jsx";
import OrderHistory from "./OrderHistory.jsx";
import { mergeCatalog } from "./catalogMeta.js";

function mapCommitment(user) {
  return {
    active: (user?.standingCommitmentTotal || 0) > 0,
    totalCommitted: user?.standingCommitmentTotal || 0,
    balanceRemaining: user?.standingCommitmentBalance || 0,
    durationYears: user?.standingCommitmentYears || 1,
  };
}

function mapOrder(o) {
  return {
    id: o.id,
    reference: o.reference,
    items: o.items.map((i) => ({
      crop: i.crop,
      quantity: Number(i.quantity),
      unit: i.unit,
      size: i.size,
      lineTotal: Number(i.line_total ?? i.lineTotal),
    })),
    total: Number(o.total),
    deliveryLocation: o.delivery_location,
    status: o.status,
    date: (o.created_at || "").slice(0, 10),
  };
}

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "catalog", label: "Catalog", icon: ShoppingBasket },
  { key: "history", label: "Order history", icon: History },
  { key: "profile", label: "Profile", icon: User },
];

export default function BuyerRoom() {
  const { session, refreshSession } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [catalogItems, setCatalogItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  // Shopping flow: catalog -> cart -> checkout -> payment -> confirmation
  const [view, setView] = useState("catalog");
  const [checkoutDetails, setCheckoutDetails] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);
  const [placingOrder, setPlacingOrder] = useState(false);

  const commitment = mapCommitment(user);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ prices }, { orders: myOrders }] = await Promise.all([
        apiFetch("/orders/catalog"),
        apiFetch("/orders/me"),
      ]);
      setCatalogItems(mergeCatalog(prices));
      setOrders(myOrders.map(mapOrder));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function handleAddToCart(line) {
    setCart((prev) => [...prev, line]);
    setActiveItem(null);
  }

  function handleUpdateQuantity(index, quantity) {
    setCart((prev) =>
      prev.map((line, i) =>
        i === index
          ? { ...line, quantity, lineTotal: (line.lineTotal / line.quantity) * quantity }
          : line
      )
    );
  }

  function handleRemoveFromCart(index) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function handleCheckoutContinue(details) {
    setCheckoutDetails(details);
    setView("payment");
  }

  async function handlePlaceOrder() {
    if (!checkoutDetails) return;
    setPlacingOrder(true);
    try {
      const { order } = await apiFetch("/orders", {
        method: "POST",
        body: {
          items: cart.map(({ crop, quantity, size }) => ({ crop, quantity, size })),
          deliveryLocation: checkoutDetails.deliveryLocation,
          contactPhone1: checkoutDetails.contactPhone1,
          contactPhone2: checkoutDetails.contactPhone2,
          contactEmail: checkoutDetails.contactEmail,
          paidVia: checkoutDetails.paidVia,
        },
      });
      setCart([]);
      setCheckoutDetails(null);
      setLastOrder(mapOrder(order));
      setView("confirmation");
      await Promise.all([loadAll(), refreshSession()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleCommit({ totalCommitted, durationYears }) {
    try {
      await apiFetch("/orders/commitment", {
        method: "POST",
        body: { amount: totalCommitted, years: durationYears },
      });
      await refreshSession();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveProfile(fields) {
    try {
      await apiFetch("/buyers/me", { method: "PUT", body: fields });
      await refreshSession();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!user) return null;

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab}>
      {error && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-canopy-100">Loading…</p>
      ) : (
        <>
          {tab === "dashboard" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-medium text-white">Welcome, {user.name}</h1>
              </div>
              <StandingCommitmentCard commitment={commitment} onCommit={handleCommit} />
              <StandardPriceList prices={catalogItems} />
            </div>
          )}

          {tab === "catalog" && (
            <div className="space-y-6">
              {view === "catalog" && (
                <>
                  <ProductCatalog items={catalogItems} onSelect={setActiveItem} />
                  <CartBar cart={cart} onReview={() => setView("cart")} />
                </>
              )}

              {view === "cart" && (
                <CartReview
                  cart={cart}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemove={handleRemoveFromCart}
                  onCheckout={() => setView("checkout")}
                  onBack={() => setView("catalog")}
                />
              )}

              {view === "checkout" && (
                <CheckoutForm
                  cart={cart}
                  commitment={commitment}
                  defaultAddress={user.buyerType === "organization" ? user.registeredAddress : user.address}
                  defaultEmail={user.email}
                  onBack={() => setView("cart")}
                  onContinue={handleCheckoutContinue}
                />
              )}

              {view === "payment" && checkoutDetails && (
                <PaymentPlaceholder
                  total={cart.reduce((sum, line) => sum + line.lineTotal, 0)}
                  submitting={placingOrder}
                  onConfirm={handlePlaceOrder}
                  onBack={() => setView("checkout")}
                />
              )}

              {view === "confirmation" && lastOrder && (
                <OrderConfirmation order={lastOrder} onContinue={() => setView("catalog")} />
              )}

              {activeItem && (
                <ProductDetailPanel
                  item={activeItem}
                  onSave={handleAddToCart}
                  onClose={() => setActiveItem(null)}
                />
              )}
            </div>
          )}

          {tab === "history" && <OrderHistory orders={orders} />}

          {tab === "profile" && <BuyerProfileCard user={user} onSave={handleSaveProfile} />}
        </>
      )}
    </DashboardShell>
  );
}

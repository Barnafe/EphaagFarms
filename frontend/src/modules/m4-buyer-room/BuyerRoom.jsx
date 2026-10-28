import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, ShoppingBasket, History, User } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import BuyerProfileCard from "./BuyerProfileCard.jsx";
import StandingCommitmentCard from "./StandingCommitmentCard.jsx";
import ProductCatalog from "./ProductCatalog.jsx";
import ProductDetailPanel from "./ProductDetailPanel.jsx";
import CartBar from "./CartBar.jsx";
import CartReview from "./CartReview.jsx";
import CheckoutForm from "./CheckoutForm.jsx";
import PaymentStep from "./PaymentStep.jsx";
import OrderConfirmation from "./OrderConfirmation.jsx";
import DuplicateOrderNotice from "./DuplicateOrderNotice.jsx";
import OrderHistory from "./OrderHistory.jsx";
import { mergeCatalog } from "./catalogMeta.js";

import useUrlState from "../../hooks/useUrlState.js";
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
    expiresAt: o.expires_at || null,
    canPay: !!o.can_pay,
    canCancel: !!o.can_cancel,
    hasReceipt: !!o.has_receipt,
    waitingForTransfer: !!o.waiting_for_transfer,
  };
}

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "catalog", label: "Shop Item", icon: ShoppingBasket },
  { key: "history", label: "Order history", icon: History },
  { key: "profile", label: "Profile", icon: User },
];

export default function BuyerRoom() {
  const { session, refreshSession } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useUrlState("tab", "dashboard");
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
  const [duplicate, setDuplicate] = useState(null);
  const [notice, setNotice] = useState(null);

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

  async function handlePlaceOrder(confirmDuplicate = false) {
    if (!checkoutDetails) return;
    setPlacingOrder(true);
    setDuplicate(null);
    try {
      const { order, payment } = await apiFetch("/orders", {
        method: "POST",
        body: {
          items: cart.map(({ crop, quantity, size }) => ({ crop, quantity, size })),
          deliveryLocation: checkoutDetails.deliveryLocation,
          contactPhone1: checkoutDetails.contactPhone1,
          contactPhone2: checkoutDetails.contactPhone2,
          contactEmail: checkoutDetails.contactEmail,
          paidVia: checkoutDetails.paidVia,
          ...(confirmDuplicate === true ? { confirmDuplicate: true } : {}),
        },
      });
      setCart([]);
      setCheckoutDetails(null);
      if (payment?.authorizationUrl) {
        // Off to Paystack's secure page. The order is saved as "awaiting payment" and
        // only becomes confirmed once Paystack tells us the money arrived.
        window.location.href = payment.authorizationUrl;
        return;
      }
      setLastOrder(mapOrder(order));
      setView("confirmation");
      await Promise.all([loadAll(), refreshSession()]);
    } catch (err) {
      if (err.code === "DUPLICATE_ORDER") {
        // Same items, same amount: show it on screen and let the buyer decide.
        setDuplicate({ kind: err.kind, ...err.duplicate });
      } else {
        setError(err.message);
      }
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handlePayOrder(id) {
    try {
      const r = await apiFetch(`/orders/${id}/pay`, { method: "POST" });
      if (r.alreadyPaid) { setNotice(r.message || "This order has already been paid."); await loadAll(); return; }
      if (r.payment?.authorizationUrl) { window.location.href = r.payment.authorizationUrl; return; }
      await loadAll();
    } catch (err) { setError(err.message); }
  }

  async function handleCancelOrder(id) {
    try { await apiFetch(`/orders/${id}/cancel`, { method: "POST" }); await loadAll(); }
    catch (err) { setError(err.message); await loadAll(); }
  }

  async function handleReceipt(id) {
    try { return (await apiFetch(`/orders/${id}/receipt`)).receipt; }
    catch (err) { setError(err.message); return null; }
  }

  async function handleCommit({ totalCommitted, durationYears }) {
    try {
      // Nothing is credited here: Paystack takes the payment first, and the balance
      // is added only after it is verified.
      const { payment } = await apiFetch("/orders/commitment", {
        method: "POST",
        body: { amount: totalCommitted, years: durationYears },
      });
      if (payment?.authorizationUrl) { window.location.href = payment.authorizationUrl; return; }
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

      {notice && (
        <div className="card mb-6 border-canopy-200 bg-canopy-50">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-canopy-800">{notice}</p>
            <button type="button" className="text-xs text-canopy-800 underline" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
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
                <PaymentStep
                  total={cart.reduce((sum, line) => sum + line.lineTotal, 0)}
                  paidVia={checkoutDetails.paidVia}
                  submitting={placingOrder}
                  onConfirm={() => handlePlaceOrder()}
                  onBack={() => { setDuplicate(null); setView("checkout"); }}
                />
              )}

              {view === "payment" && duplicate && (
                <DuplicateOrderNotice
                  duplicate={duplicate}
                  kind={duplicate.kind}
                  busy={placingOrder}
                  onCancel={() => { setDuplicate(null); setView("catalog"); }}
                  onPayExisting={async () => { const id = duplicate.id; setDuplicate(null); await handlePayOrder(id); }}
                  onProceed={() => handlePlaceOrder(true)}
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

          {tab === "history" && <OrderHistory orders={orders} onPay={handlePayOrder} onCancel={handleCancelOrder} onReceipt={handleReceipt} />}

          {tab === "profile" && <BuyerProfileCard user={user} onSave={handleSaveProfile} />}
        </>
      )}
    </DashboardShell>
  );
}

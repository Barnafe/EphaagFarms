import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { lazy, Suspense } from "react";

const Home = lazy(() => import("./pages/public/Home.jsx"));
const ProductsServices = lazy(() => import("./pages/public/ProductsServices.jsx"));
const ResearchEducation = lazy(() => import("./pages/public/ResearchEducation.jsx"));
const About = lazy(() => import("./pages/public/About.jsx"));
const Contact = lazy(() => import("./pages/public/Contact.jsx"));
const InvestmentRoom = lazy(() => import("./pages/public/services/investment/InvestmentRoom.jsx"));
const MonthlyPlan = lazy(() => import("./pages/public/services/investment/MonthlyPlan.jsx"));
const BulkPlan = lazy(() => import("./pages/public/services/investment/BulkPlan.jsx"));
const TermsConditions = lazy(() => import("./pages/public/services/investment/TermsConditions.jsx"));
const FarmProductionRoom = lazy(() => import("./pages/public/services/farm-production/FarmProductionRoom.jsx"));
const LivestockRoom = lazy(() => import("./pages/public/services/farm-production/livestock/LivestockRoom.jsx"));
const Poultry = lazy(() => import("./pages/public/services/farm-production/livestock/Poultry.jsx"));
const FishAquaculture = lazy(() => import("./pages/public/services/farm-production/livestock/FishAquaculture.jsx"));
const Cattle = lazy(() => import("./pages/public/services/farm-production/livestock/Cattle.jsx"));
const GoatSheep = lazy(() => import("./pages/public/services/farm-production/livestock/GoatSheep.jsx"));
const CropProductionRoom = lazy(() => import("./pages/public/services/farm-production/crops/CropProductionRoom.jsx"));
const Grains = lazy(() => import("./pages/public/services/farm-production/crops/Grains.jsx"));
const Tubers = lazy(() => import("./pages/public/services/farm-production/crops/Tubers.jsx"));
const Vegetables = lazy(() => import("./pages/public/services/farm-production/crops/Vegetables.jsx"));
const FruitsCashCrops = lazy(() => import("./pages/public/services/farm-production/crops/FruitsCashCrops.jsx"));
const ProduceSourcingRoom = lazy(() => import("./pages/public/services/produce-sourcing/ProduceSourcingRoom.jsx"));
const FarmerFinancingRoom = lazy(() => import("./pages/public/services/farmer-financing/FarmerFinancingRoom.jsx"));
const LogisticsRoom = lazy(() => import("./pages/public/services/logistics/LogisticsRoom.jsx"));
const Seminal = lazy(() => import("./pages/public/services/seminal/Seminal.jsx"));
const LoginAdmin = lazy(() => import("./pages/auth/LoginAdmin.jsx"));
const LoginMember = lazy(() => import("./pages/auth/LoginMember.jsx"));
const Register = lazy(() => import("./pages/auth/Register.jsx"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword.jsx"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword.jsx"));
const FarmerDashboard = lazy(() => import("./pages/dashboards/FarmerDashboard.jsx"));
const BuyerDashboard = lazy(() => import("./pages/dashboards/BuyerDashboard.jsx"));
const ProcessorDashboard = lazy(() => import("./pages/dashboards/ProcessorDashboard.jsx"));
const TransporterDashboard = lazy(() => import("./pages/dashboards/TransporterDashboard.jsx"));
const DistributorDashboard = lazy(() => import("./pages/dashboards/DistributorDashboard.jsx"));
const InvestorDashboard = lazy(() => import("./pages/dashboards/InvestorDashboard.jsx"));
const AdminHub = lazy(() => import("./modules/admin-hub/AdminHub.jsx"));
const AdminProfilePage = lazy(() => import("./modules/admin-hub/AdminProfilePage.jsx"));
const AdminFeedbackPage = lazy(() => import("./modules/admin-hub/AdminFeedbackPage.jsx"));
const AdminContactMessagesPage = lazy(() => import("./modules/admin-hub/AdminContactMessagesPage.jsx"));
const AddCatalogPage = lazy(() => import("./modules/admin-hub/AddCatalogPage.jsx"));
const AddPricePage = lazy(() => import("./modules/admin-hub/AddPricePage.jsx"));
const LoginAsPage = lazy(() => import("./modules/admin-hub/LoginAsPage.jsx"));
const ProcurementDepartment = lazy(() => import("./modules/m5-procurement-department/ProcurementDepartment.jsx"));
const BuyersDirectory = lazy(() => import("./modules/admin-buyers/BuyersDirectory.jsx"));
const TransportDepartment = lazy(() => import("./modules/admin-transport-department/TransportDepartment.jsx"));
const MaintenanceDepartment = lazy(() => import("./modules/admin-maintenance-department/MaintenanceDepartment.jsx"));
const FinanceDepartment = lazy(() => import("./modules/admin-finance-department/FinanceDepartment.jsx"));
const StoreDepartment = lazy(() => import("./modules/admin-store-department/StoreDepartment.jsx"));
const ProductionDepartment = lazy(() => import("./modules/admin-production-department/ProductionDepartment.jsx"));
const SeminalDepartment = lazy(() => import("./modules/admin-seminal-department/SeminalDepartment.jsx"));
const AnalyticsDepartment = lazy(() => import("./modules/admin-analytics/AnalyticsDepartment.jsx"));
const RequestsApp = lazy(() => import("./modules/admin-requests/RequestsApp.jsx"));
const PositionsPage = lazy(() => import("./modules/admin-positions/PositionsPage.jsx"));

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center text-sm text-ink-600">Loading…</div>}>
        <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products-services" element={<ProductsServices />} />
        <Route path="/research-education" element={<ResearchEducation />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />

        <Route path="/services/investment" element={<InvestmentRoom />} />
        <Route path="/services/investment/monthly" element={<MonthlyPlan />} />
        <Route path="/services/investment/bulk" element={<BulkPlan />} />
        <Route path="/services/investment/terms" element={<TermsConditions />} />

        <Route path="/services/farm-production" element={<FarmProductionRoom />} />
        <Route path="/services/farm-production/livestock" element={<LivestockRoom />} />
        <Route path="/services/farm-production/livestock/poultry" element={<Poultry />} />
        <Route path="/services/farm-production/livestock/fish-aquaculture" element={<FishAquaculture />} />
        <Route path="/services/farm-production/livestock/cattle" element={<Cattle />} />
        <Route path="/services/farm-production/livestock/goat-sheep" element={<GoatSheep />} />
        <Route path="/services/farm-production/crops" element={<CropProductionRoom />} />
        <Route path="/services/farm-production/crops/grains" element={<Grains />} />
        <Route path="/services/farm-production/crops/tubers" element={<Tubers />} />
        <Route path="/services/farm-production/crops/vegetables" element={<Vegetables />} />
        <Route path="/services/farm-production/crops/fruits-cash-crops" element={<FruitsCashCrops />} />

        <Route path="/services/produce-sourcing" element={<ProduceSourcingRoom />} />
        <Route path="/services/farmer-financing" element={<FarmerFinancingRoom />} />
        <Route path="/services/logistics" element={<LogisticsRoom />} />

        <Route path="/services/seminal" element={<Seminal />} />

        <Route path="/login/admin" element={<LoginAdmin />} />
        <Route path="/login/member" element={<LoginMember />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/dashboard/farmer"
          element={
            <ProtectedRoute allow={["farmer"]}>
              <FarmerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/buyer"
          element={
            <ProtectedRoute allow={["buyer"]}>
              <BuyerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/processor"
          element={
            <ProtectedRoute allow={["processor"]}>
              <ProcessorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/transporter"
          element={
            <ProtectedRoute allow={["transporter"]}>
              <TransporterDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/distributor"
          element={
            <ProtectedRoute allow={["distributor"]}>
              <DistributorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/investor"
          element={
            <ProtectedRoute allow={["investor"]}>
              <InvestorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allow={["admin"]}>
              <AdminHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/profile"
          element={
            <ProtectedRoute allow={["admin"]}>
              <AdminProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/feedback"
          element={
            <ProtectedRoute allow={["admin"]}>
              <AdminFeedbackPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/contact-messages"
          element={
            <ProtectedRoute allow={["admin"]}>
              <AdminContactMessagesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/add-catalog"
          element={
            <ProtectedRoute allow={["admin"]}>
              <AddCatalogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/add-price"
          element={
            <ProtectedRoute allow={["admin"]}>
              <AddPricePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/login-as"
          element={
            <ProtectedRoute allow={["admin"]}>
              <LoginAsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute allow={["admin"]}>
              <AnalyticsDepartment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/requests"
          element={
            <ProtectedRoute allow={["admin"]}>
              <RequestsApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/positions"
          element={
            <ProtectedRoute allow={["admin"]}>
              <PositionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/production"
          element={
            <ProtectedRoute allow={["admin"]}>
              <ProductionDepartment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/procurement"
          element={
            <ProtectedRoute allow={["admin"]}>
              <ProcurementDepartment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/buyers"
          element={
            <ProtectedRoute allow={["admin"]}>
              <BuyersDirectory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/transport"
          element={
            <ProtectedRoute allow={["admin"]}>
              <TransportDepartment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/store"
          element={
            <ProtectedRoute allow={["admin"]}>
              <StoreDepartment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/finance"
          element={
            <ProtectedRoute allow={["admin"]}>
              <FinanceDepartment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/seminal"
          element={
            <ProtectedRoute allow={["admin"]}>
              <SeminalDepartment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/maintenance"
          element={
            <ProtectedRoute allow={["admin"]}>
              <MaintenanceDepartment />
            </ProtectedRoute>
          }
        />
        </Routes>
      </Suspense>
    </Layout>
  );
}

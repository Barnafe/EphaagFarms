import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as m from "../controllers/maintenanceController.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/dashboard", m.dashboardSummary);

// Assets & Equipment
router.get("/assets", m.listAssets);
router.post("/assets", m.createAsset);
router.patch("/assets/:id", m.updateAsset);
router.post("/assets/:id/log-service", m.logAssetService);

// Technicians
router.get("/technicians", m.listTechnicians);
router.post("/technicians", m.createTechnician);
router.patch("/technicians/:id", m.updateTechnician);
router.get("/technicians/workload", m.technicianWorkload);

// Contractors
router.get("/contractors", m.listContractors);
router.post("/contractors", m.createContractor);
router.patch("/contractors/:id", m.updateContractor);

// Spare Parts & Inventory
router.get("/parts", m.listParts);
router.post("/parts", m.createPart);
router.patch("/parts/:id", m.updatePart);
router.post("/parts/:id/adjust", m.adjustPartStock);
router.get("/parts/movements", m.partMovementHistory);

// Maintenance Requests
router.get("/requests", m.listRequests);
router.post("/requests", m.createRequest);
router.post("/requests/:id/review", m.reviewRequest);
router.post("/requests/:id/convert", m.convertRequestToWorkOrder);

// Work Orders
router.get("/work-orders", m.listWorkOrders);
router.post("/work-orders", m.createWorkOrder);
router.post("/work-orders/:id/assign", m.assignWorkOrder);
router.post("/work-orders/:id/diagnosis", m.recordDiagnosis);
router.patch("/work-orders/:id/status", m.updateWorkOrderStatus);
router.post("/work-orders/:id/parts", m.addWorkOrderPart);
router.post("/work-orders/:id/inspections", m.addInspection);
router.post("/work-orders/:id/complete", m.completeWorkOrder);

// Expenses
router.get("/expenses", m.listExpenses);
router.post("/expenses", m.createExpense);

// Inspections (standalone, routine/safety checks)
router.get("/inspections", m.listInspections);
router.post("/inspections", m.createStandaloneInspection);

// Maintenance History & Reports
router.get("/history", m.maintenanceHistory);
router.get("/reports", m.reports);

// Preventive Maintenance
router.get("/schedules", m.listSchedules);
router.post("/schedules", m.createSchedule);
router.patch("/schedules/:id", m.updateSchedule);
router.post("/schedules/reminder-check", m.runReminderCheck);
router.post("/schedules/:id/generate-work-order", m.generateWorkOrderFromSchedule);

export default router;

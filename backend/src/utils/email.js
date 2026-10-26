// Kept as the single import path every controller already uses. All email now
// goes through the database-backed queue in services/messaging.js.
export { sendMail } from "../services/messaging.js";

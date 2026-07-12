import { Router } from "express";
import { customerAuthRateLimiter } from "../../../middleware/rate-limit";
import { createAddressHandler, deleteAddressHandler, listAddressesHandler, updateAddressHandler } from "./addresses.controller";
import {
  changePasswordHandler,
  confirmPasswordResetHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  requestPasswordResetHandler,
} from "./customers.controller";
import { createFavoriteHandler, deleteFavoriteHandler, listFavoritesHandler } from "./favorites.controller";
import { listCustomerOrdersHandler } from "./order-history.controller";
import { createPaymentMethodHandler, deletePaymentMethodHandler, listPaymentMethodsHandler } from "./payment-methods.controller";
import { requireCustomerAuth } from "./require-customer-auth";

const authRouter = Router();
authRouter.post("/register", customerAuthRateLimiter, registerHandler);
authRouter.post("/login", customerAuthRateLimiter, loginHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireCustomerAuth, meHandler);
// Sprint 07.7 H-6 — rate-limited like register/login to prevent email-bombing via repeated reset requests.
authRouter.post("/password-reset/request", customerAuthRateLimiter, requestPasswordResetHandler);
authRouter.post("/password-reset/confirm", customerAuthRateLimiter, confirmPasswordResetHandler);
authRouter.post("/change-password", requireCustomerAuth, changePasswordHandler);

const addressesRouter = Router();
addressesRouter.get("/", requireCustomerAuth, listAddressesHandler);
addressesRouter.post("/", requireCustomerAuth, createAddressHandler);
addressesRouter.patch("/:id", requireCustomerAuth, updateAddressHandler);
addressesRouter.delete("/:id", requireCustomerAuth, deleteAddressHandler);

const favoritesRouter = Router();
favoritesRouter.get("/", requireCustomerAuth, listFavoritesHandler);
favoritesRouter.post("/", requireCustomerAuth, createFavoriteHandler);
favoritesRouter.delete("/:id", requireCustomerAuth, deleteFavoriteHandler);

const paymentMethodsRouter = Router();
paymentMethodsRouter.get("/", requireCustomerAuth, listPaymentMethodsHandler);
paymentMethodsRouter.post("/", requireCustomerAuth, createPaymentMethodHandler);
paymentMethodsRouter.delete("/:id", requireCustomerAuth, deletePaymentMethodHandler);

const ordersRouter = Router();
ordersRouter.get("/", requireCustomerAuth, listCustomerOrdersHandler);

// Mounted at "/api/customer" myself.
export const customerRouter = Router();
customerRouter.use("/auth", authRouter);
customerRouter.use("/addresses", addressesRouter);
customerRouter.use("/favorites", favoritesRouter);
customerRouter.use("/payment-methods", paymentMethodsRouter);
customerRouter.use("/orders", ordersRouter);

import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "How refunds work for orders and for OrderVora subscriptions.",
};

const EFFECTIVE_DATE = "July 24, 2026";

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund Policy"
      effectiveDate={EFFECTIVE_DATE}
      current="refund"
      intro={[
        "This Refund Policy explains how refunds work for orders placed through OrderVora-powered storefronts and for OrderVora Merchant subscriptions. Because a Merchant — not OrderVora — is the seller of the food and goods in an order, refund decisions for orders rest with the Merchant.",
      ]}
      sections={[
        {
          heading: "Order refunds",
          body: [
            "The restaurant or business you ordered from is responsible for its orders and for any refund. If something is wrong with your order — it's incorrect, missing items, or was not delivered — contact the Merchant directly using the phone or contact details shown on your order confirmation. The Merchant can issue a full or partial refund to your original payment method.",
            "Refund eligibility and timing (for example, whether an order can be refunded once preparation has started) are set by each Merchant. OrderVora provides the tools that let a Merchant issue refunds but does not decide them.",
          ],
        },
        {
          heading: "How refunds are processed",
          body: [
            "Approved refunds are returned to your original payment method through the payment processor that handled the charge. It can take several business days for a refund to appear, depending on your bank or card issuer.",
          ],
        },
        {
          heading: "Merchant subscriptions",
          body: [
            "OrderVora subscription fees paid by a Merchant are billed in advance. Except where required by law or expressly stated in your plan or a separate signed agreement, subscription fees are non-refundable, including for partial billing periods. You can cancel a subscription to stop future charges.",
          ],
        },
        {
          heading: "Contact",
          body: [
            "For order refunds, contact the Merchant shown on your order. For questions about OrderVora subscriptions or this policy, contact [Contact Email].",
          ],
        },
      ]}
    />
  );
}

import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of OrderVora.",
};

const EFFECTIVE_DATE = "July 24, 2026";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      effectiveDate={EFFECTIVE_DATE}
      current="terms"
      intro={[
        "These Terms of Service (the \"Terms\") are a legal agreement between you and [Company Legal Name] (\"OrderVora\", \"we\", \"us\") governing your access to and use of the OrderVora platform, websites, and related services (the \"Service\"). By creating an account, placing an order through a storefront powered by OrderVora, or otherwise using the Service, you agree to these Terms.",
      ]}
      sections={[
        {
          heading: "The Service",
          body: [
            "OrderVora provides software that lets restaurants and other businesses (each a \"Merchant\") build an online storefront, manage a menu, and accept orders. For orders placed by a diner, the Merchant — not OrderVora — is the seller of the food and goods and is responsible for preparing, fulfilling, and standing behind those orders.",
            "OrderVora is a technology provider. We are not a party to the transaction between a diner and a Merchant, and we do not prepare food or handle it.",
          ],
        },
        {
          heading: "Accounts and eligibility",
          body: [
            "You must provide accurate information when creating an account and keep it up to date. You are responsible for safeguarding your credentials and for all activity under your account. You must be able to form a binding contract to use the Service.",
          ],
        },
        {
          heading: "Orders and payments",
          body: [
            "Payments are processed by third-party payment processors (for example, Stripe). By placing an order or connecting a payment method you also agree to the applicable processor's terms. OrderVora does not store full card numbers.",
            "Prices, taxes, availability, and fulfillment times are set by the Merchant and may change. A Merchant may decline or cancel an order.",
          ],
        },
        {
          heading: "Merchant subscriptions",
          body: [
            "If you are a Merchant, your use of paid features is subject to the plan and fees presented at sign-up or in your account. Fees are billed in advance and, except as stated in the Refund Policy or required by law, are non-refundable.",
          ],
        },
        {
          heading: "Acceptable use",
          body: [
            "You agree not to misuse the Service, including by attempting to access data that is not yours, disrupting the Service, uploading unlawful content, or using the Service to sell goods you are not legally permitted to sell.",
          ],
        },
        {
          heading: "Intellectual property",
          body: [
            "OrderVora and its licensors own the Service and its software. Merchants retain ownership of the content they upload (such as menus and images) and grant OrderVora a license to host and display that content to operate the Service.",
          ],
        },
        {
          heading: "Disclaimers and limitation of liability",
          body: [
            "The Service is provided \"as is\" without warranties of any kind to the maximum extent permitted by law. To the maximum extent permitted by law, OrderVora is not liable for indirect, incidental, or consequential damages, and our total liability is limited as set out here or in a separate signed agreement. Nothing in these Terms limits liability that cannot be limited by law.",
          ],
        },
        {
          heading: "Termination",
          body: [
            "You may stop using the Service at any time. We may suspend or terminate access if you breach these Terms or to protect the Service or its users.",
          ],
        },
        {
          heading: "Changes to these Terms",
          body: [
            "We may update these Terms. If we make material changes we will take reasonable steps to notify you. Continued use of the Service after changes take effect means you accept the updated Terms.",
          ],
        },
        {
          heading: "Governing law and contact",
          body: [
            "These Terms are governed by the laws of [Governing-Law State], without regard to its conflict-of-laws rules.",
            "Questions about these Terms can be sent to [Contact Email].",
          ],
        },
      ]}
    />
  );
}

import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How OrderVora collects, uses, and protects your information.",
};

const EFFECTIVE_DATE = "July 24, 2026";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effectiveDate={EFFECTIVE_DATE}
      current="privacy"
      intro={[
        "This Privacy Policy explains how [Company Legal Name] (\"OrderVora\", \"we\") collects, uses, and shares information when you use the OrderVora platform and the storefronts it powers. It applies to both Merchants who use OrderVora to run their business and diners who place orders through an OrderVora-powered storefront.",
      ]}
      sections={[
        {
          heading: "Information we collect",
          body: [
            "Account information: name, email, phone number, and password (stored only in hashed form) for Merchants and registered diners.",
            "Order information: the items, amounts, fulfillment type, delivery address (for delivery orders), and order history needed to process and track an order.",
            "Device and usage information: basic technical data such as IP address, browser type, and pages viewed, collected to operate and secure the Service.",
            "We do not store full payment card numbers; card details are handled by our payment processors.",
          ],
        },
        {
          heading: "How we use information",
          body: [
            "To provide the Service — creating storefronts, processing and routing orders, sending order and account notifications by email and SMS, and providing support.",
            "To secure the Service, prevent fraud and abuse, and comply with legal obligations.",
            "To improve the Service through aggregated, non-identifying analytics.",
          ],
        },
        {
          heading: "How we share information",
          body: [
            "With the Merchant whose storefront you order from, so they can fulfill your order.",
            "With service providers that operate parts of the Service on our behalf — for example payment processors (such as Stripe), and email and SMS providers (such as Twilio) — who may process information only to provide their service to us.",
            "When required by law, or to protect the rights, safety, and security of OrderVora, our users, or the public. We do not sell personal information.",
          ],
        },
        {
          heading: "Cookies",
          body: [
            "We use cookies and similar technologies that are necessary to keep you signed in and to operate the Service securely.",
          ],
        },
        {
          heading: "Data retention and security",
          body: [
            "We keep information for as long as needed to provide the Service and to meet legal, accounting, or reporting requirements. We use reasonable technical and organizational measures to protect information, though no method of transmission or storage is completely secure.",
          ],
        },
        {
          heading: "Your rights",
          body: [
            "Depending on where you live, you may have rights to access, correct, or delete your personal information, or to object to certain processing. California residents may have rights under the CCPA/CPRA. To exercise a right, contact us at [Contact Email]; we may need to verify your identity first.",
          ],
        },
        {
          heading: "Children",
          body: [
            "The Service is not directed to children under 13, and we do not knowingly collect personal information from them.",
          ],
        },
        {
          heading: "Changes and contact",
          body: [
            "We may update this Policy and will update the \"Last updated\" date above; material changes will be communicated by reasonable means.",
            "Questions or privacy requests can be sent to [Contact Email].",
          ],
        },
      ]}
    />
  );
}

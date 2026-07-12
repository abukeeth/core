import Link from "next/link";

const industries = [
  ["Restaurant", "Menu · Orders · Kitchen"],
  ["Coffee Shop", "Pickup · Loyalty · Drinks"],
  ["Deli", "Fast checkout · Catering"],
  ["Vape Shop", "Age gate · Brands · Flavors"],
  ["Convenience", "Categories · Inventory"],
  ["Bakery", "Preorders · Seasonal drops"],
] as const;

const aiModules = [
  ["AI Website Studio", "Themes, live preview, sections, publish"],
  ["Brand Builder", "Name, logo direction, colors, fonts"],
  ["Menu AI", "Import, structure, rewrite, optimize"],
  ["Image Studio", "Product imagery, banners, cleanup"],
  ["Marketing AI", "Offers, campaigns, copy, SEO"],
  ["Business Insights", "Forecasts, opportunities, next actions"],
] as const;

const metrics = [
  ["New orders", "8"],
  ["Preparing", "5"],
  ["Ready", "3"],
  ["At risk", "1"],
] as const;

function PrimaryButton({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="inline-flex min-h-13 items-center justify-center rounded-2xl bg-[#171512] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-black/10 transition hover:-translate-y-0.5">
      {children}
    </Link>
  );
}

function SectionLabel({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <p className={`text-xs font-bold uppercase tracking-[0.16em] ${light ? "text-[#E1B56F]" : "text-[#A9681F]"}`}>{children}</p>;
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F7F0E5] text-[#171512]">
      <header className="sticky top-0 z-50 border-b border-[#E7DDCF]/80 bg-[#F7F0E5]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-2xl border border-[#E7DDCF] bg-white/80 px-4 py-3 shadow-sm">
          <Link href="/" className="text-xl font-bold tracking-tight text-[#B97824]">OrderVora</Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-[#756B5D] md:flex">
            <a href="#how">Product</a>
            <a href="#studio">AI Studio</a>
            <a href="#industries">Industries</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-bold text-[#171512]">Log in</Link>
            <Link href="/register" className="rounded-xl bg-[#171512] px-4 py-2.5 text-sm font-bold text-white">Start free</Link>
          </div>
        </div>
      </header>

      <section className="px-4 pb-20 pt-10 sm:px-6 lg:px-10 lg:pb-28 lg:pt-16">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <SectionLabel>Business Operating System</SectionLabel>
            <h1 className="mt-5 max-w-3xl text-5xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl">Own your customers. Run your business. Keep every dollar.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#756B5D]">Turn a menu photo, website, or POS into a branded ordering website—then manage orders, kitchen, customers, marketing, and growth from one calm system.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryButton href="/register">Build my business</PrimaryButton>
              <a href="#how" className="inline-flex min-h-13 items-center justify-center rounded-2xl border border-[#E7DDCF] bg-white px-6 py-3 text-sm font-bold text-[#171512]">Watch how it works</a>
            </div>
          </div>

          <div className="relative">
            <img
              src="https://images.squarespace-cdn.com/content/v1/67a2417cd8e77b2184ad206a/eb5963bd-4bee-4c6c-bff9-070b5115ad37/chefs-group-smiling.png"
              alt="Restaurant team"
              className="h-[420px] w-full rounded-[32px] object-cover shadow-2xl shadow-black/10 sm:h-[520px]"
            />
            <div className="absolute -bottom-8 left-5 right-5 rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-2xl sm:left-[-40px] sm:right-auto sm:w-[360px]">
              <div className="flex items-center justify-between"><strong>AI Business Studio</strong><span className="text-sm font-bold text-[#B97824]">80%</span></div>
              <p className="mt-3 text-sm font-semibold text-emerald-700">Menu imported</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#EEE5D9]"><div className="h-full w-4/5 rounded-full bg-[#B97824]" /></div>
              <p className="mt-3 text-sm font-semibold text-[#A9681F]">Website building…</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
            <div><SectionLabel>From menu to business in minutes</SectionLabel><h2 className="mt-4 text-4xl font-bold tracking-[-0.03em] sm:text-5xl">One simple start. A complete operating system.</h2></div>
            <p className="text-lg leading-8 text-[#756B5D]">Upload what you already have. OrderVora turns it into structure, brand, storefront, and operations.</p>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {[
              ["01", "Import", "Photo, PDF, spreadsheet, website, Google Maps, POS."],
              ["02", "Build", "AI creates menu structure, website, copy, and brand direction."],
              ["03", "Launch", "Publish your store, QR, ordering flow, and live operations."],
            ].map(([number, title, description]) => (
              <article key={title} className="rounded-3xl border border-[#E7DDCF] bg-white p-6 shadow-[0_12px_36px_rgba(48,39,27,0.04)]">
                <span className="text-sm font-bold text-[#B97824]">{number}</span>
                <h3 className="mt-5 text-2xl font-bold">{title}</h3>
                <p className="mt-3 leading-7 text-[#756B5D]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="industries" className="px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionLabel>One engine. Many businesses.</SectionLabel>
          <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:items-end">
            <h2 className="text-4xl font-bold tracking-[-0.03em] sm:text-5xl">Start with restaurants. Expand everywhere.</h2>
            <p className="text-lg leading-8 text-[#756B5D]">Templates change the experience—not the core system. One platform can serve food, retail, and local commerce.</p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {industries.map(([name, meta], index) => (
              <article key={name} className={`rounded-3xl border p-5 sm:p-6 ${index === 0 ? "border-[#171512] bg-[#171512] text-white" : "border-[#E7DDCF] bg-white"}`}>
                <h3 className="text-lg font-bold sm:text-2xl">{name}</h3>
                <p className={`mt-3 text-sm ${index === 0 ? "text-white/65" : "text-[#756B5D]"}`}>{meta}</p>
                <div className={`mt-6 text-xl ${index === 0 ? "text-[#E1B56F]" : "text-[#B97824]"}`}>→</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="studio" className="px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl rounded-[36px] bg-[#171512] p-6 text-white sm:p-10 lg:p-12">
          <SectionLabel light>AI Business Studio</SectionLabel>
          <h2 className="mt-4 text-4xl font-bold tracking-[-0.03em] sm:text-5xl">Build more than a website.</h2>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-white/60">A single AI workspace for creating, launching, and improving your business.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {aiModules.map(([name, description]) => (
              <article key={name} className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
                <h3 className="text-xl font-bold">{name}</h3>
                <p className="mt-3 text-sm leading-6 text-white/55">{description}</p>
                <div className="mt-8 text-sm font-bold text-[#E1B56F]">Open →</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionLabel>Not a dashboard. A daily operating system.</SectionLabel>
          <h2 className="mt-4 max-w-3xl text-4xl font-bold tracking-[-0.03em] sm:text-5xl">Every order. Every customer. Every next move.</h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
            <img src="https://images.squarespace-cdn.com/content/v1/67a2417cd8e77b2184ad206a/eb5963bd-4bee-4c6c-bff9-070b5115ad37/chefs-group-smiling.png" alt="Restaurant operations" className="h-full min-h-[360px] w-full rounded-[32px] object-cover" />
            <div className="rounded-[32px] border border-[#E7DDCF] bg-white p-6 sm:p-8">
              <h3 className="text-2xl font-bold">Live operations</h3>
              <p className="mt-2 text-[#756B5D]">A calm view of what needs attention now.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {metrics.map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-[#FBF7F0] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#756B5D]">{label}</p><strong className={`mt-3 block text-3xl ${label === "At risk" ? "text-red-700" : "text-[#171512]"}`}>{value}</strong></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionLabel>Why owners switch</SectionLabel>
          <h2 className="mt-4 max-w-4xl text-4xl font-bold tracking-[-0.03em] sm:text-5xl">Stop renting your customer relationship.</h2>
          <p className="mt-4 max-w-4xl text-lg leading-8 text-[#756B5D]">Marketplaces can bring discovery. OrderVora helps you turn those customers into your customers—with your brand, your data, and your repeat business.</p>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {[
              ["0%", "Marketplace commission on direct orders"],
              ["1 place", "Orders, menu, website, customers, AI"],
              ["Minutes", "From menu upload to structured business setup"],
            ].map(([value, label]) => (
              <div key={value} className="rounded-3xl border border-[#E7DDCF] bg-white p-6"><strong className="text-4xl text-[#B97824]">{value}</strong><p className="mt-4 font-semibold leading-7">{label}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-10 sm:px-6 lg:px-10 lg:pb-16">
        <div className="mx-auto max-w-7xl rounded-[36px] bg-[#171512] p-6 text-white sm:p-10 lg:p-14">
          <SectionLabel light>Your business. Your customers. Your system.</SectionLabel>
          <h2 className="mt-5 max-w-4xl text-4xl font-bold tracking-[-0.03em] sm:text-6xl">Build your direct business before your next order arrives.</h2>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-white/60">Start with the menu you already have. Launch the business system you should have had all along.</p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link href="/register" className="inline-flex min-h-13 items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-bold text-[#171512]">Start free</Link>
            <span className="text-sm font-semibold text-white/55">No commission on direct orders</span>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E7DDCF] px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><strong className="text-xl text-[#B97824]">OrderVora</strong><span className="text-sm font-semibold text-[#756B5D]">Business Operating System</span></div>
      </footer>
    </main>
  );
}

import Link from "next/link";
export function FeatureCard({ href, title, description, badge, iconBg, iconPath }: { href: string; title: string; description: string; badge: string; iconBg: string; iconPath: string; }) {
  return (
    <Link href={href} className="group block rounded-2xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-lg hover:border-slate-300 transition-all">
      <div className="flex items-start justify-between mb-6">
        <div className={"w-12 h-12 rounded-xl " + iconBg + " flex items-center justify-center text-white"}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{badge}</span>
      </div>
      <h3 className="text-xl font-semibold text-slate-900 group-hover:text-blue-600 transition">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{description}</p>
      <div className="mt-6 text-sm font-medium text-blue-600 flex items-center gap-1">Launch tool <span className="group-hover:translate-x-1 transition">-&gt;</span></div>
    </Link>
  );
}

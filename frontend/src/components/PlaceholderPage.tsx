interface PlaceholderPageProps {
  title: string
}

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <section>
      <h1 className="font-serif text-3xl font-bold text-ink sm:text-4xl">{title}</h1>
      <p className="mt-2 text-ink/60">This page is coming soon.</p>

      <div className="mt-8 rounded-2xl border border-line bg-card p-8 shadow-soft">
        <p className="text-sm text-ink/60">Content for {title} will appear here.</p>
      </div>
    </section>
  )
}
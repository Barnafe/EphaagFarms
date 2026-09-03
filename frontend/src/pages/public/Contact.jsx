export default function Contact() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-medium text-ink-900">Contact</h1>
      <p className="mt-3 text-ink-600">Reach the Ephaag Farms team.</p>

      <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-2">
        <div className="field space-y-4">
          <div>
            <label>Name</label>
            <input type="text" placeholder="Your name" />
          </div>
          <div>
            <label>Message</label>
            <textarea rows={4} placeholder="How can we help?" />
          </div>
          <button className="btn-primary">Send message</button>
        </div>

        <div className="card">
          <p className="text-sm text-ink-600">Our offices</p>
          <p className="mt-2 text-sm text-ink-900">Yelwa Makaranta, Opp. College of Agric, Bauchi State</p>
          <p className="mt-1 text-sm text-ink-900">No. 05, Old Bridge, Bauchi State</p>

          <p className="mt-4 text-sm text-ink-600">Phone</p>
          <p className="mt-1 text-sm text-ink-900">0912 446 0161</p>
          <p className="text-sm text-ink-900">0901 422 5327</p>

          <p className="mt-4 text-sm text-ink-600">Email</p>
          <p className="mt-1 text-sm text-ink-900">ephaagfarms@gmail.com</p>
        </div>
      </div>
    </div>
  );
}

Project: The Kamar-Taj Refectory, college mess management web app.
Stack: React + TypeScript + Tailwind CSS v4 (Vite, @tailwindcss/vite plugin, theme via @theme in src/index.css, no tailwind.config.js). Charts: recharts. QR: qrcode.react. Icons: lucide-react. Routing: react-router-dom.
Roles: student, staff, admin, superadmin.
Booking statuses: BOOKED, LOCKED, REDEEMED, EXPIRED_UNCONSUMED, CANCELLED_BY_STUDENT, ON_LEAVE, CANCELLED_MESS_CLOSED.
Closed meals must show "UNAVAILABLE — MESS CLOSED".
Rules: all data comes through functions in src/api/ (mock now, real API later). No business logic inside components. Mobile-first and responsive. Always give complete files, never partial snippets.

DESIGN (follow the 4 mockup images):
- Light, warm, friendly. Page background cream #FFF7F0. Cards #FFFDFB, rounded-2xl, soft shadow, 1px border #F1E4D8.
- Ink / dark navy #16212F for headings and primary buttons (white text, rounded-xl).
- Hero gradient: orange #FF9A5A -> pink #F2597A -> purple #7B5CE6, large white serif heading.
- Active sidebar item: peach pill #FDE3D6 with orange #F26B3A icon and text.
- Success green #1F7A4D on light green #E3F4EA. Warning/countdown orange #F26B3A. Danger #C0394B on #FBE4E7. Info purple #7B5CE6 on #EEE9FD.
- Stat cards: white card with a pastel rounded-square icon tile (peach, lilac, green, blue), label, big number, small trend chip.
- Headings: Playfair Display (serif). Body: Inter. Brand tagline: "Good Food, Brighter Minds".
- Charts use gradient area fills (orange -> pink -> purple), dashed line for "predicted".
- Sidebar on desktop (cream, logo top, illustrated card at bottom), bottom tab bar on mobile. Top bar: search pill, bell with red dot, avatar dropdown.
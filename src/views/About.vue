<script setup>
const contactItems = [
  {
    label: 'Mobile',
    value: '09300560720',
    href: 'tel:09300560720'
  },
  {
    label: 'Email',
    value: 'marcaldrin_0717@gmail.com',
    href: 'mailto:marcaldrin_0717@gmail.com'
  }
]

const limitations = [
  'Works offline and stores operational data locally on the device.',
  'Tracks inventory movement, customer activity, and internal sales records for daily reference.',
  'Does not issue BIR-compliant receipts, invoices, or fiscal documents.',
  'Does not replace registered POS terminals, accounting software, or formal bookkeeping workflows.',
  'Should be treated as an internal monitoring tool, not as an official system of record for taxes or statutory reporting.'
]

const responsibilities = [
  'Maintain separate official books, receipts, and tax filings where required by law.',
  'Verify all totals, taxes, discounts, and compliance requirements before using records outside the business.',
  'Keep backups of important operational data and validate records independently when needed.',
  'Consult a licensed accountant, bookkeeper, or legal adviser for regulatory obligations.'
]
</script>

<template>
  <div class="about-page">
    <section class="hero-card">
      <span class="eyebrow">About This Application</span>
      <h1>Offline Inventory And Sales Tracker</h1>
      <p class="hero-copy">
        This application is built to help small businesses monitor stock, review internal sales activity,
        and keep a simple operational history even without a live internet connection.
      </p>
    </section>

    <section class="content-grid">
      <article class="content-card disclaimer-card">
        <h2>Disclaimer</h2>
        <p>
          This application is designed as an <strong>offline inventory and sales tracking tool</strong>
          intended to assist small businesses in monitoring their daily operations.
        </p>
        <p>
          This software <strong>does not generate official receipts</strong>, invoices, or tax documents and is
          <strong>not intended to replace any government-registered Point of Sale (POS), accounting system, or bookkeeping records</strong>.
        </p>
        <p>
          Users are solely responsible for complying with all applicable laws, regulations, and tax requirements in their respective jurisdictions,
          including but not limited to those set by the Bureau of Internal Revenue or any equivalent authority.
        </p>
        <p>
          All data recorded within the application is for <strong>internal and informational purposes only</strong>.
          The developer of this application <strong>does not guarantee compliance</strong> with any regulatory, tax, or legal standards
          and shall not be held liable for any misuse or misinterpretation of the data.
        </p>
        <p>
          By using this application, the user acknowledges and agrees to these terms.
        </p>
      </article>

      <article class="content-card">
        <h2>Why This Is Not A POS</h2>
        <ul>
          <li v-for="item in limitations" :key="item">{{ item }}</li>
        </ul>
        <p class="muted-copy">
          In practical terms, this app is best used as an operations companion for stock monitoring and reference only.
          If your business needs official POS compliance, tax reporting, or receipt issuance, those functions should be handled by a properly registered and compliant system.
        </p>
      </article>

      <article class="content-card">
        <h2>User Responsibilities</h2>
        <ul>
          <li v-for="item in responsibilities" :key="item">{{ item }}</li>
        </ul>
      </article>

      <article class="content-card contact-card">
        <h2>Contact Details</h2>
        <p>
          For questions, clarifications, or support regarding this application, you may contact:
        </p>
        <div class="contact-list">
          <a
            v-for="item in contactItems"
            :key="item.label"
            :href="item.href"
            class="contact-item"
          >
            <span class="contact-label">{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </a>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.about-page {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px 20px 36px;
  box-sizing: border-box;
}

.hero-card,
.content-card {
  border-radius: 18px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(180deg, #ffffff 0%, #f7fbfd 100%);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
}

.hero-card {
  padding: 28px 30px;
  margin-bottom: 18px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(26, 188, 156, 0.12);
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hero-card h1 {
  margin: 16px 0 10px;
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.08;
  color: #0f172a;
}

.hero-copy {
  margin: 0;
  font-size: 16px;
  line-height: 1.7;
  color: #475569;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.content-card {
  padding: 22px 24px;
}

.disclaimer-card {
  grid-column: 1 / -1;
}

.content-card h2 {
  margin: 0 0 14px;
  font-size: 20px;
  color: #0f172a;
}

.content-card p {
  margin: 0 0 14px;
  color: #334155;
  line-height: 1.75;
}

.content-card p:last-child {
  margin-bottom: 0;
}

.content-card ul {
  margin: 0;
  padding-left: 20px;
  color: #334155;
}

.content-card li {
  margin-bottom: 10px;
  line-height: 1.65;
}

.content-card li:last-child {
  margin-bottom: 0;
}

.muted-copy {
  margin-top: 16px;
  color: #64748b;
}

.contact-list {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.contact-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid #d9e5eb;
  background: rgba(248, 250, 252, 0.88);
  color: inherit;
  text-decoration: none;
}

.contact-item strong {
  color: #0f172a;
  font-size: 16px;
}

.contact-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #0f766e;
}

body.dark-mode .hero-card,
body.dark-mode .content-card {
  border-color: #445463;
  background: linear-gradient(180deg, #32404b 0%, #2a343d 100%);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
}

body.dark-mode .hero-card h1,
body.dark-mode .content-card h2,
body.dark-mode .contact-item strong {
  color: #f8fafc;
}

body.dark-mode .hero-copy,
body.dark-mode .content-card p,
body.dark-mode .content-card ul,
body.dark-mode .muted-copy {
  color: #d3dde7;
}

body.dark-mode .eyebrow,
body.dark-mode .contact-label {
  color: #8bf1da;
  background: rgba(26, 188, 156, 0.16);
}

body.dark-mode .contact-item {
  border-color: #4a5c6a;
  background: rgba(58, 72, 84, 0.8);
}

@media (max-width: 768px) {
  .about-page {
    padding: 18px 16px 28px;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }

  .hero-card,
  .content-card {
    padding: 20px 18px;
  }
}
</style>
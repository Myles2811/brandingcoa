import { fetchPublicContractsScotlandAwards } from '../src/lib/publicContractsScotlandAdapter';

const [yearArg, monthArg] = process.argv.slice(2);
const now = new Date();
const year = Number(yearArg) || now.getUTCFullYear();
const month = Number(monthArg) || Math.max(1, now.getUTCMonth()); // previous complete month by default
const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
const range = {
  start: `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`,
  end: `${year}-${String(month).padStart(2, '0')}-${lastDay}T23:59:59Z`,
};

async function run() {
  const notices = await fetchPublicContractsScotlandAwards(range);
  const publicationDates = notices.map(notice => notice.publication_date).filter(Boolean).sort();

  console.log(JSON.stringify({
    live: true,
    count: notices.length,
    publication_date_range: {
      from: publicationDates[0] ?? null,
      to: publicationDates.at(-1) ?? null,
    },
    sample: notices.slice(0, 5).map(notice => ({
      organisation_name: notice.buyer_name,
      supplier_name: notice.supplier_name,
      contract_value: notice.award_value,
      currency: notice.currency,
      award_date: notice.award_date,
      publication_date: notice.publication_date,
      contract_title: notice.contract_description,
      framework_references: notice.framework_hints,
      notice_url: notice.notice_url,
      reference_id: notice.notice_id,
    })),
  }, null, 2));
}

run().catch(error => { console.error(error); process.exit(1); });

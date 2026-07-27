import { buildDateRange } from '../src/lib/dateRangeBuilder';
import { fetchFindTenderNoticesDetailed } from '../src/lib/findTenderAdapter';
import { fetchContractsFinderNoticesDetailed } from '../src/lib/contractsFinderAdapter';
import { fetchPublicContractsScotlandAwardsDetailed } from '../src/lib/publicContractsScotlandAdapter';
import { fetchSell2WalesAwardsDetailed } from '../src/lib/sell2WalesAdapter';
import { fetchETendersNIAwardsDetailed } from '../src/lib/eTendersNIAdapter';

async function run() {
  const year = Number(process.argv[2]) || 2026;
  const month = Number(process.argv[3]) || 3;
  const includeNI = process.argv.includes('--ni');
  const range = buildDateRange(year, month);
  const results = await Promise.all([
    fetchFindTenderNoticesDetailed(range), fetchContractsFinderNoticesDetailed(range),
    fetchPublicContractsScotlandAwardsDetailed(range), fetchSell2WalesAwardsDetailed(range),
    ...(includeNI ? [fetchETendersNIAwardsDetailed(range)] : []),
  ]);
  console.log(JSON.stringify(results.map(result => result.status), null, 2));
  if (results.some(result => !result.status.complete)) process.exitCode = 2;
}

run().catch(error => { console.error(error); process.exit(1); });
